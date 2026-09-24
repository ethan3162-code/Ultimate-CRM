import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import GlobalSearch from './GlobalSearch';

const NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Home', end: true, page: 'home' },
      { to: '/dashboard', label: 'Dashboard', page: 'dashboard' },
      { to: '/reports', label: 'Reports', page: 'reports' },
      // Internal team chat (Sept 2026) — a utility every active login can use, not one of the
      // individually-configurable business pages, so it's always shown regardless of `perms`.
      { to: '/messages', label: 'Messages', always: true },
    ],
  },
  {
    // Sept 2026 — Projects (and Transactions right after it) moved in here, right after
    // Opportunities, so the sidebar itself reads as the sales workflow the user described: Lead
    // -> book appointment -> Opportunity -> Estimate (written against the opportunity, before a
    // project exists) -> signed -> Project + Invoice (auto-created) -> Transaction.
    // Companies/Contacts/Conversations are supporting customer records rather than funnel
    // stages, so they stay listed after the funnel rather than between its steps.
    group: 'Sales',
    items: [
      { to: '/leads', label: 'Leads', page: 'leads' },
      { to: '/pipeline', label: 'Opportunities', page: 'pipeline' },
      // Sept 2026 — a unified kanban spanning Leads through Opportunities through Projects (two
      // separate data models, one board). Gated on the same 'pipeline' permission as Opportunities
      // itself, since it's the same sales-pipeline view just widened.
      { to: '/kanban', label: 'Pipeline', page: 'pipeline' },
      { to: '/estimates', label: 'Estimates', page: 'estimates' },
      // Not a business-object page permission like the others here — shown only to a login an
      // admin flagged "Can approve estimates" (Users & permissions), the same personal capability
      // that already gates the inline Approve/Reject buttons on the Estimates and Project pages.
      { to: '/estimate-approvals', label: 'Estimate approvals', requiresApprover: true },
      { to: '/jobs', label: 'Projects', page: 'jobs' },
      // Not one of the individually-configurable business pages — shown to admins, anyone flagged
      // "Sees commissions" (everyone's payouts), and any salesperson with a commission rate set
      // (their own payouts only), same personal-capability pattern as "Estimate approvals" above.
      { to: '/commissions', label: 'Commission payouts', requiresCommissions: true },
      { to: '/transactions', label: 'Transactions', page: 'transactions' },
      { to: '/companies', label: 'Companies', page: 'companies' },
      { to: '/contacts', label: 'Contacts', page: 'contacts' },
      // Customer texting (Sept 2026, Hatch-style) — gated on the same 'contacts' permission as
      // the Contacts page itself, since it's the same customer data.
      { to: '/conversations', label: 'Conversations', page: 'contacts' },
    ],
  },
  {
    group: 'Field ops',
    items: [
      { to: '/materials', label: 'Material calculator', page: 'materials' },
      { to: '/items', label: 'Price book', page: 'items' },
      { to: '/price-book', label: 'Items', page: 'price_book' },
      { to: '/employees', label: 'Employees', page: 'employees' },
      { to: '/subcontractors', label: 'Subcontractors', page: 'subcontractors' },
      { to: '/vehicles', label: 'Vehicles', page: 'vehicles', end: true },
      { to: '/vehicles/map', label: 'Fleet map', page: 'vehicles' },
    ],
  },
  {
    group: 'Scheduling',
    items: [
      { to: '/calendar', label: 'Appointments', page: 'calendar' },
      { to: '/needs-scheduling', label: 'Needs Scheduling', page: 'schedule' },
      { to: '/schedule', label: 'Project schedule', page: 'schedule' },
    ],
  },
  { group: 'Service', items: [{ to: '/tickets', label: 'Tickets', page: 'tickets' }] },
  {
    group: 'System',
    items: [
      { to: '/automations', label: 'Automations', page: 'automations' },
      { to: '/contracts', label: 'Contracts', page: 'contracts' },
      { to: '/integrations', label: 'Integrations', page: 'integrations' },
      { to: '/users', label: 'Users & permissions', page: 'users' },
    ],
  },
];

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [navOpen]);

  const perms = (user && user.permissions) || {};
  // Only show nav items/groups the signed-in role can at least view — a group whose every item
  // is hidden (e.g. all of "System" for a non-admin) disappears entirely rather than showing an
  // empty header.
  const visibleNav = NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.requiresApprover) return !!(user && user.can_approve_estimates);
        if (item.requiresCommissions) return !!(user && (user.can_see_commissions || Number(user.commission_percent) > 0));
        return item.always || (perms[item.page] || 'none') !== 'none';
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="hamburger"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-search"><GlobalSearch /></div>
      </header>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={'sidebar' + (navOpen ? ' open' : '')}>
        <div className="brand sidebar-brand">
          <img src="/logo-full.png" alt="Precision Paving & Masonry" className="brand-logo" />
        </div>
        {visibleNav.map((group) => (
          <nav className="nav-group" key={group.group}>
            <div className="kicker">{group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
              >
                <span className="dot" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        ))}
        {user && (
          <div className="nav-group" style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.username}</div>
                <div className="sub" style={{ margin: 0 }}>{user.roleLabel}</div>
              </div>
              <button className="btn sm subtle" onClick={logout}>Sign out</button>
            </div>
          </div>
        )}
      </aside>
      <div className="content-col">
        <div className="global-search-bar">
          <span aria-hidden="true" />
          <GlobalSearch />
          {user && <span className="global-search-bar-user" title={user.username}>{user.username}</span>}
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
