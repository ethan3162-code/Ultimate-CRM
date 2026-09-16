import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate } from '../utils';

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
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
  const [deals, setDeals] = useState([]);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', value: '', stage: 'new' });
  const [view, setView] = useState('kanban');
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  function load() {
    api.deals().then(setDeals);
  }
  useEffect(load, []);

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
    const id = window.__draggedDealId;
    if (!id) return;
    const deal = deals.find((d) => d.id === Number(id));
    if (!deal || deal.stage === stage) return;
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage } : d)));
    await api.updateDeal(deal.id, { stage });
  }

  async function submitDeal(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await api.createDeal({ title: form.title, value: Number(form.value) || 0, stage: form.stage });
    setForm({ title: '', value: '', stage: 'new' });
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
          <h1>Pipeline</h1>
          <p className="sub">Same deals, three views — drag a card to change its stage in Kanban, scan everything at once in Table, or see what's expected to close when in Calendar.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New deal</button>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={'tab' + (view === 'kanban' ? ' active' : '')} onClick={() => setView('kanban')}>Kanban</button>
        <button type="button" className={'tab' + (view === 'table' ? ' active' : '')} onClick={() => setView('table')}>Table</button>
        <button type="button" className={'tab' + (view === 'calendar' ? ' active' : '')} onClick={() => setView('calendar')}>Calendar</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submitDeal} className="form-grid">
            <div className="field">
              <label>Deal title</label>
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
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" type="submit">Create deal</button>
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
                  draggable
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
              <tr><th>Deal</th><th>Contact / company</th><th>Stage</th><th>Value</th><th>Score</th><th>Expected close</th></tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id}>
                  <td className="title-cell"><Link to={`/pipeline/${deal.id}`} className="link-strong">{deal.title}</Link></td>
                  <td className="muted">{deal.company_name || (deal.first_name ? `${deal.first_name} ${deal.last_name}` : '—')}</td>
                  <td>{STAGE_LABELS[deal.stage]}</td>
                  <td className="mono">{money(deal.value)}</td>
                  <td>{deal.label && <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span>}</td>
                  <td className="muted">{shortDate(deal.expected_close)}</td>
                </tr>
              ))}
              {deals.length === 0 && <tr><td colSpan={6}><div className="empty">No deals yet.</div></td></tr>}
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
