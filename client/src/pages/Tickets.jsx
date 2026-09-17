import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { shortDate } from '../utils';
import { usePermission } from '../auth';

const PRIORITY_PILL = { low: '', medium: '', high: 'amber', urgent: 'red' };
const STATUS_PILL = { open: 'amber', pending: '', resolved: 'green', closed: 'green' };

function slaLabel(ticket) {
  if (['resolved', 'closed'].includes(ticket.status)) return null;
  const due = new Date(ticket.sla_due_at.replace(' ', 'T') + 'Z');
  const hoursLeft = Math.round((due.getTime() - Date.now()) / 3600000);
  if (hoursLeft < 0) return { text: `${Math.abs(hoursLeft)}h over SLA`, breached: true };
  if (hoursLeft < 24) return { text: `${hoursLeft}h left on SLA`, breached: false };
  return { text: `${Math.round(hoursLeft / 24)}d left on SLA`, breached: false };
}

export default function Tickets() {
  const { canEdit } = usePermission('tickets');
  const [tickets, setTickets] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium', contact_id: '' });

  function load() {
    api.tickets().then(setTickets);
  }
  useEffect(() => { load(); api.contacts().then(setContacts); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.subject.trim()) return;
    const contact = contacts.find((c) => String(c.id) === String(form.contact_id));
    await api.createTicket({ ...form, contact_id: form.contact_id || null, company_id: contact ? contact.company_id : null });
    setForm({ subject: '', description: '', priority: 'medium', contact_id: '' });
    setShowForm(false);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Service &amp; tickets</h1>
          <p className="sub">Support issues on the same record as the deal or job that created the customer — with SLA timers by priority.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New ticket</button>}
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Description</label><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="field">
              <label>Contact</label>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low (7 day SLA)</option>
                <option value="medium">Medium (3 day SLA)</option>
                <option value="high">High (1 day SLA)</option>
                <option value="urgent">Urgent (4 hour SLA)</option>
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Open ticket</button></div>
          </form>
        </div>
      )}

      {!tickets ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Subject</th><th>Customer</th><th>Priority</th><th>Status</th><th>SLA</th></tr></thead>
            <tbody>
              {tickets.map((t) => {
                const sla = slaLabel(t);
                return (
                  <tr key={t.id}>
                    <td><Link to={`/tickets/${t.id}`} className="link-strong">{t.subject}</Link></td>
                    <td className="muted">{t.company_name || (t.first_name ? `${t.first_name} ${t.last_name}` : '—')}</td>
                    <td><span className={'pill ' + (PRIORITY_PILL[t.priority] || '')}>{t.priority}</span></td>
                    <td><span className={'pill ' + (STATUS_PILL[t.status] || '')}>{t.status}</span></td>
                    <td className="mono" style={{ fontSize: 12, color: sla?.breached ? 'var(--red)' : 'var(--muted)' }}>{sla ? sla.text : shortDate(t.resolved_at)}</td>
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
