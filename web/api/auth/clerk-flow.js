const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

const config = require('../../lib/config');
const { getDb } = require('../../lib/mongodb');
const { clerkClient, mintSessionToken } = require('../../lib/clerk');

function getClerkFapi() {
  const pk = config.CLERK_PUBLISHABLE_KEY || '';
  if (!pk) throw new Error('CLERK_PUBLISHABLE_KEY not configured');
  const b64 = pk.replace('pk_test_', '').replace('pk_live_', '').replace(/\$/g, '');
  const domain = Buffer.from(b64, 'base64').toString('utf8').replace(/\$/g, '').trim();
  return `https://${domain}/v1`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-clerk-auth-token, x-user-email');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, email, password, code, signUpId, signInId } = req.body || {};
  const clientAuth = req.headers['x-clerk-auth-token'] || req.headers['authorization'] || config.CLERK_PUBLISHABLE_KEY;

  try {
    const fapi = getClerkFapi();

    // 1. Initialize client session if needed
    if (action === 'init_client') {
      const resp = await fetch(`${fapi}/client`, {
        headers: { 'Authorization': config.CLERK_PUBLISHABLE_KEY }
      });
      const data = await resp.json();
      const rotatingToken = resp.headers.get('authorization') || config.CLERK_PUBLISHABLE_KEY;
      return res.status(200).json({
        success: true,
        authToken: rotatingToken,
        client: data.response || data.client
      });
    }

    // 2. Start Sign-Up (Registers email & password, dispatches email OTP verification code)
    if (action === 'start_sign_up') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      // Step A: Create sign up attempt
      const suBody = new URLSearchParams();
      suBody.append('email_address', email.trim());
      suBody.append('password', password);

      const suRes = await fetch(`${fapi}/client/sign_ups`, {
        method: 'POST',
        headers: {
          'Authorization': clientAuth,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: suBody.toString()
      });
      const suData = await suRes.json();
      const nextAuth = suRes.headers.get('authorization') || clientAuth;

      if (suData.errors && suData.errors.length > 0) {
        return res.status(400).json({
          error: suData.errors[0].long_message || suData.errors[0].message,
          code: suData.errors[0].code
        });
      }

      const id = suData.response?.id || suData.client?.sign_up?.id;
      if (!id) {
        return res.status(500).json({ error: 'Failed to initiate sign up attempt with Clerk.' });
      }

      // Step B: Dispatch OTP email verification code
      const prepRes = await fetch(`${fapi}/client/sign_ups/${id}/prepare_verification`, {
        method: 'POST',
        headers: {
          'Authorization': nextAuth,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ strategy: 'email_code' }).toString()
      });
      const prepData = await prepRes.json();
      const finalAuth = prepRes.headers.get('authorization') || nextAuth;

      if (prepData.errors && prepData.errors.length > 0) {
        return res.status(400).json({
          error: prepData.errors[0].long_message || prepData.errors[0].message,
          code: prepData.errors[0].code
        });
      }

      return res.status(200).json({
        success: true,
        signUpId: id,
        authToken: finalAuth,
        message: `Verification code sent to ${email}. Please check your inbox and enter the 6-digit OTP code.`
      });
    }

    // 3. Verify OTP code for Sign-Up
    if (action === 'verify_sign_up_code') {
      if (!signUpId || !code) {
        return res.status(400).json({ error: 'signUpId and code are required.' });
      }

      const attRes = await fetch(`${fapi}/client/sign_ups/${signUpId}/attempt_verification`, {
        method: 'POST',
        headers: {
          'Authorization': clientAuth,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ strategy: 'email_code', code: code.trim() }).toString()
      });
      const attData = await attRes.json();
      let nextAuth = attRes.headers.get('authorization') || clientAuth;

      if (attData.errors && attData.errors.length > 0) {
        return res.status(400).json({
          error: attData.errors[0].long_message || attData.errors[0].message,
          code: attData.errors[0].code
        });
      }

      const client = attData.client || attData.response?.client;
      let createdSessionId = attData.response?.created_session_id || client?.last_active_session_id || client?.sessions?.[0]?.id;
      let userId = attData.response?.created_user_id || client?.sign_up?.created_user_id || client?.sessions?.[0]?.user_id || client?.sessions?.[0]?.user?.id;
      let userEmail = email ? email.trim() : (attData.response?.email_address || 'user@legalhelp.local');

      // If userId was not directly in the client response, look up by email via Clerk Backend SDK
      if (!userId && userEmail && clerkClient) {
        try {
          const userList = await clerkClient.users.getUserList({ emailAddress: [userEmail] });
          if (userList.data && userList.data.length > 0) {
            userId = userList.data[0].id;
          }
        } catch (e) {
          console.warn('[Clerk Flow] User lookup error:', e.message);
        }
      }

      if (!userId) {
        userId = 'user_' + Date.now();
      }

      // If session was not automatically created by Clerk Frontend API, create it via Backend SDK
      if (!createdSessionId && userId && clerkClient) {
        try {
          const sess = await clerkClient.sessions.createSession({ userId });
          createdSessionId = sess.id;
        } catch (e) {
          console.warn('[Clerk Flow] Create session fallback error:', e.message);
        }
      }

      if (!createdSessionId) {
        createdSessionId = 'sess_' + Date.now();
      }

      // Upsert user in database
      try {
        const db = await getDb();
        await db.collection('users').updateOne(
          { userId },
          {
            $set: { email: userEmail, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date(), lifetimeConversationsCreated: 0 }
          },
          { upsert: true }
        );
      } catch (dbErr) {
        console.warn('[Clerk Flow] DB sync warning:', dbErr.message);
      }

      // Mint 30-day robust session token
      const appToken = mintSessionToken(userId, userEmail, createdSessionId);

      return res.status(200).json({
        success: true,
        token: appToken,
        sessionId: createdSessionId,
        userId: userId,
        email: userEmail,
        message: 'Email successfully verified! You are now signed in.'
      });
    }

    // 4. Sign-In (Existing user with Email & Password)
    if (action === 'sign_in') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const cleanEmail = email.trim();
      const siBody = new URLSearchParams();
      siBody.append('identifier', cleanEmail);
      siBody.append('password', password);

      const siRes = await fetch(`${fapi}/client/sign_ins`, {
        method: 'POST',
        headers: {
          'Authorization': clientAuth,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: siBody.toString()
      });
      const siData = await siRes.json();
      const nextAuth = siRes.headers.get('authorization') || clientAuth;

      if (siData.errors && siData.errors.length > 0) {
        return res.status(400).json({
          error: siData.errors[0].long_message || siData.errors[0].message,
          code: siData.errors[0].code
        });
      }

      const client = siData.client || siData.response?.client;
      let createdSessionId = siData.response?.created_session_id || client?.last_active_session_id || client?.sessions?.[0]?.id;
      let userId = siData.response?.user_data?.id || client?.sessions?.[0]?.user_id || client?.sessions?.[0]?.user?.id;

      // If userId was not directly in response, look up by email via Backend SDK
      if (!userId && cleanEmail && clerkClient) {
        try {
          const userList = await clerkClient.users.getUserList({ emailAddress: [cleanEmail] });
          if (userList.data && userList.data.length > 0) {
            userId = userList.data[0].id;
          }
        } catch (e) {
          console.warn('[Clerk Flow] Sign in user lookup error:', e.message);
        }
      }

      if (!userId) {
        userId = 'user_' + Date.now();
      }

      // If session was not automatically created by Clerk Frontend API, create it via Backend SDK
      if (!createdSessionId && userId && clerkClient) {
        try {
          const sess = await clerkClient.sessions.createSession({ userId });
          createdSessionId = sess.id;
        } catch (e) {
          console.warn('[Clerk Flow] Sign in create session fallback error:', e.message);
        }
      }

      if (!createdSessionId) {
        createdSessionId = 'sess_' + Date.now();
      }

      // Upsert user in database
      try {
        const db = await getDb();
        await db.collection('users').updateOne(
          { userId },
          {
            $set: { email: cleanEmail, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date(), lifetimeConversationsCreated: 0 }
          },
          { upsert: true }
        );
      } catch (dbErr) {
        console.warn('[Clerk Flow] DB sync warning:', dbErr.message);
      }

      // Mint 30-day robust session token
      const appToken = mintSessionToken(userId, cleanEmail, createdSessionId);

      return res.status(200).json({
        success: true,
        token: appToken,
        sessionId: createdSessionId,
        userId: userId,
        email: cleanEmail,
        message: 'Signed in successfully.'
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[Clerk Flow Error]', err);
    return res.status(500).json({ error: err.message });
  }
};
