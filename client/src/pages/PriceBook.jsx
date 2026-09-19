// Sales items only — one half of what used to be one combined "Items & price book" page, split
// out (Sept 2026) so it can be permission-gated separately from the calculator's own catalog (see
// Items.jsx, which — despite the filename — is now labeled "Price book"; this file is now labeled
// "Items", even though its permission key is 'price_book'). These are the priced products/
// services you drop into a job estimate, kept separate from the calculator's raw-material catalog
// so your estimate picker only shows things you actually sell by the line.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { money } from '../utils';
import { usePermission } from '../auth';

const BLANK = { name: '', description: '', unit: '', unit_price: '' };

export default function PriceBook() {
  const { canEdit } = usePermission('price_book');
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  function load() { api.catalogItems().then(setItems); }
  useEffect(load, []);

  const salesItems = useMemo(() => (items || []).filter((i) => !i.material_key), [items]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createCatalogItem({
      name: form.name,
      description: form.description,
      unit: form.unit,
      unit_price: Number(form.unit_price) || 0,
      material_key: null,
      brand: null,
      sf_per_pallet: null,
    });
    setForm(BLANK);
    setShowForm(false);
    load();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      description: item.description || '',
      unit: item.unit || '',
      unit_price: item.unit_price,
    });
  }
  async function saveEdit(id) {
    await api.updateCatalogItem(id, {
      ...editDraft,
      unit_price: Number(editDraft.unit_price) || 0,
      material_key: null,
      brand: null,
      sf_per_pallet: null,
    });
    setEditingId(null);
    load();
  }
  async function remove(id) {
    await api.deleteCatalogItem(id);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Items</h1>
          <p className="sub">Products and services you add to job estimates — labor, add-ons, anything you sell by the line.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New item</button>}
      </div>

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field">
              <label>Product name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sealcoating" required />
            </div>
            <div className="field">
              <label>Unit cost</label>
              <input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0.00" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Line-item description shown on the estimate" />
            </div>
            <div className="field">
              <label>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. ton, yd³, bag, each" />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save item</button></div>
          </form>
        </div>
      )}

      {!items ? <div className="loading">Loading…</div> : salesItems.length === 0 ? (
        <div className="card"><div className="empty">No sales items yet — add products and services you price often.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr><th>Product name</th><th>Description</th><th>Unit cost</th><th>Unit</th><th></th></tr>
            </thead>
            <tbody>
              {salesItems.map((item) => {
                const editing = editingId === item.id;
                return (
                  <tr key={item.id}>
                    {editing ? (
                      <>
                        <td><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                        <td><input value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} /></td>
                        <td><input type="number" min="0" step="0.01" value={editDraft.unit_price} onChange={(e) => setEditDraft({ ...editDraft, unit_price: e.target.value })} style={{ width: 90 }} /></td>
                        <td><input value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} style={{ width: 80 }} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn sm primary" onClick={() => saveEdit(item.id)}>Save</button>{' '}
                          <button type="button" className="btn subtle sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="link-strong">{item.name}</td>
                        <td className="muted">{item.description || '—'}</td>
                        <td className="mono">{money(item.unit_price)}</td>
                        <td className="muted">{item.unit || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {canEdit && <><button type="button" className="btn subtle sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                          <button type="button" className="btn subtle sm" onClick={() => remove(item.id)}>✕</button></>}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
