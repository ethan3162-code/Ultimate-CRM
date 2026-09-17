const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const {
  ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS,
  SECTIONS,
} = require('./permissionsConfig');

const LEVEL_RANK = { none: 0, view: 1, edit: 2 };
function maxLevel(...levels) {
  return levels.reduce((best, l) => (LEVEL_RANK[l] > LEVEL_RANK[best] ? l : best), 'none');
}

const JWT_SECRET = process.env.JWT_SECRET || 'ultimate-crm-dev-secret-change-me';
const COOKIE_NAME = 'ucrm_session';
const TOKEN_TTL = '30d';

/** Seeds (or resets) one login's individual page permissions to a blank slate: nothing but the
    always-view pages (just Home now — Dashboard became admin-only, Sept 2026). Used when a login is first created, and when it's
    demoted from admin back to a regular login (its old permissions, if any, are reset rather
    than carried over — the admin re-grants whatever pages this person actually needs from the
    Users & permissions page). After this runs, every page is independently editable per person —
    nothing keeps it synced to any role going forward, and there's no "home turf" to infer one
    from any more (see permissionsConfig.js). */
function seedPagePermissions(userId, role) {
  const primary = new Set(DEFAULT_PRIMARY_PAGES[role] || []);
  const upsert = db.prepare(`
    INSERT INTO user_permissions (user_id, page, level) VALUES (?, ?, ?)
    ON CONFLICT(user_id, page) DO UPDATE SET level = excluded.level
  `);
  for (const key of Object.keys(PAGES)) {
    upsert.run(userId, key, primary.has(key) ? 'edit' : (ALWAYS_VIEW_PAGES.includes(key) ? 'view' : 'none'));
  }
}

/** { pageKey: 'edit' | 'view' | 'none' } for every business + admin-only page, for one signed-in
    user. Admin always has full edit access to everything. Everyone else's business-page access
    is the most-permissive of (a) their own individually-set user_permissions rows and (b) every
    custom role they hold (see custom_roles/custom_role_permissions, assigned via
    user_custom_roles) — a role can only ever grant access on top of the individual baseline,
    never take it away, so holding an extra role is always safe to add. Falls back to 'view' for
    Home and 'none' elsewhere only if a row is somehow missing (normal operation always
    has a row per page once seeded). Admin-only pages (Users, Automations, Integrations, Dashboard) are
    never individually configurable — they stay closed to every non-admin regardless of what that
    person's business-page permissions or roles say. */
function getPermissions(user) {
  const perms = {};
  if (user.role === 'admin') {
    for (const key of Object.keys(PAGES)) perms[key] = 'edit';
    for (const key of ADMIN_ONLY_PAGES) perms[key] = 'edit';
    return perms;
  }
  const rows = db.prepare(`SELECT page, level FROM user_permissions WHERE user_id = ?`).all(user.id);
  const byPage = {};
  for (const r of rows) byPage[r.page] = r.level;
  const roleRows = db.prepare(`
    SELECT crp.page, crp.level FROM user_custom_roles ucr
    JOIN custom_role_permissions crp ON crp.role_id = ucr.role_id
    WHERE ucr.user_id = ?
  `).all(user.id);
  const byPageFromRoles = {};
  for (const r of roleRows) byPageFromRoles[r.page] = maxLevel(byPageFromRoles[r.page] || 'none', r.level);
  for (const key of Object.keys(PAGES)) {
    const direct = byPage[key];
    const base = VALID_LEVELS.includes(direct) ? direct : (ALWAYS_VIEW_PAGES.includes(key) ? 'view' : 'none');
    perms[key] = maxLevel(base, byPageFromRoles[key] || 'none');
  }
  for (const key of ADMIN_ONLY_PAGES) perms[key] = 'none';
  return perms;
}

/** 'edit' | 'view' for one restrictable section (see permissionsConfig.js's SECTIONS), for one
    signed-in user, given that page's own already-computed effective level. A section can only
    ever restrict a page that's otherwise 'edit' down to 'view' for that one part of it — it never
    grants access a page-level 'view'/'none' didn't already have, and it never blocks a page-level
    'edit' unless something explicitly says 'view'. "Explicitly says" means a real row exists (in
    user_section_permissions for this user directly, or in custom_role_section_permissions for a
    role this user holds) — a section with no rows anywhere simply inherits the page's own level.
    Combining is most-permissive, same as page-level roles above: if anything (the direct setting
    or any held role) explicitly allows 'edit', that wins over another source saying 'view'. */
