import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, dateTime, accountName, mapLinks, splitWorkTypes, joinWorkTypes } from '../utils';
import { usePermission } from '../auth';
import {
  LEAD_SOURCES, LEAD_STATUSES, LEAD_TYPES, JOB_TIMEFRAMES, METHOD_OF_ENTRY,
  HA_MATCH_TYPES, WORK_TYPES, CUSTOMER_TYPES,
} from '../constants';
import FilterBar from '../components/FilterBar';

const BLANK_FILTERS = { lead_status: '', source: '', owner: '', score: '' };

const BLANK_FORM = {
  first_name: '', last_name: '', phone: '', mobile_phone: '', email: '', address: '', source: '',
  company_id: '', value: '',
  method_of_entry: '', lead_type: '', job_timeframe: '', followup_date: '',
  work_type: '', sub_service_type: '', customer_type: 'Residential',
  project_description: '', phone_estimate: false, repeat_referral: false,
  lead_owner: '', rep: '', ha_lead_fee: '', ha_match_type: '',
};

const LEAD_STATUS_TEXT = { New: 'muted', 'Follow Up': 'amber', Unresponsive: 'red', Restart: 'amber', Lost: 'red', Converted: 'green' };
const SCORE_ROW_CLASS = { Hot: 'row-hot', Warm: 'row-warm', Cool: '' };

