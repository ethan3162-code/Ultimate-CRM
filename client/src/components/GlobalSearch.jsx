import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// One search bar for every record type the signed-in login can see — leads, opportunities,
// contacts, companies, jobs, tickets, employees, subcontractors — grouped by type (see
// server/src/routes/search.js). Same component renders two ways: a compact icon button for the
// mobile topbar, and a full "Search…" field for the desktop sidebar — both open the identical
// overlay, so there's exactly one place this logic lives.
export default function GlobalSearch({ compact }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setGroups(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      api.search(q)
        .then((data) => setGroups(data.groups))
        .catch(() => setGroups([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery('');
    setGroups(null);
    setLoading(false);
  }

  function goTo(path) {
    close();
    navigate(path);
  }

  const totalResults = groups ? groups.reduce((n, g) => n + g.results.length, 0) : null;

  return (
    <>
      <button
        type="button"
        className={'search-trigger' + (compact ? ' compact' : '')}
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <span className="search-trigger-icon">🔎</span>
        {!compact && <span className="search-trigger-label">Search everything…</span>}
      </button>

      {open && (
        <div className="search-overlay" onClick={close}>
          <div className="search-panel" onClick={(e) => e.stopPropagation()}>
            <div className="search-panel-head">
              <span className="search-panel-icon">🔎</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leads, contacts, companies, jobs, tickets…"
              />
              <button type="button" className="btn sm subtle" onClick={close}>Close</button>
            </div>
            <div className="search-panel-body">
              {query.trim().length < 2 ? (
                <div className="empty">Type at least 2 characters to search every record you have access to.</div>
              ) : loading ? (
                <div className="loading">Searching…</div>
              ) : !groups || totalResults === 0 ? (
                <div className="empty">No matches for &ldquo;{query.trim()}&rdquo;.</div>
              ) : (
                groups.map((g) => (
                  <div key={g.key} className="search-group">
                    <div className="search-group-label">{g.label}</div>
                    {g.results.map((r) => (
                      <button key={r.id} type="button" className="search-result-row" onClick={() => goTo(r.path)}>
                        <span className="search-result-title">{r.title}</span>
                        {r.subtitle && <span className="search-result-subtitle">{r.subtitle}</span>}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
