const { verifyAuthToken } = require('../lib/clerk');
const { getDb } = require('../lib/mongodb');
const { reserveQueryAllowance, finalizeQueryReservation } = require('../lib/atomic-usage');
const { reserveGlobalQuota, reconcileGlobalQuota } = require('../lib/quota-manager');
const { generateLegalAdvice } = require('../lib/gemini');
const config = require('../lib/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyAuthToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const { conversationId, queryText, idempotencyKey, documentIds, attachedDocIds } = req.body || {};

  if (!conversationId) {
    return res.status(400).json({ error: 'Missing conversationId' });
  }
  if (!queryText || !queryText.trim()) {
    return res.status(400).json({ error: 'Missing queryText' });
  }

  // 1. User Free-Tier Query Reservation (Atomic check & increment)
  let userReservation;
  try {
    userReservation = await reserveQueryAllowance(user.uid, conversationId, idempotencyKey, queryText);
    if (userReservation.idempotent && userReservation.cachedResponse) {
      // Idempotent duplicate: return cached response without burning another query
      return res.status(200).json({
        ...userReservation.cachedResponse,
        idempotent: true
      });
    }
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'RESERVATION_ERROR',
      details: err.details || null
    });
  }

  // 2. Global Gemini Quota Reservation & Circuit Breaker Check
  let globalReservation = null;
  try {
    globalReservation = await reserveGlobalQuota();
  } catch (quotaErr) {
    // Refund the user query counter because the AI call was blocked globally
    await finalizeQueryReservation(user.uid, conversationId, idempotencyKey, false, null, quotaErr.message);
    const status = quotaErr.statusCode || 503;
    return res.status(status).json({
      error: quotaErr.message,
      code: quotaErr.code || 'GLOBAL_QUOTA_ERROR'
    });
  }

  const db = await getDb();
  const now = new Date();

  // 3. Context assembly: Load all conversation documents and recent history for seamless follow-ups
  let referencedDocs = [];
  try {
    // Always include all documents from this conversation so follow-up queries have complete context
    referencedDocs = await db.collection('documents')
      .find({ conversationId, userId: user.uid })
      .toArray();
  } catch (e) {
    console.warn('[Chat] Failed to load documents for context:', e.message);
  }

  let recentMessages = [];
  try {
    recentMessages = await db.collection('messages')
      .find({ conversationId, userId: user.uid })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    recentMessages.reverse();
  } catch (e) {
    console.warn('[Chat] Failed to load recent history:', e.message);
  }

  // 4. Generate AI Legal Advice via Gemini
  let aiResult;
  try {
    aiResult = await generateLegalAdvice(queryText, recentMessages, referencedDocs);
  } catch (aiErr) {
    console.error('[Chat] Gemini AI error:', aiErr.message);
    // Reconcile global quota with failure (trip breaker if 429)
    await reconcileGlobalQuota(globalReservation, { input: 0, output: 0 }, aiErr);
    // Refund user query
    await finalizeQueryReservation(user.uid, conversationId, idempotencyKey, false, null, aiErr.message);

    return res.status(502).json({
      error: `AI processing encountered an error: ${aiErr.message}`,
      code: 'AI_PROVIDER_ERROR'
    });
  }

  // 5. Reconcile global quota with success and token usage
  try {
    await reconcileGlobalQuota(globalReservation, aiResult.tokens, null);
  } catch (recErr) {
    console.warn('[Chat] Reconcile error:', recErr.message);
  }

  // 6. Persist Messages and finalize reservation
  try {
    const userMsgId = 'msg_' + Date.now() + '_u';
    const modelMsgId = 'msg_' + (Date.now() + 1) + '_m';

    // Resolve attachments specifically uploaded or attached to this user query
    let msgAttachments = [];
    const targetDocIds = attachedDocIds || (Array.isArray(documentIds) && documentIds.length > 0 ? documentIds : []);
    if (targetDocIds.length > 0) {
      try {
        const foundDocs = await db.collection('documents').find({
          id: { $in: targetDocIds },
          conversationId,
          userId: user.uid
        }).toArray();
        msgAttachments = foundDocs.map(d => ({
          id: d.id,
          conversationId: d.conversationId || conversationId,
          fileName: d.fileName || 'Document',
          fileType: d.fileType || 'application/octet-stream',
          fileSize: d.fileSize || 0,
          cloudinaryUrl: d.cloudinaryUrl || '',
          createdAt: d.createdAt ? (typeof d.createdAt.toISOString === 'function' ? d.createdAt.toISOString() : String(d.createdAt)) : new Date().toISOString()
        }));
      } catch (e) {
        console.warn('[Chat] Failed to resolve message attachments:', e.message);
      }
    }

    const userMsg = {
      id: userMsgId,
      conversationId,
      userId: user.uid,
      role: 'user',
      content: queryText,
      attachments: msgAttachments,
      idempotencyKey: idempotencyKey || null,
      createdAt: now
    };

    const modelMsg = {
      id: modelMsgId,
      conversationId,
      userId: user.uid,
      role: 'model',
      content: aiResult.reply,
      createdAt: new Date()
    };

    await db.collection('messages').insertMany([userMsg, modelMsg]);

    await db.collection('conversations').updateOne(
      { id: conversationId, userId: user.uid },
      { $set: { updatedAt: new Date() } }
    );

    const responsePayload = {
      success: true,
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        attachments: userMsg.attachments,
        createdAt: userMsg.createdAt
      },
      modelMessage: {
        id: modelMsg.id,
        role: modelMsg.role,
        content: modelMsg.content,
        createdAt: modelMsg.createdAt
      },
      usage: {
        queryCount: userReservation.newQueryCount,
        maxQueries: config.FREE_MAX_QUERIES_PER_CONVERSATION,
        remainingQueries: userReservation.remainingQueries,
        tokens: aiResult.tokens
      }
    };

    // Finalize reservation with cached response
    await finalizeQueryReservation(user.uid, conversationId, idempotencyKey, true, responsePayload);

    return res.status(200).json(responsePayload);
  } catch (persistErr) {
    console.error('[Chat] Persistence error:', persistErr.message);
    await finalizeQueryReservation(user.uid, conversationId, idempotencyKey, false, null, persistErr.message);
    return res.status(500).json({ error: 'Failed to persist conversation message.' });
  }
};

