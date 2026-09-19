const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// On a host with no persistent disk (Render's free tier), the app only ever has the copy of
// data.sqlite checked into the repo — every deploy starts fresh from that snapshot, wiping
// anything written since the last commit (a known, deliberate tradeoff of free hosting; see the
// spec doc). Once a paid plan's persistent disk is attached and DATA_DIR is set to its mount
// path, the live database lives there instead and survives every future deploy: the committed
// data.sqlite is read only once, to seed that disk the first time it's empty, and is never
// touched again after that — so real data written after this point can't be overwritten by a
// deploy. Leaving DATA_DIR unset keeps the exact previous behavior (local dev, or no disk yet).
const SEED_DB_PATH = path.join(__dirname, '..', 'data.sqlite');
const DATA_DIR = process.env.DATA_DIR || null;
const DB_PATH = DATA_DIR ? path.join(DATA_DIR, 'data.sqlite') : SEED_DB_PATH;

if (DATA_DIR) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(SEED_DB_PATH, DB_PATH);
    console.log(`[db] persistent disk database not found yet — seeded ${DB_PATH} from the committed data.sqlite`);
  }
}

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

-- job_id is nullable (Sept 2026) — an estimate used to always belong to a project, but the real
-- sales flow is Lead -> Appointment -> Opportunity -> Estimate -> (customer signs) -> Invoice +
-- Project created automatically, so an estimate now gets written against an Opportunity (deal_id)
-- before any project exists, and only gains a job_id once it's signed (see routes/public.js's
-- /estimates/:token/sign, and migrateEstimatesJobOptional() below for the upgrade path on an
-- existing committed database that still has job_id NOT NULL).
CREATE TABLE IF NOT EXISTS estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
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

