const { verifyAuthToken } = require('../../lib/clerk');
const { getDb } = require('../../lib/mongodb');
const { atomicCreateConversationReservation } = require('../../lib/atomic-usage');
const config = require('../../lib/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try {
    user = await verifyAuthToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const db = await getDb();

  // GET: List conversations
  if (req.method === 'GET') {
    try {
      const conversations = await db.collection('conversations')
        .find({ userId: user.uid, isDeleted: false })
        .sort({ updatedAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        conversations: conversations.map(c => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          queryCount: c.queryCount || 0,
          maxQueries: config.FREE_MAX_QUERIES_PER_CONVERSATION,
          lifetimeFilesUploaded: c.lifetimeFilesUploaded || 0,
          maxFiles: config.FREE_MAX_FILES_PER_CONVERSATION
        }))
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST: Create conversation
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const title = (body.title || 'New Legal Consultation').trim();

      // Atomic reservation on user's lifetime conversation allowance
      await atomicCreateConversationReservation(user.uid, user.email);

      const conversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const newConv = {
        id: conversationId,
        userId: user.uid,
        title: title.slice(0, 100),
        queryCount: 0,
        lifetimeFilesUploaded: 0,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('conversations').insertOne(newConv);

      return res.status(201).json({
        success: true,
        conversation: {
          id: newConv.id,
          title: newConv.title,
          createdAt: newConv.createdAt,
          updatedAt: newConv.updatedAt,
          queryCount: 0,
          maxQueries: config.FREE_MAX_QUERIES_PER_CONVERSATION,
          lifetimeFilesUploaded: 0,
          maxFiles: config.FREE_MAX_FILES_PER_CONVERSATION
        }
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return res.status(status).json({
        error: err.message,
        code: err.code || 'SERVER_ERROR',
        details: err.details || null
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

