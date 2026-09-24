import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { shortDate, dateTime } from '../utils';
import AiDraftModal from '../components/AiDraftModal';
import { usePermission } from '../auth';

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_PILL = { low: '', medium: '', high: 'amber', urgent: 'red' };

export default function TicketDetail() {
  const { id } = useParams();
  const { canEdit } = usePermission('tickets');
  const [ticket, setTicket] = useState(null);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(null);

  function load() {
    api.ticket(id).then(setTicket);
  }
  useEffect(load, [id]);

  async function changeStatus(status) {
    await api.updateTicket(id, { status });
    load();
  }
  async function changePriority(priority) {
    await api.updateTicket(id, { priority });
    load();
  }
  async function rate(score) {
    await api.updateTicket(id, { satisfaction_score: score });
    load();
  }
  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await api.addTicketNote(id, note);
    setNote('');
    load();
  }

  async function openDraft() {
    const d = await api.aiDraft('ticket_reply', id);
    setDraft(d);
  }
  async function logDraft({ subject, body }) {
    await api.addTicketNote(id, `Email sent — "${subject}": ${body}`);
    load();
  }

  if (!ticket) return <div className="loading">Loading…</div>;

  const isClosed = ['resolved', 'closed'].includes(ticket.status);
  const slaOverdue = !isClosed && ticket.sla_due_at && new Date(ticket.sla_due_at.replace(' ', 'T') + 'Z') < new Date();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/tickets">Service &amp; tickets</Link> / {ticket.subject}</p>
          <h1>{ticket.subject}</h1>
          <p className="sub">
            {ticket.company_name || (ticket.first_name ? `${ticket.first_name} ${ticket.last_name}` : 'No contact linked')}
            {' · '}<span className={'pill ' + (PRIORITY_PILL[ticket.priority] || '')}>{ticket.priority}</span>
            {' '}{isClosed ? `resolved ${shortDate(ticket.resolved_at)}` : (
              <span style={{ color: slaOverdue ? 'var(--red)' : 'inherit' }}>
                SLA due {shortDate(ticket.sla_due_at)}{slaOverdue ? ' — breached' : ''}
              </span>
            )}
          </p>
        </div>
        {canEdit && <button className="btn primary" onClick={openDraft}>Draft reply</button>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Description</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{ticket.description || 'No description provided.'}</p>

          <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 14, paddingTop: 14 }}>
            <h2>Activity</h2>
            {canEdit && (
            <form onSubmit={addNote} className="row" style={{ marginBottom: 14, gap: 8 }}>
              <input style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--paper)' }} placeholder="Log a note or call…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" type="submit">Add</button>
            </form>
            )}
            {ticket.activities.length === 0 ? <div className="empty">No activity yet.</div> : (
              <div className="timeline">
                {ticket.activities.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div className="when">{dateTime(a.created_at)}</div>
                    <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Status</h2>
            <div className="stack" style={{ gap: 6 }}>
              {STATUSES.map((s) => (
                <button key={s} className={'btn sm' + (ticket.status === s ? ' primary' : '')} style={{ justifyContent: 'flex-start', textTransform: 'capitalize' }} onClick={() => changeStatus(s)} disabled={!canEdit}>{s}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Priority</h2>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {PRIORITIES.map((p) => (
                <button key={p} className={'btn sm' + (ticket.priority === p ? ' primary' : '')} style={{ textTransform: 'capitalize' }} onClick={() => changePriority(p)} disabled={!canEdit}>{p}</button>
              ))}
            </div>
          </div>

          {isClosed && (
            <div className="card">
              <h2>Customer satisfaction</h2>
              {ticket.satisfaction_score ? (
                <p style={{ fontSize: 14 }}>Rated <strong>{ticket.satisfaction_score} / 5</strong></p>
              ) : canEdit ? (
                <div className="row" style={{ gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className="btn sm" onClick={() => rate(n)}>{n}</button>
                  ))}
                </div>
              ) : (
                <div className="empty">Not yet rated.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {draft && (
        <AiDraftModal title="Draft reply" initialDraft={draft} onClose={() => setDraft(null)} onLog={logDraft} />
      )}
    </>
  );
}
