import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, initials, mapLinks } from '../utils';
import { LEAD_SOURCES } from '../constants';
import TaskList from '../components/TaskList';
import AppointmentModal from '../components/AppointmentModal';
import { usePermission } from '../auth';

const STAGE_PILL = { new: '', qualified: '', proposal: 'amber', negotiation: 'amber', won: 'green', lost: 'red' };
const TICKET_PILL = { open: 'blue', pending: 'amber', resolved: 'green', closed: 'green' };

export default function ContactDetail() {
  const { id } = useParams();
  const { canEdit } = usePermission('contacts');
  const [contact, setContact] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState({ phone: '', mobile_phone: '', email: '', address: '', source: '' });
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);

  function load() {
    api.contact(id).then((c) => {
      setContact(c);
      setInfo({ phone: c.phone || '', mobile_phone: c.mobile_phone || '', email: c.email || '', address: c.address || '', source: c.source || '' });
    });
  }
  useEffect(load, [id]);
  useEffect(() => { api.usersDirectory().then(setDirectory).catch(() => setDirectory([])); }, []);

  async function saveInfo(e) {
    e.preventDefault();
    setSaving(true);
    await api.updateContact(id, info);
    setSaving(false);
    setEditing(false);
    load();
  }

  async function saveOwner(e) {
    const owner_user_id = e.target.value ? Number(e.target.value) : null;
    setSavingOwner(true);
    await api.updateContact(id, { owner_user_id }).catch((err) => window.alert(err.message));
    setSavingOwner(false);
    load();
  }

  async function scheduleAppointment(payload) {
    await api.createAppointment({ ...payload, contact_id: contact.id, company_id: contact.company_id || null });
    setScheduling(false);
    load();
  }

  if (!contact) return <div className="loading">Loading…</div>;

  const links = contact.address ? mapLinks(contact.address) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/contacts">Contacts</Link> / {contact.first_name} {contact.last_name}</p>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--purple-soft)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {initials(contact.first_name, contact.last_name)}
            </div>
            <div>
              <h1>{contact.first_name} {contact.last_name} {contact.source && <span className="pill" style={{ marginLeft: 8, verticalAlign: 'middle' }}>{contact.source}</span>}</h1>
              <p className="sub">{contact.title || 'Contact'}{contact.company_name ? ` at ${contact.company_name}` : ''}{contact.email ? ` · ${contact.email}` : ''}</p>
            </div>
          </div>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setScheduling(true)}>📅 Schedule appointment</button>}
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card section-card accent-blue">
            <div className="row between" style={{ marginBottom: editing ? 10 : 6 }}>
              <h2 className="section-label" style={{ margin: 0 }}>Get in touch</h2>
              {!editing && canEdit && <button className="btn sm subtle" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <form onSubmit={saveInfo} className="stack" style={{ gap: 10 }}>
                <div className="field"><label>Phone</label><input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></div>
                <div className="field"><label>Mobile</label><input value={info.mobile_phone} onChange={(e) => setInfo({ ...info, mobile_phone: e.target.value })} /></div>
                <div className="field"><label>Email</label><input type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} /></div>
                <div className="field"><label>Mailing address</label><input value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} placeholder="Street, city, state" /></div>
                <div className="field">
                  <label>Lead source</label>
                  <select value={info.source} onChange={(e) => setInfo({ ...info, source: e.target.value })}>
                    <option value="">— none —</option>
                    {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    {info.source && !LEAD_SOURCES.includes(info.source) && <option value={info.source}>{info.source}</option>}
                  </select>
                  <p className="sub" style={{ margin: '4px 0 0' }}>This person's own source. Each of their deals also records its own source, separately — changing one doesn't change the other.</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditing(false); setInfo({ phone: contact.phone || '', mobile_phone: contact.mobile_phone || '', email: contact.email || '', address: contact.address || '', source: contact.source || '' }); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">Phone</span>{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <span className="muted">—</span>}</div>
                <div className="row between"><span className="muted">Mobile</span>{contact.mobile_phone ? <a href={`tel:${contact.mobile_phone}`}>{contact.mobile_phone}</a> : <span className="muted">—</span>}</div>
                <div className="row between"><span className="muted">Email</span>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span className="muted">—</span>}</div>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span className="muted">Mailing address</span>
                  <span style={{ textAlign: 'right' }}>{contact.address || '—'}</span>
                </div>
                {links && (
                  <a href={links.view} target="_blank" rel="noreferrer" className="btn sm primary map-cta" style={{ marginTop: 6 }}>
                    🛰️ View satellite location →
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="card section-card accent-purple">
            <h2 className="section-label">About</h2>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between"><span className="muted">Name</span><span>{contact.first_name} {contact.last_name}</span></div>
              <div className="row between"><span className="muted">Title</span><span>{contact.title || '—'}</span></div>
              <div className="row between"><span className="muted">Account</span>{contact.company_id ? <Link to={`/companies/${contact.company_id}`}>{contact.company_name}</Link> : <span className="muted">—</span>}</div>
              <div className="row between" style={{ alignItems: 'center' }}>
                <span className="muted">Owner</span>
                {canEdit ? (
                  <select value={contact.owner_user_id || ''} onChange={saveOwner} disabled={savingOwner} style={{ maxWidth: 180 }}>
                    <option value="">— unassigned —</option>
                    {directory.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                ) : (
                  <span>{contact.owner_username ? <span className="owner-chip"><span className="avatar">{contact.owner_username.slice(0, 2).toUpperCase()}</span>{contact.owner_username}</span> : '—'}</span>
                )}
              </div>
              <div className="row between" title="This contact's own lead source. Deals/opportunities linked to them each record their own source too, which can differ.">
                <span className="muted">Lead source</span><span>{contact.source || '—'}</span>
              </div>
              <div className="row between" title="Derived from this person's most recent lead/opportunity — set it there, not here.">
                <span className="muted">Method of entry</span><span>{contact.method_of_entry || '—'}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Deals ({contact.deals.length})</h2>
            {contact.deals.length === 0 ? <div className="empty">No deals.</div> : contact.deals.map((d) => (
              <div key={d.id} className="row between" style={{ padding: '6px 0' }}>
                <Link to={`/pipeline/${d.id}`}>{d.title}</Link>
                <span className={'pill ' + (STAGE_PILL[d.stage] || '')}>{d.stage}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Jobs ({contact.jobs.length})</h2>
            {contact.jobs.length === 0 ? <div className="empty">No field jobs.</div> : contact.jobs.map((j) => (
              <div key={j.id} className="row between" style={{ padding: '6px 0' }}>
                <Link to={`/jobs/${j.id}`}>{j.title}</Link>
                <span className="pill blue">{j.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Tickets ({contact.tickets.length})</h2>
            {contact.tickets.length === 0 ? <div className="empty">No tickets.</div> : contact.tickets.map((t) => (
              <div key={t.id} className="row between" style={{ padding: '6px 0' }}>
                <Link to={`/tickets/${t.id}`}>{t.subject}</Link>
                <span className={'pill ' + (TICKET_PILL[t.status] || '')}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card section-card" style={{ borderLeftColor: 'var(--line)' }}>
            <h2 className="section-label" style={{ color: 'var(--muted)' }}>History</h2>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between">
                <span className="muted">Created by</span>
                <span>{contact.created_by_username || 'system'} · {shortDate(contact.created_at)}</span>
              </div>
              <div className="row between">
                <span className="muted">Last modified</span>
                <span>{contact.updated_by_username || contact.created_by_username || 'system'} · {timeAgo(contact.updated_at || contact.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Next steps</h2>
            <TaskList relatedType="contact" relatedId={contact.id} />
          </div>

          <div className="card">
            <h2>Activity timeline</h2>
            <p className="sub" style={{ marginBottom: 12 }}>Notes, calls, and payments across every deal and job tied to this person — one graph, not three exports.</p>
            {contact.activities.length === 0 ? <div className="empty">No activity yet.</div> : (
              <div className="timeline">
                {contact.activities.map((a) => (
                  <div className="timeline-item" key={`${a.related_type}-${a.id}`}>
                    <div className="when">{timeAgo(a.created_at)}</div>
                    <div className="body">
                      <span className="type-tag">{a.type.replace('_', ' ')}</span>
                      {a.note}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {scheduling && (
        <AppointmentModal
          appointment={{ title: `Meeting with ${contact.first_name} ${contact.last_name}`, location: contact.address || '' }}
          onClose={() => setScheduling(false)}
          onSubmit={scheduleAppointment}
        />
      )}
    </>
  );
}
