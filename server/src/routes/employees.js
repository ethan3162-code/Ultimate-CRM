// Crew records: who's on staff, when they were hired, what's on file for them, and their pay
// rate — kept deliberately separate from the customer-facing side of the app. daily_rate is real
// cost data, so it's redacted the exact same way any other dollar figure is for a login without
// price visibility (see auth.js's canSeePrices) — never surfaced on an estimate/invoice at all,
// since those draw only from catalog_items via estimate_items/invoice_items and have no path to
// an employee record in the first place.
const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { canSeePrices } = require('../auth');

const router = express.Router();

function redactEmployeeMoney(employee) {
  return { ...employee, daily_rate: null, price_hidden: true };
}

function sendEmployee(req, res, employee, status) {
  res.status(status || 200).json(canSeePrices(req.user) ? employee : redactEmployeeMoney(employee));
}
function sendEmployees(req, res, employees) {
  res.json(canSeePrices(req.user) ? employees : employees.map(redactEmployeeMoney));
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM employees ORDER BY active DESC, first_name, last_name`).all();
  sendEmployees(req, res, rows);
});

router.post('/', (req, res) => {
  const { first_name, last_name, position, phone, email, hire_date, daily_rate, notes } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });
  const result = db.prepare(`
    INSERT INTO employees (first_name, last_name, position, phone, email, hire_date, daily_rate, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(first_name, last_name, position || null, phone || null, email || null, hire_date || null, Number(daily_rate) || 0, notes || null);
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('employee', employee.id, 'note', `Employee "${employee.first_name} ${employee.last_name}" added${hire_date ? `, hired ${hire_date}` : ''}.`);
  sendEmployee(req, res, employee, 201);
});

router.get('/:id', (req, res) => {
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'not found' });
  const documents = db.prepare(`SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const attendance = db.prepare(`
    SELECT a.*, j.title AS job_title
    FROM attendance a JOIN jobs j ON j.id = a.job_id
    WHERE a.employee_id = ? ORDER BY a.work_date DESC, a.id DESC
  `).all(req.params.id);
  const activities = db.prepare(`SELECT * FROM activities WHERE related_type = 'employee' AND related_id = ? ORDER BY created_at DESC`).all(req.params.id);
  const daysWorked = attendance.length;
  const totalPay = canSeePrices(req.user) ? +(attendance.reduce((s, a) => s + (Number(a.daily_rate) || 0), 0)).toFixed(2) : null;
  const full = { ...employee, documents, attendance, activities, daysWorked, totalPay };
  sendEmployee(req, res, full);
});

router.patch('/:id', (req, res) => {
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'not found' });
  const fields = ['first_name', 'last_name', 'position', 'phone', 'email', 'hire_date', 'notes'];
  const next = { ...employee };
  for (const f of fields) if (req.body[f] !== undefined) next[f] = req.body[f] || null;
  if (req.body.daily_rate !== undefined) next.daily_rate = Number(req.body.daily_rate) || 0;
  if (req.body.active !== undefined) next.active = req.body.active ? 1 : 0;
  db.prepare(`
    UPDATE employees SET
      first_name = ?, last_name = ?, position = ?, phone = ?, email = ?, hire_date = ?,
      daily_rate = ?, active = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next.first_name, next.last_name, next.position, next.phone, next.email, next.hire_date, next.daily_rate, next.active, next.notes, employee.id);
  const updated = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employee.id);
  sendEmployee(req, res, updated);
});

router.delete('/:id', (req, res) => {
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'not found' });
  const hasAttendance = db.prepare(`SELECT 1 FROM attendance WHERE employee_id = ? LIMIT 1`).get(req.params.id);
  if (hasAttendance) {
    return res.status(400).json({ error: 'This employee has attendance history on a project — mark them inactive instead of deleting, so past job costs stay intact.' });
  }
  db.prepare(`DELETE FROM employees WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// --- Documents on file (hire paperwork, certifications, etc.) — same data-URL-in-the-row
// approach the app already uses for job photos, just for arbitrary small files/images. ---
router.post('/:id/documents', (req, res) => {
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'not found' });
  const { label, file_name, data_url } = req.body;
  if (!data_url) return res.status(400).json({ error: 'data_url is required' });
  db.prepare(`INSERT INTO employee_documents (employee_id, label, file_name, data_url) VALUES (?,?,?,?)`)
    .run(employee.id, label || 'Document', file_name || null, data_url);
  logActivity('employee', employee.id, 'note', `Document added: ${label || file_name || 'Document'}.`);
  const documents = db.prepare(`SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY created_at DESC`).all(employee.id);
  res.status(201).json(documents);
});

router.delete('/documents/:docId', (req, res) => {
  const doc = db.prepare(`SELECT * FROM employee_documents WHERE id = ?`).get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM employee_documents WHERE id = ?`).run(req.params.docId);
  res.status(204).end();
});

module.exports = router;