export default function Leads() {
  const { canEdit } = usePermission('leads');
  const [deals, setDeals] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [busyId, setBusyId] = useState(null);
  const [filters, setFilters] = useState(BLANK_FILTERS);

  function load() {
    api.deals().then((all) => setDeals(all.filter((d) => d.stage === 'new')));
  }
  useEffect(() => { load(); api.companies().then(setCompanies); }, []);

  const allLeads = (deals || []).slice().sort((a, b) => b.score - a.score);

  // Owner list is whatever's actually present on today's leads (free-form per company), rather
  // than a fixed constant — so the dropdown never shows an owner nobody's been assigned yet.
  const ownerOptions = useMemo(() => (
    [...new Set(allLeads.map((d) => d.owner_username).filter(Boolean))].sort().map((o) => ({ value: o, label: o }))
  ), [allLeads]);

  const filterDefs = [
    { key: 'lead_status', label: 'Status', options: LEAD_STATUSES.map((s) => ({ value: s, label: s })) },
    { key: 'source', label: 'Source', options: LEAD_SOURCES.map((s) => ({ value: s, label: s })) },
    { key: 'owner', label: 'Owner', options: ownerOptions },
    { key: 'score', label: 'Priority', options: [{ value: 'Hot', label: 'Hot' }, { value: 'Warm', label: 'Warm' }, { value: 'Cool', label: 'Cool' }] },
  ].filter((f) => f.options.length > 0);

  const leads = allLeads.filter((d) => (
    (!filters.lead_status || (d.lead_status || 'New') === filters.lead_status) &&
    (!filters.source || d.source === filters.source) &&
    (!filters.owner || d.owner_username === filters.owner) &&
    (!filters.score || d.label === filters.score)
  ));
  const filtersActive = Object.values(filters).some(Boolean);

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const contact = await api.createContact({
      first_name: form.first_name, last_name: form.last_name, phone: form.phone || null,
      mobile_phone: form.mobile_phone || null, email: form.email || null, address: form.address || null,
      source: form.source || null, company_id: form.company_id || null,
    });
    const title = `${form.first_name} ${form.last_name}${form.source ? ` — ${form.source}` : ' — New inquiry'}`;
    await api.createDeal({
      contact_id: contact.id, company_id: form.company_id || null, title,
      value: Number(form.value) || 0, stage: 'new', source: form.source || null,
      method_of_entry: form.method_of_entry || null, lead_type: form.lead_type || null,
      job_timeframe: form.job_timeframe || null, followup_date: form.followup_date || null,
      work_type: form.work_type || null, sub_service_type: form.sub_service_type || null,
      customer_type: form.customer_type,
      project_description: form.project_description || null,
      phone_estimate: form.phone_estimate, repeat_referral: form.repeat_referral,
      lead_owner: form.lead_owner || null, rep: form.rep || null,
      ha_lead_fee: form.ha_lead_fee === '' ? null : Number(form.ha_lead_fee),
      ha_match_type: form.ha_match_type || null,
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
  async function setLeadStatus(deal, lead_status) {
    setBusyId(deal.id);
    await api.updateDeal(deal.id, { lead_status });
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
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New lead</button>}
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>First name</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Mobile</label><input value={form.mobile_phone} onChange={(e) => setForm({ ...form, mobile_phone: e.target.value })} /></div>
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
              <label>Method of entry</label>
              <select value={form.method_of_entry} onChange={(e) => setForm({ ...form, method_of_entry: e.target.value })}>
                <option value="">— none —</option>
                {METHOD_OF_ENTRY.map((m) => <option key={m} value={m}>{m}</option>)}
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

            <div className="field" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
              <div className="kicker">Inquiry</div>
            </div>
            <div className="field">
              <label>Lead type</label>
              <select value={form.lead_type} onChange={(e) => setForm({ ...form, lead_type: e.target.value })}>
                <option value="">— none —</option>
                {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Job timeframe</label>
              <select value={form.job_timeframe} onChange={(e) => setForm({ ...form, job_timeframe: e.target.value })}>
                <option value="">— none —</option>
                {JOB_TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Follow-up date</label><input type="date" value={form.followup_date} onChange={(e) => setForm({ ...form, followup_date: e.target.value })} /></div>
            <div className="field">
              <label>Property type</label>
              <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Service type</label>
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
            <div className="field"><label>Sub-service type</label><input value={form.sub_service_type} onChange={(e) => setForm({ ...form, sub_service_type: e.target.value })} placeholder="e.g. Driveway repair" /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Project description</label>
              <textarea rows={2} value={form.project_description} onChange={(e) => setForm({ ...form, project_description: e.target.value })} placeholder="What does the customer want done?" />
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="phone_estimate" checked={form.phone_estimate} onChange={(e) => setForm({ ...form, phone_estimate: e.target.checked })} style={{ width: 'auto' }} />
              <label htmlFor="phone_estimate" style={{ margin: 0 }}>Can be estimated by phone</label>
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="repeat_referral" checked={form.repeat_referral} onChange={(e) => setForm({ ...form, repeat_referral: e.target.checked })} style={{ width: 'auto' }} />
              <label htmlFor="repeat_referral" style={{ margin: 0 }}>Repeat customer / referral</label>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
              <div className="kicker">Assignment &amp; lead cost</div>
            </div>
            <div className="field"><label>Lead owner</label><input value={form.lead_owner} onChange={(e) => setForm({ ...form, lead_owner: e.target.value })} placeholder="Who owns this lead?" /></div>
            <div className="field"><label>Estimator</label><input value={form.rep} onChange={(e) => setForm({ ...form, rep: e.target.value })} placeholder="Who'll run the estimate?" /></div>
            <div className="field"><label>Lead fee ($)</label><input type="number" min="0" step="0.01" value={form.ha_lead_fee} onChange={(e) => setForm({ ...form, ha_lead_fee: e.target.value })} placeholder="e.g. HomeAdvisor/Angi fee" /></div>
            <div className="field">
              <label>Lead match type</label>
              <select value={form.ha_match_type} onChange={(e) => setForm({ ...form, ha_match_type: e.target.value })}>
                <option value="">— none —</option>
                {HA_MATCH_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add lead</button></div>
          </form>
        </div>
      )}

      {!deals ? <div className="loading">Loading…</div> : (
        <>
          {allLeads.length > 0 && filterDefs.length > 0 && (
            <FilterBar
              filters={filterDefs} values={filters}
              onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
              onClear={() => setFilters(BLANK_FILTERS)}
            />
          )}
          {leads.length === 0 ? (
            <div className="card">
              <div className="empty">{filtersActive ? 'No leads match your filters.' : "No new leads right now. New webhook signups land here automatically."}</div>
            </div>
          ) : (
        <div className="table-wrap">
          <table className="list deal-table">
            <thead>
              <tr>
                <th>Name</th><th>Company</th><th>Lead Status</th><th>Created Date</th><th>Owner Alias</th>
                <th>Project Type</th><th>Service Type</th><th>Phone</th><th>Follow-up</th>
                <th>Address</th><th>Source</th><th>Score</th><th>Value</th><th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((deal) => {
                const links = deal.customer_address ? mapLinks(deal.customer_address) : null;
                const name = deal.first_name ? `${deal.first_name} ${deal.last_name}` : deal.title;
                return (
                  <tr key={deal.id} className={SCORE_ROW_CLASS[deal.label] || ''}>
                    <td className="title-cell"><Link to={`/pipeline/${deal.id}`} className="link-strong">{name}</Link></td>
                    <td className="muted">{accountName(deal, deal.title)}</td>
                    <td>
                      <select
                        value={deal.lead_status || 'New'}
                        disabled={busyId === deal.id || !canEdit}
                        onChange={(e) => setLeadStatus(deal, e.target.value)}
                        className={'status-select ' + (LEAD_STATUS_TEXT[deal.lead_status] || 'muted')}
                      >
                        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="muted">{dateTime(deal.created_at)}</td>
                    <td className="muted">{deal.owner_username || '—'}</td>
                    <td className="muted">{deal.customer_type || '—'}</td>
                    <td className="muted">{splitWorkTypes(deal.work_type).join(', ') || '—'}</td>
                    <td className="muted">{deal.customer_phone || '—'}</td>
                    <td className="muted">{shortDate(deal.followup_date)}</td>
                    <td className="muted">
                      {links ? <a href={links.view} target="_blank" rel="noreferrer" className="map-link" title="View on Google Maps (satellite)">📍 {deal.customer_address}</a> : '—'}
                    </td>
                    <td className="muted">{deal.source || '—'}</td>
                    <td>{deal.label && <span className={'score-text ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span>}</td>
                    <td className="mono">{money(deal.value)}</td>
                    <td>
                      {canEdit && (
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn sm primary" disabled={busyId === deal.id} onClick={() => qualify(deal)}>Qualify →</button>
                          <button className="btn sm subtle" disabled={busyId === deal.id} onClick={() => disqualify(deal)}>Disqualify</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
    </>
  );
}
