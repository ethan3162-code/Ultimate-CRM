const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM contacts WHERE company_id = c.id) AS contact_count,
      (SELECT COUNT(*) FROM deals WHERE company_id = c.id) AS deal_count,
      (SELECT COALESCE(SUM(value),0) FROM deals WHERE company_id = c.id AND stage NOT IN ('won','lost')) AS open_pipeline_value
    FROM companies c ORDER BY c.name
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, industry, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(`INSERT INTO companies (name, industry, phone, email, address) VALUES (?,?,?,?,?)`)
    .run(name, industry || null, phone || null, email || null, address || null);
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('company', company.id, 'note', `Company "${company.name}" created.`);
  res.status(201).json(company);
});

router.get('/:id', (req, res) => {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id);
  if (!company) return res.status(404).json({ error: 'not found' });
  const contacts = db.prepare(`SELECT * FROM contacts WHERE company_id = ? ORDER BY first_name`).all(req.params.id);
  const deals = db.prepare(`SELECT * FROM deals WHERE company_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const jobs = db.prepare(`SELECT * FROM jobs WHERE company_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const tickets = db.prepare(`SELECT * FROM tickets WHERE company_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...company, contacts, deals, jobs, tickets });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const fields = ['name', 'industry', 'phone', 'email', 'address'];
  const updates = { ...existing, ...req.body };
  db.prepare(`UPDATE companies SET name=?, industry=?, phone=?, email=?, address=? WHERE id=?`)
    .run(updates.name, updates.industry, updates.phone, updates.email, updates.address, req.params.id);
  res.json(db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id));
});

module.exports = router;
