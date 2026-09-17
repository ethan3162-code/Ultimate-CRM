// Shared, dependency-free config for the login/permissions system. Pulled out of auth.js so
// db.js's one-time account seeding can use the same page list and default page mapping without
// creating a require() cycle (db.js requires this; auth.js requires both this and db.js).
//
// Permissions are per-user, page-by-page (Sept 2026) — originally this was a per-role
// Standard/Strict mode, but the user asked for individual control over every page for every
// login instead of a role-wide toggle, so DEFAULT_PRIMARY_PAGES below is only a starting point
// applied when a login is created (or its role is changed) — after that, every page is
// independently editable per person from the Users & permissions page.

const ROLES = ['admin', 'pm', 'salesman', 'scheduler', 'accounting'];
const ROLE_LABEL = {
  admin: 'Admin',
  pm: 'Project Manager',
  salesman: 'Salesman',
  scheduler: 'Scheduler',
  accounting: 'Accounting',
};

// Every business page permissions apply to. `admin`-only pages (Users, Automations,
// Integrations) are system configuration, not business data — they never open up to a
// non-admin login no matter what its individual page permissions say, so they're kept out of
// this list and gated separately (see ADMIN_ONLY_PAGES).
const PAGES = {
  home: 'Home',
  dashboard: 'Dashboard & reports',
  leads: 'Leads',
  pipeline: 'Opportunities',
  companies: 'Companies',
  contacts: 'Contacts',
  jobs: 'Projects & billing',
  materials: 'Material calculator',
  items: 'Items & price book',
  calendar: 'Appointments',
  schedule: 'Project schedule',
  tickets: 'Tickets',
};

// Pages every login can always at least view — the landing page and the reporting rollup have
// no edit actions of their own worth gating, and hiding them entirely would leave someone with
// nowhere to land after login. This is the fallback used only if a page is somehow missing a
// row in user_permissions (it should always have one once seeded) — not an override of an
// explicit 'none' an admin has set.
const ALWAYS_VIEW_PAGES = ['home', 'dashboard'];

// Admin-only pages: system configuration (user accounts, automation rules, integration keys),
// never opened up to a non-admin login — not individually configurable like the business pages.
const ADMIN_ONLY_PAGES = ['users', 'automations', 'integrations'];

// Starting point applied when a new non-admin login is created, or when its role is changed:
// edit access to this role's traditional "home turf", view on everything else. Purely a
// convenience default from here on — an admin can then set any page to edit/view/none for that
// individual person from the Users & permissions page, and nothing keeps it in sync with role
// after that initial seed.
const DEFAULT_PRIMARY_PAGES = {
  pm: ['jobs', 'materials', 'items', 'schedule'],
  salesman: ['leads', 'pipeline', 'companies', 'contacts'],
  scheduler: ['calendar', 'schedule'],
  accounting: ['jobs'],
};

const VALID_LEVELS = ['edit', 'view', 'none'];

module.exports = { ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS };
