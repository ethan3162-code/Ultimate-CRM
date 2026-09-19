// Unauthenticated, token-gated routes for customer-facing documents — the estimate
// approval page (Joist-style e-signature) and the branded invoice view. Each token is a
// random 24-char hex string generated when the record is created — long enough that
// guessing it isn't practical — so no login is required for a customer to view their own
// estimate or invoice.
const express = require('express');
const db = require('../db');
const {
  getEstimateFull, getInvoiceFull, logActivity, getEstimatePaymentSchedule,
  createInvoiceFromEstimate, createProjectFromDeal, resolveEstimateParty, getContractForEstimate,
  getJobCustomerType,
} = require('../helpers');
const { getCompanyProfile } = require('../companyProfile');
const { getSetting } = require('../settings');
const { fireTrigger } = require('../automationEngine');
const notify = require('../notify');

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
    return res.json({ pending_internal_approval: true, number: estimate.number, company: getCompanyProfile() });
  }
  const { title, address, contact, company, customerType } = resolveEstimateParty(estimate);

  // Notify the business the first time a customer opens this link — never again after that, so
  // reloading the page (or the customer coming back to re-read it) doesn't re-alert anyone.
  if (!estimate.first_viewed_at) {
    db.prepare(`UPDATE estimates SET first_viewed_at = datetime('now') WHERE id = ?`).run(estimate.id);
    const job = estimate.job_id ? db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(estimate.job_id) : null;
    const deal = estimate.deal_id ? db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id) : null;
    notify.notifyDocumentViewed({
      kind: 'estimate', number: estimate.number, job, deal,
      contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
    }).catch(() => {});
  }

  res.json({
    number: estimate.number, status: estimate.status, items: estimate.items,
    show_rate: !!estimate.show_rate, show_qty: !!estimate.show_qty, show_item_total: !!estimate.show_item_total,
    subtotal: estimate.subtotal, tax: estimate.tax, total: estimate.total, tax_rate: estimate.tax_rate,
    deposit_percent: estimate.deposit_percent, payment_schedule: getEstimatePaymentSchedule(estimate),
    created_at: estimate.created_at,
    signed_name: estimate.signed_name, signed_at: estimate.signed_at, signature_data_url: estimate.signature_data_url,
    declined_at: estimate.declined_at, decline_reason: estimate.decline_reason,
    job_title: title, job_address: address,
    customer_name: contact ? `${contact.first_name} ${contact.last_name}` : (company ? company.name : null),
    customer_email: (contact && contact.email) || null,
    customer_phone: (contact && contact.phone) || null,
    customer_address: (contact && contact.address) || address || null,
    company: getCompanyProfile(),
    company_signature_data_url: getSetting('company_signature_data_url') || null,
    terms: getContractForEstimate(estimate, customerType),
  });
});

router.post('/estimates/:token/sign', (req, res) => {
  const estimate = estimateByToken(req.params.token);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  if (estimate.requires_internal_approval) return res.status(403).json({ error: 'this estimate is still awaiting internal approval' });
  if (estimate.signed_at) return res.status(400).json({ error: 'this estimate has already been signed' });
  if (estimate.declined_at) return res.status(400).json({ error: 'this estimate was declined — contact us if you’d like a new one' });
  const { signed_name, signature_data_url } = req.body;
  if (!signed_name || !signed_name.trim()) return res.status(400).json({ error: 'a typed name is required to sign' });

  db.prepare(`
    UPDATE estimates SET signed_name = ?, signed_at = datetime('now'), signature_data_url = ?, status = CASE WHEN status = 'draft' THEN 'approved' ELSE status END
    WHERE id = ?
  `).run(signed_name.trim(), signature_data_url || null, estimate.id);

  // The Lead -> Appointment -> Opportunity -> Estimate pipeline (Sept 2026): an estimate written
  // against an Opportunity that hasn't become a Project yet gets that Project — and its first
  // invoice — created automatically the moment the customer signs, landing in "Pending schedule"
  // rather than requiring a person to come back and do it by hand.
  let jobId = estimate.job_id;
  if (!jobId && estimate.deal_id) {
    const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id);
    if (deal) {
      const { address } = resolveEstimateParty(estimate);
      jobId = createProjectFromDeal(deal, address, 'pending_schedule');
      db.prepare(`UPDATE estimates SET job_id = ? WHERE id = ?`).run(jobId, estimate.id);
      const freshEstimate = getEstimateFull(estimate.id);
      createInvoiceFromEstimate(freshEstimate, jobId);
      if (deal.stage !== 'won') {
        db.prepare(`UPDATE deals SET stage = 'won', updated_at = datetime('now') WHERE id = ?`).run(deal.id);
        logActivity('deal', deal.id, 'stage_change', `Stage moved from "${deal.stage}" to "won" (estimate signed).`);
        fireTrigger('deal_stage_changed', {
          related_type: 'deal', related_id: deal.id,
          dedupe_id: `${deal.id}:won`,
          title: deal.title, value: deal.value, from_stage: deal.stage, to_stage: 'won',
          deal_id: deal.id,
        });
      }
    }
  }

  logActivity('job', jobId, 'estimate', `Estimate ${estimate.number} signed by ${signed_name.trim()}.`);

  const job = jobId ? db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) : null;
  const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  fireTrigger('estimate_signed', {
    related_type: 'job', related_id: jobId,
    dedupe_id: `estimate-signed:${estimate.id}`,
    number: estimate.number, total: estimate.total, job_title: job?.title,
    contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    contact_email: contact ? contact.email : null,
  });

  // Separate from the automation above — automations email the customer (or log an activity);
  // this is the "notify us" alert the business asked for, sent regardless of whether any
  // automation is configured for estimate_signed at all.
  const signedDeal = !job && estimate.deal_id ? db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id) : null;
  notify.notifyEstimateSigned({
    estimate, job, deal: signedDeal,
    contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
  }).catch(() => {});

  res.json({ ok: true, job_id: jobId });
});

