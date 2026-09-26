// Hatch-style campaigns (Sept 2026; extended later that month to actually send, then again to
// offer a built-in multi-touch sequence library) — see db.js's CREATE TABLE campaigns/
// campaign_enrollments/campaign_steps and automationEngine.js's hasActiveCampaign() for why this
// table exists: it's the explicit, visible switch that unlocks auto-texting/auto-email once a
// business has actually set one up, rather than every seeded automation being able to reach a
// real customer from the moment Twilio/Gmail get connected.
//
// A campaign is created one of two ways:
//   - from a template_key (see campaignTemplates.js) — its steps are copied into campaign_steps
//     right away, and campaignEngine.js drips them out day by day, mixing sms/email per step.
//   - the older, plain way — a single message/channel/times_per_day/duration_days, still exactly
//     as it worked before the template library existed, for a rep who just wants one quick
//     recurring blurb rather than a whole authored sequence.
// A campaign never has both; campaignEngine.js tells them apart by whether campaign_steps has
// any rows for it. See campaignEngine.js for the actual sending, and customerMessages.js's
// contact-enrollment endpoints (mounted alongside Conversations) for the "Add to campaign"
// control on a conversation thread.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { getCompanyProfile } = require('../companyProfile');
const { CATEGORIES, TEMPLATES, getTemplate } = require('../campaignTemplates');

const router = express.Router();

const VALID_STATUSES = ['active', 'paused'];
const VALID_CHANNELS = ['sms', 'email', 'both'];
const VALID_AUDIENCES = ['lead', 'opportunity'];

function withTemplateName(row) {
  if (!row) return row;
  const t = row.template_key ? getTemplate(row.template_key) : null;
  return { ...row, template_name: t ? t.name : null };
}

function campaignRow(id) {
  const row = db.prepare(`
    SELECT c.*, u.username AS created_by_username,
      (SELECT COUNT(*) FROM campaign_enrollments e WHERE e.campaign_id = c.id AND e.status = 'active') AS active_enrollment_count,
      (SELECT COUNT(*) FROM campaign_steps s WHERE s.campaign_id = c.id) AS step_count
    FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id WHERE c.id = ?
  `).get(id);
  return withTemplateName(row);
}

// The business's own name, for the create/edit form to show what a message actually gets signed
// with (see campaignEngine.js's automatic greeting/signature) — same source the Estimate/Invoice
// documents already use for their company info.
router.get('/company-name', (req, res) => {
  res.json({ name: getCompanyProfile().name });
});

