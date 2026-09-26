// Shared, dependency-free config for the login/permissions system. Pulled out of auth.js so
// db.js's one-time account seeding can use the same page list and default page mapping without
// creating a require() cycle (db.js requires this; auth.js requires both this and db.js).
//
// Permissions are per-user, page-by-page (Sept 2026) — originally this was a per-role
// Standard/Strict mode, but the user asked for individual control over every page for every
// login instead of a role-wide toggle. Then (still Sept 2026) the user went further: there's no
// meaningful job-title role concept at all — "everyone should be regular user, I will name them
// and give them access to what's needed [and] some users will share the same permissions." So
// there are now only two account types: `admin` (always full access to everything, not
// individually configurable) and `user` (a blank-slate regular login — every business page
// starts at 'none' except Home, and the admin turns on view/edit per page per person
// from the Users & permissions page). Two logins can simply be given the same set of page
// permissions; nothing needs a shared "role" for that.

const ROLES = ['admin', 'user'];
const ROLE_LABEL = {
  admin: 'Admin',
  user: 'User',
};

// Every business page permissions apply to. Dashboard, Automations and Integrations moved back
// into this list (Sept 2026) — the user asked that these, like every other business page, only
// open up to a non-admin login once an admin explicitly grants it, and disappear from that
// person's menu entirely until then (see Layout.jsx's visibleNav filter and auth.jsx's
// Protected) rather than being permanently walled off from every non-admin the way Users &
// permissions and the custom report builder still are (see ADMIN_ONLY_PAGES).
//
// The 'items'/'price_book' KEYS (unchanged internal identifiers — same convention as 'jobs'
// labeling "Projects" or 'materials' labeling "Material calculator" below: the key doesn't have
// to read the same as the label) used to be one combined "Items & price book" page/permission
// covering catalog_items rows of both kinds. Split into two so each can be granted independently,
// then relabeled once more (Sept 2026) to the names the user actually wants: the 'items' key is
// labeled "Price book" — the Material Calculator's own catalog (rows with a material_key —
// asphalt, concrete, pavers, etc.); the 'price_book' key is labeled "Items" — the priced products/
// services you drop into a job estimate (rows with no material_key). See routes/catalogItems.js's
// itemPageKey() for the server-side split of the one shared table by permission (keyed the same
// as always — only the display labels below changed).
//
// 'transactions' (Sept 2026) is the company-wide invoices/payments ledger (see
// routes/transactions.js) — kept as its own permission, separate from 'jobs', so it can be
// granted to someone doing the books without also handing them project-management access.
const PAGES = {
  home: 'Home',
  dashboard: 'Dashboard',
  leads: 'Leads',
  pipeline: 'Opportunities',
  estimates: 'Estimates',
  contracts: 'Contracts',
  companies: 'Companies',
  contacts: 'Contacts',
  jobs: 'Projects',
  transactions: 'Transactions',
  materials: 'Material calculator',
  items: 'Price book',
  price_book: 'Items',
  calendar: 'Appointments',
  schedule: 'Project schedule',
  tickets: 'Tickets',
  employees: 'Employees',
  subcontractors: 'Subcontractors',
  vehicles: 'Vehicles',
  automations: 'Automations',
  // Hatch-style outbound texting campaigns (Sept 2026) — see automationEngine.js's campaign gate:
  // a separate permission from 'automations' itself, since one team might want a rep managing
  // campaigns without also handing them the full automation builder (deal-stage changes, job
  // creation, etc.), or vice versa.
  campaigns: 'Campaigns',
  integrations: 'Integrations',
};

// Pages every login can always at least view — the landing page has no edit actions of its own
// worth gating, and hiding it entirely would leave someone with nowhere to land after login.
// This is the fallback used only if a page is somehow missing a row in user_permissions (it
// should always have one once seeded) — not an override of an explicit 'none' an admin has set.
const ALWAYS_VIEW_PAGES = ['home'];

// Admin-only pages: never opened up to a non-admin login no matter what its individual page
// permissions (or any custom role) say — not individually configurable like the business pages
// above. 'users' is account/permission management itself, so letting a non-admin in would let
// them grant themselves (or anyone) more access. 'reports' (the custom report builder) stays
// admin-only for the same reason it always has: it's a cross-cutting rollup that can query across
// every other business object (deals, jobs, invoices, ...), not a single business object with its
// own natural owner — unlike Dashboard/Automations/Integrations, which moved to PAGES above.
const ADMIN_ONLY_PAGES = ['users', 'reports'];

// Starting point applied when a new regular ('user') login is created: nothing but the always-
// view pages. There's no role to infer a "home turf" from any more — the admin names the person
// and turns on whichever pages they actually need, one at a time, from the Users & permissions
// page. Kept as a map (rather than inlining an empty set in auth.js) in case a future account
// type ever wants a different starting point.
const DEFAULT_PRIMARY_PAGES = {
  user: [],
};

const VALID_LEVELS = ['edit', 'view', 'none'];

// Sub-page sections (Sept 2026) — the user asked to restrict editing to specific *parts* of a
// page, not just the whole page (e.g. edit a deal's notes but not its value, or a job's schedule
// but not its billing). Each key here corresponds exactly to one existing save-form's PATCH
// payload (see DealDetail.jsx's saveAbout/saveNotes and JobDetail.jsx's saveBilling/saveSchedule/
// changeStatus), so the server can tell which section a request touches purely from which body
// keys are present — no new form-splitting needed. Sections only ever restrict DOWN to 'view'
// within a page that's otherwise 'edit'; a page that's 'view' or 'none' already caps everything
// under it, section overrides or not (see auth.js's getSectionLevel).
const SECTIONS = {
  'pipeline.about': { label: 'Deal value & info (the "About" card)', page: 'pipeline', fields: ['title', 'value', 'probability', 'expected_close', 'source'] },
  'pipeline.notes': { label: 'Notes & inquiry', page: 'pipeline', fields: ['project_description', 'inquiry_notes', 'lead_notes'] },
  'jobs.billing': { label: 'Project billing', page: 'jobs', fields: ['contract_amount', 'change_order_amount', 'sales_tax_amount', 'capital_improvement', 'labor_paid', 'salesperson_user_id'] },
  'jobs.schedule': { label: 'Schedule & status', page: 'jobs', fields: ['status', 'start_date', 'demo_days', 'site_prep_days', 'installation_days', 'final_walkthrough_days'] },
};

module.exports = {
  ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS,
  SECTIONS,
};
