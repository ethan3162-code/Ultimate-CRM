// Fixed, non-editable "built-in" reports (Sept 2026) — pulled out of the Dashboard's old giant
// reports-grid so each one is its own normal, clickable, linkable report page (see
// client/src/pages/BuiltinReportDetail.jsx), the same way a custom report works, just not
// editable/deletable since the shape of each one is fixed. See reportRegistry.js for the list and
// routes/reports.js for the underlying number-crunching this reuses (same payload, same math).
const { canSeePrices } = require('../auth');
const { buildReportsPayload, redactReportsMoney } = require('./reports');
const { listBuiltinReports, getBuiltinReport } = require('../reportRegistry');

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(listBuiltinReports());
});

router.get('/:key', (req, res) => {
  const raw = buildReportsPayload(req);
  const payload = canSeePrices(req.user) ? raw : redactReportsMoney(raw);
  const result = getBuiltinReport(req.params.key, payload);
  if (!result) return res.status(404).json({ error: 'Unknown report' });
  res.json(result);
});

module.exports = router;
