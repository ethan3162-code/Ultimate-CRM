// Campaign drip sends (Sept 2026; extended later that month for the built-in sequence-template
// library) — same periodic-poll shape as subcontractorCompliance.js / leadInbox.js (run from an
// index.js setInterval), on a 60s cadence.
//
// A campaign is either:
//   - a SEQUENCE campaign (created from a template — see campaignTemplates.js and
//     routes/campaigns.js's POST /): its wording lives in campaign_steps, one row per touch,
//     each with its own day_offset and channel (a sequence freely mixes sms/email step to step).
//     campaign_enrollments.next_step_index tracks how far a given contact has gotten.
//   - a SIMPLE campaign (the older, plain way): one message/channel/times_per_day/duration_days,
//     repeated on its own schedule — entirely unchanged from before the template library existed.
// This module tells them apart by whether campaign_steps has any rows for that campaign, and
// sends only to contacts a rep has explicitly enrolled — never an automatic segment rule. An
// enrollment completes on its own once its sequence/budget is exhausted, or stops early if the
// contact replies to anything, or (sequence only) if a given step's channel has nothing to send
// through for that contact — in which case that ONE step is skipped rather than ending the whole
// sequence, since a sequence mixes channels and a contact might simply have no email on file. A
// paused campaign just stops sending for its enrollments without changing their status, so
// un-pausing picks up right where it left off.
const db = require('./db');
const { logActivity } = require('./helpers');
const { render } = require('./automationEngine');
const { getCompanyProfile } = require('./companyProfile');
const mailer = require('./mailer');
const sms = require('./sms');

const DAY_MS = 86400000;

function contactPhone(contact) {
  return contact.mobile_phone || contact.phone || null;
}

function toMs(sqliteDatetime) {
  return new Date(sqliteDatetime.replace(' ', 'T') + 'Z').getTime();
}

