import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, initials, mapLinks } from '../utils';
import TaskList from '../components/TaskList';

const STAGE_PILL = { new: '', qualified: '', proposal: 'amber', negotiation: 'amber', won: 'green', lost: 'red' };

export default function ContactDetail() {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState({ phone: '', address: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    api.contact(id).then((c) => { setContact(c); setInfo({ phone: c.phone || '', address: c.address || '' }); });
  }
  useEffect(load, [id]);

  async function saveInfo(e) {
    e.preventDefault();
    setSaving(true);
    await api.updateContact(id, info);
    setSaving(false);
    setEditing(false);
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
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {initials(contact.first_name, contact.last_name)}
            </div>
            <div>
              <h1>{contact.first_name} {contact.last_name} {contact.source && <span className="pill" style={{ marginLeft: 8, verticalAlign: 'middle' }}>{contact.source}</span>}</h1>
              <p className="sub">{contact.title || 'Contact'}{contact.company_name ? ` at ${contact.company_name}` : ''}{contact.email ? ` · ${contact.email}` : ''}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
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

        <div className="stack">
          <div className="card">
            <div className="row between" style={{ marginBottom: editing ? 10 : 0 }}>
              <h2 style={{ margin: 0 }}>Contact info</h2>
              {!editing && <button className="btn sm subtle" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <form onSubmit={saveInfo} className="stack" style={{ gap: 10 }}>
                <div className="field"><label>Phone</label><input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></div>
                <div className="field"><label>Address</label><input value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} placeholder="Street, city, state" /></div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditing(false); setInfo({ phone: contact.phone || '', address: contact.address || '' }); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                <div className="row between"><span className="muted">Phone</span>{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <span className="muted">—</span>}</div>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span className="muted">Address</span>
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
          <div className="card">
            <h2>Next steps</h2>
            <TaskList relatedType="contact" relatedId={contact.id} />
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
                <span className="pill">{j.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
