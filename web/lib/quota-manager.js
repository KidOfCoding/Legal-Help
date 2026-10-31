const { getDb } = require('./mongodb');
const config = require('./config');

const GLOBAL_QUOTA_KEY = 'global_gemini_quota';

function getUtcDateString(d = new Date()) {
  return d.toISOString().split('T')[0];
}

function getUtcMinuteString(d = new Date()) {
  return d.toISOString().slice(0, 16);
}

async function getGlobalQuotaStatus() {
  const db = await getDb();
  let quota = await db.collection('global_quota').findOne({ key: GLOBAL_QUOTA_KEY });
  const now = new Date();
  const currentDate = getUtcDateString(now);
  const currentMinute = getUtcMinuteString(now);

  if (!quota) {
    quota = {
      key: GLOBAL_QUOTA_KEY,
      date: currentDate,
      minute: currentMinute,
      dailyRequests: 0,
      minuteRequests: 0,
      dailyInputTokens: 0,
      dailyOutputTokens: 0,
      activeConcurrentRequests: 0,
      circuitBreaker: {
        state: 'CLOSED', // CLOSED | OPEN | HALF_OPEN
        tripReason: '',
        tripTimestamp: null,
        halfOpenProbeInFlight: false
      },
      updatedAt: now
    };
    await db.collection('global_quota').updateOne(
      { key: GLOBAL_QUOTA_KEY },
      { $setOnInsert: quota },
      { upsert: true }
    );
    return quota;
  }

  // Check if circuit breaker can transition from OPEN to HALF_OPEN after cooldown
  if (quota.circuitBreaker && quota.circuitBreaker.state === 'OPEN') {
    const elapsed = now.getTime() - new Date(quota.circuitBreaker.tripTimestamp).getTime();
    if (elapsed >= config.CIRCUIT_BREAKER_COOLDOWN_MS) {
      await db.collection('global_quota').updateOne(
        { key: GLOBAL_QUOTA_KEY, 'circuitBreaker.state': 'OPEN' },
        {
          $set: {
            'circuitBreaker.state': 'HALF_OPEN',
            'circuitBreaker.tripReason': 'Cooldown elapsed. Testing probe request.',
            'circuitBreaker.halfOpenProbeInFlight': false,
            updatedAt: now
          }
        }
      );
      quota.circuitBreaker.state = 'HALF_OPEN';
    }
  }

  return quota;
}

/**
 * Atomically reserves global capacity for a Gemini API request.
 * Throws an error if limits are reached or circuit breaker is open.
 */