// A contact's next upcoming appointment, rendered as a clause like " on Tue, Oct 6 at 10:00 AM"
// — or '' if they have none booked, so a sentence like "your upcoming appointment{{appointment_time}}"
// still reads fine either way.
function appointmentTimeClause(contactId) {
  const appt = db.prepare(`
    SELECT * FROM appointments WHERE contact_id = ? AND start_time > datetime('now') ORDER BY start_time ASC LIMIT 1
  `).get(contactId);
  if (!appt) return '';
  const d = new Date(appt.start_time.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const formatted = d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return ` on ${formatted}`;
}

// Base render context shared by both simple and sequence sends.
function baseCtx(contact) {
  return {
    first_name: contact.first_name,
    last_name: contact.last_name,
    contact_name: `${contact.first_name} ${contact.last_name}`,
  };
}

/** Sends one round of a SIMPLE campaign's message to a contact over whichever channel(s) it's
 * configured for. Returns true if at least one channel actually had somewhere to send it. */
async function sendRound(campaign, contact) {
  const ctx = baseCtx(contact);
  // Every drip message is auto-bookended: a "Hi {first name}," greeting up front (falls back to
  // "Hi there," if a contact has no first name on file) and the business's own name signed at the
  // end — so a campaign's message field is just the middle part, not something a rep has to
  // reassemble by hand on every campaign. See companyProfile.js for where the business name
  // itself comes from (the same source the Estimate/Invoice documents already use).
  const greeting = contact.first_name ? `Hi ${contact.first_name}, ` : 'Hi there, ';
  const middle = render((campaign.message || '').trim(), ctx);
  const signature = ` — ${getCompanyProfile().name}`;
  const body = `${greeting}${middle}${signature}`;
  const wantsSms = campaign.channel === 'sms' || campaign.channel === 'both';
  const wantsEmail = campaign.channel === 'email' || campaign.channel === 'both';
  let sentAny = false;

  if (wantsSms) {
    const phone = contactPhone(contact);
    if (phone) {
      sentAny = true;
      try {
        const result = await sms.sendSms({ to: phone, body });
        db.prepare(`
          INSERT INTO customer_messages (contact_id, direction, channel, body, status, automation_name)
          VALUES (?, 'outbound', 'sms', ?, ?, ?)
        `).run(contact.id, body, result.sent ? 'sent' : (sms.isConfigured() ? 'failed' : 'simulated'), campaign.name);
      } catch { /* best-effort, same as automationEngine.js's send_sms action */ }
    }
  }
  if (wantsEmail) {
    if (contact.email) {
      sentAny = true;
      try {
        const result = await mailer.sendEmail({ to: contact.email, subject: campaign.name, text: body });
        const note = `Campaign "${campaign.name}" emailed ${ctx.contact_name}: ${body}` + (result.sent ? '' : ' (not delivered — email isn’t connected yet)');
        logActivity('contact', contact.id, 'email', note);
      } catch { /* best-effort */ }
    }
  }
  return sentAny;
}

/** Sends one SEQUENCE step to a contact over that step's own channel. Returns
 * { sent, skipped } — skipped is true when the step's channel had nothing to send through for
 * this contact (no phone for sms, no email for email), which the caller treats as "move on to
 * the next step" rather than "stop the whole sequence". */
async function sendStep(campaign, step, contact, repUsername) {
  const ctx = {
    ...baseCtx(contact),
    user_name: repUsername || 'our team',
    company_name: getCompanyProfile().name,
    link: campaign.custom_link || '',
    appointment_time: appointmentTimeClause(contact.id),
  };
  const body = render(step.message, ctx);

  if (step.channel === 'sms') {
    const phone = contactPhone(contact);
    if (!phone) return { sent: false, skipped: true };
    try {
      const result = await sms.sendSms({ to: phone, body });
      db.prepare(`
        INSERT INTO customer_messages (contact_id, direction, channel, body, status, automation_name)
        VALUES (?, 'outbound', 'sms', ?, ?, ?)
      `).run(contact.id, body, result.sent ? 'sent' : (sms.isConfigured() ? 'failed' : 'simulated'), campaign.name);
    } catch { /* best-effort */ }
    return { sent: true, skipped: false };
  }

  if (step.channel === 'email') {
    if (!contact.email) return { sent: false, skipped: true };
    const subject = render(step.subject || campaign.name, ctx);
    try {
      const result = await mailer.sendEmail({ to: contact.email, subject, text: body });
      const note = `Campaign "${campaign.name}" emailed ${ctx.contact_name} ("${subject}"): ${body}` + (result.sent ? '' : ' (not delivered — email isn’t connected yet)');
      logActivity('contact', contact.id, 'email', note);
    } catch { /* best-effort */ }
    return { sent: true, skipped: false };
  }

  return { sent: false, skipped: true };
}

async function processSequenceEnrollment(e, contact) {
  const totalSteps = db.prepare(`SELECT COUNT(*) AS n FROM campaign_steps WHERE campaign_id = ?`).get(e.campaign_id).n;
  if (e.next_step_index >= totalSteps) {
    db.prepare(`UPDATE campaign_enrollments SET status = 'completed' WHERE id = ?`).run(e.id);
    return;
  }
  const step = db.prepare(`SELECT * FROM campaign_steps WHERE campaign_id = ? AND step_order = ?`).get(e.campaign_id, e.next_step_index);
  if (!step) {
    db.prepare(`UPDATE campaign_enrollments SET status = 'completed' WHERE id = ?`).run(e.id);
    return;
  }
  const daysElapsed = (Date.now() - toMs(e.enrolled_at)) / DAY_MS;
  if (daysElapsed < step.day_offset) return; // not due yet

  const campaign = { name: e.campaign_name, custom_link: e.custom_link };
  const rep = db.prepare(`SELECT username FROM users WHERE id = ?`).get(e.enrolled_by_user_id || e.created_by_user_id);
  const { sent, skipped } = await sendStep(campaign, step, contact, rep && rep.username);

  const nextIndex = e.next_step_index + 1;
  if (skipped) {
    logActivity('contact', contact.id, 'automation', `Campaign "${e.campaign_name}" skipped a ${step.channel} step for ${contact.first_name} ${contact.last_name} — no ${step.channel === 'sms' ? 'phone' : 'email'} on file.`);
  }
  if (nextIndex >= totalSteps) {
    db.prepare(`UPDATE campaign_enrollments SET status = 'completed', next_step_index = ?, sends_count = sends_count + ?, last_sent_at = datetime('now') WHERE id = ?`)
      .run(nextIndex, sent ? 1 : 0, e.id);
  } else {
    db.prepare(`UPDATE campaign_enrollments SET next_step_index = ?, sends_count = sends_count + ?, last_sent_at = datetime('now') WHERE id = ?`)
      .run(nextIndex, sent ? 1 : 0, e.id);
  }
}

async function processSimpleEnrollment(e, contact) {
  const daysElapsed = (Date.now() - toMs(e.enrolled_at)) / DAY_MS;
  const budget = e.times_per_day * e.duration_days;
  if (daysElapsed >= e.duration_days || e.sends_count >= budget) {
    db.prepare(`UPDATE campaign_enrollments SET status = 'completed' WHERE id = ?`).run(e.id);
    return;
  }

  const intervalMs = DAY_MS / e.times_per_day;
  const due = !e.last_sent_at || (Date.now() - toMs(e.last_sent_at)) >= intervalMs;
  if (!due) return;

  const campaign = { name: e.campaign_name, message: e.campaign_message, channel: e.campaign_channel };
  const sent = await sendRound(campaign, contact);
  if (sent) {
    db.prepare(`UPDATE campaign_enrollments SET sends_count = sends_count + 1, last_sent_at = datetime('now') WHERE id = ?`).run(e.id);
  } else {
    // Nothing to send it through (no phone for sms, no email for email) — nothing will change
    // next tick either, so stop instead of checking forever. (A sequence campaign doesn't do
    // this — see processSequenceEnrollment, which skips just the one step instead.)
    db.prepare(`UPDATE campaign_enrollments SET status = 'stopped', stopped_reason = 'no phone/email on file for this channel' WHERE id = ?`).run(e.id);
  }
}

async function processCampaignSends() {
  const enrollments = db.prepare(`
    SELECT e.*, c.name AS campaign_name, c.message AS campaign_message, c.channel AS campaign_channel,
      c.times_per_day, c.duration_days, c.status AS campaign_status, c.custom_link, c.created_by_user_id,
      (SELECT COUNT(*) FROM campaign_steps s WHERE s.campaign_id = c.id) AS step_count
    FROM campaign_enrollments e
    JOIN campaigns c ON c.id = e.campaign_id
    WHERE e.status = 'active'
  `).all();

  for (const e of enrollments) {
    // A paused (or since-deleted, though ON DELETE CASCADE would have removed the row) campaign
    // just goes quiet — the enrollment stays 'active' so it resumes on its own if re-activated.
    if (e.campaign_status !== 'active') continue;

    const contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(e.contact_id);
    if (!contact) {
      db.prepare(`UPDATE campaign_enrollments SET status = 'stopped', stopped_reason = 'contact no longer exists' WHERE id = ?`).run(e.id);
      continue;
    }

    // Stop the moment they've replied to anything since being enrolled — the point of a
    // follow-up/restart-conversation campaign is to get them talking again, not to keep texting
    // someone who already did.
    const replied = db.prepare(`
      SELECT 1 FROM customer_messages WHERE contact_id = ? AND direction = 'inbound' AND created_at > ? LIMIT 1
    `).get(e.contact_id, e.enrolled_at);
    if (replied) {
      db.prepare(`UPDATE campaign_enrollments SET status = 'stopped', stopped_reason = 'replied' WHERE id = ?`).run(e.id);
      logActivity('contact', contact.id, 'automation', `Removed from campaign "${e.campaign_name}" — they replied.`);
      continue;
    }

    if (e.step_count > 0) {
      await processSequenceEnrollment(e, contact);
    } else {
      await processSimpleEnrollment(e, contact);
    }
  }
}

module.exports = { processCampaignSends };
