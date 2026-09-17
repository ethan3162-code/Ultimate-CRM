// Generic lead-capture webhook. Point a website contact form, a Zapier/Make automation
// (Facebook Lead Ads, Google Forms, HomeAdvisor, Angi, ...), or a Salesforce Flow's HTTP Callout
// action at POST /api/leads/intake?key=<secret> and it creates a Contact + a "New" deal, so
// leads from anywhere land straight in the pipeline. The secret comes from the Integrations page
// and can be regenerated there at any time.
//
// Salesforce parity (Sept 2026): pass `external_id` (the Salesforce record's 15/18-char Id) and
// `external_source: "salesforce"` so a Flow that also fires on Lead/Contact *edit* (not just
// create) updates the existing record here instead of creating a duplicate every time a field
// changes over there.
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
  const mobilePhone = body.mobile_phone || null;
  const title = body.title || body.job_title || null;
  const address = body.address || body.mailing_address || null;
  const message = body.message || body.notes || body.comment || null;
  const source = body.source || 'Webhook';
  const companyName = body.company || body.company_name || null;
  const value = Number(body.value || body.estimated_value || 0) || 0;
  const externalId = body.external_id || null;
  const externalSource = body.external_source || (externalId ? 'external' : null);
  // Salesforce-parity extras — all optional, all pass straight through to fields this app
  // already has (see the Sept 2026 Lead-detail/Contact-parity passes).
  const methodOfEntry = body.method_of_entry || (externalSource === 'salesforce' ? 'Salesforce' : null);
  const leadOwner = body.lead_owner || body.owner_name || null;
  const jobTimeframe = body.job_timeframe || null;
  const leadNotes = body.lead_notes || null;

  if (!email && !phone && !first) {
    return res.status(400).json({ error: 'at least a name, email, or phone is required' });
  }

  // Match an existing contact by its external record first (so a Salesforce edit updates the
  // same contact instead of forking one), then fall back to email/phone for sources that don't
  // send a stable external id.
  let contact = null;
  if (externalId) contact = db.prepare(`SELECT * FROM contacts WHERE external_id = ? AND external_source = ?`).get(externalId, externalSource);
  if (!contact && email) contact = db.prepare(`SELECT * FROM contacts WHERE email = ?`).get(email);
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
      INSERT INTO contacts (company_id, first_name, last_name, email, phone, mobile_phone, title, address, source, external_source, external_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(companyId, first || 'New', last || 'Lead', email, phone, mobilePhone, title, address, source, externalSource, externalId);
    contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(result.lastInsertRowid);
    logActivity('contact', contact.id, 'note', `Contact created from a "${source}" lead.`);
  } else {
    // Re-sync: an edit in the source system (e.g. Salesforce) can re-fire this webhook for a
    // contact we already have — refresh whichever fields it sent rather than creating a
    // duplicate, without clobbering anything the source didn't send.
    db.prepare(`
      UPDATE contacts SET
        email = COALESCE(?, email), phone = COALESCE(?, phone), mobile_phone = COALESCE(?, mobile_phone),
        title = COALESCE(?, title), address = COALESCE(?, address),
        external_source = COALESCE(external_source, ?), external_id = COALESCE(external_id, ?),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(email, phone, mobilePhone, title, address, externalSource, externalId, contact.id);
    contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(contact.id);
  }

  // A re-fire for a lead we already created (same external_id) updates that deal's notes
  // instead of opening a second one for the same Salesforce Lead.
  let deal = externalId ? db.prepare(`SELECT * FROM deals WHERE external_id = ? AND external_source = ?`).get(externalId, externalSource) : null;

  if (deal) {
    logActivity('deal', deal.id, 'note', `Updated via "${source}" re-sync.${message ? ` Message: ${message}` : ''}`);
  } else {
    const dealTitle = `${first || contact.first_name} ${last || contact.last_name}`.trim() + ` — ${source}`;
    const dealResult = db.prepare(`
      INSERT INTO deals (contact_id, company_id, title, value, stage, probability, source, method_of_entry, lead_owner, job_timeframe, lead_notes, external_source, external_id)
      VALUES (?,?,?,?, 'new', 20, ?,?,?,?,?,?,?)
    `).run(contact.id, companyId, dealTitle, value, source, methodOfEntry, leadOwner, jobTimeframe, leadNotes, externalSource, externalId);
    deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(dealResult.lastInsertRowid);

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
  }

  res.status(201).json({ contact_id: contact.id, deal_id: deal.id });
});

module.exports = router;
