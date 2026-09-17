import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';

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

export default function EstimateApproval() {
  const { token } = useParams();
  const [estimate, setEstimate] = useState(undefined); // undefined = loading, null = not found
  const [signedName, setSignedName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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

  if (estimate === undefined) return <div className="approval-shell"><div className="loading">Loading…</div></div>;
  if (estimate === null) return <div className="approval-shell"><div className="card"><div className="empty">This estimate link isn't valid. Ask your contractor to resend it.</div></div></div>;
  if (estimate.pending_internal_approval) {
    return (
      <div className="approval-shell">
        <div className="doc-brand">
          <img src="/logo-full.png" alt="Precision Paving & Masonry" className="brand-logo" />
        </div>
        <div className="card">
          <div className="empty">Estimate {estimate.number} is still being finalized on our end — check back shortly, or reach out to your contractor.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="approval-shell">
      <div className="doc-brand">
        <img src="/logo-full.png" alt="Precision Paving & Masonry" className="brand-logo" />
        <button type="button" className="btn sm no-print" onClick={() => window.print()}>Print</button>
      </div>
      <div className="page-head">
        <div>
          <h1>Estimate {estimate.number}</h1>
          <p className="sub">{estimate.job_title}{estimate.job_address ? ` — ${estimate.job_address}` : ''}{estimate.customer_name ? ` · for ${estimate.customer_name}` : ''}</p>
        </div>
      </div>

      <div className="card">
        <table className="line-items">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {estimate.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{money(it.unit_price)}</td>
                <td className="num">{money(it.qty * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals-row"><span className="lbl">Subtotal</span><span className="amt">{money(estimate.subtotal)}</span></div>
        <div className="totals-row"><span className="lbl">Tax</span><span className="amt">{money(estimate.tax)}</span></div>
        <div className="totals-row"><span className="lbl">Total</span><span className="amt">{money(estimate.total)}</span></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {estimate.signed_at ? (
          <div>
            <h2>✓ Signed</h2>
            <p className="sub">Approved by {estimate.signed_name}. Your contractor has been notified — thanks!</p>
          </div>
        ) : (
          <div className="no-print">
            <h2>Approve &amp; sign</h2>
            <p className="sub" style={{ margin: '-4px 0 12px' }}>Typing your name and drawing a signature below confirms you approve this estimate as shown.</p>
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
              <button className="btn primary" type="submit" disabled={submitting || !signedName.trim()}>
                {submitting ? 'Submitting…' : 'Approve & sign'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
