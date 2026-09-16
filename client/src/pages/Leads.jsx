import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, timeAgo, mapLinks } from '../utils';
import { LEAD_SOURCES } from '../constants';

const BLANK_FORM = {
  first_name: '', last_name: '', phone: '', email: '', address: '', source: '',
  company_id: '', value: '',
};

export default function Leads() {
  const [deals, setDeals] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [busyId, setBusyId] = useState(null);

  function load() {
    api.deals().then((all) => setDeals(all.filter((d) => d.stage === 'new')));
  }
  useEffect(() => { load(); api.companies().then(setCompanies); }, []);

  const leads = (deals || []).slice().sort((a, b) => b.score - a.score);

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const contact = await api.createContact({
      first_name: form.first_name, last_name: form.last_name, phone: form.phone || null,
      email: form.email || null, address: form.address || null, source: form.source || null,
      company_id: form.company_id || null,
    });
    const title = `${form.first_name} ${form.last_name}${form.source ? ` — ${form.source}` : ' — New inquiry'}`;
    await api.createDeal({
      contact_id: contact.id, company_id: form.company_id || null, title,
      value: Number(form.value) || 0, stage: 'new', source: form.source || null,
    });
    setForm(BLANK_FORM);
    setShowForm(false);
    load();
  }

  async function qualify(deal) {
    setBusyId(deal.id);
    await api.updateDeal(deal.id, { stage: 'qualified' });
    setBusyId(null);
    load();
  }
  async function disqualify(deal) {
    setBusyId(deal.id);
    await api.updateDeal(deal.id, { stage: 'lost' });
    setBusyId(null);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <p className="sub">Fresh, unqualified interest — walk-ins, webhook signups, referrals. Qualify a lead to move it into Opportunities, or disqualify it if it's not a fit.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New lead</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>First name</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city, state" /></div>
            <div className="field">
              <label>Lead source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                <option value="">— none —</option>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Company</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">— none —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Estimated value ($)</label><input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add lead</button></div>
          </form>
        </div>
      )}

      {!deals ? <div className="loading">Loading…</div> : leads.length === 0 ? (
        <div className="card"><div className="empty">No new leads right now. New webhook signups land here automatically.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="list deal-table">
            <thead>
              <tr><th>Lead</th><th>Contact / company</th><th>Phone</th><th>Address</th><th>Source</th><th>Score</th><th>Value</th><th>Received</th><th></th></tr>
            </thead>
            <tbody>
              {leads.map((deal) => {
                const links = deal.customer_address ? mapLinks(deal.customer_address) : null;
                return (
                  <tr key={deal.id}>
                    <td className="title-cell"><Link to={`/pipeline/${deal.id}`} className="link-strong">{deal.title}</Link></td>
                    <td className="muted">{deal.company_name || (deal.first_name ? `${deal.first_name} ${deal.last_name}` : '—')}</td>
                    <td className="muted">{deal.customer_phone || '—'}</td>
                    <td className="muted">
                      {links ? <a href={links.view} target="_blank" rel="noreferrer" className="map-link" title="View on Google Maps (satellite)">📍 {deal.customer_address}</a> : '—'}
                    </td>
                    <td>{deal.source ? <span className="pill">{deal.source}</span> : <span className="muted">—</span>}</td>
                    <td>{deal.label && <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span>}</td>
                    <td className="mono">{money(deal.value)}</td>
                    <td className="muted">{timeAgo(deal.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn sm primary" disabled={busyId === deal.id} onClick={() => qualify(deal)}>Qualify →</button>
                        <button className="btn sm subtle" disabled={busyId === deal.id} onClick={() => disqualify(deal)}>Disqualify</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
