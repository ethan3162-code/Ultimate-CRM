import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate } from '../utils';
import { TermsBlock } from '../components/DocumentTerms';

const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', partial: 'Partially paid', paid: 'Paid', overdue: 'Overdue' };

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
        <img src="/logo-full.png" alt={invoice.company?.name || 'Precision Paving & Masonry'} className="brand-logo" />
        <button type="button" className="btn sm no-print" onClick={() => window.print()}>Print</button>
      </div>

      <div className="card">
        <div className="doc-title">INVOICE</div>
        <div className="doc-meta-row">
          <CompanyBlock company={invoice.company} />
          <div className="doc-prepared-for">
            <span className="doc-label">Bill To</span>
            <div className="doc-company-name">{invoice.customer_name || '—'}</div>
            {invoice.customer_address && <div>{invoice.customer_address}</div>}
            {invoice.customer_phone && <div>{invoice.customer_phone}</div>}
            {invoice.customer_email && <div>{invoice.customer_email}</div>}
          </div>
        </div>
        <div className="doc-numbers-row">
          <div><span className="doc-label">Invoice #</span>{invoice.number}</div>
          <div><span className="doc-label">Date</span>{shortDate(invoice.created_at)}</div>
          {invoice.due_date && <div><span className="doc-label">Due</span>{shortDate(invoice.due_date)}</div>}
        </div>
        <p className="sub" style={{ margin: '0 0 12px' }}>
          {invoice.job_title}{invoice.job_address ? ` — ${invoice.job_address}` : ''}
        </p>

        <table className="line-items">
          <thead>
            <tr>
              <th>Description</th>
              {invoice.show_qty !== false && <th className="num">Qty</th>}
              {invoice.show_rate !== false && <th className="num">Unit price</th>}
              {invoice.show_item_total !== false && <th className="num">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => {
              const colCount = 1 + (invoice.show_qty !== false ? 1 : 0) + (invoice.show_rate !== false ? 1 : 0) + (invoice.show_item_total !== false ? 1 : 0);
              return (
                <Fragment key={it.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{it.description}</td>
                    {invoice.show_qty !== false && <td className="num">{it.qty}</td>}
                    {invoice.show_rate !== false && <td className="num">{money(it.unit_price)}</td>}
                    {invoice.show_item_total !== false && <td className="num">{money(it.qty * it.unit_price)}</td>}
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
        <div className="totals-row"><span className="lbl">Subtotal</span><span className="amt">{money(invoice.subtotal)}</span></div>
        {invoice.markup_amount > 0 && (
          <div className="totals-row"><span className="lbl">Markup{invoice.markup_percent ? ` (${invoice.markup_percent}%)` : ''}</span><span className="amt">{money(invoice.markup_amount)}</span></div>
        )}
        {invoice.discount_amount > 0 && (
          <div className="totals-row"><span className="lbl">Discount</span><span className="amt">-{money(invoice.discount_amount)}</span></div>
        )}
        <div className="totals-row"><span className="lbl">Tax</span><span className="amt">{money(invoice.tax)}</span></div>
        <div className="totals-row"><span className="lbl">Total</span><span className="amt">{money(invoice.total)}</span></div>
        {invoice.amount_paid > 0 && (
          <div className="totals-row"><span className="lbl">Paid so far</span><span className="amt">{money(invoice.amount_paid)}</span></div>
        )}
        <div className="totals-row"><span className="lbl" style={{ fontWeight: 700 }}>Balance due</span><span className="amt" style={{ fontWeight: 700 }}>{money(invoice.balance)}</span></div>

        <TermsBlock
          terms={invoice.terms}
          signature={invoice.signed_at ? {
            date: shortDate(invoice.signed_at),
            companyImage: invoice.company_signature_data_url,
            companyName: invoice.company?.name,
            customerImage: invoice.signature_data_url,
            customerName: invoice.signed_name,
          } : null}
        />
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
