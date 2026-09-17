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
ensureColumn('estimates', 'sign_token', 'sign_token TEXT');
ensureColumn('estimates', 'signed_name', 'signed_name TEXT');
ensureColumn('estimates', 'signed_at', 'signed_at TEXT');
ensureColumn('estimates', 'signature_data_url', 'signature_data_url TEXT');
// Back-fill a sign token for any estimate created before this column existed.
db.prepare(`UPDATE estimates SET sign_token = lower(hex(randomblob(16))) WHERE sign_token IS NULL`).run();
// Rename of an earlier stage key ('material_order' -> 'site_prep') on any DB seeded before the rename.
db.prepare(`UPDATE jobs SET stage = 'site_prep' WHERE stage = 'material_order'`).run();
// Project status lifecycle expanded to 6 states ('completed' -> 'complete', plus new 'accepted'/'on_hold')
// to match the user's real project-management tool's Project Status field.
db.prepare(`UPDATE jobs SET status = 'complete' WHERE status = 'completed'`).run();

module.exports = db;
