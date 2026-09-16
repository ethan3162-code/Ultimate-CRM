const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');

const router = express.Router();

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

// Deterministic deal score (Salesforce/HubSpot-style lead scoring, no ML) — a plain
// 0-100 number plus a Hot/Warm/Cool label, so reps can tell at a glance what to work
// next. Inputs: sales-set probability, deal size, whether the lead has an attributed
// source, and how long it's been since anything happened on the deal.
function scoreDeal(deal, lastActivityAt) {
  if (deal.stage === 'won') return { score: 100, label: 'Won' };
  if (deal.stage === 'lost') return { score: 0, label: 'Lost' };
  let score = Number(deal.probability) || 0;
  if (deal.value >= 50000) score += 15;
  else if (deal.value >= 20000) score += 8;
  else if (deal.value >= 5000) score += 3;
  if (deal.source) score += 5;
  const referenceDate = lastActivityAt || deal.updated_at || deal.created_at;
  const daysSince = referenceDate ? Math.floor((Date.now() - new Date(referenceDate.replace(' ', 'T') + 'Z').getTime()) / 86400000) : 0;
  if (daysSince > 14) score -= 20;
  else if (daysSince > 7) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cool';
  return { score, label, days_since_activity: daysSince };
}

function withScore(deal) {
  const lastActivity = db.prepare(`SELECT MAX(created_at) AS d FROM activities WHERE related_type = 'deal' AND related_id = ?`).get(deal.id).d;
  return { ...deal, ...scoreDeal(deal, lastActivity) };
}

// Customer info shown on the pipeline (Joist/Salesforce-style): prefer the
// linked contact's own phone/address, and fall back to the company's when the
// contact doesn't have one set.
function withCustomerInfo(deal) {
  return {
    ...deal,
    customer_phone: deal.contact_phone || deal.company_phone || null,
    customer_address: deal.contact_address || deal.company_address || null,
  };
}

const DEAL_SELECT = `
  SELECT d.*, c.first_name, c.last_name, c.phone AS contact_phone, c.address AS contact_address,
         co.name AS company_name, co.phone AS company_phone, co.address AS company_address
  FROM deals d
  LEFT JOIN contacts c ON c.id = d.contact_id
  LEFT JOIN companies co ON co.id = d.company_id
`;

router.get('/', (req, res) => {
  const rows = db.prepare(`${DEAL_SELECT} ORDER BY d.updated_at DESC`).all();
  res.json(rows.map(withCustomerInfo).map(withScore));
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
  const dealContact = deal.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(deal.contact_id) : null;
  fireTrigger('deal_created', {
    related_type: 'deal', related_id: deal.id,
    title: deal.title, value: deal.value, stage: deal.stage,
    deal_id: deal.id,
    contact_name: dealContact ? `${dealContact.first_name} ${dealContact.last_name}` : null,
    contact_email: dealContact ? dealContact.email : null,
    source: deal.source || null,
  });
  res.status(201).json(deal);
});

router.get('/:id', (req, res) => {
  const deal = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'not found' });
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'deal' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ ...withScore(withCustomerInfo(deal)), activities });
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
    const contact = updates.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(updates.contact_id) : null;
    const company = updates.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(updates.company_id) : null;
    fireTrigger('deal_stage_changed', {
      related_type: 'deal', related_id: existing.id,
      dedupe_id: `${existing.id}:${req.body.stage}`,
      title: updates.title, value: updates.value, from_stage: existing.stage, to_stage: req.body.stage,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
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
