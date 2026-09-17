const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const db = require('./db'); // ensures schema is created
const { getInvoiceFull } = require('./helpers');
const { fireTrigger } = require('./automationEngine');
const { readSession, requireAuth, requirePage, requireAnyPage, requireAdmin } = require('./auth');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(readSession); // populates req.user from the session cookie when present; never blocks

// Logins — /api/session (login/logout/me) is intentionally public; login is how you get a
// session in the first place, and logout/me each check req.user internally.
app.use('/api/session', require('./routes/session'));
// User accounts & role permission modes — admin only.
app.use('/api/users', requireAuth, requireAdmin, require('./routes/users'));

app.use('/api/companies', requireAuth, requirePage('companies'), require('./routes/companies'));
app.use('/api/contacts', requireAuth, requirePage('contacts'), require('./routes/contacts'));
// Deals covers both the Leads and Opportunities pages (one table, no separate Lead object —
// see the Leads/Opportunities/Projects design note), so access follows whichever of the two a
// role can reach.
app.use('/api/deals', requireAuth, requireAnyPage(['leads', 'pipeline']), require('./routes/deals'));
app.use('/api/jobs', requireAuth, requirePage('jobs'), require('./routes/jobs'));
app.use('/api/dashboard', requireAuth, requirePage('dashboard'), require('./routes/dashboard'));
app.use('/api/automations', requireAuth, requirePage('automations'), require('./routes/automations'));
app.use('/api/tickets', requireAuth, requirePage('tickets'), require('./routes/tickets'));
app.use('/api/insights', requireAuth, requirePage('dashboard'), require('./routes/insights'));
// AI draft assistant — used from both Tickets and Deals; it only generates text, so any signed-in
// user can use it rather than tying it to one page's permission level.
app.use('/api/ai', requireAuth, require('./routes/ai'));
app.use('/api/appointments', requireAuth, requirePage('calendar'), require('./routes/appointments'));
// Google Calendar OAuth connect/disconnect lives on the admin-only Integrations page.
app.use('/api/auth', requireAuth, requirePage('integrations'), require('./routes/auth'));
app.use('/api/catalog-items', requireAuth, requirePage('items'), require('./routes/catalogItems'));
app.use('/api/reports', requireAuth, requirePage('dashboard'), require('./routes/reports'));
// External lead-capture webhook — no session, it authenticates with its own `key` secret.
app.use('/api/leads', require('./routes/leadIntake'));
app.use('/api/integrations', requireAuth, requirePage('integrations'), require('./routes/integrations'));
// Lightweight tasks attach to any record type; not worth gating per related record, so just
// requires being signed in.
app.use('/api/tasks', requireAuth, require('./routes/tasks'));
// Customer-facing signed-estimate flow — no login, a customer reaches this from an emailed link.
app.use('/api/public', require('./routes/public'));

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
