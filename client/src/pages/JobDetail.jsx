import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo } from '../utils';
import LineItemEditor from '../components/LineItemEditor';
import PaymentModal from '../components/PaymentModal';

const JOB_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const STATUS_PILL = { scheduled: '', in_progress: 'amber', completed: 'green', cancelled: 'red', draft: '', sent: 'amber', approved: 'green', partial: 'amber', paid: 'green', overdue: 'red' };
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

export default function JobDetail() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [items, setItems] = useState([{ description: '', qty: 1, unit_price: 0 }]);
  const [taxRate, setTaxRate] = useState('0');
  const [depositPercent, setDepositPercent] = useState('');
  const [requestingDepositFor, setRequestingDepositFor] = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [schedule, setSchedule] = useState({ start_date: '', demo_days: 1, site_prep_days: 2, installation_days: 5, final_walkthrough_days: 1 });
  const [savingStage, setSavingStage] = useState(false);

  function load() {
    api.job(id).then((j) => {
      setJob(j);
      setSchedule({
        start_date: j.start_date || '',
        demo_days: j.demo_days ?? 1,
        site_prep_days: j.site_prep_days ?? 2,
        installation_days: j.installation_days ?? 5,
        final_walkthrough_days: j.final_walkthrough_days ?? 1,
      });
    });
  }
  useEffect(load, [id]);

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
      items: cleanItems.map((it) => ({ description: it.description, qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
    });
    setItems([{ description: '', qty: 1, unit_price: 0 }]);
    setTaxRate('0');
    setDepositPercent('');
    setShowEstimateForm(false);
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

  async function submitPayment(paymentData) {
    await api.recordPayment(payingInvoice.id, paymentData);
    setPayingInvoice(null);
    load();
  }

  if (!job) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/jobs">Jobs &amp; billing</Link> / {job.title}</p>
          <h1>{job.title}</h1>
          <p className="sub">{job.address || 'No address'} · scheduled {shortDate(job.scheduled_date)}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {JOB_STATUSES.map((s) => (
            <button key={s} className={'btn sm' + (job.status === s ? ' primary' : '')} onClick={() => changeStatus(s)} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h2>Schedule &amp; progress</h2>
            <form onSubmit={saveSchedule} className="form-grid">
              <div className="field">
                <label>Start date</label>
                <input type="date" value={schedule.start_date || ''} onChange={(e) => setSchedule({ ...schedule, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Projected end date</label>
                <input type="text" value={projectedEnd ? projectedEnd.toLocaleDateString() : '— set a start date —'} disabled />
              </div>
              {STAGES.map((s) => (
                <div className="field" key={s.field}>
                  <label>{s.label} — days</label>
                  <input
                    type="number" min="0"
                    value={schedule[s.field]}
                    onChange={(e) => setSchedule({ ...schedule, [s.field]: e.target.value })}
                  />
                </div>
              ))}
              <div className="field" style={{ gridColumn: '1 / -1', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="sub" style={{ margin: 0 }}>
                  Total project length: <strong>{totalDays} day{totalDays === 1 ? '' : 's'}</strong>
                  {projectedEnd ? ` — ends ${projectedEnd.toLocaleDateString()}` : ''}
                </span>
                <button className="btn primary sm" type="submit">Save schedule</button>
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
                    disabled={savingStage}
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
              <button className="btn sm" onClick={() => setShowEstimateForm((v) => !v)}>+ New estimate</button>
            </div>

            {showEstimateForm && (
              <form onSubmit={submitEstimate} style={{ marginTop: 12, marginBottom: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <LineItemEditor items={items} setItems={setItems} taxRate={taxRate} setTaxRate={setTaxRate} />
                <div className="field" style={{ marginTop: 10, maxWidth: 220 }}>
                  <label>Deposit required upfront (%)</label>
                  <input type="number" min="0" max="100" placeholder="e.g. 30" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
                </div>
                <button className="btn primary sm" type="submit" style={{ marginTop: 10 }}>Save estimate</button>
              </form>
            )}

            {job.estimates.length === 0 ? <div className="empty">No estimates yet.</div> : (
              <div className="stack" style={{ gap: 10 }}>
                {job.estimates.map((est) => (
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
                    <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn sm" onClick={() => convert(est.id)}>Convert to invoice →</button>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
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

                    {inv.balance > 0 && (
                      <button className="btn primary sm" style={{ marginTop: 8 }} onClick={() => setPayingInvoice(inv)}>Charge / record payment</button>
                    )}
                  </div>
                ))}
              </div>
            )}
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
