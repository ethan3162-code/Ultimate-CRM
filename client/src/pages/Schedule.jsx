import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const STATUS_LABEL = { accepted: 'Accepted', scheduled: 'Scheduled', in_progress: 'In progress', complete: 'Complete', on_hold: 'On hold', cancelled: 'Cancelled' };
const STAGES = [
  { key: 'demo', label: 'Demo', field: 'demo_days' },
  { key: 'site_prep', label: 'Site prep', field: 'site_prep_days' },
  { key: 'installation', label: 'Installation', field: 'installation_days' },
  { key: 'final_walkthrough', label: 'Final walkthrough', field: 'final_walkthrough_days' },
];
const STAGE_LABEL = STAGES.reduce((acc, s) => { acc[s.key] = s.label; return acc; }, {});
const DAY_MS = 86400000;
const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Each stage's share of the job's own bar, sized by its day-length, with the reached stages marked filled. */
function stageSegments(job) {
  const currentIdx = job.stage ? STAGES.findIndex((s) => s.key === job.stage) : -1;
  const total = STAGES.reduce((sum, s) => sum + (Number(job[s.field]) || 0), 0) || 1;
  let cursor = 0;
  return STAGES.map((s, i) => {
    const days = Number(job[s.field]) || 0;
    const leftPct = (cursor / total) * 100;
    cursor += days;
    return { ...s, days, leftPct, widthPct: (days / total) * 100, filled: currentIdx >= i, current: currentIdx === i };
  });
}

