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

const { getCompanyProfile } = require('./companyProfile');

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

/** Send a plain-text email, optionally with attachments (nodemailer's `attachments` array —
    e.g. [{ filename, content, contentType }]). Resolves to { sent: true } or { sent: false,
    reason }. Never throws. */
async function sendEmail({ to, subject, text, attachments }) {
  if (!to) return { sent: false, reason: 'no email address on file for this contact' };
  const t = getTransporter();
  if (!t) return { sent: false, reason: 'not configured' };
  try {
    await t.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME || getCompanyProfile().name}" <${process.env.GMAIL_USER}>`,
      to,
      subject: subject || '(no subject)',
      text: text || '',
      ...(attachments && attachments.length ? { attachments } : {}),
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/** Convenience wrapper for sendEmail that attaches a calendar invite (an .ics string built by
    ics.js) with the content-type calendar apps look for so they offer to add it, not just open
    it as a generic file. */
async function sendCalendarInvite({ to, subject, text, ics, icsFilename }) {
  return sendEmail({
    to,
    subject,
    text,
    attachments: [{
      filename: icsFilename || 'invite.ics',
      content: ics,
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
    }],
  });
}

module.exports = { isConfigured, sendEmail, sendCalendarInvite };
