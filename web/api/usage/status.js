const { verifyAuthToken } = require('../../lib/clerk');
const { getOrCreateUserProfile } = require('../../lib/atomic-usage');
const { getGlobalQuotaStatus } = require('../../lib/quota-manager');
const config = require('../../lib/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user = null;
  try {
    user = await verifyAuthToken(req);
  } catch (err) {
    // If unauthenticated, still allow viewing global circuit status if requested, or require auth
  }

  try {
    const globalStatus = await getGlobalQuotaStatus();
    let userProfile = null;
    if (user) {
      userProfile = await getOrCreateUserProfile(user.uid, user.email);
    }

    return res.status(200).json({
      success: true,
      userUsage: userProfile ? {
        userId: userProfile.userId,
        lifetimeConversationsCreated: userProfile.lifetimeConversationsCreated || 0,
        maxConversations: config.FREE_MAX_CONVERSATIONS,
        remainingConversations: Math.max(0, config.FREE_MAX_CONVERSATIONS - (userProfile.lifetimeConversationsCreated || 0)),
        limits: {
          maxQueriesPerConversation: config.FREE_MAX_QUERIES_PER_CONVERSATION,
          maxCharactersPerQuery: config.FREE_MAX_CHARACTERS_PER_QUERY,
          maxFilesPerConversation: config.FREE_MAX_FILES_PER_CONVERSATION,
          maxFileSizeMb: config.FREE_MAX_FILE_SIZE_MB
        }
      } : null,
      globalQuota: {
        circuitBreaker: globalStatus.circuitBreaker,
        dailyRequests: globalStatus.dailyRequests || 0,
        maxDailyRequests: config.GLOBAL_MAX_REQUESTS_PER_DAY,
        minuteRequests: globalStatus.minuteRequests || 0,
        maxMinuteRequests: config.GLOBAL_MAX_REQUESTS_PER_MINUTE,
        activeConcurrentRequests: globalStatus.activeConcurrentRequests || 0,
        maxConcurrentRequests: config.GLOBAL_MAX_CONCURRENT_REQUESTS,
        tokensToday: {
          input: globalStatus.dailyInputTokens || 0,
          output: globalStatus.dailyOutputTokens || 0
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

