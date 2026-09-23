const express = require('express');
const db = require('../db');
const { getInvoiceFull, getJobCosting } = require('../helpers');
const { canSeePrices } = require('../auth');

const router = express.Router();

// Hides every dollar figure in the reports payload for a login whose price visibility is off,
// while leaving percentages/rates and counts alone (a close rate or a lead count isn't itself a
// price, even though it's computed alongside $ figures) — same explicit-field philosophy as
// deals.js/helpers.js's redaction, just shaped for this endpoint's report cards.
function redactReportsMoney(r) {
  return {
    ...r,
    revenueByMonth: r.revenueByMonth.map((m) => ({ ...m, total: null })),
    pipelineByStage: r.pipelineByStage.map((s) => ({ ...s, value: null })),
    invoiceAging: r.invoiceAging.map((b) => ({ ...b, amount: null })),
    topCustomers: r.topCustomers.map((c) => ({ ...c, amount: null })),
    revenueForecast: r.revenueForecast.map((m) => ({ ...m, total: null })),
    undatedForecastValue: null,
    jobProfitability: {
      ...r.jobProfitability, totalRevenue: null, totalCost: null, totalProfit: null,
      byJob: r.jobProfitability.byJob.map((j) => ({ ...j, revenue: null, cost: null, profit: null })),
    },
    salesSummary: {
      ...r.salesSummary, totalSales: null, avgJobSize: null,
      deals: r.salesSummary.deals.map((d) => ({ ...d, amount: null })),
    },
    salesBySource: r.salesBySource.map((s) => ({ ...s, amount: null })),
    salesByEstimator: r.salesByEstimator.map((s) => ({ ...s, amount: null })),
    salesByCity: r.salesByCity.map((s) => ({ ...s, amount: null })),
    salesByServiceType: r.salesByServiceType.map((s) => ({ ...s, amount: null })),
    salesByType: r.salesByType.map((s) => ({ ...s, amount: null })),
    balanceOwedByJob: r.balanceOwedByJob.map((j) => ({ ...j, amount: null })),
    totalBalanceOwed: null,
    openPipeline: {
      ...r.openPipeline, total: null,
      rows: r.openPipeline.rows.map((d) => ({ ...d, amount: null })),
    },
    paymentsThisMonth: {
      ...r.paymentsThisMonth, total: null,
      rows: r.paymentsThisMonth.rows.map((j) => ({ ...j, amount: null })),
    },
    price_hidden: true,
  };
}

const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABEL = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const JOB_STATUSES = ['pending_schedule', 'accepted', 'scheduled', 'in_progress', 'complete', 'on_hold', 'cancelled'];
const JOB_STATUS_LABEL = { accepted: 'Accepted', scheduled: 'Scheduled', in_progress: 'In progress', complete: 'Complete', on_hold: 'On hold', cancelled: 'Cancelled' };

function monthKey(d) { return d.toISOString().slice(0, 7); }
function monthLabel(d) { return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }); }

/** Last `count` months, oldest first, as UTC month-start Dates. */
function lastMonths(count) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
  }
  return out;
}

/** Next `count` months starting with the current one, as UTC month-start Dates. */
function nextMonths(count) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  }
  return out;
}

