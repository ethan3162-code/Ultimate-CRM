const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  industry TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new',
  probability INTEGER NOT NULL DEFAULT 20,
  expected_close TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  address TEXT,
  scheduled_date TEXT,
  start_date TEXT,
  end_date TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  demo_days INTEGER NOT NULL DEFAULT 1,
  site_prep_days INTEGER NOT NULL DEFAULT 2,
  installation_days INTEGER NOT NULL DEFAULT 5,
  final_walkthrough_days INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  tax_rate REAL NOT NULL DEFAULT 0,
  deposit_percent REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS estimate_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  estimate_id INTEGER REFERENCES estimates(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  kind TEXT NOT NULL DEFAULT 'standard',
  tax_rate REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'card',
  reference TEXT,
  paid_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  related_type TEXT NOT NULL,
  related_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config TEXT NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  related_type TEXT,
  related_id INTEGER,
  note TEXT,
  ran_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  sla_due_at TEXT,
  satisfaction_score INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  source TEXT NOT NULL DEFAULT 'local',
  google_event_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  material_key TEXT,
  brand TEXT,
  sf_per_pallet REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expiry_date INTEGER,
  scope TEXT,
  connected_email TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  related_type TEXT NOT NULL,
  related_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'progress',
  caption TEXT,
  data_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'Materials',
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  incurred_on TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Logins & permissions (Sept 2026) — one account per person, a role each account is assigned
-- (mostly a label plus what a new login's permissions default to), and that login's own
-- page-by-page permission set in user_permissions below (edit/view/none per business page,
-- individually — see auth.js and permissionsConfig.js).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Per-user, per-page permission level ('edit' | 'view' | 'none'). Admin logins don't need rows
-- here — they always have full edit access to everything, computed in auth.js. Replaces an
-- earlier per-role Standard/Strict mode (role_settings, since dropped) with individual control.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'view',
  PRIMARY KEY (user_id, page)
);

-- Reusable named permission templates ("Roles" in the UI — Sept 2026). Distinct from the
-- users.role account TYPE column (admin/user) above; a custom role here is just a named bundle
-- of page + section permissions an admin can build once (e.g. "Sales", "Scheduler") and hand to
-- any number of logins. A login can hold more than one at once (user_custom_roles below is a
-- join table) — its effective access is the union (most-permissive) of every role it holds,
-- combined with its own individual user_permissions/user_section_permissions overrides. See
-- auth.js's getEffectivePermissions/getSectionLevel for exactly how these combine.
CREATE TABLE IF NOT EXISTS custom_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS custom_role_permissions (
  role_id INTEGER NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'none',
  PRIMARY KEY (role_id, page)
);
-- Section-level overrides, both for a custom role and (below) for an individual login directly.
-- Only ever holds 'view' rows in practice (a restriction below the page's own 'edit') — see
-- permissionsConfig.js's SECTIONS for the fixed list of restrictable sections.
CREATE TABLE IF NOT EXISTS custom_role_section_permissions (
  role_id INTEGER NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'edit',
  PRIMARY KEY (role_id, section)
);
CREATE TABLE IF NOT EXISTS user_custom_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE IF NOT EXISTS user_section_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'edit',
  PRIMARY KEY (user_id, section)
);

-- Internal team chat (Sept 2026) — a lightweight built-in messaging feature so logins can talk
-- to each other without leaving the CRM: named group channels (is_dm = 0) anyone can create and
-- add teammates to, and direct messages (is_dm = 1) between a fixed set of members. Every active
-- login can use this regardless of their individual page permissions (see routes/chat.js, mounted
-- with just requireAuth like directory.js) — it's a utility, not a business data page.
CREATE TABLE IF NOT EXISTS chat_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  is_dm INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
-- last_read_at lets the client show an unread count per channel per member without a separate
-- read-receipts table — set to now() whenever that member fetches the channel's messages.
CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// --- Lightweight migrations ---
// The SQLite file ships committed in the repo (Render's free tier has no persistent disk,
// so every redeploy resets storage to whatever is checked in). CREATE TABLE IF NOT EXISTS
// above only helps for brand-new tables — an existing `jobs` table from before this column
// was added needs an explicit ALTER TABLE. This runs once at boot and is a no-op once the
// column already exists.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('jobs', 'start_date', 'start_date TEXT');
ensureColumn('jobs', 'end_date', 'end_date TEXT');
ensureColumn('jobs', 'progress_percent', 'progress_percent INTEGER NOT NULL DEFAULT 0');
ensureColumn('jobs', 'stage', 'stage TEXT');
ensureColumn('jobs', 'demo_days', 'demo_days INTEGER NOT NULL DEFAULT 1');
ensureColumn('jobs', 'site_prep_days', 'site_prep_days INTEGER NOT NULL DEFAULT 2');
ensureColumn('jobs', 'installation_days', 'installation_days INTEGER NOT NULL DEFAULT 5');
ensureColumn('jobs', 'final_walkthrough_days', 'final_walkthrough_days INTEGER NOT NULL DEFAULT 1');
// Project-detail parity (Sept 2026) — matched to the user's real paving-project-management
// tool's Project record layout: a fuller status lifecycle plus Project Info / Project Billing /
// Additional Fields. Cost figures (labor cost, materials cost, billable split) are deliberately
// NOT duplicated here — they're derived from job_expenses via getJobBilling, so there's one
// source of truth for "what did this job actually cost."
ensureColumn('jobs', 'labor_crew', 'labor_crew TEXT');
ensureColumn('jobs', 'desired_start_date', 'desired_start_date TEXT');
ensureColumn('jobs', 'unqualified_reason', 'unqualified_reason TEXT');
ensureColumn('jobs', 'job_notes', 'job_notes TEXT');
ensureColumn('jobs', 'insurance_requests', 'insurance_requests TEXT');
ensureColumn('jobs', 'request_review', 'request_review TEXT');
ensureColumn('jobs', 'contract_amount', 'contract_amount REAL');
ensureColumn('jobs', 'change_order_amount', 'change_order_amount REAL NOT NULL DEFAULT 0');
ensureColumn('jobs', 'sales_tax_amount', 'sales_tax_amount REAL NOT NULL DEFAULT 0');
ensureColumn('jobs', 'capital_improvement', 'capital_improvement INTEGER NOT NULL DEFAULT 0');
ensureColumn('jobs', 'labor_paid', 'labor_paid REAL NOT NULL DEFAULT 0');
ensureColumn('jobs', 'updated_at', 'updated_at TEXT');
db.prepare(`UPDATE jobs SET updated_at = created_at WHERE updated_at IS NULL`).run();
ensureColumn('job_expenses', 'billable', 'billable INTEGER NOT NULL DEFAULT 1');
ensureColumn('catalog_items', 'name', "name TEXT NOT NULL DEFAULT ''");
ensureColumn('catalog_items', 'brand', 'brand TEXT');
ensureColumn('catalog_items', 'sf_per_pallet', 'sf_per_pallet REAL');
ensureColumn('contacts', 'source', 'source TEXT');
ensureColumn('contacts', 'address', 'address TEXT');
ensureColumn('contacts', 'mobile_phone', 'mobile_phone TEXT');
ensureColumn('deals', 'source', 'source TEXT');
ensureColumn('deals', 'rep', 'rep TEXT');
ensureColumn('deals', 'work_type', 'work_type TEXT');
ensureColumn('deals', 'customer_type', "customer_type TEXT NOT NULL DEFAULT 'Residential'");
// Lead-detail fields (Salesforce Lead-object parity, Sept 2026) — these carry on into the
// same record once a lead is qualified into an opportunity, since this app never does a
// separate Lead->Opportunity conversion step (see the Leads/Opportunities/Projects design note).
ensureColumn('deals', 'lead_status', "lead_status TEXT NOT NULL DEFAULT 'New'");
ensureColumn('deals', 'lead_type', 'lead_type TEXT');
ensureColumn('deals', 'job_timeframe', 'job_timeframe TEXT');
ensureColumn('deals', 'followup_date', 'followup_date TEXT');
ensureColumn('deals', 'lead_notes', 'lead_notes TEXT');
ensureColumn('deals', 'inquiry_notes', 'inquiry_notes TEXT');
ensureColumn('deals', 'project_description', 'project_description TEXT');
ensureColumn('deals', 'preferred_callback_time', 'preferred_callback_time TEXT');
ensureColumn('deals', 'preferred_consult_time', 'preferred_consult_time TEXT');
ensureColumn('deals', 'phone_estimate', 'phone_estimate INTEGER NOT NULL DEFAULT 0');
ensureColumn('deals', 'repeat_referral', 'repeat_referral INTEGER NOT NULL DEFAULT 0');
ensureColumn('deals', 'sub_service_type', 'sub_service_type TEXT');
ensureColumn('deals', 'lead_owner', 'lead_owner TEXT');
ensureColumn('deals', 'method_of_entry', 'method_of_entry TEXT');
ensureColumn('deals', 'ha_lead_fee', 'ha_lead_fee REAL');
ensureColumn('deals', 'ha_match_type', 'ha_match_type TEXT');
// Owner + audit trail (Sept 2026, Salesforce Contact/Lead/Opportunity parity) — a real login
// assigned as the record's owner, plus who created/last-touched it. Deliberately additive: the
// existing free-text `rep`/`lead_owner` fields on deals stay put (reports.js groups sales by the
// `rep` string, and seed data has plain-text names that aren't real usernames), and this is a
// second, separate concept — an actual account you can build permissions and directory lookups
// around, not a rename of the old field.
ensureColumn('contacts', 'owner_user_id', 'owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('contacts', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('contacts', 'updated_by_user_id', 'updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('contacts', 'updated_at', 'updated_at TEXT');
db.prepare(`UPDATE contacts SET updated_at = created_at WHERE updated_at IS NULL`).run();
ensureColumn('deals', 'owner_user_id', 'owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('deals', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('deals', 'updated_by_user_id', 'updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
// External-system linkage (Sept 2026, Salesforce lead-capture integration) — when a lead/contact
// arrives via the webhook from an outside system (Salesforce, a website form, Zapier, ...), this
// records which system and which record over there it came from, so the same Salesforce Lead
// re-firing the webhook (e.g. on every field edit, not just on create) updates the existing
// contact/deal instead of forking a duplicate.
ensureColumn('contacts', 'external_source', 'external_source TEXT');
ensureColumn('contacts', 'external_id', 'external_id TEXT');
ensureColumn('deals', 'external_source', 'external_source TEXT');
ensureColumn('deals', 'external_id', 'external_id TEXT');
ensureColumn('estimates', 'sign_token', 'sign_token TEXT');
ensureColumn('estimates', 'signed_name', 'signed_name TEXT');
ensureColumn('estimates', 'signed_at', 'signed_at TEXT');
ensureColumn('estimates', 'signature_data_url', 'signature_data_url TEXT');
// Back-fill a sign token for any estimate created before this column existed.
db.prepare(`UPDATE estimates SET sign_token = lower(hex(randomblob(16))) WHERE sign_token IS NULL`).run();
// A public, unauthenticated link for a branded, printable invoice view — same pattern as the
// estimate's sign_token above, just without a signature step (invoices aren't signed).
ensureColumn('invoices', 'public_token', 'public_token TEXT');
db.prepare(`UPDATE invoices SET public_token = lower(hex(randomblob(16))) WHERE public_token IS NULL`).run();
// Per-user price visibility (Sept 2026) — a standalone yes/no, independent of the page/section
// permission system above and not affected by which custom roles a login holds: whether this
// login can see dollar figures at all (deal value, job costing/billing, estimate/invoice prices,
// the price book). Defaults to 1 (can see prices) so every existing login's behavior is
// unchanged until an admin deliberately turns it off for someone.
ensureColumn('users', 'can_see_prices', 'can_see_prices INTEGER NOT NULL DEFAULT 1');
// Estimate internal-approval workflow (Sept 2026) — lets an admin require specific salespeople
// (e.g. someone new) to get a manager's sign-off before an estimate can go out to the customer.
// Two independent per-login flags, both off by default so nothing changes for any existing
// login until an admin deliberately turns them on: whether this login's own estimates need
// approval before they can be sent, and whether this login is one of the people allowed to
// approve someone else's request (admins can always approve, regardless of this flag).
ensureColumn('users', 'requires_estimate_approval', 'requires_estimate_approval INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'can_approve_estimates', 'can_approve_estimates INTEGER NOT NULL DEFAULT 0');
// Optional notification email for a login (separate from a contact's email — a login doesn't
// need one to use the app) — used only to email an approver when someone requests estimate
// approval, best-effort via the same Gmail mailer automations use.
ensureColumn('users', 'email', 'email TEXT');
// Who created an estimate, and the internal-approval workflow's own state — independent of
// `status` above, which tracks the customer-facing draft/sent/approved lifecycle. `approval_status`
// is null until someone requests approval, then 'pending' -> 'approved' or 'rejected' (a rejected
// estimate can be edited and resubmitted, which clears back to 'pending').
ensureColumn('estimates', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('estimates', 'approval_status', 'approval_status TEXT');
ensureColumn('estimates', 'approval_requested_at', 'approval_requested_at TEXT');
ensureColumn('estimates', 'approved_by_user_id', 'approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('estimates', 'approved_at', 'approved_at TEXT');
ensureColumn('estimates', 'rejection_reason', 'rejection_reason TEXT');
// Dashboard moved from an always-view page to an admin-only one (Sept 2026 — the user asked
// that only admins see it, alongside Users & permissions, which was already admin-only). Any
// leftover per-user 'dashboard' rows from when it was individually configurable are now dead —
// getPermissions() forces every admin-only page from a fixed list, not from this table — so
// clean them out rather than leave stale, unused rows behind.
db.prepare(`DELETE FROM user_permissions WHERE page = 'dashboard'`).run();
// Per-record assignment for notifications (Sept 2026) — the user asked that appointments and
// project schedule milestones/task due dates email the person they're assigned to, with a
// calendar-invite attachment (see notify.js/ics.js). These are deliberately separate from the
// existing deals/contacts `owner_user_id` columns (different tables, same naming convention) —
// null/unassigned by default so nothing changes until someone is actually picked.
ensureColumn('jobs', 'owner_user_id', 'owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('appointments', 'assigned_user_id', 'assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('tasks', 'assigned_user_id', 'assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
// Rename of an earlier stage key ('material_order' -> 'site_prep') on any DB seeded before the rename.
db.prepare(`UPDATE jobs SET stage = 'site_prep' WHERE stage = 'material_order'`).run();
// Project status lifecycle expanded to 6 states ('completed' -> 'complete', plus new 'accepted'/'on_hold')
// to match the user's real project-management tool's Project Status field.
db.prepare(`UPDATE jobs SET status = 'complete' WHERE status = 'completed'`).run();

// --- Logins & permissions (Sept 2026) ---
// Two account types only: `admin` (always full access) and `user` (a blank-slate regular login —
// the admin names each person and turns on exactly the pages they need, one at a time, from the
// Users & permissions page; two logins can simply be handed the same set of pages — there's no
// role in between to keep in sync). A starter login is seeded per historical "home turf" so the
// app is usable the moment it's deployed; new logins created from here on start with nothing but
// Home until an admin grants more. Idempotent — never touched by re-seeding business
// data, and never overwrites a password or permission an admin has since changed.
const { PAGES, DEFAULT_PRIMARY_PAGES, ALWAYS_VIEW_PAGES } = require('./permissionsConfig');

function seedPagePermissions(userId, role) {
  const primary = new Set(DEFAULT_PRIMARY_PAGES[role] || []);
  const insertPerm = db.prepare(`INSERT OR IGNORE INTO user_permissions (user_id, page, level) VALUES (?, ?, ?)`);
  for (const key of Object.keys(PAGES)) {
    insertPerm.run(userId, key, primary.has(key) ? 'edit' : (ALWAYS_VIEW_PAGES.includes(key) ? 'view' : 'none'));
  }
}

const userCount = db.prepare(`SELECT COUNT(*) c FROM users`).get().c;
if (userCount === 0) {
  const bcrypt = require('bcryptjs');
  const DEFAULT_ACCOUNTS = [
    ['admin', 'Admin#2026', 'admin'],
    ['pm', 'PM#2026', 'user'],
    ['salesman', 'Salesman#2026', 'user'],
    ['scheduler', 'Scheduler#2026', 'user'],
    ['accounting', 'Accounting#2026', 'user'],
  ];
  const insert = db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`);
  for (const [username, password, role] of DEFAULT_ACCOUNTS) {
    const result = insert.run(username, bcrypt.hashSync(password, 10), role);
    if (role !== 'admin') seedPagePermissions(result.lastInsertRowid, role);
  }
}

// Migration: any login stored under an old job-title role (pm/salesman/scheduler/accounting,
// from before the role model was collapsed to just admin/user) becomes a plain `user` — its
// existing individual page permissions are untouched, only the role label changes.
db.prepare(`UPDATE users SET role = 'user' WHERE role NOT IN ('admin', 'user')`).run();

// Migration: any non-admin login that predates the per-user permissions system (e.g. this
// repo's committed data.sqlite, created before user_permissions existed) has zero rows here —
// back-fill a blank-slate default once, so a pre-existing login is never silently locked out of
// everything instead of just missing the new fine-grained control.
const usersNeedingDefaults = db.prepare(`
  SELECT u.id, u.role FROM users u
  WHERE u.role != 'admin' AND NOT EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id = u.id)
`).all();
for (const { id, role } of usersNeedingDefaults) seedPagePermissions(id, role);

module.exports = db;
