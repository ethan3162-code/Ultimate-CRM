// Custom report builder — list of saved reports. The Dashboard's own fixed "Reports" grid
// (routes/reports.js) stays as-is; this is a separate, freely-configurable layer on top of it,
// reachable from the sidebar and from a "Your reports" card on the Dashboard.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { timeAgo } from '../utils';

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api.customReports().then(setReports);
  }
  useEffect(load, []);

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
