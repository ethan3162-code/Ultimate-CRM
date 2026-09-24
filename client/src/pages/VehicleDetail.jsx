import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, dateTime, fileToDataUrl, mapLinksForCoords } from '../utils';
import { usePermission } from '../auth';
import LeafletMap from '../components/LeafletMap';

// How often to check in a new GPS position while "share my location" is on. Purely a client-side
// polling interval — see server/src/routes/vehicles.js's POST /:id/location for why this is a
// check-in model rather than a continuous hardware GPS feed.
const LOCATION_PING_MS = 60000;

const STATUS_LABEL = { active: 'Active', in_shop: 'In shop', retired: 'Retired' };
const STATUSES = ['active', 'in_shop', 'retired'];
const COMPLIANCE_PILL = { expired: 'red', expiring: 'amber', ok: 'green', none: '' };
const COMPLIANCE_LABEL = { expired: 'Expired', expiring: 'Expiring soon', ok: 'Current', none: 'No expiry set' };
const DOC_TYPES = ['Registration', 'Insurance', 'Inspection', 'Other'];
const BLANK_MAINTENANCE = { service_date: '', description: '', cost: '', odometer: '' };

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = usePermission('vehicles');
  const [vehicle, setVehicle] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newDoc, setNewDoc] = useState({ doc_type: 'Registration', expiry_date: '' });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [maintForm, setMaintForm] = useState(BLANK_MAINTENANCE);
  const [loggingMaint, setLoggingMaint] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [geoError, setGeoError] = useState('');
  const idRef = useRef(id);
  idRef.current = id;

  function load() {
    api.vehicle(id).then((v) => {
      setVehicle(v);
      setForm({
        name: v.name || '', make: v.make || '', model: v.model || '', year: v.year || '',
        vin: v.vin || '', license_plate: v.license_plate || '', odometer: v.odometer || '', notes: v.notes || '',
      });
    });
  }
  useEffect(load, [id]);
  useEffect(() => { api.employees().then(setEmployees).catch(() => setEmployees([])); }, []);

  // Stop sharing if the user navigates to a different vehicle without explicitly stopping first.
  useEffect(() => { setSharing(false); }, [id]);

  function pingLocation() {
    if (!navigator.geolocation) {
      setGeoError('Location is not available in this browser.');
      setSharing(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoError('');
        api.reportVehicleLocation(idRef.current, {
          lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        }).then(load).catch(() => {});
      },
      (err) => setGeoError(err.message || 'Could not get your location.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function toggleSharing() {
    if (sharing) { setSharing(false); return; }
    setGeoError('');
    setSharing(true);
    pingLocation();
  }

  // While sharing is on, check in a fresh position every LOCATION_PING_MS — this is the entire
  // "live" part of live tracking: a phone with this page open re-reports its GPS position on a
  // timer, it isn't a background feed that keeps running once the page is closed.
  useEffect(() => {
    if (!sharing) return;
    const handle = setInterval(pingLocation, LOCATION_PING_MS);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  async function saveInfo(e) {
    e.preventDefault();
    setSaving(true);
    await api.updateVehicle(id, form);
    setSaving(false);
    setEditing(false);
    load();
  }

  async function changeStatus(status) {
    await api.updateVehicle(id, { status });
    load();
  }

  async function changeDriver(e) {
    await api.updateVehicle(id, { assigned_employee_id: e.target.value || null });
    load();
  }

  async function removeVehicle() {
    if (!window.confirm(`Delete ${vehicle.name}? This can't be undone.`)) return;
    await api.deleteVehicle(id);
    navigate('/vehicles');
  }

  async function uploadDoc(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    try {
      const data_url = await fileToDataUrl(file);
      await api.addVehicleDocument(id, { doc_type: newDoc.doc_type, expiry_date: newDoc.expiry_date || null, file_name: file.name, data_url });
      setNewDoc({ doc_type: 'Registration', expiry_date: '' });
      load();
    } finally {
      setUploadingDoc(false);
    }
  }

  async function updateExpiry(docId, expiry_date) {
    await api.updateVehicleDocument(docId, { expiry_date: expiry_date || null });
    load();
  }

  async function removeDoc(docId) {
    await api.deleteVehicleDocument(docId);
    load();
  }

  async function logMaintenance(e) {
    e.preventDefault();
    if (!maintForm.service_date || !maintForm.description.trim()) return;
    setLoggingMaint(true);
    try {
      await api.addVehicleMaintenance(id, {
        service_date: maintForm.service_date, description: maintForm.description,
        cost: Number(maintForm.cost) || 0, odometer: maintForm.odometer ? Number(maintForm.odometer) : undefined,
      });
      setMaintForm(BLANK_MAINTENANCE);
      load();
    } finally {
      setLoggingMaint(false);
    }
  }

  async function removeMaintenance(entryId) {
    await api.deleteVehicleMaintenance(entryId);
    load();
  }

  if (!vehicle) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/vehicles">Vehicles</Link> / {vehicle.name}</p>
          <h1>{vehicle.name} <span className={'pill ' + (vehicle.status === 'active' ? 'green' : vehicle.status === 'in_shop' ? 'amber' : 'red')} style={{ marginLeft: 8, verticalAlign: 'middle' }}>{STATUS_LABEL[vehicle.status]}</span></h1>
          <p className="sub">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}{vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}</p>
        </div>
        {canEdit && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {STATUSES.map((s) => (
              <button key={s} className={'btn sm' + (vehicle.status === s ? ' primary' : '')} onClick={() => changeStatus(s)}>{STATUS_LABEL[s]}</button>
            ))}
            <button className="btn sm subtle" onClick={removeVehicle}>Delete</button>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card section-card accent-blue">
            <div className="row between" style={{ marginBottom: editing ? 10 : 6 }}>
              <h2 className="section-label" style={{ margin: 0 }}>Vehicle info</h2>
              {!editing && canEdit && <button className="btn sm subtle" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <form onSubmit={saveInfo} className="stack" style={{ gap: 10 }}>
                <div className="field"><label>Name / label</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="field"><label>Make</label><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
                <div className="field"><label>Model</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
                <div className="field"><label>Year</label><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                <div className="field"><label>License plate</label><input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} /></div>
                <div className="field"><label>VIN</label><input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
                <div className="field"><label>Odometer</label><input type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} /></div>
                <div className="field"><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditing(false); load(); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">VIN</span><span className="mono">{vehicle.vin || '—'}</span></div>
                <div className="row between"><span className="muted">License plate</span><span>{vehicle.license_plate || '—'}</span></div>
                <div className="row between"><span className="muted">Odometer</span><span className="mono">{vehicle.odometer ? `${vehicle.odometer.toLocaleString()} mi` : '—'}</span></div>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <span className="muted">Assigned driver</span>
                  {canEdit ? (
                    <select value={vehicle.assigned_employee_id || ''} onChange={changeDriver} style={{ maxWidth: 200 }}>
                      <option value="">— unassigned —</option>
                      {employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                    </select>
                  ) : (
                    <span>{vehicle.assigned_employee_name || '—'}</span>
                  )}
                </div>
                <div className="row between" style={{ alignItems: 'flex-start' }}><span className="muted">Notes</span><span style={{ textAlign: 'right' }}>{vehicle.notes || '—'}</span></div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ marginBottom: 4 }}>Compliance documents</h2>
              <span className={'pill ' + COMPLIANCE_PILL[vehicle.compliance_status]}>{COMPLIANCE_LABEL[vehicle.compliance_status]}</span>
            </div>
            <p className="sub" style={{ margin: '4px 0 12px' }}>The office gets emailed automatically when registration, insurance, or inspection is expired or expiring within 30 days.</p>

            {canEdit && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--line-soft)', paddingBottom: 14 }}>
                <select value={newDoc.doc_type} onChange={(e) => setNewDoc({ ...newDoc, doc_type: e.target.value })}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={newDoc.expiry_date} onChange={(e) => setNewDoc({ ...newDoc, expiry_date: e.target.value })} title="Expiry date" />
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  {uploadingDoc ? 'Uploading…' : '+ Add document'}
                  <input type="file" onChange={uploadDoc} disabled={uploadingDoc} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            {vehicle.documents.length === 0 ? <div className="empty">No documents on file yet.</div> : (
              <div className="stack" style={{ gap: 8 }}>
                {vehicle.documents.map((d) => (
                  <div key={d.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px' }}>
                    <div className="row between">
                      <span className="row" style={{ gap: 6 }}>
                        {d.data_url ? <a href={d.data_url} target="_blank" rel="noreferrer" className="link-strong">{d.doc_type}</a> : <span className="link-strong">{d.doc_type}</span>}
                      </span>
                      <span className={'pill ' + COMPLIANCE_PILL[d.status]}>{COMPLIANCE_LABEL[d.status]}</span>
                    </div>
                    <div className="row between" style={{ marginTop: 6 }}>
                      <span className="muted" style={{ fontSize: 13 }}>Expires</span>
                      {canEdit ? (
                        <input type="date" value={d.expiry_date || ''} onChange={(e) => updateExpiry(d.id, e.target.value)} />
                      ) : (
                        <span>{d.expiry_date ? shortDate(d.expiry_date) : '—'}</span>
                      )}
                    </div>
                    {canEdit && (
                      <div className="row" style={{ marginTop: 8 }}>
                        <button type="button" className="btn subtle sm" onClick={() => removeDoc(d.id)}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Live location</h2>
            <p className="location-caption">
              Updates only while a phone has this page open and sharing turned on — it checks in a fresh GPS position every 60 seconds, not a continuous background feed. A hardware GPS/telematics tracker would give that, but that's a separate paid provider the business hasn't signed up for yet.
            </p>
            <div className="location-share-row" style={{ marginTop: 10, marginBottom: 12 }}>
              <button type="button" className={'btn sm' + (sharing ? '' : ' primary')} onClick={toggleSharing}>
                {sharing ? 'Stop sharing' : '📍 Share my location'}
              </button>
              {vehicle.location && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Last check-in {dateTime(vehicle.location.recorded_at)}
                  {vehicle.location.reported_by_username ? ` · by ${vehicle.location.reported_by_username}` : ''}
                </span>
              )}
            </div>
            {geoError && <div className="empty" style={{ color: 'var(--red)' }}>{geoError}</div>}
            {vehicle.location ? (
              <>
                <LeafletMap
                  markers={[{
                    lat: vehicle.location.lat, lng: vehicle.location.lng, color: 'var(--accent)',
                    popupHtml: `<div class="vehicle-map-popup"><strong>${vehicle.name}</strong>${dateTime(vehicle.location.recorded_at)}</div>`,
                  }]}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <a href={mapLinksForCoords(vehicle.location.lat, vehicle.location.lng).view} target="_blank" rel="noreferrer" className="link-strong">Open in Google Maps ↗</a>
                </div>
              </>
            ) : (
              <div className="empty">No location check-in yet.</div>
            )}
          </div>

          <div className="card section-card" style={{ borderLeftColor: 'var(--line)' }}>
            <h2 className="section-label" style={{ color: 'var(--muted)' }}>Maintenance total</h2>
            <div className="row between"><span className="muted">All-time cost</span><span className="mono">{money(vehicle.totalMaintenanceCost)}</span></div>
          </div>

          <div className="card">
            <h2>Maintenance log</h2>
            {canEdit && (
              <form onSubmit={logMaintenance} className="form-grid" style={{ marginBottom: 14, borderBottom: '1px solid var(--line-soft)', paddingBottom: 14 }}>
                <div className="field"><label>Date</label><input type="date" value={maintForm.service_date} onChange={(e) => setMaintForm({ ...maintForm, service_date: e.target.value })} required /></div>
                <div className="field"><label>Odometer</label><input type="number" value={maintForm.odometer} onChange={(e) => setMaintForm({ ...maintForm, odometer: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}><label>Description</label><input value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} placeholder="e.g. Oil change + brake pads" required /></div>
                <div className="field"><label>Cost ($)</label><input type="number" min="0" step="0.01" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} /></div>
                <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary sm" type="submit" disabled={loggingMaint}>{loggingMaint ? 'Saving…' : 'Log service'}</button></div>
              </form>
            )}
            {vehicle.maintenance.length === 0 ? <div className="empty">No maintenance logged yet.</div> : (
              <div className="stack" style={{ gap: 2 }}>
                {vehicle.maintenance.map((m) => (
                  <div key={m.id} className="attention-row">
                    <span>
                      {m.description}
                      <span className="muted" style={{ marginLeft: 6 }}>{shortDate(m.service_date)}{m.odometer ? ` · ${m.odometer.toLocaleString()} mi` : ''}</span>
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="mono">{money(m.cost)}</span>
                      {canEdit && <button type="button" className="btn subtle sm" onClick={() => removeMaintenance(m.id)}>✕</button>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Activity</h2>
            {vehicle.activities.length === 0 ? <div className="empty">Nothing logged yet.</div> : (
              <div className="timeline">
                {vehicle.activities.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div className="when">{dateTime(a.created_at)}</div>
                    <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
