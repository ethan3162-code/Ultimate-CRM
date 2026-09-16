// Unauthenticated, token-gated routes for the customer-facing estimate approval page
// (Joist-style e-signature). The token is a random 24-char hex string generated when
// the estimate is created — long enough that guessing it isn't practical — so no login
// is required for a customer to view and sign their own estimate.
const express = require('express');
const db = require('../db');
const { getEstimateFull, logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');

const router = express.Router();

function estimateByToken(token) {
  const row = db.prepare(`SELECT id FROM estimates WHERE sign_token = ?`).get(token);
  return row ? getEstimateFull(row.id) : null;
}

router.get('/estimates/:token', (req, res) => {
  const estimate = estimateByToken(req.params.token);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(estimate.job_id);
  const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  const company = job?.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(job.company_id) : null;
  res.json({
    number: estimate.number, status: estimate.status, items: estimate.items,
    subtotal: estimate.subtotal, tax: estimate.tax, total: estimate.total, tax_rate: estimate.tax_rate,
    signed_name: estimate.signed_name, signed_at: estimate.signed_at,
    job_title: job?.title, job_address: job?.address,
    customer_name: contact ? `${contact.first_name} ${contact.last_name}` : (company ? company.name : null),
  });
});

router.post('/estimates/:token/sign', (req, res) => {
  const estimate = estimateByToken(req.params.token);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  if (estimate.signed_at) return res.status(400).json({ error: 'this estimate has already been signed' });
  const { signed_name, signature_data_url } = req.body;
  if (!signed_name || !signed_name.trim()) return res.status(400).json({ error: 'a typed name is required to sign' });

  db.prepare(`
    UPDATE estimates SET signed_name = ?, signed_at = datetime('now'), signature_data_url = ?, status = CASE WHEN status = 'draft' THEN 'approved' ELSE status END
    WHERE id = ?
  `).run(signed_name.trim(), signature_data_url || null, estimate.id);

  logActivity('job', estimate.job_id, 'estimate', `Estimate ${estimate.number} signed by ${signed_name.trim()}.`);

  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(estimate.job_id);
  const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  fireTrigger('estimate_signed', {
    related_type: 'job', related_id: estimate.job_id,
    dedupe_id: `estimate-signed:${estimate.id}`,
    number: estimate.number, total: estimate.total, job_title: job?.title,
    contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    contact_email: contact ? contact.email : null,
  });

  res.json({ ok: true });
});

module.exports = router;
