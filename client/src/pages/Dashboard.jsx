import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, dateTime } from '../utils';
import { TrendChart, ColumnChart, BarList, DonutChart } from '../components/charts';

const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const AGING_COLORS = ['var(--accent)', 'var(--amber)', 'var(--amber)', 'var(--red)'];
const TASK_LINK = { contact: '/contacts', deal: '/pipeline', job: '/jobs', ticket: '/tickets' };
const OPP_STAGES = ['qualified', 'proposal', 'negotiation', 'won', 'lost'];

function attentionCount(insights) {
  if (!insights) return 0;
  return insights.stalledDeals.length + insights.overdueInvoices.length + insights.overdueTickets.length + insights.staleJobs.length;
}

// A flat, most-urgent-first preview for the condensed "Needs attention" card — just enough to
// glance at without opening the full list (see NeedsAttention.jsx for that). Same four rules,
// same order they've always shown in, just capped to 3 total instead of every one of them.
function attentionPreview(insights) {
  if (!insights) return [];
  return [
    ...insights.stalledDeals.map((d) => ({ key: `deal-${d.id}`, to: `/pipeline/${d.id}`, label: d.title, badge: `${d.idle_days}d idle`, color: 'var(--amber)' })),
    ...insights.overdueInvoices.map((inv) => ({ key: `inv-${inv.id}`, to: `/jobs/${inv.job_id}`, label: `${inv.number} · ${money(inv.balance)}`, badge: `${inv.days_overdue}d late`, color: 'var(--red)' })),
    ...insights.overdueTickets.map((t) => ({ key: `tkt-${t.id}`, to: `/tickets/${t.id}`, label: t.subject, badge: `${t.hours_overdue}h over`, color: 'var(--red)' })),
    ...insights.staleJobs.map((j) => ({ key: `job-${j.id}`, to: `/jobs/${j.id}`, label: j.title, badge: `${j.days_past}d past`, color: 'var(--amber)' })),
  ].slice(0, 3);
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

  const maxStageValue = Math.max(...OPP_STAGES.map((s) => data.stageCounts[s].v), 1);
  const newLeadsCount = data.stageCounts.new.c;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Everything on one graph — pipeline, field jobs, and billing in a single view.</p>
        </div>
      </div>

      <div className="kpi-grid">
        <Link to="/reports/system/open-pipeline" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="label">Open pipeline</div>
          <div className="value">{money(data.openPipelineValue)}</div>
          <div className="delta">{data.openDealCount} open deals · {money(data.weightedPipelineValue)} weighted</div>
        </Link>
        <Link to="/reports/system/balance-owed" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="label">Balance owed</div>
          <div className="value">{money(data.unpaidTotal)}</div>
          <div className={'delta' + (data.overdueTotal > 0 ? ' warn' : '')}>{money(data.overdueTotal)} overdue</div>
        </Link>
        <Link to="/reports/system/payments-this-month" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="label">Payments in (this month)</div>
          <div className="value">{money(data.paidThisMonth)}</div>
          <div className="delta">across all field jobs</div>
        </Link>
        <Link to="/reports/system/jobs-in-motion" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="label">Jobs in motion</div>
          <div className="value">{data.jobsInProgress + data.jobsScheduled}</div>
          <div className="delta">{data.jobsInProgress} in progress · {data.jobsScheduled} scheduled</div>
        </Link>
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
          <div className="stack" style={{ gap: 2 }}>
            {attentionPreview(insights).map((item) => (
              <Link key={item.key} to={item.to} className="attention-row">
                <span>{item.label}</span>
                <span className="mono" style={{ color: item.color }}>{item.badge}</span>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/insights" className="btn sm subtle">See full list ({attentionCount(insights)}) →</Link>
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
                <div className="when">{dateTime(a.created_at)}</div>
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
          <p className="sub" style={{ margin: '2px 0 0' }}>Trends across the last 6 months, straight from your jobs, deals, and invoices. Click any chart to open its full report page.</p>
        </div>
        <Link to="/reports" className="btn sm subtle">All reports →</Link>
      </div>

      {!reports ? (
        <div className="loading">Loading reports…</div>
      ) : (
        <div className="reports-grid">
          <Link to="/reports/system/revenue-by-month" className="card span-2" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="report-card-head">
              <h2>Revenue collected</h2>
              <div className="report-card-total">{reports.price_hidden ? money(null) : money(reports.revenueByMonth.reduce((s, m) => s + m.total, 0))}</div>
            </div>
            {reports.price_hidden ? <p className="sub">🔒 Prices are hidden for your account.</p> : <TrendChart data={reports.revenueByMonth} valueKey="total" labelKey="month" formatValue={money} />}
          </Link>

          <Link to="/reports/system/revenue-forecast" className="card span-2" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="report-card-head">
              <h2>Revenue forecast</h2>
              <div className="report-card-total">{reports.price_hidden ? money(null) : money(reports.revenueForecast.reduce((s, m) => s + m.total, 0))}</div>
            </div>
            <p className="sub" style={{ margin: '-4px 0 10px' }}>Open deals' value × probability, by expected close month — a weighted look at what's likely coming in next, not a guarantee.</p>
            {reports.price_hidden ? <p className="sub">🔒 Prices are hidden for your account.</p> : <ColumnChart data={reports.revenueForecast} valueKey="total" labelKey="month" formatValue={money} color="var(--amber)" />}
            {!reports.price_hidden && reports.undatedForecastValue > 0 && (
              <p className="sub" style={{ margin: '10px 0 0' }}>Plus {money(reports.undatedForecastValue)} weighted in open deals with no expected close date set yet.</p>
            )}
          </Link>

          <Link to="/reports/system/jobs-by-month" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>New jobs by month</h2>
            <ColumnChart data={reports.jobsByMonth} valueKey="count" labelKey="month" formatValue={(v) => v} />
          </Link>

          <Link to="/reports/system/jobs-by-status" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Jobs by status</h2>
            <DonutChart data={reports.jobsByStatus} valueKey="count" labelKey="label" />
          </Link>

          <Link to="/reports/system/pipeline-by-stage" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Pipeline value by stage</h2>
            <BarList data={reports.pipelineByStage} valueKey="value" labelKey="label" formatValue={money} />
          </Link>

          <Link to="/reports/system/invoice-aging" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Invoice aging</h2>
            <BarList
              data={reports.invoiceAging.map((b, i) => ({ ...b, color: AGING_COLORS[i] }))}
              valueKey="amount" labelKey="bucket" formatValue={money} colorKey="color"
            />
          </Link>

          <Link to="/reports/system/top-customers" className="card span-2" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Top customers by revenue</h2>
            {reports.topCustomers.length === 0 ? (
              <div className="empty">No paid invoices yet.</div>
            ) : (
              <BarList data={reports.topCustomers} valueKey="amount" labelKey="name" formatValue={money} />
            )}
          </Link>

          <div className="card">
            <h2>Leads created this month, by source</h2>
            {reports.leadsThisMonthBySource.length === 0 ? (
              <div className="empty">No leads yet this month.</div>
            ) : (
              <>
                <BarList data={reports.leadsThisMonthBySource.slice(0, 5)} valueKey="count" labelKey="label" formatValue={(v) => v} />
                {reports.leadsThisMonthBySource.length > 5 && (
                  <div style={{ marginTop: 12 }}>
                    <Link to="/reports/system/leads-by-source-month" className="btn sm subtle">See full list ({reports.leadsThisMonthBySource.length}) →</Link>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h2>Leads by source (all-time)</h2>
            {reports.leadsBySource.length === 0 ? (
              <div className="empty">No leads yet.</div>
            ) : (
              <>
                <BarList data={reports.leadsBySource.slice(0, 5)} valueKey="count" labelKey="label" formatValue={(v) => v} />
                {reports.leadsBySource.length > 5 && (
                  <div style={{ marginTop: 12 }}>
                    <Link to="/reports/system/leads-by-source-alltime" className="btn sm subtle">See full list ({reports.leadsBySource.length}) →</Link>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h2>Booking rate by source</h2>
            <p className="sub" style={{ margin: '-4px 0 10px' }}>Share of leads from each source that got at least one appointment on the calendar.</p>
            {reports.bookingRateBySource.length === 0 ? (
              <div className="empty">No leads yet.</div>
            ) : (
              <>
                <BarList data={reports.bookingRateBySource.slice(0, 5)} valueKey="rate" labelKey="label" formatValue={(v) => `${v}%`} />
                {reports.bookingRateBySource.length > 5 && (
                  <div style={{ marginTop: 12 }}>
                    <Link to="/reports/system/booking-rate-by-source" className="btn sm subtle">See full list ({reports.bookingRateBySource.length}) →</Link>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h2>Sales by source</h2>
            {reports.salesBySource.length === 0 ? (
              <div className="empty">No won opportunities yet.</div>
            ) : (
              <>
                <BarList data={reports.salesBySource.slice(0, 5)} valueKey="amount" labelKey="label" formatValue={money} />
                {reports.salesBySource.length > 5 && (
                  <div style={{ marginTop: 12 }}>
                    <Link to="/reports/system/sales-by-source" className="btn sm subtle">See full list ({reports.salesBySource.length}) →</Link>
                  </div>
                )}
              </>
            )}
          </div>

          <Link to="/reports/system/sales-by-estimator" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Sales by estimator</h2>
            {reports.salesByEstimator.length === 0 ? (
              <div className="empty">No won opportunities with an estimator set yet.</div>
            ) : (
              <BarList data={reports.salesByEstimator} valueKey="amount" labelKey="label" formatValue={money} />
            )}
          </Link>

          <Link to="/reports/system/sales-by-city" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Sales by city</h2>
            {reports.salesByCity.length === 0 ? (
              <div className="empty">No won opportunities with a resolvable address yet.</div>
            ) : (
              <BarList data={reports.salesByCity} valueKey="amount" labelKey="label" formatValue={money} />
            )}
          </Link>

          <Link to="/reports/system/sales-by-service-type" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Sales by service type</h2>
            {reports.salesByServiceType.length === 0 ? (
              <div className="empty">No won opportunities with a service type set yet.</div>
            ) : (
              <BarList data={reports.salesByServiceType} valueKey="amount" labelKey="label" formatValue={money} />
            )}
          </Link>

          <Link to="/reports/system/sales-by-property-type" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Sales by property type</h2>
            {reports.salesByType.length === 0 ? (
              <div className="empty">No won opportunities yet.</div>
            ) : (
              <BarList data={reports.salesByType} valueKey="amount" labelKey="label" formatValue={money} />
            )}
          </Link>

          <Link to="/reports/system/close-rate-by-estimator" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Close rate by estimator</h2>
            {reports.closeRateByPerson.length === 0 ? (
              <div className="empty">No closed (won/lost) opportunities with an estimator set yet.</div>
            ) : (
              <BarList data={reports.closeRateByPerson} valueKey="rate" labelKey="label" formatValue={(v) => `${v}%`} />
            )}
          </Link>

          <Link to="/reports/system/close-rate-by-source" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Close rate by lead source</h2>
            {reports.closeRateBySource.length === 0 ? (
              <div className="empty">No closed (won/lost) opportunities yet.</div>
            ) : (
              <BarList data={reports.closeRateBySource} valueKey="rate" labelKey="label" formatValue={(v) => `${v}%`} />
            )}
          </Link>

          <div className="card span-2">
            <div className="report-card-head">
              <h2>Job profitability</h2>
              <div className="report-card-total" style={{ color: reports.jobProfitability.totalProfit < 0 ? 'var(--red)' : undefined }}>
                {money(reports.jobProfitability.totalProfit)}
              </div>
            </div>
            <p className="sub" style={{ margin: '-4px 0 10px' }}>
              Actual expenses logged against jobs, weighed against invoiced (or approved-estimate) revenue.
              {reports.jobProfitability.margin !== null && ` Overall margin: ${reports.jobProfitability.margin}%.`}
            </p>
            {reports.jobProfitability.byJob.length === 0 ? (
              <div className="empty">Log expenses on a job to see profitability here.</div>
            ) : (
              <div className="stack" style={{ gap: 2 }}>
                {reports.jobProfitability.byJob.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="attention-row">
                    <span>{j.title}</span>
                    <span className="mono" style={{ color: j.profit < 0 ? 'var(--red)' : 'var(--accent-ink)' }}>
                      {money(j.profit)}{j.margin !== null ? ` · ${j.margin}%` : ''}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
