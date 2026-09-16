const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');

const router = express.Router();

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.first_name, c.last_name, co.name AS company_name
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN companies co ON co.id = d.company_id
    ORDER BY d.updated_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { contact_id, company_id, title, value, stage, probability, expected_close } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(`
    INSERT INTO deals (contact_id, company_id, title, value, stage, probability, expected_close)
    VALUES (?,?,?,?,?,?,?)
  `).run(contact_id || null, company_id || null, title, value || 0, stage || 'new', probability ?? 20, expected_close || null);
  const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('deal', deal.id, 'note', `Deal "${deal.title}" created.`);
  fireTrigger('deal_created', {
    related_type: 'deal', related_id: deal.id,
    title: deal.title, value: deal.value, stage: deal.stage,
  });
  res.status(201).json(deal);
});

router.get('/:id', (req, res) => {
  const deal = db.prepare(`
    SELECT d.*, c.first_name, c.last_name, co.name AS company_name
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN companies co ON co.id = d.company_id
    WHERE d.id = ?
  `).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'not found' });
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'deal' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...deal, activities });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (req.body.stage && !STAGES.includes(req.body.stage)) {
    return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  }
  const updates = { ...existing, ...req.body };
  db.prepare(`
    UPDATE deals SET contact_id=?, company_id=?, title=?, value=?, stage=?, probability=?, expected_close=?, updated_at=datetime('now')
    WHERE id=?
  `).run(updates.contact_id, updates.company_id, updates.title, updates.value, updates.stage, updates.probability, updates.expected_close, req.params.id);

  if (req.body.stage && req.body.stage !== existing.stage) {
    logActivity('deal', existing.id, 'stage_change', `Stage moved from "${existing.stage}" to "${req.body.stage}".`);
    const contact = updates.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(updates.contact_id) : null;
    const company = updates.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(updates.company_id) : null;
    fireTrigger('deal_stage_changed', {
      related_type: 'deal', related_id: existing.id,
      dedupe_id: `${existing.id}:${req.body.stage}`,
      title: updates.title, value: updates.value, from_stage: existing.stage, to_stage: req.body.stage,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      company_name: company ? company.name : null,
      deal_id: existing.id,
    });
  }
  res.json(db.prepare(`SELECT * FROM deals WHERE id = ?`).get(req.params.id));
});

router.post('/:id/activities', (req, res) => {
  const { note, type } = req.body;
  if (!note) return res.status(400).json({ error: 'note is required' });
  logActivity('deal', req.params.id, type || 'note', note);
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'deal' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.status(201).json(activities);
});

module.exports = router;