// Computes the whole fixed-report payload, unredacted — pulled into its own function (Sept 2026)
// so routes/builtinReports.js can reuse the exact same numbers for the individual built-in-report
// pages, rather than duplicating any of this math. `/` below is unchanged; it just calls this.
function buildReportsPayload(req) {
  // --- Revenue by month (collected payments, last 6 months) ---
  const months = lastMonths(6);
  const payments = db.prepare(`SELECT amount, paid_at FROM payments`).all();
  const revenueByMonth = months.map((m) => {
    const key = monthKey(m);
    const total = payments
      .filter((p) => p.paid_at && p.paid_at.slice(0, 7) === key)
      .reduce((s, p) => s + p.amount, 0);
    return { month: monthLabel(m), key, total: +total.toFixed(2) };
  });

  // --- New jobs by month (last 6 months, by created_at) ---
  const jobRows = db.prepare(`SELECT created_at FROM jobs`).all();
  const jobsByMonth = months.map((m) => {
    const key = monthKey(m);
    const count = jobRows.filter((j) => j.created_at && j.created_at.slice(0, 7) === key).length;
    return { month: monthLabel(m), key, count };
  });

  // --- Pipeline by stage ---
  const pipelineByStage = DEAL_STAGES.map((stage) => {
    const row = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(value),0) v FROM deals WHERE stage = ?`).get(stage);
    return { stage, label: STAGE_LABEL[stage], count: row.c, value: row.v };
  });

  // --- Jobs by status ---
  const jobsByStatus = JOB_STATUSES.map((status) => {
    const count = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status = ?`).get(status).c;
    return { status, label: JOB_STATUS_LABEL[status], count };
  });

  // --- Invoice aging (unpaid balance, bucketed by days past due) ---
  const invoiceIds = db.prepare(`SELECT id FROM invoices`).all().map((r) => r.id);
  const openInvoices = invoiceIds.map((id) => getInvoiceFull(id)).filter((i) => i && i.balance > 0.001);
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61+': 0 };
  for (const inv of openInvoices) {
    if (!inv.due_date || inv.due_date >= today) { buckets.current += inv.balance; continue; }
    const daysOverdue = Math.floor((new Date(today) - new Date(inv.due_date)) / 86400000);
    if (daysOverdue <= 30) buckets['1-30'] += inv.balance;
    else if (daysOverdue <= 60) buckets['31-60'] += inv.balance;
    else buckets['61+'] += inv.balance;
  }
  const invoiceAging = [
    { bucket: 'Current', amount: +buckets.current.toFixed(2) },
    { bucket: '1-30 days', amount: +buckets['1-30'].toFixed(2) },
    { bucket: '31-60 days', amount: +buckets['31-60'].toFixed(2) },
    { bucket: '61+ days', amount: +buckets['61+'].toFixed(2) },
  ];

  // --- Top customers by amount collected ---
  const customerTotals = new Map();
  for (const id of invoiceIds) {
    const inv = getInvoiceFull(id);
    if (!inv || inv.amount_paid <= 0) continue;
    const job = db.prepare(`SELECT company_id, contact_id FROM jobs WHERE id = ?`).get(inv.job_id);
    if (!job) continue;
    let name = null;
    if (job.company_id) name = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(job.company_id)?.name;
    if (!name && job.contact_id) {
      const c = db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(job.contact_id);
      if (c) name = `${c.first_name} ${c.last_name}`;
    }
    if (!name) continue;
    customerTotals.set(name, (customerTotals.get(name) || 0) + inv.amount_paid);
  }
  const topCustomers = [...customerTotals.entries()]
    .map(([name, amount]) => ({ name, amount: +amount.toFixed(2) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // --- Revenue forecast (next 4 months): open deals' value × probability, bucketed by
  // expected_close month (Salesforce-style weighted forecasting). Deals with no
  // expected_close date aren't guessable to a month, so they're left out of the chart
  // and called out separately instead of silently dropped.
  const forecastMonths = nextMonths(4);
  const openDeals = db.prepare(`SELECT value, probability, expected_close FROM deals WHERE stage NOT IN ('won','lost')`).all();
  const revenueForecast = forecastMonths.map((m) => {
    const key = monthKey(m);
    const weighted = openDeals
      .filter((d) => d.expected_close && d.expected_close.slice(0, 7) === key)
      .reduce((s, d) => s + d.value * ((Number(d.probability) || 0) / 100), 0);
    return { month: monthLabel(m), key, total: +weighted.toFixed(2) };
  });
  const undated = openDeals.filter((d) => !d.expected_close);
  const undatedForecastValue = +undated.reduce((s, d) => s + d.value * ((Number(d.probability) || 0) / 100), 0).toFixed(2);

  // --- Job profitability: real revenue vs. logged expenses, per job and in aggregate.
  // Jobs with neither an invoice/approved estimate nor any expense logged yet are left
  // out — nothing to report until at least one side of the ledger has activity.
  const jobRowsForCosting = db.prepare(`SELECT id, title FROM jobs ORDER BY created_at DESC`).all();
  const jobCostings = jobRowsForCosting
    .map((j) => ({ id: j.id, title: j.title, ...getJobCosting(j.id) }))
    .filter((j) => j.revenue > 0 || j.cost > 0);
  const totalRevenue = jobCostings.reduce((s, j) => s + j.revenue, 0);
  const totalCost = jobCostings.reduce((s, j) => s + j.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const jobProfitability = {
    totalRevenue: +totalRevenue.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    totalProfit: +totalProfit.toFixed(2),
    margin: totalRevenue > 0 ? +((totalProfit / totalRevenue) * 100).toFixed(1) : null,
    byJob: jobCostings
      .map((j) => ({ id: j.id, title: j.title, revenue: j.revenue, cost: j.cost, profit: j.profit, margin: j.margin, revenueBasis: j.revenueBasis }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8),
  };

  // --- Sales & lead-source analytics (matches the reporting on Ethan's Salesforce
  // dashboard: Sales/Close Rate/Avg Job Size by source, estimator, city, service type,
  // property type; Leads by Source and Booking Rate by Source). All-time totals for now —
  // there's no interactive date-range picker in this app yet, unlike the Salesforce
  // dashboard's "Opp: Created Date" etc. filters.
  const wonDeals = db.prepare(`SELECT * FROM deals WHERE stage = 'won'`).all();
  const totalSales = wonDeals.reduce((s, d) => s + d.value, 0);
  const closedDealCount = db.prepare(`SELECT COUNT(*) c FROM deals WHERE stage IN ('won','lost')`).get().c;
  const closeRate = closedDealCount > 0 ? +((wonDeals.length / closedDealCount) * 100).toFixed(1) : null;
  const avgJobSize = wonDeals.length > 0 ? +(totalSales / wonDeals.length).toFixed(2) : 0;
  const appointmentsBooked = db.prepare(`SELECT COUNT(*) c FROM appointments`).get().c;

  // Customer display name for a job (company name, falling back to the linked contact's name)
  // — same resolution the Dashboard's own "Top customers" card already does, pulled out here so
  // the new drill-down report rows below (balance owed, payments this month) can reuse it rather
  // than re-deriving it per row.
  function customerNameForJob(jobId) {
    const job = db.prepare(`SELECT title, company_id, contact_id FROM jobs WHERE id = ?`).get(jobId);
    if (!job) return { title: `Job #${jobId}`, customer: null };
    let customer = null;
    if (job.company_id) customer = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(job.company_id)?.name || null;
    if (!customer && job.contact_id) {
      const c = db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(job.contact_id);
      if (c) customer = `${c.first_name} ${c.last_name}`.trim();
    }
    return { title: job.title, customer };
  }

  const salesSummary = {
    totalSales: +totalSales.toFixed(2), avgJobSize, jobsWon: wonDeals.length, closeRate, appointmentsBooked,
  };

  // City is parsed out of "Street, City, ST" — the same address format used everywhere
  // else in the app (map links, seed data), so no new field is needed just to report by city.
  function cityOf(address) {
    if (!address) return null;
    const parts = address.split(',').map((s) => s.trim());
    return parts.length >= 2 ? parts[parts.length - 2] : null;
  }

  const dealRows = db.prepare(`
    SELECT d.*, c.first_name, c.last_name, c.address AS contact_address, co.name AS company_name, co.address AS company_address
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN companies co ON co.id = d.company_id
  `).all().map((d) => ({ ...d, resolved_address: d.contact_address || d.company_address || null }));

  // Display name for a deal's customer — company name, falling back to the linked contact's
  // name — reused below for the "which project" drill-down rows (Sales, Open pipeline).
  function dealCustomerName(d) {
    if (d.company_name) return d.company_name;
    if (d.first_name || d.last_name) return `${d.first_name || ''} ${d.last_name || ''}`.trim();
    return null;
  }

  function groupSum(rows, keyFn, valueFn) {
    const map = new Map();
    for (const r of rows) {
      const key = keyFn(r);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + valueFn(r));
    }
    return [...map.entries()].map(([label, amount]) => ({ label, amount: +amount.toFixed(2) })).sort((a, b) => b.amount - a.amount);
  }
  function groupCount(rows, keyFn) {
    const map = new Map();
    for (const r of rows) {
      const key = keyFn(r);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }
  function closeRateGroup(rows, keyFn) {
    const wins = new Map();
    const totals = new Map();
    for (const r of rows) {
      const key = keyFn(r);
      if (!key) continue;
      totals.set(key, (totals.get(key) || 0) + 1);
      if (r.stage === 'won') wins.set(key, (wins.get(key) || 0) + 1);
    }
    return [...totals.entries()]
      .map(([label, total]) => ({ label, rate: +(((wins.get(label) || 0) / total) * 100).toFixed(1), total }))
      .sort((a, b) => b.rate - a.rate);
  }

  const wonDealRows = dealRows.filter((d) => d.stage === 'won');
  const salesBySource = groupSum(wonDealRows, (d) => d.source, (d) => d.value);
  const salesByEstimator = groupSum(wonDealRows, (d) => d.rep, (d) => d.value);
  const salesByCity = groupSum(wonDealRows, (d) => cityOf(d.resolved_address), (d) => d.value);
  const salesByServiceType = groupSum(wonDealRows, (d) => d.work_type, (d) => d.value);
  const salesByType = groupSum(wonDealRows, (d) => d.customer_type, (d) => d.value);

  // The individual won deals behind the Sales summary number — "what project got sold" — so
  // the Sales report page can drill down into the actual opportunities, not just the total.
  salesSummary.deals = wonDealRows
    .map((d) => ({ id: d.id, title: d.title, customer: dealCustomerName(d), amount: d.value, link: `/pipeline/${d.id}` }))
    .sort((a, b) => b.amount - a.amount);

  // --- Open pipeline: every still-open opportunity, by value — "what's in the pipeline"
  // drill-down behind the Dashboard's Open pipeline tile (matches routes/dashboard.js's own
  // openPipelineValue exactly: every deal not yet won or lost).
  const openDealRows = dealRows.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const openPipeline = {
    total: +openDealRows.reduce((s, d) => s + d.value, 0).toFixed(2),
    rows: openDealRows
      .map((d) => ({ id: d.id, title: d.title, customer: dealCustomerName(d), amount: d.value, link: `/pipeline/${d.id}` }))
      .sort((a, b) => b.amount - a.amount),
  };

  // --- Balance owed: unpaid invoice balance, per project — "what project owed money" drill-down
  // behind the Dashboard's Balance owed tile (matches routes/dashboard.js's own unpaidTotal
  // exactly: every invoice not yet fully paid, from the same openInvoices list the Invoice
  // aging report above already computed).
  const balanceByJob = new Map();
  for (const inv of openInvoices) {
    if (!inv.job_id) continue;
    balanceByJob.set(inv.job_id, (balanceByJob.get(inv.job_id) || 0) + inv.balance);
  }
  const balanceOwedByJob = [...balanceByJob.entries()]
    .map(([jobId, amount]) => {
      const { title, customer } = customerNameForJob(jobId);
      return { id: jobId, title, customer, amount: +amount.toFixed(2), link: `/jobs/${jobId}` };
    })
    .sort((a, b) => b.amount - a.amount);
  const totalBalanceOwed = +[...balanceByJob.values()].reduce((s, v) => s + v, 0).toFixed(2);

  // --- Payments in this month, per project — matches routes/dashboard.js's own paidThisMonth.
  const paidThisMonthKey = monthKey(new Date());
  const paymentsThisMonthRows = db.prepare(`
    SELECT p.amount, p.paid_at, i.job_id
    FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
    WHERE p.paid_at IS NOT NULL AND substr(p.paid_at, 1, 7) = ?
  `).all(paidThisMonthKey);
  const paidByJobThisMonth = new Map();
  for (const p of paymentsThisMonthRows) {
    if (!p.job_id) continue;
    paidByJobThisMonth.set(p.job_id, (paidByJobThisMonth.get(p.job_id) || 0) + p.amount);
  }
  const paymentsThisMonth = {
    total: +[...paidByJobThisMonth.values()].reduce((s, v) => s + v, 0).toFixed(2),
    rows: [...paidByJobThisMonth.entries()]
      .map(([jobId, amount]) => {
        const { title, customer } = customerNameForJob(jobId);
        return { id: jobId, title, customer, amount: +amount.toFixed(2), link: `/jobs/${jobId}` };
      })
      .sort((a, b) => b.amount - a.amount),
  };

  // --- Jobs in motion: every job currently scheduled or in progress — matches
  // routes/dashboard.js's own jobsInProgress + jobsScheduled count. No dollar figure of its
  // own, so each row shows its status instead of an amount.
  const JOB_IN_MOTION_STATUS_LABEL = { in_progress: 'In progress', scheduled: 'Scheduled' };
  const jobsInMotion = {
    rows: db.prepare(`SELECT id, title, status, company_id, contact_id FROM jobs WHERE status IN ('in_progress','scheduled') ORDER BY created_at DESC`).all()
      .map((j) => {
        const { customer } = customerNameForJob(j.id);
        return { id: j.id, title: j.title, customer, right: JOB_IN_MOTION_STATUS_LABEL[j.status] || j.status, link: `/jobs/${j.id}` };
      }),
  };

  const closedDealRows = dealRows.filter((d) => d.stage === 'won' || d.stage === 'lost');
  const closeRateByPerson = closeRateGroup(closedDealRows, (d) => d.rep);
  const closeRateBySource = closeRateGroup(closedDealRows, (d) => d.source);

  // Leads: every deal ever created (source is attributed at lead-capture time), by source.
  const leadsBySource = groupCount(dealRows, (d) => d.source);
  const thisMonthKey = monthKey(new Date());
  const leadsThisMonthBySource = groupCount(dealRows.filter((d) => d.created_at && d.created_at.slice(0, 7) === thisMonthKey), (d) => d.source);

  // Booking rate by source: of leads attributed to each source, what share have at least
  // one appointment linked via their contact — a proxy for "did we get this lead on the
  // calendar," same idea as the Salesforce "Booking Rate by Source" widget.
  const apptContactIds = new Set(
    db.prepare(`SELECT DISTINCT contact_id FROM appointments WHERE contact_id IS NOT NULL`).all().map((r) => r.contact_id)
  );
  const bookingTotals = new Map();
  const bookingBooked = new Map();
  for (const d of dealRows) {
    if (!d.source) continue;
    bookingTotals.set(d.source, (bookingTotals.get(d.source) || 0) + 1);
    if (d.contact_id && apptContactIds.has(d.contact_id)) bookingBooked.set(d.source, (bookingBooked.get(d.source) || 0) + 1);
  }
  const bookingRateBySource = [...bookingTotals.entries()]
    .map(([label, total]) => ({ label, rate: +(((bookingBooked.get(label) || 0) / total) * 100).toFixed(1), total }))
    .sort((a, b) => b.rate - a.rate);

  return {
    revenueByMonth, jobsByMonth, pipelineByStage, jobsByStatus, invoiceAging, topCustomers, revenueForecast, undatedForecastValue, jobProfitability,
    salesSummary, salesBySource, salesByEstimator, salesByCity, salesByServiceType, salesByType,
    closeRateByPerson, closeRateBySource, leadsBySource, leadsThisMonthBySource, bookingRateBySource,
    balanceOwedByJob, totalBalanceOwed, openPipeline, paymentsThisMonth, jobsInMotion,
  };
}

router.get('/', (req, res) => {
  const payload = buildReportsPayload(req);
  res.json(canSeePrices(req.user) ? payload : redactReportsMoney(payload));
});

module.exports = router;
module.exports.buildReportsPayload = buildReportsPayload;
module.exports.redactReportsMoney = redactReportsMoney;
