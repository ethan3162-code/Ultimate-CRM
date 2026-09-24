import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// Home page weather panel (Sept 2026) — sits in the page-head, across from the "Home" title
// (same spot Layout.jsx's search bar puts the signed-in user's name). Two fixed locations only,
// picked by the user: New York City and Long Island, NY — see server/src/weather.js for the
// coordinates and the Weather Channel/IBM Weather Company API this calls server-side (the API
// key never reaches the client). A 6-day forecast, shown 3 days at a time with a slide control
// for the next 3, per the user's own ask.
const LOCATIONS = [
  { key: 'nyc', label: 'NYC' },
  { key: 'long_island', label: 'Long Island' },
];

export default function WeatherPanel() {
  const [location, setLocation] = useState('nyc');
  const [data, setData] = useState(null); // null = loading; {configured:false} = no API key set; {error} = call failed
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    setData(null);
    setPage(0);
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
              <div className="weather-day" key={i} title={d.narrative || ''}>
                <div className="weather-day-name">{i === 0 ? 'Today' : (d.dayOfWeek || '').slice(0, 3)}</div>
                <div className="weather-day-icon">{d.icon}</div>
                <div className="weather-day-temps">
                  <span className="weather-hi">{d.high ?? '–'}°</span>
                  <span className="weather-lo">{d.low ?? '–'}°</span>
                </div>
                {d.precipChance != null && d.precipChance > 0 && (
                  <div className="weather-precip">💧{d.precipChance}%</div>
                )}
              </div>
            ))}
          </div>
          {data.days.length > 3 && page === 0 && (
            <button type="button" className="weather-nav-btn next" onClick={() => slide(1)} aria-label="Show next 3 days">›</button>
          )}
        </div>
      )}
    </div>
  );
}
