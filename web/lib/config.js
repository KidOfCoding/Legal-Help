const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  // MongoDB
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/legalhelp',
  DB_NAME: process.env.DB_NAME || 'legalhelp',

  // Clerk Authentication
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY || '',
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || '',
  CLERK_JWT_KEY: process.env.CLERK_JWT_KEY || '',

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // Gemini
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

  // Free Tier Limits (Configurable)
  FREE_MAX_CONVERSATIONS: parseInt(process.env.FREE_MAX_CONVERSATIONS || '3', 10),
  FREE_MAX_QUERIES_PER_CONVERSATION: parseInt(process.env.FREE_MAX_QUERIES_PER_CONVERSATION || '20', 10),
  FREE_MAX_CHARACTERS_PER_QUERY: parseInt(process.env.FREE_MAX_CHARACTERS_PER_QUERY || '3000', 10),
  FREE_MAX_FILES_PER_CONVERSATION: parseInt(process.env.FREE_MAX_FILES_PER_CONVERSATION || '3', 10),
  FREE_MAX_FILE_SIZE_MB: parseInt(process.env.FREE_MAX_FILE_SIZE_MB || '10', 10),

  // Global Gemini Quota Protection
  GLOBAL_MAX_REQUESTS_PER_DAY: parseInt(process.env.GLOBAL_MAX_REQUESTS_PER_DAY || '1000', 10),
  GLOBAL_MAX_REQUESTS_PER_MINUTE: parseInt(process.env.GLOBAL_MAX_REQUESTS_PER_MINUTE || '15', 10),
  GLOBAL_MAX_OUTPUT_TOKENS: parseInt(process.env.GLOBAL_MAX_OUTPUT_TOKENS || '1000', 10),
  GLOBAL_MAX_CONCURRENT_REQUESTS: parseInt(process.env.GLOBAL_MAX_CONCURRENT_REQUESTS || '3', 10),
  CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || '300000', 10), // 5 min
  RESERVATION_EXPIRY_MS: 60000 // 60s for query processing timeout recovery
};
