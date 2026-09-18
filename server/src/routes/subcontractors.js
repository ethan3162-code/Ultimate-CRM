// Subcontractor records and their compliance documents (insurance, license, W9, ...), each with
// its own expiry date. A background check (see index.js's checkSubcontractorDocs, same pattern as
// the AnswerForce inbox poll) flags anything expiring soon and emails the office once per
// document per expiry window — separate from the one-click "send renewal request" button here,
// which emails the *subcontractor* a preset, editable message asking for an updated copy.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { getSetting, setSetting } = require('../settings');
const mailer = require('../mailer');

const router = express.Router();

const DEFAULT_RENEWAL_SUBJECT = 'Updated {doc_type} needed — {company_name}';
const DEFAULT_RENEWAL_BODY = `Hi {contact_name},

Our records show your {doc_type} on file with {company_name} expired (or is about to expire) on {expiry_date}. Could you send over an updated copy at your earliest convenience? We're not able to schedule new work without a current one on file.

Thanks,
{company_name}`;

function renewalTemplate() {
  return {
    subject: getSetting('subcontractor_renewal_email_subject') || DEFAULT_RENEWAL_SUBJECT,
    body: getSetting('subcontractor_renewal_email_body') || DEFAULT_RENEWAL_BODY,
  };
}

function fillTemplate(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : m));
}

// 'expired' < 0 days left, 'expiring' within the next 30, 'ok' otherwise, 'none' if no date set.
function docStatus(expiryDate) {
  if (!expiryDate) return { status: 'none', daysUntil: null };
  const days = Math.floor((new Date(`${expiryDate}T00:00:00Z`) - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);
  return { status: days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'ok', daysUntil: days };
}

function withDocStatus(doc) {
  const { status, daysUntil } = docStatus(doc.expiry_date);
  return { ...doc, status, days_until_expiry: daysUntil };
}

// Worst status across a subcontractor's documents, for the list view's at-a-glance flag.
function worstStatus(documents) {
  const order = { expired: 3, expiring: 2, ok: 1, none: 0 };
  return documents.reduce((worst, d) => (order[d.status] > order[worst] ? d.status : worst), 'none');
}

router.get('/renewal-template', (req, res) => {
  res.json(renewalTemplate());
});
router.put('/renewal-template', (req, res) => {
  const { subject, body } = req.body;
  if (subject !== undefined) setSetting('subcontractor_renewal_email_subject', subject);
  if (body !== undefined) setSetting('subcontractor_renewal_email_body', body);
  res.json(renewalTemplate());
});

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM subcontractors ORDER BY active DESC, name`).all();
  const withStatus = rows.map((s) => {
    const documents = db.prepare(`SELECT * FROM subcontractor_documents WHERE subcontractor_id = ?`).all(s.id).map(withDocStatus);
    return { ...s, compliance_status: worstStatus(documents) };
  });
  res.json(withStatus);
});

router.post('/', (req, res) => {
  const { name, trade, contact_name, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(`
    INSERT INTO subcontractors (name, trade, contact_name, phone, email, notes) VALUES (?,?,?,?,?,?)
  `).run(name, trade || null, contact_name || null, phone || null, email || null, notes || null);
  const sub = db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('subcontractor', sub.id, 'note', `Subcontractor "${sub.name}" added.`);
  res.status(201).json(sub);
});

router.get('/:id', (req, res) => {
  const sub = db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not found' });
  const documents = db.prepare(`SELECT * FROM subcontractor_documents WHERE subcontractor_id = ? ORDER BY expiry_date IS NULL, expiry_date`).all(req.params.id).map(withDocStatus);
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'subcontractor' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...sub, documents, activities, compliance_status: worstStatus(documents) });
});

router.patch('/:id', (req, res) => {
  const sub = db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not found' });
  const fields = ['name', 'trade', 'contact_name', 'phone', 'email', 'notes'];
  const next = { ...sub };
  for (const f of fields) if (req.body[f] !== undefined) next[f] = req.body[f] || null;
  if (req.body.active !== undefined) next.active = req.body.active ? 1 : 0;
  db.prepare(`
    UPDATE subcontractors SET name=?, trade=?, contact_name=?, phone=?, email=?, notes=?, active=?, updated_at=datetime('now') WHERE id=?
  `).run(next.name, next.trade, next.contact_name, next.phone, next.email, next.notes, next.active, sub.id);
  res.json(db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(sub.id));
});

router.delete('/:id', (req, res) => {
  const sub = db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM subcontractors WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

router.post('/:id/documents', (req, res) => {
  const sub = db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not found' });
  const { doc_type, file_name, data_url, expiry_date } = req.body;
  const result = db.prepare(`
    INSERT INTO subcontractor_documents (subcontractor_id, doc_type, file_name, data_url, expiry_date) VALUES (?,?,?,?,?)
  `).run(sub.id, doc_type || 'Insurance', file_name || null, data_url || null, expiry_date || null);
  logActivity('subcontractor', sub.id, 'note', `${doc_type || 'Document'} added${expiry_date ? `, expires ${expiry_date}` : ''}.`);
  const documents = db.prepare(`SELECT * FROM subcontractor_documents WHERE subcontractor_id = ?`).all(sub.id).map(withDocStatus);
  res.status(201).json(documents.find((d) => d.id === result.lastInsertRowid));
});

router.patch('/documents/:docId', (req, res) => {
  const doc = db.prepare(`SELECT * FROM subcontractor_documents WHERE id = ?`).get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  const { doc_type, expiry_date, file_name, data_url } = req.body;
  db.prepare(`
    UPDATE subcontractor_documents SET
      doc_type = COALESCE(?, doc_type), expiry_date = ?, file_name = COALESCE(?, file_name), data_url = COALESCE(?, data_url)
    WHERE id = ?
  `).run(doc_type || null, expiry_date !== undefined ? (expiry_date || null) : doc.expiry_date, file_name || null, data_url || null, doc.id);
  res.json(withDocStatus(db.prepare(`SELECT * FROM subcontractor_documents WHERE id = ?`).get(doc.id)));
});

router.delete('/documents/:docId', (req, res) => {
  const doc = db.prepare(`SELECT * FROM subcontractor_documents WHERE id = ?`).get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM subcontractor_documents WHERE id = ?`).run(req.params.docId);
  res.status(204).end();
});

