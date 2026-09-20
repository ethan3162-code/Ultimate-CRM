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
const { getCompanyProfile } = require('./companyProfile');

function getUser(userId) {
  if (!userId) return null;
  return db.prepare(`SELECT id, username, email FROM users WHERE id = ?`).get(userId);
}

// Who "us" is for a document's own internal alerts (signed / first viewed) — the project or
// opportunity's assigned owner if one is set, falling back to the company's own email (the same
// address already shown on the estimate/invoice header) so this works out of the box without
// anyone having to also put an email on their login first.
function internalRecipient(ownerUserId) {
  const owner = getUser(ownerUserId);
  if (owner && owner.email) return { email: owner.email, name: owner.username };
  const company = getCompanyProfile();
  return { email: company.email, name: company.name };
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

/** Customer signed an estimate — fires once (routes/public.js only calls this from the sign
    handler itself, which only ever runs once per estimate). Emails whoever owns the project that
    was just created (or the deal, if signing didn't create one — shouldn't happen in practice
    but kept defensive), falling back to the company's own address. */
async function notifyEstimateSigned({ estimate, job, deal, contactName }) {
  const ownerUserId = (job && job.owner_user_id) || (deal && deal.owner_user_id) || null;
  const to = internalRecipient(ownerUserId);
  const title = (job && job.title) || (deal && deal.title) || estimate.number;
  const result = await mailer.sendEmail({
    to: to.email,
    subject: `Signed: Estimate ${estimate.number} — ${title}`,
    text: `${contactName || 'The customer'} just signed Estimate ${estimate.number} for "${title}".\n\nAn invoice has been generated automatically${job ? ` and the project has moved to Pending Schedule.` : '.'}`,
  });
  if (!result.sent && mailer.isConfigured()) console.error(`Estimate-signed notification to ${to.email} not sent: ${result.reason}`);
  return result;
}

/** Customer explicitly declined an estimate (routes/public.js's /estimates/:token/decline) —
    fires once, same as notifyEstimateSigned. Since a decline never creates a project, the owner
    to notify is whichever the estimate was already attached to (job if it has one, else deal). */
async function notifyEstimateDeclined({ estimate, job, deal, contactName, reason }) {
  const ownerUserId = (job && job.owner_user_id) || (deal && deal.owner_user_id) || null;
  const to = internalRecipient(ownerUserId);
  const title = (job && job.title) || (deal && deal.title) || estimate.number;
  const result = await mailer.sendEmail({
    to: to.email,
    subject: `Declined: Estimate ${estimate.number} — ${title}`,
    text: `${contactName || 'The customer'} just declined Estimate ${estimate.number} for "${title}".${reason ? `\n\nReason given: ${reason}` : ''}`,
  });
  if (!result.sent && mailer.isConfigured()) console.error(`Estimate-declined notification to ${to.email} not sent: ${result.reason}`);
  return result;
}

/** A payment was recorded against an invoice (routes/jobs.js's authenticated POST
    /invoices/:invoiceId/payments — whoever's logged in entering a check/cash/card payment they
    took, or a card payment coming in some other way). Invoices don't get "signed" the way
    estimates do, so this is the invoice-side parallel: fires every time money lands, not just
    once, since a business owner wants to know about each payment as it's recorded, partial or
    full. */
async function notifyInvoicePayment({ invoice, job, amount, method, fullyPaid, contactName }) {
  const ownerUserId = (job && job.owner_user_id) || null;
  const to = internalRecipient(ownerUserId);
  const title = (job && job.title) || invoice.number;
  const balanceLine = fullyPaid
    ? 'This invoice is now paid in full.'
    : `Remaining balance: $${invoice.balance.toFixed(2)}.`;
  const result = await mailer.sendEmail({
    to: to.email,
    subject: `${fullyPaid ? 'Paid in full' : 'Payment received'}: Invoice ${invoice.number} — ${title}`,
    text: `A payment of $${amount.toFixed(2)} (${method}) was just recorded on Invoice ${invoice.number} for "${title}"${contactName ? ` from ${contactName}` : ''}.\n\n${balanceLine}`,
  });
  if (!result.sent && mailer.isConfigured()) console.error(`Invoice-payment notification to ${to.email} not sent: ${result.reason}`);
  return result;
}

/** Customer opened the public estimate or invoice link — routes/public.js only calls this the
    FIRST time a given document is viewed (see estimates.first_viewed_at / invoices.first_viewed_at),
    so this fires once per document rather than on every page reload. */
async function notifyDocumentViewed({ kind, number, job, deal, contactName }) {
  const ownerUserId = (job && job.owner_user_id) || (deal && deal.owner_user_id) || null;
  const to = internalRecipient(ownerUserId);
  const title = (job && job.title) || (deal && deal.title) || number;
  const label = kind === 'invoice' ? 'Invoice' : 'Estimate';
  const result = await mailer.sendEmail({
    to: to.email,
    subject: `Viewed: ${label} ${number} — ${title}`,
    text: `${contactName || 'The customer'} just opened ${label} ${number} for "${title}" for the first time.`,
  });
  if (!result.sent && mailer.isConfigured()) console.error(`Document-viewed notification to ${to.email} not sent: ${result.reason}`);
  return result;
}

module.exports = {
  notifyAppointment, notifyJobMilestones, notifyTaskDueDate, notifyEstimateSigned, notifyDocumentViewed,
  notifyEstimateDeclined, notifyInvoicePayment,
};
