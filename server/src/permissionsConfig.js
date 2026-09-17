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
// starts at 'none' except Home/Dashboard, and the admin turns on view/edit per page per person
// from the Users & permissions page). Two logins can simply be given the same set of page
// permissions; nothing needs a shared "role" for that.

const ROLES = ['admin', 'user'];
const ROLE_LABEL = {
  admin: 'Admin',
  user: 'User',
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

// Starting point applied when a new regular ('user') login is created: nothing but the always-
// view pages. There's no role to infer a "home turf" from any more — the admin names the person
// and turns on whichever pages they actually need, one at a time, from the Users & permissions
// page. Kept as a map (rather than inlining an empty set in auth.js) in case a future account
// type ever wants a different starting point.
const DEFAULT_PRIMARY_PAGES = {
  user: [],
};

const VALID_LEVELS = ['edit', 'view', 'none'];

module.exports = { ROLES, ROLE_LABEL, PAGES, ALWAYS_VIEW_PAGES, ADMIN_ONLY_PAGES, DEFAULT_PRIMARY_PAGES, VALID_LEVELS };
