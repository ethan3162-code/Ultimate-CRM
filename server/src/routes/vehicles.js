// Company fleet: trucks, trailers, and other vehicles — who's assigned to drive each one, its
// registration/insurance/inspection paperwork with expiry tracking (see vehicleCompliance.js for
// the background office-notification check), and a simple maintenance log. Maintenance cost is
// real cost data, so it's redacted the same way any other dollar figure is for a login without
// price visibility — never on a customer estimate/invoice, since neither draws from here at all.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { canSeePrices } = require('../auth');

const router = express.Router();

const STATUSES = ['active', 'in_shop', 'retired'];

function redactMaintenanceMoney(entry) {
  return { ...entry, cost: null, price_hidden: true };
}

function withEmployeeName(vehicle) {
  if (!vehicle.assigned_employee_id) return { ...vehicle, assigned_employee_name: null };
  const emp = db.prepare(`SELECT first_name, last_name FROM employees WHERE id = ?`).get(vehicle.assigned_employee_id);
  return { ...vehicle, assigned_employee_name: emp ? `${emp.first_name} ${emp.last_name}` : null };
}

// 'expired' < 0 days left, 'expiring' within the next 30, 'ok' otherwise, 'none' if no date set —
// identical thresholds to the subcontractor-document status (subcontractors.js's docStatus).
function docStatus(expiryDate) {
  if (!expiryDate) return { status: 'none', daysUntil: null };
  const days = Math.floor((new Date(`${expiryDate}T00:00:00Z`) - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);
  return { status: days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'ok', daysUntil: days };
}
function withDocStatus(doc) {
  const { status, daysUntil } = docStatus(doc.expiry_date);
  return { ...doc, status, days_until_expiry: daysUntil };
}
function worstStatus(documents) {
  const order = { expired: 3, expiring: 2, ok: 1, none: 0 };
  return documents.reduce((worst, d) => (order[d.status] > order[worst] ? d.status : worst), 'none');
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM vehicles ORDER BY status = 'retired', name`).all();
  const withStatus = rows.map((v) => {
    const documents = db.prepare(`SELECT * FROM vehicle_documents WHERE vehicle_id = ?`).all(v.id).map(withDocStatus);
    return { ...withEmployeeName(v), compliance_status: worstStatus(documents) };
  });
  res.json(withStatus);
});

// Fleet map data: every non-retired vehicle's most recent location check-in (if it has one),
// plus who reported it and when — the map page shows every vehicle, with "no check-in yet" for
// one that's never reported a position, rather than silently omitting it.
router.get('/locations/latest', (req, res) => {
  const vehicles = db.prepare(`SELECT * FROM vehicles WHERE status != 'retired' ORDER BY name`).all();
  const results = vehicles.map((v) => {
    const loc = db.prepare(`
      SELECT vl.*, u.username AS reported_by_username FROM vehicle_locations vl
      LEFT JOIN users u ON u.id = vl.reported_by_user_id
      WHERE vl.vehicle_id = ? ORDER BY vl.recorded_at DESC LIMIT 1
    `).get(v.id);
    return { ...withEmployeeName(v), location: loc || null };
  });
  res.json(results);
});

router.post('/', (req, res) => {
  const { name, make, model, year, vin, license_plate, assigned_employee_id, odometer, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(`
    INSERT INTO vehicles (name, make, model, year, vin, license_plate, assigned_employee_id, odometer, notes)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(name, make || null, model || null, year ? Number(year) : null, vin || null, license_plate || null,
    assigned_employee_id || null, odometer ? Number(odometer) : null, notes || null);
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('vehicle', vehicle.id, 'note', `Vehicle "${vehicle.name}" added.`);
  res.status(201).json(withEmployeeName(vehicle));
});

router.get('/:id', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'not found' });
  const documents = db.prepare(`SELECT * FROM vehicle_documents WHERE vehicle_id = ? ORDER BY expiry_date IS NULL, expiry_date`).all(req.params.id).map(withDocStatus);
  const maintenanceRows = db.prepare(`SELECT * FROM vehicle_maintenance WHERE vehicle_id = ? ORDER BY service_date DESC, id DESC`).all(req.params.id);
  const maintenance = canSeePrices(req.user) ? maintenanceRows : maintenanceRows.map(redactMaintenanceMoney);
  const totalMaintenanceCost = canSeePrices(req.user) ? +(maintenanceRows.reduce((s, m) => s + (Number(m.cost) || 0), 0)).toFixed(2) : null;
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'vehicle' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const locations = db.prepare(`
    SELECT vl.*, u.username AS reported_by_username FROM vehicle_locations vl
    LEFT JOIN users u ON u.id = vl.reported_by_user_id
    WHERE vl.vehicle_id = ? ORDER BY vl.recorded_at DESC LIMIT 20
  `).all(req.params.id);
  res.json({
    ...withEmployeeName(vehicle), documents, maintenance, totalMaintenanceCost, activities,
    compliance_status: worstStatus(documents),
    locations, location: locations[0] || null,
  });
});

