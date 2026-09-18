// Turns AnswerForce's call-notification emails into leads, straight from the same Gmail inbox
// already connected for outbound automation email (GMAIL_USER/GMAIL_APP_PASSWORD — see
// mailer.js/Integrations page). No separate AnswerForce account, webhook, or Zapier step: this
// polls that inbox over IMAP for messages from AnswerForce, parses each one (answerForceParser.js),
// and creates a Contact + "New" deal through the same path the generic lead webhook uses
// (leadIntake.ingestLead) — so the same "Instant reply to a new lead" auto-text automation fires
// for these leads too.
//
// Dedup is a two-pass fetch to keep this cheap on a 60-second poll: first a header-only search to
// find which Message-IDs haven't been processed yet (recorded in answerforce_emails, see db.js —
// that table ships committed like every other table here, so dedup survives a redeploy), then a
// second, targeted fetch of only the new messages' full bodies for parsing.

let imaps;
try {
  imaps = require('imap-simple');
} catch {
  imaps = null;
}
let simpleParser;
try {
  ({ simpleParser } = require('mailparser'));
} catch {
  simpleParser = null;
}

const db = require('./db');
const { parseAnswerForceEmail } = require('./answerForceParser');

const SENDER = process.env.ANSWERFORCE_SENDER_EMAIL || 'noreply@answerforce.com';
const BACKFILL_DAYS = 14;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isConfigured() {
  return Boolean(imaps && simpleParser && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function imapDate(d) {
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function messageIdFromHeaderText(headerText) {
  const m = String(headerText || '').match(/Message-ID:\s*(<[^>]+>)/i);
  return m ? m[1].trim() : null;
}

// Maps a parsed AnswerForce email into the shape leadIntake.ingestLead expects, filling in a
// synthetic name when the call captured no identity at all (a caller with no name, phone, or
// email is rare but shouldn't be silently dropped — better a record a rep can look at and delete).
function leadPayloadFromParsed(parsed) {
  const hasIdentity = Boolean(parsed.first_name || parsed.phone || parsed.email);
  const noteLines = [];
  if (parsed.needs_review) noteLines.push('Low-confidence parse of an AnswerForce email — please double check these details against the original email.');
  if (parsed.notes && parsed.notes.length) noteLines.push(...parsed.notes);
  if (parsed.call_type) noteLines.push(`Call type: ${parsed.call_type}`);

  return {
    first_name: parsed.first_name || (hasIdentity ? null : 'AnswerForce caller'),
    last_name: parsed.last_name || null,
    phone: parsed.phone || null,
    email: parsed.email || null,
    address: parsed.address || null,
    message: parsed.description || null,
    source: 'AnswerForce',
    method_of_entry: parsed.needs_review ? 'AnswerForce (needs review)' : 'AnswerForce',
    work_type: parsed.type_of_work || null,
    lead_type: parsed.call_type || null,
    customer_type: parsed.property_type || 'Residential',
    project_description: parsed.description || null,
    preferred_callback_time: parsed.preferred_callback || null,
    preferred_consult_time: parsed.preferred_consult || null,
    lead_notes: noteLines.length ? noteLines.join(' · ') : null,
  };
}

let lastResult = null;
function getLastResult() {
  return lastResult;
}

let inProgress = false;
function isRunning() {
  return inProgress;
}

/** Runs one poll cycle. Never throws — resolves to a small result summary for logging/the
    Integrations page. Requires GMAIL_USER/GMAIL_APP_PASSWORD (same as outbound mail) to be set.
    Pass `{ sinceDate: aJsDate }` to widen the search window for a one-off historical backfill
    (e.g. "pull in everything since Jan 1") without changing the standing 14-day rolling window
    the periodic 60-second check uses. */
async function pollAnswerForceInbox(opts = {}) {
  if (!isConfigured()) return { ok: false, reason: 'not configured' };
  if (inProgress) return { ok: false, reason: 'a check is already in progress — try again in a moment' };
  inProgress = true;

  const since = imapDate(opts.sinceDate instanceof Date ? opts.sinceDate : new Date(Date.now() - BACKFILL_DAYS * 86400000));
  let connection;
  try {
    connection = await imaps.connect({
      imap: {
        user: process.env.GMAIL_USER,
        password: process.env.GMAIL_APP_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { servername: 'imap.gmail.com' },
      },
    });
    await connection.openBox('INBOX');

    // Pass 1: headers only, to find which messages are new without paying for a full-body fetch.
    const headerResults = await connection.search(
      [['FROM', SENDER], ['SINCE', since]],
      { bodies: ['HEADER.FIELDS (MESSAGE-ID)'], markSeen: false }
    );

    const newUids = [];
    const uidToHeaderMsgId = new Map();
    for (const result of headerResults) {
      const part = result.parts.find((p) => p.which === 'HEADER.FIELDS (MESSAGE-ID)');
      const msgId = part ? messageIdFromHeaderText(part.body) : null;
      const uid = result.attributes.uid;
      const key = msgId || `uid:${uid}`;
      uidToHeaderMsgId.set(uid, key);
      const already = db.prepare(`SELECT 1 FROM answerforce_emails WHERE gmail_message_id = ?`).get(key);
      if (!already) newUids.push(uid);
    }

    let created = 0, skipped = headerResults.length - newUids.length, failed = 0;

    if (newUids.length) {
      // Pass 2: full bodies, only for messages we haven't processed yet.
      const fullResults = await connection.search(
        [['UID', newUids.join(',')]],
        { bodies: [''], markSeen: false }
      );
      for (const result of fullResults) {
        const uid = result.attributes.uid;
        const fallbackKey = uidToHeaderMsgId.get(uid) || `uid:${uid}`;
        try {
          const part = result.parts.find((p) => p.which === '');
          if (!part) { failed++; continue; }
          const parsedMail = await simpleParser(part.body);
          const gmailMessageId = parsedMail.messageId || fallbackKey;

          // Guard against the same message being picked up twice within this one run.
          const already = db.prepare(`SELECT 1 FROM answerforce_emails WHERE gmail_message_id = ?`).get(gmailMessageId);
          if (already) { skipped++; continue; }

          const parsedLead = parseAnswerForceEmail({ subject: parsedMail.subject, text: parsedMail.text || '' });
          const payload = leadPayloadFromParsed(parsedLead);
          // Required at the very top of index.js — required here too, lazily, to avoid a
          // require cycle at module-load time (leadIntake requires automationEngine, which is
          // fine, but keeping this require local makes the dependency direction obvious).
          const { ingestLead } = require('./routes/leadIntake');
          const outcome = ingestLead(payload);

          db.prepare(`
            INSERT INTO answerforce_emails (gmail_message_id, subject, received_at, template, status, contact_id, deal_id, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            gmailMessageId,
            parsedMail.subject || null,
            parsedMail.date ? parsedMail.date.toISOString() : null,
            parsedLead.template,
            outcome.error ? 'failed' : 'created',
            outcome.contact ? outcome.contact.id : null,
            outcome.deal ? outcome.deal.id : null,
            outcome.error || (parsedLead.needs_review ? 'Low-confidence parse — please review.' : null)
          );
          if (outcome.error) failed++; else created++;
        } catch (err) {
          failed++;
          // Still record it as processed (with the error) so a message that will never parse
          // doesn't get retried forever, spamming the log every poll cycle.
          try {
            db.prepare(`
              INSERT OR IGNORE INTO answerforce_emails (gmail_message_id, subject, status, note)
              VALUES (?, NULL, 'failed', ?)
            `).run(fallbackKey, err.message);
          } catch {}
        }
      }
    }

    connection.end();
    lastResult = { ok: true, scanned: headerResults.length, created, skipped, failed, since, ran_at: new Date().toISOString() };
    return lastResult;
  } catch (err) {
    if (connection) { try { connection.end(); } catch {} }
    lastResult = { ok: false, reason: err.message, since, ran_at: new Date().toISOString() };
    return lastResult;
  } finally {
    inProgress = false;
  }
}

module.exports = { isConfigured, pollAnswerForceInbox, getLastResult, isRunning };
