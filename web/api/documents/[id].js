const { verifyAuthToken } = require('../../lib/clerk');
const { getDb } = require('../../lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyAuthToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const id = req.query.id || req.url.split('?')[0].split('/').filter(Boolean).pop();
  if (!id) {
    return res.status(400).json({ error: 'Missing document id' });
  }

  try {
    const db = await getDb();
    const doc = await db.collection('documents').findOne({ id, userId: user.uid });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (req.query.raw === 'true' || req.url.includes('/raw')) {
      if (doc.fileData) {
        const fileBuf = Buffer.from(doc.fileData, 'base64');
        res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
        res.setHeader('Content-Length', fileBuf.length);
        return res.end(fileBuf);
      } else if (doc.cloudinaryUrl) {
        res.writeHead(302, { Location: doc.cloudinaryUrl });
        return res.end();
      }
    }

    return res.status(200).json({
      success: true,
      document: {
        id: doc.id,
        conversationId: doc.conversationId,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        cloudinaryUrl: doc.cloudinaryUrl,
        rawUrl: `/api/documents/${doc.id}?raw=true`,
        extractedText: doc.extractedText,
        summary: doc.summary,
        createdAt: doc.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

