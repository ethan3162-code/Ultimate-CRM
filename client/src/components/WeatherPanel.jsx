import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// Home page weather panel (Sept 2026) — sits in the page-head, across from the "Home" title
// (same spot Layout.jsx's search bar puts the signed-in user's name). Two fixed locations only,
// picked by the user: New York City and Long Island, NY — see server/src/weather.js for the
// coordinates and the free Open-Meteo API this calls server-side. A 6-day forecast, shown 3 days
// at a time with a slide control for the next 3, per the user's own ask. Pressing a day opens its
// hour-by-hour breakdown (also the user's own ask) in a modal, reusing the app's existing
// modal-overlay/modal-card pattern.
const LOCATIONS = [
  { key: 'nyc', label: 'NYC' },
  { key: 'long_island', label: 'Long Island' },
];

export default function WeatherPanel() {
  const [location, setLocation] = useState('nyc');
  const [data, setData] = useState(null); // null = loading; {configured:false} = no API key set; {error} = call failed
  const [page, setPage] = useState(0);
  const [openDay, setOpenDay] = useState(null); // the clicked day's own object, or null when the hourly modal is closed
  const scrollRef = useRef(null);

  useEffect(() => {
    setData(null);
    setPage(0);
    setOpenDay(null);
    api.weather(location)
      .then(setData)
      .catch(() => setData({ configured: true, error: 'unavailable' }));
  }, [location]);

  function slide(dir) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  }

  function onScroll(e) {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  }

  // Nothing on file yet — no dead space in the header while the key isn't set up.
  if (data && data.configured === false) return null;

  return (
    <div className="weather-panel">
      <div className="weather-head">
        <span className="weather-title">{(data && data.location) || 'Weather'}</span>
        <div className="weather-toggle">
          {LOCATIONS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={'weather-toggle-btn' + (location === l.key ? ' active' : '')}
              onClick={() => setLocation(l.key)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <div className="weather-empty">Loading…</div>
      ) : data.error ? (
        <div className="weather-empty">Weather unavailable right now.</div>
      ) : (
        <div className="weather-scroll-wrap">
          {page > 0 && (
            <button type="button" className="weather-nav-btn prev" onClick={() => slide(-1)} aria-label="Show previous days">‹</button>
          )}
          <div className="weather-scroll" ref={scrollRef} onScroll={onScroll}>
            {data.days.map((d, i) => (
              <button
                type="button"
                className="weather-day"
                key={i}
                title={(d.narrative ? d.narrative + ' — ' : '') + 'see the hour-by-hour forecast'}
                onClick={() => setOpenDay(d)}
              >
                <div className="weather-day-name">{i === 0 ? 'Today' : (d.dayOfWeek || '').slice(0, 3)}</div>
                <div className="weather-day-icon">{d.icon}</div>
                <div className="weather-day-temps">
                  <span className="weather-hi">{d.high ?? '–'}°</span>
                  <span className="weather-lo">{d.low ?? '–'}°</span>
                </div>
                {d.precipChance != null && d.precipChance > 0 && (
                  <div className="weather-precip">💧{d.precipChance}%</div>
                )}
              </button>
            ))}
          </div>
          {data.days.length > 3 && page === 0 && (
            <button type="button" className="weather-nav-btn next" onClick={() => slide(1)} aria-label="Show next 3 days">›</button>
          )}
        </div>
      )}

      {openDay && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpenDay(null)}>
          <div className="modal-card wide">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3>{openDay.dayOfWeek}</h3>
                <p className="sub" style={{ margin: 0 }}>
                  {(data && data.location) || ''}{openDay.narrative ? ` · ${openDay.narrative}` : ''}
                  {openDay.high != null ? ` · ${openDay.high}°/${openDay.low}°` : ''}
                </p>
              </div>
              <button type="button" className="btn sm subtle" onClick={() => setOpenDay(null)}>Close</button>
            </div>
            {openDay.hours && openDay.hours.length > 0 ? (
              <div className="weather-hourly-scroll">
                {openDay.hours.map((h, i) => (
                  <div className="weather-hour" key={i}>
                    <div className="weather-hour-label">{h.hourLabel}</div>
                    <div className="weather-hour-icon">{h.icon}</div>
                    <div className="weather-hour-temp">{h.temp ?? '–'}°</div>
                    {h.precipChance != null && h.precipChance > 0 && (
                      <div className="weather-hour-precip">💧{h.precipChance}%</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ marginTop: 14 }}>No hourly data for this day.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
