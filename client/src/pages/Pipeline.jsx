import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, mapLinks } from '../utils';
import { WORK_TYPES, CUSTOMER_TYPES } from '../constants';
import { usePermission } from '../auth';

// Fresh, unqualified interest lives on the Leads page now — this board picks
// up once a lead has been qualified, so 'new' is intentionally left out here.
const STAGES = ['qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Pipeline() {
  const { canEdit } = usePermission('pipeline');
  const [allDeals, setAllDeals] = useState([]);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', value: '', stage: 'qualified', rep: '', work_type: '', customer_type: 'Residential' });
  const [view, setView] = useState('kanban');
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  function load() {
    api.deals().then(setAllDeals);
  }
  useEffect(load, []);

  // Leads (stage 'new') live on their own page — this board is the qualified
  // pipeline onward, so filter them out everywhere below.
  const deals = useMemo(() => allDeals.filter((d) => d.stage !== 'new'), [allDeals]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay();
    const gridStart = new Date(first.getTime() - startOffset * 86400000);
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }, [cursor]);

  const byCloseDate = useMemo(() => {
    const map = new Map();
    for (const d of deals) {
      if (!d.expected_close) continue;
      const key = d.expected_close.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return map;
  }, [deals]);

  const today = new Date();

  async function handleDrop(stage) {
    setDragOverStage(null);
    if (!canEdit) return;
    const id = window.__draggedDealId;
    if (!id) return;
    const deal = deals.find((d) => d.id === Number(id));
    if (!deal || deal.stage === stage) return;
    setAllDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage } : d)));
    await api.updateDeal(deal.id, { stage });
  }

  async function submitDeal(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await api.createDeal({
      title: form.title, value: Number(form.value) || 0, stage: form.stage,
      rep: form.rep || null, work_type: form.work_type || null, customer_type: form.customer_type,
    });
    setForm({ title: '', value: '', stage: 'qualified', rep: '', work_type: '', customer_type: 'Residential' });
    setShowForm(false);
    load();
  }

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = deals.filter((d) => d.stage === s);
    return acc;
  }, {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p className="sub">
            Qualified deals only — same three views, drag a card to change its stage in Kanban, scan everything in Table, or see what's expected to close when in Calendar.
            {' '}<Link to="/leads">New, unqualified leads live here →</Link>
          </p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New opportunity</button>}
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={'tab' + (view === 'kanban' ? ' active' : '')} onClick={() => setView('kanban')}>Kanban</button>
        <button type="button" className={'tab' + (view === 'table' ? ' active' : '')} onClick={() => setView('table')}>Table</button>
        <button type="button" className={'tab' + (view === 'calendar' ? ' active' : '')} onClick={() => setView('calendar')}>Calendar</button>
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submitDeal} className="form-grid">
            <div className="field">
              <label>Opportunity title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Acme Corp — Annual renewal" required />
            </div>
            <div className="field">
              <label>Value ($)</label>
              <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
            <div className="field">
              <label>Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Rep / estimator</label>
              <input value={form.rep} onChange={(e) => setForm({ ...form, rep: e.target.value })} placeholder="Who's working this deal?" />
            </div>
            <div className="field">
              <label>Type of work</label>
              <select value={form.work_type} onChange={(e) => setForm({ ...form, work_type: e.target.value })}>
                <option value="">— none —</option>
                {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Customer type</label>
              <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" type="submit">Create opportunity</button>
            </div>
          </form>
        </div>
      )}

      {view === 'kanban' && (
      <div className="kanban">
        {STAGES.map((stage) => {
          const list = byStage[stage];
          const total = list.reduce((s, d) => s + d.value, 0);
          return (
            <div
              key={stage}
              className={'kanban-col' + (dragOverStage === stage ? ' drag-over' : '')}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => { e.preventDefault(); handleDrop(stage); }}
            >
              <div className="kanban-col-head">
                <span className="name">{STAGE_LABELS[stage]} <span className="muted">({list.length})</span></span>
                <span className="value">{money(total)}</span>
              </div>
              {list.map((deal) => (
                <div
                  key={deal.id}
                  className="deal-card"
                  draggable={canEdit}
                  onDragStart={() => { window.__draggedDealId = deal.id; }}
                >
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div className="title"><Link to={`/pipeline/${deal.id}`} className="link-strong">{deal.title}</Link></div>
                    {deal.label && <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.score}</span>}
                  </div>
                  <div className="meta">
                    <span>{deal.company_name || (deal.first_name ? `${deal.first_name} ${deal.last_name}` : '—')}</span>
                    <span className="val">{money(deal.value)}</span>
                  </div>
                  {(deal.customer_phone || deal.customer_address) && (
                    <div className="deal-card-contact">
                      {deal.customer_phone && <span>{deal.customer_phone}</span>}
                      {deal.customer_address && (
                        <a
                          href={mapLinks(deal.customer_address).view}
                          target="_blank" rel="noreferrer"
                          className="map-link"
                          title="View on Google Maps (satellite)"
                          onClick={(e) => e.stopPropagation()}
                          draggable={false}
                        >
                          📍 {deal.customer_address}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {list.length === 0 && <div className="empty" style={{ fontSize: 12, padding: '10px 0' }}>No deals</div>}
            </div>
          );
        })}
      </div>
      )}

      {view === 'table' && (
        <div className="table-wrap">
          <table className="list deal-table">
            <thead>
              <tr><th>Deal</th><th>Contact / company</th><th>Phone</th><th>Address</th><th>Stage</th><th>Value</th><th>Score</th><th>Expected close</th></tr>
            </thead>
            <tbody>
              {deals.map((deal) => {
                const links = deal.customer_address ? mapLinks(deal.customer_address) : null;
                return (
                  <tr key={deal.id}>
                    <td className="title-cell"><Link to={`/pipeline/${deal.id}`} className="link-strong">{deal.title}</Link></td>
                    <td className="muted">{deal.company_name || (deal.first_name ? `${deal.first_name} ${deal.last_name}` : '—')}</td>
                    <td className="muted">{deal.customer_phone || '—'}</td>
                    <td className="muted">
                      {links ? (
                        <a href={links.view} target="_blank" rel="noreferrer" className="map-link" title="View on Google Maps (satellite)">
                          📍 {deal.customer_address}
                        </a>
                      ) : '—'}
                    </td>
                    <td>{STAGE_LABELS[deal.stage]}</td>
                    <td className="mono">{money(deal.value)}</td>
                    <td>{deal.label && <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span>}</td>
                    <td className="muted">{shortDate(deal.expected_close)}</td>
                  </tr>
                );
              })}
              {deals.length === 0 && <tr><td colSpan={8}><div className="empty">No deals yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === 'calendar' && (
        <>
          <div className="cal-toolbar">
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
              <strong style={{ minWidth: 140, textAlign: 'center' }}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <button className="btn sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
              <button className="btn sm" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</button>
            </div>
            <span className="sub" style={{ margin: 0 }}>Plotted by expected close date</span>
          </div>
          <div className="cal-grid">
            {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
            {cells.map((day, i) => {
              const key = ymd(day);
              const items = byCloseDate.get(key) || [];
              const outside = day.getMonth() !== cursor.getMonth();
              const isToday = sameDay(day, today);
              return (
                <div key={i} className={'cal-cell' + (outside ? ' outside' : '') + (isToday ? ' today' : '')}>
                  <div className="daynum">{day.getDate()}</div>
                  {items.slice(0, 3).map((d) => (
                    <Link key={d.id} to={`/pipeline/${d.id}`} className="cal-event" title={d.title}>{d.title}</Link>
                  ))}
                  {items.length > 3 && <div className="cal-event" style={{ background: 'transparent', border: 'none', color: 'var(--muted)' }}>+{items.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
