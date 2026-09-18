import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePermission } from '../auth';

const BLANK_FORM = { name: '', trade: '', contact_name: '', phone: '', email: '', notes: '' };
const STATUS_PILL = { expired: 'red', expiring: 'amber', ok: 'green', none: '' };
const STATUS_LABEL = { expired: 'Doc expired', expiring: 'Expiring soon', ok: 'Docs current', none: 'No docs on file' };

export default function Subcontractors() {
  const { canEdit } = usePermission('subcontractors');
  const [subs, setSubs] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [showInactive, setShowInactive] = useState(false);

  function load() {
    api.subcontractors().then(setSubs);
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createSubcontractor(form);
    setForm(BLANK_FORM);
    setShowForm(false);
    load();
  }

  const visible = subs ? subs.filter((s) => showInactive || s.active) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Subcontractors</h1>
          <p className="sub">Trades you sub out to, with insurance/license expiry tracked automatically — the office gets notified before anything lapses.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New subcontractor</button>}
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Company name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Trade</label><input value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} placeholder="e.g. Electrical" /></div>
            <div className="field"><label>Contact name</label><input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create subcontractor</button></div>
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
              <thead><tr><th>Company</th><th>Trade</th><th>Contact</th><th>Phone</th><th>Email</th><th>Compliance</th></tr></thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/subcontractors/${s.id}`} className="link-strong">{s.name}</Link></td>
                    <td className="muted">{s.trade || '—'}</td>
                    <td className="muted">{s.contact_name || '—'}</td>
                    <td className="muted">{s.phone || '—'}</td>
                    <td className="muted">{s.email || '—'}</td>
                    <td><span className={'pill ' + STATUS_PILL[s.compliance_status]}>{STATUS_LABEL[s.compliance_status]}</span></td>
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
