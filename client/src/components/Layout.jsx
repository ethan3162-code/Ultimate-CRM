import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Home', end: true, page: 'home' },
      { to: '/dashboard', label: 'Dashboard', page: 'dashboard' },
      // Internal team chat (Sept 2026) — a utility every active login can use, not one of the
      // individually-configurable business pages, so it's always shown regardless of `perms`.
      { to: '/messages', label: 'Messages', always: true },
    ],
  },
  {
    group: 'Sales',
    items: [
      { to: '/leads', label: 'Leads', page: 'leads' },
      { to: '/pipeline', label: 'Opportunities', page: 'pipeline' },
      { to: '/companies', label: 'Companies', page: 'companies' },
      { to: '/contacts', label: 'Contacts', page: 'contacts' },
    ],
  },
  {
    group: 'Field ops',
    items: [
      { to: '/jobs', label: 'Projects & billing', page: 'jobs' },
      { to: '/materials', label: 'Material calculator', page: 'materials' },
      { to: '/items', label: 'Items & price book', page: 'items' },
    ],
  },
  {
    group: 'Scheduling',
    items: [
      { to: '/calendar', label: 'Appointments', page: 'calendar' },
      { to: '/schedule', label: 'Project schedule', page: 'schedule' },
    ],
  },
  { group: 'Service', items: [{ to: '/tickets', label: 'Tickets', page: 'tickets' }] },
  {
    group: 'System',
    items: [
      { to: '/automations', label: 'Automations', page: 'automations' },
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
    .map((group) => ({ ...group, items: group.items.filter((item) => item.always || (perms[item.page] || 'none') !== 'none') }))
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
        <div className="brand">
          <img src="/logo-full.png" alt="Precision Paving & Masonry" className="brand-logo" />
        </div>
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
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
