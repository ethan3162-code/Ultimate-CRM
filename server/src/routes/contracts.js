// Contracts library (Sept 2026) — lets an admin create and edit the actual Terms & Conditions /
// Agreement text that prints at the bottom of an estimate/invoice, instead of that text being
// fixed in a file (see helpers.js's getContractForEstimate for how one gets picked for a given
// estimate, and db.js's one-time seed for the real "Agreement & Limited Warranty" contract the
// user provided). Each contract stores its clauses as a JSON array of [heading, body] pairs so
// the PDF/web view can print bold numbered sub-headings, same shape the old termsText.js used.
const express = require('express');
const db = require('../db');
const { getSetting, setSetting } = require('../settings');
const { getPermissions } = require('../auth');

const router = express.Router();

// Mutating routes (create/update/delete/set-default/signature upload) need real edit access to
// the Contracts page specifically — reading the list (to pick one on an estimate) does not, see
// index.js's mount comment.
function requireEdit(req, res, next) {
  const level = getPermissions(req.user).contracts || 'none';
  if (level !== 'edit') return res.status(403).json({ error: "your account doesn't have edit access to this" });
  next();
}

// Company signature/stamp (Sept 2026) — an image of the business's actual pen signature or
// company stamp, stored as a data URL in the generic settings table (same pattern the customer's
// own drawn e-signature already uses on estimates — see estimates.signature_data_url). Shown
// alongside the customer's signature at the bottom of a signed estimate/invoice (see pdf.js and
// EstimateApproval.jsx/InvoiceView.jsx). Routes defined ahead of the /:id routes below so
// "company-signature" is never matched as a contract id.
router.get('/company-signature', (req, res) => {
  res.json({ data_url: getSetting('company_signature_data_url') || null });
});
router.put('/company-signature', requireEdit, (req, res) => {
  const dataUrl = (req.body.data_url || '').trim();
  setSetting('company_signature_data_url', dataUrl || '');
  res.json({ data_url: dataUrl || null });
});

function parseContract(row) {
  let clauses = [];
  try { clauses = JSON.parse(row.clauses || '[]'); } catch { clauses = []; }
  return {
    id: row.id, name: row.name, heading: row.heading, intro: row.intro, clauses,
    is_default_residential: !!row.is_default_residential, is_default_commercial: !!row.is_default_commercial,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function cleanClauses(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((c) => Array.isArray(c) ? [String(c[0] || '').trim(), String(c[1] || '').trim()] : null)
    .filter((c) => c && (c[0] || c[1]));
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM contracts ORDER BY name COLLATE NOCASE`).all();
  res.json(rows.map(parseContract));
});

router.post('/', requireEdit, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'a name is required' });
  const heading = (req.body.heading || 'AGREEMENT & LIMITED WARRANTY').trim();
  const intro = req.body.intro || '';
  const clauses = cleanClauses(req.body.clauses);
  const result = db.prepare(`
    INSERT INTO contracts (name, heading, intro, clauses) VALUES (?,?,?,?)
  `).run(name, heading, intro, JSON.stringify(clauses));
  res.status(201).json(parseContract(db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(result.lastInsertRowid)));
});

router.patch('/:id', requireEdit, (req, res) => {
  const existing = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const name = req.body.name !== undefined ? req.body.name.trim() : existing.name;
  if (!name) return res.status(400).json({ error: 'a name is required' });
  const heading = req.body.heading !== undefined ? req.body.heading.trim() : existing.heading;
  const intro = req.body.intro !== undefined ? req.body.intro : existing.intro;
  const clauses = req.body.clauses !== undefined ? JSON.stringify(cleanClauses(req.body.clauses)) : existing.clauses;
  db.prepare(`UPDATE contracts SET name = ?, heading = ?, intro = ?, clauses = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name, heading, intro, clauses, existing.id);
  res.json(parseContract(db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(existing.id)));
});

// Marks this contract the default for one customer type — at most one contract can hold each
// flag, so this clears it from whichever contract had it before setting it here.
router.post('/:id/set-default', requireEdit, (req, res) => {
  const existing = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const customerType = req.body.customer_type === 'Commercial' ? 'Commercial' : 'Residential';
  const col = customerType === 'Commercial' ? 'is_default_commercial' : 'is_default_residential';
  db.prepare(`UPDATE contracts SET ${col} = 0`).run();
  db.prepare(`UPDATE contracts SET ${col} = 1, updated_at = datetime('now') WHERE id = ?`).run(existing.id);
  res.json(parseContract(db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(existing.id)));
});

router.delete('/:id', requireEdit, (req, res) => {
  const existing = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.is_default_residential || existing.is_default_commercial) {
    return res.status(400).json({ error: 'this is the default contract for a customer type — make another one the default first' });
  }
  db.prepare(`DELETE FROM contracts WHERE id = ?`).run(existing.id);
  res.json({ ok: true });
});

module.exports = router;

