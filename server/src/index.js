const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const db = require('./db'); // ensures schema is created
const { getInvoiceFull } = require('./helpers');
const { fireTrigger } = require('./automationEngine');
const leadInbox = require('./leadInbox');
const subcontractorCompliance = require('./subcontractorCompliance');
const vehicleCompliance = require('./vehicleCompliance');
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
// Reusable, stackable permission-template "Roles" — admin only.
app.use('/api/roles', requireAuth, requireAdmin, require('./routes/roles'));
// A read-only, non-admin directory of active logins (id/username/role label only) — any signed-in
// user can look this up, so e.g. a salesperson can assign a real login as a Contact/Lead/
// Opportunity "Owner" without needing admin access to the full Users & permissions page.
app.use('/api/directory', requireAuth, require('./routes/directory'));

app.use('/api/companies', requireAuth, requirePage('companies'), require('./routes/companies'));
app.use('/api/contacts', requireAuth, requirePage('contacts'), require('./routes/contacts'));
// Deals covers both the Leads and Opportunities pages (one table, no separate Lead object —
// see the Leads/Opportunities/Projects design note), so access follows whichever of the two a
// role can reach.
app.use('/api/deals', requireAuth, requireAnyPage(['leads', 'pipeline']), require('./routes/deals'));
app.use('/api/jobs', requireAuth, requirePage('jobs'), require('./routes/jobs'));
app.use('/api/estimates', requireAuth, requirePage('estimates'), require('./routes/estimates'));
// Contracts library (the Terms & Conditions/Agreement text attached to estimates/invoices) plus
// the company signature/stamp image. Not gated by requirePage here — anyone creating an estimate
// needs to at least READ the list to pick a contract, even without edit access to the Contracts
// page itself (the common case: a salesperson can use contracts but not manage them). Editing
// (create/update/delete/set-default) is checked per-route inside routes/contracts.js instead,
// against the 'contracts' permission specifically.
app.use('/api/contracts', requireAuth, require('./routes/contracts'));
app.use('/api/transactions', requireAuth, requirePage('transactions'), require('./routes/transactions'));
app.use('/api/dashboard', requireAuth, requirePage('dashboard'), require('./routes/dashboard'));
app.use('/api/automations', requireAuth, requirePage('automations'), require('./routes/automations'));
app.use('/api/tickets', requireAuth, requirePage('tickets'), require('./routes/tickets'));
app.use('/api/insights', requireAuth, requirePage('dashboard'), require('./routes/insights'));
// AI draft assistant — used from both Tickets and Deals; it only generates text, so any signed-in
// user can use it rather than tying it to one page's permission level.
app.use('/api/ai', requireAuth, require('./routes/ai'));
app.use('/api/appointments', requireAuth, requirePage('calendar'), require('./routes/appointments'));
// Google Calendar OAuth connect/disconnect. The company-wide connection is admin-only (checked
// inside routes/auth.js, same effective restriction the old requirePage('integrations') gate
// gave); every signed-in user can also connect their OWN personal calendar here regardless of
// their Integrations permission, since that's a personal action, not a company-wide setting.
app.use('/api/auth', requireAuth, require('./routes/auth'));
// Gated by requireAnyPage rather than a single requirePage, since one shared table serves two
// permissions now (Items = calculator materials, Price book = sales items) — see
// routes/catalogItems.js for the finer per-row filtering by which kind of item it is.
app.use('/api/catalog-items', requireAuth, requireAnyPage(['items', 'price_book']), require('./routes/catalogItems'));
app.use('/api/reports', requireAuth, requirePage('dashboard'), require('./routes/reports'));
app.use('/api/custom-reports', requireAuth, requirePage('reports'), require('./routes/customReports'));
// Fixed "built-in" reports (Sept 2026) — the old Dashboard reports-grid cards, now their own
// pages under /reports. Reachable from either the Dashboard or the (admin-only) Reports page, so
// it's gated on having access to either rather than tying it to just one.
app.use('/api/builtin-reports', requireAuth, requireAnyPage(['dashboard', 'reports']), require('./routes/builtinReports'));
app.use('/api/employees', requireAuth, requirePage('employees'), require('./routes/employees'));
app.use('/api/subcontractors', requireAuth, requirePage('subcontractors'), require('./routes/subcontractors'));
app.use('/api/vehicles', requireAuth, requirePage('vehicles'), require('./routes/vehicles'));
// Global search across every record type — no single-page gate; it filters each category
// internally by that category's own permission (see search.js), same as a dashboard rollup would.
app.use('/api/search', requireAuth, require('./routes/search'));
// External lead-capture webhook — no session, it authenticates with its own `key` secret.
app.use('/api/leads', require('./routes/leadIntake'));
app.use('/api/integrations', requireAuth, requirePage('integrations'), require('./routes/integrations'));
// Lightweight tasks attach to any record type; not worth gating per related record, so just
// requires being signed in.
app.use('/api/tasks', requireAuth, require('./routes/tasks'));
// Internal team chat (Sept 2026) — every active login can use it regardless of their individual
// page permissions, same reasoning as tasks/directory above.
app.use('/api/chat', requireAuth, require('./routes/chat'));
// Customer-facing texting (Sept 2026, Hatch-style) — gated by the Contacts permission since a
// customer's phone thread is customer data, same as the Contacts page itself.
app.use('/api/customer-messages', requireAuth, requirePage('contacts'), require('./routes/customerMessages'));
// Customer-facing signed-estimate flow — no login, a customer reaches this from an emailed link.
app.use('/api/public', require('./routes/public'));
// Salesman commission payout report — not gated by requirePage; visibility is the personal
// canSeeCommissions capability (or being the salesperson on a job), same as commission figures
// on the Project page itself, checked inside the route.
app.use('/api/commissions', requireAuth, require('./routes/commissions'));

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

