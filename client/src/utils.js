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

export function initials(first, last) {
  return `${(first || '?')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
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
