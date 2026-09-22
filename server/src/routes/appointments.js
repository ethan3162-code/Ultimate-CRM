const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');
const google = require('../google');
const notify = require('../notify');

const router = express.Router();

function withNames(row) {
  if (!row) return row;
  const contact = row.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(row.contact_id) : null;
  const company = row.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(row.company_id) : null;
  const job = row.job_id ? db.prepare(`SELECT title FROM jobs WHERE id = ?`).get(row.job_id) : null;
  const assignee = row.assigned_user_id ? db.prepare(`SELECT username FROM users WHERE id = ?`).get(row.assigned_user_id) : null;
  return {
    ...row,
    contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    company_name: company ? company.name : null,
    job_title: job ? job.title : null,
    assigned_username: assignee ? assignee.username : null,
  };
}

// Merge local appointments with events pulled live from the shared company Google Calendar (read
// side of the "two-way" sync): anything created directly in Google shows up here too, tagged
// source:'google'. This intentionally only ever reads the COMPANY calendar (google.COMPANY) — an
// assignee's own personal calendar (see "Per-user Google Calendar sync" below) is written to, not
// read back here, so this list never pulls in the private contents of someone's personal calendar.
router.get('/', async (req, res) => {
  const localRows = db.prepare(`SELECT * FROM appointments ORDER BY start_time ASC`).all().map(withNames);

  let googleOnly = [];
  const connected = Boolean(google.getStoredTokens(google.COMPANY));
  if (connected) {
    try {
      const events = await google.listEvents({}, google.COMPANY);
      const knownEventIds = new Set(localRows.filter((r) => r.google_event_id).map((r) => r.google_event_id));
      googleOnly = events
        .filter((ev) => ev.id && !knownEventIds.has(ev.id) && (ev.start?.dateTime || ev.start?.date))
        .map((ev) => ({
          id: `google-${ev.id}`,
          google_event_id: ev.id,
          title: ev.summary || '(no title)',
          description: ev.description || null,
          location: ev.location || null,
          start_time: ev.start.dateTime || ev.start.date,
          end_time: ev.end.dateTime || ev.end.date,
          status: 'scheduled',
          source: 'google',
          contact_id: null, company_id: null, job_id: null, deal_id: null,
          contact_name: null, company_name: null, job_title: null,
        }));
    } catch (err) {
      console.error('Google Calendar pull failed:', err.message);
    }
  }

  const all = [...localRows, ...googleOnly].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  res.json({ appointments: all, googleConnected: connected });
});

