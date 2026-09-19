const crypto = require('crypto');
const db = require('./db');
const { requiresEstimateApproval, canApproveEstimates } = require('./auth');

// The three Display Options toggles (Rate / Quantity / Item Totals) a customer-facing estimate or
// invoice can be created or edited with — each defaults to shown (1) so a request that doesn't
// mention them at all (every pre-existing caller) keeps behaving exactly as before.
function readDisplayFlags(body) {
  return {
    show_rate: body.show_rate === undefined ? 1 : (body.show_rate ? 1 : 0),
    show_qty: body.show_qty === undefined ? 1 : (body.show_qty ? 1 : 0),
    show_item_total: body.show_item_total === undefined ? 1 : (body.show_item_total ? 1 : 0),
  };
}

function computeItemsTotal(items) {
  return items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
}

function withTotals(doc, items, taxRate) {
  const subtotal = computeItemsTotal(items);
  const tax = subtotal * (taxRate || 0);
  return { subtotal, tax, total: subtotal + tax };
}

// An estimate is written against either a Project (job_id) or, for the Lead -> Appointment ->
// Opportunity -> Estimate stage, an Opportunity with no project yet (deal_id) — see
// migrateEstimatesJobOptional() in db.js. This resolves whichever one applies into one shape,
// {title, address, contact, company, customerType}, that every place needing "who is this
// estimate for" (the public customer-facing view, the signed-estimate auto-creation flow, the
// estimate PDF, and the Email/Text-from-the-app actions) can share instead of re-deriving it.
function resolveEstimateParty(estimate) {
  if (estimate.job_id) {
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(estimate.job_id);
    const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, address FROM contacts WHERE id = ?`).get(job.contact_id) : null;
    const company = job?.company_id ? db.prepare(`SELECT name, phone, email, address FROM companies WHERE id = ?`).get(job.company_id) : null;
    return { title: job?.title || null, address: job?.address || null, contact, company, customerType: getJobCustomerType(job) };
  }
  if (estimate.deal_id) {
    const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id);
    const contact = deal?.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, address FROM contacts WHERE id = ?`).get(deal.contact_id) : null;
    const company = deal?.company_id ? db.prepare(`SELECT name, phone, email, address FROM companies WHERE id = ?`).get(deal.company_id) : null;
    const address = (contact && contact.address) || (company && company.address) || null;
    return { title: deal?.title || null, address, contact, company, customerType: (deal && deal.customer_type) || 'Residential' };
  }
  return { title: null, address: null, contact: null, company: null, customerType: 'Residential' };
}

function getEstimateFull(id) {
  const est = db.prepare(`SELECT * FROM estimates WHERE id = ?`).get(id);
  if (!est) return null;
  const items = db.prepare(`SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY id`).all(id);
  const creator = est.created_by_user_id
    ? db.prepare(`SELECT username, role, requires_estimate_approval FROM users WHERE id = ?`).get(est.created_by_user_id)
    : null;
  const approver = est.approved_by_user_id
    ? db.prepare(`SELECT username FROM users WHERE id = ?`).get(est.approved_by_user_id)
    : null;
  // Whether this specific estimate is still blocked from going to the customer — true only while
  // its creator's login requires approval AND this estimate hasn't been approved yet. Computed
  // fresh every read (not stored) so turning the flag off for someone unblocks their existing
  // estimates immediately, with nothing to migrate.
  const requires_internal_approval = !!(creator && requiresEstimateApproval(creator) && est.approval_status !== 'approved');
  return {
    ...est, items, ...withTotals(est, items, est.tax_rate),
    created_by_username: creator ? creator.username : null,
    approved_by_username: approver ? approver.username : null,
    requires_internal_approval,
  };
}

