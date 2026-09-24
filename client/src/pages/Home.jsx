import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, dateTime } from '../utils';
import { BarList } from '../components/charts';
import FilterBar from '../components/FilterBar';
import WeatherPanel from '../components/WeatherPanel';
import { useAuth } from '../auth';

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
  const { user } = useAuth();
  // Admins keep the full, company-wide overview this page always showed (same as Dashboard,
  // admin-only, staying company-wide) — everyone else sees only what's theirs: their own
  // Owner/Assigned-to records (Sept 2026). A record with no owner/assignee at all only ever
  // shows up here for an admin, never for a regular login, since it can't match anyone's id.
  const isAdmin = user?.role === 'admin';

  const [deals, setDeals] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [appointments, setAppointments] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [myPendingEstimates, setMyPendingEstimates] = useState([]);
  const [commission, setCommission] = useState(null);
  const [recentFilter, setRecentFilter] = useState('');

  useEffect(() => {
    api.deals().then(setDeals);
    api.jobs().then(setJobs);
    api.appointments().then((d) => setAppointments(d?.appointments || []));
    api.tasks({ open: '1' }).then(setTasks);
    api.contacts().then(setContacts);
    // Empty for anyone not flagged as an estimate approver — see routes/directory.js. Kept off
    // the Dashboard payload on purpose since Dashboard is admin-only and approving isn't.
    api.pendingEstimateApprovals().then(setPendingApprovals).catch(() => setPendingApprovals([]));
    // The flip side — this login's own submitted estimates still waiting on someone else's
    // sign-off. Empty for anyone who hasn't submitted anything pending.
    api.myPendingEstimates().then(setMyPendingEstimates).catch(() => setMyPendingEstimates([]));
  }, []);

  // A salesperson's own commission is personal, same as the approvals cards above — shown to
  // whoever has a commission rate set (or full commission visibility), admin or not, so this
  // doesn't depend on the admin/personalized split above. Reuses the existing Commission
  // payouts endpoint (routes/commissions.js), which already scopes non-admins to their own row.
  useEffect(() => {
    if (!user || !(Number(user.commission_percent) > 0 || user.can_see_commissions)) return;
    api.commissionPayouts('month', todayStr())
      .then((d) => setCommission((d.rows || []).find((r) => r.salespersonUserId === user.id) || null))
      .catch(() => setCommission(null));
  }, [user]);

  if (!deals || !jobs || !appointments || !tasks || !contacts) return <div className="loading">Loading home…</div>;

  // Everything below this point runs on `myDeals`/`myJobs`/`myAppointments`/`myTasks` instead of
  // the raw fetched lists — for an admin those are just the full lists (unchanged behavior); for
  // everyone else they're narrowed to this login's own Owner (deals/jobs) or Assigned-to
  // (appointments/tasks) records, so every card below falls out already personalized.
  const myDeals = isAdmin ? deals : deals.filter((d) => d.owner_user_id === user.id);
  const myJobs = isAdmin ? jobs : jobs.filter((j) => j.owner_user_id === user.id);
  const myAppointments = isAdmin ? appointments : appointments.filter((a) => a.assigned_user_id === user.id);
  const myTasks = isAdmin ? tasks : tasks.filter((t) => t.assigned_user_id === user.id);

  const leads = myDeals.filter((d) => d.stage === 'new');
  const leadsByStatus = groupCount(leads, (d) => d.lead_status || 'New', LEAD_STATUS_ORDER);

  const openOpps = myDeals.filter((d) => OPP_STAGE_ORDER.includes(d.stage));
  const oppsByStage = groupCount(openOpps, (d) => OPP_STAGE_LABEL[d.stage], OPP_STAGE_ORDER.map((s) => OPP_STAGE_LABEL[s]));

  const openJobs = myJobs.filter((j) => JOB_STATUS_ORDER.includes(j.status));
  const jobsByStatus = groupCount(openJobs, (j) => JOB_STATUS_LABEL[j.status], JOB_STATUS_ORDER.map((s) => JOB_STATUS_LABEL[s]));

  const today = todayStr();
  const todaysEvents = myAppointments
    .filter((a) => a.start_time && a.start_time.slice(0, 10) === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const todaysTasks = myTasks.filter((t) => t.due_date === today);

  const keyDeals = openOpps
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  // Pool is wider than what's actually shown so filtering by type still has something to narrow —
  // the mixed top-5 view only needs a handful of each, but "just Projects" should surface more
  // than the one or two that happened to land in that unfiltered top 5.
  const recentRecordsAll = [
    ...leads.map((d) => ({ type: 'Lead', label: d.title, to: `/pipeline/${d.id}`, at: d.created_at })),
    ...openOpps.map((d) => ({ type: 'Opportunity', label: d.title, to: `/pipeline/${d.id}`, at: d.created_at })),
    ...myJobs.map((j) => ({ type: 'Project', label: j.title, to: `/jobs/${j.id}`, at: j.created_at })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const recentTypeDefs = [
    { key: 'type', label: 'Type', options: [...new Set(recentRecordsAll.map((r) => r.type))].map((t) => ({ value: t, label: t })) },
  ].filter((f) => f.options.length > 1);

  const recentRecords = (recentFilter ? recentRecordsAll.filter((r) => r.type === recentFilter) : recentRecordsAll)
    .slice(0, recentFilter ? 8 : 5);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p className="sub">
            {isAdmin
              ? "What's happening right now — today's schedule, what's open across leads, opportunities and projects, and what needs a look."
              : "What's yours right now — your schedule, your open leads, opportunities and projects, and what needs your attention."}
          </p>
        </div>
        <WeatherPanel />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>{isAdmin ? "Today's events" : 'Your events today'}</h2>
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
                <span className="mono" style={{ color: 'var(--amber)' }}>{a.total !== null ? money(a.total) : ''} {dateTime(a.requested_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {myPendingEstimates.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Your estimates awaiting approval <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({myPendingEstimates.length})</span></h2>
          <p className="sub" style={{ margin: '-4px 0 12px' }}>Estimates you've submitted that are waiting on a manager's sign-off before they can go to the customer.</p>
          <div className="stack" style={{ gap: 2 }}>
            {myPendingEstimates.map((e) => (
              <Link key={e.id} to={e.linked_type === 'opportunity' ? `/pipeline/${e.linked_id}` : `/jobs/${e.linked_id}`} className="attention-row">
                <span>{e.number} — {e.linked_title}</span>
                <span className="mono" style={{ color: 'var(--amber)' }}>{e.total !== null ? money(e.total) : ''} {dateTime(e.requested_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {commission && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Your commission <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>this month</span></h2>
          <div className="mono" style={{ fontWeight: 700, fontSize: 22, color: 'var(--accent-ink)' }}>{money(commission.totalCommission)}</div>
          <p className="sub" style={{ margin: '4px 0 12px' }}>{commission.jobs.length} project{commission.jobs.length === 1 ? '' : 's'} paid off this month, at {commission.percent}% of projected profit.</p>
          <Link to="/commissions" className="btn sm">View commission payouts →</Link>
        </div>
      )}

      <div className="grid-3">
        <div className="card">
          <h2>{isAdmin ? 'All open leads' : 'Your open leads'}</h2>
          {leadsByStatus.length === 0 ? <div className="empty">No open leads.</div> : (
            <BarList data={leadsByStatus} valueKey="count" labelKey="label" formatValue={(v) => v} />
          )}
          <div style={{ marginTop: 12 }}><Link to="/leads" className="btn sm">View leads →</Link></div>
        </div>
        <div className="card">
          <h2>{isAdmin ? 'All open opportunities' : 'Your open opportunities'}</h2>
          {oppsByStage.length === 0 ? <div className="empty">No open opportunities.</div> : (
            <BarList data={oppsByStage} valueKey="count" labelKey="label" formatValue={(v) => v} />
          )}
          <div style={{ marginTop: 12 }}><Link to="/pipeline" className="btn sm">View opportunities →</Link></div>
        </div>
        <div className="card">
          <h2>{isAdmin ? 'All open projects' : 'Your open projects'}</h2>
          {jobsByStatus.length === 0 ? <div className="empty">No open projects.</div> : (
            <BarList data={jobsByStatus} valueKey="count" labelKey="label" formatValue={(v) => v} />
          )}
          <div style={{ marginTop: 12 }}><Link to="/jobs" className="btn sm">View projects →</Link></div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>{isAdmin ? 'Recent records' : 'Your recent records'}</h2>
          {recentTypeDefs.length > 0 && (
            <FilterBar
              filters={recentTypeDefs} values={{ type: recentFilter }}
              onChange={(_key, value) => setRecentFilter(value)}
              onClear={() => setRecentFilter('')}
            />
          )}
          {recentRecords.length === 0 ? (
            <div className="empty">{recentFilter ? `No recent ${recentFilter.toLowerCase()}s.` : 'Nothing yet.'}</div>
          ) : (
            <div className="stack" style={{ gap: 2 }}>
              {recentRecords.map((r, i) => (
                <Link key={i} to={r.to} className="attention-row">
                  <span><span className="pill" style={{ marginRight: 8 }}>{r.type}</span>{r.label}</span>
                  <span className="muted">{dateTime(r.at)}</span>
                </Link>
              ))}
            </div>
          )}
          {isAdmin && (
            <div style={{ marginTop: 12 }}>
              <Link to="/dashboard" className="btn sm">View dashboard →</Link>
            </div>
          )}
        </div>

        <div className="card">
          <h2>{isAdmin ? "Today's tasks" : 'Your tasks today'}</h2>
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
        <h2>{isAdmin ? 'Key deals — recent opportunities' : 'Your opportunities'}</h2>
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
