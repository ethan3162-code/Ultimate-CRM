// Assignment notifications (Sept 2026) — the user asked that every login have an email on file
// so appointments and project/task scheduling can reach them by email, with a calendar-invite
// attachment they can add to Google Calendar (or Outlook/Apple Calendar) in one click. This is
// deliberately the simpler "email an invite" approach rather than each person connecting their
// own Google account via OAuth — see ics.js for the invite format and mailer.js for delivery.
// Every function here is best-effort: no email on file, mail not configured, or a send failure
// all just no-op/log rather than ever bubbling up and failing the request that triggered them.
const db = require('./db');
const mailer = require('./mailer');
const { buildIcs, buildIcsMulti } = require('./ics');

function getUser(userId) {
  if (!userId) return null;
  return db.prepare(`SELECT id, username, email FROM users WHERE id = ?`).get(userId);
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}
function fmtDate(dateStr) {
  try {
    return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
  } catch { return dateStr; }
}

/** Appointment created or its time/details changed — emails whoever it's assigned to. */
async function notifyAppointment(appt, { isNew } = {}) {
  const user = getUser(appt.assigned_user_id);
  if (!user || !user.email) return { sent: false, reason: 'no assignee email' };

  const ics = buildIcs({
    uid: `appt-${appt.id}@ultimate-crm`,
    title: appt.title,
    description: appt.description || undefined,
    location: appt.location || undefined,
    start: appt.start_time,
    end: appt.end_time,
    attendeeEmail: user.email,
    attendeeName: user.username,
  });
  const verb = isNew ? 'New appointment' : 'Appointment updated';
  const result = await mailer.sendCalendarInvite({
    to: user.email,
    subject: `${verb}: ${appt.title}`,
    text: `${verb}: "${appt.title}"\nWhen: ${fmtDateTime(appt.start_time)} – ${fmtDateTime(appt.end_time)}${appt.location ? `\nWhere: ${appt.location}` : ''}\n\nOpen the attached invite to add it to your calendar.`,
    ics,
    icsFilename: 'appointment.ics',
  });
  if (!result.sent) console.error(`Appointment notification to ${user.email} not sent: ${result.reason}`);
  return result;
}

/** A project's schedule (start date or any stage length) changed and it has an owner — emails
    them one invite file covering all four milestone dates (see helpers.js's getJobMilestones). */
async function notifyJobMilestones(job, milestones) {
  const user = getUser(job.owner_user_id);
  if (!user || !user.email) return { sent: false, reason: 'no owner email' };
  if (!milestones || milestones.length === 0) return { sent: false, reason: 'no start date set yet' };

  const ics = buildIcsMulti(milestones.map((m) => ({
    uid: `job-${job.id}-${m.key}@ultimate-crm`,
    title: `${job.title} — ${m.label}`,
    description: `${m.label} phase for project "${job.title}".`,
    location: job.address || undefined,
    startDate: m.start,
    endDate: m.end,
    attendeeEmail: user.email,
    attendeeName: user.username,
  })));
  const summary = milestones.map((m) => `${m.label}: ${fmtDate(m.start)}${m.end !== m.start ? ` – ${fmtDate(m.end)}` : ''}`).join('\n');
  const result = await mailer.sendCalendarInvite({
    to: user.email,
    subject: `Project schedule: ${job.title}`,
    text: `The schedule for "${job.title}" is set:\n\n${summary}\n\nOpen the attached invite to add all of these to your calendar.`,
    ics,
    icsFilename: 'project-schedule.ics',
  });
  if (!result.sent) console.error(`Project schedule notification to ${user.email} not sent: ${result.reason}`);
  return result;
}

/** A task got (or changed) a due date and is assigned to someone — emails them a same-day invite. */
async function notifyTaskDueDate(task) {
  const user = getUser(task.assigned_user_id);
  if (!user || !user.email) return { sent: false, reason: 'no assignee email' };
  if (!task.due_date) return { sent: false, reason: 'no due date' };

  const ics = buildIcs({
    uid: `task-${task.id}@ultimate-crm`,
    title: `Task due: ${task.title}`,
    startDate: task.due_date,
    attendeeEmail: user.email,
    attendeeName: user.username,
  });
  const result = await mailer.sendCalendarInvite({
    to: user.email,
    subject: `Task due ${fmtDate(task.due_date)}: ${task.title}`,
    text: `"${task.title}" is due ${fmtDate(task.due_date)}.\n\nOpen the attached invite to add a reminder to your calendar.`,
    ics,
    icsFilename: 'task.ics',
  });
  if (!result.sent) console.error(`Task notification to ${user.email} not sent: ${result.reason}`);
  return result;
}

module.exports = { notifyAppointment, notifyJobMilestones, notifyTaskDueDate };
