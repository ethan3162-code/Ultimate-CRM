const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const {
  getJobFull, getEstimateFull, getInvoiceFull, logActivity,
  STAGE_KEYS, STAGE_LABEL, STAGE_DAY_FIELD, computeProgress, computeEndDate, getJobMilestones,
  redactJobMoney, redactEstimateMoney, redactInvoiceMoney,
} = require('../helpers');
const { fireTrigger } = require('../automationEngine');
const { canSeePrices, checkSectionEdit, getPermissions, canApproveEstimates } = require('../auth');
const mailer = require('../mailer');
const notify = require('../notify');

function sendJob(req, res, job, status) {
  res.status(status || 200).json(canSeePrices(req.user) ? job : redactJobMoney(job));
}
function sendEstimate(req, res, estimate, status) {
  res.status(status || 200).json(canSeePrices(req.user) ? estimate : redactEstimateMoney(estimate));
}
function sendInvoice(req, res, invoice, status) {
  res.status(status || 200).json(canSeePrices(req.user) ? invoice : redactInvoiceMoney(invoice));
}

const router = express.Router();

const DEFAULT_STAGE_DAYS = { demo: 1, site_prep: 2, installation: 5, final_walkthrough: 1 };

// Project-detail fields (Sept 2026 parity pass) — text/notes fields default to null, numeric
// fields to 0, so a job created without any of this still inserts cleanly.
const JOB_TEXT_FIELDS = ['labor_crew', 'unqualified_reason', 'job_notes', 'insurance_requests', 'request_review'];
const JOB_NUMERIC_FIELDS = ['change_order_amount', 'sales_tax_amount', 'labor_paid'];

function readJobDetail(body) {
  const detail = {};
  for (const f of JOB_TEXT_FIELDS) detail[f] = body[f] ?? null;
  for (const f of JOB_NUMERIC_FIELDS) detail[f] = body[f] === undefined || body[f] === '' ? 0 : Number(body[f]) || 0;
  detail.desired_start_date = body.desired_start_date || null;
  detail.contract_amount = body.contract_amount === undefined || body.contract_amount === '' ? null : Number(body.contract_amount) || 0;
  detail.capital_improvement = body.capital_improvement ? 1 : 0;
  return detail;
}

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
  if (canSeePrices(req.user)) return res.json(rows);
  res.json(rows.map((r) => ({
    ...r, contract_amount: null, change_order_amount: null, sales_tax_amount: null, labor_paid: null, price_hidden: true,
  })));
});

