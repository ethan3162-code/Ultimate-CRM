const express = require('express');
const db = require('../db');
const {
  getJobFull, getEstimateFull, getInvoiceFull, logActivity,
  STAGE_KEYS, STAGE_LABEL, STAGE_DAY_FIELD, computeProgress, computeEndDate,
} = require('../helpers');
const { fireTrigger } = require('../automationEngine');

const router = express.Router();

const DEFAULT_STAGE_DAYS = { demo: 1, site_prep: 2, installation: 5, final_walkthrough: 1 };

/** Pulls the four *_days fields out of a body/job object, falling back to existing/default values. */
function readStageDays(body, existing) {
  const out = {};
  for (const key of STAGE_KEYS) {
    const field = STAGE_DAY_FIELD[key];
    const fallback = existing ? existing[field] : DEFAULT_STAGE_DAYS[key];
    const raw = body[field];
    out[field] = raw === undefined ? fallback : Math.max(0, Number(raw) || 0);
  }
  return out;
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT j.*, c.first_name, c.last_name, co.name AS company_name
    FROM jobs j
    LEFT JOIN contacts c ON c.id = j.contact_id
    LEFT JOIN companies co ON co.id = j.company_id
    ORDER BY j.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { contact_id, company_id, deal_id, title, status, address, scheduled_date, start_date, stage } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const days = readStageDays(req.body, null);
  const progress_percent = computeProgress(days, stage);
  const end_date = computeEndDate(days, start_date);
  const result = db.prepare(`
    INSERT INTO jobs (
      contact_id, company_id, deal_id, title, status, address, scheduled_date, start_date, end_date,
      progress_percent, stage, demo_days, site_prep_days, installation_days, final_walkthrough_days
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    contact_id || null, company_id || null, deal_id || null, title, status || 'scheduled', address || null,
    scheduled_date || null, start_date || null, end_date, progress_percent, stage || null,
    days.demo_days, days.site_prep_days, days.installation_days, days.final_walkthrough_days
  );
  logActivity('job', result.lastInsertRowid, 'note', `Job "${title}" created.`);
  res.status(201).json(getJobFull(result.lastInsertRowid));
});

router.get('/:id', (req, res) => {
  const job = getJobFull(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'job' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...job, activities });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updates = { ...existing, ...req.body };
  const days = readStageDays(req.body, existing);
  Object.assign(updates, days);
  const stage = req.body.stage !== undefined ? req.body.stage : existing.stage;
  updates.stage = stage;
  updates.progress_percent = computeProgress(days, stage);
  updates.end_date = computeEndDate(days, updates.start_date);
  db.prepare(`
    UPDATE jobs SET
      title=?, status=?, address=?, scheduled_date=?, start_date=?, end_date=?, progress_percent=?, stage=?,
      demo_days=?, site_prep_days=?, installation_days=?, final_walkthrough_days=?
    WHERE id=?
  `).run(
    updates.title, updates.status, updates.address, updates.scheduled_date, updates.start_date, updates.end_date,
    updates.progress_percent, updates.stage, days.demo_days, days.site_prep_days, days.installation_days, days.final_walkthrough_days,
    req.params.id
  );
  if (req.body.stage !== undefined && req.body.stage !== existing.stage) {
    const label = req.body.stage ? (STAGE_LABEL[req.body.stage] || req.body.stage) : 'Not started';
    logActivity('job', existing.id, 'note', `Job stage set to "${label}".`);
  }
  if (req.body.status && req.body.status !== existing.status) {
    logActivity('job', existing.id, 'status_change', `Job status changed from "${existing.status}" to "${req.body.status}".`);
    if (req.body.status === 'completed') {
      const contact = existing.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(existing.contact_id) : null;
      const company = existing.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(existing.company_id) : null;
      fireTrigger('job_completed', {
        related_type: 'job', related_id: existing.id,
        title: updates.title, address: updates.address,
        contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
        company_name: company ? company.name : null,
        job_contact_id: existing.contact_id, job_company_id: existing.company_id,
      });
    }
  }
  res.json(getJobFull(req.params.id));
});

// --- Estimates ---
router.post('/:id/estimates', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { number, tax_rate, items, deposit_percent } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'at least one line item is required' });
  const count = db.prepare(`SELECT COUNT(*) c FROM estimates`).get().c;
  const result = db.prepare(`INSERT INTO estimates (job_id, number, status, tax_rate, deposit_percent) VALUES (?,?,?,?,?)`)
    .run(job.id, number || `EST-${1000 + count + 1}`, 'draft', tax_rate || 0, deposit_percent || 0);
  const estimateId = result.lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO estimate_items (estimate_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(estimateId, it.description, it.qty, it.unit_price);
  }
  logActivity('job', job.id, 'estimate', `Estimate ${number || ''} created.`);
  res.status(201).json(getEstimateFull(estimateId));
});

router.patch('/estimates/:estimateId', (req, res) => {
  const existing = db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(req.params.estimateId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { status, tax_rate } = req.body;
  db.prepare(`UPDATE estimates SET status = ?, tax_rate = ? WHERE id = ?`)
    .run(status ?? existing.status, tax_rate ?? existing.tax_rate, req.params.estimateId);
  if (status && status !== existing.status) {
    logActivity('job', existing.job_id, 'estimate', `Estimate ${existing.number} marked ${status}.`);
  }
  res.json(getEstimateFull(req.params.estimateId));
});

router.post('/estimates/:estimateId/convert', (req, res) => {
  const estimate = getEstimateFull(req.params.estimateId);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  const count = db.prepare(`SELECT COUNT(*) c FROM invoices`).get().c;
  const number = `INV-${2000 + count + 1}`;
  const dueDate = req.body.due_date || null;
  const result = db.prepare(`INSERT INTO invoices (job_id, estimate_id, number, status, tax_rate, due_date) VALUES (?,?,?,?,?,?)`)
    .run(estimate.job_id, estimate.id, number, 'sent', estimate.tax_rate, dueDate);
  const invoiceId = result.lastInsertRowid;
  for (const it of estimate.items) {
    db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(invoiceId, it.description, it.qty, it.unit_price);
  }
  db.prepare(`UPDATE estimates SET status = 'approved' WHERE id = ?`).run(estimate.id);
  logActivity('job', estimate.job_id, 'invoice', `Invoice ${number} generated from estimate ${estimate.number}.`);
  res.status(201).json(getInvoiceFull(invoiceId));
});

// Request a deposit invoice — a separate, smaller invoice for a percentage of the estimate,
// due before the job is scheduled (Joist-style payment schedules).
router.post('/estimates/:estimateId/deposit', (req, res) => {
  const estimate = getEstimateFull(req.params.estimateId);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  const percent = Number(req.body.percent ?? estimate.deposit_percent);
  if (!percent || percent <= 0 || percent > 100) return res.status(400).json({ error: 'percent must be between 1 and 100' });
  const count = db.prepare(`SELECT COUNT(*) c FROM invoices`).get().c;
  const number = `INV-${2000 + count + 1}`;
  const depositAmount = +(estimate.total * (percent / 100)).toFixed(2);
  const result = db.prepare(`INSERT INTO invoices (job_id, estimate_id, number, status, kind, tax_rate, due_date) VALUES (?,?,?,?,?,?,?)`)
    .run(estimate.job_id, estimate.id, number, 'sent', 'deposit', 0, req.body.due_date || null);
  const invoiceId = result.lastInsertRowid;
  db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
    .run(invoiceId, `Deposit (${percent}%) for estimate ${estimate.number}`, 1, depositAmount);
  db.prepare(`UPDATE estimates SET deposit_percent = ? WHERE id = ?`).run(percent, estimate.id);
  logActivity('job', estimate.job_id, 'invoice', `Deposit invoice ${number} requested (${percent}% of ${estimate.number}).`);
  res.status(201).json(getInvoiceFull(invoiceId));
});

// --- Invoices ---
router.post('/:id/invoices', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { number, tax_rate, due_date, items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'at least one line item is required' });
  const count = db.prepare(`SELECT COUNT(*) c FROM invoices`).get().c;
  const result = db.prepare(`INSERT INTO invoices (job_id, number, status, tax_rate, due_date) VALUES (?,?,?,?,?)`)
    .run(job.id, number || `INV-${2000 + count + 1}`, 'draft', tax_rate || 0, due_date || null);
  const invoiceId = result.lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(invoiceId, it.description, it.qty, it.unit_price);
  }
  logActivity('job', job.id, 'invoice', `Express invoice ${number || ''} created.`);
  res.status(201).json(getInvoiceFull(invoiceId));
});

router.patch('/invoices/:invoiceId', (req, res) => {
  const existing = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.invoiceId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { status, due_date } = req.body;
  db.prepare(`UPDATE invoices SET status = ?, due_date = ? WHERE id = ?`)
    .run(status ?? existing.status, due_date ?? existing.due_date, req.params.invoiceId);
  res.json(getInvoiceFull(req.params.invoiceId));
});

router.post('/invoices/:invoiceId/payments', (req, res) => {
  const invoice = getInvoiceFull(req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'not found' });
  const { amount, method, reference } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  db.prepare(`INSERT INTO payments (invoice_id, amount, method, reference) VALUES (?,?,?,?)`)
    .run(invoice.id, amount, method || 'card', reference || null);
  const updated = getInvoiceFull(invoice.id);
  const refSuffix = reference ? ` (${reference})` : '';
  logActivity('job', invoice.job_id, 'payment', `Payment of $${amount.toFixed(2)} (${method || 'card'})${refSuffix} received on ${invoice.number}.`);

  if (updated.balance <= 0.001) {
    db.prepare(`UPDATE invoices SET status = 'paid' WHERE id = ?`).run(invoice.id);
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(invoice.job_id);
    const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(job.contact_id) : null;
    fireTrigger('invoice_paid', {
      related_type: 'job', related_id: invoice.job_id,
      dedupe_id: `invoice-paid:${invoice.id}`,
      number: invoice.number, total: updated.total, job_title: job?.title,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    });
  }
  res.status(201).json(getInvoiceFull(invoice.id));
});

module.exports = router;