// --- Periodic check: nudge customers who haven't signed/approved an estimate after N days ---
// ("Estimate follow-up", Hatch-style auto-response #2.) A draft estimate with no signature yet
// is "awaiting the customer" — this app has no separate "sent" step (the rep shares the approval
// link directly), so draft-and-unsigned is the closest proxy for "still waiting to hear back."
function checkStaleEstimates() {
  const candidates = db.prepare(`SELECT * FROM estimates WHERE status = 'draft' AND signed_at IS NULL`).all();
  for (const est of candidates) {
    const daysSince = Math.floor((Date.now() - new Date(est.created_at.replace(' ', 'T') + 'Z').getTime()) / 86400000);
    if (daysSince < 1) continue;
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(est.job_id);
    if (!job) continue;
    const contact = job.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, mobile_phone FROM contacts WHERE id = ?`).get(job.contact_id) : null;
    fireTrigger('estimate_stale', {
      related_type: 'job', related_id: job.id,
      dedupe_id: `estimate-stale:${est.id}`,
      job_id: job.id, deal_id: job.deal_id || null, contact_id: job.contact_id || null,
      title: job.title, number: est.number, days_since_sent: daysSince,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
      contact_phone: contact ? (contact.mobile_phone || contact.phone) : null,
    });
  }
}
checkStaleEstimates();
setInterval(checkStaleEstimates, 60_000);

// --- Periodic check: re-engage a lead that's gone quiet ---
// ("Re-engage a stale/old lead", Hatch-style auto-response #4.) Unlike the checks above this is
// allowed to fire more than once per record — a lead can go quiet again after a first nudge — so
// the dedupe key includes the current calendar week, capping it at once per week per deal rather
// than once ever.
function checkStaleLeads() {
  const candidates = db.prepare(`SELECT * FROM deals WHERE stage NOT IN ('won', 'lost')`).all();
  const weekBucket = Math.floor(Date.now() / (7 * 86400000));
  for (const deal of candidates) {
    const reference = deal.updated_at || deal.created_at;
    const daysIdle = Math.floor((Date.now() - new Date(reference.replace(' ', 'T') + 'Z').getTime()) / 86400000);
    if (daysIdle < 1) continue;
    const contact = deal.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, mobile_phone FROM contacts WHERE id = ?`).get(deal.contact_id) : null;
    fireTrigger('deal_stale', {
      related_type: 'deal', related_id: deal.id,
      dedupe_id: `deal-stale:${deal.id}:${weekBucket}`,
      deal_id: deal.id, contact_id: deal.contact_id || null,
      title: deal.title, days_idle: daysIdle,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
      contact_phone: contact ? (contact.mobile_phone || contact.phone) : null,
    });
  }
}
checkStaleLeads();
setInterval(checkStaleLeads, 60_000);

// --- Periodic check: pull new leads out of AnswerForce's call-notification emails ---
// (Sept 2026 — "build it into the CRM directly" over a Zapier Email Parser or a native
// AnswerForce webhook, per the user's choice.) A no-op, silently, until GMAIL_USER/
// GMAIL_APP_PASSWORD are set (same credentials outbound automation email already uses — see
// mailer.js and the Integrations page's Gmail card). See leadInbox.js for the actual polling.
async function checkAnswerForceInbox() {
  if (!leadInbox.isConfigured()) return;
  await leadInbox.pollAnswerForceInbox();
}
checkAnswerForceInbox();
setInterval(checkAnswerForceInbox, 60_000);

// --- Periodic check: subcontractor compliance documents (insurance, license, ...) nearing or
// past expiry — emails the office, never the subcontractor (that's a manual one-click send from
// the Subcontractors page). Expiry doesn't move minute to minute, so this runs far less often
// than the leads checks above; its own re-notify throttle (subcontractorCompliance.js) keeps a
// still-expired document from re-emailing on every tick regardless.
async function checkSubcontractorDocs() {
  try { await subcontractorCompliance.checkExpiringDocuments(); } catch (err) { console.error('[subcontractorCompliance] check failed:', err.message); }
}
checkSubcontractorDocs();
setInterval(checkSubcontractorDocs, 6 * 60 * 60_000);

// --- Periodic check: vehicle registration/insurance/inspection documents nearing or past expiry
// — same pattern as the subcontractor check above, office-only (see vehicleCompliance.js). ---
async function checkVehicleDocs() {
  try { await vehicleCompliance.checkExpiringDocuments(); } catch (err) { console.error('[vehicleCompliance] check failed:', err.message); }
}
checkVehicleDocs();
setInterval(checkVehicleDocs, 6 * 60 * 60_000);

// Serve the built React client in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Ultimate CRM server listening on http://localhost:${PORT}`));