// One GPS check-in from whoever has this vehicle's page open on their phone. Not a hardware GPS
// tracker feed — just the browser's current position at the moment this was called — so the
// client is expected to call this repeatedly (e.g. every 60s) while "live sharing" is turned on,
// not once. Kept dead simple: no accuracy/staleness filtering here, since the client already
// shows "last updated Xs/m ago" and that's the honest signal for how current a ping is.
router.post('/:id/location', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'not found' });
  const { lat, lng, accuracy } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  const result = db.prepare(`
    INSERT INTO vehicle_locations (vehicle_id, lat, lng, accuracy, reported_by_user_id) VALUES (?,?,?,?,?)
  `).run(vehicle.id, lat, lng, accuracy || null, req.user.id);
  const loc = db.prepare(`
    SELECT vl.*, u.username AS reported_by_username FROM vehicle_locations vl
    LEFT JOIN users u ON u.id = vl.reported_by_user_id WHERE vl.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(loc);
});

router.patch('/:id', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'not found' });
  const fields = ['name', 'make', 'model', 'vin', 'license_plate', 'notes'];
  const next = { ...vehicle };
  for (const f of fields) if (req.body[f] !== undefined) next[f] = req.body[f] || null;
  if (req.body.year !== undefined) next.year = req.body.year ? Number(req.body.year) : null;
  if (req.body.odometer !== undefined) next.odometer = req.body.odometer ? Number(req.body.odometer) : null;
  if (req.body.assigned_employee_id !== undefined) next.assigned_employee_id = req.body.assigned_employee_id || null;
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    next.status = req.body.status;
  }
  db.prepare(`
    UPDATE vehicles SET
      name = ?, make = ?, model = ?, year = ?, vin = ?, license_plate = ?,
      assigned_employee_id = ?, status = ?, odometer = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next.name, next.make, next.model, next.year, next.vin, next.license_plate,
    next.assigned_employee_id, next.status, next.odometer, next.notes, vehicle.id);
  res.json(withEmployeeName(db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(vehicle.id)));
});

router.delete('/:id', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM vehicles WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// --- Compliance documents (registration, insurance, inspection, ...) ---
router.post('/:id/documents', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'not found' });
  const { doc_type, file_name, data_url, expiry_date } = req.body;
  const result = db.prepare(`
    INSERT INTO vehicle_documents (vehicle_id, doc_type, file_name, data_url, expiry_date) VALUES (?,?,?,?,?)
  `).run(vehicle.id, doc_type || 'Registration', file_name || null, data_url || null, expiry_date || null);
  logActivity('vehicle', vehicle.id, 'note', `${doc_type || 'Document'} added${expiry_date ? `, expires ${expiry_date}` : ''}.`);
  const documents = db.prepare(`SELECT * FROM vehicle_documents WHERE vehicle_id = ?`).all(vehicle.id).map(withDocStatus);
  res.status(201).json(documents.find((d) => d.id === result.lastInsertRowid));
});

router.patch('/documents/:docId', (req, res) => {
  const doc = db.prepare(`SELECT * FROM vehicle_documents WHERE id = ?`).get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  const { doc_type, expiry_date, file_name, data_url } = req.body;
  db.prepare(`
    UPDATE vehicle_documents SET
      doc_type = COALESCE(?, doc_type), expiry_date = ?, file_name = COALESCE(?, file_name), data_url = COALESCE(?, data_url)
    WHERE id = ?
  `).run(doc_type || null, expiry_date !== undefined ? (expiry_date || null) : doc.expiry_date, file_name || null, data_url || null, doc.id);
  res.json(withDocStatus(db.prepare(`SELECT * FROM vehicle_documents WHERE id = ?`).get(doc.id)));
});

router.delete('/documents/:docId', (req, res) => {
  const doc = db.prepare(`SELECT * FROM vehicle_documents WHERE id = ?`).get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM vehicle_documents WHERE id = ?`).run(req.params.docId);
  res.status(204).end();
});

// --- Maintenance log ---
router.post('/:id/maintenance', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'not found' });
  const { service_date, description, cost, odometer } = req.body;
  if (!service_date || !description) return res.status(400).json({ error: 'service_date and description are required' });
  const result = db.prepare(`
    INSERT INTO vehicle_maintenance (vehicle_id, service_date, description, cost, odometer) VALUES (?,?,?,?,?)
  `).run(vehicle.id, service_date, description, Number(cost) || 0, odometer ? Number(odometer) : null);
  if (odometer) db.prepare(`UPDATE vehicles SET odometer = ? WHERE id = ? AND (odometer IS NULL OR odometer < ?)`).run(Number(odometer), vehicle.id, Number(odometer));
  logActivity('vehicle', vehicle.id, 'note', `Maintenance logged: ${description} (${service_date}).`);
  const entry = db.prepare(`SELECT * FROM vehicle_maintenance WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(canSeePrices(req.user) ? entry : redactMaintenanceMoney(entry));
});

router.delete('/maintenance/:entryId', (req, res) => {
  const entry = db.prepare(`SELECT * FROM vehicle_maintenance WHERE id = ?`).get(req.params.entryId);
  if (!entry) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM vehicle_maintenance WHERE id = ?`).run(req.params.entryId);
  res.status(204).end();
});

module.exports = router;
