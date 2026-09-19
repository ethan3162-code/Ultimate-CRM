// Global search — one search bar across every record type in the CRM (leads, opportunities,
// contacts, companies, jobs, tickets, employees, subcontractors), grouped by type. Read-only, and
// deliberately conservative about permissions: a category is left out of the response entirely
// whenever this login's permission for that page is 'none', so a search never surfaces a record
// type the sidebar itself would hide from this person. Leads and Opportunities share one physical
// `deals` table (see the Leads/Opportunities/Projects design note) — split here by stage exactly
// the way Leads.jsx/Pipeline.jsx already split it, and each half is gated by its own page
// permission independently.
const express = require('express');
const db = require('../db');
const { getPermissions } = require('../auth');

const router = express.Router();

const LIMIT = 8;

// Escapes SQL LIKE wildcards in the user's own search text so a literal "%" or "_" they typed
// doesn't act as a wildcard, then wraps it for a substring match. Every query built with this
// must use `ESCAPE '\'` in its LIKE clauses.
function likePattern(q) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, groups: [] });
  const p = likePattern(q);
  const perms = getPermissions(req.user);
  const groups = [];

  // --- Leads & Opportunities (one `deals` table, split by stage) ---
  if (perms.leads !== 'none' || perms.pipeline !== 'none') {
    const rows = db.prepare(`
      SELECT d.id, d.title, d.stage, d.value
      FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN companies co ON co.id = d.company_id
      WHERE d.title LIKE ? ESCAPE '\\' OR c.first_name LIKE ? ESCAPE '\\' OR c.last_name LIKE ? ESCAPE '\\'
         OR co.name LIKE ? ESCAPE '\\' OR d.rep LIKE ? ESCAPE '\\' OR d.lead_owner LIKE ? ESCAPE '\\'
      ORDER BY d.updated_at DESC LIMIT 40
    `).all(p, p, p, p, p, p);
    if (perms.leads !== 'none') {
      const leadRows = rows.filter((d) => d.stage === 'new').slice(0, LIMIT);
      if (leadRows.length) groups.push({
        key: 'leads', label: 'Leads',
        results: leadRows.map((d) => ({ id: d.id, title: d.title, subtitle: 'New lead', path: `/pipeline/${d.id}` })),
      });
    }
    if (perms.pipeline !== 'none') {
      const oppRows = rows.filter((d) => d.stage !== 'new').slice(0, LIMIT);
      if (oppRows.length) groups.push({
        key: 'opportunities', label: 'Opportunities',
        results: oppRows.map((d) => ({ id: d.id, title: d.title, subtitle: d.stage.replace('_', ' '), path: `/pipeline/${d.id}` })),
      });
    }
  }

  // --- Contacts ---
  if (perms.contacts !== 'none') {
    const rows = db.prepare(`
      SELECT id, first_name, last_name, email, phone, title FROM contacts
      WHERE first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\'
         OR (first_name || ' ' || last_name) LIKE ? ESCAPE '\\'
         OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR mobile_phone LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC LIMIT ?
    `).all(p, p, p, p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'contacts', label: 'Contacts',
      results: rows.map((c) => ({
        id: c.id, title: `${c.first_name} ${c.last_name}`,
        subtitle: [c.title, c.email || c.phone].filter(Boolean).join(' · '),
        path: `/contacts/${c.id}`,
      })),
    });
  }

  // --- Companies ---
  if (perms.companies !== 'none') {
    const rows = db.prepare(`
      SELECT id, name, phone, email FROM companies
      WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC LIMIT ?
    `).all(p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'companies', label: 'Companies',
      results: rows.map((c) => ({ id: c.id, title: c.name, subtitle: c.phone || c.email || '', path: `/companies/${c.id}` })),
    });
  }

  // --- Projects (jobs) ---
  if (perms.jobs !== 'none') {
    const rows = db.prepare(`
      SELECT j.id, j.title, j.address, j.status FROM jobs j
      LEFT JOIN contacts c ON c.id = j.contact_id
      WHERE j.title LIKE ? ESCAPE '\\' OR j.address LIKE ? ESCAPE '\\'
         OR c.first_name LIKE ? ESCAPE '\\' OR c.last_name LIKE ? ESCAPE '\\'
      ORDER BY j.created_at DESC LIMIT ?
    `).all(p, p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'jobs', label: 'Projects',
      results: rows.map((j) => ({ id: j.id, title: j.title, subtitle: [j.status.replace('_', ' '), j.address].filter(Boolean).join(' · '), path: `/jobs/${j.id}` })),
    });
  }

  // --- Tickets ---
  if (perms.tickets !== 'none') {
    const rows = db.prepare(`
      SELECT t.id, t.subject, t.status, t.priority FROM tickets t
      LEFT JOIN contacts c ON c.id = t.contact_id
      WHERE t.subject LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\'
         OR c.first_name LIKE ? ESCAPE '\\' OR c.last_name LIKE ? ESCAPE '\\'
      ORDER BY t.created_at DESC LIMIT ?
    `).all(p, p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'tickets', label: 'Tickets',
      results: rows.map((t) => ({ id: t.id, title: t.subject, subtitle: `${t.status} · ${t.priority}`, path: `/tickets/${t.id}` })),
    });
  }

  // --- Employees ---
  if (perms.employees !== 'none') {
    const rows = db.prepare(`
      SELECT id, first_name, last_name, position, phone, email FROM employees
      WHERE first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\'
         OR (first_name || ' ' || last_name) LIKE ? ESCAPE '\\'
         OR position LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
      ORDER BY active DESC, first_name LIMIT ?
    `).all(p, p, p, p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'employees', label: 'Employees',
      results: rows.map((e) => ({ id: e.id, title: `${e.first_name} ${e.last_name}`, subtitle: e.position || '', path: `/employees/${e.id}` })),
    });
  }

  // --- Subcontractors ---
  if (perms.subcontractors !== 'none') {
    const rows = db.prepare(`
      SELECT id, name, trade, contact_name, phone, email FROM subcontractors
      WHERE name LIKE ? ESCAPE '\\' OR contact_name LIKE ? ESCAPE '\\'
         OR trade LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
      ORDER BY active DESC, name LIMIT ?
    `).all(p, p, p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'subcontractors', label: 'Subcontractors',
      results: rows.map((s) => ({ id: s.id, title: s.name, subtitle: s.trade || s.contact_name || '', path: `/subcontractors/${s.id}` })),
    });
  }

  // --- Vehicles ---
  if (perms.vehicles !== 'none') {
    const rows = db.prepare(`
      SELECT id, name, make, model, license_plate, vin FROM vehicles
      WHERE name LIKE ? ESCAPE '\\' OR make LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\'
         OR license_plate LIKE ? ESCAPE '\\' OR vin LIKE ? ESCAPE '\\'
      ORDER BY status = 'retired', name LIMIT ?
    `).all(p, p, p, p, p, LIMIT);
    if (rows.length) groups.push({
      key: 'vehicles', label: 'Vehicles',
      results: rows.map((v) => ({
        id: v.id, title: v.name,
        subtitle: [v.make, v.model].filter(Boolean).join(' ') || v.license_plate || '',
        path: `/vehicles/${v.id}`,
      })),
    });
  }

  res.json({ query: q, groups });
});

module.exports = router;
