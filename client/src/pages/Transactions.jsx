// Company-wide transactions ledger (Sept 2026) — every invoice issued and every payment
// collected, across every project, in one flat list. Read-only: an invoice or payment is still
// created from inside its own project (see JobDetail.jsx), same as always — this page is a
// rollup on top, for whoever does the books, so they don't have to open every project to see
// what's been billed and what's come in. Gated by its own 'transactions' permission (see
// permissionsConfig.js), separate from 'jobs'.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate } from '../utils';

const STATUS_PILL = { draft: '', sent: 'amber', partial: 'amber', paid: 'green', overdue: 'red' };
const METHOD_LABEL = { card: 'Card', check: 'Check', cash: 'Cash', ach: 'ACH / bank transfer', other: 'Other' };
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'payment', label: 'Payments' },
];

export default function Transactions() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => { api.transactions().then(setData); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.transactions : data.transactions.filter((t) => t.type === filter);
  }, [data, filter]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="sub">Every invoice and payment across all projects, newest first. Record a payment or send an invoice from inside its project.</p>
        </div>
      </div>

      {data && !data.price_hidden && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          <div className="kpi">
            <div className="label">Total invoiced</div>
            <div className="value">{money(data.summary.total_invoiced)}</div>
            <div className="delta">across all projects</div>
          </div>
          <div className="kpi">
            <div className="label">Total collected</div>
            <div className="value">{money(data.summary.total_collected)}</div>
            <div className="delta">payments received</div>
          </div>
          <div className="kpi">
            <div className="label">Outstanding</div>
            <div className="value">{money(data.summary.outstanding)}</div>
            <div className={'delta' + (data.summary.outstanding > 0 ? ' warn' : '')}>balance owed across open invoices</div>
          </div>
        </div>
      )}
      {data && data.price_hidden && (
        <div className="card" style={{ marginBottom: 18 }}><p className="sub" style={{ margin: 0 }}>🔒 Dollar amounts are hidden for your account.</p></div>
      )}

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={'tab' + (filter === f.key ? ' active' : '')} onClick={() => setFilter(f.key)}>
            {f.label} {data && <span className="muted">({f.key === 'all' ? data.transactions.length : data.transactions.filter((t) => t.type === f.key).length})</span>}
          </button>
        ))}
      </div>

      {!data ? <div className="loading">Loading…</div> : rows.length === 0 ? (
        <div className="card"><div className="empty">No transactions yet — invoices and payments recorded on a project will show up here.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Project</th><th>Customer</th><th>Invoice #</th><th>Status / method</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Balance</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{shortDate(t.date)}</td>
                  <td className="muted" style={{ textTransform: 'capitalize' }}>{t.type}</td>
                  <td>{t.job_id ? <Link className="link-strong" to={`/jobs/${t.job_id}`}>{t.job_title}</Link> : <span className="muted">—</span>}</td>
                  <td className="muted">{t.customer || '—'}</td>
                  <td className="mono muted">{t.invoice_number || '—'}</td>
                  <td>
                    {t.type === 'invoice'
                      ? <span className={'pill ' + (STATUS_PILL[t.status] || '')}>{t.status}</span>
                      : <span className="muted">{METHOD_LABEL[t.method] || t.method}{t.reference ? ` · ${t.reference}` : ''}</span>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(t.amount)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{t.type === 'invoice' ? money(t.balance) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
