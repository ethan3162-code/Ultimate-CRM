const express = require('express');
const crypto = require('crypto');
const google = require('../google');

const router = express.Router();

// In-memory CSRF state store (short-lived, single-instance app — fine for this use). Each state
// value also remembers which calendar the flow is for: google.COMPANY (0) for the one shared
// company calendar (admin-only to connect), or a real users.id for that person's own personal
// calendar (per-user sync, Sept 2026) — see google.js's CREATE TABLE comment. Google redirects
// back to a single fixed callback URL for both, so this is what lets that one callback tell the
// two flows apart.
const pendingStates = new Map(); // state -> userId

function beginFlow(userId) {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, userId);
  return state;
}

function notConfigured(res) {
  return res.status(400).send('Google Calendar isn\'t configured yet — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

// Connects the single shared company calendar — every appointment's "our calendar" side lands
// here regardless of who it's assigned to. Kept admin-only (matches the old integrations-page
// gating) since this affects everyone, not just the person clicking connect.
router.get('/google', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send('Admin access is required to connect the shared company calendar.');
  if (!google.isConfigured()) return notConfigured(res);
  res.redirect(google.getAuthUrl(beginFlow(google.COMPANY)));
});

// Connects the CURRENT login's own personal Google Calendar — any signed-in user can do this for
// themselves, so appointments assigned to them land directly on their own calendar instead of
// only ever an emailed invite. Deliberately not gated by the Integrations permission: it's
// personal, not a company-wide setting.
router.get('/google/me', (req, res) => {
  if (!google.isConfigured()) return notConfigured(res);
  res.redirect(google.getAuthUrl(beginFlow(req.user.id)));
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/calendar?google_error=${encodeURIComponent(error)}`);
  if (!state || !pendingStates.has(state)) return res.redirect('/calendar?google_error=invalid_state');
  const userId = pendingStates.get(state);
  pendingStates.delete(state);
  const mine = userId !== google.COMPANY;
  try {
    const tokens = await google.exchangeCodeForTokens(code);
    const userInfo = await google.fetchUserInfo(tokens.access_token).catch(() => null);
    google.saveTokens(tokens, userInfo && userInfo.email, userId);
    res.redirect(`/calendar?google_connected=1${mine ? '&mine=1' : ''}`);
  } catch (err) {
    console.error('Google OAuth callback failed:', err.message);
    res.redirect(`/calendar?google_error=${encodeURIComponent(err.message)}${mine ? '&mine=1' : ''}`);
  }
});

router.get('/google/status', (req, res) => {
  const configured = google.isConfigured();
  const row = google.getStoredTokens(google.COMPANY);
  res.json({ configured, connected: Boolean(row), connectedEmail: row ? row.connected_email : null });
});

router.post('/google/disconnect', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin access required' });
  google.disconnect(google.COMPANY);
  res.status(204).end();
});

// Status/disconnect for the CURRENT login's own personal calendar connection.
router.get('/google/me/status', (req, res) => {
  const configured = google.isConfigured();
  const row = google.getStoredTokens(req.user.id);
  res.json({ configured, connected: Boolean(row), connectedEmail: row ? row.connected_email : null });
});

router.post('/google/me/disconnect', (req, res) => {
  google.disconnect(req.user.id);
  res.status(204).end();
});

module.exports = router;
