const { verifyAuthToken } = require('../../lib/clerk');
const { getDb } = require('../../lib/mongodb');
const config = require('../../lib/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try {
    user = await verifyAuthToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // Extract ID from URL path or query
  const id = req.query.id || req.url.split('?')[0].split('/').filter(Boolean).pop();
  if (!id) {
    return res.status(400).json({ error: 'Missing conversation id' });
  }

  const db = await getDb();

  // GET: Fetch conversation details, messages, and documents
  if (req.method === 'GET') {
    try {
      const conv = await db.collection('conversations').findOne({
        id,
        userId: user.uid,
        isDeleted: false
      });

      if (!conv) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Fetch messages for conversation
      const messages = await db.collection('messages')
        .find({ conversationId: id, userId: user.uid })
        .sort({ createdAt: 1 })
        .toArray();

      // Fetch documents attached to this conversation
      const documents = await db.collection('documents')
        .find({ conversationId: id, userId: user.uid })
        .sort({ createdAt: 1 })
        .toArray();

      return res.status(200).json({
        success: true,
        conversation: {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          queryCount: conv.queryCount || 0,
          maxQueries: config.FREE_MAX_QUERIES_PER_CONVERSATION,
          remainingQueries: Math.max(0, config.FREE_MAX_QUERIES_PER_CONVERSATION - (conv.queryCount || 0)),
          lifetimeFilesUploaded: conv.lifetimeFilesUploaded || 0,
          maxFiles: config.FREE_MAX_FILES_PER_CONVERSATION,
          remainingFiles: Math.max(0, config.FREE_MAX_FILES_PER_CONVERSATION - (conv.lifetimeFilesUploaded || 0))
        },
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          attachments: (m.attachments || []).map(att => ({
            id: att.id || '',
            conversationId: att.conversationId || id,
            fileName: att.fileName || 'Document',
            fileType: att.fileType || 'application/octet-stream',
            fileSize: att.fileSize || 0,
            cloudinaryUrl: att.cloudinaryUrl || '',
            createdAt: att.createdAt || ''
          }))
        })),
        documents: documents.map(d => ({
          id: d.id,
          fileName: d.fileName,
          fileType: d.fileType,
          fileSize: d.fileSize,
          cloudinaryUrl: d.cloudinaryUrl,
          summary: d.summary,
          createdAt: d.createdAt ? (typeof d.createdAt.toISOString === 'function' ? d.createdAt.toISOString() : String(d.createdAt)) : ''
        }))
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT: Rename conversation
  if (req.method === 'PUT') {
    try {
      const body = req.body || {};
      const title = (body.title || '').trim();
      if (!title) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }

      const updated = await db.collection('conversations').findOneAndUpdate(
        { id, userId: user.uid, isDeleted: false },
        {
          $set: {
            title: title.slice(0, 100),
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      if (!updated) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      return res.status(200).json({
        success: true,
        conversation: {
          id: updated.id,
          title: updated.title,
          updatedAt: updated.updatedAt
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE: Soft delete conversation. Does NOT restore lifetime usage!
  if (req.method === 'DELETE') {
    try {
      const deleted = await db.collection('conversations').findOneAndUpdate(
        { id, userId: user.uid, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      if (!deleted) {
        return res.status(404).json({ error: 'Conversation not found or already deleted' });
      }

      return res.status(200).json({
        success: true,
        message: 'Conversation deleted successfully. Lifetime allowances are preserved.'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

