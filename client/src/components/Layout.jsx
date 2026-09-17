import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Home', end: true }, { to: '/dashboard', label: 'Dashboard' }] },
  {
    group: 'Sales',
    items: [
      { to: '/leads', label: 'Leads' },
      { to: '/pipeline', label: 'Opportunities' },
      { to: '/companies', label: 'Companies' },
      { to: '/contacts', label: 'Contacts' },
    ],
  },
  { group: 'Field ops', items: [{ to: '/jobs', label: 'Projects & billing' }, { to: '/materials', label: 'Material calculator' }, { to: '/items', label: 'Items & price book' }] },
  {
    group: 'Scheduling',
    items: [
      { to: '/calendar', label: 'Appointments' },
      { to: '/schedule', label: 'Project schedule' },
    ],
  },
  { group: 'Service', items: [{ to: '/tickets', label: 'Tickets' }] },
  { group: 'System', items: [{ to: '/automations', label: 'Automations' }, { to: '/integrations', label: 'Integrations' }] },
];

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [navOpen]);

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
          <div className="mark">U</div>
          <div className="name">Ultimate CRM</div>
        </div>
      </header>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={'sidebar' + (navOpen ? ' open' : '')}>
        <div className="brand sidebar-brand">
          <div className="mark">U</div>
          <div className="name">Ultimate CRM</div>
        </div>
        {NAV.map((group) => (
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
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
