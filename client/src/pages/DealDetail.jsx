import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo, mapLinks } from '../utils';
import AiDraftModal from '../components/AiDraftModal';
import TaskList from '../components/TaskList';

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');

  function load() {
    api.deal(id).then(setDeal);
  }
  useEffect(load, [id]);

  async function changeStage(stage) {
    await api.updateDeal(id, { stage });
    load();
  }

  async function createProject() {
    const job = await api.createJob({
      contact_id: deal.contact_id || null, company_id: deal.company_id || null, deal_id: deal.id,
      title: deal.title, status: 'scheduled', address: deal.customer_address || null,
    });
    navigate(`/jobs/${job.id}`);
  }

  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await fetch(`/api/deals/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, type: 'note' }),
    });
    setNote('');
    load();
  }

  async function openDraft(kind, title) {
    const d = await api.aiDraft(kind, id);
    setDraft(d);
    setDraftTitle(title);
  }
  async function logDraft({ subject, body }) {
    await fetch(`/api/deals/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: `Email sent — "${subject}": ${body}`, type: 'email' }),
    });
    load();
  }

  if (!deal) return <div className="loading">Loading…</div>;

  const links = deal.customer_address ? mapLinks(deal.customer_address) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}>
            {deal.stage === 'new' ? <Link to="/leads">Leads</Link> : <Link to="/pipeline">Opportunities</Link>} / {deal.title}
          </p>
          <h1>{deal.title} <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span></h1>
          <p className="sub">
            {deal.company_name || (deal.first_name ? `${deal.first_name} ${deal.last_name}` : 'No contact linked')}
            {' · '}{money(deal.value)} · expected close {shortDate(deal.expected_close)}
            {deal.source ? ` · source: ${deal.source}` : ''}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => openDraft('deal_follow_up', 'Draft follow-up')}>Draft follow-up</button>
          <button className="btn" onClick={() => openDraft('deal_recap', 'Draft recap')}>Draft recap</button>
          <button className="btn subtle" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Activity</h2>
          <form onSubmit={addNote} className="row" style={{ marginBottom: 14, gap: 8 }}>
            <input style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--paper)' }} placeholder="Log a note or call…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" type="submit">Add</button>
          </form>
          {deal.activities.length === 0 ? <div className="empty">No activity yet.</div> : (
            <div className="timeline">
              {deal.activities.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="when">{timeAgo(a.created_at)}</div>
                  <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          {(deal.customer_phone || deal.customer_address) && (
            <div className="card">
              <h2>Customer info</h2>
              <div className="stack" style={{ gap: 6, marginBottom: links ? 12 : 0 }}>
                {deal.customer_phone && (
                  <div className="row between"><span className="muted">Phone</span><a href={`tel:${deal.customer_phone}`}>{deal.customer_phone}</a></div>
                )}
                {deal.customer_address && (
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <span className="muted">Address</span>
                    <span style={{ textAlign: 'right' }}>{deal.customer_address}</span>
                  </div>
                )}
              </div>
              {links && (
                <a href={links.view} target="_blank" rel="noreferrer" className="btn sm primary map-cta">
                  🛰️ View satellite location →
                </a>
              )}
            </div>
          )}
          <div className="card">
            <h2>Stage</h2>
            <div className="stack" style={{ gap: 6 }}>
              {STAGES.map((s) => (
                <button
                  key={s}
                  className={'btn sm' + (deal.stage === s ? ' primary' : '')}
                  style={{ justifyContent: 'flex-start', textTransform: 'capitalize' }}
                  onClick={() => changeStage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Project</h2>
            {deal.jobs && deal.jobs.length > 0 ? (
              <div className="stack" style={{ gap: 2 }}>
                {deal.jobs.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="attention-row">
                    <span>{j.title}</span>
                    <span className="pill">{j.status.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            ) : deal.stage === 'won' ? (
              <>
                <p className="sub" style={{ margin: '-4px 0 10px' }}>This opportunity is won — turn it into a project to start scheduling field work, estimates, and billing.</p>
                <button className="btn primary sm" onClick={createProject}>+ Create project</button>
              </>
            ) : (
              <div className="empty">Projects start once this opportunity is won.</div>
            )}
          </div>
          <div className="card">
            <h2>Next steps</h2>
            <TaskList relatedType="deal" relatedId={deal.id} />
          </div>
        </div>
      </div>

      {draft && (
        <AiDraftModal title={draftTitle} initialDraft={draft} onClose={() => setDraft(null)} onLog={logDraft} />
      )}
    </>
  );
}
