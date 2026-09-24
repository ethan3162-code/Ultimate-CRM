// Weather Channel (IBM/The Weather Company) daily-forecast integration for the Home page's
// weather panel (Sept 2026) — same isConfigured()-gated, best-effort pattern as mailer.js/sms.js/
// google.js: everything here is a no-op until WEATHER_API_KEY is set (Render dashboard), and
// every call is wrapped so a bad/missing key never breaks the Home page — the panel just shows
// "not configured" instead.
//
// Two fixed locations only, per the user's own ask — not user-editable, so no client-supplied
// lat/lon ever reaches this API:
//   nyc         — New York City (Manhattan)                        40.7128, -74.0060
//   long_island — Long Island, NY (Garden City, central Nassau Co.) 40.7268, -73.6343
//
// Uses TWC's v3 daily-forecast endpoint (the same one behind weather.com's own site and most
// "Weather Channel API" integrations): GET /v3/wx/forecast/daily/7day, apiKey as a query param.
// We only ever surface 6 of the 7 returned days (today + 5) per the user's "6 day forecast" ask —
// shown 3 at a time on the client with a slide control for the next 3.

const LOCATIONS = {
  nyc: { label: 'New York City', lat: 40.7128, lon: -74.0060 },
  long_island: { label: 'Long Island, NY', lat: 40.7268, lon: -73.6343 },
};

const CACHE_MS = 30 * 60 * 1000; // 30 min — plenty fresh for a 6-day outlook, keeps this well under any per-key rate limit
const cache = new Map(); // locationKey -> { at, data }

function isConfigured() {
  return Boolean(process.env.WEATHER_API_KEY);
}

// TWC's `iconCode` is a 0-47 numeric condition code (the long-standing weather.com/WSI icon set).
// Mapped to one representative emoji per family rather than pulling in an icon asset pack — same
// "no new dependency for a simple visual" call as the Dashboard's own hand-rolled SVG/CSS charts.
function iconFor(code) {
  if (code === null || code === undefined) return '🌡️';
  const n = Number(code);
  if ([0, 1, 2].includes(n)) return '🌀'; // tropical storm / hurricane
  if ([3, 4, 37, 38, 47].includes(n)) return '⛈️'; // (severe) thunderstorms
  if ([5, 6, 7, 8, 13, 14, 15, 16, 41, 42, 43, 46].includes(n)) return '🌨️'; // snow / flurries / snow showers
  if ([9, 11, 12].includes(n)) return '🌧️'; // drizzle / rain / heavy rain
  if ([10, 17, 18, 35].includes(n)) return '🧊'; // freezing rain / hail / sleet / rain-hail mix
  if ([19, 20, 21, 22].includes(n)) return '🌫️'; // dust / fog / haze / smoke
  if ([23, 24].includes(n)) return '💨'; // windy / breezy
  if ([25].includes(n)) return '❄️'; // cold
  if ([26, 27, 28].includes(n)) return '☁️'; // cloudy / mostly cloudy
  if ([29, 33].includes(n)) return '🌙'; // partly clear night
  if ([30, 31].includes(n)) return '🌙'; // clear / fair night
  if ([32, 34].includes(n)) return '☀️'; // sunny / mostly clear
  if ([36].includes(n)) return '🥵'; // hot
  if ([39, 40, 45].includes(n)) return '🌦️'; // scattered showers
  if ([44].includes(n)) return '🌤️'; // partly cloudy
  return '🌡️';
}

async function fetchDaily(locKey) {
  const loc = LOCATIONS[locKey];
  if (!loc) throw new Error('unknown location');
  const cached = cache.get(locKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const url = `https://api.weather.com/v3/wx/forecast/daily/7day?geocode=${loc.lat},${loc.lon}&units=e&language=en-US&format=json&apiKey=${process.env.WEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather API responded ${res.status}`);
  const body = await res.json();

  const dp = body.daypart && body.daypart[0];
  const days = (body.dayOfWeek || []).slice(0, 6).map((dayOfWeek, i) => {
    // Each day's daypart arrays are laid out [day, night, day, night, ...] — the day-part
    // (index i*2) has the more useful narrative/precip for a Home-page card; fall back to the
    // night part (i*2+1) for a day whose "day" part has already passed (TWC returns null for it).
    const dayIdx = i * 2;
    const nightIdx = i * 2 + 1;
    const iconCode = dp?.iconCode?.[dayIdx] ?? dp?.iconCode?.[nightIdx];
    const narrative = dp?.narrative?.[dayIdx] ?? dp?.narrative?.[nightIdx] ?? body.narrative?.[i] ?? '';
    const precipChance = dp?.precipChance?.[dayIdx] ?? dp?.precipChance?.[nightIdx] ?? null;
    return {
      date: body.validTimeLocal?.[i] ? body.validTimeLocal[i].slice(0, 10) : null,
      dayOfWeek,
      high: body.calendarDayTemperatureMax?.[i] ?? body.temperatureMax?.[i] ?? null,
      low: body.calendarDayTemperatureMin?.[i] ?? body.temperatureMin?.[i] ?? null,
      icon: iconFor(iconCode),
      narrative,
      precipChance,
    };
  });

  const data = { location: loc.label, days };
  cache.set(locKey, { at: Date.now(), data });
  return data;
}

module.exports = { isConfigured, fetchDaily, LOCATIONS };
