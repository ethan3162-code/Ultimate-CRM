import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, dateTime, isoDate, accountName, mapLinks, splitWorkTypes, joinWorkTypes } from '../utils';
import { WORK_TYPES, CUSTOMER_TYPES } from '../constants';
import { usePermission } from '../auth';
import FilterBar from '../components/FilterBar';

const BLANK_FILTERS = { owner: '', customer_type: '', score: '' };
const SCORE_OPTIONS = ['Hot', 'Warm', 'Cool', 'Won', 'Lost'];

// Fresh, unqualified interest lives on the Leads page now — this list picks
// up once a lead has been qualified, so 'new' is intentionally left out here.
const STAGES = ['qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const STAGE_TEXT = { new: 'muted', qualified: 'muted', proposal: 'amber', negotiation: 'amber', won: 'green', lost: 'red' };
const SCORE_ROW_CLASS = { Hot: 'row-hot', Warm: 'row-warm', Cool: '' };

export default function Pipeline() {
  const { canEdit } = usePermission('pipeline');
  const [allDeals, setAllDeals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', value: '', stage: 'qualified', rep: '', work_type: '', customer_type: 'Residential' });
  const [filters, setFilters] = useState(BLANK_FILTERS);

  function load() {
    api.deals().then(setAllDeals);
  }
  useEffect(load, []);

  // Leads (stage 'new') live on their own page — this board is the qualified
  // pipeline onward, so filter them out everywhere below.
  const qualifiedDeals = useMemo(() => allDeals.filter((d) => d.stage !== 'new'), [allDeals]);

  // Owner list reflects who's actually assigned across today's opportunities, rather than a
  // fixed constant, same reasoning as the Leads page's owner filter.
  const ownerOptions = useMemo(() => (
    [...new Set(qualifiedDeals.map((d) => d.owner_username).filter(Boolean))].sort().map((o) => ({ value: o, label: o }))
  ), [qualifiedDeals]);

  const filterDefs = [
    { key: 'owner', label: 'Owner', options: ownerOptions },
    { key: 'customer_type', label: 'Customer type', options: CUSTOMER_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'score', label: 'Score', options: SCORE_OPTIONS.map((s) => ({ value: s, label: s })) },
  ].filter((f) => f.options.length > 0);

  // Applied here, once, so every view (Kanban/Table/Calendar) sees the same filtered set —
  // filtering this board narrows what's on it everywhere, not just one view of it.
  const deals = useMemo(() => qualifiedDeals.filter((d) => (
    (!filters.owner || d.owner_username === filters.owner) &&
    (!filters.customer_type || d.customer_type === filters.customer_type) &&
    (!filters.score || d.label === filters.score)
  )), [qualifiedDeals, filters]);
  const filtersActive = Object.values(filters).some(Boolean);

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p className="sub">
            Qualified deals only — scan everything here, or drag a card across the whole funnel on the <Link to="/kanban">Pipeline</Link> board.
            {' '}<Link to="/leads">New, unqualified leads live here →</Link>
          </p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New opportunity</button>}
      </div>

      {filterDefs.length > 0 && (
        <FilterBar
          filters={filterDefs} values={filters}
          onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
          onClear={() => setFilters(BLANK_FILTERS)}
        />
      )}

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
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Type of work</label>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {WORK_TYPES.map((w) => {
                  const selected = splitWorkTypes(form.work_type);
                  const checked = selected.includes(w);
                  return (
                    <label key={w} className="row" style={{ gap: 5, alignItems: 'center', fontWeight: 400 }}>
                      <input
                        type="checkbox" style={{ width: 'auto' }} checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...selected, w] : selected.filter((v) => v !== w);
                          setForm({ ...form, work_type: joinWorkTypes(WORK_TYPES.filter((t) => next.includes(t))) });
                        }}
                      />
                      {w}
                    </label>
                  );
                })}
              </div>
              <p className="sub" style={{ margin: '4px 0 0' }}>Pick as many as this project needs.</p>
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

      <div className="table-wrap">
        <table className="list deal-table">
          <thead>
            <tr>
              <th>Opportunity Name</th><th>Account Name</th><th>Stage</th><th>Created Date</th><th>Close Date</th>
              <th>Owner</th><th>Project Type</th><th>Amount</th>
              <th>Score</th><th>Phone</th><th>Address</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const links = deal.customer_address ? mapLinks(deal.customer_address) : null;
              const account = accountName(deal, deal.title);
              const oppName = `Opportunity - ${account} - ${isoDate(deal.created_at)}`;
              return (
                <tr key={deal.id} className={SCORE_ROW_CLASS[deal.label] || ''}>
                  <td className="title-cell"><Link to={`/pipeline/${deal.id}`} className="link-strong">{oppName}</Link></td>
                  <td className="muted">{account}</td>
                  <td><span className={'status-text ' + (STAGE_TEXT[deal.stage] || 'muted')}>{STAGE_LABELS[deal.stage]}</span></td>
                  <td className="muted">{dateTime(deal.created_at)}</td>
                  <td className="muted">{shortDate(deal.expected_close)}</td>
                  <td className="muted">{deal.owner_username || '—'}</td>
                  <td className="muted">{deal.customer_type || '—'}</td>
                  <td className="mono">{deal.value ? money(deal.value) : '—'}</td>
                  <td>{deal.label && <span className={'score-text ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span>}</td>
                  <td className="muted">{deal.customer_phone || '—'}</td>
                  <td className="muted">
                    {links ? (
                      <a href={links.view} target="_blank" rel="noreferrer" className="map-link" title="View on Google Maps (satellite)">
                        📍 {deal.customer_address}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
            {deals.length === 0 && <tr><td colSpan={11}><div className="empty">{filtersActive ? 'No opportunities match your filters.' : 'No deals yet.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
