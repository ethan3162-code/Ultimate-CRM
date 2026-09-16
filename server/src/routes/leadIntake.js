// Generic lead-capture webhook. Point a website contact form, or a Zapier/Make
// automation (Facebook Lead Ads, Google Forms, HomeAdvisor, Angi, etc.) at
// POST /api/leads/intake?key=<secret> and it creates a Contact + a "New" deal,
// so leads from anywhere land straight in the pipeline. The secret comes from
// the Integrations page and can be regenerated there at any time.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');
const { getOrCreateWebhookSecret } = require('../settings');

const router = express.Router();

function splitName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { first: 'New', last: 'Lead' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

router.post('/intake', (req, res) => {
  const providedKey = req.query.key || req.get('X-Webhook-Key');
  const secret = getOrCreateWebhookSecret();
  if (!providedKey || providedKey !== secret) {
    return res.status(401).json({ error: 'invalid or missing webhook key' });
  }

  const body = req.body || {};
  const name = body.name || [body.first_name, body.last_name].filter(Boolean).join(' ');
  const { first, last } = body.first_name || body.last_name
    ? { first: body.first_name || '', last: body.last_name || '' }
    : splitName(name);
  const email = body.email || null;
  const phone = body.phone || null;
  const message = body.message || body.notes || body.comment || null;
  const source = body.source || 'Webhook';
  const companyName = body.company || body.company_name || null;
  const value = Number(body.value || body.estimated_value || 0) || 0;

  if (!email && !phone && !first) {
    return res.status(400).json({ error: 'at least a name, email, or phone is required' });
  }

  // Match an existing contact by email or phone before creating a new one, so the same
  // lead re-submitting a form doesn't fork into duplicate contact records.
  let contact = null;
  if (email) contact = db.prepare(`SELECT * FROM contacts WHERE email = ?`).get(email);
  if (!contact && phone) contact = db.prepare(`SELECT * FROM contacts WHERE phone = ?`).get(phone);

  let companyId = null;
  if (companyName) {
    let company = db.prepare(`SELECT * FROM companies WHERE name = ?`).get(companyName);
    if (!company) {
      const result = db.prepare(`INSERT INTO companies (name) VALUES (?)`).run(companyName);
      company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(result.lastInsertRowid);
    }
    companyId = company.id;
  }

  if (!contact) {
    const result = db.prepare(`
      INSERT INTO contacts (company_id, first_name, last_name, email, phone, source)
      VALUES (?,?,?,?,?,?)
    `).run(companyId, first || 'New', last || 'Lead', email, phone, source);
    contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(result.lastInsertRowid);
    logActivity('contact', contact.id, 'note', `Contact created from a "${source}" lead.`);
  }

  const dealTitle = `${first || contact.first_name} ${last || contact.last_name}`.trim() + ` — ${source}`;
  const dealResult = db.prepare(`
    INSERT INTO deals (contact_id, company_id, title, value, stage, probability, source)
    VALUES (?,?,?,?, 'new', 20, ?)
  `).run(contact.id, companyId, dealTitle, value, source);
  const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(dealResult.lastInsertRowid);

  const noteParts = [`New lead via "${source}".`];
  if (message) noteParts.push(`Message: ${message}`);
  logActivity('deal', deal.id, 'note', noteParts.join(' '));

  fireTrigger('deal_created', {
    related_type: 'deal', related_id: deal.id,
    title: deal.title, value: deal.value, stage: deal.stage,
    deal_id: deal.id,
    contact_name: `${contact.first_name} ${contact.last_name}`.trim(),
    contact_email: contact.email,
    source,
  });

  res.status(201).json({ contact_id: contact.id, deal_id: deal.id });
});

module.exports = router;
