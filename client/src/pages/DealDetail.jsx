import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, mapLinks, splitWorkTypes, joinWorkTypes, estimateTotal, estimateSubtotal } from '../utils';
import {
  WORK_TYPES, CUSTOMER_TYPES, LEAD_STATUSES, LEAD_TYPES, JOB_TIMEFRAMES,
  METHOD_OF_ENTRY, HA_MATCH_TYPES, LEAD_SOURCES,
} from '../constants';
import AiDraftModal from '../components/AiDraftModal';
import AppointmentModal from '../components/AppointmentModal';
import TaskList from '../components/TaskList';
import LineItemEditor from '../components/LineItemEditor';
import PricingAdjustments from '../components/PricingAdjustments';
import PaymentScheduleEditor from '../components/PaymentScheduleEditor';
import DisplayOptions from '../components/DisplayOptions';
import { usePermission, useSection, usePriceVisibility } from '../auth';

const BLANK_ESTIMATE_ITEM = { description: '', notes: '', qty: 1, unit_price: 0 };

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
// A lead only becomes an Opportunity by having an appointment scheduled against it (see
// routes/appointments.js's POST handler, which does the promotion itself) — so jumping straight
// from 'new' into any of these here is blocked, both by the server and by disabling the buttons
// below, until an appointment exists. 'lost' stays open — disqualifying a lead needs no appointment.
const OPPORTUNITY_STAGES = ['qualified', 'proposal', 'negotiation', 'won'];
// Same idea as Estimates.jsx's own status pills, collapsed to the four states that matter here:
// a project is created automatically the moment "signed" happens, so this card never needs to
// distinguish "signed" further — that state is fleeting, replaced by an actual project a moment
// later — but it's included for the rare stale-render case.
const ESTIMATE_STATUS_LABEL = { draft: 'Drafted — not yet sent', sent: 'Sent — awaiting signature', signed: 'Signed', declined: 'Declined' };
const ESTIMATE_STATUS_PILL = { draft: '', sent: 'amber', signed: 'green', declined: 'red' };

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = usePermission('pipeline');
  const aboutSectionEditable = useSection('pipeline.about');
  const notesSectionEditable = useSection('pipeline.notes');
  const canEditAbout = canEdit && aboutSectionEditable;
  const canEditNotes = canEdit && notesSectionEditable;
  const canSeePrices = usePriceVisibility();
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
  const [directory, setDirectory] = useState([]);
  const [savingOwner, setSavingOwner] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);
  const [about, setAbout] = useState(blankAbout());
  const [savingAbout, setSavingAbout] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactInfo, setContactInfo] = useState({ phone: '', address: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);

  // Create Estimate, inline on the Opportunity itself (Sept 2026) — the same line-item/markup/
  // discount/payment-schedule builder Estimates.jsx and JobDetail.jsx use, embedded directly on
  // this page instead of sending someone off to the company-wide Estimates page just to start one.
  // Submits through the same deal-anchored POST /api/estimates every "+ Create estimate" entry
  // point already used (api.createEstimateForDeal) — nothing new server-side, just a closer door.
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [estimateItems, setEstimateItems] = useState([{ ...BLANK_ESTIMATE_ITEM }]);
  const [estimateTaxRate, setEstimateTaxRate] = useState('0');
  const [estimateMarkupPercent, setEstimateMarkupPercent] = useState('');
  const [estimateDiscountType, setEstimateDiscountType] = useState(null);
  const [estimateDiscountValue, setEstimateDiscountValue] = useState('');
  const [estimateDepositPercent, setEstimateDepositPercent] = useState('');
  const [estimatePaymentSchedule, setEstimatePaymentSchedule] = useState([]);
  const [estimateContractId, setEstimateContractId] = useState('');
  const [estimateDisplayOptions, setEstimateDisplayOptions] = useState({ show_rate: true, show_qty: true, show_item_total: true });
  const [savingEstimate, setSavingEstimate] = useState(false);

  function blankDetails(d) {
    return {
      lead_status: d?.lead_status || 'New', lead_type: d?.lead_type || '', method_of_entry: d?.method_of_entry || '',
      job_timeframe: d?.job_timeframe || '', followup_date: d?.followup_date || '',
      rep: d?.rep || '', lead_owner: d?.lead_owner || '',
      work_type: d?.work_type || '', sub_service_type: d?.sub_service_type || '', customer_type: d?.customer_type || 'Residential',
      phone_estimate: !!d?.phone_estimate, repeat_referral: !!d?.repeat_referral,
      ha_lead_fee: d?.ha_lead_fee ?? '', ha_match_type: d?.ha_match_type || '',
      preferred_callback_time: d?.preferred_callback_time || '', preferred_consult_time: d?.preferred_consult_time || '',
    };
  }

  function blankAbout(d) {
    return {
      title: d?.title || '', value: d?.value ?? '', probability: d?.probability ?? 20,
      expected_close: d?.expected_close || '', source: d?.source || '',
    };
  }

  function load() {
    api.deal(id).then((d) => {
      setDeal(d);
      setDetails(blankDetails(d));
      setAbout(blankAbout(d));
      setContactInfo({ phone: d.contact_phone || '', address: d.contact_address || '' });
      setNotes({ project_description: d.project_description || '', inquiry_notes: d.inquiry_notes || '', lead_notes: d.lead_notes || '' });
    });
  }
  useEffect(load, [id]);
  useEffect(() => { api.usersDirectory().then(setDirectory).catch(() => setDirectory([])); }, []);
  useEffect(() => { api.catalogItems().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => { api.contracts().then(setContracts).catch(() => setContracts([])); }, []);

  async function submitEstimate(e) {
    e.preventDefault();
    const cleanItems = estimateItems.filter((it) => it.description.trim());
    if (!cleanItems.length) return;
    setSavingEstimate(true);
    try {
      await api.createEstimateForDeal({
        deal_id: deal.id,
        tax_rate: Number(estimateTaxRate) || 0,
        markup_percent: Number(estimateMarkupPercent) || 0,
        discount_type: estimateDiscountType,
        discount_value: Number(estimateDiscountValue) || 0,
        deposit_percent: Number(estimateDepositPercent) || 0,
        items: cleanItems.map((it) => ({ description: it.description, notes: it.notes || '', qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
        payment_schedule: estimatePaymentSchedule.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), percent: Number(r.percent) || 0 })),
        contract_id: estimateContractId ? Number(estimateContractId) : null,
        ...estimateDisplayOptions,
      });
      setEstimateItems([{ ...BLANK_ESTIMATE_ITEM }]);
      setEstimateTaxRate('0');
      setEstimateMarkupPercent('');
      setEstimateDiscountType(null);
      setEstimateDiscountValue('');
      setEstimateDepositPercent('');
      setEstimatePaymentSchedule([]);
      setEstimateContractId('');
      setEstimateDisplayOptions({ show_rate: true, show_qty: true, show_item_total: true });
      setShowEstimateForm(false);
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSavingEstimate(false);
    }
  }

  async function saveOwner(e) {
    const owner_user_id = e.target.value ? Number(e.target.value) : null;
    setSavingOwner(true);
    await api.updateDeal(id, { owner_user_id }).catch((err) => window.alert(err.message));
    setSavingOwner(false);
    load();
  }

  async function saveAbout(e) {
    e.preventDefault();
    setSavingAbout(true);
    await api.updateDeal(id, {
      ...about, value: about.value === '' ? 0 : Number(about.value), probability: about.probability === '' ? 0 : Number(about.probability),
    }).catch((err) => window.alert(err.message));
    setSavingAbout(false);
    setEditingAbout(false);
    load();
  }

  async function saveContactInfo(e) {
    e.preventDefault();
    setSavingContact(true);
    await api.updateContact(deal.contact_id, contactInfo).catch((err) => window.alert(err.message));
    setSavingContact(false);
    setEditingContact(false);
    load();
  }

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
    await api.updateDeal(id, { stage }).catch((err) => window.alert(err.message));
    load();
  }

  async function saveAppointment(payload) {
    await api.createAppointment({ ...payload, deal_id: deal.id, company_id: deal.company_id || null });
    setShowApptModal(false);
    load();
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
  const hasAppointment = deal.appointments && deal.appointments.length > 0;
  // A project is only ever created once a customer signs an estimate (see routes/public.js) —
  // never at estimate creation — so while there's no project yet, show the most recent estimate's
  // own status instead of any way to jump straight to a project.
  const latestEstimate = deal.estimates && deal.estimates.length > 0 ? deal.estimates[0] : null;
  const estimateStatusKey = latestEstimate
    ? (latestEstimate.declined_at ? 'declined' : latestEstimate.signed_at ? 'signed' : latestEstimate.status === 'sent' ? 'sent' : 'draft')
    : null;

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
          {canEdit && <button className="btn" onClick={() => openDraft('deal_follow_up', 'Draft follow-up')}>Draft follow-up</button>}
          {canEdit && <button className="btn" onClick={() => openDraft('deal_recap', 'Draft recap')}>Draft recap</button>}
          <button className="btn subtle" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          {(deal.contact_id || deal.customer_phone || deal.customer_address) && (
            <div className="card section-card accent-blue">
              <div className="row between" style={{ marginBottom: editingContact ? 10 : 6 }}>
                <h2 className="section-label" style={{ margin: 0 }}>Get in touch</h2>
                {!editingContact && canEdit && deal.contact_id && <button className="btn sm subtle" onClick={() => setEditingContact(true)}>Edit</button>}
              </div>
              {editingContact ? (
                <form onSubmit={saveContactInfo} className="stack" style={{ gap: 10 }}>
                  <div className="field"><label>Phone</label><input value={contactInfo.phone} onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })} /></div>
                  <div className="field"><label>Address</label><input value={contactInfo.address} onChange={(e) => setContactInfo({ ...contactInfo, address: e.target.value })} placeholder="Street, city, state" /></div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn primary sm" type="submit" disabled={savingContact}>{savingContact ? 'Saving…' : 'Save'}</button>
                    <button className="btn sm subtle" type="button" onClick={() => { setEditingContact(false); setContactInfo({ phone: deal.contact_phone || '', address: deal.contact_address || '' }); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="stack" style={{ gap: 6, marginBottom: links ? 12 : 0 }}>
                    <div className="row between"><span className="muted">Phone</span>{deal.customer_phone ? <a href={`tel:${deal.customer_phone}`}>{deal.customer_phone}</a> : <span className="muted">—</span>}</div>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <span className="muted">Address</span>
                      <span style={{ textAlign: 'right' }}>{deal.customer_address || '—'}</span>
                    </div>
                    {!deal.contact_id && deal.company_id && (
                      <p className="sub" style={{ margin: 0 }}>Pulled from <Link to={`/companies/${deal.company_id}`}>{deal.company_name}</Link> — edit it there, or link a contact to this opportunity to edit it here.</p>
                    )}
                  </div>
                  {links && (
                    <a href={links.view} target="_blank" rel="noreferrer" className="btn sm primary map-cta">
                      🛰️ View satellite location →
                    </a>
                  )}
                </>
              )}
            </div>
          )}
          <div className="card section-card accent-purple">
            <div className="row between" style={{ marginBottom: editingAbout ? 10 : 6 }}>
              <h2 className="section-label" style={{ margin: 0 }}>About</h2>
              {!editingAbout && canEditAbout && <button className="btn sm subtle" onClick={() => setEditingAbout(true)}>Edit</button>}
            </div>
            {!canEditAbout && canEdit && <p className="sub" style={{ margin: '0 0 8px' }}>Your account can't edit this section.</p>}
            {editingAbout ? (
              <form onSubmit={saveAbout} className="stack" style={{ gap: 10 }}>
                <div className="field"><label>Title</label><input value={about.title} onChange={(e) => setAbout({ ...about, title: e.target.value })} required /></div>
                {canSeePrices && <div className="field"><label>Value ($)</label><input type="number" min="0" step="0.01" value={about.value} onChange={(e) => setAbout({ ...about, value: e.target.value })} /></div>}
                <div className="field"><label>Probability (%)</label><input type="number" min="0" max="100" value={about.probability} onChange={(e) => setAbout({ ...about, probability: e.target.value })} /></div>
                <div className="field"><label>Expected close</label><input type="date" value={about.expected_close || ''} onChange={(e) => setAbout({ ...about, expected_close: e.target.value })} /></div>
                <div className="field">
                  <label>Lead source</label>
                  <select value={about.source} onChange={(e) => setAbout({ ...about, source: e.target.value })}>
                    <option value="">— none —</option>
                    {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    {about.source && !LEAD_SOURCES.includes(about.source) && <option value={about.source}>{about.source}</option>}
                  </select>
                  <p className="sub" style={{ margin: '4px 0 0' }}>This is specific to this deal. The linked contact keeps their own source separately — changing one doesn't change the other.</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={savingAbout}>{savingAbout ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditingAbout(false); setAbout(blankAbout(deal)); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">Title</span><span>{deal.title}</span></div>
                <div className="row between"><span className="muted">Value</span><span>{money(deal.value)}</span></div>
                <div className="row between"><span className="muted">Probability</span><span>{deal.probability}%</span></div>
                <div className="row between"><span className="muted">Expected close</span><span>{deal.expected_close ? shortDate(deal.expected_close) : '—'}</span></div>
                <div className="row between" title="This deal's own lead source. The linked contact keeps their own source too, which can differ."><span className="muted">Lead source</span><span>{deal.source || '—'}</span></div>
              </div>
            )}
            <div className="row between" style={{ alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line-soft)' }}>
              <span className="muted">Owner</span>
              {canEdit ? (
                <select value={deal.owner_user_id || ''} onChange={saveOwner} disabled={savingOwner} style={{ maxWidth: 180 }}>
                  <option value="">— unassigned —</option>
                  {directory.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              ) : (
                <span>{deal.owner_username ? <span className="owner-chip"><span className="avatar">{deal.owner_username.slice(0, 2).toUpperCase()}</span>{deal.owner_username}</span> : '—'}</span>
              )}
            </div>
          </div>

          <div className="card section-card accent-amber">
            <div className="row between" style={{ marginBottom: editingDetails ? 10 : 0 }}>
              <h2 className="section-label" style={{ margin: 0 }}>Lead &amp; opportunity details</h2>
              {!editingDetails && canEdit && <button className="btn sm subtle" onClick={() => setEditingDetails(true)}>Edit</button>}
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
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    {WORK_TYPES.map((w) => {
                      const selected = splitWorkTypes(details.work_type);
                      const checked = selected.includes(w);
                      return (
                        <label key={w} className="row" style={{ gap: 5, alignItems: 'center', fontWeight: 400 }}>
                          <input
                            type="checkbox" style={{ width: 'auto' }} checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked ? [...selected, w] : selected.filter((v) => v !== w);
                              setDetails({ ...details, work_type: joinWorkTypes(WORK_TYPES.filter((t) => next.includes(t))) });
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
                {canSeePrices && (
                <div className="field">
                  <label>Lead fee ($)</label>
                  <input type="number" min="0" step="0.01" value={details.ha_lead_fee} onChange={(e) => setDetails({ ...details, ha_lead_fee: e.target.value })} placeholder="e.g. HomeAdvisor/Angi fee" />
                </div>
                )}
                <div className="field">
                  <label>Lead match type</label>
                  <select value={details.ha_match_type} onChange={(e) => setDetails({ ...details, ha_match_type: e.target.value })}>
                    <option value="">— none —</option>
                    {HA_MATCH_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Preferred callback time</label>
                  <input value={details.preferred_callback_time} onChange={(e) => setDetails({ ...details, preferred_callback_time: e.target.value })} placeholder="e.g. Weekday mornings" />
                </div>
                <div className="field">
                  <label>Preferred consult time</label>
                  <input value={details.preferred_consult_time} onChange={(e) => setDetails({ ...details, preferred_consult_time: e.target.value })} placeholder="e.g. Saturday afternoon" />
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
                <div className="row between">
                  <span className="muted">Service type</span>
                  <span>
                    {splitWorkTypes(deal.work_type).length
                      ? (
                        <span className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {splitWorkTypes(deal.work_type).map((w) => <span key={w} className="pill">{w}</span>)}
                        </span>
                      )
                      : '—'}
                  </span>
                </div>
                <div className="row between"><span className="muted">Sub-service type</span><span>{deal.sub_service_type || '—'}</span></div>
                <div className="row between"><span className="muted">Phone estimate</span><span>{deal.phone_estimate ? 'Yes' : 'No'}</span></div>
                <div className="row between"><span className="muted">Repeat / referral</span><span>{deal.repeat_referral ? 'Yes' : 'No'}</span></div>
                <div className="row between"><span className="muted">Lead fee</span><span>{deal.price_hidden ? money(null) : (deal.ha_lead_fee ? money(deal.ha_lead_fee) : '—')}</span></div>
                <div className="row between"><span className="muted">Lead match type</span><span>{deal.ha_match_type || '—'}</span></div>
                <div className="row between"><span className="muted">Preferred callback time</span><span>{deal.preferred_callback_time || '—'}</span></div>
                <div className="row between"><span className="muted">Preferred consult time</span><span>{deal.preferred_consult_time || '—'}</span></div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="row between" style={{ marginBottom: editingNotes ? 10 : 0 }}>
              <h2 style={{ margin: 0 }}>Notes &amp; inquiry</h2>
              {!editingNotes && canEditNotes && <button className="btn sm subtle" onClick={() => setEditingNotes(true)}>Edit</button>}
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
              {STAGES.map((s) => {
                const locked = deal.stage === 'new' && OPPORTUNITY_STAGES.includes(s) && !hasAppointment;
                return (
                  <button
                    key={s}
                    className={'btn sm' + (deal.stage === s ? ' primary' : '')}
                    style={{ justifyContent: 'flex-start', textTransform: 'capitalize' }}
                    onClick={() => changeStage(s)}
                    disabled={!canEdit || locked}
                    title={locked ? 'Schedule an appointment to convert this lead into an opportunity' : undefined}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {deal.stage === 'new' && (
              hasAppointment ? (
                <p className="sub" style={{ margin: '8px 0 0' }}>An appointment's on file — this lead is ready to move into Opportunities.</p>
              ) : (
                <>
                  <p className="sub" style={{ margin: '8px 0 6px' }}>Scheduling an appointment is what turns this lead into an opportunity.</p>
                  {canEdit && <button className="btn sm primary" onClick={() => setShowApptModal(true)}>Schedule appointment</button>}
                </>
              )
            )}
          </div>
          <div className="card">
            <div className="row between" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>Project</h2>
              {!showEstimateForm && canEdit && !(deal.jobs && deal.jobs.length > 0)
                && (!latestEstimate || estimateStatusKey === 'declined') && (
                <button
                  className="btn primary sm"
                  onClick={() => setShowEstimateForm(true)}
                  disabled={!latestEstimate && deal.stage !== 'won'}
                  title={!latestEstimate && deal.stage !== 'won' ? 'This opportunity needs to be Won first' : undefined}
                >
                  + Create estimate
                </button>
              )}
            </div>
            {deal.jobs && deal.jobs.length > 0 ? (
              <div className="stack" style={{ gap: 2 }}>
                {deal.jobs.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="attention-row">
                    <span>{j.title}</span>
                    <span className="pill">{j.status.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            ) : latestEstimate ? (
              <>
                <div className="attention-row" style={{ padding: '2px 0' }}>
                  <span>Estimate {latestEstimate.number}</span>
                  <span className={'pill' + (ESTIMATE_STATUS_PILL[estimateStatusKey] ? ` ${ESTIMATE_STATUS_PILL[estimateStatusKey]}` : '')}>
                    {ESTIMATE_STATUS_LABEL[estimateStatusKey]}
                  </span>
                </div>
                <p className="sub" style={{ margin: '8px 0 10px' }}>
                  {estimateStatusKey === 'declined'
                    ? 'The customer declined this estimate — create a new one below to move this opportunity forward.'
                    : 'A project is created automatically as soon as the customer signs this estimate — the contract amount comes straight from its total. There’s nothing else to do here until then.'}
                </p>
                <Link to="/estimates" className="btn sm">View estimates &rarr;</Link>
              </>
            ) : deal.stage === 'won' ? (
              <p className="sub" style={{ margin: '-4px 0 10px' }}>This opportunity is won — create an estimate below. A project is created automatically once the customer signs it, with the contract amount taken straight from the estimate's total.</p>
            ) : (
              <div className="empty">Projects start once this opportunity is won and the customer signs an estimate.</div>
            )}

            {showEstimateForm && canEdit && (
              <form onSubmit={submitEstimate} style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <LineItemEditor
                  items={estimateItems} setItems={setEstimateItems} taxRate={estimateTaxRate} setTaxRate={setEstimateTaxRate}
                  catalog={(catalog || []).filter((c) => !c.material_key)}
                  markupPercent={estimateMarkupPercent} discountType={estimateDiscountType} discountValue={estimateDiscountValue}
                />
                <PricingAdjustments
                  subtotal={estimateSubtotal(estimateItems)}
                  markupPercent={estimateMarkupPercent} setMarkupPercent={setEstimateMarkupPercent}
                  discountType={estimateDiscountType} setDiscountType={setEstimateDiscountType}
                  discountValue={estimateDiscountValue} setDiscountValue={setEstimateDiscountValue}
                />
                <p className="sub" style={{ margin: '4px 0 10px' }}>
                  Projected cost (before markup): <strong>{money(estimateSubtotal(estimateItems))}</strong>
                  {' · '}Projected profit (the markup above): <strong>{money(estimateSubtotal(estimateItems) * ((Number(estimateMarkupPercent) || 0) / 100))}</strong>
                  {' — '}both feed the project's billing and commission once this becomes a project.
                </p>
                <div className="field" style={{ margin: '10px 0', maxWidth: 200 }}>
                  <label>Deposit required upfront (%)</label>
                  <input type="number" min="0" max="100" placeholder="e.g. 30" value={estimateDepositPercent} onChange={(e) => setEstimateDepositPercent(e.target.value)} />
                </div>
                <PaymentScheduleEditor
                  rows={estimatePaymentSchedule} setRows={setEstimatePaymentSchedule}
                  total={estimateTotal(estimateItems, estimateTaxRate, estimateMarkupPercent, estimateDiscountType, estimateDiscountValue)}
                />
                <div className="field" style={{ margin: '10px 0', maxWidth: 320 }}>
                  <label>Contract <span className="muted" style={{ fontWeight: 400 }}>— terms &amp; conditions this estimate carries</span></label>
                  <select value={estimateContractId} onChange={(e) => setEstimateContractId(e.target.value)}>
                    <option value="">— default for customer type —</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <DisplayOptions value={estimateDisplayOptions} onChange={setEstimateDisplayOptions} />
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn primary sm" type="submit" disabled={savingEstimate}>{savingEstimate ? 'Saving…' : 'Save estimate'}</button>
                  <button className="btn subtle sm" type="button" onClick={() => setShowEstimateForm(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card section-card" style={{ borderLeftColor: 'var(--line)' }}>
            <h2 className="section-label" style={{ color: 'var(--muted)' }}>History</h2>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between">
                <span className="muted">Created by</span>
                <span>{deal.created_by_username || 'system'} · {shortDate(deal.created_at)}</span>
              </div>
              <div className="row between">
                <span className="muted">Last modified</span>
                <span>{deal.updated_by_username || deal.created_by_username || 'system'} · {timeAgo(deal.updated_at || deal.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Next steps</h2>
            <TaskList relatedType="deal" relatedId={deal.id} />
          </div>

          <div className="card">
            <h2>Activity</h2>
            {canEdit && (
            <form onSubmit={addNote} className="row" style={{ marginBottom: 14, gap: 8 }}>
              <input style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--paper)' }} placeholder="Log a note or call…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" type="submit">Add</button>
            </form>
            )}
            {deal.activities.length === 0 ? <div className="empty">No activity yet.</div> : (
              <div className="timeline">
                {deal.activities.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div>
                      <div className="when">{timeAgo(a.created_at)}</div>
                      {a.created_by_username && <div className="who">by {a.created_by_username}</div>}
                    </div>
                    <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {draft && (
        <AiDraftModal title={draftTitle} initialDraft={draft} onClose={() => setDraft(null)} onLog={logDraft} />
      )}
      {showApptModal && (
        <AppointmentModal
          appointment={{ title: `Consultation — ${deal.first_name ? `${deal.first_name} ${deal.last_name}` : deal.title}` }}
          defaultDate={new Date().toISOString().slice(0, 10)}
          onClose={() => setShowApptModal(false)}
          onSubmit={saveAppointment}
        />
      )}
    </>
  );
}