router.post('/', (req, res) => {
  const { contact_id, company_id, deal_id, title, status, address, scheduled_date, start_date, stage, owner_user_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const days = readStageDays(req.body, null);
  const progress_percent = computeProgress(days, stage);
  const end_date = computeEndDate(days, start_date);
  const detail = readJobDetail(req.body);
  // A project spun up from a won opportunity inherits its contract amount from that
  // opportunity's value, unless the caller explicitly passed its own.
  if (detail.contract_amount === null && deal_id) {
    const deal = db.prepare(`SELECT value FROM deals WHERE id = ?`).get(deal_id);
    detail.contract_amount = deal ? deal.value : 0;
  }
  detail.contract_amount = detail.contract_amount || 0;
  const result = db.prepare(`
    INSERT INTO jobs (
      contact_id, company_id, deal_id, title, status, address, scheduled_date, start_date, end_date,
      progress_percent, stage, demo_days, site_prep_days, installation_days, final_walkthrough_days,
      labor_crew, desired_start_date, unqualified_reason, job_notes, insurance_requests, request_review,
      contract_amount, change_order_amount, sales_tax_amount, capital_improvement, labor_paid, owner_user_id
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    contact_id || null, company_id || null, deal_id || null, title, status || 'accepted', address || null,
    scheduled_date || null, start_date || null, end_date, progress_percent, stage || null,
    days.demo_days, days.site_prep_days, days.installation_days, days.final_walkthrough_days,
    detail.labor_crew, detail.desired_start_date, detail.unqualified_reason, detail.job_notes, detail.insurance_requests, detail.request_review,
    detail.contract_amount, detail.change_order_amount, detail.sales_tax_amount, detail.capital_improvement, detail.labor_paid,
    owner_user_id || null
  );
  logActivity('job', result.lastInsertRowid, 'note', `Job "${title}" created.`);
  const fresh = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(result.lastInsertRowid);
  notify.notifyJobMilestones(fresh, getJobMilestones(fresh)).catch(() => {});
  sendJob(req, res, getJobFull(result.lastInsertRowid), 201);
});

router.get('/:id', (req, res) => {
  const job = getJobFull(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'job' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const full = canSeePrices(req.user) ? job : redactJobMoney(job);
  res.json({ ...full, activities });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const sectionError = checkSectionEdit(req.user, getPermissions(req.user).jobs === 'edit' ? 'edit' : 'view', req.body);
  if (sectionError) return res.status(403).json({ error: sectionError });
  const updates = { ...existing, ...req.body };
  const days = readStageDays(req.body, existing);
  Object.assign(updates, days);
  const stage = req.body.stage !== undefined ? req.body.stage : existing.stage;
  updates.stage = stage;
  updates.progress_percent = computeProgress(days, stage);
  updates.end_date = computeEndDate(days, updates.start_date);

  for (const f of JOB_TEXT_FIELDS) updates[f] = req.body[f] !== undefined ? req.body[f] : existing[f];
  for (const f of JOB_NUMERIC_FIELDS) updates[f] = req.body[f] !== undefined ? (Number(req.body[f]) || 0) : existing[f];
  updates.desired_start_date = req.body.desired_start_date !== undefined ? (req.body.desired_start_date || null) : existing.desired_start_date;
  updates.contract_amount = req.body.contract_amount !== undefined ? (Number(req.body.contract_amount) || 0) : existing.contract_amount;
  updates.capital_improvement = req.body.capital_improvement !== undefined ? (req.body.capital_improvement ? 1 : 0) : existing.capital_improvement;
  updates.owner_user_id = req.body.owner_user_id !== undefined ? (req.body.owner_user_id || null) : existing.owner_user_id;

  db.prepare(`
    UPDATE jobs SET
      title=?, status=?, address=?, scheduled_date=?, start_date=?, end_date=?, progress_percent=?, stage=?,
      demo_days=?, site_prep_days=?, installation_days=?, final_walkthrough_days=?,
      labor_crew=?, desired_start_date=?, unqualified_reason=?, job_notes=?, insurance_requests=?, request_review=?,
      contract_amount=?, change_order_amount=?, sales_tax_amount=?, capital_improvement=?, labor_paid=?, owner_user_id=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    updates.title, updates.status, updates.address, updates.scheduled_date, updates.start_date, updates.end_date,
    updates.progress_percent, updates.stage, days.demo_days, days.site_prep_days, days.installation_days, days.final_walkthrough_days,
    updates.labor_crew, updates.desired_start_date, updates.unqualified_reason, updates.job_notes, updates.insurance_requests, updates.request_review,
    updates.contract_amount, updates.change_order_amount, updates.sales_tax_amount, updates.capital_improvement, updates.labor_paid, updates.owner_user_id,
    req.params.id
  );
  // Re-notify the project's owner if the schedule itself (or who owns it) changed — a billing
  // or notes-only edit doesn't warrant a fresh invite email.
  const scheduleWorthNotifying = ['start_date', 'demo_days', 'site_prep_days', 'installation_days', 'final_walkthrough_days', 'owner_user_id']
    .some((k) => String(existing[k] ?? '') !== String(updates[k] ?? ''));
  if (scheduleWorthNotifying) {
    const freshJob = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
    notify.notifyJobMilestones(freshJob, getJobMilestones(freshJob)).catch(() => {});
  }
  if (req.body.stage !== undefined && req.body.stage !== existing.stage) {
    const label = req.body.stage ? (STAGE_LABEL[req.body.stage] || req.body.stage) : 'Not started';
    logActivity('job', existing.id, 'note', `Job stage set to "${label}".`);
  }
  if (req.body.status && req.body.status !== existing.status) {
    logActivity('job', existing.id, 'status_change', `Job status changed from "${existing.status}" to "${req.body.status}".`);
    if (req.body.status === 'complete') {
      const contact = existing.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, mobile_phone FROM contacts WHERE id = ?`).get(existing.contact_id) : null;
      const company = existing.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(existing.company_id) : null;
      fireTrigger('job_completed', {
        related_type: 'job', related_id: existing.id,
        title: updates.title, address: updates.address,
        job_id: existing.id, deal_id: existing.deal_id || null, contact_id: existing.contact_id || null,
        contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
        contact_email: contact ? contact.email : null,
        contact_phone: contact ? (contact.mobile_phone || contact.phone) : null,
        company_name: company ? company.name : null,
        job_contact_id: existing.contact_id, job_company_id: existing.company_id,
      });
    }
  }
  sendJob(req, res, getJobFull(req.params.id));
});

// --- Estimates ---
router.post('/:id/estimates', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { number, tax_rate, items, deposit_percent } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'at least one line item is required' });
  const count = db.prepare(`SELECT COUNT(*) c FROM estimates`).get().c;
  const signToken = crypto.randomBytes(12).toString('hex');
  const result = db.prepare(`INSERT INTO estimates (job_id, number, status, tax_rate, deposit_percent, sign_token, created_by_user_id) VALUES (?,?,?,?,?,?,?)`)
    .run(job.id, number || `EST-${1000 + count + 1}`, 'draft', tax_rate || 0, deposit_percent || 0, signToken, req.user ? req.user.id : null);
  const estimateId = result.lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO estimate_items (estimate_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(estimateId, it.description, it.qty, it.unit_price);
  }
  logActivity('job', job.id, 'estimate', `Estimate ${number || ''} created.`);
  sendEstimate(req, res, getEstimateFull(estimateId), 201);
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
  sendEstimate(req, res, getEstimateFull(req.params.estimateId));
});

router.post('/estimates/:estimateId/convert', (req, res) => {
  const estimate = getEstimateFull(req.params.estimateId);
  if (!estimate) return res.status(404).json({ error: 'not found' });
  const count = db.prepare(`SELECT COUNT(*) c FROM invoices`).get().c;
  const number = `INV-${2000 + count + 1}`;
  const dueDate = req.body.due_date || null;
  const publicToken = crypto.randomBytes(12).toString('hex');
  const result = db.prepare(`INSERT INTO invoices (job_id, estimate_id, number, status, tax_rate, due_date, public_token) VALUES (?,?,?,?,?,?,?)`)
    .run(estimate.job_id, estimate.id, number, 'sent', estimate.tax_rate, dueDate, publicToken);
  const invoiceId = result.lastInsertRowid;
  for (const it of estimate.items) {
    db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(invoiceId, it.description, it.qty, it.unit_price);
  }
  db.prepare(`UPDATE estimates SET status = 'approved' WHERE id = ?`).run(estimate.id);
  logActivity('job', estimate.job_id, 'invoice', `Invoice ${number} generated from estimate ${estimate.number}.`);
  sendInvoice(req, res, getInvoiceFull(invoiceId), 201);
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
  const depositToken = crypto.randomBytes(12).toString('hex');
  const result = db.prepare(`INSERT INTO invoices (job_id, estimate_id, number, status, kind, tax_rate, due_date, public_token) VALUES (?,?,?,?,?,?,?,?)`)
    .run(estimate.job_id, estimate.id, number, 'sent', 'deposit', 0, req.body.due_date || null, depositToken);
  const invoiceId = result.lastInsertRowid;
  db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
    .run(invoiceId, `Deposit (${percent}%) for estimate ${estimate.number}`, 1, depositAmount);
  db.prepare(`UPDATE estimates SET deposit_percent = ? WHERE id = ?`).run(percent, estimate.id);
  logActivity('job', estimate.job_id, 'invoice', `Deposit invoice ${number} requested (${percent}% of ${estimate.number}).`);
  sendInvoice(req, res, getInvoiceFull(invoiceId), 201);
});

// --- Internal estimate approval (Sept 2026) — for a salesperson whose login is flagged
// "requires estimate approval" (Users & permissions), gates the customer-facing send/sign
// (see routes/public.js) until someone flagged "can approve estimates" signs off here. ---

// The salesperson asks for sign-off. Anyone can call this (there's no edit-level lock on the
// rest of the estimate routes either — see jobs.js's existing convention), but it's a no-op
// unless the estimate is actually gated: harmless for an estimate whose creator doesn't need
// approval, and clears a prior rejection back to a fresh pending request on resubmit.
router.post('/estimates/:estimateId/request-approval', (req, res) => {
  const existing = db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(req.params.estimateId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.approval_status === 'approved') return res.status(400).json({ error: 'this estimate is already approved' });
  db.prepare(`
    UPDATE estimates SET approval_status = 'pending', approval_requested_at = datetime('now'),
      rejection_reason = NULL, approved_by_user_id = NULL, approved_at = NULL
    WHERE id = ?
  `).run(existing.id);
  logActivity('job', existing.job_id, 'estimate', `Estimate ${existing.number} sent for approval.`);

  // Best-effort email to whoever can approve — never blocks the response, and silently does
  // nothing for anyone without a notification email on file or if Gmail isn't connected yet.
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(existing.job_id);
  const approvers = db.prepare(`SELECT * FROM users WHERE active = 1 AND (role = 'admin' OR can_approve_estimates = 1) AND email IS NOT NULL AND email != ''`).all();
  for (const approver of approvers) {
    mailer.sendEmail({
      to: approver.email,
      subject: `Estimate ${existing.number} needs your approval`,
      text: `${req.user.username} asked for approval to send estimate ${existing.number}${job ? ` for "${job.title}"` : ''} to the customer.\n\nReview it in Ultimate CRM: Dashboard → Pending estimate approvals.`,
    }).catch(() => {});
  }
  sendEstimate(req, res, getEstimateFull(existing.id));
});

router.post('/estimates/:estimateId/approve', (req, res) => {
  if (!canApproveEstimates(req.user)) return res.status(403).json({ error: "your account can't approve estimates" });
  const existing = db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(req.params.estimateId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.approval_status !== 'pending') return res.status(400).json({ error: "this estimate isn't waiting on approval" });
  db.prepare(`UPDATE estimates SET approval_status = 'approved', approved_by_user_id = ?, approved_at = datetime('now'), rejection_reason = NULL WHERE id = ?`)
    .run(req.user.id, existing.id);
  logActivity('job', existing.job_id, 'estimate', `Estimate ${existing.number} approved by ${req.user.username} — ready to send.`);
  sendEstimate(req, res, getEstimateFull(existing.id));
});

router.post('/estimates/:estimateId/reject', (req, res) => {
  if (!canApproveEstimates(req.user)) return res.status(403).json({ error: "your account can't approve estimates" });
  const existing = db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(req.params.estimateId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.approval_status !== 'pending') return res.status(400).json({ error: "this estimate isn't waiting on approval" });
  const reason = (req.body.reason || '').trim();
  db.prepare(`UPDATE estimates SET approval_status = 'rejected', rejection_reason = ?, approved_by_user_id = ?, approved_at = datetime('now') WHERE id = ?`)
    .run(reason || null, req.user.id, existing.id);
  logActivity('job', existing.job_id, 'estimate', `Estimate ${existing.number}'s approval was rejected by ${req.user.username}${reason ? `: ${reason}` : '.'}`);
  sendEstimate(req, res, getEstimateFull(existing.id));
});

// --- Invoices ---
router.post('/:id/invoices', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { number, tax_rate, due_date, items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'at least one line item is required' });
  const count = db.prepare(`SELECT COUNT(*) c FROM invoices`).get().c;
  const expressToken = crypto.randomBytes(12).toString('hex');
  const result = db.prepare(`INSERT INTO invoices (job_id, number, status, tax_rate, due_date, public_token) VALUES (?,?,?,?,?,?)`)
    .run(job.id, number || `INV-${2000 + count + 1}`, 'draft', tax_rate || 0, due_date || null, expressToken);
  const invoiceId = result.lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(invoiceId, it.description, it.qty, it.unit_price);
  }
  logActivity('job', job.id, 'invoice', `Express invoice ${number || ''} created.`);
  sendInvoice(req, res, getInvoiceFull(invoiceId), 201);
});

