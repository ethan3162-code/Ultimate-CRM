// `null` (as opposed to 0, or missing/undefined) is what the server sends specifically for a
// dollar figure it redacted because the signed-in login's price visibility is off (see
// server/src/helpers.js's redactJobMoney/redactEstimateMoney/redactInvoiceMoney and deals.js's
// redactDealMoney) — a real, unset amount comes through as 0, never null. Rendering that as a
// lock icon here means every existing money(...) call site in the app hides prices correctly
// with no per-call-site changes needed.
export function money(n) {
  if (n === null) return '🔒 Hidden';
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

// A deal's work_type is stored as one TEXT column — a single value for a single-service project
// (the common case, and every pre-existing deal), or several comma-separated values for a
// project that needs more than one (e.g. "Asphalt paving, Pavers"). No schema change needed:
// a lone legacy value already round-trips through these as a one-item list.
export function splitWorkTypes(s) {
  return String(s || '').split(',').map((t) => t.trim()).filter(Boolean);
}
export function joinWorkTypes(list) {
  return (list || []).filter(Boolean).join(', ');
}

// "9/18/2026, 1:14 PM" — full date + time, for a "Created Date" column that should show exactly
// when a record landed (Salesforce list views show this on Leads/Opportunities; shortDate below
// is for a date-only field like a close/scheduled date).
export function dateTime(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// "2026-07-30" — used for the auto-generated Opportunity/Project name pattern ("Opportunity -
// <account> - <date>"), which needs a plain sortable date, not a locale-formatted one.
export function isoDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The "account" a lead/opportunity/project rolls up to for display — the linked company if
// there is one, else the linked contact's name, else whatever freeform title the record has (a
// legacy deal with neither). Shared by Leads/Pipeline/Jobs list views so "Company"/"Account Name"
// and the auto-generated Opportunity/Project name both derive it the same way.
export function accountName(row, fallbackTitle) {
  if (row.company_name) return row.company_name;
  if (row.first_name) return `${row.first_name} ${row.last_name}`;
  return fallbackTitle || '—';
}

export function shortDate(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(s);
}

// Raw minutes-since for a timestamp in the same shape timeAgo parses — used where a caller needs
// to bucket a check-in's freshness (e.g. the fleet map's fresh/stale marker coloring) rather than
// just display it.
export function minutesSince(s) {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}

export function initials(first, last) {
  return `${(first || '?')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

// Generic file → data URL, for documents that aren't necessarily images (insurance PDFs, W9s,
// certifications, ...) — unlike JobDetail.jsx's resizeImageFile, this does no canvas/image
// processing, since a canvas can't touch a non-image file. Used by the Employees and
// Subcontractors document-upload UI, which stores files the same data_url-in-the-row way job
// photos already do.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Keyless Google Maps links for a street address — no API key/billing needed.
// `view` opens Maps in a new tab in hybrid (satellite + labels) mode; `embed`
// is a same-origin-safe iframe src for dropping the map straight into a page.
export function mapLinks(address) {
  if (!address) return null;
  const q = encodeURIComponent(address);
  return {
    view: `https://www.google.com/maps?q=${q}&t=k`,
    embed: `https://maps.google.com/maps?q=${q}&t=k&z=17&output=embed`,
  };
}

// Same idea as mapLinks, for a raw lat/lng (a vehicle location check-in) instead of a street
// address — used since a vehicle's location comes from the browser's GPS, not a geocoded address.
export function mapLinksForCoords(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  return { view: `https://www.google.com/maps?q=${lat},${lng}&t=k` };
}
