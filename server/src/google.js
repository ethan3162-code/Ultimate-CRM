// Minimal Google Calendar OAuth2 + REST client — no `googleapis` dependency,
// just fetch (Node 18+) against Google's documented OAuth2 and Calendar v3
// endpoints. Tokens are stored in the `oauth_tokens` table, one row per
// (provider, user_id) — user_id 0 is the single shared company calendar,
// any other id is that login's own, personally-connected Google Calendar
// (per-user sync, Sept 2026). Every function below takes an optional userId
// (defaulting to 0, the company calendar) so the same client code drives
// both kinds of connection.
const db = require('./db');
const COMPANY = 0;

const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri() {
  const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`;
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: state || '',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function saveTokens({ access_token, refresh_token, expires_in, scope }, connectedEmail, userId = COMPANY) {
  const expiry_date = Date.now() + (expires_in || 3600) * 1000;
  const existing = getStoredTokens(userId);
  db.prepare(`
    INSERT INTO oauth_tokens (provider, user_id, access_token, refresh_token, expiry_date, scope, connected_email, updated_at)
    VALUES ('google', ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(provider, user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
      expiry_date = excluded.expiry_date,
      scope = excluded.scope,
      connected_email = COALESCE(excluded.connected_email, oauth_tokens.connected_email),
      updated_at = datetime('now')
  `).run(userId, access_token, refresh_token || (existing ? existing.refresh_token : null), expiry_date, scope, connectedEmail || null);
}

function getStoredTokens(userId = COMPANY) {
  return db.prepare(`SELECT * FROM oauth_tokens WHERE provider = 'google' AND user_id = ?`).get(userId);
}

function disconnect(userId = COMPANY) {
  db.prepare(`DELETE FROM oauth_tokens WHERE provider = 'google' AND user_id = ?`).run(userId);
}

/** Returns a valid access token for this calendar (company by default), refreshing it first if
    it's expired. Returns null if that calendar isn't connected. */
async function getValidAccessToken(userId = COMPANY) {
  const row = getStoredTokens(userId);
  if (!row) return null;
  if (row.expiry_date && row.expiry_date - 60000 > Date.now()) return row.access_token;
  if (!row.refresh_token) return row.access_token; // best effort
  const refreshed = await refreshAccessToken(row.refresh_token);
  saveTokens(refreshed, row.connected_email, userId);
  return refreshed.access_token;
}

async function fetchUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

async function calendarRequest(path, options = {}, userId = COMPANY) {
  const token = await getValidAccessToken(userId);
  if (!token) throw new Error('not connected');
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

function calendarId(userId = COMPANY) {
  const row = getStoredTokens(userId);
  return (row && row.calendar_id) || 'primary';
}

async function listEvents({ timeMin, timeMax } = {}, userId = COMPANY) {
  const params = new URLSearchParams({
    timeMin: timeMin || new Date(Date.now() - 30 * 86400000).toISOString(),
    timeMax: timeMax || new Date(Date.now() + 180 * 86400000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await calendarRequest(`/calendars/${encodeURIComponent(calendarId(userId))}/events?${params.toString()}`, {}, userId);
  return data.items || [];
}

async function createEvent(event, userId = COMPANY) {
  return calendarRequest(`/calendars/${encodeURIComponent(calendarId(userId))}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  }, userId);
}

async function updateEvent(eventId, event, userId = COMPANY) {
  return calendarRequest(`/calendars/${encodeURIComponent(calendarId(userId))}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  }, userId);
}

async function deleteEvent(eventId, userId = COMPANY) {
  try {
    return await calendarRequest(`/calendars/${encodeURIComponent(calendarId(userId))}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    }, userId);
  } catch (err) {
    if (String(err.message).includes('404') || String(err.message).includes('410')) return null; // already gone
    throw err;
  }
}

function toGoogleEvent(appt) {
  return {
    summary: appt.title,
    description: appt.description || undefined,
    location: appt.location || undefined,
    start: { dateTime: new Date(appt.start_time).toISOString() },
    end: { dateTime: new Date(appt.end_time).toISOString() },
  };
}

module.exports = {
  COMPANY,
  isConfigured,
  redirectUri,
  getAuthUrl,
  exchangeCodeForTokens,
  saveTokens,
  getStoredTokens,
  disconnect,
  getValidAccessToken,
  fetchUserInfo,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  toGoogleEvent,
};
