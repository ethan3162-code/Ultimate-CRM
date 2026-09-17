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
