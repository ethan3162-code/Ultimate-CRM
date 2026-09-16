import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, timeAgo } from '../utils';
import { TrendChart, ColumnChart, BarList, DonutChart } from '../components/charts';

const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const AGING_COLORS = ['var(--accent)', 'var(--amber)', 'var(--amber)', 'var(--red)'];
const TASK_LINK = { contact: '/contacts', deal: '/pipeline', job: '/jobs', ticket: '/tickets' };

function attentionCount(insights) {
  if (!insights) return 0;
  return insights.stalledDeals.length + insights.overdueInvoices.length + insights.overdueTickets.length + insights.staleJobs.length;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [reports, setReports] = useState(null);
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData);
    api.insights().then(setInsights);
    api.reports().then(setReports);
    api.tasks({ open: '1' }).then(setTasks);
  }, []);

  if (!data) return <div className="loading">Loading dashboard…</div>;

  const maxStageValue = Math.max(...Object.values(data.stageCounts).map((s) => s.v), 1);

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
          <div className="label">Unpaid invoices</div>
          <div className="value">{money(data.unpaidTotal)}</div>
          <div className={'delta' + (data.overdueTotal > 0 ? ' warn' : '')}>{money(data.overdueTotal)} overdue</div>
        </div>
        <div className="kpi">
          <div className="label">Collected this month</div>
          <div className="value">{money(data.paidThisMonth)}</div>
          <div className="delta">across all field jobs</div>
        </div>
        <div className="kpi">
          <div className="label">Jobs in motion</div>
          <div className="value">{data.jobsInProgress + data.jobsScheduled}</div>
          <div className="delta">{data.jobsInProgress} in progress · {data.jobsScheduled} scheduled</div>
        </div>
      </div>

      {insights && attentionCount(insights) > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Needs attention <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({attentionCount(insights)})</span></h2>
          <p className="sub" style={{ margin: '-4px 0 12px' }}>Deterministic rules over your own data — no model call, nothing hidden: stalled deals, overdue invoices, SLA-breached tickets, and jobs past their scheduled date.</p>
          <div className="attention-grid">
            {insights.stalledDeals.length > 0 && (
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
            {insights.overdueInvoices.length > 0 && (
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
            {insights.overdueTickets.length > 0 && (
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
            {insights.staleJobs.length > 0 && (
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
          <h2>Pipeline by stage</h2>
          <div className="stack" style={{ gap: 10 }}>
            {Object.entries(data.stageCounts).map(([stage, s]) => (
              <div key={stage}>
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{STAGE_LABELS[stage]} <span className="muted">({s.c})</span></span>
                  <span className="mono" style={{ fontSize: 12.5 }}>{money(s.v)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--line-soft)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.v / maxStageValue) * 100}%`, background: stage === 'lost' ? 'var(--red)' : stage === 'won' ? 'var(--accent)' : 'var(--amber)', borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/pipeline" className="btn sm">Open pipeline board →</Link>
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

      <div className="page-head" style={{ marginTop: 28 }}>
        <div>
          <h2 style={{ margin: 0 }}>Reports</h2>
          <p className="sub" style={{ margin: '2px 0 0' }}>Trends across the last 6 months, straight from your jobs, deals, and invoices.</p>
        </div>
      </div>

      {!reports ? (
        <div className="loading">Loading reports…</div>
      ) : (
        <div className="reports-grid">
          <div className="card span-2">
            <div className="report-card-head">
              <h2>Revenue collected</h2>
              <div className="report-card-total">{money(reports.revenueByMonth.reduce((s, m) => s + m.total, 0))}</div>
            </div>
            <TrendChart data={reports.revenueByMonth} valueKey="total" labelKey="month" formatValue={money} />
          </div>

          <div className="card span-2">
            <div className="report-card-head">
              <h2>Revenue forecast</h2>
              <div className="report-card-total">{money(reports.revenueForecast.reduce((s, m) => s + m.total, 0))}</div>
            </div>
            <p className="sub" style={{ margin: '-4px 0 10px' }}>Open deals' value × probability, by expected close month — a weighted look at what's likely coming in next, not a guarantee.</p>
            <ColumnChart data={reports.revenueForecast} valueKey="total" labelKey="month" formatValue={money} color="var(--amber)" />
            {reports.undatedForecastValue > 0 && (
              <p className="sub" style={{ margin: '10px 0 0' }}>Plus {money(reports.undatedForecastValue)} weighted in open deals with no expected close date set yet.</p>
            )}
          </div>

          <div className="card">
            <h2>New jobs by month</h2>
            <ColumnChart data={reports.jobsByMonth} valueKey="count" labelKey="month" formatValue={(v) => v} />
          </div>

          <div className="card">
            <h2>Jobs by status</h2>
            <DonutChart data={reports.jobsByStatus} valueKey="count" labelKey="label" />
          </div>

          <div className="card">
            <h2>Pipeline value by stage</h2>
            <BarList data={reports.pipelineByStage} valueKey="value" labelKey="label" formatValue={money} />
          </div>

          <div className="card">
            <h2>Invoice aging</h2>
            <BarList
              data={reports.invoiceAging.map((b, i) => ({ ...b, color: AGING_COLORS[i] }))}
              valueKey="amount" labelKey="bucket" formatValue={money} colorKey="color"
            />
          </div>

          <div className="card span-2">
            <h2>Top customers by revenue</h2>
            {reports.topCustomers.length === 0 ? (
              <div className="empty">No paid invoices yet.</div>
            ) : (
              <BarList data={reports.topCustomers} valueKey="amount" labelKey="name" formatValue={money} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
