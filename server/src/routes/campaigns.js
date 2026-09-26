// Hatch-style campaigns (Sept 2026; extended later that month to actually send) — see db.js's
// CREATE TABLE campaigns/campaign_enrollments and automationEngine.js's hasActiveCampaign() for
// why this table exists: it's the explicit, visible switch that unlocks auto-texting/auto-email
// once a business has actually set one up, rather than every seeded automation being able to
// reach a real customer from the moment Twilio/Gmail get connected. A campaign now also owns its
// own drip message (message/channel/times_per_day/duration_days) that it sends to whichever
// contacts a rep enrolls in it — see campaignEngine.js for the actual sending, and
// customerMessages.js's contact-enrollment endpoints (mounted alongside Conversations) for the
// "Add to campaign" control on a conversation thread.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { getCompanyProfile } = require('../companyProfile');

const router = express.Router();

const VALID_STATUSES = ['active', 'paused'];
const VALID_CHANNELS = ['sms', 'email', 'both'];

function campaignRow(id) {
  return db.prepare(`
    SELECT c.*, u.username AS created_by_username,
      (SELECT COUNT(*) FROM campaign_enrollments e WHERE e.campaign_id = c.id AND e.status = 'active') AS active_enrollment_count
    FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id WHERE c.id = ?
  `).get(id);
}

// The business's own name, for the create/edit form to show what a message actually gets signed
// with (see campaignEngine.js's automatic greeting/signature) — same source the Estimate/Invoice
// documents already use for their company info.
router.get('/company-name', (req, res) => {
  res.json({ name: getCompanyProfile().name });
});

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username AS created_by_username,
      (SELECT COUNT(*) FROM campaign_enrollments e WHERE e.campaign_id = c.id AND e.status = 'active') AS active_enrollment_count
    FROM campaigns c LEFT JOIN users u ON u.id = c.created_by_user_id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const notes = req.body.notes || null;
  const message = req.body.message || null;
  const channel = req.body.channel || 'sms';
  if (!VALID_CHANNELS.includes(channel)) return res.status(400).json({ error: `channel must be one of ${VALID_CHANNELS.join(', ')}` });
  const timesPerDay = Math.max(1, Number(req.body.times_per_day) || 1);
  const durationDays = Math.max(1, Number(req.body.duration_days) || 7);
  const result = db.prepare(`
    INSERT INTO campaigns (name, notes, status, message, channel, times_per_day, duration_days, created_by_user_id)
    VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(name, notes, message, channel, timesPerDay, durationDays, req.user.id);
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
  const merged = {
    name: req.body.name !== undefined ? req.body.name.trim() : existing.name,
    notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
    status: req.body.status !== undefined ? req.body.status : existing.status,
    message: req.body.message !== undefined ? req.body.message : existing.message,
    channel: req.body.channel !== undefined ? req.body.channel : existing.channel,
    times_per_day: req.body.times_per_day !== undefined ? Math.max(1, Number(req.body.times_per_day) || 1) : existing.times_per_day,
    duration_days: req.body.duration_days !== undefined ? Math.max(1, Number(req.body.duration_days) || 1) : existing.duration_days,
  };
  db.prepare(`
    UPDATE campaigns SET name=?, notes=?, status=?, message=?, channel=?, times_per_day=?, duration_days=? WHERE id=?
  `).run(merged.name, merged.notes, merged.status, merged.message, merged.channel, merged.times_per_day, merged.duration_days, req.params.id);
  res.json(campaignRow(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(req.params.id); // cascades to campaign_enrollments
  res.status(204).end();
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
