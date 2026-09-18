// Whitelisted data sources for the custom report builder (routes/reports-custom.js). A report
// row only ever stores KEYS (data_source/group_by/metric/date_field) — never raw SQL — and every
// one of those keys is looked up in the tables below before it touches a query, so nothing a
// client sends is ever interpolated into SQL directly. Adding a new reportable dimension/metric
// is just adding an entry here; the route code and client UI both read this list generically.
const db = require('./db');

// Each dimension/metric's `sql` is a trusted, hand-written expression over this source's `from`
// clause's aliases — never built from user input.
const SOURCES = {
  leads: {
    label: 'Leads',
    from: `FROM deals d WHERE d.stage = 'new'`,
    dimensions: {
      source: { label: 'Source', sql: 'd.source' },
      rep: { label: 'Assigned rep', sql: 'd.rep' },
      work_type: { label: 'Service type', sql: 'd.work_type' },
      lead_status: { label: 'Lead status', sql: 'd.lead_status' },
      month: { label: 'Month created', sql: `strftime('%Y-%m', d.created_at)` },
    },
    metrics: {
      count: { label: 'Number of leads', sql: 'COUNT(*)', money: false },
      sum_value: { label: 'Total estimated value', sql: 'SUM(COALESCE(d.value,0))', money: true },
    },
    dateFields: { created_at: { label: 'Date created', sql: 'd.created_at' } },
  },
  opportunities: {
    label: 'Opportunities',
    from: `FROM deals d WHERE d.stage != 'new'`,
    dimensions: {
      stage: { label: 'Stage', sql: 'd.stage' },
      source: { label: 'Source', sql: 'd.source' },
      rep: { label: 'Assigned rep', sql: 'd.rep' },
      work_type: { label: 'Service type', sql: 'd.work_type' },
      month: { label: 'Month created', sql: `strftime('%Y-%m', d.created_at)` },
    },
    metrics: {
      count: { label: 'Number of opportunities', sql: 'COUNT(*)', money: false },
      sum_value: { label: 'Total value', sql: 'SUM(COALESCE(d.value,0))', money: true },
    },
    dateFields: {
      created_at: { label: 'Date created', sql: 'd.created_at' },
      expected_close: { label: 'Expected close date', sql: 'd.expected_close' },
    },
  },
  projects: {
    label: 'Projects',
    from: `FROM jobs j`,
    dimensions: {
      status: { label: 'Status', sql: 'j.status' },
      stage: { label: 'Stage', sql: 'j.stage' },
      month: { label: 'Month created', sql: `strftime('%Y-%m', j.created_at)` },
    },
    metrics: {
      count: { label: 'Number of projects', sql: 'COUNT(*)', money: false },
      sum_contract: { label: 'Total contract amount', sql: 'SUM(COALESCE(j.contract_amount,0))', money: true },
      sum_change_orders: { label: 'Total change orders', sql: 'SUM(COALESCE(j.change_order_amount,0))', money: true },
    },
    dateFields: {
      created_at: { label: 'Date created', sql: 'j.created_at' },
      start_date: { label: 'Start date', sql: 'j.start_date' },
    },
  },
  invoices: {
    label: 'Invoices',
    from: `
      FROM invoices i
      LEFT JOIN (SELECT invoice_id, SUM(qty*unit_price) AS amount FROM invoice_items GROUP BY invoice_id) ii ON ii.invoice_id = i.id
      LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
    `,
    dimensions: {
      status: { label: 'Status', sql: 'i.status' },
      kind: { label: 'Kind', sql: 'i.kind' },
      month: { label: 'Month created', sql: `strftime('%Y-%m', i.created_at)` },
    },
    metrics: {
      count: { label: 'Number of invoices', sql: 'COUNT(*)', money: false },
      sum_amount: { label: 'Total invoiced', sql: 'SUM(COALESCE(ii.amount,0))', money: true },
      sum_paid: { label: 'Total collected', sql: 'SUM(COALESCE(p.paid,0))', money: true },
    },
    dateFields: {
      created_at: { label: 'Date created', sql: 'i.created_at' },
      due_date: { label: 'Due date', sql: 'i.due_date' },
    },
  },
  tickets: {
    label: 'Tickets',
    from: `FROM tickets t`,
    dimensions: {
      status: { label: 'Status', sql: 't.status' },
      priority: { label: 'Priority', sql: 't.priority' },
      month: { label: 'Month created', sql: `strftime('%Y-%m', t.created_at)` },
    },
    metrics: {
      count: { label: 'Number of tickets', sql: 'COUNT(*)', money: false },
      avg_satisfaction: { label: 'Average satisfaction score', sql: 'AVG(t.satisfaction_score)', money: false },
    },
    dateFields: {
      created_at: { label: 'Date created', sql: 't.created_at' },
      resolved_at: { label: 'Date resolved', sql: 't.resolved_at' },
    },
  },
  employees: {
    label: 'Employees',
    from: `FROM employees e`,
    dimensions: {
      position: { label: 'Position', sql: 'e.position' },
      active: { label: 'Active / inactive', sql: `CASE WHEN e.active THEN 'Active' ELSE 'Inactive' END` },
    },
    metrics: {
      count: { label: 'Number of employees', sql: 'COUNT(*)', money: false },
      avg_rate: { label: 'Average daily rate', sql: 'AVG(e.daily_rate)', money: true },
    },
    dateFields: { hire_date: { label: 'Hire date', sql: 'e.hire_date' } },
  },
  vehicles: {
    label: 'Vehicles',
    from: `FROM vehicles v`,
    dimensions: {
      status: { label: 'Status', sql: 'v.status' },
      make: { label: 'Make', sql: 'v.make' },
    },
    metrics: {
      count: { label: 'Number of vehicles', sql: 'COUNT(*)', money: false },
    },
    dateFields: { created_at: { label: 'Date added', sql: 'v.created_at' } },
  },
  subcontractors: {
    label: 'Subcontractors',
    from: `FROM subcontractors s`,
    dimensions: {
      trade: { label: 'Trade', sql: 's.trade' },
      active: { label: 'Active / inactive', sql: `CASE WHEN s.active THEN 'Active' ELSE 'Inactive' END` },
    },
    metrics: {
      count: { label: 'Number of subcontractors', sql: 'COUNT(*)', money: false },
    },
    dateFields: { created_at: { label: 'Date added', sql: 's.created_at' } },
  },
};

