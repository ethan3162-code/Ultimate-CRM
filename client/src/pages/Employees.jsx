import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate } from '../utils';
import { usePermission } from '../auth';

const BLANK_FORM = { first_name: '', last_name: '', position: '', phone: '', email: '', hire_date: '', daily_rate: '', notes: '' };

export default function Employees() {
  const { canEdit } = usePermission('employees');
  const [employees, setEmployees] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [showInactive, setShowInactive] = useState(false);

  function load() {
    api.employees().then(setEmployees);
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    await api.createEmployee({ ...form, daily_rate: Number(form.daily_rate) || 0 });
    setForm(BLANK_FORM);
    setShowForm(false);
    load();
  }

  const visible = employees ? employees.filter((e) => showInactive || e.active) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Employees</h1>
          <p className="sub">Crew records, hire dates, pay rate, and documents on file — pay never shows on a customer estimate or invoice.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New employee</button>}
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>First name</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></div>
            <div className="field"><label>Position</label><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. Crew lead" /></div>
            <div className="field"><label>Hire date</label><input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Daily rate ($)</label><input type="number" min="0" step="0.01" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create employee</button></div>
          </form>
        </div>
      )}

      {!visible ? <div className="loading">Loading…</div> : (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <label className="sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          </div>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Name</th><th>Position</th><th>Hire date</th><th>Phone</th><th>Email</th><th>Daily rate</th><th>Status</th></tr></thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/employees/${e.id}`} className="link-strong">{e.first_name} {e.last_name}</Link></td>
                    <td className="muted">{e.position || '—'}</td>
                    <td className="muted">{shortDate(e.hire_date)}</td>
                    <td className="muted">{e.phone || '—'}</td>
                    <td className="muted">{e.email || '—'}</td>
                    <td className="mono">{money(e.daily_rate)}/day</td>
                    <td><span className={'pill ' + (e.active ? 'green' : 'red')}>{e.active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
