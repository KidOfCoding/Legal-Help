// Re-export from clerk.js for backwards compatibility during migration
const clerk = require('./clerk');

module.exports = {
  admin: null,
  verifyAuthToken: clerk.verifyAuthToken,
  clerkClient: clerk.clerkClient
};
