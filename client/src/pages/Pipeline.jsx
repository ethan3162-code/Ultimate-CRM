import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };

export default function Pipeline() {
  const [deals, setDeals] = useState([]);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', value: '', stage: 'new' });

  function load() {
    api.deals().then(setDeals);
  }
  useEffect(load, []);

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
          <p className="sub">Drag a deal card between columns to change its stage — same board renders as Kanban, list, or forecast.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New deal</button>
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
                  <div className="title"><Link to={`/pipeline/${deal.id}`} className="link-strong">{deal.title}</Link></div>
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
    </>
  );
}
