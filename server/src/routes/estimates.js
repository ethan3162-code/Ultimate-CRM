// Company-wide Estimates page (Sept 2026) — the pipeline the user described is Lead ->
// Appointment -> Opportunity -> Estimate -> (customer signs) -> Invoice + Project created
// automatically, so an estimate needs to exist as its own thing you can create and see BEFORE any
// project does — not just as a card buried inside a project that doesn't exist yet. This is a
// read-only rollup (every estimate, whether it's still against an Opportunity or has already
// graduated to a Project — see db.js's migrateEstimatesJobOptional) plus the one genuinely new
// action, creating an estimate against an Opportunity. It follows the same split the Transactions
// page already uses: this router only lists/creates, and every other estimate action (send,
// approve/reject, convert to invoice, request a deposit) stays with the Project it applies to in
// jobs.js, unchanged.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { getEstimateFull, redactEstimateMoney, logActivity, readDisplayFlags, saveEstimateScheduleRows } = require('../helpers');
const { canSeePrices } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT e.id,
           j.title AS job_title, j.contact_id AS job_contact_id, j.company_id AS job_company_id, j.address AS job_address,
           d.title AS deal_title, d.contact_id AS deal_contact_id, d.company_id AS deal_company_id,
           jc.first_name AS job_contact_first, jc.last_name AS job_contact_last, jc.phone AS job_contact_phone, jc.address AS job_contact_address,
           jco.name AS job_company_name, jco.phone AS job_company_phone, jco.address AS job_company_address,
           dc.first_name AS deal_contact_first, dc.last_name AS deal_contact_last, dc.phone AS deal_contact_phone, dc.address AS deal_contact_address,
           dco.name AS deal_company_name, dco.phone AS deal_company_phone, dco.address AS deal_company_address
    FROM estimates e
    LEFT JOIN jobs j ON j.id = e.job_id
    LEFT JOIN deals d ON d.id = e.deal_id
    LEFT JOIN contacts jc ON jc.id = j.contact_id
    LEFT JOIN companies jco ON jco.id = j.company_id
    LEFT JOIN contacts dc ON dc.id = d.contact_id
    LEFT JOIN companies dco ON dco.id = d.company_id
    ORDER BY e.created_at DESC
  `).all();

  const hidePrices = !canSeePrices(req.user);
  const out = rows.map((r) => {
    const full = getEstimateFull(r.id);
    const estimate = hidePrices ? redactEstimateMoney(full) : full;
    // Whichever side this estimate is anchored to right now (job once signed/converted, deal
    // before that) supplies the "account" fields the same way Leads/Opportunities/Projects'
    // list pages already read them (see client/src/utils.js's accountName()), plus a link target
    // for the row.
    const onJob = !!estimate.job_id;
    // Whether an invoice already exists for this estimate — the Estimates page uses this to tell
    // "signed, still needs Convert to invoice" apart from "signed and already invoiced" so it
    // never offers a button that would generate a second, duplicate invoice for the same estimate.
    const hasInvoice = !!db.prepare(`SELECT 1 FROM invoices WHERE estimate_id = ? LIMIT 1`).get(estimate.id);
    // Address/phone for the compact Joist-style row (Sept 2026) — contact's own info first, the
    // company's as a fallback, same preference order resolveEstimateParty() uses elsewhere.
    const address = onJob
      ? (r.job_contact_address || r.job_company_address || r.job_address || null)
      : (r.deal_contact_address || r.deal_company_address || null);
    const phone = onJob ? (r.job_contact_phone || r.job_company_phone || null) : (r.deal_contact_phone || r.deal_company_phone || null);
    return {
      ...estimate,
      first_name: onJob ? r.job_contact_first : r.deal_contact_first,
      last_name: onJob ? r.job_contact_last : r.deal_contact_last,
      company_name: onJob ? r.job_company_name : r.deal_company_name,
      linked_type: onJob ? 'project' : (r.deal_title ? 'opportunity' : null),
      linked_id: onJob ? estimate.job_id : estimate.deal_id,
      linked_title: onJob ? r.job_title : r.deal_title,
      linked_address: address,
      linked_phone: phone,
      has_invoice: hasInvoice,
    };
  });
  res.json(out);
});

// Creates a new estimate against an Opportunity — no project needed yet. Everything else
// (line items, tax rate, deposit percent, the customer sign link) works exactly like an estimate
// created from a Project page; it just doesn't get a job_id until the customer signs (see
// routes/public.js's /estimates/:token/sign, which creates the Project + first invoice at that
// point) or someone later converts it manually.
router.post('/', (req, res) => {
  const { deal_id, number, tax_rate, markup_percent, discount_type, discount_value, deposit_percent, items, contract_id, payment_schedule } = req.body;
  if (!deal_id) return res.status(400).json({ error: 'an opportunity is required' });
  const deal = db.prepare(`SELECT id, title FROM deals WHERE id = ?`).get(deal_id);
  if (!deal) return res.status(404).json({ error: 'opportunity not found' });
  if (!items || !items.length) return res.status(400).json({ error: 'at least one line item is required' });

  const count = db.prepare(`SELECT COUNT(*) c FROM estimates`).get().c;
  const signToken = crypto.randomBytes(12).toString('hex');
  const flags = readDisplayFlags(req.body);
  const result = db.prepare(`
    INSERT INTO estimates (job_id, deal_id, number, status, tax_rate, markup_percent, discount_type, discount_value, deposit_percent, sign_token, created_by_user_id, show_rate, show_qty, show_item_total, contract_id)
    VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    deal.id, number || `EST-${1000 + count + 1}`, 'draft', tax_rate || 0, markup_percent || 0, discount_type || null, discount_value || 0,
    deposit_percent || 0, signToken, req.user ? req.user.id : null,
    flags.show_rate, flags.show_qty, flags.show_item_total, contract_id || null
  );
  const estimateId = result.lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO estimate_items (estimate_id, description, notes, qty, unit_price) VALUES (?,?,?,?,?)`)
      .run(estimateId, it.description, it.notes || null, it.qty, it.unit_price);
  }
  saveEstimateScheduleRows(estimateId, payment_schedule);
  logActivity('deal', deal.id, 'estimate', `Estimate ${number || ''} created for "${deal.title}".`);

  // getEstimateFull already resolves requires_internal_approval from created_by_user_id (see
  // helpers.js) — same internal-approval gate a job-anchored estimate gets.
  const full = getEstimateFull(estimateId);
  res.status(201).json(canSeePrices(req.user) ? full : redactEstimateMoney(full));
});

module.exports = router;
