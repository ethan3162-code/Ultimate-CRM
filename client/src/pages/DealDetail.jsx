import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, mapLinks } from '../utils';
import {
  WORK_TYPES, CUSTOMER_TYPES, LEAD_STATUSES, LEAD_TYPES, JOB_TIMEFRAMES,
  METHOD_OF_ENTRY, HA_MATCH_TYPES,
} from '../constants';
import AiDraftModal from '../components/AiDraftModal';
import TaskList from '../components/TaskList';

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [details, setDetails] = useState(blankDetails());
  const [savingDetails, setSavingDetails] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState({ project_description: '', inquiry_notes: '', lead_notes: '' });
  const [savingNotes, setSavingNotes] = useState(false);

  function blankDetails(d) {
    return {
      lead_status: d?.lead_status || 'New', lead_type: d?.lead_type || '', method_of_entry: d?.method_of_entry || '',
      job_timeframe: d?.job_timeframe || '', followup_date: d?.followup_date || '',
      rep: d?.rep || '', lead_owner: d?.lead_owner || '',
      work_type: d?.work_type || '', sub_service_type: d?.sub_service_type || '', customer_type: d?.customer_type || 'Residential',
      phone_estimate: !!d?.phone_estimate, repeat_referral: !!d?.repeat_referral,
      ha_lead_fee: d?.ha_lead_fee ?? '', ha_match_type: d?.ha_match_type || '',
    };
  }

  function load() {
    api.deal(id).then((d) => {
      setDeal(d);
      setDetails(blankDetails(d));
      setNotes({ project_description: d.project_description || '', inquiry_notes: d.inquiry_notes || '', lead_notes: d.lead_notes || '' });
    });
  }
  useEffect(load, [id]);

  async function saveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    await api.updateDeal(id, { ...details, ha_lead_fee: details.ha_lead_fee === '' ? null : Number(details.ha_lead_fee) });
    setSavingDetails(false);
    setEditingDetails(false);
    load();
  }

  async function saveNotes(e) {
    e.preventDefault();
    setSavingNotes(true);
    await api.updateDeal(id, notes);
    setSavingNotes(false);
    setEditingNotes(false);
    load();
  }

  async function changeStage(stage) {
    await api.updateDeal(id, { stage });
    load();
  }

  async function createProject() {
    const job = await api.createJob({
      contact_id: deal.contact_id || null, company_id: deal.company_id || null, deal_id: deal.id,
      title: deal.title, status: 'scheduled', address: deal.customer_address || null,
    });
    navigate(`/jobs/${job.id}`);
  }

  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await fetch(`/api/deals/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, type: 'note' }),
    });
    setNote('');
    load();
  }

  async function openDraft(kind, title) {
    const d = await api.aiDraft(kind, id);
    setDraft(d);
    setDraftTitle(title);
  }
  async function logDraft({ subject, body }) {
    await fetch(`/api/deals/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: `Email sent — "${subject}": ${body}`, type: 'email' }),
    });
    load();
  }

  if (!deal) return <div className="loading">Loading…</div>;

  const links = deal.customer_address ? mapLinks(deal.customer_address) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}>
            {deal.stage === 'new' ? <Link to="/leads">Leads</Link> : <Link to="/pipeline">Opportunities</Link>} / {deal.title}
          </p>
          <h1>{deal.title} <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span></h1>
          <p className="sub">
            {deal.company_name || (deal.first_name ? `${deal.first_name} ${deal.last_name}` : 'No contact linked')}
            {' · '}{money(deal.value)} · expected close {shortDate(deal.expected_close)}
            {deal.source ? ` · source: ${deal.source}` : ''}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => openDraft('deal_follow_up', 'Draft follow-up')}>Draft follow-up</button>
          <button className="btn" onClick={() => openDraft('deal_recap', 'Draft recap')}>Draft recap</button>
          <button className="btn subtle" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Activity</h2>
          <form onSubmit={addNote} className="row" style={{ marginBottom: 14, gap: 8 }}>
            <input style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--paper)' }} placeholder="Log a note or call…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" type="submit">Add</button>
          </form>
          {deal.activities.length === 0 ? <div className="empty">No activity yet.</div> : (
            <div className="timeline">
              {deal.activities.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="when">{timeAgo(a.created_at)}</div>
                  <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          {(deal.customer_phone || deal.customer_address) && (
            <div className="card">
              <h2>Customer info</h2>
              <div className="stack" style={{ gap: 6, marginBottom: links ? 12 : 0 }}>
                {deal.customer_phone && (
                  <div className="row between"><span className="muted">Phone</span><a href={`tel:${deal.customer_phone}`}>{deal.customer_phone}</a></div>
                )}
                {deal.customer_address && (
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <span className="muted">Address</span>
                    <span style={{ textAlign: 'right' }}>{deal.customer_address}</span>
                  </div>
                )}
              </div>
              {links && (
                <a href={links.view} target="_blank" rel="noreferrer" className="btn sm primary map-cta">
                  🛰️ View satellite location →
                </a>
              )}
            </div>
          )}
          <div className="card">
            <div className="row between" style={{ marginBottom: editingDetails ? 10 : 0 }}>
              <h2 style={{ margin: 0 }}>Lead &amp; opportunity details</h2>
              {!editingDetails && <button className="btn sm subtle" onClick={() => setEditingDetails(true)}>Edit</button>}
            </div>
            {editingDetails ? (
              <form onSubmit={saveDetails} className="stack" style={{ gap: 10 }}>
                <div className="field">
                  <label>Lead status</label>
                  <select value={details.lead_status} onChange={(e) => setDetails({ ...details, lead_status: e.target.value })}>
                    {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Lead type</label>
                  <select value={details.lead_type} onChange={(e) => setDetails({ ...details, lead_type: e.target.value })}>
                    <option value="">— none —</option>
                    {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Method of entry</label>
                  <select value={details.method_of_entry} onChange={(e) => setDetails({ ...details, method_of_entry: e.target.value })}>
                    <option value="">— none —</option>
                    {METHOD_OF_ENTRY.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Job timeframe</label>
                  <select value={details.job_timeframe} onChange={(e) => setDetails({ ...details, job_timeframe: e.target.value })}>
                    <option value="">— none —</option>
                    {JOB_TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Follow-up date</label>
                  <input type="date" value={details.followup_date || ''} onChange={(e) => setDetails({ ...details, followup_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Rep / estimator</label>
                  <input value={details.rep} onChange={(e) => setDetails({ ...details, rep: e.target.value })} placeholder="Who's working this deal?" />
                </div>
                <div className="field">
                  <label>Lead owner</label>
                  <input value={details.lead_owner} onChange={(e) => setDetails({ ...details, lead_owner: e.target.value })} />
                </div>
                <div className="field">
                  <label>Property type</label>
                  <select value={details.customer_type} onChange={(e) => setDetails({ ...details, customer_type: e.target.value })}>
                    {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Service type</label>
                  <select value={details.work_type} onChange={(e) => setDetails({ ...details, work_type: e.target.value })}>
                    <option value="">— none —</option>
                    {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Sub-service type</label>
                  <input value={details.sub_service_type} onChange={(e) => setDetails({ ...details, sub_service_type: e.target.value })} placeholder="e.g. Driveway repair" />
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" id="de_phone_estimate" checked={details.phone_estimate} onChange={(e) => setDetails({ ...details, phone_estimate: e.target.checked })} style={{ width: 'auto' }} />
                  <label htmlFor="de_phone_estimate" style={{ margin: 0 }}>Can be estimated by phone</label>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" id="de_repeat_referral" checked={details.repeat_referral} onChange={(e) => setDetails({ ...details, repeat_referral: e.target.checked })} style={{ width: 'auto' }} />
                  <label htmlFor="de_repeat_referral" style={{ margin: 0 }}>Repeat customer / referral</label>
                </div>
                <div className="field">
                  <label>Lead fee ($)</label>
                  <input type="number" min="0" step="0.01" value={details.ha_lead_fee} onChange={(e) => setDetails({ ...details, ha_lead_fee: e.target.value })} placeholder="e.g. HomeAdvisor/Angi fee" />
                </div>
                <div className="field">
                  <label>Lead match type</label>
                  <select value={details.ha_match_type} onChange={(e) => setDetails({ ...details, ha_match_type: e.target.value })}>
                    <option value="">— none —</option>
                    {HA_MATCH_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={savingDetails}>{savingDetails ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditingDetails(false); setDetails(blankDetails(deal)); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                <div className="row between"><span className="muted">Lead status</span><span className={'pill ' + ({ New: '', 'Follow Up': 'amber', Unresponsive: 'red', Restart: 'amber', Lost: 'red', Converted: 'green' }[deal.lead_status] || '')}>{deal.lead_status || 'New'}</span></div>
                <div className="row between"><span className="muted">Lead type</span><span>{deal.lead_type || '—'}</span></div>
                <div className="row between"><span className="muted">Method of entry</span><span>{deal.method_of_entry || '—'}</span></div>
                <div className="row between"><span className="muted">Job timeframe</span><span>{deal.job_timeframe || '—'}</span></div>
                <div className="row between"><span className="muted">Follow-up date</span><span>{deal.followup_date ? shortDate(deal.followup_date) : '—'}</span></div>
                <div className="row between"><span className="muted">Rep / estimator</span><span>{deal.rep || '—'}</span></div>
                <div className="row between"><span className="muted">Lead owner</span><span>{deal.lead_owner || '—'}</span></div>
                <div className="row between"><span className="muted">Property type</span><span>{deal.customer_type || 'Residential'}</span></div>
                <div className="row between"><span className="muted">Service type</span><span>{deal.work_type || '—'}</span></div>
                <div className="row between"><span className="muted">Sub-service type</span><span>{deal.sub_service_type || '—'}</span></div>
                <div className="row between"><span className="muted">Phone estimate</span><span>{deal.phone_estimate ? 'Yes' : 'No'}</span></div>
                <div className="row between"><span className="muted">Repeat / referral</span><span>{deal.repeat_referral ? 'Yes' : 'No'}</span></div>
                <div className="row between"><span className="muted">Lead fee</span><span>{deal.ha_lead_fee ? money(deal.ha_lead_fee) : '—'}</span></div>
                <div className="row between"><span className="muted">Lead match type</span><span>{deal.ha_match_type || '—'}</span></div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="row between" style={{ marginBottom: editingNotes ? 10 : 0 }}>
              <h2 style={{ margin: 0 }}>Notes &amp; inquiry</h2>
              {!editingNotes && <button className="btn sm subtle" onClick={() => setEditingNotes(true)}>Edit</button>}
            </div>
            {editingNotes ? (
              <form onSubmit={saveNotes} className="stack" style={{ gap: 10 }}>
                <div className="field">
                  <label>Project description</label>
                  <textarea rows={3} value={notes.project_description} onChange={(e) => setNotes({ ...notes, project_description: e.target.value })} placeholder="What does the customer want done?" />
                </div>
                <div className="field">
                  <label>Inquiry notes</label>
                  <textarea rows={2} value={notes.inquiry_notes} onChange={(e) => setNotes({ ...notes, inquiry_notes: e.target.value })} />
                </div>
                <div className="field">
                  <label>Lead notes</label>
                  <textarea rows={2} value={notes.lead_notes} onChange={(e) => setNotes({ ...notes, lead_notes: e.target.value })} />
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={savingNotes}>{savingNotes ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditingNotes(false); setNotes({ project_description: deal.project_description || '', inquiry_notes: deal.inquiry_notes || '', lead_notes: deal.lead_notes || '' }); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Project description</div>
                  <div>{deal.project_description || '—'}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Inquiry notes</div>
                  <div>{deal.inquiry_notes || '—'}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Lead notes</div>
                  <div>{deal.lead_notes || '—'}</div>
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <h2>Stage</h2>
            <div className="stack" style={{ gap: 6 }}>
              {STAGES.map((s) => (
                <button
                  key={s}
                  className={'btn sm' + (deal.stage === s ? ' primary' : '')}
                  style={{ justifyContent: 'flex-start', textTransform: 'capitalize' }}
                  onClick={() => changeStage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Project</h2>
            {deal.jobs && deal.jobs.length > 0 ? (
              <div className="stack" style={{ gap: 2 }}>
                {deal.jobs.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="attention-row">
                    <span>{j.title}</span>
                    <span className="pill">{j.status.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            ) : deal.stage === 'won' ? (
              <>
                <p className="sub" style={{ margin: '-4px 0 10px' }}>This opportunity is won — turn it into a project to start scheduling field work, estimates, and billing.</p>
                <button className="btn primary sm" onClick={createProject}>+ Create project</button>
              </>
            ) : (
              <div className="empty">Projects start once this opportunity is won.</div>
            )}
          </div>
          <div className="card">
            <h2>Next steps</h2>
            <TaskList relatedType="deal" relatedId={deal.id} />
          </div>
        </div>
      </div>

      {draft && (
        <AiDraftModal title={draftTitle} initialDraft={draft} onClose={() => setDraft(null)} onLog={logDraft} />
      )}
    </>
  );
}