async function reserveGlobalQuota() {
  const db = await getDb();
  const now = new Date();
  const currentDate = getUtcDateString(now);
  const currentMinute = getUtcMinuteString(now);

  // Ensure record exists and check date/minute roll
  const status = await getGlobalQuotaStatus();

  // Reset daily/minute counters atomically if window rolled over
  const resetFields = {};
  if (status.date !== currentDate) {
    resetFields.date = currentDate;
    resetFields.dailyRequests = 0;
    resetFields.dailyInputTokens = 0;
    resetFields.dailyOutputTokens = 0;
  }
  if (status.minute !== currentMinute) {
    resetFields.minute = currentMinute;
    resetFields.minuteRequests = 0;
  }
  if (Object.keys(resetFields).length > 0) {
    resetFields.updatedAt = now;
    await db.collection('global_quota').updateOne(
      { key: GLOBAL_QUOTA_KEY },
      { $set: resetFields }
    );
  }

  // Check circuit breaker state
  if (status.circuitBreaker.state === 'OPEN') {
    const elapsed = now.getTime() - new Date(status.circuitBreaker.tripTimestamp).getTime();
    const remainingCooldownSec = Math.ceil((config.CIRCUIT_BREAKER_COOLDOWN_MS - elapsed) / 1000);
    const err = new Error(
      `AI requests temporarily paused (Circuit Breaker OPEN: ${status.circuitBreaker.tripReason}). ` +
      `Retry in ${Math.max(0, remainingCooldownSec)}s. Previous conversations and documents remain accessible.`
    );
    err.statusCode = 503;
    err.code = 'CIRCUIT_BREAKER_OPEN';
    throw err;
  }

  // If in HALF_OPEN, claim the single test probe atomically
  if (status.circuitBreaker.state === 'HALF_OPEN') {
    const probeClaim = await db.collection('global_quota').findOneAndUpdate(
      {
        key: GLOBAL_QUOTA_KEY,
        'circuitBreaker.state': 'HALF_OPEN',
        'circuitBreaker.halfOpenProbeInFlight': false
      },
      {
        $set: { 'circuitBreaker.halfOpenProbeInFlight': true, updatedAt: now },
        $inc: { activeConcurrentRequests: 1 }
      },
      { returnDocument: 'after' }
    );

    if (!probeClaim) {
      const err = new Error('Circuit Breaker is HALF_OPEN and a probe request is already in progress. Please wait.');
      err.statusCode = 429;
      err.code = 'CIRCUIT_BREAKER_PROBE_IN_FLIGHT';
      throw err;
    }

    return { isProbe: true, reservationTime: now };
  }

  // Atomically reserve slot: check daily requests, minute requests, and concurrent requests
  const result = await db.collection('global_quota').findOneAndUpdate(
    {
      key: GLOBAL_QUOTA_KEY,
      'circuitBreaker.state': 'CLOSED',
      dailyRequests: { $lt: config.GLOBAL_MAX_REQUESTS_PER_DAY },
      minuteRequests: { $lt: config.GLOBAL_MAX_REQUESTS_PER_MINUTE },
      activeConcurrentRequests: { $lt: config.GLOBAL_MAX_CONCURRENT_REQUESTS }
    },
    {
      $inc: {
        dailyRequests: 1,
        minuteRequests: 1,
        activeConcurrentRequests: 1
      },
      $set: { updatedAt: now }
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    // Determine the exact boundary violated for a clear, actionable error
    const latest = await db.collection('global_quota').findOne({ key: GLOBAL_QUOTA_KEY });
    if (latest.activeConcurrentRequests >= config.GLOBAL_MAX_CONCURRENT_REQUESTS) {
      const err = new Error('Global concurrent Gemini request limit reached. Please retry in a few seconds.');
      err.statusCode = 429;
      err.code = 'GLOBAL_CONCURRENCY_LIMIT';
      throw err;
    }
    if (latest.minuteRequests >= config.GLOBAL_MAX_REQUESTS_PER_MINUTE) {
      const err = new Error('Global Gemini request rate limit per minute reached. Please retry shortly.');
      err.statusCode = 429;
      err.code = 'GLOBAL_MINUTE_LIMIT';
      throw err;
    }
    if (latest.dailyRequests >= config.GLOBAL_MAX_REQUESTS_PER_DAY) {
      // Trip circuit breaker on daily quota exhaustion
      await tripCircuitBreaker('Global daily Gemini request limit reached');
      const err = new Error('Global daily Gemini request quota reached. AI processing paused until tomorrow (UTC).');
      err.statusCode = 429;
      err.code = 'GLOBAL_DAILY_LIMIT';
      throw err;
    }

    const err = new Error('Global Gemini quota exceeded.');
    err.statusCode = 429;
    err.code = 'GLOBAL_QUOTA_EXCEEDED';
    throw err;
  }

  return { isProbe: false, reservationTime: now };
}

/**
 * Reconciles global usage after Gemini call completes.
 * Decrements concurrency and updates token usage or trips circuit breaker on provider error.
 */
async function reconcileGlobalQuota(reservation, actualTokens = { input: 0, output: 0 }, error = null) {
  const db = await getDb();
  const now = new Date();

  const updateOps = {
    $inc: {
      activeConcurrentRequests: -1,
      dailyInputTokens: actualTokens.input || 0,
      dailyOutputTokens: actualTokens.output || 0
    },
    $set: { updatedAt: now }
  };

  if (reservation && reservation.isProbe) {
    updateOps.$set['circuitBreaker.halfOpenProbeInFlight'] = false;
  }

  if (error) {
    // Check if error is rate limit or quota exceeded from Gemini
    const errMsg = String(error.message || '').toLowerCase();
    const isQuotaError =
      errMsg.includes('429') ||
      errMsg.includes('resource_exhausted') ||
      errMsg.includes('quota') ||
      errMsg.includes('rate limit');

    if (isQuotaError || (reservation && reservation.isProbe)) {
      updateOps.$set['circuitBreaker.state'] = 'OPEN';
      updateOps.$set['circuitBreaker.tripReason'] = `Provider Quota Error: ${error.message}`;
      updateOps.$set['circuitBreaker.tripTimestamp'] = now;
    }
  } else if (reservation && reservation.isProbe) {
    // Probe succeeded! Reset circuit breaker to CLOSED
    updateOps.$set['circuitBreaker.state'] = 'CLOSED';
    updateOps.$set['circuitBreaker.tripReason'] = '';
    updateOps.$set['circuitBreaker.tripTimestamp'] = null;
  }

  // Concurrency guard: ensure activeConcurrentRequests does not drop below 0
  await db.collection('global_quota').updateOne(
    { key: GLOBAL_QUOTA_KEY },
    updateOps
  );

  await db.collection('global_quota').updateOne(
    { key: GLOBAL_QUOTA_KEY, activeConcurrentRequests: { $lt: 0 } },
    { $set: { activeConcurrentRequests: 0 } }
  );
}

/**
 * Manually or automatically trip the circuit breaker.
 */
async function tripCircuitBreaker(reason) {
  const db = await getDb();
  const now = new Date();
  await db.collection('global_quota').updateOne(
    { key: GLOBAL_QUOTA_KEY },
    {
      $set: {
        'circuitBreaker.state': 'OPEN',
        'circuitBreaker.tripReason': reason,
        'circuitBreaker.tripTimestamp': now,
        'circuitBreaker.halfOpenProbeInFlight': false,
        updatedAt: now
      }
    },
    { upsert: true }
  );
}

/**
 * Reset circuit breaker (e.g. for admin/testing).
 */
async function resetCircuitBreaker() {
  const db = await getDb();
  const now = new Date();
  await db.collection('global_quota').updateOne(
    { key: GLOBAL_QUOTA_KEY },
    {
      $set: {
        'circuitBreaker.state': 'CLOSED',
        'circuitBreaker.tripReason': '',
        'circuitBreaker.tripTimestamp': null,
        'circuitBreaker.halfOpenProbeInFlight': false,
        activeConcurrentRequests: 0,
        updatedAt: now
      }
    },
    { upsert: true }
  );
}

module.exports = {
  getGlobalQuotaStatus,
  reserveGlobalQuota,
  reconcileGlobalQuota,
  tripCircuitBreaker,
  resetCircuitBreaker
};

