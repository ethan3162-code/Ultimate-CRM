// Parses AnswerForce's call-notification emails into a lead-shaped payload.
//
// AnswerForce (the user's virtual-receptionist / call-answering service) emails a notification
// for every call it answers on the user's behalf. There are two real templates, confirmed against
// live samples from the user's own inbox:
//
//  1. The common one, subject "Your Message (866) 764-4682" — a caller-name header, then a
//     "Call from <phone>" line, a city/state area line, then a long run of label-then-value pairs
//     (separated by blank lines): Answered By, Call Recording, Call Type, Phone, Method of Entry,
//     Business Unit, First Name, Last Name, Property Type, Address 1, City, State, Zip/Postal Code,
//     Is the state New York?, Email, Referral Source, Description, Type Of Work, If Other,
//     Preferred Date & Time For Call Back (If Any), Preferred Date & Time For Consult (If Any),
//     Message(If Any), Message Taken, Query Type. Which fields show up varies call to call — every
//     field here is optional, and this parser treats it that way rather than assuming a fixed set.
//     A field the caller declined to give (e.g. Email) comes through with a literal placeholder
//     value like "Declined." or "N/A" rather than being omitted — isBlankValue() below filters those.
//
//  2. A much rarer, messier one, subject "FWD: Message From +1 866-764-4682" — a forwarded
//     voicemail-style email, mostly SendGrid click-tracking HTML noise once converted to plain
//     text. This parser makes a best-effort attempt (a "looking for a job"-style message line, a
//     name off the "From:" line, a phone number found in the body) and always flags it
//     low-confidence so it's easy to tell apart from a cleanly-parsed one.
//
// Every real email body is heavily polluted with SendGrid click-tracking redirect links wrapping
// nearly every word/icon/link — stripLinks() below removes that noise before anything else runs.

const KNOWN_LABELS = {
  'answered by': 'answered_by',
  'call recording': null, // value is just "Listen Now" — not useful data
  'call type': 'call_type',
  'phone': 'phone',
  'method of entry': 'method_of_entry',
  'business unit': 'business_unit',
  'first name': 'first_name',
  'last name': 'last_name',
  'property type': 'property_type',
  'address 1': 'address1',
  'city': 'city',
  'state': 'state',
  'zip/postal code': 'zip',
  'is the state new york?': null,
  'email': 'email',
  'referral source': 'referral_source',
  'description': 'description',
  'type of work': 'type_of_work',
  'if other': 'if_other',
  'preferred date & time for call back (if any)': 'preferred_callback',
  'preferred date & time for consult (if any)': 'preferred_consult',
  'message(if any)': 'message',
  'message taken': null, // a timestamp, not lead data
  'query type': 'query_type',
};