router.post('/', async (req, res) => {
  const { contact_id, company_id, job_id, deal_id, title, description, location, start_time, end_time, assigned_user_id } = req.body;
  if (!title || !start_time || !end_time) return res.status(400).json({ error: 'title, start_time, and end_time are required' });

  const result = db.prepare(`
    INSERT INTO appointments (contact_id, company_id, job_id, deal_id, title, description, location, start_time, end_time, assigned_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(contact_id || null, company_id || null, job_id || null, deal_id || null, title, description || null, location || null, start_time, end_time, assigned_user_id || null);
  let appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(result.lastInsertRowid);

  // "Our" calendar — the one shared company calendar, regardless of who this is assigned to.
  if (google.getStoredTokens(google.COMPANY)) {
    try {
      const event = await google.createEvent(google.toGoogleEvent(appt), google.COMPANY);
      db.prepare(`UPDATE appointments SET google_event_id = ? WHERE id = ?`).run(event.id, appt.id);
    } catch (err) {
      console.error('Google Calendar (company) create failed:', err.message);
    }
  }

  // "His" calendar — the assignee's own connected Google Calendar, if they've linked one (see
  // "Per-user Google Calendar sync" — google.js/routes/auth.js). Only skip the emailed .ics
  // fallback below when this actually succeeds — a connected-but-failed attempt (e.g. a revoked
  // token) still falls back to the email, so the assignee is never left with neither.
  let assigneeSyncedToOwnCalendar = false;
  if (appt.assigned_user_id && google.getStoredTokens(appt.assigned_user_id)) {
    try {
      const event = await google.createEvent(google.toGoogleEvent(appt), appt.assigned_user_id);
      db.prepare(`UPDATE appointments SET assignee_google_event_id = ? WHERE id = ?`).run(event.id, appt.id);
      assigneeSyncedToOwnCalendar = true;
    } catch (err) {
      console.error('Google Calendar (assignee) create failed:', err.message);
    }
  }
  appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(appt.id);

  // Booking an appointment against a lead is the one thing that promotes it to an Opportunity —
  // see PATCH /deals/:id's matching guard, which blocks every other path from making that same
  // jump without an appointment on file. A deal that's already past 'new' (or has no deal_id at
  // all — a contact-only or general appointment) is untouched.
  if (deal_id) {
    const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(deal_id);
    if (deal && deal.stage === 'new') {
      db.prepare(`UPDATE deals SET stage = 'qualified', lead_status = 'Converted', updated_at = datetime('now') WHERE id = ?`).run(deal.id);
      logActivity('deal', deal.id, 'stage_change', `Stage moved from "new" to "qualified" — appointment "${appt.title}" scheduled.`);
      const dealContact = deal.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(deal.contact_id) : null;
      const dealCompany = deal.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(deal.company_id) : null;
      fireTrigger('deal_stage_changed', {
        related_type: 'deal', related_id: deal.id,
        dedupe_id: `${deal.id}:qualified`,
        title: deal.title, value: deal.value, from_stage: 'new', to_stage: 'qualified',
        contact_name: dealContact ? `${dealContact.first_name} ${dealContact.last_name}` : null,
        contact_email: dealContact ? dealContact.email : null,
        company_name: dealCompany ? dealCompany.name : null,
        deal_id: deal.id,
      });
    }
  }

  logActivity(contact_id ? 'contact' : job_id ? 'job' : 'deal', contact_id || job_id || deal_id || appt.id, 'appointment', `Appointment scheduled: "${appt.title}".`);
  // Best-effort email + calendar invite to whoever it's assigned to — never blocks the response.
  // Skipped only when it actually landed on their own connected Google Calendar above.
  if (!assigneeSyncedToOwnCalendar) notify.notifyAppointment(appt, { isNew: true }).catch(() => {});
  res.status(201).json(withNames(appt));
});

router.patch('/:id', async (req, res) => {
  const existing = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updated = { ...existing, ...req.body };

  db.prepare(`
    UPDATE appointments SET title=?, description=?, location=?, start_time=?, end_time=?, status=?, assigned_user_id=?, updated_at=datetime('now') WHERE id=?
  `).run(updated.title, updated.description, updated.location, updated.start_time, updated.end_time, updated.status, updated.assigned_user_id || null, req.params.id);

  // "Our" calendar — same shared event throughout, just kept in sync.
  if (existing.google_event_id) {
    try {
      await google.updateEvent(existing.google_event_id, google.toGoogleEvent(updated), google.COMPANY);
    } catch (err) {
      console.error('Google Calendar (company) update failed:', err.message);
    }
  }

  // "His" calendar — if who it's assigned to changed, drop it from the old assignee's own
  // calendar (they're no longer on this) before putting it on the new assignee's, if connected.
  const reassigned = String(existing.assigned_user_id || '') !== String(updated.assigned_user_id || '');
  if (reassigned && existing.assignee_google_event_id && existing.assigned_user_id) {
    try {
      await google.deleteEvent(existing.assignee_google_event_id, existing.assigned_user_id);
    } catch (err) {
      console.error('Google Calendar (old assignee) delete failed:', err.message);
    }
    db.prepare(`UPDATE appointments SET assignee_google_event_id = NULL WHERE id = ?`).run(req.params.id);
  }

  // Only skip the emailed fallback below when this actually succeeds — same reasoning as the
  // POST handler: a connected-but-failed sync attempt still falls back to the email.
  let assigneeSyncedToOwnCalendar = false;
  if (updated.assigned_user_id && google.getStoredTokens(updated.assigned_user_id)) {
    const currentEventId = reassigned ? null : existing.assignee_google_event_id;
    try {
      if (currentEventId) {
        await google.updateEvent(currentEventId, google.toGoogleEvent(updated), updated.assigned_user_id);
      } else {
        const event = await google.createEvent(google.toGoogleEvent(updated), updated.assigned_user_id);
        db.prepare(`UPDATE appointments SET assignee_google_event_id = ? WHERE id = ?`).run(event.id, req.params.id);
      }
      assigneeSyncedToOwnCalendar = true;
    } catch (err) {
      console.error('Google Calendar (assignee) update failed:', err.message);
    }
  }

  const fresh = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);
  // Re-notify the assignee if anything they'd care about changed — new assignment, retimed, or
  // moved. A plain status change (e.g. marking it done) doesn't warrant a fresh invite email. And
  // skip it once they have their own connected calendar and the update above actually reached it.
  const worthNotifying = ['title', 'location', 'start_time', 'end_time', 'assigned_user_id']
    .some((k) => String(existing[k] || '') !== String(fresh[k] || ''));
  if (worthNotifying && !assigneeSyncedToOwnCalendar) notify.notifyAppointment(fresh, { isNew: false }).catch(() => {});
  res.json(withNames(fresh));
});

router.delete('/:id', async (req, res) => {
  const existing = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.google_event_id) {
    try { await google.deleteEvent(existing.google_event_id, google.COMPANY); } catch (err) { console.error('Google Calendar (company) delete failed:', err.message); }
  }
  if (existing.assignee_google_event_id && existing.assigned_user_id) {
    try { await google.deleteEvent(existing.assignee_google_event_id, existing.assigned_user_id); } catch (err) { console.error('Google Calendar (assignee) delete failed:', err.message); }
  }
  db.prepare(`DELETE FROM appointments WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

module.exports = router;
