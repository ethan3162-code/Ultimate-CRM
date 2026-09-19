import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, dateTime, accountName, estimateTotal } from '../utils';
import LineItemEditor from '../components/LineItemEditor';
import PaymentScheduleEditor from '../components/PaymentScheduleEditor';
import DisplayOptions from '../components/DisplayOptions';
import { usePermission, useAuth } from '../auth';

// Same pill palette JobDetail.jsx uses for an estimate's status, plus the internal-approval
// "pending" state this page also has to show for a not-yet-project estimate.
const STATUS_PILL = { draft: '', sent: 'amber', approved: 'green' };

const BLANK_ITEM = { description: '', notes: '', qty: 1, unit_price: 0 };

// Joist-style tabs (Sept 2026) — "Declined" is a customer's explicit decline (declined_at set,
// see routes/public.js's /estimates/:token/decline), never the separate internal-approval reject,
// which still shows inside Pending as a status pill since it hasn't reached the customer at all.
const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
];
// Which date each tab's rows are grouped/sorted by — the date that actually matters for that
// bucket (when it was created, when the customer signed, when they declined).
const DATE_FIELD = { pending: 'created_at', approved: 'signed_at', declined: 'declined_at' };

function monthLabel(s) {
  if (!s) return 'No date';
  return new Date(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function monthKey(s) {
  if (!s) return 'none';
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

export default function Estimates() {
  const { canEdit } = usePermission('estimates');
  const { user: me } = useAuth();
  const canApprove = !!(me && me.can_approve_estimates);

  const [estimates, setEstimates] = useState(null);
  const [deals, setDeals] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [dealId, setDealId] = useState('');
  const [contractId, setContractId] = useState('');
  const [items, setItems] = useState([{ ...BLANK_ITEM }]);
  const [taxRate, setTaxRate] = useState('0');
  const [depositPercent, setDepositPercent] = useState('');
  const [paymentSchedule, setPaymentSchedule] = useState([]);
  const [displayOptions, setDisplayOptions] = useState({ show_rate: true, show_qty: true, show_item_total: true });
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null);
  const [sendingLink, setSendingLink] = useState(null);
  const [rejectingFor, setRejectingFor] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Editing an existing draft (Sept 2026) — a separate bit of form state from the "new estimate"
  // form above so the two can never clobber each other if a click lands on the wrong button.
  const [editingId, setEditingId] = useState(null);
  const [editItems, setEditItems] = useState([{ ...BLANK_ITEM }]);
  const [editTaxRate, setEditTaxRate] = useState('0');
  const [editDepositPercent, setEditDepositPercent] = useState('');
  const [editPaymentSchedule, setEditPaymentSchedule] = useState([]);
  const [editContractId, setEditContractId] = useState('');
  const [editDisplayOptions, setEditDisplayOptions] = useState({ show_rate: true, show_qty: true, show_item_total: true });
  const [savingEdit, setSavingEdit] = useState(false);

  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  function load() {
    api.estimates().then(setEstimates);
  }
  useEffect(() => {
    load();
    api.deals().then(setDeals);
    api.catalogItems().then(setCatalog);
    api.contracts().then(setContracts).catch(() => setContracts([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!dealId) return;
    const cleanItems = items.filter((it) => it.description.trim());
    if (!cleanItems.length) return;
    setSaving(true);
    try {
      await api.createEstimateForDeal({
        deal_id: Number(dealId),
        tax_rate: Number(taxRate) || 0,
        deposit_percent: Number(depositPercent) || 0,
        items: cleanItems.map((it) => ({ description: it.description, notes: it.notes || '', qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
        payment_schedule: paymentSchedule.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), percent: Number(r.percent) || 0 })),
        contract_id: contractId ? Number(contractId) : null,
        ...displayOptions,
      });
      setDealId('');
      setContractId('');
      setItems([{ ...BLANK_ITEM }]);
      setTaxRate('0');
      setDepositPercent('');
      setPaymentSchedule([]);
      setDisplayOptions({ show_rate: true, show_qty: true, show_item_total: true });
      setShowForm(false);
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function copyApprovalLink(est) {
    const url = `${window.location.origin}/approve/${est.sign_token}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(est.id);
    setTimeout(() => setCopiedLink(null), 1500);
  }

  async function sendEstimateVia(est, method) {
    const key = `${est.id}-${method}`;
    setSendingLink(key);
    try {
      const result = await api.sendEstimate(est.id, method);
      if (!result.sent) window.alert(`Couldn't ${method === 'sms' ? 'text' : 'email'} this estimate: ${result.reason}`);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSendingLink(null);
    }
  }

  async function convert(estimateId) {
    await api.convertEstimate(estimateId).catch((err) => window.alert(err.message));
    load();
  }

  async function duplicateEstimate(estimateId) {
    await api.duplicateEstimate(estimateId).catch((err) => window.alert(err.message));
    load();
  }

  function startEdit(est) {
    setEditingId(est.id);
    setEditItems(est.items.map((it) => ({ description: it.description, notes: it.notes || '', qty: it.qty, unit_price: it.unit_price })));
    setEditTaxRate(String(est.tax_rate ?? 0));
    setEditDepositPercent(est.deposit_percent ? String(est.deposit_percent) : '');
    setEditPaymentSchedule((est.payment_schedule || []).map((r) => ({ name: r.name, percent: r.percent })));
    setEditContractId(est.contract_id ? String(est.contract_id) : '');
    setEditDisplayOptions({
      show_rate: est.show_rate !== 0, show_qty: est.show_qty !== 0, show_item_total: est.show_item_total !== 0,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(e, estimateId) {
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
      setEditingId(null);
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

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const salesItems = (catalog || []).filter((c) => !c.material_key);

  // Three buckets matching the Joist tabs — Declined is a customer's explicit decline
  // (declined_at), never the separate internal-approval reject, which still shows inside Pending
  // as a status pill since it hasn't reached the customer at all.
  const pending = (estimates || []).filter((est) => !est.signed_at && !est.declined_at);
  const approved = (estimates || []).filter((est) => !!est.signed_at);
  const declined = (estimates || []).filter((est) => !!est.declined_at);
  const buckets = { pending, approved, declined };
  const activeList = buckets[tab] || [];

  // Search matches name, address, or estimate number — Joist's own search also matches a PO #,
  // but nothing in this CRM's schema tracks a PO number for an estimate, so that one's omitted.
  const q = search.trim().toLowerCase();
  const filtered = q
    ? activeList.filter((est) => {
        const name = (accountName(est, est.linked_title) || '').toLowerCase();
        return (
          name.includes(q) ||
          (est.number || '').toLowerCase().includes(q) ||
          (est.linked_address || '').toLowerCase().includes(q)
        );
      })
    : activeList;

  const dateField = DATE_FIELD[tab];
  const sorted = [...filtered].sort((a, b) => new Date(b[dateField] || b.created_at) - new Date(a[dateField] || a.created_at));
  const groups = [];
  for (const est of sorted) {
    const groupDate = est[dateField] || est.created_at;
    const key = monthKey(groupDate);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: monthLabel(groupDate), items: [] };
      groups.push(group);
    }
    group.items.push(est);
  }

  function renderDetail(est) {
    if (editingId === est.id) {
      return (
        <div className="card">
          <p className="sub" style={{ margin: '0 0 10px' }}>
            Editing {est.number}{est.approval_status && est.approval_status !== 'pending' ? ' — saving will clear its approval status, since the numbers are changing' : ''}.
          </p>
          <form onSubmit={(e) => saveEdit(e, est.id)}>
            <LineItemEditor items={editItems} setItems={setEditItems} taxRate={editTaxRate} setTaxRate={setEditTaxRate} catalog={salesItems} />
            <div className="field" style={{ margin: '10px 0', maxWidth: 200 }}>
              <label>Deposit required upfront (%)</label>
              <input type="number" min="0" max="100" placeholder="e.g. 30" value={editDepositPercent} onChange={(e) => setEditDepositPercent(e.target.value)} />
            </div>
            <PaymentScheduleEditor rows={editPaymentSchedule} setRows={setEditPaymentSchedule} total={estimateTotal(editItems, editTaxRate)} />
            <div className="field" style={{ margin: '10px 0', maxWidth: 320 }}>
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
              <button className="btn subtle sm" type="button" onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        </div>
      );
    }
    return (
      <div className="card">
        <p className="sub" style={{ margin: '0 0 10px' }}>
          {est.linked_type === 'project' ? (
            <Link to={`/jobs/${est.linked_id}`}>Project: {est.linked_title}</Link>
          ) : est.linked_type === 'opportunity' ? (
            <Link to={`/pipeline/${est.linked_id}`}>Opportunity: {est.linked_title}</Link>
          ) : 'No linked opportunity'}
          {' · '}{dateTime(est.created_at)}
          {' · '}<span className={'pill ' + (STATUS_PILL[est.status] || '')}>{est.status}</span>
        </p>

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
            ✓ Signed by {est.signed_name} — {dateTime(est.signed_at)}
          </div>
        ) : est.declined_at ? (
          <div className="sub" style={{ margin: '6px 0 0', color: 'var(--red)' }}>
            ✗ Declined by the customer — {dateTime(est.declined_at)}{est.decline_reason ? `: ${est.decline_reason}` : '.'}
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
        {est.signed_at && est.has_invoice && (
          <div className="sub" style={{ margin: '6px 0 0', color: 'var(--accent-ink)' }}>✓ Invoiced already.</div>
        )}

        {canApprove && est.approval_status === 'pending' && (
          <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
            {rejectingFor === est.id ? (
              <>
                <input
                  type="text" placeholder="Reason (optional)" value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
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
            {!est.signed_at && !est.has_invoice && <button className="btn sm" onClick={() => startEdit(est)}>Edit</button>}
            {est.job_id && !est.has_invoice && <button className="btn sm" onClick={() => convert(est.id)}>Convert to invoice →</button>}
            <a className="btn sm" href={api.estimatePdfUrl(est.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>View/Print PDF</a>
            <button className="btn sm" onClick={() => duplicateEstimate(est.id)}>Duplicate</button>
            {!est.signed_at && <button className="btn sm subtle" onClick={() => deleteEstimateRow(est.id)}>Delete</button>}
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
                <button className="btn sm" disabled={sendingLink === `${est.id}-email`} onClick={() => sendEstimateVia(est, 'email')}>
                  {sendingLink === `${est.id}-email` ? 'Emailing…' : 'Email'}
                </button>
                <button className="btn sm" disabled={sendingLink === `${est.id}-sms`} onClick={() => sendEstimateVia(est, 'sms')}>
                  {sendingLink === `${est.id}-sms` ? 'Texting…' : 'Text'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Compact Joist-style row — name, estimate #, and a couple of at-a-glance badges on the left;
  // address/phone on the right; click anywhere to expand the full detail card below it. Every
  // action button inside the detail stops propagation so clicking one doesn't also collapse the row.
  function renderRow(est) {
    const isOpen = expanded.has(est.id);
    return (
      <div className="est-item" key={est.id}>
        <div className="est-row" onClick={() => toggleExpanded(est.id)}>
          <div className="est-row-main">
            <span className="est-row-name">{accountName(est, est.linked_title)} — {est.number}</span>
            {est.has_invoice && <span className="pill blue">INVOICED</span>}
            {est.requires_internal_approval && est.approval_status === 'pending' && <span className="pill amber">Awaiting approval</span>}
            {est.requires_internal_approval && est.approval_status === 'rejected' && <span className="pill red">Approval rejected</span>}
          </div>
          <div className="est-row-right">
            <div className="est-row-side">
              {est.linked_address && <div>{est.linked_address}</div>}
              {est.linked_phone && <div>{est.linked_phone}</div>}
            </div>
            <span className={'est-row-chevron' + (isOpen ? ' open' : '')}>›</span>
          </div>
        </div>
        {isOpen && <div className="est-detail-wrap">{renderDetail(est)}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Estimates</h1>
          <p className="sub">Every estimate you've written, from the moment it's created against an opportunity through to a signed, invoiced project.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New estimate'}</button>}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>New estimate</h2>
          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 10, maxWidth: 420 }}>
              <label>Opportunity</label>
              <select value={dealId} onChange={(e) => setDealId(e.target.value)} required>
                <option value="">— select an opportunity —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{accountName(d, d.title)} — {d.title}</option>
                ))}
              </select>
            </div>
            <LineItemEditor items={items} setItems={setItems} taxRate={taxRate} setTaxRate={setTaxRate} catalog={salesItems} />
            <div className="field" style={{ margin: '10px 0', maxWidth: 200 }}>
              <label>Deposit required upfront (%)</label>
              <input type="number" min="0" max="100" placeholder="e.g. 30" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
            </div>
            <PaymentScheduleEditor rows={paymentSchedule} setRows={setPaymentSchedule} total={estimateTotal(items, taxRate)} />
            <div className="field" style={{ margin: '10px 0', maxWidth: 320 }}>
              <label>Contract <span className="muted" style={{ fontWeight: 400 }}>— terms &amp; conditions this estimate carries</span></label>
              <select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">— default for customer type —</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <DisplayOptions value={displayOptions} onChange={setDisplayOptions} />
            <button className="btn primary sm" type="submit" disabled={saving || !dealId} style={{ marginTop: 10 }}>{saving ? 'Saving…' : 'Save estimate'}</button>
          </form>
        </div>
      )}

      {estimates === null ? (
        <div className="loading">Loading…</div>
      ) : estimates.length === 0 ? (
        <div className="empty">No estimates yet — create one against an opportunity above.</div>
      ) : (
        <>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
                {t.label} <span className="muted">({buckets[t.key].length})</span>
              </button>
            ))}
          </div>

          <div className="field est-search">
            <input
              type="text" placeholder="Search by name, address, or estimate #"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {groups.length === 0 ? (
            <div className="empty">
              {q ? 'No estimates match your search.' : (
                tab === 'pending' ? 'Nothing pending.' : tab === 'approved' ? 'Nothing signed yet.' : 'Nothing declined.'
              )}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div className="est-month-header">{g.label}</div>
                <div className="est-group">{g.items.map(renderRow)}</div>
              </div>
            ))
          )}
        </>
      )}
    </>
  );
}
