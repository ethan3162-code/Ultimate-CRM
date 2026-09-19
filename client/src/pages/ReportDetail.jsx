// Custom report builder + viewer, combined into one page — there's no separate "edit mode"
// because every control here saves itself the moment it changes (a dropdown on change, a text
// field on blur), so building a report and coming back later to tweak it are the same flow.
//
// Sept 2026: a report can now be either the original single-level aggregate "summary" (a
// group-by + one measure, shown as a bar chart or a two-column table) or a Salesforce-style
// "detail" report — a row-level column pick, an optional second grouping level, ad-hoc filters,
// and a nested table with per-group subtotals and a grand total. Only sources with a `fields`
// registry (Leads, Opportunities, Projects — see server/src/reportSources.js) offer "detail";
// everything else stays summary-only.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';
import { BarList } from '../components/charts';

const BLANK_FILTER = { field: '', operator: '', value: '', value2: '' };

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [available, setAvailable] = useState(null);
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [filterDrafts, setFilterDrafts] = useState([]);
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
      setFilterDrafts(r.filters && r.filters.length ? r.filters : []);
      loadData(id);
    });
    api.customReportMeta().then(setMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(patch) {
    setSaveState('saving');
    const updated = await api.updateCustomReport(id, patch);
    setReport(updated);
    setAvailable(updated.available);
    setNameDraft(updated.name);
    setDescDraft(updated.description || '');
    setFilterDrafts(updated.filters && updated.filters.length ? updated.filters : []);
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

  if (!report || !available || !meta) return <div className="loading">Loading…</div>;

  const source = available.find((s) => s.key === report.data_source);
  const metric = source?.metrics.find((m) => m.key === report.metric);
  const isDetail = report.report_type === 'detail';

  function updateFilter(idx, patch) {
    const next = filterDrafts.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    setFilterDrafts(next);
    return next;
  }
  function saveFilters(next) {
    save({ filters: next.filter((f) => f.field && f.operator) });
  }
  function addFilter() {
    setFilterDrafts([...filterDrafts, BLANK_FILTER]);
  }
  function removeFilter(idx) {
    const next = filterDrafts.filter((_, i) => i !== idx);
    setFilterDrafts(next);
    saveFilters(next);
  }

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

      {source?.supportsDetail && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={'tab' + (!isDetail ? ' active' : '')} onClick={() => save({ report_type: 'summary' })}>Summary (chart)</button>
          <button type="button" className={'tab' + (isDetail ? ' active' : '')} onClick={() => save({ report_type: 'detail' })}>Detailed list</button>
        </div>
      )}

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

              {!isDetail && (
                <>
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
                </>
              )}

              {isDetail && (
                <>
                  <div className="field">
                    <label>Columns</label>
                    <div className="report-columns-grid">
                      {source?.fields.map((f) => {
                        const checked = (report.columns || []).includes(f.key);
                        return (
                          <label key={f.key}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const cur = report.columns || [];
                                const next = e.target.checked ? [...cur, f.key] : cur.filter((c) => c !== f.key);
                                // Keep column order matching the field registry's own order, not click order.
                                const ordered = source.fields.map((sf) => sf.key).filter((k) => next.includes(k));
                                save({ columns: ordered });
                              }}
                            />
                            {f.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="field">
                    <label>Group by</label>
                    <select value={report.group_by || ''} onChange={(e) => save({ group_by: e.target.value })}>
                      <option value="">— none —</option>
                      {source?.dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Then group by</label>
                    <select value={report.group_by_2 || ''} onChange={(e) => save({ group_by_2: e.target.value || null })} disabled={!report.group_by}>
                      <option value="">— none —</option>
                      {source?.dimensions.filter((d) => d.key !== report.group_by).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Sort by</label>
                    <div className="row" style={{ gap: 8 }}>
                      <select style={{ flex: 1 }} value={report.sort_field || ''} onChange={(e) => save({ sort_field: e.target.value || null })}>
                        <option value="">Default</option>
                        {source?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <select value={report.sort_dir || 'desc'} onChange={(e) => save({ sort_dir: e.target.value })}>
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Filters</label>
                    {filterDrafts.map((f, idx) => {
                      const fieldMeta = source?.fields.find((sf) => sf.key === f.field);
                      const ops = fieldMeta ? meta.operators[fieldMeta.type] || [] : [];
                      const needsValue = f.operator && !['is_blank', 'is_not_blank'].includes(f.operator);
                      const needsSecondValue = f.operator === 'between';
                      return (
                        <div className="report-filter-row" key={idx}>
                          <select
                            value={f.field}
                            onChange={(e) => saveFilters(updateFilter(idx, { field: e.target.value, operator: '', value: '', value2: '' }))}
                          >
                            <option value="">— field —</option>
                            {source?.fields.map((sf) => <option key={sf.key} value={sf.key}>{sf.label}</option>)}
                          </select>
                          <select
                            value={f.operator}
                            disabled={!f.field}
                            onChange={(e) => saveFilters(updateFilter(idx, { operator: e.target.value }))}
                          >
                            <option value="">— operator —</option>
                            {ops.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                          {needsValue && fieldMeta?.type === 'bool' && (
                            <select value={f.value ? '1' : '0'} onChange={(e) => saveFilters(updateFilter(idx, { value: e.target.value === '1' }))}>
                              <option value="1">Yes</option>
                              <option value="0">No</option>
                            </select>
                          )}
                          {needsValue && fieldMeta?.type !== 'bool' && !['last_7_days', 'last_30_days', 'last_90_days', 'ytd'].includes(f.operator) && (
                            <input
                              type={fieldMeta?.type === 'date' ? 'date' : fieldMeta?.type === 'number' || fieldMeta?.type === 'money' ? 'number' : 'text'}
                              value={f.value || ''}
                              placeholder="Value"
                              onChange={(e) => updateFilter(idx, { value: e.target.value })}
                              onBlur={() => saveFilters(filterDrafts)}
                            />
                          )}
                          {needsSecondValue && (
                            <input
                              type={fieldMeta?.type === 'date' ? 'date' : 'text'}
                              value={f.value2 || ''}
                              placeholder="and…"
                              onChange={(e) => updateFilter(idx, { value2: e.target.value })}
                              onBlur={() => saveFilters(filterDrafts)}
                            />
                          )}
                          <button type="button" className="btn sm subtle" onClick={() => removeFilter(idx)}>Remove</button>
                        </div>
                      );
                    })}
                    <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={addFilter}>+ Add filter</button>
                  </div>
                </>
              )}

              {!isDetail && source?.dateFields.length > 0 && (
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
              {!isDetail && (
                <div className="field">
                  <label>Chart type</label>
                  <select value={report.chart_type} onChange={(e) => save({ chart_type: e.target.value })}>
                    <option value="bar">Bar chart</option>
                    <option value="table">Table</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>
                  {isDetail ? source?.label : `${source?.label} by ${source?.dimensions.find((d) => d.key === report.group_by)?.label}`}
                </h2>
                <p className="sub" style={{ margin: 0 }}>{isDetail ? 'Detailed list' : metric?.label}</p>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              {loadingData || !data ? (
                <div className="loading">Loading…</div>
              ) : isDetail ? (
                <DetailReportView data={data} />
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

// Renders a "detail" report's result: either a flat row list (no grouping picked) or a nested
// table with group header rows, per-group subtotal rows, one level of subgroups when a second
// group-by is set, and a grand-total row at the bottom — modeled on Salesforce's report builder.
function DetailReportView({ data }) {
  if (!data.columns || data.columns.length === 0) {
    return <div className="empty">Pick at least one column on the left to see data here.</div>;
  }
  if (data.rows.length === 0) {
    return <div className="empty">No matching records for this report yet.</div>;
  }

  function cell(row, col) {
    const v = row[col.key];
    if (col.type === 'money') return money(v);
    if (col.type === 'bool') return v ? 'Yes' : v === false ? 'No' : '—';
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }
  function subtotalCells(subtotals) {
    return data.columns.map((col) => (
      <td key={col.key} className="mono" style={{ textAlign: col.type === 'money' ? 'right' : 'left' }}>
        {col.type === 'money' && Object.prototype.hasOwnProperty.call(subtotals, col.key) ? money(subtotals[col.key]) : ''}
      </td>
    ));
  }
  function dataRow(row, i) {
    return (
      <tr key={i}>
        {data.columns.map((col) => (
          <td key={col.key} className={col.type === 'money' || col.type === 'number' ? 'mono' : ''} style={{ textAlign: col.type === 'money' || col.type === 'number' ? 'right' : 'left' }}>
            {cell(row, col)}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>{data.columns.map((c) => <th key={c.key} style={{ textAlign: c.type === 'money' || c.type === 'number' ? 'right' : 'left' }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.groups ? data.groups.map((g, gi) => (
            <FragmentGroup key={gi} group={g} columns={data.columns} groupByLabel={data.groupByLabel} groupBy2Label={data.groupBy2Label} dataRow={dataRow} subtotalCells={subtotalCells} />
          )) : data.rows.map(dataRow)}
          {data.groups && (
            <tr className="report-grandtotal-row">
              <td colSpan={1}>Grand Total ({data.grandTotal.count})</td>
              {subtotalCells(data.grandTotal.subtotals).slice(1)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({ group, columns, groupByLabel, groupBy2Label, dataRow, subtotalCells }) {
  return (
    <>
      <tr className="report-group-row">
        <td colSpan={columns.length}>{groupByLabel}: {group.key} ({group.count})</td>
      </tr>
      {group.subgroups
        ? group.subgroups.map((sg, si) => (
          <Fragment key={si}>
            <tr className="report-subgroup-row">
              <td colSpan={columns.length}>&nbsp;&nbsp;{groupBy2Label}: {sg.key} ({sg.count})</td>
            </tr>
            {sg.rows.map((r, ri) => dataRow(r, `${si}-${ri}`))}
            <tr className="report-subtotal-row">
              <td>&nbsp;&nbsp;Subtotal</td>
              {subtotalCells(sg.subtotals).slice(1)}
            </tr>
          </Fragment>
        ))
        : group.rows.map((r, ri) => dataRow(r, ri))}
      <tr className="report-subtotal-row">
        <td>Subtotal</td>
        {subtotalCells(group.subtotals).slice(1)}
      </tr>
    </>
  );
}
