// Custom report builder + viewer, combined into one page — there's no separate "edit mode"
// because every control here saves itself the moment it changes (a dropdown on change, a text
// field on blur), so building a report and coming back later to tweak it are the same flow.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';
import { BarList } from '../components/charts';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [available, setAvailable] = useState(null);
  const [data, setData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const savedTimer = useRef(null);

  function loadData(reportId) {
    setLoadingData(true);
    api.customReportData(reportId).then(setData).catch(() => setData(null)).finally(() => setLoadingData(false));
  }

  useEffect(() => {
    api.customReport(id).then((r) => {
      setReport(r);
      setAvailable(r.available);
      setNameDraft(r.name);
      setDescDraft(r.description || '');
      loadData(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(patch) {
    setSaveState('saving');
    const updated = await api.updateCustomReport(id, patch);
    setReport(updated);
    setAvailable(updated.available);
    setNameDraft(updated.name);
    setDescDraft(updated.description || '');
    setSaveState('saved');
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    loadData(id);
  }

  async function removeReport() {
    if (!window.confirm(`Delete "${report.name}"?`)) return;
    await api.deleteCustomReport(id);
    navigate('/reports');
  }

  if (!report || !available) return <div className="loading">Loading…</div>;

  const source = available.find((s) => s.key === report.data_source);
  const metric = source?.metrics.find((m) => m.key === report.metric);

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/reports">Reports</Link> / {report.name}</p>
          <input
            className="report-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => { if (nameDraft.trim() && nameDraft !== report.name) save({ name: nameDraft }); else setNameDraft(report.name); }}
            style={{ font: 'inherit', fontFamily: "'Source Serif 4', serif", fontSize: '1.7rem', fontWeight: 600, border: 'none', background: 'transparent', padding: 0, width: '100%' }}
          />
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12.5, minWidth: 50, textAlign: 'right' }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
          </span>
          <button type="button" className="btn sm subtle" onClick={removeReport}>Delete</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card section-card">
            <h2 className="section-label" style={{ margin: '0 0 10px' }}>Report setup</h2>
            <div className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label>Description</label>
                <input
                  value={descDraft}
                  placeholder="What is this report for?"
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={() => { if (descDraft !== (report.description || '')) save({ description: descDraft }); }}
                />
              </div>
              <div className="field">
                <label>Data source</label>
                <select value={report.data_source} onChange={(e) => save({ data_source: e.target.value })}>
                  {available.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Group by</label>
                <select value={report.group_by} onChange={(e) => save({ group_by: e.target.value })}>
                  {source?.dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Measure</label>
                <select value={report.metric} onChange={(e) => save({ metric: e.target.value })}>
                  {source?.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
              {source?.dateFields.length > 0 && (
                <>
                  <div className="field">
                    <label>Date field</label>
                    <select value={report.date_field || ''} onChange={(e) => save({ date_field: e.target.value })}>
                      {source.dateFields.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Date range</label>
                    <select value={report.date_range} onChange={(e) => save({ date_range: e.target.value })}>
                      <option value="all">All time</option>
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                      <option value="90d">Last 90 days</option>
                      <option value="ytd">Year to date</option>
                      <option value="custom">Custom range</option>
                    </select>
                  </div>
                  {report.date_range === 'custom' && (
                    <div className="row" style={{ gap: 8 }}>
                      <div className="field" style={{ flex: 1 }}>
                        <label>From</label>
                        <input type="date" value={report.date_start || ''} onChange={(e) => save({ date_start: e.target.value })} />
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>To</label>
                        <input type="date" value={report.date_end || ''} onChange={(e) => save({ date_end: e.target.value })} />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="field">
                <label>Chart type</label>
                <select value={report.chart_type} onChange={(e) => save({ chart_type: e.target.value })}>
                  <option value="bar">Bar chart</option>
                  <option value="table">Table</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>{source?.label} by {source?.dimensions.find((d) => d.key === report.group_by)?.label}</h2>
                <p className="sub" style={{ margin: 0 }}>{metric?.label}</p>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              {loadingData || !data ? (
                <div className="loading">Loading…</div>
              ) : data.price_hidden ? (
                <p className="sub">🔒 Prices are hidden for your account.</p>
              ) : data.rows.length === 0 ? (
                <div className="empty">No matching records for this report yet.</div>
              ) : report.chart_type === 'table' ? (
                <div className="table-wrap">
                  <table className="list">
                    <thead><tr><th>{source?.dimensions.find((d) => d.key === report.group_by)?.label}</th><th style={{ textAlign: 'right' }}>{metric?.label}</th></tr></thead>
                    <tbody>
                      {data.rows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.label}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{data.money ? money(r.value) : r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <BarList data={data.rows} valueKey="value" labelKey="label" formatValue={data.money ? money : (v) => v} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
