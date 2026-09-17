import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';

const BLANK_FORM = { username: '', password: '', role: 'pm' };
const LEVELS = [
  { key: 'edit', label: 'Edit' },
  { key: 'view', label: 'View' },
  { key: 'none', label: 'None' },
];
const LEVEL_PILL = { edit: 'green', view: 'amber', none: 'red' };

export default function Users() {
  const [data, setData] = useState(null); // { users, roles, pages }
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [permEditingId, setPermEditingId] = useState(null);
  const [permDraft, setPermDraft] = useState(null);
  const [savingPerms, setSavingPerms] = useState(false);

  function load() {
    api.users().then(setData);
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.password) return;
    try {
      await api.createUser(form);
      setForm(BLANK_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(user) {
    await api.updateUser(user.id, { active: !user.active }).catch((err) => window.alert(err.message));
    load();
  }

  async function changeRole(user, role) {
    if (!window.confirm(`Change ${user.username}'s role to this? Their individual page permissions will reset to the defaults for the new role — you can re-customize them afterward.`)) return;
    await api.updateUser(user.id, { role }).catch((err) => window.alert(err.message));
    load();
  }

  async function saveReset(user) {
    if (!resetPassword || resetPassword.length < 6) return;
    await api.updateUser(user.id, { password: resetPassword }).catch((err) => window.alert(err.message));
    setEditingId(null);
    setResetPassword('');
    load();
  }

  async function removeUser(user) {
    await api.deleteUser(user.id).catch((err) => window.alert(err.message));
    load();
  }

  function startEditPerms(user) {
    setPermEditingId(user.id);
    setPermDraft({ ...user.permissions });
  }

  async function savePerms(user) {
    setSavingPerms(true);
    try {
      await api.updateUserPermissions(user.id, permDraft);
      setPermEditingId(null);
      setPermDraft(null);
      load();
    } catch (err) {
      window.alert(err.message);
    }
    setSavingPerms(false);
  }

  if (!data) return <div className="loading">Loading…</div>;
  const { users, roles, pages } = data;
  const pageKeys = Object.keys(pages);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users &amp; permissions</h1>
          <p className="sub">Logins for the team, and exactly which pages each person can edit, view, or not see at all.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New login</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" required /></div>
            <div className="field"><label>Temporary password</label><input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" required /></div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create login</button></div>
          </form>
          {error && <div className="sub" style={{ color: 'var(--red)' }}>{error}</div>}
          <p className="sub" style={{ margin: '10px 0 0' }}>
            Role just picks a sensible starting set of page permissions — you can customize every page individually for this person afterward from "Permissions" below.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Logins</h2>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td className="link-strong">{u.username}</td>
                    <td>
                      {u.role === 'admin' ? <span className="pill green">Admin</span> : (
                        <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                          {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td><span className={'pill ' + (u.active ? 'green' : 'red')}>{u.active ? 'Active' : 'Disabled'}</span></td>
                    <td className="muted">{u.created_at ? u.created_at.slice(0, 10) : '—'}</td>
                    <td>
                      {editingId === u.id ? (
                        <span className="row" style={{ gap: 6 }}>
                          <input type="text" placeholder="New password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} style={{ width: 140 }} />
                          <button className="btn sm primary" onClick={() => saveReset(u)}>Save</button>
                          <button className="btn sm subtle" onClick={() => { setEditingId(null); setResetPassword(''); }}>Cancel</button>
                        </span>
                      ) : (
                        <span className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {u.role !== 'admin' && (
                            <button className="btn sm subtle" onClick={() => (permEditingId === u.id ? setPermEditingId(null) : startEditPerms(u))}>
                              {permEditingId === u.id ? 'Close permissions' : 'Permissions'}
                            </button>
                          )}
                          <button className="btn sm subtle" onClick={() => { setEditingId(u.id); setResetPassword(''); }}>Reset password</button>
                          <button className="btn sm subtle" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                          <button className="btn sm subtle" onClick={() => removeUser(u)}>Delete</button>
                        </span>
                      )}
                    </td>
                  </tr>
                  {permEditingId === u.id && permDraft && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--paper-raised)' }}>
                        <div style={{ padding: '10px 4px' }}>
                          <p className="sub" style={{ margin: '0 0 10px' }}>
                            Exactly what <strong>{u.username}</strong> can do on each page — nothing here is tied to their role after the fact, so any combination is fine.
                          </p>
                          <div className="stack" style={{ gap: 6 }}>
                            {pageKeys.map((key) => (
                              <div key={key} className="row between" style={{ alignItems: 'center' }}>
                                <span>{pages[key]}</span>
                                <span className="row" style={{ gap: 4 }}>
                                  {LEVELS.map((lvl) => (
                                    <button
                                      key={lvl.key}
                                      type="button"
                                      className={'btn sm' + (permDraft[key] === lvl.key ? ' primary' : '')}
                                      onClick={() => setPermDraft((d) => ({ ...d, [key]: lvl.key }))}
                                    >
                                      {lvl.label}
                                    </button>
                                  ))}
                                  <span className={'pill ' + (LEVEL_PILL[permDraft[key]] || '')} style={{ minWidth: 44, textAlign: 'center' }}>{permDraft[key]}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="row" style={{ gap: 8, marginTop: 14 }}>
                            <button className="btn primary sm" disabled={savingPerms} onClick={() => savePerms(u)}>{savingPerms ? 'Saving…' : 'Save permissions'}</button>
                            <button className="btn sm subtle" onClick={() => { setPermEditingId(null); setPermDraft(null); }}>Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