// Every open estimate-approval request this login is allowed to act on — [] (and no query run)
// for anyone who isn't flagged as an approver. Shared by the Dashboard (admin-only) and the
// Home page (every login) so a non-admin approver — say a PM who isn't an admin — can still see
// and act on requests even where Dashboard itself is locked to admins only.
function getPendingEstimateApprovals(user, hidePrices) {
  if (!canApproveEstimates(user)) return [];
  const rows = db.prepare(`SELECT id FROM estimates WHERE approval_status = 'pending' ORDER BY approval_requested_at ASC`).all();
  return rows.map((r) => {
    const est = getEstimateFull(r.id);
    // Works whether this estimate already has a Project (job_id) or is still against an
    // Opportunity with none yet (deal_id) — a salesperson can ask for sign-off at either stage,
    // and this used to only look up a job, silently losing the link (and the page/dashboard
    // link it powers) for a deal-anchored request.
    const party = resolveEstimateParty(est);
    return {
      id: est.id, number: est.number, total: hidePrices ? null : est.total,
      items: est.items.map((it) => (hidePrices ? { ...it, unit_price: null } : it)),
      requested_at: est.approval_requested_at, requested_by: est.created_by_username,
      linked_type: est.job_id ? 'project' : (est.deal_id ? 'opportunity' : null),
      linked_id: est.job_id || est.deal_id || null,
      linked_title: party.title, linked_address: party.address,
    };
  });
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

// Hides dollar figures for a login whose price visibility is off (Users & permissions —
// "Can see prices"). Explicit field lists rather than name-matching, on purpose — a generic
// "anything called total/amount" scan would also catch same-named fields that aren't money
// (e.g. a count), so each of these only touches fields this file itself knows are dollars.
function redactEstimateMoney(estimate) {
  if (!estimate) return estimate;
  return {
    ...estimate, subtotal: null, tax: null, total: null, price_hidden: true,
    items: estimate.items.map((it) => ({ ...it, unit_price: null })),
  };
}
function redactInvoiceMoney(invoice) {
  if (!invoice) return invoice;
  return {
    ...invoice, subtotal: null, tax: null, total: null, amount_paid: null, balance: null, price_hidden: true,
    items: invoice.items.map((it) => ({ ...it, unit_price: null })),
    payments: invoice.payments.map((p) => ({ ...p, amount: null })),
  };
}
function redactJobMoney(job) {
  if (!job) return job;
  return {
    ...job,
    contract_amount: null, change_order_amount: null, sales_tax_amount: null, labor_paid: null,
    price_hidden: true,
    costing: job.costing && {
      ...job.costing, revenue: null, cost: null, profit: null, margin: null, billable: null, notBillable: null,
      laborCost: null, materialsCost: null,
      byCategory: job.costing.byCategory.map((c) => ({ ...c, amount: null })),
      expenses: job.costing.expenses.map((e) => ({ ...e, unit_cost: null })),
    },
    billing: job.billing && {
      ...job.billing,
      contractAmount: null, changeOrderAmount: null, totalContractAmount: null, salesTaxAmount: null,
      totalCharges: null, grossProfitAmount: null, grossProfitPercent: null, laborCost: null, laborPaid: null,
      laborBalance: null, laborCostPercent: null, allCustomerPayments: null, customerBalance: null,
      materialsCost: null, billable: null, notBillable: null,
    },
    estimates: (job.estimates || []).map(redactEstimateMoney),
    invoices: (job.invoices || []).map(redactInvoiceMoney),
    attendance: (job.attendance || []).map((a) => ({ ...a, daily_rate: null })),
  };
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
  // Crew attendance: who worked this job on which days. Each row already created its own
  // Labor-category job_expenses entry (see jobs.js's attendance routes), so this list is purely
  // the people-and-dates view — the dollar subtotal lives in costing.laborCost, same as any other
  // expense category, never itemized per employee anywhere a customer would see it.
  const attendance = db.prepare(`
    SELECT a.*, e.first_name AS employee_first_name, e.last_name AS employee_last_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.job_id = ? ORDER BY a.work_date DESC, a.id DESC
  `).all(id);

  // Account/Opportunity context, pulled from the linked contact/company/deal rather than
  // duplicated onto the job — a project inherits its lead source and service type from the
  // opportunity that became it, the same "single source of truth" pattern used elsewhere.
  const company = job.company_id ? db.prepare(`SELECT id, name FROM companies WHERE id = ?`).get(job.company_id) : null;
  const contact = job.contact_id ? db.prepare(`SELECT id, first_name, last_name, source FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  const deal = job.deal_id ? db.prepare(`SELECT id, title, source, work_type, sub_service_type, value FROM deals WHERE id = ?`).get(job.deal_id) : null;
  const account = company ? { id: company.id, type: 'company', name: company.name } : contact ? { id: contact.id, type: 'contact', name: `${contact.first_name} ${contact.last_name}` } : null;
  const leadSource = (deal && deal.source) || (contact && contact.source) || null;
  const owner = job.owner_user_id ? db.prepare(`SELECT username FROM users WHERE id = ?`).get(job.owner_user_id) : null;

  return { ...job, estimates, invoices, photos, costing, billing, attendance, account, opportunity: deal, lead_source: leadSource, owner_username: owner ? owner.username : null };
}

// Residential vs Commercial for a job — used to pick which Terms & Conditions text a customer-
// facing estimate/invoice shows (see termsText.js). customer_type currently only lives on deals,
// not on jobs themselves, so this prefers the linked deal's value and falls back to a simple
// heuristic when there's no linked deal (or it hasn't been set): a job billed to a company is
// treated as Commercial, everything else as Residential.
function getJobCustomerType(job) {
  if (!job) return 'Residential';
  if (job.deal_id) {
    const deal = db.prepare(`SELECT customer_type FROM deals WHERE id = ?`).get(job.deal_id);
    if (deal && deal.customer_type) return deal.customer_type;
  }
  return job.company_id ? 'Commercial' : 'Residential';
}

// A simple 2-row payment schedule derived from the estimate's deposit_percent — "Deposit X% due at
// signing" / "Balance due upon completion". Estimates only carry a single deposit_percent field
// (no multi-milestone schedule table), so this is what the Joist-style payment-schedule box on the
// customer-facing estimate can show without new schema. Returns a single "due upon completion" row
// when no deposit is set.
function getEstimatePaymentSchedule(estimate) {
  const percent = Number(estimate.deposit_percent) || 0;
  if (percent <= 0) {
    return [{ label: 'Balance', note: 'Due upon completion', amount: estimate.total }];
  }
  const deposit = +(estimate.total * (percent / 100)).toFixed(2);
  const balance = +(estimate.total - deposit).toFixed(2);
  return [
    { label: `Deposit (${percent}%)`, note: 'Due at signing', amount: deposit },
    { label: 'Balance', note: 'Due upon completion', amount: balance },
  ];
}

// Parses a contracts-table row's JSON clauses column into the shape callers actually want
// (an array of [heading, body] pairs), tolerating any bad/legacy JSON by falling back to [].
function parseContract(row) {
  let clauses = [];
  try { clauses = JSON.parse(row.clauses || '[]'); } catch { clauses = []; }
  return { id: row.id, name: row.name, heading: row.heading, intro: row.intro, clauses };
}

// Which contract's terms apply to a given estimate (Sept 2026 — replaces the old fixed
// Residential/Commercial termsText.js split with the user's editable Contracts library). An
// estimate that was explicitly assigned a contract (estimate.contract_id) always uses that one —
// even if it's later un-defaulted — so a document doesn't silently change out from under a
// customer who already saw/signed it with a specific contract attached. Otherwise, falls back to
// whichever contract is currently flagged default for the resolved customer type. If somehow no
// contract exists at all (every one deleted), returns a bare empty shape rather than throwing, so
// a document still renders without a Terms & Conditions section instead of erroring out.
function getContractForEstimate(estimate, customerType) {
  if (estimate.contract_id) {
    const row = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(estimate.contract_id);
    if (row) return parseContract(row);
  }
  const col = customerType === 'Commercial' ? 'is_default_commercial' : 'is_default_residential';
  const row = db.prepare(`SELECT * FROM contracts WHERE ${col} = 1 ORDER BY id LIMIT 1`).get();
  if (row) return parseContract(row);
  return { id: null, name: null, heading: 'AGREEMENT & LIMITED WARRANTY', intro: '', clauses: [] };
}

function logActivity(related_type, related_id, type, note) {
  db.prepare(`INSERT INTO activities (related_type, related_id, type, note) VALUES (?,?,?,?)`)
    .run(related_type, related_id, type, note);
}

// Generates an invoice from an estimate against a specific job — the exact same INV-#### /
// invoice_items-copy shape the "Convert to invoice" button (routes/jobs.js) already produces,
// factored out here so the auto-generate-on-signature flow (routes/public.js, for an estimate
// that was written against an Opportunity rather than a Project) can produce the identical shape
// of invoice without duplicating the numbering/copy logic. Marks the estimate 'approved'. Returns
// the new invoice's id.
function createInvoiceFromEstimate(estimate, jobId, { dueDate } = {}) {
  const count = db.prepare(`SELECT COUNT(*) c FROM invoices`).get().c;
  const number = `INV-${2000 + count + 1}`;
  const publicToken = crypto.randomBytes(12).toString('hex');
  const result = db.prepare(`
    INSERT INTO invoices (job_id, estimate_id, number, status, tax_rate, due_date, public_token, show_rate, show_qty, show_item_total)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    jobId, estimate.id, number, 'sent', estimate.tax_rate, dueDate || null, publicToken,
    estimate.show_rate, estimate.show_qty, estimate.show_item_total
  );
  const invoiceId = result.lastInsertRowid;
  for (const it of estimate.items) {
    db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(invoiceId, it.description, it.qty, it.unit_price);
  }
  db.prepare(`UPDATE estimates SET status = 'approved' WHERE id = ?`).run(estimate.id);
  logActivity('job', jobId, 'invoice', `Invoice ${number} generated from estimate ${estimate.number}.`);
  return invoiceId;
}

// Auto-creates a Project from a won Opportunity the moment a customer signs an estimate that was
// written against that deal with no project yet (see routes/public.js's /estimates/:token/sign).
// Mirrors the same fields the manual "+ Create project" button on the Deal page already relies on
// (DealDetail.jsx's createProject(), which POSTs to /api/jobs with just contact_id/company_id/
// deal_id/title/status/address and lets that route's own defaulting fill in everything else) —
// duplicated narrowly here rather than reused, since this runs from an unauthenticated public
// route with no req/res to hand to that Express handler. New status is 'pending_schedule' (not
// the manual flow's 'accepted') per the requested pipeline: signed estimate -> invoice + project,
// landing in the schedule queue rather than already-accepted.
function createProjectFromDeal(deal, address, status) {
  const contractAmount = Number(deal.value) || 0;
  const result = db.prepare(`
    INSERT INTO jobs (
      contact_id, company_id, deal_id, title, status, address,
      demo_days, site_prep_days, installation_days, final_walkthrough_days, contract_amount
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    deal.contact_id || null, deal.company_id || null, deal.id, deal.title, status || 'pending_schedule',
    address || null, 1, 2, 5, 1, contractAmount
  );
  const jobId = result.lastInsertRowid;
  logActivity('job', jobId, 'note', `Project "${deal.title}" created automatically after its estimate was signed.`);
  return jobId;
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

/** Every stage's own start/end date, derived from job.start_date plus each stage's day-length —
    used by notify.js to email whoever's assigned to the project a calendar invite per milestone
    (Sept 2026). Returns [] if the job has no start_date yet (nothing to schedule against). Each
    stage's start is the day after the previous stage's end, except the first, which starts on
    the project's own start_date; a stage's end is its start plus its own day-length (a stage
    with 0 days still gets a same-day marker rather than being skipped, so nothing silently
    disappears from the schedule if someone zeroes it out temporarily). */
function getJobMilestones(job) {
  if (!job || !job.start_date) return [];
  const days = stageDays(job);
  let cursor = job.start_date;
  const out = [];
  for (const key of STAGE_KEYS) {
    const start = cursor;
    const len = Math.max(0, days[key]);
    const end = len > 0 ? addDays(start, len) : start;
    out.push({ key, label: STAGE_LABEL[key], start, end });
    cursor = end;
  }
  return out;
}

module.exports = {
  computeItemsTotal, withTotals, getEstimateFull, getInvoiceFull, getJobFull, getJobCosting, getJobBilling, logActivity,
  getJobCustomerType, getEstimatePaymentSchedule, createInvoiceFromEstimate, createProjectFromDeal, resolveEstimateParty,
  readDisplayFlags,
  STAGE_KEYS, STAGE_LABEL, STAGE_DAY_FIELD, stageDays, totalDays, computeProgress, addDays, computeEndDate, getJobMilestones,
  redactEstimateMoney, redactInvoiceMoney, redactJobMoney, getPendingEstimateApprovals,
  getContractForEstimate,
};