const DATE_RANGES = {
  all: 'All time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  custom: 'Custom range',
};

const CHART_TYPES = { bar: 'Bar chart', table: 'Table' };

/** Metadata for every source, trimmed to a shape the client can render pickers from directly. */
function sourceMeta(key) {
  const s = SOURCES[key];
  if (!s) return null;
  return {
    key,
    label: s.label,
    dimensions: Object.entries(s.dimensions).map(([k, v]) => ({ key: k, label: v.label })),
    metrics: Object.entries(s.metrics).map(([k, v]) => ({ key: k, label: v.label, money: !!v.money })),
    dateFields: Object.entries(s.dateFields).map(([k, v]) => ({ key: k, label: v.label })),
  };
}

function allSourcesMeta() {
  return Object.keys(SOURCES).map(sourceMeta);
}

/** Picks a valid default group_by/metric/date_field for a source — used both when a report's
    data_source changes to one where its current picks no longer apply, and when a brand new
    report is created. */
function defaultsFor(sourceKey) {
  const s = SOURCES[sourceKey];
  if (!s) return null;
  return {
    group_by: Object.keys(s.dimensions)[0],
    metric: Object.keys(s.metrics)[0],
    date_field: Object.keys(s.dateFields)[0] || null,
  };
}

function isValidSource(key) { return Object.prototype.hasOwnProperty.call(SOURCES, key); }
function isValidDimension(sourceKey, key) { return !!SOURCES[sourceKey]?.dimensions[key]; }
function isValidMetric(sourceKey, key) { return !!SOURCES[sourceKey]?.metrics[key]; }
function isValidDateField(sourceKey, key) { return key == null || !!SOURCES[sourceKey]?.dateFields[key]; }
function isValidDateRange(key) { return Object.prototype.hasOwnProperty.call(DATE_RANGES, key); }
function isValidChartType(key) { return Object.prototype.hasOwnProperty.call(CHART_TYPES, key); }

/** Builds and runs the grouped query for one report definition. Returns
    { rows: [{label, value}], money, sourceLabel, groupByLabel, metricLabel }. Every SQL fragment
    used here comes from the SOURCES whitelist above, keyed by the report's own stored strings —
    never the raw strings themselves — so this is safe even though the report row is
    user-editable. */
function runReport(report) {
  const s = SOURCES[report.data_source];
  if (!s) throw new Error('unknown data_source');
  const dim = s.dimensions[report.group_by];
  const metric = s.metrics[report.metric];
  if (!dim || !metric) throw new Error('unknown group_by or metric for this data_source');

  const whereParts = [];
  const params = [];
  const dateField = report.date_field && s.dateFields[report.date_field] ? s.dateFields[report.date_field] : null;
  if (dateField && report.date_range && report.date_range !== 'all') {
    if (report.date_range === '7d') whereParts.push(`${dateField.sql} >= date('now','-7 days')`);
    else if (report.date_range === '30d') whereParts.push(`${dateField.sql} >= date('now','-30 days')`);
    else if (report.date_range === '90d') whereParts.push(`${dateField.sql} >= date('now','-90 days')`);
    else if (report.date_range === 'ytd') whereParts.push(`${dateField.sql} >= date('now','start of year')`);
    else if (report.date_range === 'custom') {
      if (report.date_start) { whereParts.push(`${dateField.sql} >= ?`); params.push(report.date_start); }
      if (report.date_end) { whereParts.push(`${dateField.sql} <= ?`); params.push(report.date_end); }
    }
  }
  // `s.from` already has its own base WHERE for sources split off one table by stage (leads vs
  // opportunities) — extra date-range conditions are appended with AND, never replacing it.
  const hasWhereAlready = /\bWHERE\b/i.test(s.from);
  const whereSql = whereParts.length ? `${hasWhereAlready ? ' AND ' : ' WHERE '}${whereParts.join(' AND ')}` : '';

  const sql = `
    SELECT COALESCE(${dim.sql}, '(none)') AS label, ${metric.sql} AS value
    ${s.from}${whereSql}
    GROUP BY ${dim.sql}
    ORDER BY value DESC
    LIMIT 50
  `;
  const rows = db.prepare(sql).all(...params);
  return {
    rows: rows.map((r) => ({ label: r.label, value: typeof r.value === 'number' ? +r.value.toFixed(2) : r.value })),
    money: !!metric.money,
    sourceLabel: s.label,
    groupByLabel: dim.label,
    metricLabel: metric.label,
  };
}

module.exports = {
  SOURCES, DATE_RANGES, CHART_TYPES,
  sourceMeta, allSourcesMeta, defaultsFor,
  isValidSource, isValidDimension, isValidMetric, isValidDateField, isValidDateRange, isValidChartType,
  runReport,
};
