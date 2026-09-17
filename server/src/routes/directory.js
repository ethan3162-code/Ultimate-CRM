// A lightweight, non-admin-restricted directory of active logins — used to populate "Owner"
// assignment dropdowns on Contacts/Leads/Opportunities. GET /api/users (routes/users.js) is
// admin-only and returns full account details + permissions, which isn't appropriate to expose
// to every signed-in role just so a salesperson can assign an owner. This returns only the
// minimum needed: id, username, and a display-friendly role label.
const express = require('express');
const db = require('../db');
const { ROLE_LABEL } = require('../permissionsConfig');
const { canSeePrices } = require('../auth');
const { getPendingEstimateApprovals } = require('../helpers');

const router = express.Router();

router.get('/users', (req, res) => {
  const rows = db.prepare(`SELECT id, username, role FROM users WHERE active = 1 ORDER BY username`).all();
  res.json(rows.map((u) => ({ id: u.id, username: u.username, roleLabel: ROLE_LABEL[u.role] || u.role })));
});

// Open estimate-approval requests this login can act on (empty for anyone not flagged as an
// approver) — kept out of the admin-only Dashboard payload on purpose, since "can approve
// estimates" is its own narrower flag a non-admin (e.g. a PM) can hold independently of admin
// access. Any signed-in login can hit this; the response is just empty for everyone else.
router.get('/pending-approvals', (req, res) => {
  res.json(getPendingEstimateApprovals(req.user, !canSeePrices(req.user)));
});

module.exports = router;
