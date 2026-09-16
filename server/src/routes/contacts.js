const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT ct.*, co.name AS company_name
    FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
    ORDER BY ct.first_name
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { company_id, first_name, last_name, email, phone, title, address, source } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });
  const result = db.prepare(`INSERT INTO contacts (company_id, first_name, last_name, email, phone, title, address, source) VALUES (?,?,?,?,?,?,?,?)`)
    .run(company_id || null, first_name, last_name, email || null, phone || null, title || null, address || null, source || null);
  const contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('contact', contact.id, 'note', `Contact "${contact.first_name} ${contact.last_name}" created.`);
  res.status(201).json(contact);
});

router.get('/:id', (req, res) => {
  const contact = db.prepare(`
    SELECT ct.*, co.name AS company_name FROM contacts ct
    LEFT JOIN companies co ON co.id = ct.company_id WHERE ct.id = ?
  `).get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'not found' });
  const deals = db.prepare(`SELECT * FROM deals WHERE contact_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const jobs = db.prepare(`SELECT * FROM jobs WHERE contact_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const tickets = db.prepare(`SELECT * FROM tickets WHERE contact_id = ? ORDER BY created_at DESC`).all(req.params.id);

  const dealIds = deals.map(d => d.id);
  const jobIds = jobs.map(j => j.id);
  const ticketIds = tickets.map(t => t.id);
  const placeholders = (arr) => arr.length ? arr.map(() => '?').join(',') : 'NULL';
  const activities = db.prepare(`
    SELECT * FROM activities
    WHERE (related_type = 'contact' AND related_id = ?)
       OR (related_type = 'deal' AND related_id IN (${placeholders(dealIds)}))
       OR (related_type = 'job' AND related_id IN (${placeholders(jobIds)}))
       OR (related_type = 'ticket' AND related_id IN (${placeholders(ticketIds)}))
    ORDER BY created_at DESC
  `).all(req.params.id, ...dealIds, ...jobIds, ...ticketIds);

  res.json({ ...contact, deals, jobs, tickets, activities });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updates = { ...existing, ...req.body };
  db.prepare(`UPDATE contacts SET company_id=?, first_name=?, last_name=?, email=?, phone=?, title=?, address=?, source=? WHERE id=?`)
    .run(updates.company_id, updates.first_name, updates.last_name, updates.email, updates.phone, updates.title, updates.address, updates.source, req.params.id);
  res.json(db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(req.params.id));
});

module.exports = router;
