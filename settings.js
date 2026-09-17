const crypto = require('crypto');
const db = require('./db');

function getSetting(key) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

/** Returns the lead-intake webhook secret, generating and persisting one on first use. */
function getOrCreateWebhookSecret() {
  let secret = getSetting('lead_webhook_secret');
  if (!secret) {
    secret = crypto.randomBytes(20).toString('hex');
    setSetting('lead_webhook_secret', secret);
  }
  return secret;
}

function regenerateWebhookSecret() {
  const secret = crypto.randomBytes(20).toString('hex');
  setSetting('lead_webhook_secret', secret);
  return secret;
}

module.exports = { getSetting, setSetting, getOrCreateWebhookSecret, regenerateWebhookSecret };
