// Campaign drip sends (Sept 2026) — same periodic-poll shape as subcontractorCompliance.js /
// leadInbox.js (run from an index.js setInterval), but on the same 60s cadence as the
// automation-trigger checks since a "2x/day" schedule needs finer-grained checking than a
// once-per-day compliance sweep.
//
// A campaign now carries its own message/channel/times_per_day/duration_days (see db.js's
// ensureColumn calls on the campaigns table) and sends only to contacts a rep has explicitly
// enrolled — never an automatic segment rule. For each 'active' row in campaign_enrollments,
// this sends the next message once enough time has passed since the last one (24h /
// times_per_day, or immediately on enrollment), until the enrollment completes on its own:
// duration_days has elapsed since enrolled_at, the times_per_day * duration_days send budget is
// used up, or the contact replies to anything — whichever comes first. A campaign that's been
// paused simply stops sending for its enrollments without changing their status, so un-pausing
// picks up right where it left off.
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

/** Sends one round of a campaign's message to a contact over whichever channel(s) it's configured
 * for. Returns true if at least one channel actually had somewhere to send it. */
async function sendRound(campaign, contact) {
  const ctx = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    contact_name: `${contact.first_name} ${contact.last_name}`,
  };
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

async function processCampaignSends() {
  const enrollments = db.prepare(`
    SELECT e.*, c.name AS campaign_name, c.message AS campaign_message, c.channel AS campaign_channel,
      c.times_per_day, c.duration_days, c.status AS campaign_status
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

    const daysElapsed = (Date.now() - toMs(e.enrolled_at)) / DAY_MS;
    const budget = e.times_per_day * e.duration_days;
    if (daysElapsed >= e.duration_days || e.sends_count >= budget) {
      db.prepare(`UPDATE campaign_enrollments SET status = 'completed' WHERE id = ?`).run(e.id);
      continue;
    }

    const intervalMs = DAY_MS / e.times_per_day;
    const due = !e.last_sent_at || (Date.now() - toMs(e.last_sent_at)) >= intervalMs;
    if (!due) continue;

    const campaign = { name: e.campaign_name, message: e.campaign_message, channel: e.campaign_channel };
    const sent = await sendRound(campaign, contact);
    if (sent) {
      db.prepare(`UPDATE campaign_enrollments SET sends_count = sends_count + 1, last_sent_at = datetime('now') WHERE id = ?`).run(e.id);
    } else {
      // Nothing to send it through (no phone for sms, no email for email) — nothing will change
      // next tick either, so stop instead of checking forever.
      db.prepare(`UPDATE campaign_enrollments SET status = 'stopped', stopped_reason = 'no phone/email on file for this channel' WHERE id = ?`).run(e.id);
    }
  }
}

module.exports = { processCampaignSends };
