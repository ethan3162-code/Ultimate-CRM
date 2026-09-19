// Custom report builder (Sept 2026) — separate from the fixed rollup at routes/reports.js that
// feeds the Dashboard's "Reports" grid (that one's ~20 cards are a great fixed set but can't be
// reconfigured). A row here is a small, whitelisted query definition (see reportSources.js) that
// gets edited in place as the person adjusts it in ReportDetail.jsx — every PATCH is a save,
// there's no separate publish step, so "edit as you go" is just "every field is independently
// PATCHable." Money metrics are redacted for a login without price visibility, same as anywhere
// else dollar figures show up.
const express = require('express');
const db = require('../db');
const { canSeePrices } = require('../auth');
const sources = require('../reportSources');

const router = express.Router();

// `columns`/`filters` are stored as JSON text (SQLite has no array type) — parse them back for
// every response so the client always gets real arrays, never a string to JSON.parse itself.
function safeParseArray(s) {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
function serialize(row) {
  return { ...row, columns: safeParseArray(row.columns), filters: safeParseArray(row.filters) };
}

router.get('/meta', (req, res) => {
  res.json({
    sources: sources.allSourcesMeta(),
    dateRanges: sources.DATE_RANGES,
    chartTypes: sources.CHART_TYPES,
    reportTypes: sources.REPORT_TYPES,
    operators: sources.OPERATORS,
  });
});

router.get('/', (req, res) => {
  const limit = req.query.limit ? Math.max(1, Math.min(50, Number(req.query.limit))) : 200;
  const rows = db.prepare(`SELECT * FROM custom_reports ORDER BY updated_at DESC LIMIT ?`).all(limit);
  res.json(rows.map(serialize));
});

router.post('/', (req, res) => {
  const dataSource = sources.isValidSource(req.body?.data_source) ? req.body.data_source : 'leads';
  const d = sources.defaultsFor(dataSource);
  const name = (req.body?.name || 'New report').trim() || 'New report';
  const result = db.prepare(`
    INSERT INTO custom_reports (name, data_source, group_by, metric, date_field, date_range, chart_type, created_by_user_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(name, dataSource, d.group_by, d.metric, d.date_field, 'all', 'bar', req.user.id);
  const row = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ ...serialize(row), available: sources.allSourcesMeta() });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const next = { ...existing };
  if (req.body.name !== undefined) next.name = String(req.body.name).trim() || 'New report';
  if (req.body.description !== undefined) next.description = req.body.description || null;

  // Changing the data source can leave group_by/metric/date_field pointing at keys that don't
  // exist on the new source — reset to that source's own defaults in the same edit rather than
  // leaving the report in a broken state the client would have to detect and fix itself.
  if (req.body.data_source !== undefined && req.body.data_source !== existing.data_source) {
    if (!sources.isValidSource(req.body.data_source)) return res.status(400).json({ error: 'unknown data_source' });
    next.data_source = req.body.data_source;
    const d = sources.defaultsFor(next.data_source);
    next.group_by = d.group_by;
    next.metric = d.metric;
    next.date_field = d.date_field;
  }
  if (req.body.group_by !== undefined) {
    if (!sources.isValidDimension(next.data_source, req.body.group_by)) return res.status(400).json({ error: 'unknown group_by for this data source' });
    next.group_by = req.body.group_by;
  }
  if (req.body.metric !== undefined) {
    if (!sources.isValidMetric(next.data_source, req.body.metric)) return res.status(400).json({ error: 'unknown metric for this data source' });
    next.metric = req.body.metric;
  }
  if (req.body.date_field !== undefined) {
    if (!sources.isValidDateField(next.data_source, req.body.date_field)) return res.status(400).json({ error: 'unknown date_field for this data source' });
    next.date_field = req.body.date_field || null;
  }
  if (req.body.date_range !== undefined) {
    if (!sources.isValidDateRange(req.body.date_range)) return res.status(400).json({ error: 'unknown date_range' });
    next.date_range = req.body.date_range;
  }
  if (req.body.date_start !== undefined) next.date_start = req.body.date_start || null;
  if (req.body.date_end !== undefined) next.date_end = req.body.date_end || null;
  if (req.body.chart_type !== undefined) {
    if (!sources.isValidChartType(req.body.chart_type)) return res.status(400).json({ error: 'unknown chart_type' });
    next.chart_type = req.body.chart_type;
  }

  // --- Detail report fields (Sept 2026) — report_type picks whether this report renders as the
  // original single-level aggregate chart ("summary") or a Salesforce-style row list with columns,
  // a second grouping level, and ad-hoc filters ("detail"). Only sources with a FIELDS registry
  // (leads/opportunities/projects — see reportSources.js) support "detail".
  if (req.body.report_type !== undefined) {
    if (!sources.isValidReportType(req.body.report_type)) return res.status(400).json({ error: 'unknown report_type' });
    if (req.body.report_type === 'detail' && !sources.supportsDetail(next.data_source)) {
      return res.status(400).json({ error: 'this data source does not support detailed reports yet' });
    }
    next.report_type = req.body.report_type;
  }
  if (req.body.columns !== undefined) {
    if (!Array.isArray(req.body.columns) || req.body.columns.some((c) => !sources.isValidField(next.data_source, c))) {
      return res.status(400).json({ error: 'unknown column for this data source' });
    }
    next.columns = JSON.stringify(req.body.columns);
  }
  if (req.body.group_by_2 !== undefined) {
    if (req.body.group_by_2 && !sources.isValidDimension(next.data_source, req.body.group_by_2)) {
      return res.status(400).json({ error: 'unknown group_by_2 for this data source' });
    }
    next.group_by_2 = req.body.group_by_2 || null;
  }
  if (req.body.filters !== undefined) {
    if (!Array.isArray(req.body.filters) || req.body.filters.some((f) => f && f.field && !sources.isValidField(next.data_source, f.field))) {
      return res.status(400).json({ error: 'unknown filter field for this data source' });
    }
    next.filters = JSON.stringify(req.body.filters);
  }
  if (req.body.sort_field !== undefined) {
    if (req.body.sort_field && !sources.isValidField(next.data_source, req.body.sort_field)) {
      return res.status(400).json({ error: 'unknown sort_field for this data source' });
    }
    next.sort_field = req.body.sort_field || null;
  }
  if (req.body.sort_dir !== undefined) {
    next.sort_dir = req.body.sort_dir === 'asc' ? 'asc' : 'desc';
  }

  // Changing data_source can leave columns/group_by_2/filters/sort_field pointing at keys that
  // don't exist on the new source — same reset-to-safe-defaults approach as group_by/metric above.
  if (req.body.data_source !== undefined && req.body.data_source !== existing.data_source) {
    next.report_type = sources.supportsDetail(next.data_source) ? (next.report_type || 'summary') : 'summary';
    next.columns = '[]';
    next.group_by_2 = null;
    next.filters = '[]';
    next.sort_field = null;
  }

  db.prepare(`
    UPDATE custom_reports SET
      name=?, description=?, data_source=?, group_by=?, metric=?, date_field=?, date_range=?, date_start=?, date_end=?, chart_type=?,
      report_type=?, columns=?, group_by_2=?, filters=?, sort_field=?, sort_dir=?,
      updated_at = datetime('now')
    WHERE id=?
  `).run(
    next.name, next.description, next.data_source, next.group_by, next.metric, next.date_field, next.date_range, next.date_start, next.date_end, next.chart_type,
    next.report_type, next.columns, next.group_by_2, next.filters, next.sort_field, next.sort_dir,
    req.params.id
  );

  const row = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  res.json({ ...serialize(row), available: sources.allSourcesMeta() });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM custom_reports WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// Zeroes out every money column in a detail report's rows/subtotals for a login without price
// visibility — same `null` sentinel the rest of the app uses (see client/src/utils.js's money()),
// applied recursively through the (possibly two-level) groups tree.
function redactDetailMoney(result) {
  const moneyKeys = new Set(result.moneyColumns);
  if (moneyKeys.size === 0) return { ...result, price_hidden: false };
  const redactRow = (r) => {
    const out = { ...r };
    for (const k of moneyKeys) out[k] = null;
    return out;
  };
  const redactTotals = (t) => {
    const out = {};
    for (const k of Object.keys(t)) out[k] = null;
    return out;
  };
  const redactGroups = (groups) => groups && groups.map((g) => ({
    ...g,
    subtotals: redactTotals(g.subtotals),
    rows: g.rows ? g.rows.map(redactRow) : null,
    subgroups: g.subgroups ? redactGroups(g.subgroups) : null,
  }));
  return {
    ...result,
    rows: result.rows.map(redactRow),
    groups: redactGroups(result.groups),
    grandTotal: { ...result.grandTotal, subtotals: redactTotals(result.grandTotal.subtotals) },
    price_hidden: true,
  };
}

router.get('/:id/data', (req, res) => {
  const row = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const report = serialize(row);
  let result;
  try {
    result = report.report_type === 'detail' ? sources.runDetailReport(report) : sources.runReport(report);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (report.report_type === 'detail') {
    return res.json(!canSeePrices(req.user) ? redactDetailMoney(result) : { ...result, price_hidden: false });
  }
  if (result.money && !canSeePrices(req.user)) {
    return res.json({ ...result, rows: result.rows.map((r) => ({ ...r, value: null })), price_hidden: true });
  }
  res.json(result);
});

module.exports = router;