// The built-in sequence library — grouped by category — for the "Start from a template" picker.
// Full step content is included so the create form can show a live preview before saving.
router.get('/templates', (req, res) => {
  res.json({ categories: CATEGORIES, templates: TEMPLATES });
});

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username AS created_by_username,
      (SELECT COUNT(*) FROM campaign_enrollments e WHERE e.campaign_id = c.id AND e.status = 'active') AS active_enrollment_count,
      (SELECT COUNT(*) FROM campaign_steps s WHERE s.campaign_id = c.id) AS step_count
    FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows.map(withTemplateName));
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const notes = req.body.notes || null;
  const audience = req.body.audience || 'lead';
  if (!VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: `audience must be one of ${VALID_AUDIENCES.join(', ')}` });

  const templateKey = req.body.template_key || null;
  if (templateKey) {
    const template = getTemplate(templateKey);
    if (!template) return res.status(400).json({ error: `unknown template_key ${templateKey}` });
    const customLink = (req.body.custom_link || '').trim() || null;
    if (template.needsLink && !customLink) {
      return res.status(400).json({ error: 'this template needs a link — pass custom_link' });
    }
    const durationDays = Math.max(...template.steps.map((s) => s.day_offset)) + 1;
    const result = db.prepare(`
      INSERT INTO campaigns (name, notes, status, channel, audience, times_per_day, duration_days, custom_link, template_key, created_by_user_id)
      VALUES (?, ?, 'active', 'both', ?, 1, ?, ?, ?, ?)
    `).run(name, notes, audience, durationDays, customLink, templateKey, req.user.id);
    const campaignId = result.lastInsertRowid;
    const insertStep = db.prepare(`
      INSERT INTO campaign_steps (campaign_id, step_order, day_offset, channel, subject, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    template.steps.forEach((s, i) => {
      insertStep.run(campaignId, i, s.day_offset, s.channel, s.subject || null, s.message);
    });
    return res.status(201).json(campaignRow(campaignId));
  }

  // The older, plain single-message campaign — unchanged from before the template library.
  const message = req.body.message || null;
  const channel = req.body.channel || 'sms';
  if (!VALID_CHANNELS.includes(channel)) return res.status(400).json({ error: `channel must be one of ${VALID_CHANNELS.join(', ')}` });
  const timesPerDay = Math.max(1, Number(req.body.times_per_day) || 1);
  const durationDays = Math.max(1, Number(req.body.duration_days) || 7);
  const result = db.prepare(`
    INSERT INTO campaigns (name, notes, status, message, channel, audience, times_per_day, duration_days, created_by_user_id)
    VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `).run(name, notes, message, channel, audience, timesPerDay, durationDays, req.user.id);
  res.status(201).json(campaignRow(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (req.body.status !== undefined && !VALID_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  if (req.body.channel !== undefined && !VALID_CHANNELS.includes(req.body.channel)) {
    return res.status(400).json({ error: `channel must be one of ${VALID_CHANNELS.join(', ')}` });
  }
  if (req.body.audience !== undefined && !VALID_AUDIENCES.includes(req.body.audience)) {
    return res.status(400).json({ error: `audience must be one of ${VALID_AUDIENCES.join(', ')}` });
  }
  const merged = {
    name: req.body.name !== undefined ? req.body.name.trim() : existing.name,
    notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
    status: req.body.status !== undefined ? req.body.status : existing.status,
    message: req.body.message !== undefined ? req.body.message : existing.message,
    channel: req.body.channel !== undefined ? req.body.channel : existing.channel,
    audience: req.body.audience !== undefined ? req.body.audience : existing.audience,
    times_per_day: req.body.times_per_day !== undefined ? Math.max(1, Number(req.body.times_per_day) || 1) : existing.times_per_day,
    duration_days: req.body.duration_days !== undefined ? Math.max(1, Number(req.body.duration_days) || 1) : existing.duration_days,
    // A sequence campaign (built from a template) can still have its link corrected after the
    // fact — e.g. a rep pastes the real review-site link in once the business's profile is set
    // up — without needing to recreate the whole campaign.
    custom_link: req.body.custom_link !== undefined ? (req.body.custom_link || null) : existing.custom_link,
  };
  db.prepare(`
    UPDATE campaigns SET name=?, notes=?, status=?, message=?, channel=?, audience=?, times_per_day=?, duration_days=?, custom_link=? WHERE id=?
  `).run(merged.name, merged.notes, merged.status, merged.message, merged.channel, merged.audience, merged.times_per_day, merged.duration_days, merged.custom_link, req.params.id);
  res.json(campaignRow(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(req.params.id); // cascades to campaign_enrollments and campaign_steps
  res.status(204).end();
});

// A sequence campaign's steps, in send order — for the Campaigns page's "View sequence" detail,
// and for anyone double-checking exactly what a rep is about to enroll a contact into.
router.get('/:id/steps', (req, res) => {
  const rows = db.prepare(`SELECT * FROM campaign_steps WHERE campaign_id = ? ORDER BY step_order ASC`).all(req.params.id);
  res.json(rows);
});

// Every campaign a given contact is (or has been) enrolled in — for the "Add to campaign"
// control on that contact's Conversations thread, so it can show what they're currently in and
// only offer campaigns they aren't already actively part of.
router.get('/contact/:contactId', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, c.name AS campaign_name
    FROM campaign_enrollments e JOIN campaigns c ON c.id = e.campaign_id
    WHERE e.contact_id = ? ORDER BY e.enrolled_at DESC
  `).all(req.params.contactId);
  res.json(rows);
});

// Who's currently (or previously) enrolled in this campaign, for the Campaigns page's own detail
// view — newest first, contact name joined in for display.
router.get('/:id/enrollments', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, c.first_name, c.last_name
    FROM campaign_enrollments e JOIN contacts c ON c.id = e.contact_id
    WHERE e.campaign_id = ? ORDER BY e.enrolled_at DESC
  `).all(req.params.id);
  res.json(rows.map((r) => ({ ...r, contact_name: `${r.first_name} ${r.last_name}` })));
});

// Enroll one contact — always a deliberate, per-contact action (the "Add to campaign" control on
// a Conversations thread), never an automatic segment rule. A contact already actively enrolled
// in this same campaign isn't re-enrolled (their existing progress/schedule is left alone).
router.post('/:id/enroll', (req, res) => {
  const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'campaign not found' });
  const contactId = Number(req.body.contact_id);
  const contact = contactId ? db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(contactId) : null;
  if (!contact) return res.status(400).json({ error: 'contact_id is required' });
  const already = db.prepare(`SELECT * FROM campaign_enrollments WHERE campaign_id = ? AND contact_id = ? AND status = 'active'`).get(req.params.id, contactId);
  if (already) return res.status(200).json(already);
  const result = db.prepare(`
    INSERT INTO campaign_enrollments (campaign_id, contact_id, enrolled_by_user_id) VALUES (?, ?, ?)
  `).run(req.params.id, contactId, req.user.id);
  logActivity('contact', contactId, 'automation', `Added to campaign "${campaign.name}" by ${req.user.username}.`);
  const row = db.prepare(`SELECT * FROM campaign_enrollments WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(row);
});

// Manually stop an enrollment — the rep pulling someone out of a campaign before it's run its
// course (as opposed to it completing/stopping on its own — see campaignEngine.js).
router.delete('/enrollments/:enrollmentId', (req, res) => {
  const existing = db.prepare(`SELECT * FROM campaign_enrollments WHERE id = ?`).get(req.params.enrollmentId);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE campaign_enrollments SET status = 'stopped', stopped_reason = 'removed by a rep' WHERE id = ?`).run(req.params.enrollmentId);
  res.status(204).end();
});

module.exports = router;
