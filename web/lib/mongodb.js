const { MongoClient } = require('mongodb');
const config = require('./config');
const { memoryDbInstance } = require('./memory-db');

const uri = config.MONGODB_URI;
let client;
let clientPromise = null;
let useMemoryFallback = false;

// If MONGODB_URI is provided and not default unreachable localhost, try real connection
if (uri && uri.startsWith('mongodb')) {
  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    clientPromise = client.connect().catch(err => {
      console.warn('[MongoDB] Live connection failed (' + err.message + '). Using embedded concurrency-safe database.');
      useMemoryFallback = true;
      return null;
    });
  } catch (err) {
    console.warn('[MongoDB] Init error, using embedded fallback:', err.message);
    useMemoryFallback = true;
  }
} else {
  useMemoryFallback = true;
}

async function getDb() {
  if (useMemoryFallback) {
    return memoryDbInstance;
  }

  if (clientPromise) {
    try {
      const c = await clientPromise;
      if (c) {
        return c.db(config.DB_NAME);
      }
    } catch (e) {
      useMemoryFallback = true;
      return memoryDbInstance;
    }
  }

  return memoryDbInstance;
}

let indexesInitialized = false;

async function initIndexes() {
  if (indexesInitialized) return;
  try {
    const db = await getDb();
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ id: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ userId: 1, isDeleted: 1 });
    await db.collection('messages').createIndex({ id: 1 }, { unique: true });
    await db.collection('messages').createIndex({ conversationId: 1, createdAt: 1 });
    await db.collection('documents').createIndex({ id: 1 }, { unique: true });
    await db.collection('query_reservations').createIndex({ idempotencyKey: 1 }, { unique: true });
    await db.collection('global_quota').createIndex({ key: 1 }, { unique: true });
    indexesInitialized = true;
  } catch (err) {
    console.warn('Index init warning:', err.message);
  }
}

module.exports = {
  clientPromise,
  getDb,
  initIndexes,
  memoryDbInstance
};
