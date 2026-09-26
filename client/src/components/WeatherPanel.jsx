import { useEffect, useState } from 'react';
import { api } from '../api';

// Home page weather panel (Sept 2026) — sits in the page-head, across from the "Home" title
// (same spot Layout.jsx's search bar puts the signed-in user's name). Two fixed locations, per
// the user's own ask — New York City on top, Long Island, NY on the bottom, both always shown at
// once in the same widget (no more location toggle) — see server/src/weather.js for the
// coordinates and the free Open-Meteo API this calls server-side. A 5-day forecast per location,
// all shown at once, per the user's own ask. Each row is laid out with the (short) location label
// on the left and its 5 day tiles filling the rest of the row to the right — also the user's own
// ask, and a slimmer look than the old label-above-tiles layout it replaced. Pressing a day opens
// its hour-by-hour breakdown (also the user's own ask) in a modal, reusing the app's existing
// modal-overlay/modal-card pattern; the modal keeps the fuller server-provided location name
// (e.g. "Long Island, NY") since it has more room than the row's own compact label.
const LOCATIONS = [
  { key: 'nyc', label: 'NYC' },
  { key: 'long_island', label: 'Long Island' },
];

export default function WeatherPanel() {
  const [data, setData] = useState({}); // locationKey -> undefined (loading) | {location,days} | {error}
  const [openDay, setOpenDay] = useState(null); // { locationLabel, day } for the clicked day, or null when the hourly modal is closed

  useEffect(() => {
    let cancelled = false;
    LOCATIONS.forEach((l) => {
      api.weather(l.key)
        .then((d) => { if (!cancelled) setData((prev) => ({ ...prev, [l.key]: d })); })
        .catch(() => { if (!cancelled) setData((prev) => ({ ...prev, [l.key]: { error: 'unavailable' } })); });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="weather-panel">
      {LOCATIONS.map((l) => {
        const d = data[l.key];
        return (
          <div className="weather-row" key={l.key}>
            <div className="weather-title">{l.label}</div>
            {!d ? (
              <div className="weather-empty">Loading…</div>
            ) : d.error ? (
              <div className="weather-empty">Weather unavailable right now.</div>
            ) : (
              <div className="weather-days-row">
                {d.days.map((day, i) => (
                  <button
                    type="button"
                    className="weather-day"
                    key={i}
                    title={(day.narrative ? day.narrative + ' — ' : '') + 'see the hour-by-hour forecast'}
                    onClick={() => setOpenDay({ locationLabel: d.location || l.label, day })}
                  >
                    <div className="weather-day-name">{i === 0 ? 'Today' : (day.dayOfWeek || '').slice(0, 3)}</div>
                    <div className="weather-day-icon">{day.icon}</div>
                    <div className="weather-day-temps">
                      <span className="weather-hi">{day.high ?? '–'}°</span>
                      <span className="weather-lo">{day.low ?? '–'}°</span>
                    </div>
                    {day.precipChance != null && day.precipChance > 0 && (
                      <div className="weather-precip">💧{day.precipChance}%</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {openDay && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpenDay(null)}>
          <div className="modal-card wide">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3>{openDay.day.dayOfWeek}</h3>
                <p className="sub" style={{ margin: 0 }}>
                  {openDay.locationLabel}{openDay.day.narrative ? ` · ${openDay.day.narrative}` : ''}
                  {openDay.day.high != null ? ` · ${openDay.day.high}°/${openDay.day.low}°` : ''}
                </p>
              </div>
              <button type="button" className="btn sm subtle" onClick={() => setOpenDay(null)}>Close</button>
            </div>
            {openDay.day.hours && openDay.day.hours.length > 0 ? (
              <div className="weather-hourly-scroll">
                {openDay.day.hours.map((h, i) => (
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
