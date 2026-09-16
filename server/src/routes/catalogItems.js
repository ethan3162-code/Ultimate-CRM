const express = require('express');
const db = require('../db');

const router = express.Router();

// material_key ties a preset item to a row in the material calculator
// (asphalt, concrete, pavers, border, sand, cement, rcaBase) so its saved
// price can auto-fill that row. It's optional — items with no material_key
// are just general-purpose presets for building estimates by hand.
//
// brand + sf_per_pallet are for paver products specifically (material_key =
// 'pavers'): picking a branded product in the calculator fills in both its
// SF-per-pallet coverage and its price in one step.

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, description, unit, unit_price, material_key, brand, sf_per_pallet } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(`INSERT INTO catalog_items (name, description, unit, unit_price, material_key, brand, sf_per_pallet) VALUES (?,?,?,?,?,?,?)`)
    .run(name.trim(), description || null, unit || null, Number(unit_price) || 0, material_key || null, brand || null, sf_per_pallet === '' || sf_per_pallet == null ? null : Number(sf_per_pallet));
  res.status(201).json(db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const updates = { ...existing, ...req.body };
  const sfPerPallet = updates.sf_per_pallet === '' || updates.sf_per_pallet == null ? null : Number(updates.sf_per_pallet);
  db.prepare(`UPDATE catalog_items SET name=?, description=?, unit=?, unit_price=?, material_key=?, brand=?, sf_per_pallet=?, updated_at=datetime('now') WHERE id=?`)
    .run(updates.name, updates.description || null, updates.unit || null, Number(updates.unit_price) || 0, updates.material_key || null, updates.brand || null, sfPerPallet, req.params.id);
  res.json(db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM catalog_items WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

module.exports = router;
