import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, timeAgo } from '../utils';
import FilterBar from '../components/FilterBar';

const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const TASK_LINK = { contact: '/contacts', deal: '/pipeline', job: '/jobs', ticket: '/tickets' };
const OPP_STAGES = ['qualified', 'proposal', 'negotiation', 'won', 'lost'];
const REPORT_CATEGORY_ORDER = ['Financial', 'Sales', 'Leads', 'Jobs'];

function groupReportsByCategory(list) {
  const byCategory = new Map();
  for (const r of list) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }
  const ordered = REPORT_CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => [c, byCategory.get(c)]);
  for (const [c, rows] of byCategory) if (!REPORT_CATEGORY_ORDER.includes(c)) ordered.push([c, rows]);
  return ordered;
}

function attentionCount(insights) {
  if (!insights) return 0;
  return insights.stalledDeals.length + insights.overdueInvoices.length + insights.overdueTickets.length + insights.staleJobs.length;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [reports, setReports] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [customReports, setCustomReports] = useState(null);
  const [builtinReportsList, setBuiltinReportsList] = useState(null);
  const [attentionFilter, setAttentionFilter] = useState('');

  useEffect(() => {
    api.dashboard().then(setData);
    api.insights().then(setInsights);
    api.reports().then(setReports);
    api.tasks({ open: '1' }).then(setTasks);
    api.customReports(5).then(setCustomReports).catch(() => setCustomReports([]));
    api.builtinReports().then(setBuiltinReportsList).catch(() => setBuiltinReportsList([]));
  }, []);

  if (!data) return <div className="loading">Loading dashboard…</div>;

  const maxStageValue = Math.max(...OPP_STAGES.map((s) => data.stageCounts[s].v), 1);
  const newLeadsCount = data.stageCounts.new.c;

  // Each attention rule surfaces a different record type, so "filter by type" here means
  // narrowing to one rule's group rather than a shared field — same instant, clear-in-one-click
  // pattern as the record-list filter bars, just scoped to this one card.
  const attentionTypeDefs = insights ? [
    { key: 'type', label: 'Type', options: [
      insights.stalledDeals.length > 0 && { value: 'stalled', label: 'Stalled deals' },
      insights.overdueInvoices.length > 0 && { value: 'invoices', label: 'Overdue invoices' },
      insights.overdueTickets.length > 0 && { value: 'tickets', label: 'SLA breached' },
      insights.staleJobs.length > 0 && { value: 'jobs', label: 'Jobs past scheduled date' },
    ].filter(Boolean) },
  ].filter((f) => f.options.length > 1) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Everything on one graph — pipeline, field jobs, and billing in a single view.</p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Open pipeline</div>
          <div className="value">{money(data.openPipelineValue)}</div>
          <div className="delta">{data.openDealCount} open deals · {money(data.weightedPipelineValue)} weighted</div>
        </div>
        <div className="kpi">
          <div className="label">Balance owed</div>
          <div className="value">{money(data.unpaidTotal)}</div>
          <div className={'delta' + (data.overdueTotal > 0 ? ' warn' : '')}>{money(data.overdueTotal)} overdue</div>
        </div>
        <div className="kpi">
          <div className="label">Payments in (this month)</div>
          <div className="value">{money(data.paidThisMonth)}</div>
          <div className="delta">across all field jobs</div>
        </div>
        <div className="kpi">
          <div className="label">Jobs in motion</div>
          <div className="value">{data.jobsInProgress + data.jobsScheduled}</div>
          <div className="delta">{data.jobsInProgress} in progress · {data.jobsScheduled} scheduled</div>
        </div>
        {reports && (
          <>
            <Link to="/reports/system/sales-summary" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Sales</div>
              <div className="value">{money(reports.salesSummary.totalSales)}</div>
              <div className="delta">{reports.salesSummary.jobsWon} won</div>
            </Link>
            <Link to="/reports/system/sales-summary" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Average job size</div>
              <div className="value">{money(reports.salesSummary.avgJobSize)}</div>
              <div className="delta">per won opportunity</div>
            </Link>
            <Link to="/reports/system/sales-summary" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Close rate</div>
              <div className="value">{reports.salesSummary.closeRate === null ? '—' : `${reports.salesSummary.closeRate}%`}</div>
              <div className="delta">won ÷ (won + lost)</div>
            </Link>
            <Link to="/reports/system/sales-summary" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Appointments booked</div>
              <div className="value">{reports.salesSummary.appointmentsBooked}</div>
              <div className="delta">all-time</div>
            </Link>
            <Link to="/reports/system/job-profitability" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Gross profit</div>
              <div className="value" style={{ color: reports.jobProfitability.totalProfit < 0 ? 'var(--red)' : undefined }}>{money(reports.jobProfitability.totalProfit)}</div>
              <div className="delta">across jobs with logged expenses</div>
            </Link>
          </>
        )}
      </div>

      {insights && attentionCount(insights) > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Needs attention <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({attentionCount(insights)})</span></h2>
          <p className="sub" style={{ margin: '-4px 0 12px' }}>Deterministic rules over your own data — no model call, nothing hidden: stalled deals, overdue invoices, SLA-breached tickets, and jobs past their scheduled date.</p>
          {attentionTypeDefs.length > 0 && (
            <FilterBar
              filters={attentionTypeDefs} values={{ type: attentionFilter }}
              onChange={(_key, value) => setAttentionFilter(value)}
              onClear={() => setAttentionFilter('')}
            />
          )}
          <div className="attention-grid">
            {(!attentionFilter || attentionFilter === 'stalled') && insights.stalledDeals.length > 0 && (
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
            {(!attentionFilter || attentionFilter === 'invoices') && insights.overdueInvoices.length > 0 && (
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
            {(!attentionFilter || attentionFilter === 'tickets') && insights.overdueTickets.length > 0 && (
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
            {(!attentionFilter || attentionFilter === 'jobs') && insights.staleJobs.length > 0 && (
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
        </div>
      )}

      {tasks && tasks.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Open tasks <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({tasks.length})</span></h2>
          <p className="sub" style={{ margin: '-4px 0 12px' }}>Next steps you've added on contacts, deals, jobs, and tickets — nothing here unless someone added it.</p>
          <div className="stack" style={{ gap: 2 }}>
            {tasks.slice(0, 8).map((t) => {
              const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
              return (
                <Link key={t.id} to={`${TASK_LINK[t.related_type] || ''}/${t.related_id}`} className="attention-row">
                  <span>{t.title}</span>
                  <span className="mono" style={{ color: overdue ? 'var(--red)' : 'var(--muted)' }}>{t.due_date || 'no due date'}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <h2>Opportunities by stage</h2>
            {newLeadsCount > 0 && (
              <Link to="/leads" className="pill amber" style={{ textDecoration: 'none' }}>
                🔥 {newLeadsCount} new lead{newLeadsCount === 1 ? '' : 's'} waiting →
              </Link>
            )}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {OPP_STAGES.map((stage) => {
              const s = data.stageCounts[stage];
              return (
                <div key={stage}>
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{STAGE_LABELS[stage]} <span className="muted">({s.c})</span></span>
                    <span className="mono" style={{ fontSize: 12.5 }}>{money(s.v)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--line-soft)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.v / maxStageValue) * 100}%`, background: stage === 'lost' ? 'var(--red)' : stage === 'won' ? 'var(--accent)' : 'var(--amber)', borderRadius: 5 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/pipeline" className="btn sm">Open opportunities board →</Link>
          </div>
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          {data.recentActivity.length === 0 && <div className="empty">Nothing logged yet.</div>}
          <div className="timeline">
            {data.recentActivity.map((a) => (
              <div className="timeline-item" key={a.id}>
                <div className="when">{timeAgo(a.created_at)}</div>
                <div className="body">
                  <span className="type-tag">{a.type.replace('_', ' ')}</span>
                  {a.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 28, marginBottom: 18 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Your reports</h2>
            <p className="sub" style={{ margin: 0 }}>Build your own report on any data below — pick what to group by, and keep adjusting it any time.</p>
          </div>
          <Link to="/reports" className="btn sm">+ New report</Link>
        </div>
        {customReports === null ? (
          <div className="loading" style={{ marginTop: 10 }}>Loading…</div>
        ) : customReports.length === 0 ? (
          <div className="empty" style={{ marginTop: 10 }}>No custom reports yet — click "+ New report" to build one.</div>
        ) : (
          <div className="stack" style={{ gap: 2, marginTop: 10 }}>
            {customReports.map((r) => (
              <Link key={r.id} to={`/reports/${r.id}`} className="attention-row">
                <span>{r.name}</span>
                <span className="muted" style={{ fontSize: 12.5, textTransform: 'capitalize' }}>{r.data_source}</span>
              </Link>
            ))}
            <div style={{ marginTop: 8 }}>
              <Link to="/reports" className="btn sm subtle">View all reports →</Link>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 28 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Reports</h2>
            <p className="sub" style={{ margin: 0 }}>The standard set, built in — click any one to open its full chart. Trends cover the last 6 months, straight from your jobs, deals, and invoices.</p>
          </div>
          <Link to="/reports" className="btn sm subtle">All reports →</Link>
        </div>
        {builtinReportsList === null ? (
          <div className="loading" style={{ marginTop: 10 }}>Loading…</div>
        ) : (
          <div style={{ marginTop: 10, display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {groupReportsByCategory(builtinReportsList).map(([category, rows]) => (
              <div key={category}>
                <div className="kicker">{category}</div>
                <div className="stack" style={{ gap: 2 }}>
                  {rows.map((r) => (
                    <Link key={r.key} to={`/reports/system/${r.key}`} className="attention-row">
                      <span>{r.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
