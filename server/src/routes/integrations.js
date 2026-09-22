const express = require('express');
const { getOrCreateWebhookSecret, regenerateWebhookSecret } = require('../settings');
const mailer = require('../mailer');
const sms = require('../sms');
const leadInbox = require('../leadInbox');
const db = require('../db');

const router = express.Router();

function webhookUrl(req) {
  return `${req.protocol}://${req.get('host')}/api/leads/intake`;
}

router.get('/webhook', (req, res) => {
  res.json({ url: webhookUrl(req), key: getOrCreateWebhookSecret() });
});

router.post('/webhook/regenerate', (req, res) => {
  res.json({ url: webhookUrl(req), key: regenerateWebhookSecret() });
});

router.get('/email', (req, res) => {
  res.json({ configured: mailer.isConfigured(), fromEmail: process.env.GMAIL_USER || null });
});

router.post('/email/test', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: 'to is required' });
  if (!mailer.isConfigured()) return res.status(400).json({ error: 'Gmail is not configured yet — set GMAIL_USER and GMAIL_APP_PASSWORD.' });
  const result = await mailer.sendEmail({ to, subject: 'Ultimate CRM — test email', text: 'This is a test email from your Ultimate CRM integration settings. If you got this, Gmail sending is working.' });
  if (!result.sent) return res.status(502).json({ error: result.reason });
  res.json({ sent: true });
});

router.get('/sms', (req, res) => {
  res.json({ configured: sms.isConfigured(), fromNumber: process.env.TWILIO_FROM_NUMBER || null });
});

router.post('/sms/test', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: 'to is required' });
  if (!sms.isConfigured()) return res.status(400).json({ error: 'Twilio is not configured yet — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.' });
  const result = await sms.sendSms({ to, body: 'This is a test text from your Ultimate CRM integration settings. If you got this, SMS sending is working.' });
  if (!result.sent) return res.status(502).json({ error: result.reason });
  res.json({ sent: true });
});

// AnswerForce call-notification emails -> leads (Sept 2026). Same GMAIL_USER/GMAIL_APP_PASSWORD
// as the Gmail card above — this just also polls that inbox for AnswerForce's messages, so
// there's nothing separate to "connect" here beyond Gmail already being set up.
router.get('/answerforce', (req, res) => {
  const recent = db.prepare(`
    SELECT id, subject, template, status, contact_id, deal_id, note, processed_at
    FROM answerforce_emails ORDER BY id DESC LIMIT 30
  `).all();
  res.json({
    configured: leadInbox.isConfigured(),
    fromEmail: process.env.GMAIL_USER || null,
    running: leadInbox.isRunning(),
    lastPoll: leadInbox.getLastResult(),
    recent,
  });
});

router.post('/answerforce/poll', async (req, res) => {
  if (!leadInbox.isConfigured()) return res.status(400).json({ error: 'Gmail is not configured yet — set GMAIL_USER and GMAIL_APP_PASSWORD.' });
  const result = await leadInbox.pollAnswerForceInbox();
  res.json(result);
});

// One-off historical backfill (e.g. "pull in everything since Jan 1") — separate from the
// standing 60-second poll's rolling window, which stays untouched. A wide date range can mean a
// lot of messages to fetch and parse, so this kicks the run off in the background and returns
// immediately rather than holding the request open; the Integrations page polls GET /answerforce
// (above) to watch it progress via `running` and the growing `recent` list.
router.post('/answerforce/backfill', (req, res) => {
  if (!leadInbox.isConfigured()) return res.status(400).json({ error: 'Gmail is not configured yet — set GMAIL_USER and GMAIL_APP_PASSWORD.' });
  if (leadInbox.isRunning()) return res.status(409).json({ error: 'A check is already in progress — wait for it to finish first.' });
  const { since } = req.body || {};
  const sinceDate = since ? new Date(since) : null;
  if (!sinceDate || Number.isNaN(sinceDate.getTime())) return res.status(400).json({ error: 'A valid "since" date is required.' });
  if (sinceDate.getTime() > Date.now()) return res.status(400).json({ error: '"since" can\'t be in the future.' });

  leadInbox.pollAnswerForceInbox({ sinceDate }).catch(() => {});
  res.status(202).json({ started: true, since: sinceDate.toISOString().slice(0, 10) });
});

module.exports = router;
