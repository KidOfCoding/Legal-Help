const { getDb } = require('./mongodb');
const config = require('./config');

/**
 * Ensures user document exists and retrieves their usage profile.
 */
async function getOrCreateUserProfile(userId, email = '') {
  const db = await getDb();
  let user = await db.collection('users').findOne({ userId });
  if (!user) {
    user = {
      userId,
      email,
      lifetimeConversationsCreated: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    try {
      await db.collection('users').insertOne(user);
    } catch (e) {
      // Handled if concurrent insert occurred
      user = await db.collection('users').findOne({ userId });
    }
  }
  return user;
}

/**
 * Atomically checks and increments lifetime conversation allowance.
 * Fails if user has already created FREE_MAX_CONVERSATIONS.
 * Deleting conversations NEVER decreases this count.
 */
async function atomicCreateConversationReservation(userId, email = '') {
  const db = await getDb();
  await getOrCreateUserProfile(userId, email);

  const result = await db.collection('users').findOneAndUpdate(
    {
      userId,
      lifetimeConversationsCreated: { $lt: config.FREE_MAX_CONVERSATIONS }
    },
    {
      $inc: { lifetimeConversationsCreated: 1 },
      $set: { updatedAt: new Date() }
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    const user = await db.collection('users').findOne({ userId });
    const count = user ? user.lifetimeConversationsCreated : config.FREE_MAX_CONVERSATIONS;
    const err = new Error(`Conversation limit reached (${count}/${config.FREE_MAX_CONVERSATIONS}). Upgrading to Pro will allow unlimited conversations.`);
    err.statusCode = 403;
    err.code = 'CONVERSATION_LIMIT_EXCEEDED';
    err.details = { current: count, max: config.FREE_MAX_CONVERSATIONS };
    throw err;
  }

  return result.lifetimeConversationsCreated;
}

/**
 * Validates character limit and begins an atomic query reservation.
 * Supports idempotency:
 * - If same idempotencyKey is COMPLETED, returns cached response.
 * - If same idempotencyKey is PROCESSING, rejects as concurrent duplicate (409 Conflict).
 * - If previous reservation expired or failed, allows safe recovery.
 * - Atomically increments conversation queryCount only if queryCount < FREE_MAX_QUERIES_PER_CONVERSATION.
 */
async function reserveQueryAllowance(userId, conversationId, idempotencyKey, queryText) {
  const db = await getDb();
  const now = new Date();

  // 1. Character limit validation
  if (!queryText || queryText.trim().length === 0) {
    const err = new Error('Query text cannot be empty.');
    err.statusCode = 400;
    throw err;
  }
  if (queryText.length > config.FREE_MAX_CHARACTERS_PER_QUERY) {
    const err = new Error(`Query exceeds maximum character limit (${queryText.length}/${config.FREE_MAX_CHARACTERS_PER_QUERY} characters).`);
    err.statusCode = 400;
    err.code = 'CHARACTER_LIMIT_EXCEEDED';
    throw err;
  }

  // 2. Check Idempotency Key
  if (idempotencyKey) {
    const existingRes = await db.collection('query_reservations').findOne({ idempotencyKey });
    if (existingRes) {
      if (existingRes.status === 'COMPLETED') {
        // Return existing cached response without burning another query
        return {
          idempotent: true,
          cachedResponse: existingRes.response,
          status: 'COMPLETED'
        };
      }
      if (existingRes.status === 'PROCESSING') {
        const elapsed = now.getTime() - new Date(existingRes.updatedAt).getTime();
        if (elapsed < config.RESERVATION_EXPIRY_MS) {
          const err = new Error('A request with this idempotency key is already processing. Please wait.');
          err.statusCode = 409;
          err.code = 'REQUEST_IN_PROGRESS';
          throw err;
        }
        // If elapsed >= config.RESERVATION_EXPIRY_MS, it is abandoned/expired and can be recovered
      }
    }
  }

  // 3. Atomically check conversation existence and query allowance
  // Two simultaneous requests can never both pass because MongoDB findOneAndUpdate is atomic!
  const conv = await db.collection('conversations').findOneAndUpdate(
    {
      id: conversationId,
      userId,
      isDeleted: false,
      queryCount: { $lt: config.FREE_MAX_QUERIES_PER_CONVERSATION }
    },
    {
      $inc: { queryCount: 1 },
      $set: { updatedAt: now }
    },
    { returnDocument: 'after' }
  );

  if (!conv) {
    // Check if conversation doesn't exist, is deleted, or quota is exhausted
    const existingConv = await db.collection('conversations').findOne({ id: conversationId, userId });
    if (!existingConv || existingConv.isDeleted) {
      const err = new Error('Conversation not found or has been deleted.');
      err.statusCode = 404;
      throw err;
    }
    const err = new Error(`Query allowance reached for this conversation (${existingConv.queryCount}/${config.FREE_MAX_QUERIES_PER_CONVERSATION} queries).`);
    err.statusCode = 403;
    err.code = 'QUERY_LIMIT_EXCEEDED';
    err.details = { current: existingConv.queryCount, max: config.FREE_MAX_QUERIES_PER_CONVERSATION };
    throw err;
  }

  // 4. Record or update reservation state to RESERVED -> PROCESSING
  if (idempotencyKey) {
    await db.collection('query_reservations').updateOne(
      { idempotencyKey },
      {
        $set: {
          idempotencyKey,
          userId,
          conversationId,
          status: 'PROCESSING',
          queryText: queryText.slice(0, 200),
          updatedAt: now
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { upsert: true }
    );
  }

  return {
    idempotent: false,
    newQueryCount: conv.queryCount,
    remainingQueries: config.FREE_MAX_QUERIES_PER_CONVERSATION - conv.queryCount
  };
}

/**
 * Completes a query reservation.
 * If success is true: marks reservation COMPLETED and caches the response.
 * If success is false: marks reservation FAILED and refunds the conversation queryCount.
 */
async function finalizeQueryReservation(userId, conversationId, idempotencyKey, success, responseData = null, errorMessage = null) {
  const db = await getDb();
  const now = new Date();

  if (!success) {
    // Refund the query counter on failure so user is not penalized for backend/AI failure
    await db.collection('conversations').updateOne(
      { id: conversationId, userId },
      {
        $inc: { queryCount: -1 },
        $set: { updatedAt: now }
      }
    );

    if (idempotencyKey) {
      await db.collection('query_reservations').updateOne(
        { idempotencyKey },
        {
          $set: {
            status: 'FAILED',
            error: errorMessage,
            updatedAt: now
          }
        }
      );
    }
  } else {
    if (idempotencyKey) {
      await db.collection('query_reservations').updateOne(
        { idempotencyKey },
        {
          $set: {
            status: 'COMPLETED',
            response: responseData,
            updatedAt: now
          }
        }
      );
    }
  }
}

/**
 * Atomically checks and increments lifetime file upload limit for a conversation.
 * Lifetime limit: deleting a file does NOT decrease this count.
 */
async function atomicReserveFileUpload(userId, conversationId, fileSizeBytes) {
  const db = await getDb();
  const now = new Date();

  // Validate file size (10 MB max)
  const maxBytes = config.FREE_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (fileSizeBytes > maxBytes) {
    const err = new Error(`File size (${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed size of ${config.FREE_MAX_FILE_SIZE_MB} MB.`);
    err.statusCode = 400;
    err.code = 'FILE_SIZE_EXCEEDED';
    throw err;
  }

  // Atomically increment lifetimeFilesUploaded if < FREE_MAX_FILES_PER_CONVERSATION
  const conv = await db.collection('conversations').findOneAndUpdate(
    {
      id: conversationId,
      userId,
      isDeleted: false,
      lifetimeFilesUploaded: { $lt: config.FREE_MAX_FILES_PER_CONVERSATION }
    },
    {
      $inc: { lifetimeFilesUploaded: 1 },
      $set: { updatedAt: now }
    },
    { returnDocument: 'after' }
  );

  if (!conv) {
    const existing = await db.collection('conversations').findOne({ id: conversationId, userId });
    if (!existing || existing.isDeleted) {
      const err = new Error('Conversation not found or deleted.');
      err.statusCode = 404;
      throw err;
    }
    const err = new Error(`File upload limit reached for this conversation (${existing.lifetimeFilesUploaded || 0}/${config.FREE_MAX_FILES_PER_CONVERSATION} files).`);
    err.statusCode = 403;
    err.code = 'FILE_LIMIT_EXCEEDED';
    err.details = { current: existing.lifetimeFilesUploaded, max: config.FREE_MAX_FILES_PER_CONVERSATION };
    throw err;
  }

  return {
    lifetimeFilesUploaded: conv.lifetimeFilesUploaded,
    remainingFiles: config.FREE_MAX_FILES_PER_CONVERSATION - conv.lifetimeFilesUploaded
  };
}

/**
 * If upload fails before completion, refund the file upload counter.
 */
async function refundFileUpload(userId, conversationId) {
  const db = await getDb();
  await db.collection('conversations').updateOne(
    { id: conversationId, userId },
    {
      $inc: { lifetimeFilesUploaded: -1 },
      $set: { updatedAt: new Date() }
    }
  );
}

module.exports = {
  getOrCreateUserProfile,
  atomicCreateConversationReservation,
  reserveQueryAllowance,
  finalizeQueryReservation,
  atomicReserveFileUpload,
  refundFileUpload
};