function toDate(d) {
  return new Date(d + 'T00:00:00');
}
function fmt(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function startOfWeek(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  nd.setDate(nd.getDate() - nd.getDay());
  return nd;
}

// Jobs in these statuses no longer occupy a subcontractor's time, so they don't count toward
// their current job load, or show up as a block, on the "By subcontractor" week grid.
const CLOSED_STATUSES = ['complete', 'cancelled'];

export default function Schedule() {
  const [jobs, setJobs] = useState(null);
  const [subs, setSubs] = useState(null);
  const [view, setView] = useState('project'); // 'project' | 'subcontractor'
  // "By subcontractor" is a week-at-a-time calendar grid (Sun–Sat), independent of the "By
  // project" tab's continuous timeline — closer to how the crew's existing scheduling board
  // (TeamCal) lays things out, per the office's own reference screenshots.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    api.jobs().then(setJobs);
    api.subcontractors().then(setSubs).catch(() => setSubs([]));
  }, []);

  const scheduled = useMemo(() => {
    if (!jobs) return [];
    return jobs
      .filter((j) => j.start_date && j.end_date)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [jobs]);

  // One row per active subcontractor, in name order, each carrying its own current job count
  // (any non-complete/cancelled job assigned to it, whether or not that job has a schedule yet —
  // this is the plain "how many jobs are on their plate right now" figure, not scoped to whatever
  // week happens to be showing) and the subset of its jobs that do have a start/end date, which
  // the week grid below draws as blocks on whichever week overlaps them.
  const subRows = useMemo(() => {
    if (!jobs || !subs) return [];
    return subs
      .filter((s) => s.active)
      .map((s) => {
        const subJobs = jobs.filter((j) => j.subcontractor_id === s.id);
        const activeCount = subJobs.filter((j) => !CLOSED_STATUSES.includes(j.status)).length;
        const bars = subJobs.filter((j) => j.start_date && j.end_date && !CLOSED_STATUSES.includes(j.status));
        return { sub: s, activeCount, bars };
      })
      .sort((a, b) => a.sub.name.localeCompare(b.sub.name));
  }, [jobs, subs]);

  const { rangeStart, totalDays, ticks } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scheduled.length === 0) {
      const start = new Date(today.getTime() - 3 * DAY_MS);
      return buildRange(start, new Date(today.getTime() + 30 * DAY_MS));
    }
    const starts = scheduled.map((j) => toDate(j.start_date).getTime());
    const ends = scheduled.map((j) => toDate(j.end_date).getTime());
    const start = new Date(Math.min(...starts, today.getTime()) - 2 * DAY_MS);
    const end = new Date(Math.max(...ends, today.getTime()) + 2 * DAY_MS);
    return buildRange(start, end);
  }, [scheduled]);

  function buildRange(start, end) {
    const days = Math.max(1, Math.round((end - start) / DAY_MS));
    const step = days > 60 ? 7 : days > 21 ? 3 : 1;
    const marks = [];
    for (let i = 0; i <= days; i += step) marks.push(new Date(start.getTime() + i * DAY_MS));
    return { rangeStart: start, totalDays: days, ticks: marks };
  }

  function barStyle(job) {
    const s = toDate(job.start_date).getTime();
    const e = toDate(job.end_date).getTime();
    const left = Math.max(0, (s - rangeStart.getTime()) / DAY_MS / totalDays) * 100;
    const width = Math.max(1.5, (e - s) / DAY_MS / totalDays * 100);
    return { left: `${left}%`, width: `${width}%` };
  }

  const todayLeft = Math.min(100, Math.max(0, (Date.now() - rangeStart.getTime()) / DAY_MS / totalDays * 100));

  // --- "By subcontractor" week grid ---
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)), [weekStart]);
  const weekEndExclusive = weekStart.getTime() + 7 * DAY_MS;
  const todayInWeek = Date.now() >= weekStart.getTime() && Date.now() < weekEndExclusive;
  const todayLeftWeek = ((Date.now() - weekStart.getTime()) / DAY_MS / 7) * 100;

  function shiftWeek(n) {
    setWeekStart((w) => new Date(w.getTime() + n * 7 * DAY_MS));
  }

  /** Clips a job's start/end span to whatever part of it falls inside the visible week; null if none does. */
  function weekBarStyle(job) {
    const jobStart = toDate(job.start_date).getTime();
    const jobEndExclusive = toDate(job.end_date).getTime() + DAY_MS;
    const from = Math.max(jobStart, weekStart.getTime());
    const to = Math.min(jobEndExclusive, weekEndExclusive);
    if (to <= from) return null;
    const left = (from - weekStart.getTime()) / DAY_MS / 7 * 100;
    const width = (to - from) / DAY_MS / 7 * 100;
    return { left: `${left}%`, width: `${width}%` };
  }

  const loading = !jobs || !subs;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Project schedule</h1>
          <p className="sub">
            {view === 'project'
              ? "Every job with a start and end date, laid out as a timeline — progress bars come straight from each job's own record."
              : 'One week at a time — each subcontractor’s current job count on the left, and their scheduled jobs laid out day by day, so you can see who has room to take more work.'}
          </p>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={'tab' + (view === 'project' ? ' active' : '')} onClick={() => setView('project')}>By project</button>
        <button type="button" className={'tab' + (view === 'subcontractor' ? ' active' : '')} onClick={() => setView('subcontractor')}>By subcontractor</button>
      </div>

      {loading ? <div className="loading">Loading…</div> : view === 'project' ? (
        scheduled.length === 0 ? (
          <div className="card"><div className="empty">No jobs have a start and end date yet. Open a job and set its schedule to see it here.</div></div>
        ) : (
          <div className="table-wrap gantt-wrap">
            <div className="gantt" style={{ minWidth: 640 }}>
              <div className="gantt-header">
                <div className="gantt-label-col">Job</div>
                <div className="gantt-track">
                  <div className="gantt-scale">
                    {ticks.map((t, i) => (
                      <div key={i} className="tick" style={{ left: `${((t - rangeStart) / DAY_MS / totalDays) * 100}%` }}>{fmt(t)}</div>
                    ))}
                    <div className="gantt-today" style={{ left: `${todayLeft}%` }} />
                  </div>
                </div>
              </div>
              {scheduled.map((job) => (
                <div className="gantt-row" key={job.id}>
                  <div className="gantt-label-col">
                    <div className="name"><Link to={`/jobs/${job.id}`} className="link-strong">{job.title}</Link></div>
                    <div className="meta">{job.company_name || (job.first_name ? `${job.first_name} ${job.last_name}` : '—')} · {STATUS_LABEL[job.status] || job.status}</div>
                  </div>
                  <div className="gantt-track">
                    <div className="gantt-today" style={{ left: `${todayLeft}%` }} />
                    <Link
                      to={`/jobs/${job.id}`}
                      className={`gantt-bar status-${job.status}`}
                      style={barStyle(job)}
                      title={`${STAGES.map((s) => `${s.label}: ${Number(job[s.field]) || 0}d`).join(' · ')} — ${job.stage ? `currently ${STAGE_LABEL[job.stage]}` : 'not started'} (${job.progress_percent || 0}%)`}
                    >
                      {stageSegments(job).map((seg) => (
                        <div
                          key={seg.key}
                          className={'seg' + (seg.filled ? ' filled' : '') + (seg.current ? ' current' : '')}
                          style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                        />
                      ))}
                      <span className="lbl">{job.stage ? STAGE_LABEL[job.stage] : `${job.progress_percent || 0}%`}</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 12, alignItems: 'center' }}>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm" onClick={() => shiftWeek(-1)}>&larr; Prev week</button>
              <button type="button" className="btn sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
              <button type="button" className="btn sm" onClick={() => shiftWeek(1)}>Next week &rarr;</button>
            </div>
            <div className="sub" style={{ margin: 0, fontWeight: 600 }}>
              {fmt(weekDays[0])} – {fmt(weekDays[6])}, {weekDays[0].getFullYear()}
            </div>
          </div>

          {subRows.length === 0 ? (
            <div className="card"><div className="empty">No active subcontractors yet — add one from the Subcontractors page.</div></div>
          ) : (
            <div className="table-wrap gantt-wrap">
              <div className="gantt" style={{ minWidth: 720 }}>
                <div className="gantt-header">
                  <div className="gantt-label-col">Subcontractor</div>
                  <div className="gantt-track">
                    <div className="gantt-scale">
                      {weekDays.map((d, i) => (
                        <div key={i} className="tick" style={{ left: `${(i / 7) * 100}%` }}>{WEEKDAY_LABEL[i]} {fmt(d)}</div>
                      ))}
                      {todayInWeek && <div className="gantt-today" style={{ left: `${todayLeftWeek}%` }} />}
                    </div>
                  </div>
                </div>
                {subRows.map(({ sub, activeCount, bars }) => {
                  const visible = bars
                    .map((job) => ({ job, style: weekBarStyle(job) }))
                    .filter((b) => b.style);
                  return (
                    <div className="gantt-row" key={sub.id}>
                      <div className="gantt-label-col">
                        <div className="name"><Link to={`/subcontractors/${sub.id}`} className="link-strong">{sub.name}</Link></div>
                        <div className="meta">{sub.trade || 'No trade on file'} · {activeCount} active job{activeCount === 1 ? '' : 's'}</div>
                      </div>
                      <div className="gantt-track">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={i} className="week-gridline" style={{ left: `${(i / 7) * 100}%` }} />
                        ))}
                        {todayInWeek && <div className="gantt-today" style={{ left: `${todayLeftWeek}%` }} />}
                        {visible.length === 0 ? (
                          <span className="lbl" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
                            {activeCount === 0 ? 'No jobs assigned — fully available' : 'Nothing scheduled this week'}
                          </span>
                        ) : visible.map(({ job, style }) => (
                          <Link
                            key={job.id}
                            to={`/jobs/${job.id}`}
                            className={`gantt-bar status-${job.status}`}
                            style={style}
                            title={`${job.title} — ${STATUS_LABEL[job.status] || job.status} (${job.progress_percent || 0}%)`}
                          >
                            <span className="lbl">{job.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
