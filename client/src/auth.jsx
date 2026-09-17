import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    return api.me()
      .then((u) => setUser(u))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function login(username, password) {
    const u = await api.login(username, password);
    setUser(u);
    return u;
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** 'edit' | 'view' | 'none' for the given page, for whoever is signed in (or 'none' if signed out). */
export function usePermission(pageKey) {
  const { user } = useAuth();
  const level = (user && user.permissions && user.permissions[pageKey]) || 'none';
  return { level, canView: level !== 'none', canEdit: level === 'edit' };
}

/** 'edit' | 'view' for one of the fixed set of restrictable sub-page sections (e.g.
    'pipeline.about', 'jobs.billing' — see server/src/permissionsConfig.js's SECTIONS). Only
    meaningful within a page that's already 'edit' overall; a page-level 'view'/'none' already
    caps everything under it regardless of what this returns. Defaults to 'edit' (nothing
    restricted) if the section is missing, so a stale/older session payload fails open rather
    than silently locking someone out of a section no admin ever restricted. */
export function useSection(sectionKey) {
  const { user } = useAuth();
  const level = (user && user.sections && user.sections[sectionKey]) || 'edit';
  return level === 'edit';
}

/** Whether the signed-in login can see dollar figures anywhere in the app. Admins and any
    session that hasn't loaded yet default to true, so this fails open rather than flashing
    hidden-then-shown prices while /session/me is still in flight. */
export function usePriceVisibility() {
  const { user } = useAuth();
  return !user || user.can_see_prices !== false;
}

/** Wraps a route's element: shows a plain "you don't have access" card instead of the page when
    the signed-in role's permission for `page` is 'none'. Home/Dashboard never need this (every
    role can always view them). */
export function Protected({ page, children }) {
  const { level } = usePermission(page);
  if (level === 'none') {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
        <h2>Not available for your role</h2>
        <p className="sub">Your account doesn't have access to this section. Ask an admin if you think that's wrong.</p>
      </div>
    );
  }
  return children;
}
