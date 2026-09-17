// Unauthenticated, token-gated routes for customer-facing documents — the estimate
// approval page (Joist-style e-signature) and the branded invoice view. Each token is a
// random 24-char hex string generated when the record is created — long enough that
// guessing it isn't practical — so no login is required for a customer to view their own
// estimate or invoice.
const express = require('express');
const db = require('../db');
const { getEstimateFull, getInvoiceFull, logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');

const router = express.Router();

function estimateByToken(token) {
  const row = db.prepare(`SELECT id FROM estimates WHERE sign_token = ?`).get(token);
  return row ? getEstimateFull(row.id) : null;
}

function invoiceByToken(token) {
  const row = db.prepare(`SELECT id FROM invoices WHERE public_token = ?`).get(token);
  return row ? getInvoiceFull(row.id) : null;
}

router.get('/estimates/:token', (req, res) => {
  const estimate = estimateByToken(req.params.token);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  // Real enforcement of the internal-approval gate (see routes/jobs.js's request-approval/
  // approve/reject) — the "Copy approval link" button is hidden client-side while this is true,
  // but the token itself still exists, so the unauthenticated view has to refuse it too rather
  // than trust the UI. Tell the customer it's on its way rather than exposing prices/line items.
  if (estimate.requires_internal_approval) {
    return res.json({ pending_internal_approval: true, number: estimate.number });
  }
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
  if (estimate.requires_internal_approval) return res.status(403).json({ error: 'this estimate is still awaiting internal approval' });
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

router.get('/invoices/:token', (req, res) => {
  const invoice = invoiceByToken(req.params.token);
  if (!invoice) return res.status(404).json({ error: 'not found' });
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(invoice.job_id);
  const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, address FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  const company = job?.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(job.company_id) : null;
  res.json({
    number: invoice.number, status: invoice.status, kind: invoice.kind, due_date: invoice.due_date,
    items: invoice.items, subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total,
    tax_rate: invoice.tax_rate, amount_paid: invoice.amount_paid, balance: invoice.balance,
    payments: invoice.payments,
    job_title: job?.title, job_address: job?.address,
    customer_name: contact ? `${contact.first_name} ${contact.last_name}` : (company ? company.name : null),
    customer_email: contact ? contact.email : null,
    customer_address: (contact && contact.address) || job?.address || null,
  });
});

module.exports = router;
