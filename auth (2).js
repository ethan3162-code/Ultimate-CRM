const express = require('express');
const crypto = require('crypto');
const google = require('../google');

const router = express.Router();

// In-memory CSRF state store (short-lived, single-instance app — fine for this use).
const pendingStates = new Set();

router.get('/google', (req, res) => {
  if (!google.isConfigured()) {
    return res.status(400).send('Google Calendar isn\'t configured yet — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);
  res.redirect(google.getAuthUrl(state));
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/calendar?google_error=${encodeURIComponent(error)}`);
  if (!state || !pendingStates.has(state)) return res.redirect('/calendar?google_error=invalid_state');
  pendingStates.delete(state);
  try {
    const tokens = await google.exchangeCodeForTokens(code);
    const userInfo = await google.fetchUserInfo(tokens.access_token).catch(() => null);
    google.saveTokens(tokens, userInfo && userInfo.email);
    res.redirect('/calendar?google_connected=1');
  } catch (err) {
    console.error('Google OAuth callback failed:', err.message);
    res.redirect(`/calendar?google_error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/google/status', (req, res) => {
  const configured = google.isConfigured();
  const row = google.getStoredTokens();
  res.json({
    configured,
    connected: Boolean(row),
    connectedEmail: row ? row.connected_email : null,
  });
});

router.post('/google/disconnect', (req, res) => {
  google.disconnect();
  res.status(204).end();
});

module.exports = router;
