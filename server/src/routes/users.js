// Admin-only: manage logins and each individual login's page-by-page permissions.
const express = require('express');
const db = require('../db');
const {
  ROLES, ROLE_LABEL, PAGES, SECTIONS, hashPassword, publicUser, getPermissions, getSectionLevels, canSeePrices,
  canSeeCommissions, setUserPermissions, seedPagePermissions, listCustomRoles, setUserCustomRoles, getUserCustomRoleIds,
  getUserDirectPermissions, getUserDirectSections,
} = require('../auth');

const router = express.Router();

function safeUser(u) {
  return {
    id: u.id, username: u.username, role: u.role, roleLabel: ROLE_LABEL[u.role] || u.role,
    active: !!u.active, created_at: u.created_at, permissions: getPermissions(u),
    sections: getSectionLevels(u), can_see_prices: canSeePrices(u),
    email: u.email || '',
    // Admins never need approval and can always approve — the flags below only matter for a
    // regular login, same convention as can_see_prices/permissions above.
    requires_estimate_approval: u.role === 'admin' ? false : !!u.requires_estimate_approval,
    can_approve_estimates: u.role === 'admin' ? true : !!u.can_approve_estimates,
    // Commission rate this login earns on projects they own, and whether they can see anyone
    // else's commission figures (admins always can, and always see everyone's — see auth.js).
    commission_percent: Number(u.commission_percent) || 0,
    can_see_commissions: canSeeCommissions(u),
    custom_role_ids: u.role === 'admin' ? [] : getUserCustomRoleIds(u.id),
    // The person's own baseline, with no role's contribution mixed in — what the Users &
    // permissions admin editor seeds its draft from (see startEditPerms in Users.jsx). `permissions`/
    // `sections` above stay the role-combined *effective* values, used everywhere else (session,
    // gating) that needs to know what this person can actually do right now.
    direct_permissions: u.role === 'admin' ? {} : getUserDirectPermissions(u.id),
    direct_sections: u.role === 'admin' ? {} : getUserDirectSections(u.id),
  };
}

router.get('/', (req, res) => {
  const users = db.prepare(`SELECT * FROM users ORDER BY (role = 'admin') DESC, username`).all().map(safeUser);
  res.json({
    users, roles: ROLES.filter((r) => r !== 'admin').map((role) => ({ role, label: ROLE_LABEL[role] })), pages: PAGES,
    sections: SECTIONS, customRoles: listCustomRoles(),
  });
});

router.post('/', (req, res) => {
  const { username, password, role, email } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'username, password, and role are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  const clean = String(username).trim().toLowerCase();
  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(clean);
  if (existing) return res.status(400).json({ error: 'that username is already taken' });
  const result = db.prepare(`INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)`)
    .run(clean, hashPassword(password), role, (email || '').trim() || null);
  if (role !== 'admin') seedPagePermissions(result.lastInsertRowid, role);
  res.status(201).json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const {
    role, active, password, can_see_prices, email, requires_estimate_approval, can_approve_estimates,
    commission_percent, can_see_commissions,
  } = req.body;
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  if (commission_percent !== undefined && commission_percent !== null && commission_percent !== '') {
    const pct = Number(commission_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: 'commission percent must be a number between 0 and 100' });
  }
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
  const nextCanSeePrices = can_see_prices !== undefined ? (can_see_prices ? 1 : 0) : existing.can_see_prices;
  const nextEmail = email !== undefined ? ((email || '').trim() || null) : existing.email;
  const nextRequiresApproval = requires_estimate_approval !== undefined ? (requires_estimate_approval ? 1 : 0) : existing.requires_estimate_approval;
  const nextCanApprove = can_approve_estimates !== undefined ? (can_approve_estimates ? 1 : 0) : existing.can_approve_estimates;
  const nextCommissionPercent = (commission_percent !== undefined && commission_percent !== null && commission_percent !== '')
    ? Number(commission_percent) : existing.commission_percent;
  const nextCanSeeCommissions = can_see_commissions !== undefined ? (can_see_commissions ? 1 : 0) : existing.can_see_commissions;
  if (password && password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  db.prepare(`
    UPDATE users SET role = ?, active = ?, password_hash = ?, can_see_prices = ?, email = ?,
      requires_estimate_approval = ?, can_approve_estimates = ?, commission_percent = ?, can_see_commissions = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nextRole, nextActive, nextHash, nextCanSeePrices, nextEmail,
    nextRequiresApproval, nextCanApprove, nextCommissionPercent, nextCanSeeCommissions,
    req.params.id
  );
  // Changing role resets that person's page permissions to the new role's defaults — their old
  // custom permissions were set for the old role and may not make sense for the new one. The
  // admin can re-customize any page for them afterward, same as any other login.
  if (role !== undefined && role !== existing.role && role !== 'admin') {
    seedPagePermissions(existing.id, role);
  }
  res.json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id)));
});

// Which custom roles ((permission templates) this login holds — replaces the full set at once.
// Not available for admin logins, which always have full access regardless of any role.
router.patch('/:id/roles', (req, res) => {
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.role === 'admin') return res.status(400).json({ error: "the admin account always has full access — roles don't apply" });
  const { role_ids } = req.body;
  if (!Array.isArray(role_ids)) return res.status(400).json({ error: 'role_ids array is required' });
  setUserCustomRoles(existing.id, role_ids);
  res.json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(existing.id)));
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

// Individual, direct overrides for the finer-grained sections within a page (see
// permissionsConfig.js's SECTIONS) — { sections: { sectionKey: 'edit'|'view', ... } }. Kept
// separate from custom roles so an admin can restrict one specific person's access to a section
// without needing to build (or share) a whole role for it.
router.patch('/:id/sections', (req, res) => {
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.role === 'admin') return res.status(400).json({ error: "the admin account always has full access — there's nothing to set" });
  const { sections } = req.body;
  if (!sections || typeof sections !== 'object') return res.status(400).json({ error: 'sections object is required' });
  const upsert = db.prepare(`
    INSERT INTO user_section_permissions (user_id, section, level) VALUES (?, ?, ?)
    ON CONFLICT(user_id, section) DO UPDATE SET level = excluded.level
  `);
  for (const [section, level] of Object.entries(sections)) {
    if (!Object.prototype.hasOwnProperty.call(SECTIONS, section)) return res.status(400).json({ error: `unknown section: ${section}` });
    if (!['edit', 'view'].includes(level)) return res.status(400).json({ error: `section level must be 'edit' or 'view'` });
    upsert.run(existing.id, section, level);
  }
  res.json(safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(existing.id)));
});

module.exports = router;
