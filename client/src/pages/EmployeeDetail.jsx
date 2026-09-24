import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, dateTime, initials, fileToDataUrl } from '../utils';
import { usePermission } from '../auth';

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = usePermission('employees');
  const [employee, setEmployee] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [docLabel, setDocLabel] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  function load() {
    api.employee(id).then((e) => {
      setEmployee(e);
      setForm({
        position: e.position || '', phone: e.phone || '', email: e.email || '',
        hire_date: e.hire_date || '', daily_rate: e.daily_rate === null ? '' : e.daily_rate,
        notes: e.notes || '',
      });
    });
  }
  useEffect(load, [id]);

  async function saveInfo(e) {
    e.preventDefault();
    setSaving(true);
    await api.updateEmployee(id, { ...form, daily_rate: form.daily_rate === '' ? 0 : Number(form.daily_rate) });
    setSaving(false);
    setEditing(false);
    load();
  }

  async function toggleActive() {
    await api.updateEmployee(id, { active: employee.active ? 0 : 1 });
    load();
  }

  async function removeEmployee() {
    if (!window.confirm(`Delete ${employee.first_name} ${employee.last_name}? This can't be undone.`)) return;
    try {
      await api.deleteEmployee(id);
      navigate('/employees');
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function uploadDoc(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    try {
      const data_url = await fileToDataUrl(file);
      await api.addEmployeeDocument(id, { label: docLabel || file.name, file_name: file.name, data_url });
      setDocLabel('');
      load();
    } finally {
      setUploadingDoc(false);
    }
  }

  async function removeDoc(docId) {
    await api.deleteEmployeeDocument(docId);
    load();
  }

  if (!employee) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/employees">Employees</Link> / {employee.first_name} {employee.last_name}</p>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--purple-soft)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {initials(employee.first_name, employee.last_name)}
            </div>
            <div>
              <h1>{employee.first_name} {employee.last_name} <span className={'pill ' + (employee.active ? 'green' : 'red')} style={{ marginLeft: 8, verticalAlign: 'middle' }}>{employee.active ? 'Active' : 'Inactive'}</span></h1>
              <p className="sub">{employee.position || 'Employee'}{employee.hire_date ? ` · hired ${shortDate(employee.hire_date)}` : ''}</p>
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={toggleActive}>{employee.active ? 'Mark inactive' : 'Mark active'}</button>
            <button className="btn sm subtle" onClick={removeEmployee}>Delete</button>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card section-card accent-blue">
            <div className="row between" style={{ marginBottom: editing ? 10 : 6 }}>
              <h2 className="section-label" style={{ margin: 0 }}>Employee info</h2>
              {!editing && canEdit && <button className="btn sm subtle" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <form onSubmit={saveInfo} className="stack" style={{ gap: 10 }}>
                <div className="field"><label>Position</label><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                <div className="field"><label>Hire date</label><input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
                <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="field"><label>Daily rate ($)</label><input type="number" min="0" step="0.01" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
                <div className="field"><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditing(false); load(); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">Phone</span>{employee.phone ? <a href={`tel:${employee.phone}`}>{employee.phone}</a> : <span className="muted">—</span>}</div>
                <div className="row between"><span className="muted">Email</span>{employee.email ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : <span className="muted">—</span>}</div>
                <div className="row between"><span className="muted">Hire date</span><span>{shortDate(employee.hire_date)}</span></div>
                <div className="row between"><span className="muted">Daily rate</span><span className="mono">{money(employee.daily_rate)}/day</span></div>
                <div className="row between" style={{ alignItems: 'flex-start' }}><span className="muted">Notes</span><span style={{ textAlign: 'right' }}>{employee.notes || '—'}</span></div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ marginBottom: 4 }}>Documents</h2>
              {canEdit && (
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  {uploadingDoc ? 'Uploading…' : '+ Add document'}
                  <input type="file" onChange={uploadDoc} disabled={uploadingDoc} style={{ display: 'none' }} />
                </label>
              )}
            </div>
            {canEdit && (
              <div className="field" style={{ marginBottom: 10, maxWidth: 320 }}>
                <label>Label for next upload</label>
                <input value={docLabel} onChange={(e) => setDocLabel(e.target.value)} placeholder="e.g. I-9, W-4, driver's license" />
              </div>
            )}
            {employee.documents.length === 0 ? <div className="empty">No documents on file yet.</div> : (
              <div className="stack" style={{ gap: 2 }}>
                {employee.documents.map((d) => (
                  <div key={d.id} className="attention-row">
                    <a href={d.data_url} target="_blank" rel="noreferrer">{d.label}{d.file_name ? ` (${d.file_name})` : ''}</a>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="muted" style={{ fontSize: 12 }}>{shortDate(d.created_at)}</span>
                      {canEdit && <button type="button" className="btn subtle sm" onClick={() => removeDoc(d.id)}>✕</button>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card section-card" style={{ borderLeftColor: 'var(--line)' }}>
            <h2 className="section-label" style={{ color: 'var(--muted)' }}>Attendance summary</h2>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between"><span className="muted">Days worked</span><span className="mono">{employee.daysWorked}</span></div>
              <div className="row between"><span className="muted">Total pay</span><span className="mono">{money(employee.totalPay)}</span></div>
            </div>
          </div>

          <div className="card">
            <h2>Attendance history</h2>
            {employee.attendance.length === 0 ? <div className="empty">Not logged on any project yet.</div> : (
              <div className="stack" style={{ gap: 2 }}>
                {employee.attendance.map((a) => (
                  <div key={a.id} className="row between" style={{ padding: '6px 0' }}>
                    <span><Link to={`/jobs/${a.job_id}`}>{a.job_title}</Link> <span className="muted" style={{ marginLeft: 6 }}>{shortDate(a.work_date)}</span></span>
                    <span className="mono">{money(a.daily_rate)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Activity</h2>
            {employee.activities.length === 0 ? <div className="empty">Nothing logged yet.</div> : (
              <div className="timeline">
                {employee.activities.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div className="when">{dateTime(a.created_at)}</div>
                    <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
