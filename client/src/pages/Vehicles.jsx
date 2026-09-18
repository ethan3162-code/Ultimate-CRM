import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePermission } from '../auth';

const BLANK_FORM = { name: '', make: '', model: '', year: '', vin: '', license_plate: '', assigned_employee_id: '', odometer: '', notes: '' };
const STATUS_LABEL = { active: 'Active', in_shop: 'In shop', retired: 'Retired' };
const STATUS_PILL = { active: 'green', in_shop: 'amber', retired: 'red' };
const COMPLIANCE_PILL = { expired: 'red', expiring: 'amber', ok: 'green', none: '' };
const COMPLIANCE_LABEL = { expired: 'Doc expired', expiring: 'Expiring soon', ok: 'Docs current', none: 'No docs on file' };

export default function Vehicles() {
  const { canEdit } = usePermission('vehicles');
  const [vehicles, setVehicles] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [showRetired, setShowRetired] = useState(false);

  function load() {
    api.vehicles().then(setVehicles);
  }
  useEffect(load, []);
  useEffect(() => { api.employees().then(setEmployees).catch(() => setEmployees([])); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createVehicle({ ...form, assigned_employee_id: form.assigned_employee_id || null });
    setForm(BLANK_FORM);
    setShowForm(false);
    load();
  }

  const visible = vehicles ? vehicles.filter((v) => showRetired || v.status !== 'retired') : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vehicles</h1>
          <p className="sub">The company fleet — who's driving what, registration/insurance expiry, and a maintenance log for each one.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/vehicles/map" className="btn sm">🗺 Fleet map</Link>
          {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New vehicle</button>}
        </div>
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Name / label</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Truck 1 — F250" required /></div>
            <div className="field"><label>Assigned driver</label>
              <select value={form.assigned_employee_id} onChange={(e) => setForm({ ...form, assigned_employee_id: e.target.value })}>
                <option value="">— unassigned —</option>
                {employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div className="field"><label>Make</label><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
            <div className="field"><label>Model</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            <div className="field"><label>Year</label><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
            <div className="field"><label>License plate</label><input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} /></div>
            <div className="field"><label>VIN</label><input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
            <div className="field"><label>Odometer</label><input type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create vehicle</button></div>
          </form>
        </div>
      )}

      {!visible ? <div className="loading">Loading…</div> : (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <label className="sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
              Show retired
            </label>
          </div>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Vehicle</th><th>Make / model</th><th>Plate</th><th>Assigned driver</th><th>Status</th><th>Compliance</th></tr></thead>
              <tbody>
                {visible.map((v) => (
                  <tr key={v.id}>
                    <td><Link to={`/vehicles/${v.id}`} className="link-strong">{v.name}</Link></td>
                    <td className="muted">{[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="muted">{v.license_plate || '—'}</td>
                    <td className="muted">{v.assigned_employee_name || '—'}</td>
                    <td><span className={'pill ' + STATUS_PILL[v.status]}>{STATUS_LABEL[v.status]}</span></td>
                    <td><span className={'pill ' + COMPLIANCE_PILL[v.compliance_status]}>{COMPLIANCE_LABEL[v.compliance_status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
