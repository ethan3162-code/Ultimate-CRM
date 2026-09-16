const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./db'); // ensures schema is created
const { getInvoiceFull } = require('./helpers');
const { fireTrigger } = require('./automationEngine');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/companies', require('./routes/companies'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/deals', require('./routes/deals'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/insights', require('./routes/insights'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/catalog-items', require('./routes/catalogItems'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/leads', require('./routes/leadIntake'));
app.use('/api/integrations', require('./routes/integrations'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Periodic check: mark invoices overdue and fire reminder automations ---
function checkOverdueInvoices() {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = db.prepare(`
    SELECT id FROM invoices WHERE status IN ('sent', 'partial', 'overdue') AND due_date IS NOT NULL AND due_date < ?
  `).all(today);
  for (const { id } of candidates) {
    const invoice = getInvoiceFull(id);
    if (!invoice || invoice.balance <= 0.001) continue;
    if (invoice.status !== 'overdue') {
      db.prepare(`UPDATE invoices SET status = 'overdue' WHERE id = ?`).run(id);
    }
    const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date + 'T00:00:00Z').getTime()) / 86400000);
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(invoice.job_id);
    const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(job.contact_id) : null;
    fireTrigger('invoice_overdue', {
      related_type: 'job', related_id: invoice.job_id,
      dedupe_id: `invoice-overdue:${invoice.id}`,
      number: invoice.number, total: invoice.total, balance: invoice.balance,
      days_overdue: daysOverdue, job_title: job?.title,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
    });
  }
}
checkOverdueInvoices();
setInterval(checkOverdueInvoices, 60_000);

// --- Periodic check: fire SLA-breach automations for open tickets past their due time ---
function checkOverdueTickets() {
  const nowIso = db.prepare(`SELECT datetime('now') AS d`).get().d;
  const candidates = db.prepare(`
    SELECT * FROM tickets WHERE status IN ('open', 'pending') AND sla_due_at IS NOT NULL AND sla_due_at < ?
  `).all(nowIso);
  for (const ticket of candidates) {
    const contact = ticket.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(ticket.contact_id) : null;
    fireTrigger('ticket_overdue', {
      related_type: 'ticket', related_id: ticket.id,
      dedupe_id: `ticket-overdue:${ticket.id}`,
      subject: ticket.subject, priority: ticket.priority,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
    });
  }
}
checkOverdueTickets();
setInterval(checkOverdueTickets, 60_000);

// Serve the built React client in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Ultimate CRM server listening on http://localhost:${PORT}`));
