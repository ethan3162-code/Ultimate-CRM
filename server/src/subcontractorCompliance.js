// Background check for subcontractor documents (insurance, license, W9, ...) nearing or past
// their expiry date — same periodic-poll shape as leadInbox.js's AnswerForce check (run once at
// boot, then on an interval from index.js). This only ever emails the office; it never emails the
// subcontractor itself — that's a deliberate one-click action from the Subcontractors page (see
// subcontractors.js's send-renewal-request route), not something the system does on its own.
const db = require('./db');
const mailer = require('./mailer');

const WARN_DAYS = 30;
const RENOTIFY_AFTER_DAYS = 7;

function daysUntil(dateStr) {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.floor((new Date(`${dateStr}T00:00:00Z`) - today) / 86400000);
}

async function checkExpiringDocuments() {
  const docs = db.prepare(`
    SELECT sd.*, s.name AS subcontractor_name
    FROM subcontractor_documents sd JOIN subcontractors s ON s.id = sd.subcontractor_id
    WHERE sd.expiry_date IS NOT NULL AND s.active = 1
  `).all();

  const due = docs.filter((d) => {
    const days = daysUntil(d.expiry_date);
    if (days > WARN_DAYS) return false; // not due yet
    if (!d.last_notified_at) return true;
    const sinceLast = (Date.now() - new Date(d.last_notified_at).getTime()) / 86400000;
    return sinceLast >= RENOTIFY_AFTER_DAYS;
  });
  if (due.length === 0) return { checked: docs.length, notified: 0 };

  const recipients = db.prepare(`SELECT * FROM users WHERE active = 1 AND role = 'admin' AND email IS NOT NULL AND email != ''`).all();
  let notified = 0;
  for (const doc of due) {
    const days = daysUntil(doc.expiry_date);
    const statusText = days < 0 ? `expired ${Math.abs(days)} day(s) ago` : `expires in ${days} day(s)`;
    const subject = `${days < 0 ? 'Expired' : 'Expiring'}: ${doc.subcontractor_name}'s ${doc.doc_type}`;
    const text = `${doc.subcontractor_name}'s ${doc.doc_type} ${statusText} (${doc.expiry_date}).\n\nOpen their record in the CRM to send a renewal request.`;
    for (const r of recipients) {
      try { await mailer.sendEmail({ to: r.email, subject, text }); } catch (err) { console.error('[subcontractorCompliance] notify failed:', err.message); }
    }
    db.prepare(`UPDATE subcontractor_documents SET last_notified_at = datetime('now') WHERE id = ?`).run(doc.id);
    notified++;
  }
  return { checked: docs.length, notified };
}

module.exports = { checkExpiringDocuments };
