import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, splitWorkTypes, estimateTotal } from '../utils';
import { EXPENSE_CATEGORIES, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '../constants';
import LineItemEditor from '../components/LineItemEditor';
import PaymentScheduleEditor from '../components/PaymentScheduleEditor';
import DisplayOptions from '../components/DisplayOptions';
import PaymentModal from '../components/PaymentModal';
import TaskList from '../components/TaskList';
import { usePermission, useSection, usePriceVisibility, useAuth } from '../auth';

const REVENUE_BASIS_LABEL = { invoiced: 'Invoiced', estimated: 'Approved estimate (projected — not yet invoiced)', none: 'No invoice or approved estimate yet' };
const BLANK_EXPENSE = { category: 'Materials', description: '', qty: '1', unit_cost: '', incurred_on: '' };

// Attendance is logged one row per employee per day, but the customer/owner should see the crew
// cost as a single per-date subtotal rather than each person's individual rate — this groups the
// flat list (already ordered work_date DESC, id DESC by the server) into one entry per date.
function groupAttendanceByDate(attendance) {
  const byDate = new Map();
  for (const a of attendance) {
    if (!byDate.has(a.work_date)) byDate.set(a.work_date, { work_date: a.work_date, subtotal: 0, entries: [] });
    const day = byDate.get(a.work_date);
    day.subtotal += Number(a.daily_rate) || 0;
    day.entries.push(a);
  }
  return [...byDate.values()];
}

function marginColor(margin) {
  if (margin === null || margin === undefined) return 'var(--ink-soft)';
  if (margin < 0) return 'var(--red)';
  if (margin < 20) return 'var(--amber)';
  return 'var(--accent-ink)';
}

const STATUS_PILL = { pending_schedule: 'amber', accepted: '', scheduled: '', in_progress: 'amber', complete: 'green', on_hold: 'amber', cancelled: 'red', draft: '', sent: 'amber', approved: 'green', partial: 'amber', paid: 'green', overdue: 'red' };
const KIND_LABEL = { deposit: 'Deposit', standard: null };
const STAGES = [
  { key: 'demo', label: 'Demo', field: 'demo_days' },
  { key: 'site_prep', label: 'Site prep', field: 'site_prep_days' },
  { key: 'installation', label: 'Installation', field: 'installation_days' },
  { key: 'final_walkthrough', label: 'Final walkthrough', field: 'final_walkthrough_days' },
];

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

const PHOTO_LABELS = [
  { key: 'before', label: 'Before' },
  { key: 'progress', label: 'Progress' },
  { key: 'after', label: 'After' },
];

/** Downscales an uploaded image client-side (max 1400px wide, JPEG ~0.75 quality) before
    it goes into the DB as a data URL, so a phone photo doesn't blow up the database. */
function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxW = 1400;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function JobDetail() {
  const { id } = useParams();
  const { canEdit } = usePermission('jobs');
  const { user: me } = useAuth();
  const canApprove = !!(me && me.can_approve_estimates);
  const billingSectionEditable = useSection('jobs.billing');
  const scheduleSectionEditable = useSection('jobs.schedule');
  const canEditBilling = canEdit && billingSectionEditable;
  const canEditSchedule = canEdit && scheduleSectionEditable;
  const canSeePrices = usePriceVisibility();
  const [job, setJob] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [items, setItems] = useState([{ description: '', notes: '', qty: 1, unit_price: 0 }]);
  const [taxRate, setTaxRate] = useState('0');
  const [depositPercent, setDepositPercent] = useState('');
  const [paymentSchedule, setPaymentSchedule] = useState([]);
  const [contractId, setContractId] = useState('');
  const [contracts, setContracts] = useState([]);
  const [displayOptions, setDisplayOptions] = useState({ show_rate: true, show_qty: true, show_item_total: true });
  const [requestingDepositFor, setRequestingDepositFor] = useState(null);
  const [rejectingFor, setRejectingFor] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [schedule, setSchedule] = useState({ start_date: '', demo_days: 1, site_prep_days: 2, installation_days: 5, final_walkthrough_days: 1, owner_user_id: '' });
  const [directory, setDirectory] = useState([]);
  const [savingStage, setSavingStage] = useState(false);
  const [photoLabel, setPhotoLabel] = useState('progress');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null);
  const [sendingLink, setSendingLink] = useState(null); // e.g. "est-3-email" / "inv-5-sms" — which button is mid-send
  const [expenseForm, setExpenseForm] = useState(BLANK_EXPENSE);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendanceForm, setAttendanceForm] = useState({ employee_id: '', work_date: new Date().toISOString().slice(0, 10), day_type: 'full' });
  const [loggingAttendance, setLoggingAttendance] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState(blankInfo());
  const [savingInfo, setSavingInfo] = useState(false);
  const [editingBilling, setEditingBilling] = useState(false);
  const [billingForm, setBillingForm] = useState(blankBilling());
  const [savingBilling, setSavingBilling] = useState(false);

  // Editing an existing estimate (Sept 2026) — kept separate from the "+ New estimate" form's
  // state above so opening one never clobbers the other.
  const [editingEstimateId, setEditingEstimateId] = useState(null);
  const [editItems, setEditItems] = useState([{ description: '', notes: '', qty: 1, unit_price: 0 }]);
  const [editTaxRate, setEditTaxRate] = useState('0');
  const [editDepositPercent, setEditDepositPercent] = useState('');
  const [editPaymentSchedule, setEditPaymentSchedule] = useState([]);
  const [editContractId, setEditContractId] = useState('');
  const [editDisplayOptions, setEditDisplayOptions] = useState({ show_rate: true, show_qty: true, show_item_total: true });
  const [savingEdit, setSavingEdit] = useState(false);

  function blankInfo(j) {
    return {
      labor_crew: j?.labor_crew || '', desired_start_date: j?.desired_start_date || '',
      unqualified_reason: j?.unqualified_reason || '', job_notes: j?.job_notes || '',
      insurance_requests: j?.insurance_requests || '', request_review: j?.request_review || '',
    };
  }
  function blankBilling(j) {
    return {
      contract_amount: j?.contract_amount ?? '', change_order_amount: j?.change_order_amount ?? 0,
      sales_tax_amount: j?.sales_tax_amount ?? 0, capital_improvement: !!j?.capital_improvement,
      labor_paid: j?.labor_paid ?? 0,
    };
  }

  function load() {
    api.job(id).then((j) => {
      setJob(j);
      setSchedule({
        start_date: j.start_date || '',
        demo_days: j.demo_days ?? 1,
        site_prep_days: j.site_prep_days ?? 2,
        installation_days: j.installation_days ?? 5,
        final_walkthrough_days: j.final_walkthrough_days ?? 1,
        owner_user_id: j.owner_user_id || '',
      });
      setInfoForm(blankInfo(j));
      setBillingForm(blankBilling(j));
    });
  }
  useEffect(load, [id]);
  useEffect(() => { api.usersDirectory().then(setDirectory).catch(() => setDirectory([])); }, []);
  useEffect(() => { api.employees().then(setEmployees).catch(() => setEmployees([])); }, []);

  async function saveInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    await api.updateJob(id, infoForm);
    setSavingInfo(false);
    setEditingInfo(false);
    load();
  }

  async function saveBilling(e) {
    e.preventDefault();
    setSavingBilling(true);
    await api.updateJob(id, {
      ...billingForm,
      contract_amount: billingForm.contract_amount === '' ? 0 : Number(billingForm.contract_amount),
      change_order_amount: Number(billingForm.change_order_amount) || 0,
      sales_tax_amount: Number(billingForm.sales_tax_amount) || 0,
      labor_paid: Number(billingForm.labor_paid) || 0,
    });
    setSavingBilling(false);
    setEditingBilling(false);
    load();
  }
  useEffect(() => { api.catalogItems().then(setCatalog); }, []);
  useEffect(() => { api.contracts().then(setContracts).catch(() => setContracts([])); }, []);

  // Pick up material-calculator results handed off from the Materials page, if any.
  useEffect(() => {
    const raw = sessionStorage.getItem('pendingEstimateItems');
    if (!raw) return;
    sessionStorage.removeItem('pendingEstimateItems');
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        setItems(parsed);
        setShowEstimateForm(true);
      }
    } catch { /* ignore malformed handoff data */ }
  }, [id]);

  async function changeStatus(status) {
    await api.updateJob(id, { status });
    load();
  }

  const totalDays = STAGES.reduce((sum, s) => sum + (Number(schedule[s.field]) || 0), 0);
  const projectedEnd = schedule.start_date ? addDays(schedule.start_date, totalDays) : null;

  async function saveSchedule(e) {
    e.preventDefault();
    await api.updateJob(id, {
      start_date: schedule.start_date || null,
      demo_days: Number(schedule.demo_days) || 0,
      site_prep_days: Number(schedule.site_prep_days) || 0,
      installation_days: Number(schedule.installation_days) || 0,
      final_walkthrough_days: Number(schedule.final_walkthrough_days) || 0,
      owner_user_id: schedule.owner_user_id ? Number(schedule.owner_user_id) : null,
    });
    load();
  }

  async function setStage(stage) {
    setSavingStage(true);
    await api.updateJob(id, { stage: job.stage === stage ? null : stage });
    await load();
    setSavingStage(false);
  }

  async function submitEstimate(e) {
    e.preventDefault();
    const cleanItems = items.filter((it) => it.description.trim());
    if (!cleanItems.length) return;
    await api.createEstimate(id, {
      tax_rate: Number(taxRate) || 0,
      deposit_percent: Number(depositPercent) || 0,
      items: cleanItems.map((it) => ({ description: it.description, notes: it.notes || '', qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
      payment_schedule: paymentSchedule.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), percent: Number(r.percent) || 0 })),
      contract_id: contractId ? Number(contractId) : null,
      ...displayOptions,
    });
    setItems([{ description: '', notes: '', qty: 1, unit_price: 0 }]);
    setTaxRate('0');
    setDepositPercent('');
    setPaymentSchedule([]);
    setContractId('');
    setDisplayOptions({ show_rate: true, show_qty: true, show_item_total: true });
    setShowEstimateForm(false);
    load();
  }

  async function duplicateEstimate(estimateId) {
    await api.duplicateEstimate(estimateId).catch((err) => window.alert(err.message));
    load();
  }

  function startEditEstimate(est) {
    setEditingEstimateId(est.id);
    setEditItems(est.items.map((it) => ({ description: it.description, notes: it.notes || '', qty: it.qty, unit_price: it.unit_price })));
    setEditTaxRate(String(est.tax_rate ?? 0));
    setEditDepositPercent(est.deposit_percent ? String(est.deposit_percent) : '');
    setEditPaymentSchedule((est.payment_schedule || []).map((r) => ({ name: r.name, percent: r.percent })));
    setEditContractId(est.contract_id ? String(est.contract_id) : '');
    setEditDisplayOptions({
      show_rate: est.show_rate !== 0, show_qty: est.show_qty !== 0, show_item_total: est.show_item_total !== 0,
    });
  }

  function cancelEditEstimate() {
    setEditingEstimateId(null);
  }

  async function saveEditEstimate(e, estimateId) {
    e.preventDefault();
    const cleanItems = editItems.filter((it) => it.description.trim());
    if (!cleanItems.length) return;
    setSavingEdit(true);
    try {
      await api.updateEstimate(estimateId, {
        items: cleanItems.map((it) => ({ description: it.description, notes: it.notes || '', qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
        tax_rate: Number(editTaxRate) || 0,
        deposit_percent: Number(editDepositPercent) || 0,
        payment_schedule: editPaymentSchedule.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), percent: Number(r.percent) || 0 })),
        contract_id: editContractId ? Number(editContractId) : null,
        ...editDisplayOptions,
      });
      setEditingEstimateId(null);
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteEstimateRow(estimateId) {
    if (!window.confirm('Delete this draft estimate? This can\'t be undone.')) return;
    await api.deleteEstimate(estimateId).catch((err) => window.alert(err.message));
    load();
  }

  async function convert(estimateId) {
    await api.convertEstimate(estimateId);
    load();
  }

  async function requestDeposit(estimateId, percent) {
    if (!percent || percent <= 0) return;
    await api.requestDeposit(estimateId, { percent });
    setRequestingDepositFor(null);
    load();
  }

  async function requestApproval(estimateId) {
    await api.requestEstimateApproval(estimateId).catch((err) => window.alert(err.message));
    load();
  }

  async function approveEstimateRequest(estimateId) {
    await api.approveEstimate(estimateId).catch((err) => window.alert(err.message));
    load();
  }

  async function rejectEstimateRequest(estimateId) {
    await api.rejectEstimate(estimateId, { reason: rejectReason.trim() }).catch((err) => window.alert(err.message));
    setRejectingFor(null);
    setRejectReason('');
    load();
  }

  async function submitPayment(paymentData) {
    await api.recordPayment(payingInvoice.id, paymentData);
    setPayingInvoice(null);
    load();
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const data_url = await resizeImageFile(file);
      await api.addJobPhoto(id, { label: photoLabel, data_url });
      load();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(photoId) {
    await api.deleteJobPhoto(photoId);
    load();
  }

  async function addExpense(e) {
    e.preventDefault();
    if (!expenseForm.description.trim()) return;
    await api.addJobExpense(id, {
      category: expenseForm.category,
      description: expenseForm.description,
      qty: Number(expenseForm.qty) || 1,
      unit_cost: Number(expenseForm.unit_cost) || 0,
      incurred_on: expenseForm.incurred_on || undefined,
    });
    setExpenseForm(BLANK_EXPENSE);
    setShowExpenseForm(false);
    load();
  }

  async function removeExpense(expenseId) {
    await api.deleteJobExpense(expenseId);
    load();
  }

  async function logAttendance(e) {
    e.preventDefault();
    if (!attendanceForm.employee_id || !attendanceForm.work_date) return;
    setLoggingAttendance(true);
    try {
      await api.addAttendance(id, attendanceForm);
      setAttendanceForm({ employee_id: '', work_date: new Date().toISOString().slice(0, 10), day_type: 'full' });
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setLoggingAttendance(false);
    }
  }

  async function removeAttendance(attendanceId) {
    await api.deleteAttendance(attendanceId);
    load();
  }

  function copyApprovalLink(estimate) {
    const url = `${window.location.origin}/approve/${estimate.sign_token}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(estimate.id);
    setTimeout(() => setCopiedLink(null), 1500);
  }

  function copyInvoiceLink(invoice) {
    const url = `${window.location.origin}/invoice/${invoice.public_token}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(`inv-${invoice.id}`);
    setTimeout(() => setCopiedLink(null), 1500);
  }

  async function sendEstimateVia(estimate, method) {
    const key = `est-${estimate.id}-${method}`;
    setSendingLink(key);
    try {
      const result = await api.sendEstimate(estimate.id, method);
      if (!result.sent) window.alert(`Couldn't ${method === 'sms' ? 'text' : 'email'} this estimate: ${result.reason}`);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSendingLink(null);
    }
  }

  async function sendInvoiceVia(invoice, method) {
    const key = `inv-${invoice.id}-${method}`;
    setSendingLink(key);
    try {
      const result = await api.sendInvoice(invoice.id, method);
      if (!result.sent) window.alert(`Couldn't ${method === 'sms' ? 'text' : 'email'} this invoice: ${result.reason}`);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSendingLink(null);
    }
  }

  if (!job) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/jobs">Projects</Link> / {job.title}</p>
          <h1>{job.title}</h1>
          <p className="sub">{job.address || 'No address'} · scheduled {shortDate(job.scheduled_date)}</p>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {PROJECT_STATUSES.map((s) => (
            <button key={s} className={'btn sm' + (job.status === s ? ' primary' : '')} onClick={() => changeStatus(s)} disabled={!canEditSchedule}>{PROJECT_STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div className="kicker">Account</div>
            {job.account ? (
              <Link to={job.account.type === 'company' ? `/companies/${job.account.id}` : `/contacts/${job.account.id}`} className="link-strong">{job.account.name}</Link>
            ) : <span className="muted">—</span>}
          </div>
          <div>
            <div className="kicker">Opportunity</div>
            {job.opportunity ? <Link to={`/pipeline/${job.opportunity.id}`} className="link-strong">{job.opportunity.title}</Link> : <span className="muted">—</span>}
          </div>
          <div>
            <div className="kicker">Contract amount</div>
            <span className="mono" style={{ fontWeight: 600 }}>{money(job.billing.totalContractAmount)}</span>
          </div>
          <div>
            <div className="kicker">Gross profit %</div>
            <span className="mono" style={{ fontWeight: 600, color: marginColor(job.billing.grossProfitPercent) }}>
              {job.price_hidden ? '🔒 Hidden' : (job.billing.grossProfitPercent === null ? '—' : `${job.billing.grossProfitPercent}%`)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="row between" style={{ marginBottom: editingInfo ? 10 : 0 }}>
              <h2 style={{ margin: 0 }}>Project info</h2>
              {!editingInfo && canEdit && <button className="btn sm subtle" onClick={() => setEditingInfo(true)}>Edit</button>}
            </div>
            {editingInfo ? (
              <form onSubmit={saveInfo} className="stack" style={{ gap: 10 }}>
                <div className="field">
                  <label>Labor crew</label>
                  <input value={infoForm.labor_crew} onChange={(e) => setInfoForm({ ...infoForm, labor_crew: e.target.value })} placeholder="Who's assigned to this project?" />
                </div>
                <div className="field">
                  <label>Desired start date</label>
                  <input type="date" value={infoForm.desired_start_date || ''} onChange={(e) => setInfoForm({ ...infoForm, desired_start_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Unqualified reason</label>
                  <input value={infoForm.unqualified_reason} onChange={(e) => setInfoForm({ ...infoForm, unqualified_reason: e.target.value })} placeholder="Only if this project fell through" />
                </div>
                <div className="field">
                  <label>Job notes</label>
                  <textarea rows={2} value={infoForm.job_notes} onChange={(e) => setInfoForm({ ...infoForm, job_notes: e.target.value })} />
                </div>
                <div className="field">
                  <label>Insurance requests</label>
                  <textarea rows={2} value={infoForm.insurance_requests} onChange={(e) => setInfoForm({ ...infoForm, insurance_requests: e.target.value })} placeholder="Any insurance claim/paperwork tied to this job" />
                </div>
                <div className="field">
                  <label>Request review</label>
                  <textarea rows={2} value={infoForm.request_review} onChange={(e) => setInfoForm({ ...infoForm, request_review: e.target.value })} placeholder="Ask someone to review something on this project" />
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={savingInfo}>{savingInfo ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditingInfo(false); setInfoForm(blankInfo(job)); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                <div className="row between"><span className="muted">Labor crew</span><span>{job.labor_crew || '—'}</span></div>
                <div className="row between"><span className="muted">Desired start date</span><span>{job.desired_start_date ? shortDate(job.desired_start_date) : '—'}</span></div>
                <div className="row between"><span className="muted">Start date</span><span>{job.start_date ? shortDate(job.start_date) : '—'}</span></div>
                <div className="row between"><span className="muted">End date</span><span>{job.end_date ? shortDate(job.end_date) : '—'}</span></div>
                <div className="row between"><span className="muted">Lead source</span><span>{job.lead_source || '—'}</span></div>
                <div className="row between">
                  <span className="muted">Service type</span>
                  <span>
                    {splitWorkTypes(job.opportunity?.work_type).length
                      ? (
                        <span className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {splitWorkTypes(job.opportunity?.work_type).map((w) => <span key={w} className="pill">{w}</span>)}
                        </span>
                      )
                      : '—'}
                  </span>
                </div>
                <div className="row between"><span className="muted">Sub-service type</span><span>{job.opportunity?.sub_service_type || '—'}</span></div>
                <div className="row between"><span className="muted">Project status</span><span className={'pill ' + (STATUS_PILL[job.status] || '')}>{PROJECT_STATUS_LABEL[job.status] || job.status}</span></div>
                <div className="row between"><span className="muted">Unqualified reason</span><span>{job.unqualified_reason || '—'}</span></div>
                <div className="row between" style={{ alignItems: 'flex-start' }}><span className="muted">Job notes</span><span style={{ textAlign: 'right', maxWidth: '65%' }}>{job.job_notes || '—'}</span></div>
                <div className="row between" style={{ alignItems: 'flex-start' }}><span className="muted">Insurance requests</span><span style={{ textAlign: 'right', maxWidth: '65%' }}>{job.insurance_requests || '—'}</span></div>
                <div className="row between" style={{ alignItems: 'flex-start' }}><span className="muted">Request review</span><span style={{ textAlign: 'right', maxWidth: '65%' }}>{job.request_review || '—'}</span></div>
              </div>
            )}
            <p className="sub" style={{ margin: '10px 0 0' }}>Start date, end date, and day-by-day progress are set below, in Schedule &amp; progress.</p>
          </div>

          <div className="card">
            <h2>Schedule &amp; progress</h2>
            <form onSubmit={saveSchedule} className="form-grid">
              <div className="field">
                <label>Start date</label>
                <input type="date" value={schedule.start_date || ''} onChange={(e) => setSchedule({ ...schedule, start_date: e.target.value })} disabled={!canEditSchedule} />
              </div>
              <div className="field">
                <label>Projected end date</label>
                <input type="text" value={projectedEnd ? projectedEnd.toLocaleDateString() : '— set a start date —'} disabled />
              </div>
              <div className="field">
                <label>Assigned to <span className="muted" style={{ fontWeight: 400 }}>— emails a schedule invite</span></label>
                <select
                  value={schedule.owner_user_id || ''}
                  onChange={(e) => setSchedule({ ...schedule, owner_user_id: e.target.value })}
                  disabled={!canEditSchedule}
                >
                  <option value="">— unassigned —</option>
                  {directory.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              {STAGES.map((s) => (
                <div className="field" key={s.field}>
                  <label>{s.label} — days</label>
                  <input
                    type="number" min="0"
                    value={schedule[s.field]}
                    onChange={(e) => setSchedule({ ...schedule, [s.field]: e.target.value })}
                    disabled={!canEditSchedule}
                  />
                </div>
              ))}
              <div className="field" style={{ gridColumn: '1 / -1', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="sub" style={{ margin: 0 }}>
                  Total project length: <strong>{totalDays} day{totalDays === 1 ? '' : 's'}</strong>
                  {projectedEnd ? ` — ends ${projectedEnd.toLocaleDateString()}` : ''}
                </span>
                {canEditSchedule && <button className="btn primary sm" type="submit">Save schedule</button>}
              </div>
            </form>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Finish-out stage</label>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {STAGES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={'btn sm' + (job.stage === s.key ? ' primary' : '')}
                    disabled={savingStage || !canEdit}
                    onClick={() => setStage(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="stage-bar">
                {STAGES.map((s, i) => {
                  const currentIdx = job.stage ? STAGES.findIndex((x) => x.key === job.stage) : -1;
                  const share = Math.max(Number(job[s.field]) || 0, 0.15);
                  return <div key={s.key} className={'segment' + (currentIdx >= i ? ' filled' : '')} style={{ flex: `${share} 0 0` }} />;
                })}
              </div>
              <div className="stage-labels">
                {STAGES.map((s) => {
                  const share = Math.max(Number(job[s.field]) || 0, 0.15);
                  return (
                    <span key={s.key} className={'lbl' + (job.stage === s.key ? ' active' : '')} style={{ flex: `${share} 0 0` }}>
                      {s.label} · {job[s.field] ?? 0}d
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row between">
              <h2 style={{ marginBottom: 0 }}>Estimates</h2>
              {canEdit && <button className="btn sm" onClick={() => setShowEstimateForm((v) => !v)}>+ New estimate</button>}
            </div>

            {showEstimateForm && canEdit && (
              <form onSubmit={submitEstimate} style={{ marginTop: 12, marginBottom: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <LineItemEditor items={items} setItems={setItems} taxRate={taxRate} setTaxRate={setTaxRate} catalog={(catalog || []).filter((c) => !c.material_key)} />
                <div className="field" style={{ marginTop: 10, maxWidth: 220 }}>
                  <label>Deposit required upfront (%)</label>
                  <input type="number" min="0" max="100" placeholder="e.g. 30" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
                </div>
                <PaymentScheduleEditor rows={paymentSchedule} setRows={setPaymentSchedule} total={estimateTotal(items, taxRate)} />
                <div className="field" style={{ marginTop: 10, maxWidth: 320 }}>
                  <label>Contract <span className="muted" style={{ fontWeight: 400 }}>— terms &amp; conditions this estimate carries</span></label>
                  <select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                    <option value="">— default for customer type —</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <DisplayOptions value={displayOptions} onChange={setDisplayOptions} />
                <button className="btn primary sm" type="submit" style={{ marginTop: 10 }}>Save estimate</button>
              </form>
            )}

            {job.estimates.length === 0 ? <div className="empty">No estimates yet.</div> : (
              <div className="stack" style={{ gap: 10 }}>
                {job.estimates.map((est) => {
                  const estInvoiced = (job.invoices || []).some((inv) => inv.estimate_id === est.id);
                  if (editingEstimateId === est.id) {
                    return (
                      <div key={est.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px' }}>
                        <p className="sub" style={{ margin: '0 0 10px' }}>
                          Editing {est.number}{est.approval_status && est.approval_status !== 'pending' ? ' — saving will clear its approval status, since the numbers are changing' : ''}.
                        </p>
                        <form onSubmit={(e) => saveEditEstimate(e, est.id)}>
                          <LineItemEditor items={editItems} setItems={setEditItems} taxRate={editTaxRate} setTaxRate={setEditTaxRate} catalog={(catalog || []).filter((c) => !c.material_key)} />
                          <div className="field" style={{ marginTop: 10, maxWidth: 220 }}>
                            <label>Deposit required upfront (%)</label>
                            <input type="number" min="0" max="100" placeholder="e.g. 30" value={editDepositPercent} onChange={(e) => setEditDepositPercent(e.target.value)} />
                          </div>
                          <PaymentScheduleEditor rows={editPaymentSchedule} setRows={setEditPaymentSchedule} total={estimateTotal(editItems, editTaxRate)} />
                          <div className="field" style={{ marginTop: 10, maxWidth: 320 }}>
                            <label>Contract <span className="muted" style={{ fontWeight: 400 }}>— terms &amp; conditions this estimate carries</span></label>
                            <select value={editContractId} onChange={(e) => setEditContractId(e.target.value)}>
                              <option value="">— default for customer type —</option>
                              {contracts.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <DisplayOptions value={editDisplayOptions} onChange={setEditDisplayOptions} />
                          <div className="row" style={{ gap: 8, marginTop: 10 }}>
                            <button className="btn primary sm" type="submit" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
                            <button className="btn subtle sm" type="button" onClick={cancelEditEstimate}>Cancel</button>
                          </div>
                        </form>
                      </div>
                    );
                  }
                  return (
                  <div key={est.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px' }}>
                    <div className="row between">
                      <span className="link-strong mono">{est.number}</span>
                      <span className={'pill ' + (STATUS_PILL[est.status] || '')}>{est.status}</span>
                    </div>
                    <ul style={{ margin: '8px 0', paddingLeft: 18, fontSize: 13 }}>
                      {est.items.map((it) => (
                        <li key={it.id}>{it.description} — {it.qty} × {money(it.unit_price)}</li>
                      ))}
                    </ul>
                    <div className="row between" style={{ fontSize: 13 }}>
                      <span className="muted">Total{est.deposit_percent > 0 ? ` (${est.deposit_percent}% deposit set)` : ''}</span>
                      <span className="mono" style={{ fontWeight: 600 }}>{money(est.total)}</span>
                    </div>
                    {est.signed_at ? (
                      <div className="sub" style={{ margin: '6px 0 0', color: 'var(--accent-ink)' }}>
                        ✓ Signed by {est.signed_name} — {shortDate(est.signed_at)}
                      </div>
                    ) : (
                      <div className="sub" style={{ margin: '6px 0 0' }}>Not signed by the customer yet.</div>
                    )}

                    {est.requires_internal_approval && est.approval_status === 'pending' && (
                      <div className="sub" style={{ margin: '6px 0 0', color: 'var(--amber)' }}>
                        ⏳ Waiting on manager approval before this can go to the customer{est.created_by_username ? ` (requested by ${est.created_by_username})` : ''}.
                      </div>
                    )}
                    {est.requires_internal_approval && est.approval_status === 'rejected' && (
                      <div className="sub" style={{ margin: '6px 0 0', color: 'var(--red)' }}>
                        ✗ Approval rejected{est.approved_by_username ? ` by ${est.approved_by_username}` : ''}{est.rejection_reason ? `: ${est.rejection_reason}` : '.'} Edit and re-request.
                      </div>
                    )}
                    {!est.requires_internal_approval && est.approval_status === 'approved' && est.approved_by_username && (
                      <div className="sub" style={{ margin: '6px 0 0', color: 'var(--accent-ink)' }}>
                        ✓ Approved by {est.approved_by_username} — ready to send.
                      </div>
                    )}

                    {canApprove && est.approval_status === 'pending' && (
                      <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                        {rejectingFor === est.id ? (
                          <>
                            <input
                              type="text" placeholder="Reason (optional)" value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              style={{ minWidth: 180, border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px' }}
                            />
                            <button className="btn sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => rejectEstimateRequest(est.id)}>Confirm reject</button>
                            <button className="btn subtle sm" onClick={() => { setRejectingFor(null); setRejectReason(''); }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn primary sm" onClick={() => approveEstimateRequest(est.id)}>Approve</button>
                            <button className="btn sm" onClick={() => setRejectingFor(est.id)}>Reject…</button>
                          </>
                        )}
                      </div>
                    )}

                    {canEdit && (
                    <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                      {!est.signed_at && !estInvoiced && <button className="btn sm" onClick={() => startEditEstimate(est)}>Edit</button>}
                      {!estInvoiced && <button className="btn sm" onClick={() => convert(est.id)}>Convert to invoice →</button>}
                      {est.requires_internal_approval ? (
                        est.approval_status === 'pending' ? (
                          <span className="pill amber">Pending approval…</span>
                        ) : (
                          <button className="btn sm" onClick={() => requestApproval(est.id)}>
                            {est.approval_status === 'rejected' ? 'Re-request approval' : 'Request approval'}
                          </button>
                        )
                      ) : (
                        <>
                          <button className="btn sm" onClick={() => copyApprovalLink(est)}>{copiedLink === est.id ? 'Copied!' : 'Copy approval link'}</button>
                          <button className="btn sm" disabled={sendingLink === `est-${est.id}-email`} onClick={() => sendEstimateVia(est, 'email')}>
                            {sendingLink === `est-${est.id}-email` ? 'Emailing…' : 'Email'}
                          </button>
                          <button className="btn sm" disabled={sendingLink === `est-${est.id}-sms`} onClick={() => sendEstimateVia(est, 'sms')}>
                            {sendingLink === `est-${est.id}-sms` ? 'Texting…' : 'Text'}
                          </button>
                        </>
                      )}
                      {requestingDepositFor === est.id ? (
                        <>
                          <input
                            type="number" min="1" max="100" defaultValue={est.deposit_percent || 30}
                            style={{ width: 56, border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px' }}
                            onChange={(e) => (est._pendingPercent = e.target.value)}
                          />
                          <button className="btn primary sm" onClick={() => requestDeposit(est.id, Number(est._pendingPercent || est.deposit_percent || 30))}>Request deposit</button>
                          <button className="btn subtle sm" onClick={() => setRequestingDepositFor(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn sm" onClick={() => setRequestingDepositFor(est.id)}>Request deposit…</button>
                      )}
                      <a className="btn sm" href={api.estimatePdfUrl(est.id)} target="_blank" rel="noreferrer">View/Print PDF</a>
                      <button className="btn sm" onClick={() => duplicateEstimate(est.id)}>Duplicate</button>
                      {!est.signed_at && <button className="btn sm subtle" onClick={() => deleteEstimateRow(est.id)}>Delete</button>}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row between" style={{ marginBottom: editingBilling ? 10 : 0 }}>
              <h2 style={{ margin: 0 }}>Project billing</h2>
              {!editingBilling && canEditBilling && <button className="btn sm subtle" onClick={() => setEditingBilling(true)}>Edit</button>}
            </div>
            {!canEditBilling && canEdit && <p className="sub" style={{ margin: '0 0 8px' }}>Your account can't edit this section.</p>}
            {editingBilling ? (
              <form onSubmit={saveBilling} className="stack" style={{ gap: 10 }}>
                {canSeePrices && (
                <div className="field">
                  <label>Contract amount ($)</label>
                  <input type="number" min="0" step="0.01" value={billingForm.contract_amount} onChange={(e) => setBillingForm({ ...billingForm, contract_amount: e.target.value })} />
                </div>
                )}
                {canSeePrices && (
                <div className="field">
                  <label>Change order amount ($)</label>
                  <input type="number" step="0.01" value={billingForm.change_order_amount} onChange={(e) => setBillingForm({ ...billingForm, change_order_amount: e.target.value })} />
                </div>
                )}
                {canSeePrices && (
                <div className="field">
                  <label>Sales tax amount ($)</label>
                  <input type="number" min="0" step="0.01" value={billingForm.sales_tax_amount} onChange={(e) => setBillingForm({ ...billingForm, sales_tax_amount: e.target.value })} />
                </div>
                )}
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" id="capital_improvement" checked={billingForm.capital_improvement} onChange={(e) => setBillingForm({ ...billingForm, capital_improvement: e.target.checked })} style={{ width: 'auto' }} />
                  <label htmlFor="capital_improvement" style={{ margin: 0 }}>Capital improvement</label>
                </div>
                {canSeePrices && (
                <div className="field">
                  <label>Labor paid so far ($)</label>
                  <input type="number" min="0" step="0.01" value={billingForm.labor_paid} onChange={(e) => setBillingForm({ ...billingForm, labor_paid: e.target.value })} />
                </div>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={savingBilling}>{savingBilling ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditingBilling(false); setBillingForm(blankBilling(job)); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                  <div className="row between"><span className="muted">Contract amount</span><span className="mono">{money(job.billing.contractAmount)}</span></div>
                  <div className="row between"><span className="muted">Change order amount</span><span className="mono">{money(job.billing.changeOrderAmount)}</span></div>
                  <div className="row between"><span className="muted">Total contract amount</span><span className="mono" style={{ fontWeight: 600 }}>{money(job.billing.totalContractAmount)}</span></div>
                  <div className="row between"><span className="muted">Sales tax amount</span><span className="mono">{money(job.billing.salesTaxAmount)}</span></div>
                  <div className="row between"><span className="muted">Capital improvement</span><span>{job.billing.capitalImprovement ? 'Yes' : 'No'}</span></div>
                  <div className="row between" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}><span className="muted" style={{ fontWeight: 600 }}>Total charges</span><span className="mono" style={{ fontWeight: 700 }}>{money(job.billing.totalCharges)}</span></div>
                  <div className="row between">
                    <span className="muted">Gross profit</span>
                    <span className="mono" style={{ fontWeight: 600, color: marginColor(job.billing.grossProfitPercent) }}>
                      {money(job.billing.grossProfitAmount)}{job.billing.grossProfitPercent === null ? '' : ` (${job.billing.grossProfitPercent}%)`}
                    </span>
                  </div>
                  <div className="row between"><span className="muted">Labor cost</span><span className="mono">{money(job.billing.laborCost)}</span></div>
                  <div className="row between"><span className="muted">Customer balance</span><span className="mono" style={{ color: job.billing.customerBalance > 0 ? 'var(--red)' : 'var(--accent-ink)' }}>{money(job.billing.customerBalance)}</span></div>
                </div>
                <div className="kicker" style={{ marginTop: 14 }}>Additional fields</div>
                <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                  <div className="row between"><span className="muted">All customer payments</span><span className="mono">{money(job.billing.allCustomerPayments)}</span></div>
                  <div className="row between"><span className="muted">Billable</span><span className="mono">{money(job.billing.billable)}</span></div>
                  <div className="row between"><span className="muted">Not billable</span><span className="mono">{money(job.billing.notBillable)}</span></div>
                  <div className="row between"><span className="muted">Total materials cost</span><span className="mono">{money(job.billing.materialsCost)}</span></div>
                  <div className="row between"><span className="muted">Labor paid</span><span className="mono">{money(job.billing.laborPaid)}</span></div>
                  <div className="row between"><span className="muted">Labor balance</span><span className="mono">{money(job.billing.laborBalance)}</span></div>
                  <div className="row between"><span className="muted">Labor cost %</span><span className="mono">{job.billing.laborCostPercent === null ? '—' : `${job.billing.laborCostPercent}%`}</span></div>
                  <div className="row between"><span className="muted">Last updated</span><span>{job.updated_at ? timeAgo(job.updated_at) : '—'}</span></div>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ marginBottom: 0 }}>Job costing</h2>
              {canEdit && <button className="btn sm" onClick={() => setShowExpenseForm((v) => !v)}>+ Log expense</button>}
            </div>
            <p className="sub" style={{ margin: '4px 0 12px' }}>
              Revenue basis: {REVENUE_BASIS_LABEL[job.costing.revenueBasis]}
            </p>

            {showExpenseForm && canEdit && (
              <form onSubmit={addExpense} className="form-grid" style={{ marginBottom: 14, borderBottom: '1px solid var(--line-soft)', paddingBottom: 14 }}>
                <div className="field">
                  <label>Category</label>
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Date incurred</label>
                  <input type="date" value={expenseForm.incurred_on} onChange={(e) => setExpenseForm({ ...expenseForm, incurred_on: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Description</label>
                  <input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="e.g. Asphalt mix — 12 tons" required />
                </div>
                <div className="field">
                  <label>Qty</label>
                  <input type="number" min="0" step="any" value={expenseForm.qty} onChange={(e) => setExpenseForm({ ...expenseForm, qty: e.target.value })} />
                </div>
                <div className="field">
                  <label>Unit cost ($)</label>
                  <input type="number" min="0" step="0.01" value={expenseForm.unit_cost} onChange={(e) => setExpenseForm({ ...expenseForm, unit_cost: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
                  <button className="btn primary sm" type="submit">Save expense</button>
                </div>
              </form>
            )}

            <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
              <div className="totals-row" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                <span className="lbl">Revenue</span><span className="amt">{money(job.costing.revenue)}</span>
              </div>
              <div className="totals-row" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                <span className="lbl">Total expenses</span><span className="amt">{money(job.costing.cost)}</span>
              </div>
              <div className="totals-row" style={{ justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--line-soft)', marginTop: 4 }}>
                <span className="lbl" style={{ fontWeight: 600 }}>Profit</span>
                <span className="amt" style={{ fontWeight: 700, color: marginColor(job.costing.margin) }}>{money(job.costing.profit)}</span>
              </div>
              <div className="row between">
                <span className="muted" style={{ fontSize: 13 }}>Margin</span>
                <span className="mono" style={{ fontWeight: 600, color: marginColor(job.costing.margin) }}>
                  {job.price_hidden ? '🔒 Hidden' : (job.costing.margin === null ? '—' : `${job.costing.margin}%`)}
                </span>
              </div>
            </div>

            {job.costing.byCategory.length > 0 && (
              <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
                <div className="kicker">Cost breakdown</div>
                {job.costing.byCategory.map((c) => (
                  <div key={c.category} className="row between" style={{ fontSize: 13 }}>
                    <span className="muted">{c.category}</span>
                    <span className="mono">{money(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {job.costing.expenses.length === 0 ? <div className="empty">No expenses logged yet.</div> : (
              <div className="stack" style={{ gap: 2 }}>
                {job.costing.expenses.map((exp) => (
                  <div key={exp.id} className="attention-row">
                    <span>
                      {exp.description}
                      <span className="muted" style={{ marginLeft: 6 }}>{exp.category} · {shortDate(exp.incurred_on)}</span>
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="mono">{money(exp.qty * exp.unit_cost)}</span>
                      {canEdit && <button type="button" className="btn subtle sm" onClick={() => removeExpense(exp.id)}>✕</button>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ marginBottom: 4 }}>Attendance / crew</h2>
            </div>
            <p className="sub" style={{ margin: '4px 0 12px' }}>Log a crew member for a day on this job — their daily rate is added to Job costing above as a Labor expense automatically, and never appears on an estimate or invoice.</p>
            {canEdit && (
              <form onSubmit={logAttendance} className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--line-soft)', paddingBottom: 14 }}>
                <select value={attendanceForm.employee_id} onChange={(e) => setAttendanceForm({ ...attendanceForm, employee_id: e.target.value })} required>
                  <option value="">— select employee —</option>
                  {employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
                <input type="date" value={attendanceForm.work_date} onChange={(e) => setAttendanceForm({ ...attendanceForm, work_date: e.target.value })} required />
                <select value={attendanceForm.day_type} onChange={(e) => setAttendanceForm({ ...attendanceForm, day_type: e.target.value })}>
                  <option value="full">Full day</option>
                  <option value="half">Half day</option>
                </select>
                <button className="btn primary sm" type="submit" disabled={loggingAttendance}>{loggingAttendance ? 'Logging…' : '+ Log day'}</button>
              </form>
            )}
            {job.attendance.length === 0 ? <div className="empty">No crew logged on this job yet.</div> : (
              <div className="stack" style={{ gap: 10 }}>
                {groupAttendanceByDate(job.attendance).map((day) => (
                  <div key={day.work_date}>
                    <div className="row between" style={{ fontWeight: 600, fontSize: 13 }}>
                      <span>{shortDate(day.work_date)}</span>
                      <span className="mono">{canSeePrices ? money(day.subtotal) : '🔒 Hidden'}</span>
                    </div>
                    <div className="stack" style={{ gap: 2, marginTop: 2 }}>
                      {day.entries.map((a) => (
                        <div key={a.id} className="attention-row">
                          <span>
                            <Link to={`/employees/${a.employee_id}`}>{a.employee_first_name} {a.employee_last_name}</Link>
                            {a.day_type === 'half' && <span className="muted" style={{ marginLeft: 6 }}>(half day)</span>}
                          </span>
                          {canEdit && <button type="button" className="btn subtle sm" onClick={() => removeAttendance(a.id)}>✕</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Invoices &amp; payments</h2>
            {job.invoices.length === 0 ? <div className="empty">No invoices yet.</div> : (
              <div className="stack" style={{ gap: 10 }}>
                {job.invoices.map((inv) => (
                  <div key={inv.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px' }}>
                    <div className="row between">
                      <span className="row" style={{ gap: 6 }}>
                        <span className="link-strong mono">{inv.number}</span>
                        {KIND_LABEL[inv.kind] && <span className="pill">{KIND_LABEL[inv.kind]}</span>}
                      </span>
                      <span className={'pill ' + (STATUS_PILL[inv.status] || '')}>{inv.status}</span>
                    </div>
                    <ul style={{ margin: '8px 0', paddingLeft: 18, fontSize: 13 }}>
                      {inv.items.map((it) => (
                        <li key={it.id}>{it.description} — {it.qty} × {money(it.unit_price)}</li>
                      ))}
                    </ul>
                    <div className="totals-row" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                      <span className="lbl">Total</span><span className="amt">{money(inv.total)}</span>
                    </div>
                    <div className="totals-row" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                      <span className="lbl">Paid</span><span className="amt">{money(inv.amount_paid)}</span>
                    </div>
                    <div className="totals-row" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                      <span className="lbl">Balance</span><span className="amt" style={{ color: inv.balance > 0 ? 'var(--red)' : 'var(--accent-ink)' }}>{money(inv.balance)}</span>
                    </div>

                    {inv.payments.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 12 }} className="muted">
                        {inv.payments.map((p) => <div key={p.id}>{money(p.amount)} via {p.method}{p.reference ? ` · ${p.reference}` : ''} · {shortDate(p.paid_at)}</div>)}
                      </div>
                    )}

                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      {inv.balance > 0 && canEdit && (
                        <button className="btn primary sm" onClick={() => setPayingInvoice(inv)}>Charge / record payment</button>
                      )}
                      <button className="btn sm" onClick={() => copyInvoiceLink(inv)}>{copiedLink === `inv-${inv.id}` ? 'Copied!' : 'Copy invoice link'}</button>
                      <button className="btn sm" disabled={sendingLink === `inv-${inv.id}-email`} onClick={() => sendInvoiceVia(inv, 'email')}>
                        {sendingLink === `inv-${inv.id}-email` ? 'Emailing…' : 'Email'}
                      </button>
                      <button className="btn sm" disabled={sendingLink === `inv-${inv.id}-sms`} onClick={() => sendInvoiceVia(inv, 'sms')}>
                        {sendingLink === `inv-${inv.id}-sms` ? 'Texting…' : 'Text'}
                      </button>
                      <a className="btn sm" href={api.invoicePdfUrl(inv.id)} target="_blank" rel="noreferrer">Download PDF</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Photos</h2>
            <p className="sub" style={{ margin: '-4px 0 10px' }}>Before/progress/after shots for this job — kept with the record, not a separate app.</p>
            {canEdit && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select value={photoLabel} onChange={(e) => setPhotoLabel(e.target.value)}>
                {PHOTO_LABELS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                {uploadingPhoto ? 'Uploading…' : '+ Add photo'}
                <input type="file" accept="image/*" onChange={uploadPhoto} disabled={uploadingPhoto} style={{ display: 'none' }} />
              </label>
            </div>
            )}
            {job.photos.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>No photos yet.</div> : (
              <div className="photo-grid">
                {job.photos.map((p) => (
                  <div className="photo-tile" key={p.id}>
                    <a href={p.data_url} target="_blank" rel="noreferrer"><img src={p.data_url} alt={p.label} /></a>
                    <span className="label">{p.label}</span>
                    {canEdit && <button type="button" className="remove" onClick={() => removePhoto(p.id)}>✕</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Next steps</h2>
            <TaskList relatedType="job" relatedId={job.id} />
          </div>

          <div className="card">
            <h2>Activity</h2>
            {job.activities.length === 0 ? <div className="empty">Nothing logged yet.</div> : (
              <div className="timeline">
                {job.activities.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div className="when">{timeAgo(a.created_at)}</div>
                    <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {payingInvoice && (
        <PaymentModal invoice={payingInvoice} onClose={() => setPayingInvoice(null)} onSubmit={submitPayment} />
      )}
    </>
  );
}
