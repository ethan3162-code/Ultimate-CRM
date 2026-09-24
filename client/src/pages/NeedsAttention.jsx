// Full "Needs attention" list (Sept 2026) — the Dashboard's own attention card only shows a
// count and a 3-item preview now (see attentionPreview() in Dashboard.jsx); this is where the
// "See full list" link on that card goes for the complete, filterable set of all four rules.
// Same deterministic rules as before, same data (api.insights()), just given its own page instead
// of a long inline list on the Dashboard.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';
import FilterBar from '../components/FilterBar';

function attentionCount(insights) {
  if (!insights) return 0;
  return insights.stalledDeals.length + insights.overdueInvoices.length + insights.overdueTickets.length + insights.staleJobs.length;
}

export default function NeedsAttention() {
  const [insights, setInsights] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => { api.insights().then(setInsights); }, []);

  if (!insights) return <div className="loading">Loading…</div>;

  const typeDefs = [
    { key: 'type', label: 'Type', options: [
      insights.stalledDeals.length > 0 && { value: 'stalled', label: 'Stalled deals' },
      insights.overdueInvoices.length > 0 && { value: 'invoices', label: 'Overdue invoices' },
      insights.overdueTickets.length > 0 && { value: 'tickets', label: 'SLA breached' },
      insights.staleJobs.length > 0 && { value: 'jobs', label: 'Jobs past scheduled date' },
    ].filter(Boolean) },
  ].filter((f) => f.options.length > 1);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/dashboard">Dashboard</Link> / Needs attention</p>
          <h1 style={{ margin: 0 }}>Needs attention <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>({attentionCount(insights)})</span></h1>
        </div>
      </div>

      <div className="card">
        <p className="sub" style={{ margin: '0 0 12px' }}>Deterministic rules over your own data — no model call, nothing hidden: stalled deals, overdue invoices, SLA-breached tickets, and jobs past their scheduled date.</p>
        {typeDefs.length > 0 && (
          <FilterBar
            filters={typeDefs} values={{ type: filter }}
            onChange={(_key, value) => setFilter(value)}
            onClear={() => setFilter('')}
          />
        )}
        {attentionCount(insights) === 0 ? (
          <div className="empty">Nothing needs a look right now.</div>
        ) : (
          <div className="attention-grid">
            {(!filter || filter === 'stalled') && insights.stalledDeals.length > 0 && (
              <div>
                <div className="kicker">Stalled deals</div>
                {insights.stalledDeals.map((d) => (
                  <Link key={d.id} to={`/pipeline/${d.id}`} className="attention-row">
                    <span>{d.title}</span>
                    <span className="mono" style={{ color: 'var(--amber)' }}>{d.idle_days}d idle</span>
                  </Link>
                ))}
              </div>
            )}
            {(!filter || filter === 'invoices') && insights.overdueInvoices.length > 0 && (
              <div>
                <div className="kicker">Overdue invoices</div>
                {insights.overdueInvoices.map((inv) => (
                  <Link key={inv.id} to={`/jobs/${inv.job_id}`} className="attention-row">
                    <span>{inv.number} · {money(inv.balance)}</span>
                    <span className="mono" style={{ color: 'var(--red)' }}>{inv.days_overdue}d late</span>
                  </Link>
                ))}
              </div>
            )}
            {(!filter || filter === 'tickets') && insights.overdueTickets.length > 0 && (
              <div>
                <div className="kicker">SLA breached</div>
                {insights.overdueTickets.map((t) => (
                  <Link key={t.id} to={`/tickets/${t.id}`} className="attention-row">
                    <span>{t.subject}</span>
                    <span className="mono" style={{ color: 'var(--red)' }}>{t.hours_overdue}h over</span>
                  </Link>
                ))}
              </div>
            )}
            {(!filter || filter === 'jobs') && insights.staleJobs.length > 0 && (
              <div>
                <div className="kicker">Jobs past scheduled date</div>
                {insights.staleJobs.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="attention-row">
                    <span>{j.title}</span>
                    <span className="mono" style={{ color: 'var(--amber)' }}>{j.days_past}d past</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
