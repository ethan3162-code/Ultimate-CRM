import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, dateTime } from '../utils';
import { useAuth } from '../auth';

// A dedicated queue for the internal-approval workflow (Sept 2026) — separate from the small
// "Pending estimate approvals" widget on Home, this is the full page an approver works from:
// every estimate a login flagged "requires estimate approval" has asked to send, still waiting on
// a yes/no, with its line items visible so the approver doesn't have to open the Project or
// Opportunity just to see what's in it. Gated purely by the can_approve_estimates account flag
// (same as the inline approve/reject buttons on the Estimates and Project pages already are) —
// not a page permission, since this isn't a business-object page like Jobs or Contacts, it's a
// personal capability an admin grants per login in Users & permissions.
export default function EstimateApprovals() {
  const { user: me } = useAuth();
  const canApprove = !!(me && me.can_approve_estimates);
  const [approvals, setApprovals] = useState(null);
  const [rejectingFor, setRejectingFor] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(null);

  function load() {
    api.pendingEstimateApprovals().then(setApprovals).catch(() => setApprovals([]));
  }
  useEffect(() => { if (canApprove) load(); }, [canApprove]);

  if (!canApprove) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
        <h2>Not available for your role</h2>
        <p className="sub">Only logins flagged "Can approve estimates" (Users &amp; permissions) can see this page. Ask an admin if you think that's wrong.</p>
      </div>
    );
  }

  async function approve(id) {
    setBusy(id);
    await api.approveEstimate(id).catch((err) => window.alert(err.message));
    setBusy(null);
    load();
  }
  async function reject(id) {
    setBusy(id);
    await api.rejectEstimate(id, { reason: rejectReason.trim() }).catch((err) => window.alert(err.message));
    setRejectingFor(null);
    setRejectReason('');
    setBusy(null);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Estimate approvals</h1>
          <p className="sub">Estimates from salespeople who need your sign-off before they can go out to the customer.</p>
        </div>
      </div>

      {approvals === null ? (
        <div className="loading">Loading…</div>
      ) : approvals.length === 0 ? (
        <div className="empty">Nothing waiting on approval right now.</div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {approvals.map((a) => (
            <div key={a.id} className="card">
              <div className="row between">
                <div>
                  <span className="link-strong mono">{a.number}</span>
                  {a.linked_title && (
                    <span className="sub">
                      {' '}for{' '}
                      {a.linked_type === 'opportunity' ? (
                        <Link to={`/pipeline/${a.linked_id}`}>{a.linked_title}</Link>
                      ) : (
                        <Link to={`/jobs/${a.linked_id}`}>{a.linked_title}</Link>
                      )}
                    </span>
                  )}
                </div>
                <span className="pill amber">Pending approval</span>
              </div>
              <p className="sub" style={{ margin: '2px 0 10px' }}>
                Requested{a.requested_by ? ` by ${a.requested_by}` : ''} · {dateTime(a.requested_at)}
              </p>

              <ul style={{ margin: '8px 0', paddingLeft: 18, fontSize: 13 }}>
                {a.items.map((it) => (
                  <li key={it.id}>{it.description} — {it.qty} × {it.unit_price === null ? '—' : money(it.unit_price)}</li>
                ))}
              </ul>
              {a.total !== null && (
                <div className="row between" style={{ fontSize: 13 }}>
                  <span className="muted">Total</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{money(a.total)}</span>
                </div>
              )}

              <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
                {rejectingFor === a.id ? (
                  <>
                    <input
                      type="text" placeholder="Reason (optional)" value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      style={{ minWidth: 200, border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px' }}
                    />
                    <button className="btn sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} disabled={busy === a.id} onClick={() => reject(a.id)}>Confirm reject</button>
                    <button className="btn subtle sm" onClick={() => { setRejectingFor(null); setRejectReason(''); }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn primary sm" disabled={busy === a.id} onClick={() => approve(a.id)}>Approve</button>
                    <button className="btn sm" disabled={busy === a.id} onClick={() => setRejectingFor(a.id)}>Reject…</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

