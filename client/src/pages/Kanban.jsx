import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, isoDate, accountName, shortDate } from '../utils';
import { usePermission } from '../auth';

// The whole funnel in one board — Leads through Opportunities through Projects — spanning two
// separate data models (the `deals` table, distinguished by `stage`, and the `jobs` table,
// distinguished by `status`). Each column belongs to exactly one of those models, so a card is
// only draggable into a same-type column: a lead/deal card can move between deal-stage columns,
// a project card between job-status columns, but not across the deal/job boundary (a deal
// becomes a job through estimate conversion elsewhere in the app, not a drag here).
const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const DEAL_STAGE_LABELS = {
  new: 'Leads', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};
const JOB_STATUSES = ['pending_schedule', 'accepted', 'scheduled', 'in_progress', 'complete', 'on_hold', 'cancelled'];
const JOB_STATUS_LABELS = {
  pending_schedule: 'Pending Schedule', accepted: 'Accepted', scheduled: 'Scheduled',
  in_progress: 'In Progress', complete: 'Complete', on_hold: 'On Hold', cancelled: 'Cancelled',
};

const COLUMNS = [
  ...DEAL_STAGES.map((stage) => ({ type: 'deal', key: stage, label: DEAL_STAGE_LABELS[stage], section: 'Leads & Opportunities' })),
  ...JOB_STATUSES.map((status) => ({ type: 'job', key: status, label: JOB_STATUS_LABELS[status], section: 'Projects' })),
];

export default function Kanban() {
  const { canEdit: canEditLeads } = usePermission('leads');
  const { canEdit: canEditDeals } = usePermission('pipeline');
  const { canEdit: canEditJobs } = usePermission('jobs');
  const [deals, setDeals] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  function load() {
    api.deals().then(setDeals);
    api.jobs().then(setJobs);
  }
  useEffect(load, []);

  const dealsByStage = useMemo(() => {
    const m = {};
    for (const s of DEAL_STAGES) m[s] = (deals || []).filter((d) => d.stage === s);
    return m;
  }, [deals]);

  const jobsByStatus = useMemo(() => {
    const m = {};
    for (const s of JOB_STATUSES) m[s] = (jobs || []).filter((j) => j.status === s);
    return m;
  }, [jobs]);

  async function handleDrop(col) {
    setDragOverKey(null);
    const dragged = window.__draggedFunnelCard;
    window.__draggedFunnelCard = null;
    if (!dragged || dragged.type !== col.type) return;

    if (col.type === 'deal') {
      const canEdit = col.key === 'new' ? canEditLeads : canEditDeals;
      if (!canEdit) return;
      const deal = (deals || []).find((d) => d.id === dragged.id);
      if (!deal || deal.stage === col.key) return;
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage: col.key } : d)));
      await api.updateDeal(deal.id, { stage: col.key });
    } else {
      if (!canEditJobs) return;
      const job = (jobs || []).find((j) => j.id === dragged.id);
      if (!job || job.status === col.key) return;
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: col.key } : j)));
      await api.updateJob(job.id, { status: col.key });
    }
  }

  const loading = deals === null || jobs === null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p className="sub">
            The whole funnel in one board — a lead, worked into an opportunity, won, and carried
            through as a project. Drag a card to move it within its own stage of the funnel.
            {' '}<Link to="/leads">Leads</Link> · <Link to="/pipeline">Opportunities list</Link> · <Link to="/jobs">Projects list</Link>
          </p>
        </div>
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <div className="kanban" style={{ gridAutoColumns: 'minmax(210px, 1fr)' }}>
          {COLUMNS.map((col, i) => {
            const prevSection = i > 0 ? COLUMNS[i - 1].section : null;
            const list = col.type === 'deal' ? dealsByStage[col.key] : jobsByStatus[col.key];
            const priceHidden = list.some((r) => r.price_hidden);
            const total = priceHidden ? null : list.reduce((s, r) => s + (Number(col.type === 'deal' ? r.value : r.contract_amount) || 0), 0);
            return (
              <div
                key={`${col.type}-${col.key}`}
                className={'kanban-col' + (dragOverKey === `${col.type}-${col.key}` ? ' drag-over' : '')}
                style={prevSection && prevSection !== col.section ? { borderLeft: '2px solid var(--accent)' } : undefined}
                onDragOver={(e) => { e.preventDefault(); setDragOverKey(`${col.type}-${col.key}`); }}
                onDragLeave={() => setDragOverKey((k) => (k === `${col.type}-${col.key}` ? null : k))}
                onDrop={(e) => { e.preventDefault(); handleDrop(col); }}
              >
                <div className="kanban-col-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span className="sub" style={{ margin: 0, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>{col.section}</span>
                  <div className="row between" style={{ width: '100%' }}>
                    <span className="name">{col.label} <span className="muted">({list.length})</span></span>
                    <span className="value">{money(total)}</span>
                  </div>
                </div>

                {col.type === 'deal' ? list.map((deal) => (
                  <div
                    key={deal.id}
                    className="deal-card"
                    draggable={col.key === 'new' ? canEditLeads : canEditDeals}
                    onDragStart={() => { window.__draggedFunnelCard = { type: 'deal', id: deal.id }; }}
                  >
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="title"><Link to={`/pipeline/${deal.id}`} className="link-strong">{deal.first_name ? `${deal.first_name} ${deal.last_name}` : deal.title}</Link></div>
                      {deal.label && <span className={'score-pill ' + deal.label.toLowerCase()}>{deal.score}</span>}
                    </div>
                    <div className="meta">
                      <span>{accountName(deal, deal.title)}</span>
                      <span className="val">{money(deal.value)}</span>
                    </div>
                  </div>
                )) : list.map((job) => {
                  const account = accountName(job, job.title);
                  const projName = `Project - ${account} - ${isoDate(job.created_at)}`;
                  return (
                    <div
                      key={job.id}
                      className="deal-card"
                      draggable={canEditJobs}
                      onDragStart={() => { window.__draggedFunnelCard = { type: 'job', id: job.id }; }}
                    >
                      <div className="title"><Link to={`/jobs/${job.id}`} className="link-strong">{projName}</Link></div>
                      <div className="meta">
                        <span>{account}</span>
                        <span className="val">{job.contract_amount ? money(job.contract_amount) : '—'}</span>
                      </div>
                      {job.scheduled_date && <div className="meta"><span>Scheduled</span><span>{shortDate(job.scheduled_date)}</span></div>}
                    </div>
                  );
                })}
                {list.length === 0 && <div className="empty" style={{ fontSize: 12, padding: '10px 0' }}>Nothing here</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

