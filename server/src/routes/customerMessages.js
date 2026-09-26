// Customer-facing texting (Sept 2026) — a Hatch-style "unified inbox" of one thread per contact.
// Outbound texts go out for real once Twilio is configured (see sms.js); inbound replies are
// always rep-logged by hand (the user chose "a rep logs what the customer said" over pulling
// replies from a live inbox automatically). Mounted with requirePage('contacts') in index.js —
// this is customer data, gated the same as the Contacts page itself.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const sms = require('../sms');

const router = express.Router();

function contactPhone(contact) {
  return contact ? (contact.mobile_phone || contact.phone || null) : null;
}

// One row per contact that has at least one message, newest thread first. "needs_reply" is true
// when the thread's most recent message is inbound — a lightweight stand-in for an unread badge
// that needs no separate read-state table, since this is a shared team inbox, not a per-login one.
//
// "status" (Sept 2026, Hatch-style Leads/Opportunities split) — a contact still has a deal in the
// 'new' stage is a Lead; one with a deal past that (qualified/proposal/negotiation) is an
// Opportunity; a 'new'-stage deal wins the tie if a contact somehow has both (an unqualified
// inquiry still needs attention first). A contact with no open deal at all (won/lost only, or no
// deal ever) gets null — the "All" tab still shows them, they just don't sort into either split.
router.get('/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS contact_id, c.first_name, c.last_name, c.phone, c.mobile_phone,
           (SELECT body FROM customer_messages m WHERE m.contact_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT direction FROM customer_messages m WHERE m.contact_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_direction,
           (SELECT created_at FROM customer_messages m WHERE m.contact_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
           EXISTS (SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.stage = 'new') AS has_lead,
           EXISTS (SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.stage IN ('qualified','proposal','negotiation')) AS has_opportunity
    FROM contacts c
    WHERE EXISTS (SELECT 1 FROM customer_messages m WHERE m.contact_id = c.id)
    ORDER BY last_at DESC
  `).all();
  res.json(rows.map((r) => ({
    contact_id: r.contact_id,
    name: `${r.first_name} ${r.last_name}`,
    phone: r.mobile_phone || r.phone || null,
    last_message: r.last_body,
    last_at: r.last_at,
    needs_reply: r.last_direction === 'inbound',
    status: r.has_lead ? 'lead' : r.has_opportunity ? 'opportunity' : null,
  })));
});

// Contacts with a phone number on file, for the "start a new conversation" picker — includes
// people with no thread yet, unlike /conversations above.
router.get('/contacts', (req, res) => {
  const rows = db.prepare(`
    SELECT id, first_name, last_name, phone, mobile_phone FROM contacts
    WHERE (phone IS NOT NULL AND phone != '') OR (mobile_phone IS NOT NULL AND mobile_phone != '')
    ORDER BY first_name, last_name
  `).all();
  res.json(rows.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, phone: contactPhone(c) })));
});

router.get('/contact/:contactId', (req, res) => {
  const contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(req.params.contactId);
  if (!contact) return res.status(404).json({ error: 'contact not found' });
  const messages = db.prepare(`
    SELECT m.*, u.username AS created_by_username FROM customer_messages m
    LEFT JOIN users u ON u.id = m.created_by_user_id
    WHERE m.contact_id = ? ORDER BY m.id ASC
  `).all(req.params.contactId);
  res.json({
    contact: { id: contact.id, name: `${contact.first_name} ${contact.last_name}`, phone: contactPhone(contact) },
    messages,
  });
});

// Send a real outbound text (best-effort via Twilio — see sms.js; the row is created either way
// so the thread always shows what was actually attempted, and "Not delivered — Twilio isn't
// connected yet" reads honestly rather than pretending the text went out).
router.post('/contact/:contactId', async (req, res) => {
  const contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(req.params.contactId);
  if (!contact) return res.status(404).json({ error: 'contact not found' });
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'message body is required' });
  const phone = contactPhone(contact);
  const result = await sms.sendSms({ to: phone, body });
  const status = result.sent ? 'sent' : (sms.isConfigured() ? 'failed' : 'simulated');
  const insert = db.prepare(`
    INSERT INTO customer_messages (contact_id, direction, channel, body, status, created_by_user_id)
    VALUES (?, 'outbound', 'sms', ?, ?, ?)
  `).run(contact.id, body, status, req.user.id);
  logActivity('contact', contact.id, 'sms', `Texted ${contact.first_name} ${contact.last_name}: ${body}`);
  const row = db.prepare(`
    SELECT m.*, u.username AS created_by_username FROM customer_messages m LEFT JOIN users u ON u.id = m.created_by_user_id WHERE m.id = ?
  `).get(insert.lastInsertRowid);
  if (!result.sent && sms.isConfigured()) return res.status(201).json({ ...row, delivery_error: result.reason });
  res.status(201).json(row);
});

// A rep logging what the customer said back — never an automated pull from a real inbox.
router.post('/contact/:contactId/log-inbound', (req, res) => {
  const contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(req.params.contactId);
  if (!contact) return res.status(404).json({ error: 'contact not found' });
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'message body is required' });
  const insert = db.prepare(`
    INSERT INTO customer_messages (contact_id, direction, channel, body, status, created_by_user_id)
    VALUES (?, 'inbound', 'sms', ?, 'logged', ?)
  `).run(contact.id, body, req.user.id);
  logActivity('contact', contact.id, 'sms', `${contact.first_name} ${contact.last_name} replied: ${body}`);
  const row = db.prepare(`
    SELECT m.*, u.username AS created_by_username FROM customer_messages m LEFT JOIN users u ON u.id = m.created_by_user_id WHERE m.id = ?
  `).get(insert.lastInsertRowid);
  res.status(201).json(row);
});

module.exports = router;
