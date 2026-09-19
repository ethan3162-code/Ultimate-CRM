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
    // LEFT JOINs added Sept 2026 for the detail-report FIELDS below (Account Name / Contact
    // columns) — both are 1:1 (a deal has at most one contact_id and one company_id), so this
    // never fans out rows and the existing dimensions/metrics aggregate queries above are
    // unaffected.
    from: `FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN companies co ON co.id = d.company_id WHERE d.stage = 'new'`,
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
    // Row-level fields for the Salesforce-style "detail" report type (see runDetailReport below) —
    // selectable columns, not aggregated. Distinct from `dimensions`/`metrics` above, which stay
    // exactly as they were for the original single-level aggregate "summary" report type.
    fields: {
      title: { label: 'Lead Name', sql: 'd.title', type: 'text' },
      account_name: { label: 'Account Name', sql: `COALESCE(co.name, TRIM(c.first_name || ' ' || c.last_name))`, type: 'text' },
      contact_name: { label: 'Contact Name', sql: `TRIM(c.first_name || ' ' || c.last_name)`, type: 'text' },
      source: { label: 'Lead Source', sql: 'd.source', type: 'text' },
      rep: { label: 'Assigned Rep', sql: 'd.rep', type: 'text' },
      lead_owner: { label: 'Lead Owner', sql: 'd.lead_owner', type: 'text' },
      work_type: { label: 'Service Type', sql: 'd.work_type', type: 'text' },
      lead_status: { label: 'Lead Status', sql: 'd.lead_status', type: 'text' },
      lead_type: { label: 'Lead Type', sql: 'd.lead_type', type: 'text' },
      repeat_referral: { label: 'Repeat / Referral', sql: 'd.repeat_referral', type: 'bool' },
      value: { label: 'Amount', sql: 'd.value', type: 'money' },
      probability: { label: 'Probability (%)', sql: 'd.probability', type: 'number' },
      created_at: { label: 'Created Date', sql: 'd.created_at', type: 'date' },
      followup_date: { label: 'Follow-up Date', sql: 'd.followup_date', type: 'date' },
      contact_phone: { label: 'Contact: Phone', sql: 'c.phone', type: 'text' },
      contact_email: { label: 'Contact: Email', sql: 'c.email', type: 'text' },
    },
  },
  opportunities: {
    label: 'Opportunities',
    from: `FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN companies co ON co.id = d.company_id WHERE d.stage != 'new'`,
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
    fields: {
      title: { label: 'Opportunity Name', sql: 'd.title', type: 'text' },
      account_name: { label: 'Account Name', sql: `COALESCE(co.name, TRIM(c.first_name || ' ' || c.last_name))`, type: 'text' },
      contact_name: { label: 'Contact Name', sql: `TRIM(c.first_name || ' ' || c.last_name)`, type: 'text' },
      stage: { label: 'Stage', sql: 'd.stage', type: 'text' },
      source: { label: 'Lead Source', sql: 'd.source', type: 'text' },
      rep: { label: 'Assigned Rep', sql: 'd.rep', type: 'text' },
      work_type: { label: 'Service Type', sql: 'd.work_type', type: 'text' },
      repeat_referral: { label: 'Repeat / Referral', sql: 'd.repeat_referral', type: 'bool' },
      value: { label: 'Amount', sql: 'd.value', type: 'money' },
      probability: { label: 'Probability (%)', sql: 'd.probability', type: 'number' },
      created_at: { label: 'Created Date', sql: 'd.created_at', type: 'date' },
      expected_close: { label: 'Close Date', sql: 'd.expected_close', type: 'date' },
      contact_phone: { label: 'Contact: Phone', sql: 'c.phone', type: 'text' },
      contact_email: { label: 'Contact: Email', sql: 'c.email', type: 'text' },
    },
  },
  projects: {
    label: 'Projects',
    from: `FROM jobs j LEFT JOIN contacts c ON c.id = j.contact_id LEFT JOIN companies co ON co.id = j.company_id`,
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
    fields: {
      title: { label: 'Project Name', sql: 'j.title', type: 'text' },
      account_name: { label: 'Account Name', sql: `COALESCE(co.name, TRIM(c.first_name || ' ' || c.last_name))`, type: 'text' },
      contact_name: { label: 'Contact Name', sql: `TRIM(c.first_name || ' ' || c.last_name)`, type: 'text' },
      status: { label: 'Status', sql: 'j.status', type: 'text' },
      stage: { label: 'Stage', sql: 'j.stage', type: 'text' },
      address: { label: 'Address', sql: 'j.address', type: 'text' },
      contract_amount: { label: 'Contract Amount', sql: 'j.contract_amount', type: 'money' },
      change_order_amount: { label: 'Change Orders', sql: 'j.change_order_amount', type: 'money' },
      progress_percent: { label: 'Progress (%)', sql: 'j.progress_percent', type: 'number' },
      scheduled_date: { label: 'Scheduled Date', sql: 'j.scheduled_date', type: 'date' },
      start_date: { label: 'Start Date', sql: 'j.start_date', type: 'date' },
      end_date: { label: 'End Date', sql: 'j.end_date', type: 'date' },
      created_at: { label: 'Created Date', sql: 'j.created_at', type: 'date' },
      contact_phone: { label: 'Contact: Phone', sql: 'c.phone', type: 'text' },
      contact_email: { label: 'Contact: Email', sql: 'c.email', type: 'text' },
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

// The Salesforce-style "detail" report type (rich per-record columns + nested grouping/subtotals +
// ad-hoc filters — see runDetailReport below) is only wired up for leads/opportunities/projects so
// far (the sources with a `fields` registry); everything else stays "summary"-only for now.
const REPORT_TYPES = { summary: 'Summary (chart)', detail: 'Detailed list' };

// Filter operators, keyed by a field's `type`. The client reads this to populate the operator
// dropdown for whichever field a filter row currently has selected.
const OPERATORS = {
  text: [
    { key: 'equals', label: 'Equals' },
    { key: 'not_equals', label: 'Does not equal' },
    { key: 'contains', label: 'Contains' },
    { key: 'is_blank', label: 'Is blank' },
    { key: 'is_not_blank', label: 'Is not blank' },
  ],
  number: [
    { key: 'equals', label: 'Equals' },
    { key: 'not_equals', label: 'Does not equal' },
    { key: 'gt', label: 'Greater than' },
    { key: 'gte', label: 'Greater than or equal' },
    { key: 'lt', label: 'Less than' },
    { key: 'lte', label: 'Less than or equal' },
  ],
  money: [
    { key: 'equals', label: 'Equals' },
    { key: 'not_equals', label: 'Does not equal' },
    { key: 'gt', label: 'Greater than' },
    { key: 'gte', label: 'Greater than or equal' },
    { key: 'lt', label: 'Less than' },
    { key: 'lte', label: 'Less than or equal' },
  ],
  date: [
    { key: 'equals', label: 'Equals' },
    { key: 'before', label: 'Before' },
    { key: 'after', label: 'After' },
    { key: 'last_7_days', label: 'Last 7 days' },
    { key: 'last_30_days', label: 'Last 30 days' },
    { key: 'last_90_days', label: 'Last 90 days' },
    { key: 'ytd', label: 'Year to date' },
    { key: 'between', label: 'Between' },
  ],
  bool: [
    { key: 'equals', label: 'Equals' },
  ],
};

// Same escaping trick as routes/search.js's likePattern (kept as its own tiny copy here since
// that one lives in a route file, not a shared module) — escapes literal '%'/'_' in a user-typed
// filter value before it's wrapped for a LIKE 'contains' match.
function likePattern(q) {
  return `%${String(q).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

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
    fields: s.fields ? Object.entries(s.fields).map(([k, v]) => ({ key: k, label: v.label, type: v.type })) : [],
    supportsDetail: !!s.fields,
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
function isValidReportType(key) { return Object.prototype.hasOwnProperty.call(REPORT_TYPES, key); }
function supportsDetail(sourceKey) { return !!SOURCES[sourceKey]?.fields; }
function isValidField(sourceKey, key) { return !!SOURCES[sourceKey]?.fields?.[key]; }
function fieldType(sourceKey, key) { return SOURCES[sourceKey]?.fields?.[key]?.type || null; }
function isValidOperator(type, op) { return !!OPERATORS[type] && OPERATORS[type].some((o) => o.key === op); }
/** A filter row `{field, operator, value, value2?}` is only usable once its field exists on this
    source and its operator is one that field's type actually supports — anything else is dropped
    silently by buildFilterSql below rather than erroring, since filters are freely added/removed
    client-side and a half-filled row (no value typed yet) is a normal, harmless in-between state. */
function isValidFilter(sourceKey, f) {
  if (!f || typeof f !== 'object' || !f.field || !f.operator) return false;
  const type = fieldType(sourceKey, f.field);
  return !!type && isValidOperator(type, f.operator);
}

/** Turns a report's ad-hoc `filters` array into a parameterized SQL WHERE fragment + params,
    scoped to one source's `fields` whitelist — every fragment is built from that source's own
    trusted `sql` strings, and every value the client supplied goes in as a bound parameter, never
    interpolated into the SQL text. Invalid/incomplete filter rows are skipped rather than thrown,
    since the client's filter builder lets a row sit half-configured while the person is still
    picking a value. */
function buildFilterSql(sourceKey, filters) {
  const s = SOURCES[sourceKey];
  const whereParts = [];
  const params = [];
  for (const f of filters || []) {
    if (!isValidFilter(sourceKey, f)) continue;
    const field = s.fields[f.field];
    const { type, sql } = field;
    const op = f.operator;

    if (op === 'is_blank') { whereParts.push(`(${sql} IS NULL OR ${sql} = '')`); continue; }
    if (op === 'is_not_blank') { whereParts.push(`(${sql} IS NOT NULL AND ${sql} != '')`); continue; }

    if (type === 'date') {
      if (op === 'equals') { whereParts.push(`date(${sql}) = date(?)`); params.push(f.value); }
      else if (op === 'before') { whereParts.push(`date(${sql}) < date(?)`); params.push(f.value); }
      else if (op === 'after') { whereParts.push(`date(${sql}) > date(?)`); params.push(f.value); }
      else if (op === 'last_7_days') whereParts.push(`date(${sql}) >= date('now','-7 days')`);
      else if (op === 'last_30_days') whereParts.push(`date(${sql}) >= date('now','-30 days')`);
      else if (op === 'last_90_days') whereParts.push(`date(${sql}) >= date('now','-90 days')`);
      else if (op === 'ytd') whereParts.push(`date(${sql}) >= date('now','start of year')`);
      else if (op === 'between' && f.value && f.value2) { whereParts.push(`date(${sql}) BETWEEN date(?) AND date(?)`); params.push(f.value, f.value2); }
      continue;
    }
    if (type === 'bool') {
      whereParts.push(`${sql} = ?`);
      params.push(f.value ? 1 : 0);
      continue;
    }
    if (type === 'number' || type === 'money') {
      const num = Number(f.value);
      if (Number.isNaN(num)) continue;
      const cmp = { equals: '=', not_equals: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
      if (!cmp) continue;
      whereParts.push(op === 'not_equals' ? `(${sql} IS NULL OR ${sql} != ?)` : `${sql} ${cmp} ?`);
      params.push(num);
      continue;
    }
    // text
    if (op === 'equals') { whereParts.push(`${sql} = ?`); params.push(String(f.value ?? '')); }
    else if (op === 'not_equals') { whereParts.push(`(${sql} IS NULL OR ${sql} != ?)`); params.push(String(f.value ?? '')); }
    else if (op === 'contains') { whereParts.push(`${sql} LIKE ? ESCAPE '\\'`); params.push(likePattern(f.value ?? '')); }
  }
  return { whereParts, params };
}

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

/** The Salesforce-style "detail" report: a row-level fetch (not aggregated in SQL) over whichever
    `columns` the report has picked, filtered by its ad-hoc `filters`, then grouped/subtotaled in
    JS by up to two levels (`group_by`/`group_by_2`, reusing the existing `dimensions` registry —
    the same grouping keys the "summary" report type already uses). Grouping in JS rather than
    SQL keeps this simple and correct at this app's small-business data scale (a LIMIT 2000 row
    fetch), instead of hand-rolling nested GROUP BY/window-function SQL for two levels of subtotal. */
function runDetailReport(report) {
  const s = SOURCES[report.data_source];
  if (!s) throw new Error('unknown data_source');
  if (!s.fields) throw new Error('this data source does not support detail reports');

  let columns = Array.isArray(report.columns) ? report.columns.filter((c) => isValidField(report.data_source, c)) : [];
  if (columns.length === 0) columns = Object.keys(s.fields).slice(0, 6); // an unconfigured report still shows something

  const groupBy1 = report.group_by && isValidDimension(report.data_source, report.group_by) ? report.group_by : null;
  const groupBy2 = report.group_by_2 && isValidDimension(report.data_source, report.group_by_2) ? report.group_by_2 : null;

  const filters = Array.isArray(report.filters) ? report.filters : [];
  const { whereParts, params } = buildFilterSql(report.data_source, filters);
  const hasWhereAlready = /\bWHERE\b/i.test(s.from);
  const whereSql = whereParts.length ? `${hasWhereAlready ? ' AND ' : ' WHERE '}${whereParts.join(' AND ')}` : '';

  const selectParts = columns.map((c) => `${s.fields[c].sql} AS "${c}"`);
  if (groupBy1) selectParts.push(`${s.dimensions[groupBy1].sql} AS "__group1"`);
  if (groupBy2) selectParts.push(`${s.dimensions[groupBy2].sql} AS "__group2"`);

  const sortField = report.sort_field && isValidField(report.data_source, report.sort_field) ? s.fields[report.sort_field].sql : null;
  const sortDir = report.sort_dir === 'asc' ? 'ASC' : 'DESC';
  const orderSql = sortField
    ? `ORDER BY ${sortField} ${sortDir}`
    : groupBy1 ? `ORDER BY ${s.dimensions[groupBy1].sql}${groupBy2 ? `, ${s.dimensions[groupBy2].sql}` : ''}` : '';

  const sql = `
    SELECT ${selectParts.join(', ')}
    ${s.from}${whereSql}
    ${orderSql}
    LIMIT 2000
  `;
  const rawRows = db.prepare(sql).all(...params);
  const moneyColumns = columns.filter((c) => s.fields[c].type === 'money');
  const rows = rawRows.map((r) => {
    const row = {};
    for (const c of columns) row[c] = r[c];
    return row;
  });

  function groupLabel(v) { return v == null || v === '' ? '(none)' : v; }
  function subtotals(rowList) {
    const t = {};
    for (const c of moneyColumns) t[c] = +rowList.reduce((sum, r) => sum + (Number(r[c]) || 0), 0).toFixed(2);
    return t;
  }

  let groups = null;
  if (groupBy1) {
    const byG1 = new Map();
    rawRows.forEach((r, i) => {
      const g1 = groupLabel(r.__group1);
      if (!byG1.has(g1)) byG1.set(g1, { key: g1, rows: [], subgroupMap: groupBy2 ? new Map() : null });
      const bucket = byG1.get(g1);
      bucket.rows.push(rows[i]);
      if (groupBy2) {
        const g2 = groupLabel(r.__group2);
        if (!bucket.subgroupMap.has(g2)) bucket.subgroupMap.set(g2, []);
        bucket.subgroupMap.get(g2).push(rows[i]);
      }
    });
    groups = Array.from(byG1.values()).map((g) => ({
      key: g.key,
      count: g.rows.length,
      subtotals: subtotals(g.rows),
      rows: groupBy2 ? null : g.rows,
      subgroups: groupBy2
        ? Array.from(g.subgroupMap.entries()).map(([key, rowList]) => ({ key, count: rowList.length, subtotals: subtotals(rowList), rows: rowList }))
        : null,
    }));
  }

  return {
    columns: columns.map((c) => ({ key: c, label: s.fields[c].label, type: s.fields[c].type })),
    rows,
    groups,
    groupByLabel: groupBy1 ? s.dimensions[groupBy1].label : null,
    groupBy2Label: groupBy2 ? s.dimensions[groupBy2].label : null,
    grandTotal: { count: rows.length, subtotals: subtotals(rows) },
    sourceLabel: s.label,
    moneyColumns,
  };
}

module.exports = {
  SOURCES, DATE_RANGES, CHART_TYPES, REPORT_TYPES, OPERATORS,
  sourceMeta, allSourcesMeta, defaultsFor,
  isValidSource, isValidDimension, isValidMetric, isValidDateField, isValidDateRange, isValidChartType,
  isValidReportType, supportsDetail, isValidField, fieldType, isValidOperator, isValidFilter,
  runReport, runDetailReport,
};
