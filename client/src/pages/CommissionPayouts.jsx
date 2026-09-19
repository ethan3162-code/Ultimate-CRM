// Salesman commission payout report (Sept 2026) — one week or month at a time, grouped by
// salesperson, so whoever's running payroll can see exactly what's owed. A job only shows up here
// once its customer balance is fully collected, bucketed into the period the last payment landed
// in (see server/src/helpers.js's getCommissionPayouts) — never before it's actually been earned,
// and never counted twice across periods.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';
import { useAuth } from '../auth';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function shiftWeek(anchor, dir) {
  const d = new Date(`${anchor}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dir * 7);
  return d.toISOString().slice(0, 10);
}
function shiftMonth(anchor, dir) {
  const d = new Date(`${anchor}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}
function shortDate(s) {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function CommissionPayouts() {
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState('week');
  const [anchor, setAnchor] = useState(todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load(pt, a) {
    setError(null);
    api.commissionPayouts(pt, a).then(setData).catch((e) => setError(e.message));
  }
  useEffect(() => { load(periodType, anchor); }, [periodType, anchor]);

  function shift(dir) {
    setAnchor((a) => (periodType === 'month' ? shiftMonth(a, dir) : shiftWeek(a, dir)));
  }
  function changePeriodType(pt) {
    setPeriodType(pt);
    setAnchor(todayStr());
  }

  const seesAll = data && data.scope === 'all';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Commission payouts</h1>
          <p className="sub">
            {seesAll
              ? 'Every salesperson’s earned commission, grouped by person, for the period below — a job appears once its balance is fully collected.'
              : 'Your earned commission for the period below — a project appears once its balance is fully collected.'}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className={'btn sm' + (periodType === 'week' ? ' primary' : ' subtle')} onClick={() => changePeriodType('week')}>Week</button>
            <button type="button" className={'btn sm' + (periodType === 'month' ? ' primary' : ' subtle')} onClick={() => changePeriodType('month')}>Month</button>
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn subtle sm" onClick={() => shift(-1)} aria-label="Previous period">‹ Prev</button>
            <span style={{ fontWeight: 700, minWidth: 190, textAlign: 'center' }}>{data ? data.periodLabel : '…'}</span>
            <button type="button" className="btn subtle sm" onClick={() => shift(1)} aria-label="Next period">Next ›</button>
            <button type="button" className="btn subtle sm" onClick={() => setAnchor(todayStr())}>Today</button>
          </div>
        </div>
      </div>

      {error && <div className="card"><p className="sub" style={{ color: 'var(--danger-ink, #b42318)' }}>{error}</p></div>}

      {!data ? (
        <div className="loading">Loading…</div>
      ) : data.rows.length === 0 ? (
        <div className="card">
          <div className="empty">No commissions were paid out {seesAll ? '' : 'to you '}in this period. A project shows up here once its full balance has been collected.</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {data.rows.map((row) => (
            <div className="card" key={row.salespersonUserId}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <div>
                  <div className="kicker">{row.salespersonUsername}</div>
                  <p className="sub" style={{ margin: '2px 0 0' }}>{row.percent}% of gross profit, {row.jobs.length} project{row.jobs.length === 1 ? '' : 's'}</p>
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-ink)' }}>{money(row.totalCommission)}</div>
              </div>
              <div className="table-wrap">
                <table className="list">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Paid off</th>
                      <th style={{ textAlign: 'right' }}>Gross profit</th>
                      <th style={{ textAlign: 'right' }}>Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.jobs.map((j) => (
                      <tr key={j.jobId}>
                        <td>
                          <Link to={`/jobs/${j.jobId}`} className="link-strong">{j.title}</Link>
                          {j.address && <div className="muted" style={{ fontSize: 12.5 }}>{j.address}</div>}
                        </td>
                        <td className="muted">{shortDate(j.payoutDate)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{money(j.grossProfitAmount)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{money(j.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {seesAll && data.rows.length > 1 && (
            <div className="card row between">
              <span style={{ fontWeight: 700 }}>Total across all salespeople</span>
              <span className="mono" style={{ fontWeight: 700, fontSize: 18 }}>{money(data.grandTotal)}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
