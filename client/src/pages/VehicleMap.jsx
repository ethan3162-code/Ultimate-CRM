// Fleet-wide view of every non-retired vehicle's last GPS check-in (see server/src/routes/vehicles.js's
// GET /locations/latest). This is the "see locations" half of live tracking — the other half,
// reporting a position, happens per-vehicle on VehicleDetail's "Share my location" toggle.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { timeAgo, minutesSince, mapLinksForCoords } from '../utils';
import LeafletMap from '../components/LeafletMap';

// Green while a check-in is fresh enough to trust as "roughly where the vehicle is now", amber
// once it's gotten stale enough to be a stronger caveat, grey beyond that — same 60s ping
// interval as VehicleDetail, so anything past a few minutes already means sharing stopped or the
// page was closed.
function freshnessColor(recordedAt) {
  const mins = minutesSince(recordedAt);
  if (mins === null) return 'var(--muted)';
  if (mins <= 5) return 'var(--green, #3E7C4A)';
  if (mins <= 60) return 'var(--amber, #B8791A)';
  return 'var(--muted)';
}

export default function VehicleMap() {
  const [vehicles, setVehicles] = useState(null);

  function load() {
    api.fleetLocations().then(setVehicles).catch(() => setVehicles([]));
  }
  useEffect(() => {
    load();
    const handle = setInterval(load, 30000);
    return () => clearInterval(handle);
  }, []);

  if (!vehicles) return <div className="loading">Loading…</div>;

  const located = vehicles.filter((v) => v.location);
  const unlocated = vehicles.filter((v) => !v.location);

  const markers = located.map((v) => ({
    lat: v.location.lat, lng: v.location.lng, color: freshnessColor(v.location.recorded_at),
    popupHtml: `<div class="vehicle-map-popup"><strong>${v.name}</strong>${v.assigned_employee_name ? `${v.assigned_employee_name} · ` : ''}${timeAgo(v.location.recorded_at)}</div>`,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/vehicles">Vehicles</Link> / Map</p>
          <h1>Fleet map</h1>
          <p className="sub">Last known position for each active vehicle, from phone check-ins — refreshes every 30 seconds.</p>
        </div>
      </div>

      <div className="card">
        <LeafletMap markers={markers} height={440} />
        <div className="fleet-map-legend">
          <span><span className="dot" style={{ background: 'var(--green, #3E7C4A)' }} /> Checked in within 5 min</span>
          <span><span className="dot" style={{ background: 'var(--amber, #B8791A)' }} /> Within the last hour</span>
          <span><span className="dot" style={{ background: 'var(--muted)' }} /> Older / not currently sharing</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Reporting a location ({located.length})</h2>
          {located.length === 0 ? <div className="empty">No vehicle has checked in yet.</div> : (
            <div className="stack" style={{ gap: 2 }}>
              {located.map((v) => (
                <div className="attention-row" key={v.id}>
                  <Link to={`/vehicles/${v.id}`} className="link-strong">{v.name}</Link>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="muted" style={{ fontSize: 12.5 }}>{timeAgo(v.location.recorded_at)}</span>
                    <a href={mapLinksForCoords(v.location.lat, v.location.lng).view} target="_blank" rel="noreferrer" className="link-strong" style={{ fontSize: 12.5 }}>Maps ↗</a>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h2>No check-in yet ({unlocated.length})</h2>
          {unlocated.length === 0 ? <div className="empty">Every active vehicle has reported at least once.</div> : (
            <div className="stack" style={{ gap: 2 }}>
              {unlocated.map((v) => (
                <div className="attention-row" key={v.id}>
                  <Link to={`/vehicles/${v.id}`} className="link-strong">{v.name}</Link>
                  <span className="muted" style={{ fontSize: 12.5 }}>{v.assigned_employee_name || 'Unassigned'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
