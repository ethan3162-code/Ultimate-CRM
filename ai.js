const express = require('express');
const db = require('../db');
const { getInvoiceFull } = require('../helpers');
const { draftDealFollowUp, draftDealRecap, draftTicketReply, draftInvoiceReminder } = require('../aiDraft');

const router = express.Router();

function contactNameFor(contactId) {
  if (!contactId) return null;
  const c = db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(contactId);
  return c ? `${c.first_name} ${c.last_name}` : null;
}

router.post('/draft', (req, res) => {
  const { kind, id } = req.body;

  if (kind === 'deal_follow_up' || kind === 'deal_recap') {
    const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id);
    if (!deal) return res.status(404).json({ error: 'deal not found' });
    const lastActivity = db.prepare(`SELECT MAX(created_at) AS last FROM activities WHERE related_type = 'deal' AND related_id = ?`).get(id).last;
    const idleDays = lastActivity ? Math.floor((Date.now() - new Date(lastActivity.replace(' ', 'T') + 'Z').getTime()) / 86400000) : null;
    const ctx = {
      deal_id: deal.id, title: deal.title, stage: deal.stage, value: deal.value,
      contact_name: contactNameFor(deal.contact_id), idle_days: idleDays,
    };
    if (kind === 'deal_recap') {
      ctx.activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'deal' AND related_id = ? ORDER BY created_at DESC LIMIT 5`).all(id);
      return res.json(draftDealRecap(ctx));
    }
    return res.json(draftDealFollowUp(ctx));
  }

  if (kind === 'ticket_reply') {
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
    if (!ticket) return res.status(404).json({ error: 'ticket not found' });
    return res.json(draftTicketReply({
      ticket_id: ticket.id, subject: ticket.subject, description: ticket.description,
      priority: ticket.priority, contact_name: contactNameFor(ticket.contact_id),
    }));
  }

  if (kind === 'invoice_reminder') {
    const invoice = getInvoiceFull(id);
    if (!invoice) return res.status(404).json({ error: 'invoice not found' });
    const job = db.prepare(`SELECT contact_id FROM jobs WHERE id = ?`).get(invoice.job_id);
    return res.json(draftInvoiceReminder({
      invoice_id: invoice.id, number: invoice.number, balance: invoice.balance.toFixed(2),
      due_date: invoice.due_date, contact_name: contactNameFor(job?.contact_id),
    }));
  }

  return res.status(400).json({ error: 'unknown kind' });
});

module.exports = router;
