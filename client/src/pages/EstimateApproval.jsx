import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate } from '../utils';
import { TermsBlock } from '../components/DocumentTerms';

/** A minimal signature pad — draw with mouse or touch, exported as a PNG data URL. */
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  function point(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function start(e) {
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1f2a24';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef} className="sign-pad" width={560} height={160}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <button type="button" className="btn subtle sm" style={{ marginTop: 6 }} onClick={clear}>Clear</button>
    </div>
  );
}

/** Company name/address/phone/email/website — the same block on both the "prepared for" header
    and (once signed) the print view. Reused so the estimate and invoice documents look identical. */
function CompanyBlock({ company }) {
  if (!company) return null;
  return (
    <div className="doc-company">
      <div className="doc-company-name">{company.name}</div>
      <div>{company.address_line1}</div>
      <div>{company.city_state_zip}</div>
      <div>{company.phone}</div>
      <div>{company.email}</div>
      <div>{company.website}</div>
    </div>
  );
}

export default function EstimateApproval() {
  const { token } = useParams();
  const [estimate, setEstimate] = useState(undefined); // undefined = loading, null = not found
  const [signedName, setSignedName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [decliningBusy, setDecliningBusy] = useState(false);

  useEffect(() => {
    api.publicEstimate(token).then(setEstimate).catch(() => setEstimate(null));
  }, [token]);

  async function submitSignature(e) {
    e.preventDefault();
    if (!signedName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.signEstimate(token, { signed_name: signedName.trim(), signature_data_url: signatureDataUrl });
      const fresh = await api.publicEstimate(token);
      setEstimate(fresh);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  async function submitDecline() {
    setDecliningBusy(true);
    setError(null);
    try {
      await api.declineEstimate(token, { reason: declineReason.trim() });
      const fresh = await api.publicEstimate(token);
      setEstimate(fresh);
    } catch (err) {
      setError(err.message);
    }
    setDecliningBusy(false);
  }

  if (estimate === undefined) return <div className="approval-shell"><div className="loading">Loading…</div></div>;
  if (estimate === null) return <div className="approval-shell"><div className="card"><div className="empty">This estimate link isn't valid. Ask your contractor to resend it.</div></div></div>;
  if (estimate.pending_internal_approval) {
    return (
      <div className="approval-shell">
        <div className="doc-brand">
          <img src="/logo-full.png" alt={estimate.company?.name || 'Precision Paving & Masonry'} className="brand-logo" />
        </div>
        <div className="card">
          <div className="empty">Estimate {estimate.number} is still being finalized on our end — check back shortly, or reach out to your contractor.</div>
        </div>
      </div>
    );
  }

  const showSchedule = (estimate.payment_schedule || []).length > 1;

  return (
    <div className="approval-shell">
      <div className="doc-brand">
        <img src="/logo-full.png" alt={estimate.company?.name || 'Precision Paving & Masonry'} className="brand-logo" />
        <button type="button" className="btn sm no-print" onClick={() => window.print()}>Print</button>
      </div>

      <div className="card">
        <div className="doc-title">ESTIMATE</div>
        <div className="doc-meta-row">
          <CompanyBlock company={estimate.company} />
          <div className="doc-prepared-for">
            <span className="doc-label">Prepared For</span>
            <div className="doc-company-name">{estimate.customer_name || '—'}</div>
            {estimate.customer_address && <div>{estimate.customer_address}</div>}
            {estimate.customer_phone && <div>{estimate.customer_phone}</div>}
            {estimate.customer_email && <div>{estimate.customer_email}</div>}
          </div>
        </div>
        <div className="doc-numbers-row">
          <div><span className="doc-label">Estimate #</span>{estimate.number}</div>
          <div><span className="doc-label">Date</span>{shortDate(estimate.created_at)}</div>
        </div>
        <p className="sub" style={{ margin: '0 0 12px' }}>
          {estimate.job_title}{estimate.job_address ? ` — ${estimate.job_address}` : ''}
        </p>

        <table className="line-items">
          <thead>
            <tr>
              <th>Description</th>
              {estimate.show_qty !== false && <th className="num">Qty</th>}
              {estimate.show_rate !== false && <th className="num">Unit price</th>}
              {estimate.show_item_total !== false && <th className="num">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {estimate.items.map((it) => {
              const colCount = 1 + (estimate.show_qty !== false ? 1 : 0) + (estimate.show_rate !== false ? 1 : 0) + (estimate.show_item_total !== false ? 1 : 0);
              return (
                <Fragment key={it.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{it.description}</td>
                    {estimate.show_qty !== false && <td className="num">{it.qty}</td>}
                    {estimate.show_rate !== false && <td className="num">{money(it.unit_price)}</td>}
                    {estimate.show_item_total !== false && <td className="num">{money(it.qty * it.unit_price)}</td>}
                  </tr>
                  {it.notes && it.notes.trim() && (
                    <tr className="item-notes-row">
                      <td colSpan={colCount} className="item-notes">{it.notes.trim()}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <div className="totals-row"><span className="lbl">Subtotal</span><span className="amt">{money(estimate.subtotal)}</span></div>
        <div className="totals-row"><span className="lbl">Tax</span><span className="amt">{money(estimate.tax)}</span></div>
        <div className="totals-row"><span className="lbl" style={{ fontWeight: 700 }}>Total</span><span className="amt" style={{ fontWeight: 700 }}>{money(estimate.total)}</span></div>
        {showSchedule && (
          <div className="totals-row"><span className="lbl" style={{ fontWeight: 700 }}>Deposit Due</span><span className="amt" style={{ fontWeight: 700 }}>{money(estimate.payment_schedule[0].amount)}</span></div>
        )}

        {showSchedule && (
          <table className="schedule-table">
            <thead><tr><th>Payment Schedule</th><th className="num">Amount due</th></tr></thead>
            <tbody>
              {estimate.payment_schedule.map((row, i) => (
                <tr key={`${row.label}-${i}`}>
                  <td>{row.label}{row.note && <span className="note">{row.note}</span>}</td>
                  <td className="num">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <TermsBlock
          terms={estimate.terms}
          signature={estimate.signed_at ? {
            date: shortDate(estimate.signed_at),
            companyImage: estimate.company_signature_data_url,
            companyName: estimate.company?.name,
            customerImage: estimate.signature_data_url,
            customerName: estimate.signed_name,
          } : null}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {estimate.signed_at ? (
          <div>
            <h2>✓ Signed</h2>
            <p className="sub">Approved by {estimate.signed_name} on {shortDate(estimate.signed_at)}. Your contractor has been notified — thanks! See the signature at the bottom of the Agreement above.</p>
          </div>
        ) : estimate.declined_at ? (
          <div>
            <h2>You declined this estimate</h2>
            <p className="sub">You declined Estimate {estimate.number} on {shortDate(estimate.declined_at)}. Your contractor has been notified. If that was a mistake, or you'd like a revised estimate, just reach out to them directly.</p>
          </div>
        ) : declining ? (
          <div className="no-print">
            <h2>Decline this estimate</h2>
            <p className="sub" style={{ margin: '-4px 0 12px' }}>Let your contractor know why, if you'd like — this can't be undone, but they can always send you a revised estimate.</p>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Reason (optional)</label>
              <input value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="e.g. going with another contractor" />
            </div>
            {error && <p className="sub" style={{ color: 'var(--red)' }}>{error}</p>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} disabled={decliningBusy} onClick={submitDecline}>
                {decliningBusy ? 'Submitting…' : 'Confirm decline'}
              </button>
              <button className="btn subtle" onClick={() => { setDeclining(false); setError(null); }}>Never mind</button>
            </div>
          </div>
        ) : (
          <div className="no-print">
            <h2>Approve &amp; sign</h2>
            <p className="sub" style={{ margin: '-4px 0 12px' }}>Typing your name and drawing a signature below confirms you approve this estimate, including the Agreement &amp; Terms above, as shown.</p>
            <form onSubmit={submitSignature}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Your full name</label>
                <input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Type your name" required />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Signature (optional)</label>
                <SignaturePad onChange={setSignatureDataUrl} />
              </div>
              {error && <p className="sub" style={{ color: 'var(--red)' }}>{error}</p>}
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <button className="btn primary" type="submit" disabled={submitting || !signedName.trim()}>
                  {submitting ? 'Submitting…' : 'Approve & sign'}
                </button>
                <button type="button" className="btn subtle" onClick={() => setDeclining(true)}>Decline instead</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