// Customer explicitly declines the estimate (Sept 2026) — a separate action from just not
// signing, so a salesperson can tell "hasn't looked at it yet" apart from "looked and said no."
// Same gates as sign: refuses while still awaiting internal approval, and refuses if the customer
// already signed (can't decline something already accepted) or already declined (idempotent from
// the customer's point of view — no double notifications).
router.post('/estimates/:token/decline', (req, res) => {
  const estimate = estimateByToken(req.params.token);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  if (estimate.requires_internal_approval) return res.status(403).json({ error: 'this estimate is still awaiting internal approval' });
  if (estimate.signed_at) return res.status(400).json({ error: 'this estimate has already been signed' });
  if (estimate.declined_at) return res.json({ ok: true, already: true });

  const reason = (req.body.reason || '').trim();
  db.prepare(`UPDATE estimates SET declined_at = datetime('now'), decline_reason = ? WHERE id = ?`)
    .run(reason || null, estimate.id);

  const job = estimate.job_id ? db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(estimate.job_id) : null;
  const deal = estimate.deal_id ? db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id) : null;
  const { contact } = resolveEstimateParty(estimate);
  const contactName = contact ? `${contact.first_name} ${contact.last_name}` : null;

  logActivity(estimate.job_id ? 'job' : 'deal', estimate.job_id || estimate.deal_id, 'estimate', `Estimate ${estimate.number} was declined by the customer${reason ? `: ${reason}` : '.'}`);
  notify.notifyEstimateDeclined({ estimate, job, deal, contactName, reason }).catch(() => {});

  res.json({ ok: true });
});

router.get('/invoices/:token', (req, res) => {
  const invoice = invoiceByToken(req.params.token);
  if (!invoice) return res.status(404).json({ error: 'not found' });
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(invoice.job_id);
  const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, address FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  const company = job?.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(job.company_id) : null;

  if (!invoice.first_viewed_at) {
    db.prepare(`UPDATE invoices SET first_viewed_at = datetime('now') WHERE id = ?`).run(invoice.id);
    notify.notifyDocumentViewed({
      kind: 'invoice', number: invoice.number, job,
      contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
    }).catch(() => {});
  }

  // An invoice isn't itself signed — it carries the terms/signature of the estimate it was
  // generated from (see helpers.js's createInvoiceFromEstimate), so the customer sees the same
  // executed agreement on both documents. A standalone invoice with no estimate_id (e.g. a
  // manually-created one) simply has no signature block to show.
  const sourceEstimate = invoice.estimate_id ? db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(invoice.estimate_id) : null;
  const customerType = job ? getJobCustomerType(job) : 'Residential';

  res.json({
    number: invoice.number, status: invoice.status, kind: invoice.kind, due_date: invoice.due_date,
    created_at: invoice.created_at,
    show_rate: !!invoice.show_rate, show_qty: !!invoice.show_qty, show_item_total: !!invoice.show_item_total,
    items: invoice.items, subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total,
    tax_rate: invoice.tax_rate, amount_paid: invoice.amount_paid, balance: invoice.balance,
    payments: invoice.payments,
    job_title: job?.title, job_address: job?.address,
    customer_name: contact ? `${contact.first_name} ${contact.last_name}` : (company ? company.name : null),
    customer_email: contact ? contact.email : null,
    customer_phone: (contact && contact.phone) || null,
    customer_address: (contact && contact.address) || job?.address || null,
    company: getCompanyProfile(),
    company_signature_data_url: getSetting('company_signature_data_url') || null,
    terms: sourceEstimate ? getContractForEstimate(sourceEstimate, customerType) : null,
    signed_name: sourceEstimate?.signed_name || null,
    signed_at: sourceEstimate?.signed_at || null,
    signature_data_url: sourceEstimate?.signature_data_url || null,
  });
});

module.exports = router;
