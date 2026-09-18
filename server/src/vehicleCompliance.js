// Background check for vehicle documents (registration, insurance, inspection, ...) nearing or
// past their expiry date — same periodic-poll shape as subcontractorCompliance.js. Unlike a
// subcontractor's documents, there's no outside party to send a renewal request to here, so this
// only ever emails the office admins; keeping a truck's registration/insurance current is an
// internal fleet-management task, not something to hand off to anyone else with a click.
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
    SELECT vd.*, v.name AS vehicle_name
    FROM vehicle_documents vd JOIN vehicles v ON v.id = vd.vehicle_id
    WHERE vd.expiry_date IS NOT NULL AND v.status != 'retired'
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
    const subject = `${days < 0 ? 'Expired' : 'Expiring'}: ${doc.vehicle_name}'s ${doc.doc_type}`;
    const text = `${doc.vehicle_name}'s ${doc.doc_type} ${statusText} (${doc.expiry_date}).\n\nOpen its record in the CRM to update it.`;
    for (const r of recipients) {
      try { await mailer.sendEmail({ to: r.email, subject, text }); } catch (err) { console.error('[vehicleCompliance] notify failed:', err.message); }
    }
    db.prepare(`UPDATE vehicle_documents SET last_notified_at = datetime('now') WHERE id = ?`).run(doc.id);
    notified++;
  }
  return { checked: docs.length, notified };
}

module.exports = { checkExpiringDocuments };
