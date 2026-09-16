const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');

const router = express.Router();

const SLA_HOURS = { urgent: 4, high: 24, medium: 72, low: 168 };
const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function slaDueAt(priority) {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.medium;
  return db.prepare(`SELECT datetime('now', ?) AS d`).get(`+${hours} hours`).d;
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, c.first_name, c.last_name, co.name AS company_name
    FROM tickets t
    LEFT JOIN contacts c ON c.id = t.contact_id
    LEFT JOIN companies co ON co.id = t.company_id
    ORDER BY (t.status IN ('resolved','closed')), t.sla_due_at ASC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { contact_id, company_id, job_id, subject, description, priority } = req.body;
  if (!subject) return res.status(400).json({ error: 'subject is required' });
  const p = PRIORITIES.includes(priority) ? priority : 'medium';
  const result = db.prepare(`
    INSERT INTO tickets (contact_id, company_id, job_id, subject, description, priority, sla_due_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(contact_id || null, company_id || null, job_id || null, subject, description || null, p, slaDueAt(p));
  const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('ticket', ticket.id, 'note', `Ticket "${ticket.subject}" opened (${p} priority).`);

  const contact = contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(contact_id) : null;
  fireTrigger('ticket_created', {
    related_type: 'ticket', related_id: ticket.id,
    subject: ticket.subject, priority: p,
    contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
  });
  res.status(201).json(ticket);
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, c.first_name, c.last_name, co.name AS company_name
    FROM tickets t
    LEFT JOIN contacts c ON c.id = t.contact_id
    LEFT JOIN companies co ON co.id = t.company_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'ticket' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...ticket, activities });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (req.body.status && !STATUSES.includes(req.body.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  if (req.body.priority && !PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: `priority must be one of ${PRIORITIES.join(', ')}` });

  const updates = { ...existing, ...req.body };
  const newSlaDue = req.body.priority && req.body.priority !== existing.priority ? slaDueAt(req.body.priority) : existing.sla_due_at;
  const isResolving = req.body.status && ['resolved', 'closed'].includes(req.body.status) && !['resolved', 'closed'].includes(existing.status);
  const resolvedAt = isResolving ? db.prepare(`SELECT datetime('now') AS d`).get().d : existing.resolved_at;
  const satisfaction = req.body.satisfaction_score !== undefined ? req.body.satisfaction_score : existing.satisfaction_score;

  db.prepare(`
    UPDATE tickets SET subject=?, description=?, status=?, priority=?, sla_due_at=?, resolved_at=?, satisfaction_score=? WHERE id=?
  `).run(updates.subject, updates.description, updates.status, updates.priority, newSlaDue, resolvedAt, satisfaction, req.params.id);

  if (req.body.status && req.body.status !== existing.status) {
    logActivity('ticket', existing.id, 'status_change', `Ticket status changed from "${existing.status}" to "${req.body.status}".`);
  }
  if (isResolving) {
    const contact = existing.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(existing.contact_id) : null;
    fireTrigger('ticket_resolved', {
      related_type: 'ticket', related_id: existing.id,
      dedupe_id: `ticket-resolved:${existing.id}`,
      subject: updates.subject, satisfaction_score: satisfaction,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    });
  }
  res.json(db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(req.params.id));
});

router.post('/:id/activities', (req, res) => {
  const { note, type } = req.body;
  if (!note) return res.status(400).json({ error: 'note is required' });
  logActivity('ticket', req.params.id, type || 'note', note);
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'ticket' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.status(201).json(activities);
});

module.exports = router;
