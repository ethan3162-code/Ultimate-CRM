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

// Job costing: what a job actually made, once real expenses are logged against it.
// Revenue basis prefers billed reality (invoice totals) over a paid-so-far figure —
// job costing measures what the work was worth, not collections — and only falls
// back to an approved estimate's total (clearly labeled "projected") when nothing's
// been invoiced yet, so a job can show a costing picture before billing starts.
function getJobCosting(id, { estimates, invoices } = {}) {
  const ests = estimates || db.prepare(`SELECT id FROM estimates WHERE job_id = ? ORDER BY id`).all(id).map((r) => getEstimateFull(r.id));
  const invs = invoices || db.prepare(`SELECT id FROM invoices WHERE job_id = ? ORDER BY id`).all(id).map((r) => getInvoiceFull(r.id));
  const expenses = db.prepare(`SELECT * FROM job_expenses WHERE job_id = ? ORDER BY incurred_on DESC, id DESC`).all(id);

  let revenue = 0;
  let revenueBasis = 'none';
  if (invs.length > 0) {
    revenue = invs.reduce((s, i) => s + i.total, 0);
    revenueBasis = 'invoiced';
  } else {
    const approved = ests.filter((e) => e.status === 'approved');
    if (approved.length > 0) {
      revenue = approved.reduce((s, e) => s + e.total, 0);
      revenueBasis = 'estimated';
    }
  }

  const byCategoryMap = {};
  let cost = 0;
  let billable = 0;
  let notBillable = 0;
  for (const e of expenses) {
    const amt = e.qty * e.unit_cost;
    cost += amt;
    byCategoryMap[e.category] = (byCategoryMap[e.category] || 0) + amt;
    if (e.billable === 0) notBillable += amt; else billable += amt;
  }
  const profit = revenue - cost;
  const margin = revenue > 0 ? +((profit / revenue) * 100).toFixed(1) : null;
  const categoryAmount = (name) => +(byCategoryMap[name] || 0).toFixed(2);

  return {
    revenue: +revenue.toFixed(2),
    revenueBasis,
    cost: +cost.toFixed(2),
    profit: +profit.toFixed(2),
    margin,
    billable: +billable.toFixed(2),
    notBillable: +notBillable.toFixed(2),
    laborCost: categoryAmount('Labor'),
    materialsCost: categoryAmount('Materials'),
    byCategory: Object.entries(byCategoryMap).map(([category, amount]) => ({ category, amount: +amount.toFixed(2) })),
    expenses,
  };
}

// Project billing (Sept 2026): the "what did we contract for, and what's the gross profit"
// numbers from the paving-industry project-management tool we're matching, layered on top of
// the job-costing engine above rather than duplicating it — contract_amount/change_order_amount/
// sales_tax_amount are the job's own editable fields, while cost/labor figures are pulled straight
// from the same real expense log job costing already uses, so there's one source of truth for cost.
function getJobBilling(job, costing, invoices) {
  const contractAmount = Number(job.contract_amount) || 0;
  const changeOrderAmount = Number(job.change_order_amount) || 0;
  const salesTaxAmount = Number(job.sales_tax_amount) || 0;
  const totalContractAmount = contractAmount + changeOrderAmount;
  const totalCharges = totalContractAmount + salesTaxAmount;
  const grossProfitAmount = totalCharges - costing.cost;
  const grossProfitPercent = totalCharges > 0 ? +((grossProfitAmount / totalCharges) * 100).toFixed(1) : null;
  const laborCost = costing.laborCost;
  const laborPaid = Number(job.labor_paid) || 0;
  const laborBalance = +(laborCost - laborPaid).toFixed(2);
  const laborCostPercent = totalCharges > 0 ? +((laborCost / totalCharges) * 100).toFixed(1) : null;
  const allCustomerPayments = +(invoices.reduce((s, i) => s + (i.amount_paid || 0), 0)).toFixed(2);
  const customerBalance = +(totalCharges - allCustomerPayments).toFixed(2);

  return {
    contractAmount: +contractAmount.toFixed(2),
    changeOrderAmount: +changeOrderAmount.toFixed(2),
    totalContractAmount: +totalContractAmount.toFixed(2),
    salesTaxAmount: +salesTaxAmount.toFixed(2),
    totalCharges: +totalCharges.toFixed(2),
    capitalImprovement: !!job.capital_improvement,
    grossProfitAmount: +grossProfitAmount.toFixed(2),
    grossProfitPercent,
    laborCost,
    laborPaid: +laborPaid.toFixed(2),
    laborBalance,
    laborCostPercent,
    allCustomerPayments,
    customerBalance,
    billable: costing.billable,
    notBillable: costing.notBillable,
    materialsCost: costing.materialsCost,
  };
}

function getJobFull(id) {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  if (!job) return null;
  const estimateRows = db.prepare(`SELECT id FROM estimates WHERE job_id = ? ORDER BY id`).all(id);
  const invoiceRows = db.prepare(`SELECT id FROM invoices WHERE job_id = ? ORDER BY id`).all(id);
  const estimates = estimateRows.map(r => getEstimateFull(r.id));
  const invoices = invoiceRows.map(r => getInvoiceFull(r.id));
  const photos = db.prepare(`SELECT * FROM job_photos WHERE job_id = ? ORDER BY created_at DESC`).all(id);
  const costing = getJobCosting(id, { estimates, invoices });
  const billing = getJobBilling(job, costing, invoices);

  // Account/Opportunity context, pulled from the linked contact/company/deal rather than
  // duplicated onto the job — a project inherits its lead source and service type from the
  // opportunity that became it, the same "single source of truth" pattern used elsewhere.
  const company = job.company_id ? db.prepare(`SELECT id, name FROM companies WHERE id = ?`).get(job.company_id) : null;
  const contact = job.contact_id ? db.prepare(`SELECT id, first_name, last_name, source FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  const deal = job.deal_id ? db.prepare(`SELECT id, title, source, work_type, sub_service_type, value FROM deals WHERE id = ?`).get(job.deal_id) : null;
  const account = company ? { id: company.id, type: 'company', name: company.name } : contact ? { id: contact.id, type: 'contact', name: `${contact.first_name} ${contact.last_name}` } : null;
  const leadSource = (deal && deal.source) || (contact && contact.source) || null;

  return { ...job, estimates, invoices, photos, costing, billing, account, opportunity: deal, lead_source: leadSource };
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
  computeItemsTotal, withTotals, getEstimateFull, getInvoiceFull, getJobFull, getJobCosting, getJobBilling, logActivity,
  STAGE_KEYS, STAGE_LABEL, STAGE_DAY_FIELD, stageDays, totalDays, computeProgress, addDays, computeEndDate,
};
