const express = require('express');
const { getOrCreateWebhookSecret, regenerateWebhookSecret } = require('../settings');
const mailer = require('../mailer');

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

module.exports = router;
