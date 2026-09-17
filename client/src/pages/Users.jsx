import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';

const BLANK_FORM = { username: '', password: '', role: 'user' };
const BLANK_ROLE_FORM = { name: '' };
const LEVELS = [
  { key: 'edit', label: 'Edit' },
  { key: 'view', label: 'View' },
  { key: 'none', label: 'None' },
];
const SECTION_LEVELS = [
  { key: 'edit', label: 'Edit' },
  { key: 'view', label: 'View only' },
];
const LEVEL_PILL = { edit: 'green', view: 'amber', none: 'red' };

export default function Users() {
  const [data, setData] = useState(null); // { users, roles, pages, sections, customRoles }
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [permEditingId, setPermEditingId] = useState(null);
  const [permDraft, setPermDraft] = useState(null);
  const [sectionDraft, setSectionDraft] = useState(null);
  const [roleIdsDraft, setRoleIdsDraft] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState(BLANK_ROLE_FORM);
  const [roleError, setRoleError] = useState('');
  const [roleEditingId, setRoleEditingId] = useState(null);
  const [rolePermDraft, setRolePermDraft] = useState(null);
  const [roleSectionDraft, setRoleSectionDraft] = useState(null);
  const [savingRole, setSavingRole] = useState(false);

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

  async function toggleAdmin(user) {
    const makingAdmin = user.role !== 'admin';
    const msg = makingAdmin
      ? `Make ${user.username} an admin? Admins have full access to everything, so their individual page permissions, sections, roles, and price visibility no longer apply.`
      : `Remove admin from ${user.username}? They'll go back to a regular login with nothing but Home/Dashboard — you'll need to turn pages back on for them from "Permissions" below.`;
    if (!window.confirm(msg)) return;
    await api.updateUser(user.id, { role: makingAdmin ? 'admin' : 'user' }).catch((err) => window.alert(err.message));
    load();
  }

  async function togglePrices(user) {
    await api.updateUser(user.id, { can_see_prices: !user.can_see_prices }).catch((err) => window.alert(err.message));
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
    // Seed from this person's own direct settings, not the role-combined effective values in
    // user.permissions/user.sections — otherwise saving this panel for any reason (even just
    // toggling a role checkbox) would bake every role's grants into their individual row, and a
    // role could never be safely removed again.
    setPermDraft({ ...user.direct_permissions });
    setSectionDraft({ ...user.direct_sections });
    setRoleIdsDraft([...(user.custom_role_ids || [])]);
  }

  async function savePerms(user) {
    setSavingPerms(true);
    try {
      await api.updateUserPermissions(user.id, permDraft);
      await api.updateUserSections(user.id, sectionDraft);
      await api.updateUserRoles(user.id, roleIdsDraft);
      setPermEditingId(null);
      setPermDraft(null);
      setSectionDraft(null);
      setRoleIdsDraft([]);
      load();
    } catch (err) {
      window.alert(err.message);
    }
    setSavingPerms(false);
  }

  // --- Roles (reusable, stackable permission templates) ---
  function startNewRole() {
    setShowRoleForm(true);
    setRoleForm(BLANK_ROLE_FORM);
    setRoleError('');
  }

  async function submitRole(e) {
    e.preventDefault();
    setRoleError('');
    if (!roleForm.name.trim()) return;
    try {
      await api.createRole({ name: roleForm.name.trim() });
      setRoleForm(BLANK_ROLE_FORM);
      setShowRoleForm(false);
      load();
    } catch (err) {
      setRoleError(err.message);
    }
  }

  function startEditRole(role) {
    setRoleEditingId(role.id);
    setRolePermDraft({ ...role.permissions });
    setRoleSectionDraft({ ...role.sections });
  }

  async function saveRole(role) {
    setSavingRole(true);
    try {
      await api.updateRole(role.id, { permissions: rolePermDraft, sections: roleSectionDraft });
      setRoleEditingId(null);
      setRolePermDraft(null);
      setRoleSectionDraft(null);
      load();
    } catch (err) {
      window.alert(err.message);
    }
    setSavingRole(false);
  }

  async function removeRole(role) {
    if (!window.confirm(`Delete the "${role.name}" role? Anyone currently holding it loses whatever access it granted (their own individual permissions are untouched).`)) return;
    await api.deleteRole(role.id).catch((err) => window.alert(err.message));
    load();
  }

  if (!data) return <div className="loading">Loading…</div>;
  const { users, pages, sections, customRoles } = data;
  const pageKeys = Object.keys(pages);
  const sectionKeys = Object.keys(sections || {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users &amp; permissions</h1>
          <p className="sub">Logins for the team, exactly which pages (and parts of a page) each person can edit, view, or not see, whether they can see dollar figures, and which reusable roles they hold.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New login</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" required /></div>
            <div className="field"><label>Temporary password</label><input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" required /></div>
            <div className="field" style={{ justifyContent: 'center' }}>
              <label style={{ visibility: 'hidden' }}>Admin</label>
              <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox" id="new_user_admin" style={{ width: 'auto' }}
                  checked={form.role === 'admin'}
                  onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'user' })}
                />
                <label htmlFor="new_user_admin" style={{ margin: 0, fontWeight: 500 }}>Admin (full access to everything)</label>
              </span>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create login</button></div>
          </form>
          {error && <div className="sub" style={{ color: 'var(--red)' }}>{error}</div>}
          <p className="sub" style={{ margin: '10px 0 0' }}>
            Everyone's a regular login by default, starting with nothing but Home/Dashboard — name them, then turn on exactly the pages this person needs from "Permissions" below. Give two people the same set of pages, or the same role, if they should share access.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row between" style={{ alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Roles</h2>
            <p className="sub" style={{ margin: '2px 0 0' }}>Reusable, named bundles of page/section permissions. Hand one to any number of logins — a login can hold more than one at once, and its access is the most-permissive combination of everything it holds plus its own individual overrides below.</p>
          </div>
          <button className="btn sm subtle" onClick={startNewRole}>+ New role</button>
        </div>

        {showRoleForm && (
          <form onSubmit={submitRole} className="row" style={{ gap: 8, marginBottom: 12 }}>
            <input value={roleForm.name} onChange={(e) => setRoleForm({ name: e.target.value })} placeholder="e.g. Scheduler, Sales, Accounting" required style={{ maxWidth: 260 }} />
            <button className="btn primary sm" type="submit">Create</button>
            <button className="btn sm subtle" type="button" onClick={() => setShowRoleForm(false)}>Cancel</button>
          </form>
        )}
        {roleError && <div className="sub" style={{ color: 'var(--red)' }}>{roleError}</div>}

        {(!customRoles || customRoles.length === 0) ? (
          <div className="empty">No roles yet — everyone's access comes from their own individual permissions below.</div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {customRoles.map((role) => (
              <div key={role.id} className="card" style={{ background: 'var(--paper-raised)' }}>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <div>
                    <strong>{role.name}</strong>
                    <span className="sub" style={{ marginLeft: 8 }}>
                      {role.members.length === 0 ? 'held by no one' : `held by ${role.members.map((m) => m.username).join(', ')}`}
                    </span>
                  </div>
                  <span className="row" style={{ gap: 6 }}>
                    {roleEditingId === role.id ? (
                      <>
                        <button className="btn primary sm" disabled={savingRole} onClick={() => saveRole(role)}>{savingRole ? 'Saving…' : 'Save role'}</button>
                        <button className="btn sm subtle" onClick={() => { setRoleEditingId(null); setRolePermDraft(null); setRoleSectionDraft(null); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn sm subtle" onClick={() => startEditRole(role)}>Edit</button>
                        <button className="btn sm subtle" onClick={() => removeRole(role)}>Delete</button>
                      </>
                    )}
                  </span>
                </div>
                {roleEditingId === role.id && rolePermDraft && (
                  <div style={{ marginTop: 10 }}>
                    <div className="stack" style={{ gap: 6 }}>
                      {pageKeys.map((key) => (
                        <div key={key} className="row between" style={{ alignItems: 'center' }}>
                          <span>{pages[key]}</span>
                          <span className="row" style={{ gap: 4 }}>
                            {LEVELS.map((lvl) => (
                              <button
                                key={lvl.key} type="button"
                                className={'btn sm' + (rolePermDraft[key] === lvl.key ? ' primary' : '')}
                                onClick={() => setRolePermDraft((d) => ({ ...d, [key]: lvl.key }))}
                              >
                                {lvl.label}
                              </button>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                    {sectionKeys.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                        <p className="sub" style={{ margin: '0 0 6px' }}>Section overrides — restrict one part of an otherwise-editable page. Leave at "Edit" to just inherit the page-level setting above.</p>
                        <div className="stack" style={{ gap: 6 }}>
                          {sectionKeys.map((key) => (
                            <div key={key} className="row between" style={{ alignItems: 'center' }}>
                              <span className="sub" style={{ margin: 0 }}>{sections[key].label}</span>
                              <span className="row" style={{ gap: 4 }}>
                                {SECTION_LEVELS.map((lvl) => (
                                  <button
                                    key={lvl.key} type="button"
                                    className={'btn sm' + ((roleSectionDraft[key] || 'edit') === lvl.key ? ' primary' : '')}
                                    onClick={() => setRoleSectionDraft((d) => ({ ...d, [key]: lvl.key }))}
                                  >
                                    {lvl.label}
                                  </button>
                                ))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Logins</h2>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Prices</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td className="link-strong">{u.username}</td>
                    <td>
                      <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <span className={'pill ' + (u.role === 'admin' ? 'green' : 'blue')}>{u.role === 'admin' ? 'Admin' : 'User'}</span>
                        <button className="btn sm subtle" onClick={() => toggleAdmin(u)}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
                      </span>
                    </td>
                    <td><span className={'pill ' + (u.active ? 'green' : 'red')}>{u.active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      {u.role === 'admin' ? <span className="muted">always</span> : (
                        <button className="btn sm subtle" onClick={() => togglePrices(u)}>
                          {u.can_see_prices ? '💲 Can see' : '🔒 Hidden'}
                        </button>
                      )}
                    </td>
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
                      <td colSpan={6} style={{ background: 'var(--paper-raised)' }}>
                        <div style={{ padding: '10px 4px' }}>
                          <p className="sub" style={{ margin: '0 0 10px' }}>
                            Exactly what <strong>{u.username}</strong> can do on each page — nothing here is tied to their role after the fact, so any combination is fine. Any role held below can only add access on top of this, never take it away.
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

                          {sectionKeys.length > 0 && (
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
                              <p className="sub" style={{ margin: '0 0 6px' }}>
                                Section overrides — restrict this person's editing to just one part of an otherwise-editable page (e.g. they can edit a deal's notes but not its value, or a job's schedule but not its billing). Leave at "Edit" to just inherit the page setting above.
                              </p>
                              <div className="stack" style={{ gap: 6 }}>
                                {sectionKeys.map((key) => (
                                  <div key={key} className="row between" style={{ alignItems: 'center' }}>
                                    <span className="sub" style={{ margin: 0 }}>{sections[key].label}</span>
                                    <span className="row" style={{ gap: 4 }}>
                                      {SECTION_LEVELS.map((lvl) => (
                                        <button
                                          key={lvl.key}
                                          type="button"
                                          className={'btn sm' + ((sectionDraft[key] || 'edit') === lvl.key ? ' primary' : '')}
                                          onClick={() => setSectionDraft((d) => ({ ...d, [key]: lvl.key }))}
                                        >
                                          {lvl.label}
                                        </button>
                                      ))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {customRoles && customRoles.length > 0 && (
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
                              <p className="sub" style={{ margin: '0 0 6px' }}>Roles held — pick as many as apply; their access stacks on top of the individual settings above.</p>
                              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                                {customRoles.map((role) => (
                                  <label key={role.id} className="row" style={{ gap: 6, alignItems: 'center' }}>
                                    <input
                                      type="checkbox" style={{ width: 'auto' }}
                                      checked={roleIdsDraft.includes(role.id)}
                                      onChange={(e) => setRoleIdsDraft((ids) => (e.target.checked ? [...ids, role.id] : ids.filter((id) => id !== role.id)))}
                                    />
                                    {role.name}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="row" style={{ gap: 8, marginTop: 14 }}>
                            <button className="btn primary sm" disabled={savingPerms} onClick={() => savePerms(u)}>{savingPerms ? 'Saving…' : 'Save permissions'}</button>
                            <button className="btn sm subtle" onClick={() => { setPermEditingId(null); setPermDraft(null); setSectionDraft(null); setRoleIdsDraft([]); }}>Cancel</button>
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
