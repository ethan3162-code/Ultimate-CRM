const express = require('express');
const db = require('../db');
const { getInvoiceFull } = require('../helpers');

const router = express.Router();

const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABEL = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const JOB_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const JOB_STATUS_LABEL = { scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

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

router.get('/', (req, res) => {
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

  res.json({ revenueByMonth, jobsByMonth, pipelineByStage, jobsByStatus, invoiceAging, topCustomers });
});

module.exports = router;
