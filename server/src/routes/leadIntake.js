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

// The actual lead-capture logic, factored out so both the public webhook below and in-process
// callers (the AnswerForce email poller, see leadInbox.js) share one path rather than looping
// parsed data back through an HTTP request to this same server. Returns { contact, deal } or
// { error } — never throws for an ordinary validation failure.
function ingestLead(body) {
  body = body || {};
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
  // AnswerForce-parity extras (Sept 2026) — optional, land straight in the same Lead-detail
  // fields the Salesforce path above already uses; nothing here changes behavior for callers
  // that don't send them (they default to null/'Residential', same as before this was added).
  const workType = body.work_type || null;
  const leadType = body.lead_type || null;
  const customerType = body.customer_type || 'Residential';
  const projectDescription = body.project_description || null;
  const preferredCallbackTime = body.preferred_callback_time || null;
  const preferredConsultTime = body.preferred_consult_time || null;

  if (!email && !phone && !first) {
    return { error: 'at least a name, email, or phone is required' };
  }

  // Match an existing contact by its external record first (so a Salesforce edit updates the
  // same contact instead of forking one), then fall back to email/phone for sources that don't
  // send a stable external id.
  let contact = null;
  if (externalId) contact = db.prepare(`SELECT * FROM contacts WHERE external_id = ? AND external_source = ?`).get(externalId, externalSource);
  if (!contact && email) contact = db.prepare(`SELECT * FROM contacts WHERE email = ?`).get(email);
  if (!contact && phone) contact = db.prepare(`SELECT * FROM contacts WHERE phone = ?`).get(phone);
  // Last resort: no email and no usable phone at all (common for an AnswerForce call once its
  // own toll-free routing number is filtered out of the phone field — see answerForceParser's
  // isTollFreeNumber). Rather than spin up a brand-new contact for every such call, match an
  // existing one by name so the same repeat caller doesn't pile up duplicate contact records.
  // (first_name/last_name are never actually NULL below — a missing one is stored as 'New'/'Lead',
  // so the fallback compares against those same defaults.)
  if (!contact && !email && !phone && first) {
    contact = db.prepare(`SELECT * FROM contacts WHERE first_name = ? AND last_name = ? COLLATE NOCASE`).get(first, last || 'Lead');
  }

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
    // Just the person's name — the source is already its own column (and shown elsewhere in the
    // UI), so it doesn't need to be baked into the deal title/lead name too.
    const dealTitle = `${first || contact.first_name} ${last || contact.last_name}`.trim();
    const dealResult = db.prepare(`
      INSERT INTO deals (
        contact_id, company_id, title, value, stage, probability, source, method_of_entry,
        lead_owner, job_timeframe, lead_notes, external_source, external_id,
        work_type, lead_type, customer_type, project_description, preferred_callback_time, preferred_consult_time
      )
      VALUES (?,?,?,?, 'new', 20, ?,?,?,?,?,?,?, ?,?,?,?,?,?)
    `).run(
      contact.id, companyId, dealTitle, value, source, methodOfEntry,
      leadOwner, jobTimeframe, leadNotes, externalSource, externalId,
      workType, leadType, customerType, projectDescription, preferredCallbackTime, preferredConsultTime
    );
    deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(dealResult.lastInsertRowid);

    const noteParts = [`New lead via "${source}".`];
    if (message) noteParts.push(`Message: ${message}`);
    logActivity('deal', deal.id, 'note', noteParts.join(' '));

    fireTrigger('deal_created', {
      related_type: 'deal', related_id: deal.id,
      title: deal.title, value: deal.value, stage: deal.stage,
      deal_id: deal.id,
      contact_id: contact.id,
      contact_name: `${contact.first_name} ${contact.last_name}`.trim(),
      contact_email: contact.email,
      contact_phone: contact.mobile_phone || contact.phone || null,
      source,
    });
  }

  return { contact, deal };
}

router.post('/intake', (req, res) => {
  const providedKey = req.query.key || req.get('X-Webhook-Key');
  const secret = getOrCreateWebhookSecret();
  if (!providedKey || providedKey !== secret) {
    return res.status(401).json({ error: 'invalid or missing webhook key' });
  }

  const result = ingestLead(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ contact_id: result.contact.id, deal_id: result.deal.id });
});

module.exports = router;
module.exports.ingestLead = ingestLead;
