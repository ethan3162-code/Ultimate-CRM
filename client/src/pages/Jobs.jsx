import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { shortDate, dateTime, isoDate, money, accountName } from '../utils';
import { usePermission } from '../auth';

const STATUS_PILL = { pending_schedule: 'amber', accepted: '', scheduled: '', in_progress: 'amber', complete: 'green', on_hold: 'amber', cancelled: 'red' };
const STATUS_LABEL = {
  pending_schedule: 'Pending Schedule',
  accepted: 'Project Accepted', scheduled: 'Project Scheduled', in_progress: 'Project in Progress',
  complete: 'Project Complete', on_hold: 'Project On Hold', cancelled: 'Project Cancelled',
};

export default function Jobs() {
  const { canEdit } = usePermission('jobs');
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
          <h1>Projects</h1>
          <p className="sub">Every won opportunity becomes a project here — field jobs, estimates, invoices, and payments in one module.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New job</button>}
      </div>

      {showForm && canEdit && (
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
            <thead>
              <tr>
                <th>Project Name</th><th>Account Name</th><th>Project Status</th><th>Created Date</th>
                <th>Contract Amount</th><th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const account = accountName(j, j.title);
                const projName = `Project - ${account} - ${isoDate(j.created_at)}`;
                return (
                  <tr key={j.id}>
                    <td><Link to={`/jobs/${j.id}`} className="link-strong">{projName}</Link></td>
                    <td className="muted">{account}</td>
                    <td><span className={'pill ' + (STATUS_PILL[j.status] || '')}>{STATUS_LABEL[j.status] || j.status.replace('_', ' ')}</span></td>
                    <td className="muted">{dateTime(j.created_at)}</td>
                    <td className="mono">{j.contract_amount ? money(j.contract_amount) : '—'}</td>
                    <td className="muted">{shortDate(j.scheduled_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
