const db = require('./db');
const { getInvoiceFull } = require('./helpers');

const STALE_DEAL_DAYS = 5;

function daysBetween(fromIso, toIso = null) {
  const from = new Date(fromIso.replace(' ', 'T') + 'Z');
  const to = toIso ? new Date(toIso.replace(' ', 'T') + 'Z') : new Date();
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/**
 * Deals that are open (not won/lost) and have had no logged activity in
 * STALE_DEAL_DAYS days — a lightweight, deterministic stand-in for "AI risk
 * scoring": no model call, just a rule anyone could audit.
 */
function stalledDeals() {
  const openDeals = db.prepare(`
    SELECT d.*, c.first_name, c.last_name, co.name AS company_name
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN companies co ON co.id = d.company_id
    WHERE d.stage NOT IN ('won', 'lost')
  `).all();

  const out = [];
  for (const deal of openDeals) {
    const lastActivity = db.prepare(`
      SELECT MAX(created_at) AS last FROM activities WHERE related_type = 'deal' AND related_id = ?
    `).get(deal.id).last;
    const referenceDate = lastActivity || deal.created_at;
    const idleDays = daysBetween(referenceDate);
    if (idleDays >= STALE_DEAL_DAYS) {
      out.push({
        id: deal.id, title: deal.title, stage: deal.stage, value: deal.value,
        contact_name: deal.first_name ? `${deal.first_name} ${deal.last_name}` : null,
        company_name: deal.company_name, idle_days: idleDays,
      });
    }
  }
  return out.sort((a, b) => b.idle_days - a.idle_days);
}

function overdueInvoices() {
  const ids = db.prepare(`SELECT id FROM invoices WHERE status IN ('sent', 'partial', 'overdue')`).all().map((r) => r.id);
  const out = [];
  for (const id of ids) {
    const inv = getInvoiceFull(id);
    if (!inv || inv.balance <= 0.001 || !inv.due_date) continue;
    if (inv.due_date < new Date().toISOString().slice(0, 10)) {
      const job = db.prepare(`SELECT title, contact_id FROM jobs WHERE id = ?`).get(inv.job_id);
      const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(job.contact_id) : null;
      out.push({
        id: inv.id, number: inv.number, job_id: inv.job_id, job_title: job?.title,
        balance: inv.balance, due_date: inv.due_date,
        days_overdue: daysBetween(inv.due_date + ' 00:00:00'),
        contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      });
    }
  }
  return out.sort((a, b) => b.days_overdue - a.days_overdue);
}

function overdueTickets() {
  const rows = db.prepare(`
    SELECT t.*, c.first_name, c.last_name FROM tickets t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.status IN ('open', 'pending') AND t.sla_due_at IS NOT NULL
  `).all();
  const nowIso = db.prepare(`SELECT datetime('now') AS d`).get().d;
  return rows
    .filter((t) => t.sla_due_at < nowIso)
    .map((t) => ({
      id: t.id, subject: t.subject, priority: t.priority,
      contact_name: t.first_name ? `${t.first_name} ${t.last_name}` : null,
      hours_overdue: Math.floor((new Date(nowIso.replace(' ', 'T') + 'Z') - new Date(t.sla_due_at.replace(' ', 'T') + 'Z')) / 3600000),
    }))
    .sort((a, b) => b.hours_overdue - a.hours_overdue);
}

function staleJobs() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT j.*, c.first_name, c.last_name FROM jobs j
    LEFT JOIN contacts c ON c.id = j.contact_id
    WHERE j.status = 'scheduled' AND j.scheduled_date IS NOT NULL AND j.scheduled_date < ?
  `).all(today);
  return rows.map((j) => ({
    id: j.id, title: j.title, scheduled_date: j.scheduled_date,
    contact_name: j.first_name ? `${j.first_name} ${j.last_name}` : null,
    days_past: daysBetween(j.scheduled_date + ' 00:00:00'),
  }));
}

function computeInsights() {
  return {
    stalledDeals: stalledDeals(),
    overdueInvoices: overdueInvoices(),
    overdueTickets: overdueTickets(),
    staleJobs: staleJobs(),
  };
}

module.exports = { computeInsights };
