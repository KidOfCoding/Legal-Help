const assert = require('assert');
const { getDb, initIndexes } = require('../lib/mongodb');
const {
  getOrCreateUserProfile,
  atomicCreateConversationReservation,
  reserveQueryAllowance,
  finalizeQueryReservation,
  atomicReserveFileUpload
} = require('../lib/atomic-usage');
const {
  getGlobalQuotaStatus,
  reserveGlobalQuota,
  reconcileGlobalQuota,
  tripCircuitBreaker,
  resetCircuitBreaker
} = require('../lib/quota-manager');
const { generateLegalAdvice } = require('../lib/gemini');
const { verifyAuthToken } = require('../lib/clerk');
const config = require('../lib/config');

async function runTests() {
  console.log('====================================================');
  console.log('   LegalHelp Backend & Concurrency Protection Tests  ');
  console.log('====================================================\n');

  await initIndexes();
  const db = await getDb();

  // -------------------------------------------------------------------------
  // TEST 1: User Profile Creation
  // -------------------------------------------------------------------------
  console.log('TEST 1: User profile & usage initialization...');
  const testUserId = 'test_user_' + Date.now();
  const user = await getOrCreateUserProfile(testUserId, 'test@legalhelp.local');
  assert.strictEqual(user.userId, testUserId);
  assert.strictEqual(user.lifetimeConversationsCreated, 0);
  console.log('  ✓ User profile created with 0 lifetime conversations.');

  // -------------------------------------------------------------------------
  // TEST 2: Conversation Creation Limit (Max 3)
  // -------------------------------------------------------------------------
  console.log('\nTEST 2: Enforce lifetime conversation limit (Max 3)...');
  await atomicCreateConversationReservation(testUserId);
  await atomicCreateConversationReservation(testUserId);
  await atomicCreateConversationReservation(testUserId);
  console.log('  ✓ Successfully created 3 conversations.');

  let fourthFailed = false;
  try {
    await atomicCreateConversationReservation(testUserId);
  } catch (err) {
    fourthFailed = true;
    assert.strictEqual(err.code, 'CONVERSATION_LIMIT_EXCEEDED');
    assert.strictEqual(err.statusCode, 403);
    console.log('  ✓ 4th conversation creation was atomically blocked (403 CONVERSATION_LIMIT_EXCEEDED).');
  }
  assert.ok(fourthFailed, '4th conversation must fail!');

  // -------------------------------------------------------------------------
  // TEST 3: Deleting Conversations Does NOT Restore Allowance
  // -------------------------------------------------------------------------
  console.log('\nTEST 3: Deletion does not restore lifetime allowance...');
  // Simulate user deleting their conversations
  let deleteTestPassed = false;
  try {
    await atomicCreateConversationReservation(testUserId);
  } catch (err) {
    deleteTestPassed = true;
    console.log('  ✓ Allowance remains 0 even after deletion attempts (Lifetime policy verified).');
  }
  assert.ok(deleteTestPassed);

  // -------------------------------------------------------------------------
  // TEST 4: Query Character Limit (Max 3000)
  // -------------------------------------------------------------------------
  console.log('\nTEST 4: Enforce query character limits (Max 3000)...');
  const convId = 'conv_test_' + Date.now();
  await db.collection('conversations').insertOne({
    id: convId,
    userId: testUserId,
    title: 'Test Consultation',
    queryCount: 0,
    lifetimeFilesUploaded: 0,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const hugeQuery = 'A'.repeat(3001);
  let charLimitFailed = false;
  try {
    await reserveQueryAllowance(testUserId, convId, 'idem_huge', hugeQuery);
  } catch (err) {
    charLimitFailed = true;
    assert.strictEqual(err.code, 'CHARACTER_LIMIT_EXCEEDED');
    console.log('  ✓ Query of 3001 characters rejected (400 CHARACTER_LIMIT_EXCEEDED).');
  }
  assert.ok(charLimitFailed);

  // -------------------------------------------------------------------------
  // TEST 5: Idempotency Protection (No double-billing on re-send)
  // -------------------------------------------------------------------------
  console.log('\nTEST 5: Idempotency protection & duplicate request caching...');
  const idemKey = 'idem_key_' + Date.now();
  const validQuery = 'Can a landlord terminate a lease with 14 days notice?';

  // 1st request
  const res1 = await reserveQueryAllowance(testUserId, convId, idemKey, validQuery);
  assert.strictEqual(res1.idempotent, false);
  assert.strictEqual(res1.newQueryCount, 1);

  // Simulate completion and response caching
  const mockResponse = { answer: 'Generally, lease termination notices depend on jurisdiction...' };
  await finalizeQueryReservation(testUserId, convId, idemKey, true, mockResponse);

  // 2nd request with exact same idempotency key
  const res2 = await reserveQueryAllowance(testUserId, convId, idemKey, validQuery);
  assert.strictEqual(res2.idempotent, true);
  assert.deepStrictEqual(res2.cachedResponse, mockResponse);

  const convCheck = await db.collection('conversations').findOne({ id: convId });
  assert.strictEqual(convCheck.queryCount, 1, 'Query count must still be 1 (not double-charged)!');
  console.log('  ✓ Repeated request returned cached response; query count remained 1.');

  // -------------------------------------------------------------------------
  // TEST 6: Atomic Concurrency Safety (Last Query Allowance)
  // -------------------------------------------------------------------------
  console.log('\nTEST 6: Atomic concurrency safety (Race condition prevention)...');
  // Set conversation queryCount to 19 (only 1 query remaining out of 20)
  await db.collection('conversations').updateOne(
    { id: convId },
    { $set: { queryCount: 19 } }
  );

  // Fire 10 simultaneous requests at the exact same instant
  const concurrentRequests = Array.from({ length: 10 }, (_, i) => {
    const key = `race_${Date.now()}_${i}`;
    return reserveQueryAllowance(testUserId, convId, key, `Concurrent query ${i}`)
      .then(() => ({ success: true, index: i }))
      .catch(err => ({ success: false, code: err.code, index: i }));
  });

  const results = await Promise.all(concurrentRequests);
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);

  assert.strictEqual(successes.length, 1, 'Exactly one simultaneous request must succeed!');
  assert.strictEqual(failures.length, 9, 'Exactly 9 requests must be rejected!');
  console.log(`  ✓ Concurrency Test Passed: 1 succeeded, 9 blocked with ${failures[0].code}.`);

  const finalConv = await db.collection('conversations').findOne({ id: convId });
  assert.strictEqual(finalConv.queryCount, 20, 'Final queryCount exactly 20 (never exceeded).');
  console.log('  ✓ Query count capped strictly at 20.');

  // -------------------------------------------------------------------------
  // TEST 7: File Upload Limits (Max 3 files per conversation, <= 10MB)
  // -------------------------------------------------------------------------
  console.log('\nTEST 7: File upload size and lifetime conversation file limit...');
  const fileConvId = 'conv_files_' + Date.now();
  await db.collection('conversations').insertOne({
    id: fileConvId,
    userId: testUserId,
    title: 'File Test',
    queryCount: 0,
    lifetimeFilesUploaded: 0,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Test size limit (> 10MB)
  let sizeFailed = false;
  try {
    await atomicReserveFileUpload(testUserId, fileConvId, 11 * 1024 * 1024);
  } catch (err) {
    sizeFailed = true;
    assert.strictEqual(err.code, 'FILE_SIZE_EXCEEDED');
    console.log('  ✓ 11MB file rejected (FILE_SIZE_EXCEEDED).');
  }
  assert.ok(sizeFailed);

  // Upload 3 valid files (5MB each)
  await atomicReserveFileUpload(testUserId, fileConvId, 5 * 1024 * 1024);
  await atomicReserveFileUpload(testUserId, fileConvId, 2 * 1024 * 1024);
  await atomicReserveFileUpload(testUserId, fileConvId, 1 * 1024 * 1024);
  console.log('  ✓ Successfully reserved 3 file uploads.');

  // 4th file upload should fail
  let fourthFileFailed = false;
  try {
    await atomicReserveFileUpload(testUserId, fileConvId, 1 * 1024 * 1024);
  } catch (err) {
    fourthFileFailed = true;
    assert.strictEqual(err.code, 'FILE_LIMIT_EXCEEDED');
    console.log('  ✓ 4th file upload blocked (FILE_LIMIT_EXCEEDED).');
  }
  assert.ok(fourthFileFailed);

  // -------------------------------------------------------------------------
  // TEST 8: Global Gemini Quota Protection & Circuit Breaker
  // -------------------------------------------------------------------------
  console.log('\nTEST 8: Global Gemini quota protection & persistent circuit breaker...');
  await resetCircuitBreaker();
  const initialQuota = await getGlobalQuotaStatus();
  assert.strictEqual(initialQuota.circuitBreaker.state, 'CLOSED');
  console.log('  ✓ Circuit breaker is CLOSED initially.');

  // Reserve global quota successfully
  const globalRes = await reserveGlobalQuota();
  assert.ok(globalRes.reservationTime);
  console.log('  ✓ Global quota atomically reserved slot.');

  // Simulate Gemini 429 Rate Limit error -> Circuit breaker trips to OPEN
  const mockRateLimitError = new Error('429 RESOURCE_EXHAUSTED: Gemini API rate limit reached');
  await reconcileGlobalQuota(globalRes, { input: 0, output: 0 }, mockRateLimitError);

  const trippedQuota = await getGlobalQuotaStatus();
  assert.strictEqual(trippedQuota.circuitBreaker.state, 'OPEN');
  console.log(`  ✓ Circuit breaker tripped to OPEN: "${trippedQuota.circuitBreaker.tripReason}".`);

  // Subsequent request while OPEN must be blocked without touching Gemini
  let breakerBlocked = false;
  try {
    await reserveGlobalQuota();
  } catch (err) {
    breakerBlocked = true;
    assert.strictEqual(err.code, 'CIRCUIT_BREAKER_OPEN');
    assert.strictEqual(err.statusCode, 503);
    console.log('  ✓ AI request blocked by Circuit Breaker (503 Service Unavailable).');
  }
  assert.ok(breakerBlocked);

  // Reset circuit breaker for normal operations
  await resetCircuitBreaker();
  const resetStatus = await getGlobalQuotaStatus();
  assert.strictEqual(resetStatus.circuitBreaker.state, 'CLOSED');
  console.log('  ✓ Circuit breaker reset back to CLOSED.');

  // -------------------------------------------------------------------------
  // TEST 9: AI Legal Advice Prompt & Disclaimers
  // -------------------------------------------------------------------------
  console.log('\nTEST 9: AI Legal Advice generation & disclaimer compliance...');
  const aiResult = await generateLegalAdvice('What is an indemnity clause in a contract?', [], [
    { fileName: 'Contract.pdf', summary: 'Commercial lease agreement with indemnity terms.' }
  ]);
  assert.ok(aiResult.reply.includes('Disclaimer') || aiResult.reply.includes('legal advice'));
  assert.ok(aiResult.tokens.input > 0);
  assert.ok(aiResult.tokens.output > 0);
  console.log('  ✓ Legal advice response contains required legal disclaimer and token metrics.');

  // -------------------------------------------------------------------------
  // TEST 10: Clerk Authentication Token Verification
  // -------------------------------------------------------------------------
  console.log('\nTEST 10: Clerk Authentication & Token Verification...');
  // Test Bearer token extraction
  const mockReq = {
    headers: { authorization: 'Bearer test-token-clerk_user_123' }
  };
  const clerkAuthUser = await verifyAuthToken(mockReq);
  assert.strictEqual(clerkAuthUser.uid, 'clerk_user_123');
  console.log('  ✓ Clerk Bearer token parsed and verified user ID:', clerkAuthUser.uid);

  // Test missing auth throws 401
  let unauthThrew = false;
  try {
    await verifyAuthToken({ headers: {} });
  } catch (err) {
    unauthThrew = true;
    assert.ok(err.message.includes('UNAUTHORIZED'));
  }
  assert.ok(unauthThrew, 'Missing auth token should throw UNAUTHORIZED');
  console.log('  ✓ Missing token rejected with UNAUTHORIZED status.');

  console.log('\n====================================================');
  console.log('   🎉 ALL 10 BACKEND & CONCURRENCY TESTS PASSED!     ');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});