router.patch('/invoices/:invoiceId', (req, res) => {
  const existing = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.invoiceId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { status, due_date } = req.body;
  db.prepare(`UPDATE invoices SET status = ?, due_date = ? WHERE id = ?`)
    .run(status ?? existing.status, due_date ?? existing.due_date, req.params.invoiceId);
  sendInvoice(req, res, getInvoiceFull(req.params.invoiceId));
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
    const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(job.contact_id) : null;
    fireTrigger('invoice_paid', {
      related_type: 'job', related_id: invoice.job_id,
      dedupe_id: `invoice-paid:${invoice.id}`,
      number: invoice.number, total: updated.total, job_title: job?.title,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
    });
  }
  sendInvoice(req, res, getInvoiceFull(invoice.id), 201);
});

// --- Job photos (before/progress/after) ---
router.post('/:id/photos', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { label, caption, data_url } = req.body;
  if (!data_url) return res.status(400).json({ error: 'data_url is required' });
  const result = db.prepare(`INSERT INTO job_photos (job_id, label, caption, data_url) VALUES (?,?,?,?)`)
    .run(job.id, label || 'progress', caption || null, data_url);
  logActivity('job', job.id, 'note', `Photo added (${label || 'progress'}).`);
  res.status(201).json(db.prepare(`SELECT * FROM job_photos WHERE id = ?`).get(result.lastInsertRowid));
});

