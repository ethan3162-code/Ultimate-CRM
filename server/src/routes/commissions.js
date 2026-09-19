// Salesman commission payout report (Sept 2026) — a week/month-at-a-time view of which
// salespeople earned what, grouped by person, for whoever's running payroll. Not gated by
// requirePage in index.js: like estimate-approvals, visibility here is a personal capability
// (canSeeCommissions, or simply being the salesperson on a job) rather than a business-object page
// permission, so someone with no "Projects" access at all can still see their own payouts.
const express = require('express');
const { getCommissionPayouts } = require('../helpers');
const { canSeeCommissions } = require('../auth');

const router = express.Router();

/** Monday–Sunday bounds (as 'YYYY-MM-DD' strings) for the week containing `anchor`. */
function weekBounds(anchor) {
  const d = new Date(`${anchor}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

/** 1st–last-day bounds (as 'YYYY-MM-DD' strings) for the calendar month containing `anchor`. */
function monthBounds(anchor) {
  const d = new Date(`${anchor}T00:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function fmt(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

router.get('/', (req, res) => {
  const periodType = req.query.period === 'month' ? 'month' : 'week';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(req.query.anchor || '') ? req.query.anchor : new Date().toISOString().slice(0, 10);
  const { start, end } = periodType === 'month' ? monthBounds(anchor) : weekBounds(anchor);
  const periodLabel = periodType === 'month'
    ? new Date(`${start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : `${fmt(start)} – ${fmt(end)}`;

  let jobRows = getCommissionPayouts(start, end);
  // Full visibility (admin, or "Sees commissions" flagged in Users & permissions) sees every
  // salesperson's payouts; everyone else only ever sees their own row — same rule JobDetail
  // already applies per-project, just applied across the whole report.
  const scope = canSeeCommissions(req.user) ? 'all' : 'self';
  if (scope === 'self') jobRows = jobRows.filter((r) => r.salespersonUserId === req.user.id);

  const bySalesperson = new Map();
  for (const r of jobRows) {
    if (!bySalesperson.has(r.salespersonUserId)) {
      bySalesperson.set(r.salespersonUserId, {
        salespersonUserId: r.salespersonUserId, salespersonUsername: r.salespersonUsername,
        percent: r.percent, jobs: [], totalCommission: 0,
      });
    }
    const bucket = bySalesperson.get(r.salespersonUserId);
    bucket.jobs.push(r);
    bucket.totalCommission = +(bucket.totalCommission + r.amount).toFixed(2);
  }
  const rows = [...bySalesperson.values()].sort((a, b) => b.totalCommission - a.totalCommission);
  const grandTotal = +rows.reduce((s, r) => s + r.totalCommission, 0).toFixed(2);

  res.json({ periodType, anchor, periodStart: start, periodEnd: end, periodLabel, scope, rows, grandTotal });
});

module.exports = router;
