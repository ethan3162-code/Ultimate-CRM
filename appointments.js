const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const google = require('../google');

const router = express.Router();

function withNames(row) {
  if (!row) return row;
  const contact = row.contact_id ? db.prepare(`SELECT first_name, last_name FROM contacts WHERE id = ?`).get(row.contact_id) : null;
  const company = row.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(row.company_id) : null;
  const job = row.job_id ? db.prepare(`SELECT title FROM jobs WHERE id = ?`).get(row.job_id) : null;
  return {
    ...row,
    contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    company_name: company ? company.name : null,
    job_title: job ? job.title : null,
  };
}

// Merge local appointments with events pulled live from Google Calendar (read side of the
// "two-way" sync): anything created directly in Google shows up here too, tagged source:'google'.
router.get('/', async (req, res) => {
  const localRows = db.prepare(`SELECT * FROM appointments ORDER BY start_time ASC`).all().map(withNames);

  let googleOnly = [];
  const connected = Boolean(google.getStoredTokens());
  if (connected) {
    try {
      const events = await google.listEvents({});
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
  const { contact_id, company_id, job_id, deal_id, title, description, location, start_time, end_time } = req.body;
  if (!title || !start_time || !end_time) return res.status(400).json({ error: 'title, start_time, and end_time are required' });

  const result = db.prepare(`
    INSERT INTO appointments (contact_id, company_id, job_id, deal_id, title, description, location, start_time, end_time)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(contact_id || null, company_id || null, job_id || null, deal_id || null, title, description || null, location || null, start_time, end_time);
  let appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(result.lastInsertRowid);

  if (google.getStoredTokens()) {
    try {
      const event = await google.createEvent(google.toGoogleEvent(appt));
      db.prepare(`UPDATE appointments SET google_event_id = ? WHERE id = ?`).run(event.id, appt.id);
      appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(appt.id);
    } catch (err) {
      console.error('Google Calendar create failed:', err.message);
    }
  }

  logActivity(contact_id ? 'contact' : job_id ? 'job' : 'deal', contact_id || job_id || deal_id || appt.id, 'appointment', `Appointment scheduled: "${appt.title}".`);
  res.status(201).json(withNames(appt));
});

router.patch('/:id', async (req, res) => {
  const existing = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updated = { ...existing, ...req.body };

  db.prepare(`
    UPDATE appointments SET title=?, description=?, location=?, start_time=?, end_time=?, status=?, updated_at=datetime('now') WHERE id=?
  `).run(updated.title, updated.description, updated.location, updated.start_time, updated.end_time, updated.status, req.params.id);

  if (existing.google_event_id) {
    try {
      await google.updateEvent(existing.google_event_id, google.toGoogleEvent(updated));
    } catch (err) {
      console.error('Google Calendar update failed:', err.message);
    }
  }
  res.json(withNames(db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id)));
});

router.delete('/:id', async (req, res) => {
  const existing = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.google_event_id) {
    try { await google.deleteEvent(existing.google_event_id); } catch (err) { console.error('Google Calendar delete failed:', err.message); }
  }
  db.prepare(`DELETE FROM appointments WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

module.exports = router;
