import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { initials, mapLinks } from '../utils';

export default function Contacts() {
  const [contacts, setContacts] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', title: '', company_id: '', address: '' });

  function load() {
    api.contacts().then(setContacts);
  }
  useEffect(() => { load(); api.companies().then(setCompanies); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    await api.createContact({ ...form, company_id: form.company_id || null });
    setForm({ first_name: '', last_name: '', email: '', phone: '', title: '', company_id: '', address: '' });
    setShowForm(false);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <p className="sub">Every person, with their deals, jobs, and activity on one timeline.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New contact</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>First name</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city, state" /></div>
            <div className="field">
              <label>Company</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">— none —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create contact</button></div>
          </form>
        </div>
      )}

      {!contacts ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th></th><th>Name</th><th>Title</th><th>Company</th><th>Email</th><th>Phone</th><th>Address</th></tr></thead>
            <tbody>
              {contacts.map((c) => {
                const links = c.address ? mapLinks(c.address) : null;
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                        {initials(c.first_name, c.last_name)}
                      </div>
                    </td>
                    <td><Link to={`/contacts/${c.id}`} className="link-strong">{c.first_name} {c.last_name}</Link></td>
                    <td className="muted">{c.title || '—'}</td>
                    <td>{c.company_name || '—'}</td>
                    <td className="muted">{c.email || '—'}</td>
                    <td className="muted">{c.phone || '—'}</td>
                    <td className="muted">
                      {links ? <a href={links.view} target="_blank" rel="noreferrer" className="map-link" title="View on Google Maps (satellite)">📍 {c.address}</a> : '—'}
                    </td>
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
