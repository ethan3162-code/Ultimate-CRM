// Viewer for a single "built-in" report (Sept 2026) — these are the fixed cards that used to be
// baked directly into the Dashboard's reports grid; they're now their own pages under
// /reports/system/:key, reachable both from the Dashboard and from the Reports list, so a report
// on the Dashboard can be clicked straight through to a full view of it. Read-only: unlike a
// custom report (ReportDetail.jsx), a built-in report's shape is fixed, so there's nothing to
// edit here.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';
import { TrendChart, ColumnChart, BarList, DonutChart } from '../components/charts';

function formatterFor(format) {
  if (format === 'money') return money;
  if (format === 'percent') return (v) => `${v}%`;
  return (v) => v;
}

export default function BuiltinReportDetail() {
  const { key } = useParams();
  const [report, setReport] = useState(null);

  useEffect(() => {
    setReport(null);
    api.builtinReport(key).then(setReport);
  }, [key]);

  if (!report) return <div className="loading">Loading…</div>;

  const formatValue = formatterFor(report.format);
  // Trend/column charts plot the money value directly on the axis, so there's nowhere sensible
  // to put a 🔒 per point the way a bar list's per-row label can — same call the Dashboard's own
  // Revenue collected/forecast cards already made.
  const hideChartForPrices = report.price_hidden && report.format === 'money' && (report.chartType === 'trend' || report.chartType === 'column');

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/reports">Reports</Link> / {report.title}</p>
          <h1 style={{ margin: 0 }}>{report.title}</h1>
        </div>
      </div>

      <div className="card">
        <div className="report-card-head">
          <p className="sub" style={{ margin: 0, maxWidth: 640 }}>{report.description}</p>
          {report.total !== undefined && report.total !== null && (
            <div className="report-card-total" style={{ color: report.total < 0 ? 'var(--red)' : undefined }}>
              {formatValue(report.total)}
            </div>
          )}
          {report.total === null && <div className="report-card-total">{money(null)}</div>}
        </div>

        <div style={{ marginTop: 14 }}>
          {hideChartForPrices ? (
            <p className="sub">🔒 Prices are hidden for your account.</p>
          ) : report.chartType === 'trend' ? (
            <TrendChart data={report.rows} valueKey={report.valueKey} labelKey={report.labelKey} formatValue={formatValue} height={260} />
          ) : report.chartType === 'column' ? (
            <ColumnChart data={report.rows} valueKey={report.valueKey} labelKey={report.labelKey} formatValue={formatValue} color={report.color} height={240} />
          ) : report.chartType === 'donut' ? (
            <DonutChart data={report.rows} valueKey={report.valueKey} labelKey={report.labelKey} size={220} />
          ) : report.chartType === 'barlist' ? (
            report.rows.length === 0 ? (
              <div className="empty">No matching records for this report yet.</div>
            ) : (
              <BarList data={report.rows} valueKey={report.valueKey} labelKey={report.labelKey} formatValue={formatValue} colorKey={report.colorKey} />
            )
          ) : report.chartType === 'stats' ? (
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              {report.stats.map((s) => (
                <div className="kpi" key={s.label}>
                  <div className="label">{s.label}</div>
                  <div className="value">{formatterFor(s.format)(s.value)}</div>
                </div>
              ))}
            </div>
          ) : report.chartType === 'joblist' ? (
            <>
              {report.extra?.margin !== null && report.extra?.margin !== undefined && (
                <p className="sub" style={{ margin: '-4px 0 10px' }}>Overall margin: {report.extra.margin}%.</p>
              )}
              {report.rows.length === 0 ? (
                <div className="empty">Log expenses on a job to see profitability here.</div>
              ) : (
                <div className="stack" style={{ gap: 2 }}>
                  {report.rows.map((j) => (
                    <Link key={j.id} to={`/jobs/${j.id}`} className="attention-row">
                      <span>{j.title}</span>
                      <span className="mono" style={{ color: j.profit < 0 ? 'var(--red)' : 'var(--accent-ink)' }}>
                        {money(j.profit)}{j.margin !== null ? ` · ${j.margin}%` : ''}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {report.extra?.undatedForecastValue > 0 && (
            <p className="sub" style={{ margin: '10px 0 0' }}>Plus {money(report.extra.undatedForecastValue)} weighted in open deals with no expected close date set yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