router.delete('/photos/:photoId', (req, res) => {
  const photo = db.prepare(`SELECT * FROM job_photos WHERE id = ?`).get(req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM job_photos WHERE id = ?`).run(req.params.photoId);
  res.status(204).end();
});

// --- Job costing: actual expenses logged against a job, so revenue vs. cost vs. profit is real ---
router.post('/:id/expenses', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { category, description, qty, unit_cost, incurred_on, billable } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });
  const result = db.prepare(`
    INSERT INTO job_expenses (job_id, category, description, qty, unit_cost, incurred_on, billable)
    VALUES (?,?,?,?,?,?,?)
  `).run(job.id, category || 'Materials', description, Number(qty) || 1, Number(unit_cost) || 0, incurred_on || new Date().toISOString().slice(0, 10), billable === false ? 0 : 1);
  const amount = (Number(qty) || 1) * (Number(unit_cost) || 0);
  logActivity('job', job.id, 'expense', `Expense logged: ${description} — $${amount.toFixed(2)} (${category || 'Materials'}).`);
  sendJob(req, res, getJobFull(job.id), 201);
});

router.delete('/expenses/:expenseId', (req, res) => {
  const expense = db.prepare(`SELECT * FROM job_expenses WHERE id = ?`).get(req.params.expenseId);
  if (!expense) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM job_expenses WHERE id = ?`).run(req.params.expenseId);
  logActivity('job', expense.job_id, 'expense', `Expense removed: ${expense.description}.`);
  sendJob(req, res, getJobFull(expense.job_id));
});

