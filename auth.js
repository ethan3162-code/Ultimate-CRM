const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const {
  ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS,
} = require('./permissionsConfig');

const JWT_SECRET = process.env.JWT_SECRET || 'ultimate-crm-dev-secret-change-me';
const COOKIE_NAME = 'ucrm_session';
const TOKEN_TTL = '30d';

/** Seeds (or resets) one login's individual page permissions to a blank slate: nothing but the
    always-view pages (Home/Dashboard). Used when a login is first created, and when it's
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
    comes entirely from their own individually-set user_permissions rows (defaulting to 'view'
    for Home/Dashboard and 'none' elsewhere only if a row is somehow missing — normal operation
    always has a row per page once seeded). Admin-only pages (Users, Automations, Integrations)
    are never individually configurable — they stay closed to every non-admin regardless of what
    that person's business-page permissions say. */
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
  for (const key of Object.keys(PAGES)) {
    const level = byPage[key];
    perms[key] = VALID_LEVELS.includes(level) ? level : (ALWAYS_VIEW_PAGES.includes(key) ? 'view' : 'none');
  }
  for (const key of ADMIN_ONLY_PAGES) perms[key] = 'none';
  return perms;
}

/** Sets one or more individual page permissions for a single (non-admin) login. `updates` is
    { pageKey: 'edit' | 'view' | 'none', ... } — only keys in PAGES are settable this way; admin-
    only pages aren't individually configurable (see getPermissions above). */
function setUserPermissions(userId, updates) {
  const upsert = db.prepare(`
    INSERT INTO user_permissions (user_id, page, level) VALUES (?, ?, ?)
    ON CONFLICT(user_id, page) DO UPDATE SET level = excluded.level
  `);
  for (const [page, level] of Object.entries(updates || {})) {
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
  ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS,
  seedPagePermissions, getPermissions, setUserPermissions,
  hashPassword, verifyPassword, signToken, setSessionCookie, clearSessionCookie, publicUser,
  readSession, requireAuth, requirePage, requireAnyPage, requireAdmin,
  COOKIE_NAME,
};
