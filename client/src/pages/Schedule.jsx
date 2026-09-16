import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const STATUS_LABEL = { scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const STAGE_LABEL = { demo: 'Demo', material_order: 'Material order', installation: 'Installation', final_walkthrough: 'Final walkthrough' };
const DAY_MS = 86400000;

function toDate(d) {
  return new Date(d + 'T00:00:00');
}
function fmt(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Schedule() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    api.jobs().then(setJobs);
  }, []);

  const scheduled = useMemo(() => {
    if (!jobs) return [];
    return jobs
      .filter((j) => j.start_date && j.end_date)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [jobs]);

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Project schedule</h1>
          <p className="sub">Every job with a start and end date, laid out as a timeline — progress bars come straight from each job's own record.</p>
        </div>
      </div>

      {!jobs ? <div className="loading">Loading…</div> : scheduled.length === 0 ? (
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
                  <Link to={`/jobs/${job.id}`} className={`gantt-bar status-${job.status}`} style={barStyle(job)} title={job.stage ? `${STAGE_LABEL[job.stage] || job.stage} (${job.progress_percent || 0}%)` : `${job.progress_percent || 0}% complete`}>
                    <div className="fill" style={{ width: `${job.progress_percent || 0}%` }} />
                    <span className="lbl">{job.stage ? STAGE_LABEL[job.stage] || job.stage : `${job.progress_percent || 0}%`}</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