function getSectionLevel(user, sectionKey, pageLevel) {
  if (user.role === 'admin') return 'edit';
  if (pageLevel !== 'edit') return pageLevel;
  const explicit = [];
  const direct = db.prepare(`SELECT level FROM user_section_permissions WHERE user_id = ? AND section = ?`).get(user.id, sectionKey);
  if (direct) explicit.push(direct.level);
  const roleRows = db.prepare(`
    SELECT crsp.level FROM user_custom_roles ucr
    JOIN custom_role_section_permissions crsp ON crsp.role_id = ucr.role_id AND crsp.section = ?
    WHERE ucr.user_id = ?
  `).all(sectionKey, user.id);
  for (const r of roleRows) explicit.push(r.level);
  if (explicit.length === 0) return 'edit';
  return explicit.includes('edit') ? 'edit' : 'view';
}

/** { pageKey: 'edit' | 'view' | 'none' } of a non-admin login's OWN individually-set permission
    rows only — no role combining, no fallback substitution. This is what the Users & permissions
    admin screen edits: "exactly what this person can do, with nothing tied to a role" — seeding
    that editor from getPermissions()'s role-combined result would silently bake every role grant
    into the person's own direct row the next time an admin saved anything on that screen (a role
    could never be safely removed again). Missing rows (shouldn't normally happen once seeded)
    fall back to 'view' for the always-view pages and 'none' elsewhere, same as getPermissions. */
function getUserDirectPermissions(userId) {
  const rows = db.prepare(`SELECT page, level FROM user_permissions WHERE user_id = ?`).all(userId);
  const byPage = {};
  for (const r of rows) byPage[r.page] = r.level;
  const out = {};
  for (const key of Object.keys(PAGES)) {
    const direct = byPage[key];
    out[key] = VALID_LEVELS.includes(direct) ? direct : (ALWAYS_VIEW_PAGES.includes(key) ? 'view' : 'none');
  }
  return out;
}

/** { sectionKey: 'edit' | 'view' } of a non-admin login's OWN direct section-override rows
    only — a section with no row of its own is simply left out (it inherits the page setting),
    rather than being filled in with the role-combined effective value. Same reasoning as
    getUserDirectPermissions: the admin screen must edit this person's own baseline, not a
    snapshot that already includes whatever their current roles happen to grant. */
function getUserDirectSections(userId) {
  const rows = db.prepare(`SELECT section, level FROM user_section_permissions WHERE user_id = ?`).all(userId);
  const out = {};
  for (const r of rows) out[r.section] = r.level;
  return out;
}

/** { sectionKey: 'edit' | 'view' } for every known section, for one signed-in user — used to
    ship the client everything it needs to hide/disable a restricted section's edit controls. */
function getSectionLevels(user) {
  const perms = getPermissions(user);
  const out = {};
  for (const [key, def] of Object.entries(SECTIONS)) {
    out[key] = getSectionLevel(user, key, perms[def.page] || 'none');
  }
  return out;
}

/** Whether this login can see dollar figures anywhere in the app (deal value, job costing/
    billing, estimate/invoice prices, the price book). A standalone per-user flag — deliberately
    not affected by custom roles, so it can't be quietly re-granted by adding someone to an
    unrelated role. Admins always see prices. */
function canSeePrices(user) {
  return user.role === 'admin' || !!user.can_see_prices;
}

/** Whether this login's own estimates must get a manager's internal approval before they can go
    out to a customer (Users & permissions — "Estimate approval"). Admins never need approval —
    there's no one above them to grant it. */
function requiresEstimateApproval(user) {
  return user.role !== 'admin' && !!user.requires_estimate_approval;
}

/** Whether this login is allowed to approve someone else's pending estimate-approval request.
    Admins can always approve, in addition to whoever an admin has explicitly flagged here. */
function canApproveEstimates(user) {
  return user.role === 'admin' || !!user.can_approve_estimates;
}

/** Rejects a PATCH whose body touches a restricted section. `updates` is the raw req.body for a
    page whose overall access is already confirmed 'edit' by requirePage/requireAnyPage — this
    only needs to check the finer-grained section list. Returns an error string, or null if fine. */
function checkSectionEdit(user, pageLevel, body) {
  for (const [key, def] of Object.entries(SECTIONS)) {
    const touchesSection = def.fields.some((f) => Object.prototype.hasOwnProperty.call(body, f));
    if (!touchesSection) continue;
    if (getSectionLevel(user, key, pageLevel) !== 'edit') {
      return `your account doesn't have edit access to "${def.label}"`;
    }
  }
  return null;
}

// --- Custom roles (reusable, stackable permission templates — the "Roles" the user asked for,
// distinct from the admin/user account-type field above) ---
function listCustomRoles() {
  const roles = db.prepare(`SELECT * FROM custom_roles ORDER BY name`).all();
  const permRows = db.prepare(`SELECT * FROM custom_role_permissions`).all();
  const sectionRows = db.prepare(`SELECT * FROM custom_role_section_permissions`).all();
  const memberRows = db.prepare(`
    SELECT ucr.role_id, u.id, u.username FROM user_custom_roles ucr JOIN users u ON u.id = ucr.user_id ORDER BY u.username
  `).all();
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    permissions: Object.fromEntries(permRows.filter((p) => p.role_id === r.id).map((p) => [p.page, p.level])),
    sections: Object.fromEntries(sectionRows.filter((s) => s.role_id === r.id).map((s) => [s.section, s.level])),
    members: memberRows.filter((m) => m.role_id === r.id).map((m) => ({ id: m.id, username: m.username })),
  }));
}

function createCustomRole(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('a role name is required');
  const result = db.prepare(`INSERT INTO custom_roles (name) VALUES (?)`).run(clean);
  return result.lastInsertRowid;
}

function updateCustomRole(roleId, { name, permissions, sections }) {
  const existing = db.prepare(`SELECT * FROM custom_roles WHERE id = ?`).get(roleId);
  if (!existing) throw new Error('role not found');
  if (name !== undefined && name.trim()) {
    db.prepare(`UPDATE custom_roles SET name = ? WHERE id = ?`).run(name.trim(), roleId);
  }
  if (permissions && typeof permissions === 'object') {
    const upsert = db.prepare(`
      INSERT INTO custom_role_permissions (role_id, page, level) VALUES (?, ?, ?)
      ON CONFLICT(role_id, page) DO UPDATE SET level = excluded.level
    `);
    for (const [page, level] of Object.entries(permissions)) {
      if (!Object.prototype.hasOwnProperty.call(PAGES, page)) throw new Error(`unknown page: ${page}`);
      if (!VALID_LEVELS.includes(level)) throw new Error(`level must be one of: ${VALID_LEVELS.join(', ')}`);
      upsert.run(roleId, page, level);
    }
  }
  if (sections && typeof sections === 'object') {
    const upsert = db.prepare(`
      INSERT INTO custom_role_section_permissions (role_id, section, level) VALUES (?, ?, ?)
      ON CONFLICT(role_id, section) DO UPDATE SET level = excluded.level
    `);
    for (const [section, level] of Object.entries(sections)) {
      if (!Object.prototype.hasOwnProperty.call(SECTIONS, section)) throw new Error(`unknown section: ${section}`);
      if (!['edit', 'view'].includes(level)) throw new Error(`section level must be 'edit' or 'view'`);
      upsert.run(roleId, section, level);
    }
  }
}

function deleteCustomRole(roleId) {
  db.prepare(`DELETE FROM custom_roles WHERE id = ?`).run(roleId);
}

/** Replaces the full set of custom roles held by one login (an array of role ids) — simplest
    mental model for the admin (\"this person holds exactly these roles\"), rather than add/remove
    calls to keep in sync. */
function setUserCustomRoles(userId, roleIds) {
  const tx = db.transaction((ids) => {
    db.prepare(`DELETE FROM user_custom_roles WHERE user_id = ?`).run(userId);
    const insert = db.prepare(`INSERT OR IGNORE INTO user_custom_roles (user_id, role_id) VALUES (?, ?)`);
    for (const id of ids) insert.run(userId, Number(id));
  });
  tx(Array.isArray(roleIds) ? roleIds : []);
}

