// Real email delivery for automation "send_email" actions, via a Gmail account
// (an app password, not the account password — see Integrations page for setup).
// Falls back to a no-op when unconfigured so automations keep logging their
// simulated note even before Gmail is connected.

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function isConfigured() {
  return Boolean(nodemailer && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

/** Send a plain-text email. Resolves to { sent: true } or { sent: false, reason }. Never throws. */
async function sendEmail({ to, subject, text }) {
  if (!to) return { sent: false, reason: 'no email address on file for this contact' };
  const t = getTransporter();
  if (!t) return { sent: false, reason: 'not configured' };
  try {
    await t.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME || 'Ultimate CRM'}" <${process.env.GMAIL_USER}>`,
      to,
      subject: subject || '(no subject)',
      text: text || '',
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendEmail };
