// Minimal RFC 5545 calendar-invite builder — no dependency, just enough to produce a
// text/calendar VEVENT that Google Calendar, Outlook, and Apple Calendar all recognize and offer
// to add with one click when it arrives as an email attachment (see mailer.js's sendEmail
// `attachments` support and notify.js, which is what actually calls this). Deliberately not a
// full two-way sync — the user asked for the simpler "email an invite" version rather than each
// person connecting their own Google account.

function pad(n) { return String(n).padStart(2, '0'); }

/** YYYYMMDDTHHMMSSZ, always UTC — the simplest correct form for an invite that has a real time. */
function toUtcStamp(date) {
  const d = new Date(date);
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
  );
}

/** YYYYMMDD, for an all-day VALUE=DATE field. Accepts a 'YYYY-MM-DD' string or a Date. */
function toDateStamp(dateOnly) {
  const s = typeof dateOnly === 'string' ? dateOnly : dateOnly.toISOString().slice(0, 10);
  return s.slice(0, 10).replace(/-/g, '');
}

/** Escapes text per RFC 5545 §3.3.11 — commas, semicolons, backslashes, and newlines. */
function escapeText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

// Long lines technically should be folded at 75 octets per RFC 5545 — every field here (titles,
// short descriptions, single-line addresses) stays well under that in practice, so folding is
// skipped for simplicity.
function line(name, value) {
  return `${name}:${value}`;
}

/**
 * Builds a complete .ics file (one VEVENT) as a string with CRLF line endings.
 * - For a timed event, pass `start`/`end` as Dates or ISO strings.
 * - For an all-day event (a due date, a milestone date with no specific time), pass
 *   `startDate`/`endDate` as 'YYYY-MM-DD' strings instead — `endDate` is exclusive per the
 *   spec, so a one-day event's endDate should be the day *after* startDate.
 * `method` defaults to 'REQUEST' (an invite) — the form calendar apps recognize as something to
 * add, vs. 'PUBLISH' which some clients only show as an attachment to open manually.
 */
function buildEventBlock({ uid, title, description, location, start, end, startDate, endDate, organizerEmail, organizerName, attendeeEmail, attendeeName }) {
  const lines = ['BEGIN:VEVENT', line('UID', uid), line('DTSTAMP', toUtcStamp(new Date()))];
  if (startDate) {
    lines.push(line('DTSTART;VALUE=DATE', toDateStamp(startDate)));
    lines.push(line('DTEND;VALUE=DATE', toDateStamp(endDate || startDate)));
  } else {
    lines.push(line('DTSTART', toUtcStamp(start)));
    lines.push(line('DTEND', toUtcStamp(end || start)));
  }
  lines.push(line('SUMMARY', escapeText(title)));
  if (description) lines.push(line('DESCRIPTION', escapeText(description)));
  if (location) lines.push(line('LOCATION', escapeText(location)));
  if (organizerEmail) lines.push(line('ORGANIZER', `CN=${escapeText(organizerName || organizerEmail)}:mailto:${organizerEmail}`));
  if (attendeeEmail) {
    lines.push(line('ATTENDEE', `CN=${escapeText(attendeeName || attendeeEmail)};RSVP=TRUE:mailto:${attendeeEmail}`));
  }
  lines.push('STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT');
  return lines;
}

function wrapCalendar(eventLines, method) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ultimate CRM//Calendar Invite//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method || 'REQUEST'}`,
    ...eventLines,
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

/**
 * Builds a complete .ics file (one VEVENT) as a string with CRLF line endings.
 * - For a timed event, pass `start`/`end` as Dates or ISO strings.
 * - For an all-day event (a due date, a milestone date with no specific time), pass
 *   `startDate`/`endDate` as 'YYYY-MM-DD' strings instead — `endDate` is exclusive per the
 *   spec, so a one-day event's endDate should be the day *after* startDate.
 * `method` defaults to 'REQUEST' (an invite) — the form calendar apps recognize as something to
 * add, vs. 'PUBLISH' which some clients only show as an attachment to open manually.
 */
function buildIcs(opts) {
  return wrapCalendar(buildEventBlock(opts), opts.method);
}

/** Same as buildIcs, but bundles several events into one .ics/one VCALENDAR — used for a
    project's schedule milestones, so the recipient gets one invite file with all of demo/site
    prep/installation/final walkthrough as separate events rather than four separate emails. */
function buildIcsMulti(events, method) {
  const eventLines = events.flatMap((e) => buildEventBlock(e));
  return wrapCalendar(eventLines, method);
}

module.exports = { buildIcs, buildIcsMulti };
