import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';

export default function Companies() {
  const [companies, setCompanies] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', phone: '', email: '', address: '' });

  function load() {
    api.companies().then(setCompanies);
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createCompany(form);
    setForm({ name: '', industry: '', phone: '', email: '', address: '' });
    setShowForm(false);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Companies</h1>
          <p className="sub">Accounts across sales, field jobs, and support all roll up here.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New company</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Industry</label><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create company</button></div>
          </form>
        </div>
      )}

      {!companies ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Company</th><th>Industry</th><th>Contacts</th><th>Open deals</th><th>Open pipeline value</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/companies/${c.id}`} className="link-strong">{c.name}</Link></td>
                  <td className="muted">{c.industry || '—'}</td>
                  <td>{c.contact_count}</td>
                  <td>{c.deal_count}</td>
                  <td className="mono">{money(c.open_pipeline_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
