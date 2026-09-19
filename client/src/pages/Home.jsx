import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, timeAgo } from '../utils';
import { BarList } from '../components/charts';

const LEAD_STATUS_ORDER = ['New', 'Follow Up', 'Unresponsive', 'Restart', 'Converted', 'Lost'];
const OPP_STAGE_LABEL = { qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation' };
const OPP_STAGE_ORDER = ['qualified', 'proposal', 'negotiation'];
const JOB_STATUS_LABEL = { pending_schedule: 'Pending schedule', accepted: 'Accepted', scheduled: 'Scheduled', in_progress: 'In progress', on_hold: 'On hold' };
const JOB_STATUS_ORDER = ['pending_schedule', 'accepted', 'scheduled', 'in_progress', 'on_hold'];

function todayStr() { return new Date().toISOString().slice(0, 10); }

function groupCount(rows, keyFn, order) {
  const counts = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (key === undefined || key === null) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const keys = order || [...counts.keys()];
  return keys.filter((k) => counts.has(k)).map((k) => ({ label: k, count: counts.get(k) }));
}

export default function Home() {
  const [deals, setDeals] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [appointments, setAppointments] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);

  useEffect(() => {
    api.deals().then(setDeals);
    api.jobs().then(setJobs);
    api.appointments().then((d) => setAppointments(d?.appointments || []));
    api.tasks({ open: '1' }).then(setTasks);
    api.contacts().then(setContacts);
    // Empty for anyone not flagged as an estimate approver — see routes/directory.js. Kept off
    // the Dashboard payload on purpose since Dashboard is admin-only and approving isn't.
    api.pendingEstimateApprovals().then(setPendingApprovals).catch(() => setPendingApprovals([]));
  }, []);

  if (!deals || !jobs || !appointments || !tasks || !contacts) return <div className="loading">Loading home…</div>;

  const leads = deals.filter((d) => d.stage === 'new');
  const leadsByStatus = groupCount(leads, (d) => d.lead_status || 'New', LEAD_STATUS_ORDER);

  const openOpps = deals.filter((d) => OPP_STAGE_ORDER.includes(d.stage));
  const oppsByStage = groupCount(openOpps, (d) => OPP_STAGE_LABEL[d.stage], OPP_STAGE_ORDER.map((s) => OPP_STAGE_LABEL[s]));

  const openJobs = jobs.filter((j) => JOB_STATUS_ORDER.includes(j.status));
  const jobsByStatus = groupCount(openJobs, (j) => JOB_STATUS_LABEL[j.status], JOB_STATUS_ORDER.map((s) => JOB_STATUS_LABEL[s]));

  const today = todayStr();
  const todaysEvents = appointments
    .filter((a) => a.start_time && a.start_time.slice(0, 10) === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const todaysTasks = tasks.filter((t) => t.due_date === today);

  const keyDeals = openOpps
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const recentRecords = [
    ...leads.slice(0, 3).map((d) => ({ type: 'Lead', label: d.title, to: `/pipeline/${d.id}`, at: d.created_at })),
    ...openOpps.slice(0, 3).map((d) => ({ type: 'Opportunity', label: d.title, to: `/pipeline/${d.id}`, at: d.created_at })),
    ...jobs.slice(0, 3).map((j) => ({ type: 'Project', label: j.title, to: `/jobs/${j.id}`, at: j.created_at })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p className="sub">What's happening right now — today's schedule, what's open across leads, opportunities and projects, and what needs a look.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Today's events</h2>
        {todaysEvents.length === 0 ? (
          <div className="empty">Nothing on the calendar today.</div>
        ) : (
          <div className="stack" style={{ gap: 2 }}>
            {todaysEvents.map((a) => (
              <div key={a.id} className="attention-row">
                <span>{a.title}</span>
                <span className="mono muted">{new Date(a.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Link to="/calendar" className="btn sm">View calendar →</Link>
        </div>
      </div>

      {pendingApprovals.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Pending estimate approvals <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({pendingApprovals.length})</span></h2>
          <p className="sub" style={{ margin: '-4px 0 12px' }}>Estimates from salespeople who need your sign-off before they can go to the customer — open the project to approve or reject.</p>
          <div className="stack" style={{ gap: 2 }}>
            {pendingApprovals.map((a) => (
              <Link key={a.id} to={a.linked_type === 'opportunity' ? `/pipeline/${a.linked_id}` : `/jobs/${a.linked_id}`} className="attention-row">
                <span>{a.number} — {a.linked_title}{a.requested_by ? ` · requested by ${a.requested_by}` : ''}</span>
                <span className="mono" style={{ color: 'var(--amber)' }}>{a.total !== null ? money(a.total) : ''} {timeAgo(a.requested_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid-3">
        <div className="card">
          <h2>All open leads</h2>
          {leadsByStatus.length === 0 ? <div className="empty">No open leads.</div> : (
            <BarList data={leadsByStatus} valueKey="count" labelKey="label" formatValue={(v) => v} />
          )}
          <div style={{ marginTop: 12 }}><Link to="/leads" className="btn sm">View leads →</Link></div>
        </div>
        <div className="card">
          <h2>All open opportunities</h2>
          {oppsByStage.length === 0 ? <div className="empty">No open opportunities.</div> : (
            <BarList data={oppsByStage} valueKey="count" labelKey="label" formatValue={(v) => v} />
          )}
          <div style={{ marginTop: 12 }}><Link to="/pipeline" className="btn sm">View opportunities →</Link></div>
        </div>
        <div className="card">
          <h2>All open projects</h2>
          {jobsByStatus.length === 0 ? <div className="empty">No open projects.</div> : (
            <BarList data={jobsByStatus} valueKey="count" labelKey="label" formatValue={(v) => v} />
          )}
          <div style={{ marginTop: 12 }}><Link to="/jobs" className="btn sm">View projects →</Link></div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Recent records</h2>
          {recentRecords.length === 0 ? <div className="empty">Nothing yet.</div> : (
            <div className="stack" style={{ gap: 2 }}>
              {recentRecords.map((r, i) => (
                <Link key={i} to={r.to} className="attention-row">
                  <span><span className="pill" style={{ marginRight: 8 }}>{r.type}</span>{r.label}</span>
                  <span className="muted">{timeAgo(r.at)}</span>
                </Link>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Link to="/dashboard" className="btn sm">View dashboard →</Link>
          </div>
        </div>

        <div className="card">
          <h2>Today's tasks</h2>
          {todaysTasks.length === 0 ? (
            <div className="empty">Nothing due today. Check the full task list on each record.</div>
          ) : (
            <div className="stack" style={{ gap: 2 }}>
              {todaysTasks.map((t) => (
                <div key={t.id} className="attention-row">
                  <span>{t.title}</span>
                  <span className="pill">{t.related_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Key deals — recent opportunities</h2>
        {keyDeals.length === 0 ? (
          <div className="empty">No open opportunities yet.</div>
        ) : (
          <div className="stack" style={{ gap: 2 }}>
            {keyDeals.map((d) => (
              <Link key={d.id} to={`/pipeline/${d.id}`} className="attention-row">
                <span>{d.title}</span>
                <span className="row" style={{ gap: 10 }}>
                  <span className="muted">{OPP_STAGE_LABEL[d.stage]}</span>
                  <span className="mono">{money(d.value)}</span>
                  <span className="muted">{shortDate(d.expected_close)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
