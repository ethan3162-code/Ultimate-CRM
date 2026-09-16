export function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
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
