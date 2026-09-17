const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');

const router = express.Router();

// Joins in the assigned Owner and the created/last-modified-by logins (Salesforce Contact
// parity's "About"/"History" panels) alongside the existing company join.
const CONTACT_SELECT = `
  SELECT ct.*, co.name AS company_name,
         ou.username AS owner_username, ou.role AS owner_role,
         cu.username AS created_by_username,
         uu.username AS updated_by_username
  FROM contacts ct
  LEFT JOIN companies co ON co.id = ct.company_id
  LEFT JOIN users ou ON ou.id = ct.owner_user_id
  LEFT JOIN users cu ON cu.id = ct.created_by_user_id
  LEFT JOIN users uu ON uu.id = ct.updated_by_user_id
`;

router.get('/', (req, res) => {
  const rows = db.prepare(`${CONTACT_SELECT} ORDER BY ct.first_name`).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { company_id, first_name, last_name, email, phone, mobile_phone, title, address, source, owner_user_id } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });
  const result = db.prepare(`
    INSERT INTO contacts (company_id, first_name, last_name, email, phone, mobile_phone, title, address, source, owner_user_id, created_by_user_id, updated_by_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    company_id || null, first_name, last_name, email || null, phone || null, mobile_phone || null, title || null, address || null, source || null,
    owner_user_id || null, req.user.id, req.user.id
  );
  const contact = db.prepare(`${CONTACT_SELECT} WHERE ct.id = ?`).get(result.lastInsertRowid);
  logActivity('contact', contact.id, 'note', `Contact "${contact.first_name} ${contact.last_name}" created.`);
  res.status(201).json(contact);
});

router.get('/:id', (req, res) => {
  const contact = db.prepare(`${CONTACT_SELECT} WHERE ct.id = ?`).get(req.params.id);
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

  // "Method of entry" is derived read-only from this contact's most recently created linked
  // deal, rather than a second, separately-edited copy of the field — same one-source-of-truth
  // pattern Job detail already uses for service type/lead source from its linked opportunity.
  const method_of_entry = (deals.find((d) => d.method_of_entry) || {}).method_of_entry || null;

  res.json({ ...contact, deals, jobs, tickets, activities, method_of_entry });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updates = { ...existing, ...req.body };
  db.prepare(`
    UPDATE contacts SET
      company_id=?, first_name=?, last_name=?, email=?, phone=?, mobile_phone=?, title=?, address=?, source=?, owner_user_id=?,
      updated_by_user_id=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    updates.company_id, updates.first_name, updates.last_name, updates.email, updates.phone, updates.mobile_phone, updates.title, updates.address,
    updates.source, updates.owner_user_id || null,
    req.user.id, req.params.id
  );
  res.json(db.prepare(`${CONTACT_SELECT} WHERE ct.id = ?`).get(req.params.id));
});

module.exports = router;
