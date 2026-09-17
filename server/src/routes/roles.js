// Admin-only: manage reusable, stackable "Roles" (permission templates) — see auth.js's
// listCustomRoles/createCustomRole/updateCustomRole/deleteCustomRole. Distinct from a login's own
// account TYPE (admin/user, managed in users.js) and from its individual page/section overrides —
// a role is just a named bundle of page + section permissions an admin can build once and hand to
// any number of logins, which can each hold more than one at a time.
const express = require('express');
const {
  PAGES, SECTIONS, listCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole,
} = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ roles: listCustomRoles(), pages: PAGES, sections: SECTIONS });
});

router.post('/', (req, res) => {
  try {
    const id = createCustomRole(req.body.name);
    if (req.body.permissions || req.body.sections) {
      updateCustomRole(id, { permissions: req.body.permissions, sections: req.body.sections });
    }
    res.status(201).json(listCustomRoles().find((r) => r.id === id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    updateCustomRole(req.params.id, req.body);
    const role = listCustomRoles().find((r) => r.id === Number(req.params.id));
    if (!role) return res.status(404).json({ error: 'not found' });
    res.json(role);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  deleteCustomRole(req.params.id);
  res.status(204).end();
});

module.exports = router;