const BLANK_VALUES = new Set(['', 'none', 'n/a', 'na', 'declined', 'declined.', 'null', '-', 'any']);

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Strips SendGrid click-tracking parentheticals like "( https://u19164882.ct.sendgrid.net/... )"
// and bare "( # )" placeholders that wrap almost every link/icon in these emails.
function stripLinks(text) {
  return String(text || '').replace(/\(\s*(?:https?:\/\/\S*|#)\s*\)/g, ' ');
}

function normalizeLabel(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isBlankValue(v) {
  const norm = String(v || '').trim().toLowerCase().replace(/\.$/, '');
  return BLANK_VALUES.has(norm);
}

const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

function extractPhone(text) {
  const m = String(text || '').match(PHONE_RE);
  return m ? m[0].trim() : null;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return raw.trim();
}

// Every one of these emails comes from (or references, in the footer/subject) AnswerForce's own
// call-routing number — a toll-free line like (866) 764-4682 — and that number sometimes shows up
// in the "Phone" or "Call from" value instead of the actual caller's own number. A toll-free area
// code is never a personal cell/home number, so a value in this set is never a real caller phone —
// treating it as one would merge unrelated callers onto one shared bogus "contact" number.
const TOLL_FREE_AREA_CODES = new Set(['800', '833', '844', '855', '866', '877', '888']);

function isTollFreeNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const tenDigit = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return tenDigit.length === 10 && TOLL_FREE_AREA_CODES.has(tenDigit.slice(0, 3));
}

// Splits body text into blank-line-delimited "chunks" (paragraphs), each collapsed to one line.
function toChunks(text) {
  return String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parsePrimaryTemplate(rawText) {
  const cleaned = stripLinks(decodeEntities(rawText));
  const chunks = toChunks(cleaned);

  const fields = {};
  const notes = [];

  // The caller-name header ("Gennaro Unverified user", "N/A Unverified user", ...) is always the
  // first substantive line, ahead of the dashed separator.
  let nameHint = null;
  const headerMatch = cleaned.match(/^\s*(.*?)\s+Unverified user\b/i);
  if (headerMatch) {
    const candidate = headerMatch[1].trim();
    if (candidate && !isBlankValue(candidate)) nameHint = candidate;
  }

  let expectAreaNext = false;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (/^call from\b/i.test(chunk)) {
      const phone = extractPhone(chunk.replace(/^call from\b/i, ''));
      if (phone) fields.call_from_phone = phone;
      expectAreaNext = true;
      continue;
    }

    const normalized = normalizeLabel(chunk);
    const looksLikeKnownLabel = Object.prototype.hasOwnProperty.call(KNOWN_LABELS, normalized);

    if (expectAreaNext) {
      expectAreaNext = false;
      // A short "City, ST" line right after "Call from" — informational only, the caller's real
      // address (if captured) lives in the Address 1/City/State/Zip fields below. If this chunk
      // is actually the next known label (the area line can be missing), fall through and let the
      // normal label handling below process it instead of swallowing it as a location.
      if (!looksLikeKnownLabel && chunk.length < 60 && !/https?:\/\//i.test(chunk)) {
        fields.call_area = chunk;
        continue;
      }
    }

    if (looksLikeKnownLabel) {
      const canonicalKey = KNOWN_LABELS[normalized];
      const valueChunk = chunks[i + 1] !== undefined ? chunks[i + 1] : '';
      i += 1; // consume the value chunk
      if (isBlankValue(valueChunk)) continue;
      if (normalized === 'answered by') { notes.push(`Answered by ${valueChunk}`); continue; }
      if (canonicalKey) fields[canonicalKey] = valueChunk;
    }
    // Anything else (dashed separators, feedback-icon labels, brand/app-download links, "Did we
    // deliver happiness?", ...) is noise — ignored.
  }

  const firstName = fields.first_name || (nameHint ? nameHint.split(/\s+/)[0] : null);
  const lastName = fields.last_name || (nameHint && nameHint.split(/\s+/).length > 1
    ? nameHint.split(/\s+/).slice(1).join(' ') : null);

  const addressParts = [fields.address1, fields.city, fields.state, fields.zip].filter(Boolean);
  const address = addressParts.length ? [fields.address1, fields.city, [fields.state, fields.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null;

  // Prefer the "Phone" field over the "Call from" line, same as before — but skip either one if
  // it's actually AnswerForce's own toll-free number rather than the caller's.
  const rawPhone = [fields.phone, fields.call_from_phone].find((p) => p && !isTollFreeNumber(p)) || null;
  const phone = normalizePhone(rawPhone);
  const description = fields.description || fields.message || null;

  // The caller's actual marketing/referral channel (Google, Yelp, "drove by", a repeat-customer
  // mention, etc.) as AnswerForce's agent typed it — this is what should drive the CRM's lead
  // "source" field (see leadInbox.js's leadPayloadFromParsed), not just a note. Kept as free text,
  // same as the rest of this parser's fields — no attempt to force it into the CRM's dropdown
  // vocabulary, since AnswerForce agents type this by hand and it doesn't line up 1:1 with those
  // options anyway (better a true value the user can see/relabel than a mis-mapped guess).
  const referralSource = fields.referral_source && !isBlankValue(fields.referral_source) ? fields.referral_source : null;

  const extraNotes = [];
  if (fields.business_unit) extraNotes.push(`Business unit: ${fields.business_unit}`);
  if (fields.query_type) extraNotes.push(`Query type: ${fields.query_type}`);
  if (referralSource) extraNotes.push(`Referral source (AnswerForce): ${referralSource}`);
  if (fields.call_area && !address) extraNotes.push(`Call area: ${fields.call_area}`);
  if (fields.if_other && !isBlankValue(fields.if_other)) extraNotes.push(`Other: ${fields.if_other}`);
  extraNotes.push(...notes);

  return {
    template: 'primary',
    needs_review: false,
    first_name: firstName || null,
    last_name: lastName || null,
    phone,
    email: fields.email && !isBlankValue(fields.email) ? fields.email : null,
    address,
    description,
    call_type: fields.call_type || null,
    type_of_work: fields.type_of_work || null,
    property_type: fields.property_type || null,
    preferred_callback: fields.preferred_callback || null,
    preferred_consult: fields.preferred_consult || null,
    method_of_entry_detail: fields.method_of_entry || null,
    referral_source: referralSource,
    notes: extraNotes,
  };
}

function parseForwardedTemplate(rawText) {
  const cleaned = stripLinks(decodeEntities(rawText));
  const markerIdx = cleaned.search(/-{5,}\s*forwarded message\s*-{5,}/i);
  const preamble = (markerIdx >= 0 ? cleaned.slice(0, markerIdx) : cleaned).trim();
  const afterMarker = markerIdx >= 0 ? cleaned.slice(markerIdx) : '';

  let name = null;
  const fromMatch = afterMarker.match(/From:\s*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,2})/);
  if (fromMatch) {
    const candidate = fromMatch[1].trim();
    if (candidate && candidate.split(/\s+/).length <= 3) name = candidate;
  }

  // Prefer a phone that appears near "From"; fall back to the first phone-shaped match anywhere
  // in the body — skipping AnswerForce's own toll-free number if that's what matched instead of
  // the caller's.
  const phone = [extractPhone(afterMarker), extractPhone(cleaned)].find((p) => p && !isTollFreeNumber(p)) || null;

  const messageText = preamble || null;

  return {
    template: 'forwarded',
    needs_review: true,
    first_name: name ? name.split(/\s+/)[0] : null,
    last_name: name && name.split(/\s+/).length > 1 ? name.split(/\s+/).slice(1).join(' ') : null,
    phone: normalizePhone(phone),
    email: null,
    address: null,
    description: messageText,
    call_type: null,
    type_of_work: null,
    property_type: null,
    preferred_callback: null,
    preferred_consult: null,
    method_of_entry_detail: null,
    referral_source: null,
    notes: [],
  };
}

/** Parses one AnswerForce email (subject + plain-text body) into a lead-shaped object.
    Returns null if this doesn't look like an AnswerForce notification at all. */
function parseAnswerForceEmail({ subject, text }) {
  const subj = String(subject || '');
  if (/^your message\b/i.test(subj)) return parsePrimaryTemplate(text);
  if (/^fwd:\s*message from\b/i.test(subj)) return parseForwardedTemplate(text);
  // Unknown subject shape from the same sender — still worth a best-effort, low-confidence pass
  // rather than silently dropping it.
  return { ...parseForwardedTemplate(text), template: 'unknown' };
}

module.exports = { parseAnswerForceEmail, isBlankValue, normalizePhone, extractPhone, isTollFreeNumber };
