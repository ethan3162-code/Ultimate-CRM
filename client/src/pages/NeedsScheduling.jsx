// Needs Scheduling (Sept 2026) — a project lands here the moment it's created, whether that's
// automatically (a customer signs an estimate — see helpers.js's createProjectFromDeal, which
// sets status='pending_schedule') or manually from the Projects page. It's a read-only rollup,
// same pattern as Schedule.jsx's own gantt view: the actual scheduling action (setting a start
// date, assigning a crew, moving the status forward) stays on the Project page itself — this is
// just the queue that says which projects are still waiting on that. A project drops off this
// list as soon as its status is moved off "Pending Schedule" there.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { shortDate, timeAgo, accountName, money } from '../utils';

export default function NeedsScheduling() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    api.jobs().then(setJobs);
  }, []);

  const queue = useMemo(() => {
    if (!jobs) return [];
    return jobs
      .filter((j) => j.status === 'pending_schedule')
      // Whichever's been waiting longest goes on top — that's the one most overdue for a call.
      // A desired start date the customer already asked for takes priority over that, though.
      .sort((a, b) => {
        if (a.desired_start_date && b.desired_start_date) return new Date(a.desired_start_date) - new Date(b.desired_start_date);
        if (a.desired_start_date) return -1;
        if (b.desired_start_date) return 1;
        return new Date(a.created_at) - new Date(b.created_at);
      });
  }, [jobs]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Needs Scheduling</h1>
          <p className="sub">Every project waiting on a start date — a signed estimate lands a project here automatically. Set its schedule on the project page to move it off this list.</p>
        </div>
      </div>

      {jobs === null ? (
        <div className="loading">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="empty">Nothing waiting — every project has been scheduled.</div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {queue.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="card" style={{ display: 'block' }}>
              <div className="row between">
                <div>
                  <span className="link-strong">{job.title}</span>
                  <span className="sub"> — {accountName(job, job.title)}</span>
                </div>
                <span className="pill amber">Pending Schedule</span>
              </div>
              <p className="sub" style={{ margin: '4px 0 0' }}>
                {job.address || 'No address on file'}
                {' · '}Created {timeAgo(job.created_at)}
                {job.desired_start_date && <> · Customer asked for <strong>{shortDate(job.desired_start_date)}</strong></>}
              </p>
              {!job.price_hidden && job.contract_amount > 0 && (
                <p className="sub" style={{ margin: '2px 0 0' }}>Contract amount: <span className="mono">{money(job.contract_amount)}</span></p>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

