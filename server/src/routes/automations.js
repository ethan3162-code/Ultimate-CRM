const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM automations ORDER BY created_at DESC`).all();
  res.json(rows.map((r) => ({ ...r, trigger_config: JSON.parse(r.trigger_config || '{}'), action_config: JSON.parse(r.action_config || '{}') })));
});

router.post('/', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config, enabled } = req.body;
  if (!name || !trigger_type || !action_type) return res.status(400).json({ error: 'name, trigger_type, and action_type are required' });
  const result = db.prepare(`
    INSERT INTO automations (name, trigger_type, trigger_config, action_type, action_config, enabled)
    VALUES (?,?,?,?,?,?)
  `).run(name, trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {}), enabled === false ? 0 : 1);
  const row = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ ...row, trigger_config: JSON.parse(row.trigger_config), action_config: JSON.parse(row.action_config) });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = {
    name: req.body.name ?? existing.name,
    trigger_type: req.body.trigger_type ?? existing.trigger_type,
    trigger_config: req.body.trigger_config !== undefined ? JSON.stringify(req.body.trigger_config) : existing.trigger_config,
    action_type: req.body.action_type ?? existing.action_type,
    action_config: req.body.action_config !== undefined ? JSON.stringify(req.body.action_config) : existing.action_config,
    enabled: req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : existing.enabled,
  };
  db.prepare(`
    UPDATE automations SET name=?, trigger_type=?, trigger_config=?, action_type=?, action_config=?, enabled=? WHERE id=?
  `).run(merged.name, merged.trigger_type, merged.trigger_config, merged.action_type, merged.action_config, merged.enabled, req.params.id);
  const row = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(req.params.id);
  res.json({ ...row, trigger_config: JSON.parse(row.trigger_config), action_config: JSON.parse(row.action_config) });
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM automations WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// Lets the Automations page show a banner explaining why send_sms/send_email automations aren't
// actually reaching customers yet — see automationEngine.js's hasActiveCampaign(), the same check
// that gates the real sends. Mounted here (rather than under /api/campaigns) so anyone with view
// access to Automations can see the gate state even if they don't separately have Campaigns access.
router.get('/campaign-gate', (req, res) => {
  const active = !!db.prepare(`SELECT 1 FROM campaigns WHERE status = 'active' LIMIT 1`).get();
  res.json({ active });
});

router.get('/runs', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, a.name AS automation_name, a.trigger_type, a.action_type
    FROM automation_runs r JOIN automations a ON a.id = r.automation_id
    ORDER BY r.ran_at DESC LIMIT 50
  `).all();
  res.json(rows);
});

module.exports = router;
