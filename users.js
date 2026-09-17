// Admin-only: manage logins and each individual login's page-by-page permissions.
const express = require('express');
const db = require('../db');
const {
  ROLES, ROLE_LABEL, PAGES, hashPassword, publicUser, getPermissions, setUserPermissions, seedPagePermissions,
} = require('../auth');

const router = express.Router();

function safeUser(u) {
  return {
    id: u.id, username: u.username, role: u.role, roleLabel: ROLE_LABEL[u.role] || u.role,
    active: !!u.active, created_at: u.created_at, permissions: getPermissions(u),
  };
}

router.get('/', (req, res) => {
  const users = db.prepare(`SELECT * FROM users ORDER BY (role = 'admin') DESC, username`).all().map(safeUser);
  res.json({ users, roles: ROLES.filter((r) => r !== 'admin').map((role) => ({ role, label: ROLE_LABEL[role] })), pages: PAGES });
});

router.post('/', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'username, password, and role are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  const clean = String(username).trim().toLowerCase();
  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(clean);
  if (existing) return res.status(400).json({ error: 'that username is already taken' });
  const result = db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`)
    .run(clean, hashPassword(password), role);
  if (role !== 'admin') seedPagePermissions(result.lastInsertRowid, role);
  res.status(201).json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { role, active, password } = req.body;
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  if (existing.role === 'admin' && role && role !== 'admin') {
    const otherAdmins = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin' AND id != ?`).get(existing.id).c;
    if (otherAdmins === 0) return res.status(400).json({ error: 'at least one admin account must remain' });
  }
  if (existing.role === 'admin' && active === false) {
    const otherActiveAdmins = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1 AND id != ?`).get(existing.id).c;
    if (otherActiveAdmins === 0) return res.status(400).json({ error: 'at least one active admin account must remain' });
  }
  const nextRole = role !== undefined ? role : existing.role;
  const nextActive = active !== undefined ? (active ? 1 : 0) : existing.active;
  const nextHash = password ? hashPassword(password) : existing.password_hash;
  if (password && password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  db.prepare(`UPDATE users SET role = ?, active = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(nextRole, nextActive, nextHash, req.params.id);
  // Changing role resets that person's page permissions to the new role's defaults — their old
  // custom permissions were set for the old role and may not make sense for the new one. The
  // admin can re-customize any page for them afterward, same as any other login.
  if (role !== undefined && role !== existing.role && role !== 'admin') {
    seedPagePermissions(existing.id, role);
  }
  res.json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.role === 'admin') {
    const otherAdmins = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin' AND id != ?`).get(existing.id).c;
    if (otherAdmins === 0) return res.status(400).json({ error: 'at least one admin account must remain' });
  }
  db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`).run(req.params.id);
  res.status(204).end();
});

// Individual, page-by-page permissions for one login — { permissions: { pageKey: 'edit'|'view'|'none', ... } }.
// Not available for admin logins, which always have full access to everything.
router.patch('/:id/permissions', (req, res) => {
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.role === 'admin') return res.status(400).json({ error: "the admin account always has full access — there's nothing to set" });
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'permissions object is required' });
  try {
    setUserPermissions(existing.id, permissions);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(existing.id)));
});

module.exports = router;