-- A custom, named multi-milestone payment schedule (Sept 2026) — "1st payment due on start date",
-- "2nd payment due after demo", "final payment due on completion", etc, each carrying its own
-- share of the estimate's total. Optional: an estimate with no rows here just falls back to the
-- older single deposit_percent field (see helpers.js's getEstimatePaymentSchedule) — this table
-- only exists at all once someone actually builds a custom schedule, so it's a brand-new table
-- rather than a change to the estimates row itself.
CREATE TABLE IF NOT EXISTS estimate_payment_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  percent REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
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

-- Customer-facing texting, Hatch-style (Sept 2026) — one thread per contact ("direction" tells
-- outbound-from-us apart from inbound-from-customer). Outbound rows are either typed by a rep or
-- fired by an automation (automation_name set); inbound rows are always rep-logged (the user
-- chose "a rep logs what the customer said" over auto-pulling replies from a real inbox), never
-- pulled automatically from anywhere. Real delivery goes through sms.js once Twilio is
-- configured; until then rows still get created here (status 'simulated') so the thread and the
-- automations around it work end-to-end before the user sets up billing for a phone number.
CREATE TABLE IF NOT EXISTS customer_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  channel TEXT NOT NULL DEFAULT 'sms',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'logged',
  automation_name TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- AnswerForce call-notification emails turned into leads (Sept 2026) — the CRM polls the same
-- Gmail inbox already connected for outbound automation email (GMAIL_USER/GMAIL_APP_PASSWORD, see
-- mailer.js) for messages from AnswerForce (the user's call-answering service) and parses each one
-- into a lead, instead of requiring a separate webhook/Zapier setup. One row per processed email
-- (keyed by Gmail's message id) so a message already turned into a lead is never re-processed on
-- the next poll, even across redeploys (this table ships committed like every other table here).
CREATE TABLE IF NOT EXISTS answerforce_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT UNIQUE NOT NULL,
  subject TEXT,
  received_at TEXT,
  template TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  note TEXT,
  processed_at TEXT DEFAULT (datetime('now'))
);
`);

// --- Crew, pay & attendance, and subcontractor compliance (Sept 2026) ---
// Employee pay (daily_rate) and a subcontractor's own insurance/license documents are internal
// records only — neither is ever read by the estimate/invoice code path (estimates draw their
// line items from catalog_items via estimate_items; a job's labor cost is a Labor-category row in
// the existing job_expenses table, same as any other cost, never copied onto a customer-facing
// document). Attendance doesn't duplicate that cost tracking — logging a day against a job here
// creates exactly one job_expenses row (category 'Labor', unit_cost = that employee's daily rate
// at the time), so job costing/billing's existing laborCost subtotal picks it up for free; the
// job_expense_id link lets removing an attendance entry clean up its cost row too.
db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  hire_date TEXT,
  daily_rate REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Document',
  file_name TEXT,
  data_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  daily_rate REAL NOT NULL DEFAULT 0,
  job_expense_id INTEGER REFERENCES job_expenses(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS subcontractors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trade TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subcontractor_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subcontractor_id INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'Insurance',
  file_name TEXT,
  data_url TEXT,
  expiry_date TEXT,
  last_notified_at TEXT,
  last_request_sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// --- Company vehicles (Sept 2026) — the truck/trailer/equipment fleet, who's currently assigned
// to drive each one, its registration/insurance/inspection paperwork with expiry tracking (same
// worst-status-wins + throttled-office-notification pattern as subcontractor compliance above,
// minus the "send to" step — there's no outside party to email, so vehicleCompliance.js only ever
// notifies the office), and a simple maintenance log (service date, cost, odometer). Deliberately
// not wired into job costing — a vehicle isn't billed to a specific customer job the way labor or
// materials are, so this stays a standalone internal record, same spirit as employee pay.
db.exec(`
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  license_plate TEXT,
  assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  odometer INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'Registration',
  file_name TEXT,
  data_url TEXT,
  expiry_date TEXT,
  last_notified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_date TEXT NOT NULL,
  description TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  odometer INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Location check-ins (Sept 2026) — the phone-based tracking the user asked for: whoever has a
-- vehicle's detail page open on their phone can share their current GPS position, which lands
-- here as one row per ping. There's no hardware GPS tracker involved (that's a separate paid
-- provider decision the user hasn't made yet) — this only ever knows where a vehicle was as of
-- its last check-in, not a continuous live feed, so every reader of this table treats a stale
-- last-ping as exactly that: stale, not "vehicle not moving."
CREATE TABLE IF NOT EXISTS vehicle_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  reported_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_vehicle_time ON vehicle_locations (vehicle_id, recorded_at DESC);

-- Ad-hoc / custom reports (Sept 2026) — separate from the fixed rollup routes/reports.js
-- computes for the Dashboard's "Reports" grid. Those ~20 cards are a good fixed set but can't be
-- reconfigured; this table lets an admin build their own on top of leads/opportunities/projects/
-- invoices/tickets/employees/vehicles/subcontractors (see reportSources.js for the whitelisted
-- dimensions/metrics per source — group_by/metric/date_field are never interpolated into SQL
-- directly, only ever used as a lookup key into that whitelist). A report is edited in place —
-- every field here can change after creation, no separate "draft vs published" state — so
-- ReportDetail.jsx just PATCHes whatever changed as the person adjusts the builder.
CREATE TABLE IF NOT EXISTS custom_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'New report',
  description TEXT,
  data_source TEXT NOT NULL DEFAULT 'leads',
  group_by TEXT NOT NULL DEFAULT 'source',
  metric TEXT NOT NULL DEFAULT 'count',
  date_field TEXT,
  date_range TEXT NOT NULL DEFAULT 'all',
  date_start TEXT,
  date_end TEXT,
  chart_type TEXT NOT NULL DEFAULT 'bar',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
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

// --- Custom report builder: detail/tabular reports (Sept 2026) ---
// Added on top of the original aggregate-chart report (data_source/group_by/metric/chart_type
// above) so a report can also be a Salesforce-style detail list: explicit columns, a second
// grouping level with subtotals, and a flexible filter list — see reportSources.js's FIELDS/
// OPERATORS. `report_type` ('summary' | 'detail') picks which shape a given report renders as;
// the original aggregate columns above are untouched, so existing summary-chart reports keep
// working exactly as before. `group_by` (already on the table) doubles as the detail report's
// first-level grouping field; `group_by_2` is the new second level.
ensureColumn('custom_reports', 'report_type', "report_type TEXT NOT NULL DEFAULT 'summary'");
ensureColumn('custom_reports', 'columns', "columns TEXT NOT NULL DEFAULT '[]'");
ensureColumn('custom_reports', 'group_by_2', 'group_by_2 TEXT');
ensureColumn('custom_reports', 'filters', "filters TEXT NOT NULL DEFAULT '[]'");
ensureColumn('custom_reports', 'sort_field', 'sort_field TEXT');
ensureColumn('custom_reports', 'sort_dir', "sort_dir TEXT NOT NULL DEFAULT 'desc'");

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
// A line item's own longer scope-of-work text (Sept 2026) — separate from `description`, which
// stays the short line title/name. Populated automatically when a line is added from the Items
// catalog (see LineItemEditor.jsx's pickFromCatalog, which carries the catalog item's own
// description here rather than squashing it into the same field as the name) so a multi-
// paragraph writeup renders as its own block under the line on the estimate/invoice/PDF instead
// of disappearing. Nullable and blank by default — a manually-typed line just has no notes.
ensureColumn('estimate_items', 'notes', 'notes TEXT');
ensureColumn('invoice_items', 'notes', 'notes TEXT');
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

// Relaxes estimates.job_id from NOT NULL to nullable and adds deal_id, for a committed database
// created before the Lead -> Opportunity -> Estimate -> (signed) -> Invoice + Project flow existed
// (see the CREATE TABLE comment above). SQLite can't ALTER a column's NOT NULL constraint in
// place, so this rebuilds the table once — every existing estimate keeps its id and its job_id
// unchanged, it just gets a (null) deal_id alongside it. Runs after all the ensureColumn calls
// above so every one of those columns already exists on the live table before it's copied across.
// A no-op once migrated (or on a table created fresh by the CREATE TABLE above, which already has
// the new shape).
function migrateEstimatesJobOptional() {
  const jobIdCol = db.prepare(`PRAGMA table_info(estimates)`).all().find((c) => c.name === 'job_id');
  if (!jobIdCol || jobIdCol.notnull === 0) return;
  const cols = db.prepare(`PRAGMA table_info(estimates)`).all().map((c) => c.name);
  const colList = cols.join(', ');
  // estimate_items (ON DELETE CASCADE) and invoices (ON DELETE SET NULL) both reference
  // estimates.id — with foreign_keys ON, SQLite applies those actions the moment the old table is
  // DROPped, which would wipe every estimate's line items and orphan its invoices before the new
  // table is even renamed into place. Turning enforcement off for just this rebuild (back on
  // immediately after) avoids that — the id values are copied across unchanged, so every existing
  // reference is valid again the instant the rename completes.
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE estimates_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
      deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      tax_rate REAL NOT NULL DEFAULT 0,
      deposit_percent REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      sign_token TEXT, signed_name TEXT, signed_at TEXT, signature_data_url TEXT,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approval_status TEXT, approval_requested_at TEXT,
      approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, approved_at TEXT,
      rejection_reason TEXT
    );
    INSERT INTO estimates_new (${colList}) SELECT ${colList} FROM estimates;
    DROP TABLE estimates;
    ALTER TABLE estimates_new RENAME TO estimates;
  `);
  db.pragma('foreign_keys = ON');
}
migrateEstimatesJobOptional();

// Customer-view display toggles + view tracking (Sept 2026) — three independent switches (not one
// "show pricing" flag) matching Joist's own "Display Options": whether the customer-facing
// estimate/invoice shows a Qty column, a Rate (unit price) column, and a per-line Amount column.
// Off just hides that column from the line-items table; the document's own Subtotal/Tax/Total
// always show regardless, since those describe the whole document, not a line. Default to all-on
// so every existing estimate/invoice keeps looking exactly as it does today. first_viewed_at is
// set the first time a customer opens the public link (see routes/public.js) so we can notify the
// business once per document rather than on every reload.
ensureColumn('estimates', 'show_rate', 'show_rate INTEGER NOT NULL DEFAULT 1');
ensureColumn('estimates', 'show_qty', 'show_qty INTEGER NOT NULL DEFAULT 1');
ensureColumn('estimates', 'show_item_total', 'show_item_total INTEGER NOT NULL DEFAULT 1');
ensureColumn('estimates', 'first_viewed_at', 'first_viewed_at TEXT');
ensureColumn('invoices', 'show_rate', 'show_rate INTEGER NOT NULL DEFAULT 1');
ensureColumn('invoices', 'show_qty', 'show_qty INTEGER NOT NULL DEFAULT 1');
ensureColumn('invoices', 'show_item_total', 'show_item_total INTEGER NOT NULL DEFAULT 1');
ensureColumn('invoices', 'first_viewed_at', 'first_viewed_at TEXT');

// Attendance: Full day / Half day (Sept 2026) — attendance.daily_rate already stores the actual
// dollar amount charged for that entry (see the CREATE TABLE comment above), so a half day just
// means that amount was halved at the moment it was logged; day_type is purely the label so the
// UI can show "(half day)" next to a name instead of a dollar figure per person.
ensureColumn('attendance', 'day_type', "day_type TEXT NOT NULL DEFAULT 'full'");

// Contracts library (Sept 2026) — the user asked to be able to create and edit the actual
// Terms & Conditions / Agreement text that goes on the bottom of an estimate/invoice, instead of
// it being fixed text in a file (see the old termsText.js, kept only as a historical reference —
// nothing reads it any more). Each contract has a heading, an intro paragraph, and a numbered
// list of clauses (stored as JSON — a [heading, body] pair per clause, same shape termsText.js
// used) so the PDF/web view can render bold numbered sub-headings exactly like the user's
// reference document. Two flags mark which single contract is the current default for each
// customer type (Residential/Commercial) — an estimate with no contract_id of its own falls back
// to whichever contract is flagged default for its resolved customer type (see helpers.js's
// getContractForEstimate). At most one contract can hold each default flag at a time; enforced in
// code (routes/contracts.js), not by a DB constraint.
db.exec(`
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  heading TEXT NOT NULL DEFAULT 'AGREEMENT & LIMITED WARRANTY',
  intro TEXT,
  clauses TEXT NOT NULL DEFAULT '[]',
  is_default_residential INTEGER NOT NULL DEFAULT 0,
  is_default_commercial INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
ensureColumn('estimates', 'contract_id', 'contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL');
ensureColumn('estimates', 'declined_at', 'declined_at TEXT');
ensureColumn('estimates', 'decline_reason', 'decline_reason TEXT');

// Global markup % (added on top of the line-item subtotal, the contractor's own margin) and an
// optional discount (flat $ or %, taken off the marked-up subtotal) — Sept 2026. Both apply to
// the estimate as a whole, same as tax_rate, so they live as columns on the row rather than a
// side table like the line items or payment schedule. discount_type is NULL for "no discount set"
// (as opposed to 0 for "not the flat kind") so a saved estimate can distinguish "never had a
// discount" from "had one, then removed it" — not that either currently matters, but it keeps
// the same NULL-means-absent convention the rest of this schema uses (see sign_token etc). Copied
// straight onto the invoice at conversion time (see helpers.js's createInvoiceFromEstimate) so an
// invoice's total always matches the estimate's, without re-baking either into the line items.
ensureColumn('estimates', 'markup_percent', 'markup_percent REAL NOT NULL DEFAULT 0');
ensureColumn('estimates', 'discount_type', 'discount_type TEXT');
ensureColumn('estimates', 'discount_value', 'discount_value REAL NOT NULL DEFAULT 0');
ensureColumn('invoices', 'markup_percent', 'markup_percent REAL NOT NULL DEFAULT 0');
ensureColumn('invoices', 'discount_type', 'discount_type TEXT');
ensureColumn('invoices', 'discount_value', 'discount_value REAL NOT NULL DEFAULT 0');

// Seeds the one real contract the user provided (Sept 2026) — replaces the old placeholder
// Residential/Commercial split from termsText.js with the actual "AGREEMENT & LIMITED WARRANTY"
// document the user sent, used as the default for both customer types until the user creates
// separate ones from the new Contracts page. Runs once — if any contract already exists (the
// user has since edited this one, or added others), this is skipped entirely so nothing ever
// overwrites their edits.
if (!db.prepare(`SELECT 1 FROM contracts LIMIT 1`).get()) {
  const clauses = [
    ['1. Material Selection & Approval', 'The Client shall be solely responsible for the selection and approval of all materials, including but not limited to color, texture, and finish. All selections must be submitted to PPM in writing (email) and confirmed prior to project scheduling. PPM shall not be held liable for discrepancies resulting from unapproved or incorrectly specified materials.'],
    ['2. Mechanic’s Lien Notice', 'The Client is hereby notified that any contractor, subcontractor, laborer, or material supplier who provides services or materials to this project and remains unpaid may have the legal right to file a mechanic’s lien against the property.'],
    ['3. Unforeseen Conditions & Change Orders', 'In the event that concealed or unforeseen conditions are encountered, PPM shall promptly notify the Client. Any additional work required shall be subject to a written change order and may result in an adjustment to the contract price and/or project timeline.'],
    ['4. Project Schedule & Delays', 'All commencement dates, completion dates, and project durations are estimates only and are subject to reasonable adjustments due to conditions beyond PPM’s control, including but not limited to adverse weather, site conditions, labor disputes, material shortages, acts of God, or other force majeure events. PPM shall make commercially reasonable efforts to maintain progress and will notify the Client of any significant delays. Additional costs incurred as a result of such delays may be the responsibility of the Client.'],
    ['5. Site Access & Walkthroughs', 'The Client, or an authorized representative, shall be available for both the initial project walkthrough and final inspection. In the event the Client is unavailable at project commencement, PPM shall proceed in accordance with the agreed scope of work, and shall not be held responsible for deviations arising from the Client’s absence.'],
    ['6. Entire Agreement', 'This Agreement constitutes the entire understanding between the parties. Only those items expressly set forth in writing and executed by both parties (including signatures, initials, and written amendments) shall be deemed part of the scope of work. No verbal statements, representations, or assurances shall be binding.'],
    ['7. Inspection & Right to Cure', 'Upon completion, PPM shall be afforded a reasonable opportunity to inspect and remedy any alleged deficiencies. The Client agrees not to undertake corrective work or initiate third-party repairs without first providing PPM the opportunity to cure.'],
    ['8. Limitation of Liability', 'PPM shall not be liable for indirect, incidental, or consequential damages arising from the performance of this Agreement. Natural variations in materials, normal wear and tear, and damage caused by external factors are not covered under warranty.'],
    ['9. Legal Fees & Governing Law', 'In the event of any dispute arising under this Agreement, the prevailing party shall be entitled to recover reasonable attorney’s fees and costs. This Agreement shall be governed by the laws of the State in which the project is performed.'],
    ['10. Right of Cancellation', 'The Client shall have the right to cancel this Agreement within three (3) business days from the date of signing, without penalty or obligation, by providing written notice to PPM.\n\nAny cancellation request must be submitted in writing via email or certified mail within the three (3) business day cancellation period. If cancellation is requested after the expiration of the three (3) business days, the Client may be subject to material costs, administrative fees, design fees, permit fees, or any costs incurred by PPM prior to cancellation.\n\nOnce materials have been ordered, custom materials fabricated, permits filed, or work commenced, such costs shall be non-refundable.'],
  ];
  db.prepare(`
    INSERT INTO contracts (name, heading, intro, clauses, is_default_residential, is_default_commercial)
    VALUES (?, ?, ?, ?, 1, 1)
  `).run(
    'Agreement & Limited Warranty',
    'AGREEMENT & LIMITED WARRANTY',
    'By executing this Agreement, the Customer ("Client") acknowledges and agrees to the scope of work, terms, and conditions set forth herein. Precision Paving and Masonry LLC ("PPM") warrants that all workmanship performed under this Agreement shall be free from defects for a period of two (2) years from the date of substantial completion.',
    JSON.stringify(clauses)
  );
}

// Dashboard briefly went admin-only (Sept 2026), which deleted every per-user 'dashboard' row —
// then (still Sept 2026) the user asked for it back as an individually-grantable page like any
// other, alongside Automations and Integrations (see permissionsConfig.js's PAGES/ADMIN_ONLY_PAGES).
// Nothing to clean up here any more; the backfill below (after seedPagePermissions is defined)
// re-adds a 'none' row for 'dashboard' — and for 'automations'/'integrations'/'price_book', which
// are new keys too — to every existing non-admin login that predates them.
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

// Migration: back-fill any PAGES key added after a login was already seeded (dashboard/
// automations/integrations moving back to individually-configurable, and items/price_book
// splitting out of one combined "Items & price book" key) with a 'none' row, for every existing
// non-admin login. INSERT OR IGNORE means this never touches a row that already exists, so it
// can never reset a permission an admin already granted — it only ever adds the missing ones.
const allNonAdminUserIds = db.prepare(`SELECT id FROM users WHERE role != 'admin'`).all().map((r) => r.id);
const backfillPageRow = db.prepare(`INSERT OR IGNORE INTO user_permissions (user_id, page, level) VALUES (?, ?, 'none')`);
for (const uid of allNonAdminUserIds) {
  for (const key of Object.keys(PAGES)) backfillPageRow.run(uid, key);
}

// --- Customer texting auto-responses, Hatch-style (Sept 2026) ---
// Seeded once, by name, so the four auto-responses the user asked for ("just like Hatch") work
// out of the box rather than requiring a trip through the Automations builder first. Every one
// uses the send_sms action, which is a no-op-but-logged text until Twilio is configured (see
// sms.js) — safe to ship enabled from day one. An admin can edit the wording, disable, or delete
// any of these from the Automations page like any other rule; this only ever runs once (a name
// already in the table is left untouched, even if it was edited or deleted since).
function seedAutomation(name, trigger_type, trigger_config, action_type, action_config) {
  const exists = db.prepare(`SELECT 1 FROM automations WHERE name = ?`).get(name);
  if (exists) return;
  db.prepare(`
    INSERT INTO automations (name, trigger_type, trigger_config, action_type, action_config, enabled)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(name, trigger_type, JSON.stringify(trigger_config), action_type, JSON.stringify(action_config));
}
seedAutomation(
  'Instant reply to a new lead', 'deal_created', {}, 'send_sms',
  { message: "Hi {{contact_name}}, thanks for reaching out to Precision Paving & Masonry about {{title}}! We got your request and someone from our team will be in touch soon. Reply here anytime with questions." }
);
seedAutomation(
  'Estimate follow-up', 'estimate_stale', { days_since_sent: 3 }, 'send_sms',
  { message: "Hi {{contact_name}}, just following up on the estimate for {{title}}. Let us know if you have any questions or you're ready to move forward!" }
);
seedAutomation(
  'Review request after job completion', 'job_completed', {}, 'send_sms',
  { message: "Hi {{contact_name}}, thank you for choosing Precision Paving & Masonry for {{title}}! We'd really appreciate it if you could leave us a quick review — just reply and we'll send the link. Thanks for your business!" }
);
seedAutomation(
  'Re-engage a stale lead', 'deal_stale', { days_idle: 14 }, 'send_sms',
  { message: "Hi {{contact_name}}, just checking in on {{title}} — still interested in moving forward? Happy to answer any questions or set up a time to chat." }
);

module.exports = db;
