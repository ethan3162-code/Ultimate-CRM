import { useEffect, useRef, useState } from 'react';

// Small hand-rolled chart primitives — no charting library, consistent with
// the rest of the app (the Gantt/segmented-progress bars are hand-built too).
// Every chart is plain SVG + CSS so it themes with the app's existing tokens
// and needs no extra dependency.

const PALETTE = ['var(--accent)', 'var(--amber)', 'var(--red)', 'var(--muted)', 'var(--accent-ink)'];

/** Smooth-ish area/line trend chart (e.g. revenue by month). */
export function TrendChart({ data, valueKey = 'value', labelKey = 'label', formatValue = (v) => v, height = 180 }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padTop = 20, padBottom = 28, padX = 8;
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padTop + innerH - (d[valueKey] / max) * innerH;
    return { x, y, d };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? padX} ${padTop + innerH} L ${padX} ${padTop + innerH} Z`;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="chart-trend">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={width - padX} y1={padTop + innerH * f} y2={padTop + innerH * f} className="chart-gridline" />
        ))}
        {points.length > 1 && <path d={areaPath} fill="url(#trendFill)" stroke="none" />}
        {points.length > 1 && <path d={linePath} fill="none" className="chart-line" vectorEffect="non-scaling-stroke" />}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" className="chart-dot" />
            {p.d[valueKey] > 0 && (
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="chart-value-label">{formatValue(p.d[valueKey])}</text>
            )}
            <text x={p.x} y={height - 8} textAnchor="middle" className="chart-axis-label">{p.d[labelKey]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Vertical bar chart (e.g. jobs by month). */
export function ColumnChart({ data, valueKey = 'value', labelKey = 'label', formatValue = (v) => v, height = 160, color = 'var(--accent)' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="chart-columns" style={{ height }}>
      {data.map((d, i) => (
        <div className="chart-col" key={i}>
          <div className="chart-col-value">{d[valueKey] > 0 ? formatValue(d[valueKey]) : ''}</div>
          <div className="chart-col-track">
            <div className="chart-col-bar" style={{ height: `${(d[valueKey] / max) * 100}%`, background: color }} />
          </div>
          <div className="chart-col-label">{d[labelKey]}</div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal ranked bars (e.g. invoice aging, top customers). */
export function BarList({ data, valueKey = 'value', labelKey = 'label', formatValue = (v) => v, colorKey }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="chart-barlist">
      {data.map((d, i) => (
        <div className="chart-barlist-row" key={i}>
          <div className="chart-barlist-label">{d[labelKey]}</div>
          <div className="chart-barlist-track">
            <div
              className="chart-barlist-bar"
              style={{ width: `${Math.max(2, (d[valueKey] / max) * 100)}%`, background: colorKey ? d[colorKey] : 'var(--accent)' }}
            />
          </div>
          <div className="chart-barlist-value mono">{formatValue(d[valueKey])}</div>
        </div>
      ))}
    </div>
  );
}

/** Donut chart (e.g. jobs by status). */
export function DonutChart({ data, valueKey = 'value', labelKey = 'label', size = 150 }) {
  const total = data.reduce((s, d) => s + d[valueKey], 0) || 1;
  const r = 50, cx = 60, cy = 60, stroke = 18;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = data.map((d, i) => {
    const frac = d[valueKey] / total;
    const seg = { ...d, frac, offset, color: PALETTE[i % PALETTE.length] };
    offset += frac;
    return seg;
  });

  return (
    <div className="chart-donut-wrap">
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={stroke} />
        {segments.filter((s) => s.frac > 0).map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${s.frac * circumference} ${circumference}`}
            strokeDashoffset={-s.offset * circumference}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="chart-donut-total">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="chart-donut-total-label">jobs</text>
      </svg>
      <div className="chart-legend">
        {segments.map((s, i) => (
          <div className="chart-legend-row" key={i}>
            <span className="chart-legend-swatch" style={{ background: s.color }} />
            <span className="chart-legend-label">{s[labelKey]}</span>
            <span className="chart-legend-value mono">{s[valueKey]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
