const express = require('express');
const db = require('../db');
const { getInvoiceFull } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const openDeals = db.prepare(`SELECT * FROM deals WHERE stage NOT IN ('won','lost')`).all();
  const openPipelineValue = openDeals.reduce((s, d) => s + d.value, 0);
  const weightedPipelineValue = openDeals.reduce((s, d) => s + d.value * (d.probability / 100), 0);

  const stageCounts = {};
  for (const stage of ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']) {
    stageCounts[stage] = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(value),0) v FROM deals WHERE stage = ?`).get(stage);
  }

  const invoiceIds = db.prepare(`SELECT id FROM invoices`).all().map(r => r.id);
  const invoices = invoiceIds.map(id => getInvoiceFull(id));
  const unpaidTotal = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.balance, 0);
  const overdueTotal = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.balance, 0);
  const paidThisMonth = invoices
    .flatMap(i => i.payments)
    .filter(p => p.paid_at && p.paid_at.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, p) => s + p.amount, 0);

  const jobsInProgress = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status = 'in_progress'`).get().c;
  const jobsScheduled = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status = 'scheduled'`).get().c;

  const recentActivity = db.prepare(`SELECT * FROM activities ORDER BY created_at DESC LIMIT 10`).all();

  res.json({
    openPipelineValue,
    weightedPipelineValue,
    openDealCount: openDeals.length,
    stageCounts,
    unpaidTotal,
    overdueTotal,
    paidThisMonth,
    jobsInProgress,
    jobsScheduled,
    recentActivity,
  });
});

module.exports = router;