function getUserCustomRoleIds(userId) {
  return db.prepare(`SELECT role_id FROM user_custom_roles WHERE user_id = ?`).all(userId).map((r) => r.role_id);
}

/** Sets one or more individual page permissions for a single (non-admin) login. `updates` is
    { pageKey: 'edit' | 'view' | 'none', ... } — only keys in PAGES are settable this way; admin-
    only pages aren't individually configurable (see getPermissions above). The client round-trips
    the full permissions object it was given — which getPermissions() always populates with the
    admin-only keys too, pinned to 'none' — so those keys are silently skipped here rather than
    rejected; only a genuinely unrecognized key (a typo, not one of PAGES or ADMIN_ONLY_PAGES) is
    an error. */
function setUserPermissions(userId, updates) {
  const upsert = db.prepare(`
    INSERT INTO user_permissions (user_id, page, level) VALUES (?, ?, ?)
    ON CONFLICT(user_id, page) DO UPDATE SET level = excluded.level
  `);
  for (const [page, level] of Object.entries(updates || {})) {
    if (ADMIN_ONLY_PAGES.includes(page)) continue;
    if (!Object.prototype.hasOwnProperty.call(PAGES, page)) throw new Error(`unknown page: ${page}`);
    if (!VALID_LEVELS.includes(level)) throw new Error(`level must be one of: ${VALID_LEVELS.join(', ')}`);
    upsert.run(userId, page, level);
  }
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}
function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function publicUser(user) {
  return {
    id: user.id, username: user.username, role: user.role, roleLabel: ROLE_LABEL[user.role] || user.role,
    active: !!user.active, permissions: getPermissions(user),
    sections: getSectionLevels(user),
    can_see_prices: canSeePrices(user),
    requires_estimate_approval: requiresEstimateApproval(user),
    can_approve_estimates: canApproveEstimates(user),
    custom_role_ids: user.role === 'admin' ? [] : getUserCustomRoleIds(user.id),
  };
}

/** Populates req.user from the session cookie. Does not itself reject unauthenticated requests
    (routes that need to require login use requireAuth below) — this just makes req.user available
    wherever it exists, e.g. for logging. */
function readSession(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub);
      if (user && user.active) req.user = user;
    } catch { /* invalid/expired token — treated as logged out */ }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not signed in' });
  next();
}

/** Gates a whole router by page: GET/HEAD need at least 'view', everything else needs 'edit'. */
function requirePage(pageKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not signed in' });
    const perms = getPermissions(req.user);
    const level = perms[pageKey] || 'none';
    const needsEdit = !['GET', 'HEAD'].includes(req.method);
    if (level === 'none' || (needsEdit && level !== 'edit')) {
      return res.status(403).json({ error: `your account doesn't have ${needsEdit ? 'edit' : 'view'} access to this` });
    }
    next();
  };
}

/** Gates a router shared by more than one page — the deals table/router covers both the Leads
    and Opportunities pages, since this app never splits a lead into a separate object (see the
    Leads/Opportunities/Projects design note). Access is granted if EITHER page allows it. */
function requireAnyPage(pageKeys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not signed in' });
    const perms = getPermissions(req.user);
    const needsEdit = !['GET', 'HEAD'].includes(req.method);
    const ok = pageKeys.some((key) => {
      const level = perms[key] || 'none';
      return needsEdit ? level === 'edit' : level !== 'none';
    });
    if (!ok) return res.status(403).json({ error: `your account doesn't have ${needsEdit ? 'edit' : 'view'} access to this` });
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not signed in' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

module.exports = {
  ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS, SECTIONS,
  seedPagePermissions, getPermissions, setUserPermissions, getUserDirectPermissions, getUserDirectSections,
  getSectionLevel, getSectionLevels, checkSectionEdit, canSeePrices,
  requiresEstimateApproval, canApproveEstimates,
  listCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole, setUserCustomRoles, getUserCustomRoleIds,
  hashPassword, verifyPassword, signToken, setSessionCookie, clearSessionCookie, publicUser,
  readSession, requireAuth, requirePage, requireAnyPage, requireAdmin,
  COOKIE_NAME,
};
