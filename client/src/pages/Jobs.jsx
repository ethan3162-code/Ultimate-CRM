import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { shortDate } from '../utils';

const STATUS_PILL = { scheduled: '', in_progress: 'amber', completed: 'green', cancelled: 'red' };

export default function Jobs() {
  const [jobs, setJobs] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', address: '', scheduled_date: '', contact_id: '' });

  function load() {
    api.jobs().then(setJobs);
  }
  useEffect(() => { load(); api.contacts().then(setContacts); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const contact = contacts.find((c) => String(c.id) === String(form.contact_id));
    await api.createJob({
      title: form.title,
      address: form.address,
      scheduled_date: form.scheduled_date || null,
      contact_id: form.contact_id || null,
      company_id: contact ? contact.company_id : null,
    });
    setForm({ title: '', address: '', scheduled_date: '', contact_id: '' });
    setShowForm(false);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jobs &amp; billing</h1>
          <p className="sub">Field jobs, estimates, invoices, and payments — the module a sales-only CRM never had.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New job</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Job title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
            <div className="field">
              <label>Contact</label>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div className="field"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="field"><label>Scheduled date</label><input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create job</button></div>
          </form>
        </div>
      )}

      {!jobs ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Job</th><th>Customer</th><th>Status</th><th>Scheduled</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><Link to={`/jobs/${j.id}`} className="link-strong">{j.title}</Link></td>
                  <td className="muted">{j.company_name || (j.first_name ? `${j.first_name} ${j.last_name}` : '—')}</td>
                  <td><span className={'pill ' + (STATUS_PILL[j.status] || '')}>{j.status.replace('_', ' ')}</span></td>
                  <td className="muted">{shortDate(j.scheduled_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
