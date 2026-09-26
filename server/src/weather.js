// Open-Meteo daily-forecast integration for the Home page's weather panel (Sept 2026) — free,
// no-signup, no-API-key public weather API (switched to this from the Weather Channel/IBM Weather
// Company API, which needs an enterprise partner key the user didn't have on hand). Nothing here
// needs configuring, so isConfigured() always returns true — kept as a function anyway so
// routes/weather.js and WeatherPanel.jsx (which both check it) don't need to change if a paid
// provider ever replaces this later.
//
// Two fixed locations only, per the user's own ask — not user-editable, so no client-supplied
// lat/lon ever reaches this API:
//   nyc         — New York City (Manhattan)                        40.7128, -74.0060
//   long_island — Long Island, NY (Garden City, central Nassau Co.) 40.7268, -73.6343

const LOCATIONS = {
  nyc: { label: 'New York City', lat: 40.7128, lon: -74.0060 },
  long_island: { label: 'Long Island, NY', lat: 40.7268, lon: -73.6343 },
};

const CACHE_MS = 30 * 60 * 1000; // 30 min — plenty fresh for a 5-day outlook, keeps well under Open-Meteo's fair-use rate limit
const cache = new Map(); // locationKey -> { at, data }

function isConfigured() {
  return true; // Open-Meteo needs no signup or API key — always available.
}

// Open-Meteo's `weather_code` is the standard WMO weather-interpretation code table
// (https://open-meteo.com/en/docs) — mapped to one representative emoji + short label per
// family, rather than pulling in an icon asset pack (same call as the Dashboard's own
// hand-rolled SVG/CSS charts).
const CODE_INFO = {
  0: ['☀️', 'Clear sky'],
  1: ['🌤️', 'Mainly clear'],
  2: ['⛅', 'Partly cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'],
  48: ['🌫️', 'Freezing fog'],
  51: ['🌦️', 'Light drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌦️', 'Dense drizzle'],
  56: ['🧊', 'Freezing drizzle'],
  57: ['🧊', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'],
  63: ['🌧️', 'Rain'],
  65: ['🌧️', 'Heavy rain'],
  66: ['🧊', 'Freezing rain'],
  67: ['🧊', 'Freezing rain'],
  71: ['🌨️', 'Light snow'],
  73: ['🌨️', 'Snow'],
  75: ['🌨️', 'Heavy snow'],
  77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Light showers'],
  81: ['🌧️', 'Showers'],
  82: ['🌧️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'],
  86: ['🌨️', 'Heavy snow showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm with hail'],
  99: ['⛈️', 'Severe thunderstorm with hail'],
};
function codeInfo(code) {
  return CODE_INFO[code] || ['🌡️', ''];
}

// Open-Meteo's hourly `time` values come back as local (America/New_York, per the `timezone`
// query param) but offset-less strings like "2026-09-24T14:00" — read the hour straight out of
// the string rather than handing it to `new Date()`, which would reinterpret it in whatever
// timezone the server (or, if this were ever called client-side, the viewer's browser) is in.
function formatHour(t) {
  const h = parseInt(t.slice(11, 13), 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

async function fetchDaily(locKey) {
  const loc = LOCATIONS[locKey];
  if (!loc) throw new Error('unknown location');
  const cached = cache.get(locKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather API responded ${res.status}`);
  const body = await res.json();
  const daily = body.daily || {};
  const hourly = body.hourly || {};

  // Group the flat hourly arrays by their date (first 10 chars of the local timestamp) so each
  // day already carries its own 24-hour strip — the client never has to slice timestamps itself.
  const hoursByDate = new Map();
  (hourly.time || []).forEach((t, i) => {
    const date = t.slice(0, 10);
    if (!hoursByDate.has(date)) hoursByDate.set(date, []);
    const [icon] = codeInfo(hourly.weather_code ? hourly.weather_code[i] : null);
    hoursByDate.get(date).push({
      hourLabel: formatHour(t),
      temp: hourly.temperature_2m && hourly.temperature_2m[i] != null ? Math.round(hourly.temperature_2m[i]) : null,
      icon,
      precipChance: hourly.precipitation_probability ? hourly.precipitation_probability[i] ?? null : null,
    });
  });

  const days = (daily.time || []).map((date, i) => {
    const [icon, narrative] = codeInfo(daily.weather_code ? daily.weather_code[i] : null);
    // Noon (rather than midnight) so the weekday name doesn't shift a day from a timezone quirk.
    const dayOfWeek = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
    return {
      date,
      dayOfWeek,
      high: daily.temperature_2m_max && daily.temperature_2m_max[i] != null ? Math.round(daily.temperature_2m_max[i]) : null,
      low: daily.temperature_2m_min && daily.temperature_2m_min[i] != null ? Math.round(daily.temperature_2m_min[i]) : null,
      icon,
      narrative,
      precipChance: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] ?? null : null,
      hours: hoursByDate.get(date) || [],
    };
  });

  const data = { location: loc.label, days };
  cache.set(locKey, { at: Date.now(), data });
  return data;
}

module.exports = { isConfigured, fetchDaily, LOCATIONS };
