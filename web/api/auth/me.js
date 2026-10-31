const { verifyAuthToken } = require('../../lib/clerk');
const { getOrCreateUserProfile } = require('../../lib/atomic-usage');
const config = require('../../lib/config');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await verifyAuthToken(req);
    const profile = await getOrCreateUserProfile(user.uid, user.email);

    return res.status(200).json({
      success: true,
      user: {
        userId: user.uid,
        email: user.email,
        name: user.name,
        lifetimeConversationsCreated: profile.lifetimeConversationsCreated || 0,
        maxConversations: config.FREE_MAX_CONVERSATIONS,
        remainingConversations: Math.max(0, config.FREE_MAX_CONVERSATIONS - (profile.lifetimeConversationsCreated || 0))
      }
    });
  } catch (err) {
    const statusCode = err.message.startsWith('UNAUTHORIZED') ? 401 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
};

