import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// One always-visible search bar — type directly into it (no click-to-open step first, Salesforce-
// style) and matching leads, opportunities, contacts, companies, projects, tickets, employees, and
// subcontractors drop into a panel right below it as you type (see server/src/routes/search.js
// for the permission-filtered query behind this).
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
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
  }, [query]);

  // Close the results panel on an outside click, same as any dropdown.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setFocused(false);
      e.currentTarget.blur();
    }
  }

  function goTo(path) {
    setQuery('');
    setGroups(null);
    setFocused(false);
    navigate(path);
  }

  function clear() {
    setQuery('');
    setGroups(null);
  }

  const showResults = focused && query.trim().length >= 2;
  const totalResults = groups ? groups.reduce((n, g) => n + g.results.length, 0) : null;

  return (
    <div className="global-search" ref={wrapRef}>
      <span className="global-search-icon">🔎</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        placeholder="Search leads, contacts, companies, projects, tickets…"
      />
      {query && (
        <button type="button" className="global-search-clear" onClick={clear} aria-label="Clear search">✕</button>
      )}

      {showResults && (
        <div className="global-search-results">
          {loading ? (
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
      )}
    </div>
  );
}
