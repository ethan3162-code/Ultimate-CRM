// Real two-way SMS delivery (Sept 2026) — the user asked for a Hatch-style customer texting
// feature. Talks to Twilio's REST API directly over fetch (Node 22 has it built in) rather than
// pulling in the `twilio` SDK — one less dependency to get through a Render build, and this is
// the entire surface area we need: send one text message.
//
// Same isConfigured()-gated pattern as mailer.js/google.js: everything no-ops gracefully (and
// automations still log what *would* have been sent) until the user creates their own Twilio
// account and adds these three Render environment variables. We can wire the integration up, but
// we can't create or pay for the Twilio account itself on the user's behalf.
//   TWILIO_ACCOUNT_SID   - starts with "AC…", from the Twilio console
//   TWILIO_AUTH_TOKEN    - from the same console page
//   TWILIO_FROM_NUMBER   - a Twilio phone number you've purchased, e.g. +15551234567

function isConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

/** Loosely normalizes to E.164-ish (digits + leading +) — good enough for US-style numbers
    typed as "(555) 123-4567" or "555-123-4567"; leaves an already-international number alone. */
function normalizePhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/** Sends one text. Resolves to { sent: true, sid } or { sent: false, reason }. Never throws. */
async function sendSms({ to, body }) {
  const toNumber = normalizePhone(to);
  if (!toNumber) return { sent: false, reason: 'no phone number on file for this contact' };
  if (!isConfigured()) return { sent: false, reason: 'not configured' };
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: toNumber, From: process.env.TWILIO_FROM_NUMBER, Body: body || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, reason: data.message || `Twilio error ${res.status}` };
    return { sent: true, sid: data.sid };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendSms, normalizePhone };
