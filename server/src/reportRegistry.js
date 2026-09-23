// Registry of the fixed, non-editable "built-in" reports (Sept 2026) — these used to be a big
// grid of charts rendered directly on the Dashboard (see routes/reports.js for how the underlying
// numbers are computed). Pulled out into their own pages so each one is a normal, clickable report
// reachable from /reports (and linked to from the Dashboard), the same way a custom report is —
// just not editable or deletable, since the shape of each one is fixed.
//
// `build(payload)` takes the payload routes/reports.js already computes (raw, or money-redacted
// for a login without price visibility — same object either way) and picks out + reshapes just
// the piece this report needs. See routes/builtinReports.js for how this registry is used.

function sumOrNull(rows, key) {
  if (rows.length === 0) return 0;
  if (rows.some((r) => r[key] === null || r[key] === undefined)) return null;
  return +rows.reduce((s, r) => s + (r[key] || 0), 0).toFixed(2);
}

const BUILTIN_REPORTS = [
  {
    key: 'revenue-by-month',
    title: 'Revenue collected',
    description: 'Payments collected by month, over the last 6 months.',
    category: 'Financial',
    build: (p) => ({
      chartType: 'trend', rows: p.revenueByMonth, valueKey: 'total', labelKey: 'month', format: 'money',
      total: sumOrNull(p.revenueByMonth, 'total'),
    }),
  },
  {
    key: 'revenue-forecast',
    title: 'Revenue forecast',
    description: "Open deals' value × probability, by expected close month — a weighted look at what's likely coming in next, not a guarantee.",
    category: 'Financial',
    build: (p) => ({
      chartType: 'column', rows: p.revenueForecast, valueKey: 'total', labelKey: 'month', format: 'money', color: 'var(--amber)',
      total: sumOrNull(p.revenueForecast, 'total'),
      extra: { undatedForecastValue: p.undatedForecastValue },
    }),
  },
  {
    key: 'invoice-aging',
    title: 'Invoice aging',
    description: 'Unpaid invoice balance, bucketed by days past due.',
    category: 'Financial',
    build: (p) => ({
      chartType: 'barlist',
      rows: p.invoiceAging.map((b, i) => ({ ...b, color: ['var(--accent)', 'var(--amber)', 'var(--amber)', 'var(--red)'][i] })),
      valueKey: 'amount', labelKey: 'bucket', format: 'money', colorKey: 'color',
    }),
  },
  {
    key: 'top-customers',
    title: 'Top customers by revenue',
    description: 'The five customers who have paid the most, all-time.',
    category: 'Financial',
    build: (p) => ({ chartType: 'barlist', rows: p.topCustomers, valueKey: 'amount', labelKey: 'name', format: 'money' }),
  },
  {
    key: 'job-profitability',
    title: 'Job profitability',
    description: 'Actual expenses logged against jobs, weighed against invoiced (or approved-estimate) revenue.',
    category: 'Financial',
    build: (p) => ({
      chartType: 'joblist',
      format: 'money',
      rows: p.jobProfitability.byJob,
      total: p.jobProfitability.totalProfit,
      extra: { margin: p.jobProfitability.margin },
    }),
  },
  {
    key: 'sales-summary',
    title: 'Sales summary',
    description: 'Won opportunity totals, all-time.',
    category: 'Sales',
    build: (p) => ({
      chartType: 'stats',
      stats: [
        { label: 'Sales', value: p.salesSummary.totalSales, format: 'money' },
        { label: 'Average job size', value: p.salesSummary.avgJobSize, format: 'money' },
        { label: 'Close rate', value: p.salesSummary.closeRate, format: 'percent' },
        { label: 'Appointments booked', value: p.salesSummary.appointmentsBooked, format: 'number' },
      ],
      format: 'money',
      rowsLabel: 'Projects sold',
      rows: p.salesSummary.deals,
    }),
  },
  {
    key: 'open-pipeline',
    title: 'Open pipeline',
    description: 'Every opportunity still open, by value — which projects it is.',
    category: 'Sales',
    build: (p) => ({ chartType: 'recordlist', format: 'money', rows: p.openPipeline.rows, total: p.openPipeline.total }),
  },
  {
    key: 'balance-owed',
    title: 'Balance owed',
    description: 'Unpaid invoice balance, by project — which projects still owe money.',
    category: 'Financial',
    build: (p) => ({ chartType: 'recordlist', format: 'money', rows: p.balanceOwedByJob, total: p.totalBalanceOwed }),
  },
  {
    key: 'payments-this-month',
    title: 'Payments in this month',
    description: 'Payments collected so far this month, by project.',
    category: 'Financial',
    build: (p) => ({ chartType: 'recordlist', format: 'money', rows: p.paymentsThisMonth.rows, total: p.paymentsThisMonth.total }),
  },
  {
    key: 'jobs-in-motion',
    title: 'Jobs in motion',
    description: 'Every project currently scheduled or in progress.',
    category: 'Jobs',
    build: (p) => ({ chartType: 'recordlist', rows: p.jobsInMotion.rows }),
  },
  {
    key: 'pipeline-by-stage',
    title: 'Pipeline value by stage',
    description: 'Open and closed opportunity value, grouped by pipeline stage.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.pipelineByStage, valueKey: 'value', labelKey: 'label', format: 'money' }),
  },
  {
    key: 'sales-by-source',
    title: 'Sales by source',
    description: 'Won opportunity value, grouped by lead source.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.salesBySource, valueKey: 'amount', labelKey: 'label', format: 'money' }),
  },
  {
    key: 'sales-by-estimator',
    title: 'Sales by estimator',
    description: 'Won opportunity value, grouped by the rep who closed it.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.salesByEstimator, valueKey: 'amount', labelKey: 'label', format: 'money' }),
  },
  {
    key: 'sales-by-city',
    title: 'Sales by city',
    description: 'Won opportunity value, grouped by city.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.salesByCity, valueKey: 'amount', labelKey: 'label', format: 'money' }),
  },
  {
    key: 'sales-by-service-type',
    title: 'Sales by service type',
    description: 'Won opportunity value, grouped by service/work type.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.salesByServiceType, valueKey: 'amount', labelKey: 'label', format: 'money' }),
  },
  {
    key: 'sales-by-property-type',
    title: 'Sales by property type',
    description: 'Won opportunity value, grouped by customer/property type.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.salesByType, valueKey: 'amount', labelKey: 'label', format: 'money' }),
  },
  {
    key: 'close-rate-by-estimator',
    title: 'Close rate by estimator',
    description: 'Won ÷ (won + lost), grouped by the rep who closed it.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.closeRateByPerson, valueKey: 'rate', labelKey: 'label', format: 'percent' }),
  },
  {
    key: 'close-rate-by-source',
    title: 'Close rate by lead source',
    description: 'Won ÷ (won + lost), grouped by lead source.',
    category: 'Sales',
    build: (p) => ({ chartType: 'barlist', rows: p.closeRateBySource, valueKey: 'rate', labelKey: 'label', format: 'percent' }),
  },
  {
    key: 'leads-by-source-month',
    title: 'Leads created this month, by source',
    description: 'New leads captured so far this month, grouped by source.',
    category: 'Leads',
    build: (p) => ({ chartType: 'barlist', rows: p.leadsThisMonthBySource, valueKey: 'count', labelKey: 'label', format: 'number' }),
  },
  {
    key: 'leads-by-source-alltime',
    title: 'Leads by source (all-time)',
    description: 'Every lead ever captured, grouped by source.',
    category: 'Leads',
    build: (p) => ({ chartType: 'barlist', rows: p.leadsBySource, valueKey: 'count', labelKey: 'label', format: 'number' }),
  },
  {
    key: 'booking-rate-by-source',
    title: 'Booking rate by source',
    description: 'Share of leads from each source that got at least one appointment on the calendar.',
    category: 'Leads',
    build: (p) => ({ chartType: 'barlist', rows: p.bookingRateBySource, valueKey: 'rate', labelKey: 'label', format: 'percent' }),
  },
  {
    key: 'jobs-by-month',
    title: 'New jobs by month',
    description: 'Jobs created by month, over the last 6 months.',
    category: 'Jobs',
    build: (p) => ({ chartType: 'column', rows: p.jobsByMonth, valueKey: 'count', labelKey: 'month', format: 'number' }),
  },
  {
    key: 'jobs-by-status',
    title: 'Jobs by status',
    description: 'Current job count, grouped by status.',
    category: 'Jobs',
    build: (p) => ({ chartType: 'donut', rows: p.jobsByStatus, valueKey: 'count', labelKey: 'label', format: 'number' }),
  },
];

function listBuiltinReports() {
  return BUILTIN_REPORTS.map(({ key, title, description, category }) => ({ key, title, description, category }));
}

function getBuiltinReport(key, payload) {
  const def = BUILTIN_REPORTS.find((r) => r.key === key);
  if (!def) return null;
  return {
    key: def.key, title: def.title, description: def.description, category: def.category,
    price_hidden: !!payload.price_hidden,
    ...def.build(payload),
  };
}

module.exports = { BUILTIN_REPORTS, listBuiltinReports, getBuiltinReport };
