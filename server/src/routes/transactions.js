// Company-wide transactions ledger (Sept 2026) — every invoice issued and every payment
// collected, across every project, in one flat list. Invoices and payments already exist per-job
// inside Projects (see jobs.js/JobDetail.jsx); this is a read-only rollup on top so someone doing
// the books doesn't have to open each project to see what's been billed and what's come in.
// Gated by its own 'transactions' permission — separate from 'jobs' — so an admin can hand a
// bookkeeper visibility into money without also giving them project-management access, or the
// reverse (a PM who manages projects but shouldn't see the full financial ledger).
const express = require('express');
const db = require('../db');
const { canSeePrices } = require('../auth');

const router = express.Router();

function customerName(row) {
  const person = [row.contact_first, row.contact_last].filter(Boolean).join(' ').trim();
  return row.company_name || person || null;
}

router.get('/', (req, res) => {
  const invoiceRows = db.prepare(`
    SELECT i.id, i.job_id, i.number, i.status AS raw_status, i.tax_rate, i.due_date, i.created_at,
           j.title AS job_title,
           c.first_name AS contact_first, c.last_name AS contact_last, co.name AS company_name,
           COALESCE(ii.amount, 0) AS subtotal,
           COALESCE(pd.paid, 0) AS amount_paid
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    LEFT JOIN contacts c ON c.id = j.contact_id
    LEFT JOIN companies co ON co.id = j.company_id
    LEFT JOIN (SELECT invoice_id, SUM(qty*unit_price) AS amount FROM invoice_items GROUP BY invoice_id) ii ON ii.invoice_id = i.id
    LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) pd ON pd.invoice_id = i.id
    ORDER BY i.created_at DESC
  `).all();

  const paymentRows = db.prepare(`
    SELECT p.id, p.amount, p.method, p.reference, p.paid_at,
           i.id AS invoice_id, i.number AS invoice_number, i.job_id,
           j.title AS job_title,
           c.first_name AS contact_first, c.last_name AS contact_last, co.name AS company_name
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    JOIN jobs j ON j.id = i.job_id
    LEFT JOIN contacts c ON c.id = j.contact_id
    LEFT JOIN companies co ON co.id = j.company_id
    ORDER BY p.paid_at DESC
  `).all();

  const today = new Date().toISOString().slice(0, 10);
  const invoiceTx = invoiceRows.map((r) => {
    const total = +(r.subtotal * (1 + (r.tax_rate || 0))).toFixed(2);
    const balance = Math.max(0, +(total - r.amount_paid).toFixed(2));
    let status = r.raw_status;
    if (status !== 'draft') {
      if (balance <= 0.001) status = 'paid';
      else if (r.amount_paid > 0) status = 'partial';
      else if (r.due_date && r.due_date < today) status = 'overdue';
    }
    return {
      type: 'invoice', id: `invoice-${r.id}`, date: r.created_at, job_id: r.job_id, job_title: r.job_title,
      customer: customerName(r), invoice_number: r.number, status, amount: total, balance,
    };
  });

  const paymentTx = paymentRows.map((r) => ({
    type: 'payment', id: `payment-${r.id}`, date: r.paid_at, job_id: r.job_id, job_title: r.job_title,
    customer: customerName(r), invoice_number: r.invoice_number, method: r.method, reference: r.reference,
    amount: r.amount,
  }));

  const transactions = [...invoiceTx, ...paymentTx].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const summary = {
    total_invoiced: +invoiceTx.reduce((s, t) => s + t.amount, 0).toFixed(2),
    total_collected: +paymentTx.reduce((s, t) => s + t.amount, 0).toFixed(2),
    outstanding: +invoiceTx.reduce((s, t) => s + t.balance, 0).toFixed(2),
  };

  if (!canSeePrices(req.user)) {
    return res.json({
      transactions: transactions.map((t) => ({ ...t, amount: null, balance: null })),
      summary: { total_invoiced: null, total_collected: null, outstanding: null },
      price_hidden: true,
    });
  }
  res.json({ transactions, summary });
});

module.exports = router;
