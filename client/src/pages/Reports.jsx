// Custom report builder — list of saved reports. The Dashboard's own fixed "Reports" grid
// (routes/reports.js) stays as-is; this is a separate, freely-configurable layer on top of it,
// reachable from the sidebar and from a "Your reports" card on the Dashboard.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { timeAgo } from '../utils';

const CATEGORY_ORDER = ['Financial', 'Sales', 'Leads', 'Jobs'];

function groupByCategory(list) {
  const byCategory = new Map();
  for (const r of list) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }
  const ordered = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => [c, byCategory.get(c)]);
  for (const [c, rows] of byCategory) if (!CATEGORY_ORDER.includes(c)) ordered.push([c, rows]);
  return ordered;
}

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(null);
  const [creating, setCreating] = useState(false);
  const [builtin, setBuiltin] = useState(null);

  function load() {
    api.customReports().then(setReports);
  }
  useEffect(load, []);
  useEffect(() => { api.builtinReports().then(setBuiltin).catch(() => setBuiltin([])); }, []);

  async function createReport() {
    setCreating(true);
    try {
      const r = await api.createCustomReport({});
      navigate(`/reports/${r.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function removeReport(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this report?')) return;
    await api.deleteCustomReport(id);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="sub">Build your own report on top of leads, opportunities, projects, invoices, tickets, and more — pick what to group by, save it, and keep adjusting it any time.</p>
        </div>
        <button className="btn primary" onClick={createReport} disabled={creating}>{creating ? 'Creating…' : '+ New report'}</button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 2 }}>Built-in reports</h2>
        <p className="sub" style={{ margin: '0 0 10px' }}>The standard set — fixed, not editable, but always up to date. Same ones shown on the Dashboard.</p>
        {builtin === null ? (
          <div className="loading">Loading…</div>
        ) : (
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {groupByCategory(builtin).map(([category, rows]) => (
              <div key={category}>
                <div className="kicker">{category}</div>
                <div className="stack" style={{ gap: 2 }}>
                  {rows.map((r) => (
                    <Link key={r.key} to={`/reports/system/${r.key}`} className="attention-row">
                      <span>{r.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 style={{ marginBottom: 2 }}>Your reports</h2>
      <p className="sub" style={{ margin: '0 0 10px' }}>Reports you've built yourself — freely editable any time.</p>

      {!reports ? (
        <div className="loading">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="card">
          <div className="empty">No custom reports yet. Click "+ New report" to build your first one.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Data source</th>
                <th>Chart</th>
                <th>Last updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/reports/${r.id}`} className="link-strong">{r.name}</Link></td>
                  <td className="muted" style={{ textTransform: 'capitalize' }}>{r.data_source}</td>
                  <td className="muted" style={{ textTransform: 'capitalize' }}>{r.chart_type}</td>
                  <td className="muted">{timeAgo(r.updated_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn subtle sm" onClick={(e) => removeReport(r.id, e)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
