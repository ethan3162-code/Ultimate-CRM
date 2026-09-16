const db = require('./db');

function computeItemsTotal(items) {
  return items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
}

function withTotals(doc, items, taxRate) {
  const subtotal = computeItemsTotal(items);
  const tax = subtotal * (taxRate || 0);
  return { subtotal, tax, total: subtotal + tax };
}

function getEstimateFull(id) {
  const est = db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(id);
  if (!est) return null;
  const items = db.prepare(`SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY id`).all(id);
  return { ...est, items, ...withTotals(est, items, est.tax_rate) };
}

function getInvoiceFull(id) {
  const inv = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(id);
  if (!inv) return null;
  const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id`).all(id);
  const payments = db.prepare(`SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at`).all(id);
  const totals = withTotals(inv, items, inv.tax_rate);
  const amount_paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, +(totals.total - amount_paid).toFixed(2));
  let status = inv.status;
  if (status !== 'draft') {
    if (balance <= 0.001) status = 'paid';
    else if (amount_paid > 0) status = 'partial';
    else if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10) && status !== 'paid') status = 'overdue';
  }
  return { ...inv, status, items, payments, ...totals, amount_paid, balance };
}

function getJobFull(id) {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  if (!job) return null;
  const estimateRows = db.prepare(`SELECT id FROM estimates WHERE job_id = ? ORDER BY id`).all(id);
  const invoiceRows = db.prepare(`SELECT id FROM invoices WHERE job_id = ? ORDER BY id`).all(id);
  const estimates = estimateRows.map(r => getEstimateFull(r.id));
  const invoices = invoiceRows.map(r => getInvoiceFull(r.id));
  return { ...job, estimates, invoices };
}

function logActivity(related_type, related_id, type, note) {
  db.prepare(`INSERT INTO activities (related_type, related_id, type, note) VALUES (?,?,?,?)`)
    .run(related_type, related_id, type, note);
}

// --- Job finish-out stages: Demo -> Site prep -> Installation -> Final walkthrough ---
// Each stage has its own day-length, so a job's overall schedule length (and its
// progress percentage) is derived from those, rather than an arbitrary 0-100 slider.
const STAGE_KEYS = ['demo', 'site_prep', 'installation', 'final_walkthrough'];
const STAGE_LABEL = { demo: 'Demo', site_prep: 'Site prep', installation: 'Installation', final_walkthrough: 'Final walkthrough' };
const STAGE_DAY_FIELD = { demo: 'demo_days', site_prep: 'site_prep_days', installation: 'installation_days', final_walkthrough: 'final_walkthrough_days' };

function stageDays(job) {
  return STAGE_KEYS.reduce((acc, k) => { acc[k] = Number(job[STAGE_DAY_FIELD[k]]) || 0; return acc; }, {});
}
function totalDays(job) {
  const days = stageDays(job);
  return STAGE_KEYS.reduce((s, k) => s + days[k], 0);
}
/** Progress = cumulative days through (and including) the given stage, as a % of the total project length. */
function computeProgress(job, stage) {
  if (!stage) return 0;
  const days = stageDays(job);
  const total = totalDays(job) || 1;
  const idx = STAGE_KEYS.indexOf(stage);
  if (idx < 0) return 0;
  const cumulative = STAGE_KEYS.slice(0, idx + 1).reduce((s, k) => s + days[k], 0);
  return Math.min(100, Math.round((cumulative / total) * 100));
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** The end date implied by a start date plus the sum of every stage's day-length. */
function computeEndDate(job, startDate) {
  if (!startDate) return null;
  return addDays(startDate, totalDays(job));
}

module.exports = {
  computeItemsTotal, withTotals, getEstimateFull, getInvoiceFull, getJobFull, logActivity,
  STAGE_KEYS, STAGE_LABEL, STAGE_DAY_FIELD, stageDays, totalDays, computeProgress, addDays, computeEndDate,
};
