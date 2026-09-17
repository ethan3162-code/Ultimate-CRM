import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';

const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', partial: 'Partially paid', paid: 'Paid', overdue: 'Overdue' };

export default function InvoiceView() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    api.publicInvoice(token).then(setInvoice).catch(() => setInvoice(null));
  }, [token]);

  if (invoice === undefined) return <div className="approval-shell"><div className="loading">Loading…</div></div>;
  if (invoice === null) return <div className="approval-shell"><div className="card"><div className="empty">This invoice link isn't valid. Ask your contractor to resend it.</div></div></div>;

  return (
    <div className="approval-shell">
      <div className="doc-brand">
        <img src="/logo-full.png" alt="Precision Paving & Masonry" className="brand-logo" />
        <button type="button" className="btn sm no-print" onClick={() => window.print()}>Print</button>
      </div>
      <div className="page-head">
        <div>
          <h1>Invoice {invoice.number}</h1>
          <p className="sub">
            {invoice.job_title}{invoice.job_address ? ` — ${invoice.job_address}` : ''}{invoice.customer_name ? ` · for ${invoice.customer_name}` : ''}
            {invoice.due_date ? ` · Due ${invoice.due_date}` : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <table className="line-items">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{money(it.unit_price)}</td>
                <td className="num">{money(it.qty * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals-row"><span className="lbl">Subtotal</span><span className="amt">{money(invoice.subtotal)}</span></div>
        <div className="totals-row"><span className="lbl">Tax</span><span className="amt">{money(invoice.tax)}</span></div>
        <div className="totals-row"><span className="lbl">Total</span><span className="amt">{money(invoice.total)}</span></div>
        {invoice.amount_paid > 0 && (
          <div className="totals-row"><span className="lbl">Paid so far</span><span className="amt">{money(invoice.amount_paid)}</span></div>
        )}
        <div className="totals-row"><span className="lbl" style={{ fontWeight: 700 }}>Balance due</span><span className="amt" style={{ fontWeight: 700 }}>{money(invoice.balance)}</span></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{invoice.balance <= 0 ? '✓ Paid in full' : `Status: ${STATUS_LABEL[invoice.status] || invoice.status}`}</h2>
        {invoice.payments.length > 0 && (
          <table className="line-items" style={{ marginTop: 8 }}>
            <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td>{(p.paid_at || '').slice(0, 10)}</td>
                  <td className="muted">{p.method}</td>
                  <td className="num">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {invoice.balance > 0 && (
          <p className="sub" style={{ marginTop: 10 }}>Questions about this invoice? Reply to the email it came with, or contact us directly.</p>
        )}
      </div>
    </div>
  );
}
