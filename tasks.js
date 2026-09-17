// Lightweight "next step" tasks attached to any record (contact, deal, job, ticket) —
// HubSpot/monday.com-style, kept deliberately simple: a title, an optional due date, done or not.
const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { related_type, related_id, open } = req.query;
  let sql = `SELECT * FROM tasks WHERE 1=1`;
  const args = [];
  if (related_type) { sql += ` AND related_type = ?`; args.push(related_type); }
  if (related_id) { sql += ` AND related_id = ?`; args.push(related_id); }
  if (open === '1') { sql += ` AND done = 0`; }
  sql += ` ORDER BY (due_date IS NULL), due_date ASC, created_at DESC`;
  res.json(db.prepare(sql).all(...args));
});

router.post('/', (req, res) => {
  const { related_type, related_id, title, due_date } = req.body;
  if (!related_type || !related_id) return res.status(400).json({ error: 'related_type and related_id are required' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(`INSERT INTO tasks (related_type, related_id, title, due_date) VALUES (?,?,?,?)`)
    .run(related_type, related_id, title.trim(), due_date || null);
  res.status(201).json(db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updates = { ...existing, ...req.body };
  db.prepare(`UPDATE tasks SET title=?, due_date=?, done=?, updated_at=datetime('now') WHERE id=?`)
    .run(updates.title, updates.due_date, updates.done ? 1 : 0, req.params.id);
  res.json(db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

module.exports = router;