// One click: email the subcontractor the preset (editable) renewal-request message for this
// specific document. Deliberately a manual send, not automatic — the office reviews/sends rather
// than the system emailing a subcontractor on its own.
router.post('/documents/:docId/send-renewal-request', async (req, res) => {
  const doc = db.prepare(`SELECT * FROM subcontractor_documents WHERE id = ?`).get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  const sub = db.prepare(`SELECT * FROM subcontractors WHERE id = ?`).get(doc.subcontractor_id);
  if (!sub.email) return res.status(400).json({ error: 'This subcontractor has no email on file.' });

  const companyName = getSetting('company_name') || 'Precision Paving & Masonry';
  const vars = {
    contact_name: sub.contact_name || sub.name,
    company_name: companyName,
    doc_type: doc.doc_type,
    expiry_date: doc.expiry_date || 'recently',
  };
  const { subject, body } = renewalTemplate();
  const result = await mailer.sendEmail({
    to: sub.email,
    subject: fillTemplate(subject, vars),
    text: fillTemplate(body, vars),
  });
  if (!result.sent) return res.status(502).json({ error: `Email not sent: ${result.reason}` });

  db.prepare(`UPDATE subcontractor_documents SET last_request_sent_at = datetime('now') WHERE id = ?`).run(doc.id);
  logActivity('subcontractor', sub.id, 'note', `Renewal request sent for ${doc.doc_type}.`);
  res.json(withDocStatus(db.prepare(`SELECT * FROM subcontractor_documents WHERE id = ?`).get(doc.id)));
});

module.exports = router;
