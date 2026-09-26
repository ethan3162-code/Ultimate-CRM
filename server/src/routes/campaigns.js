// Hatch-style campaigns (Sept 2026) — see db.js's CREATE TABLE campaigns and
// automationEngine.js's hasActiveCampaign() for why this table exists: it's the explicit,
// visible switch that unlocks auto-texting/auto-email once a business has actually set one up,
// rather than every seeded automation being able to reach a real customer from the moment
// Twilio/Gmail get connected.
const express = require('express');
const db = require('../db');

const router = express.Router();

const VALID_STATUSES = ['active', 'paused'];

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username AS created_by_username
    FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const notes = req.body.notes || null;
  const result = db.prepare(`
    INSERT INTO campaigns (name, notes, status, created_by_user_id) VALUES (?, ?, 'active', ?)
  `).run(name, notes, req.user.id);
  const row = db.prepare(`
    SELECT c.*, u.username AS created_by_username FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (req.body.status !== undefined && !VALID_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  const merged = {
    name: req.body.name !== undefined ? req.body.name.trim() : existing.name,
    notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
    status: req.body.status !== undefined ? req.body.status : existing.status,
  };
  db.prepare(`UPDATE campaigns SET name=?, notes=?, status=? WHERE id=?`).run(merged.name, merged.notes, merged.status, req.params.id);
  const row = db.prepare(`
    SELECT c.*, u.username AS created_by_username FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id WHERE c.id = ?
  `).get(req.params.id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

module.exports = router;
