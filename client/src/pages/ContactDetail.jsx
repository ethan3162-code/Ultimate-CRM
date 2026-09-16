import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, initials } from '../utils';

const STAGE_PILL = { new: '', qualified: '', proposal: 'amber', negotiation: 'amber', won: 'green', lost: 'red' };

export default function ContactDetail() {
  const { id } = useParams();
  const [contact, setContact] = useState(null);

  useEffect(() => { api.contact(id).then(setContact); }, [id]);

  if (!contact) return <div className="loading">Loading…</div>;

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