// --- Crew attendance: log a day worked, which becomes exactly one Labor-category job_expenses
// row so job costing's existing laborCost subtotal picks it up — no separate cost-tracking path,
// and nothing here ever reaches a customer-facing estimate/invoice (those never read job_expenses
// at all). One row per employee per job per day (the UNIQUE constraint on attendance catches an
// accidental double-entry with a clear error rather than double-billing that day's labor). ---
router.post('/:id/attendance', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { employee_id, work_date } = req.body;
  if (!employee_id || !work_date) return res.status(400).json({ error: 'employee_id and work_date are required' });
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  const already = db.prepare(`SELECT 1 FROM attendance WHERE job_id = ? AND employee_id = ? AND work_date = ?`).get(job.id, employee_id, work_date);
  if (already) return res.status(409).json({ error: `${employee.first_name} ${employee.last_name} is already logged on this job for ${work_date}.` });

  const expenseResult = db.prepare(`
    INSERT INTO job_expenses (job_id, category, description, qty, unit_cost, incurred_on, billable)
    VALUES (?, 'Labor', ?, 1, ?, ?, 1)
  `).run(job.id, `${employee.first_name} ${employee.last_name} — ${work_date}`, employee.daily_rate, work_date);
  db.prepare(`
    INSERT INTO attendance (job_id, employee_id, work_date, daily_rate, job_expense_id) VALUES (?,?,?,?,?)
  `).run(job.id, employee_id, work_date, employee.daily_rate, expenseResult.lastInsertRowid);
  logActivity('job', job.id, 'expense', `${employee.first_name} ${employee.last_name} logged for ${work_date} ($${Number(employee.daily_rate).toFixed(2)}/day).`);
  sendJob(req, res, getJobFull(job.id), 201);
});

router.delete('/attendance/:attendanceId', (req, res) => {
  const att = db.prepare(`SELECT * FROM attendance WHERE id = ?`).get(req.params.attendanceId);
  if (!att) return res.status(404).json({ error: 'not found' });
  if (att.job_expense_id) db.prepare(`DELETE FROM job_expenses WHERE id = ?`).run(att.job_expense_id);
  db.prepare(`DELETE FROM attendance WHERE id = ?`).run(att.id);
  logActivity('job', att.job_id, 'expense', 'Attendance entry removed.');
  sendJob(req, res, getJobFull(att.job_id));
});

module.exports = router;
