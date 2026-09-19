const express = require('express');
const db = require('../db');
const { canSeePrices, getPermissions } = require('../auth');

const router = express.Router();

// material_key ties a preset item to a row in the material calculator
// (asphalt, concrete, pavers, border, sand, cement, rcaBase) so its saved
// price can auto-fill that row. It's optional — items with no material_key
// are just general-purpose presets for building estimates by hand.
//
// brand + sf_per_pallet are for paver products specifically (material_key =
// 'pavers'): picking a branded product in the calculator fills in both its
// SF-per-pallet coverage and its price in one step.
//
// One catalog_items table holds two kinds of row, split by whether material_key is set, and each
// kind is gated by its own page permission (see permissionsConfig.js): a row WITH a material_key
// is a calculator material, gated by 'items'; a row with NO material_key is a sales item for the
// job-estimate price book, gated by 'price_book'. The router itself is mounted behind
// requireAnyPage(['items','price_book']) (see index.js) just to let either kind of request in the
// door — every handler below then checks the specific permission for whichever kind of row it's
// actually touching.
function itemPageKey(row) {
  return row && row.material_key ? 'items' : 'price_book';
}

router.get('/', (req, res) => {
  const perms = getPermissions(req.user);
  const rows = db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all()
    .filter((r) => perms[itemPageKey(r)] !== 'none');
  if (canSeePrices(req.user)) return res.json(rows);
  res.json(rows.map((r) => ({ ...r, unit_price: null, price_hidden: true })));
});

router.post('/', (req, res) => {
  const { name, description, unit, unit_price, material_key, brand, sf_per_pallet } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const perms = getPermissions(req.user);
  const targetKey = itemPageKey({ material_key });
  if (perms[targetKey] !== 'edit') {
    return res.status(403).json({ error: `your account doesn't have edit access to ${targetKey === 'items' ? 'Price book' : 'Items'}` });
  }
  const result = db.prepare(`INSERT INTO catalog_items (name, description, unit, unit_price, material_key, brand, sf_per_pallet) VALUES (?,?,?,?,?,?,?)`)
    // description is stored as '' rather than null when blank — the live table predates this
    // route and still enforces NOT NULL on that column, so null here throws a constraint error.
    .run(name.trim(), description || '', unit || null, Number(unit_price) || 0, material_key || null, brand || null, sf_per_pallet === '' || sf_per_pallet == null ? null : Number(sf_per_pallet));
  res.status(201).json(db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(result.lastInsertRowid));
});

// Bulk import (Sept 2026) — for bringing in a price list exported from Joist, QuickBooks, or a
// spreadsheet in one shot instead of typing each product in one at a time. The CSV parsing itself
// happens client-side (see client/src/utils.js's csvToCatalogItems); this just takes the resulting
// {name, description, unit, unit_price} rows and inserts them. Every row in one import is the same
// kind (sales item vs. calculator material) — whichever the caller says via `material_key` — so
// this only needs one permission check up front rather than one per row.
router.post('/bulk', (req, res) => {
  const { items, material_key } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'at least one item is required' });
  const perms = getPermissions(req.user);
  const targetKey = itemPageKey({ material_key });
  if (perms[targetKey] !== 'edit') {
    return res.status(403).json({ error: `your account doesn't have edit access to ${targetKey === 'items' ? 'Price book' : 'Items'}` });
  }
  const insert = db.prepare(`INSERT INTO catalog_items (name, description, unit, unit_price, material_key) VALUES (?,?,?,?,?)`);
  const insertMany = db.transaction((rows) => {
    let inserted = 0;
    for (const it of rows) {
      const name = (it.name || '').trim();
      if (!name) continue;
      // '' rather than null when blank — a Joist/QuickBooks export routinely has rows with an
      // empty description/notes column, and the live table enforces NOT NULL on it (predates
      // this route), so a null here was rolling back the *entire* batch with a raw 500.
      insert.run(name, it.description || '', it.unit || null, Number(it.unit_price) || 0, material_key || null);
      inserted++;
    }
    return inserted;
  });
  let inserted;
  try {
    inserted = insertMany(items);
  } catch (err) {
    return res.status(500).json({ error: `import failed: ${err.message}` });
  }
  if (!inserted) return res.status(400).json({ error: 'none of the rows had a name — nothing was imported' });
  res.status(201).json({ inserted, items: db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all() });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const perms = getPermissions(req.user);
  const updates = { ...existing, ...req.body };
  // Require edit access to the item's current kind, and — if this save is changing material_key
  // in a way that moves it to the other kind — to the kind it's moving into as well, since that's
  // effectively handing the row to the other page.
  const fromKey = itemPageKey(existing);
  const toKey = itemPageKey(updates);
  if (perms[fromKey] !== 'edit' || perms[toKey] !== 'edit') {
    return res.status(403).json({ error: "your account doesn't have edit access to this item" });
  }
  const sfPerPallet = updates.sf_per_pallet === '' || updates.sf_per_pallet == null ? null : Number(updates.sf_per_pallet);
  db.prepare(`UPDATE catalog_items SET name=?, description=?, unit=?, unit_price=?, material_key=?, brand=?, sf_per_pallet=?, updated_at=datetime('now') WHERE id=?`)
    .run(updates.name, updates.description || '', updates.unit || null, Number(updates.unit_price) || 0, updates.material_key || null, updates.brand || null, sfPerPallet, req.params.id);
  res.json(db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const perms = getPermissions(req.user);
  if (perms[itemPageKey(existing)] !== 'edit') {
    return res.status(403).json({ error: "your account doesn't have edit access to this item" });
  }
  db.prepare(`DELETE FROM catalog_items WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

module.exports = router;
