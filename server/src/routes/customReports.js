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

function serialize(row) {
  return row;
}

router.get('/meta', (req, res) => {
  res.json({ sources: sources.allSourcesMeta(), dateRanges: sources.DATE_RANGES, chartTypes: sources.CHART_TYPES });
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

  db.prepare(`
    UPDATE custom_reports SET
      name=?, description=?, data_source=?, group_by=?, metric=?, date_field=?, date_range=?, date_start=?, date_end=?, chart_type=?,
      updated_at = datetime('now')
    WHERE id=?
  `).run(next.name, next.description, next.data_source, next.group_by, next.metric, next.date_field, next.date_range, next.date_start, next.date_end, next.chart_type, req.params.id);

  const row = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  res.json({ ...serialize(row), available: sources.allSourcesMeta() });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM custom_reports WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

router.get('/:id/data', (req, res) => {
  const row = db.prepare(`SELECT * FROM custom_reports WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  let result;
  try {
    result = sources.runReport(row);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (result.money && !canSeePrices(req.user)) {
    return res.json({ ...result, rows: result.rows.map((r) => ({ ...r, value: null })), price_hidden: true });
  }
  res.json(result);
});

module.exports = router;
