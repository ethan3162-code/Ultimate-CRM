// A lightweight, non-admin-restricted directory of active logins — used to populate "Owner"
// assignment dropdowns on Contacts/Leads/Opportunities. GET /api/users (routes/users.js) is
// admin-only and returns full account details + permissions, which isn't appropriate to expose
// to every signed-in role just so a salesperson can assign an owner. This returns only the
// minimum needed: id, username, and a display-friendly role label.
const express = require('express');
const db = require('../db');
const { ROLE_LABEL } = require('../permissionsConfig');
const { canSeePrices } = require('../auth');
const { getPendingEstimateApprovals, getMyPendingEstimateRequests } = require('../helpers');

const router = express.Router();

router.get('/users', (req, res) => {
  const rows = db.prepare(`SELECT id, username, role FROM users WHERE active = 1 ORDER BY username`).all();
  // Who's personally connected their own Google Calendar (per-user sync, Sept 2026) — lets the
  // "Assign to" dropdown on the appointment form show which assignees will get it added directly
  // to their own calendar vs. only ever an emailed invite.
  const connectedIds = new Set(
    db.prepare(`SELECT user_id FROM oauth_tokens WHERE provider = 'google' AND user_id != 0`).all().map((r) => r.user_id)
  );
  res.json(rows.map((u) => ({ id: u.id, username: u.username, roleLabel: ROLE_LABEL[u.role] || u.role, googleConnected: connectedIds.has(u.id) })));
});

// Open estimate-approval requests this login can act on (empty for anyone not flagged as an
// approver) — kept out of the admin-only Dashboard payload on purpose, since "can approve
// estimates" is its own narrower flag a non-admin (e.g. a PM) can hold independently of admin
// access. Any signed-in login can hit this; the response is just empty for everyone else.
router.get('/pending-approvals', (req, res) => {
  res.json(getPendingEstimateApprovals(req.user, !canSeePrices(req.user)));
});

// This login's OWN estimates currently sitting with someone else waiting on sign-off — the flip
// side of pending-approvals above (see getMyPendingEstimateRequests). Every signed-in login can
// hit this; it's just empty for anyone who hasn't submitted anything pending.
router.get('/my-pending-estimates', (req, res) => {
  res.json(getMyPendingEstimateRequests(req.user, !canSeePrices(req.user)));
});

module.exports = router;
