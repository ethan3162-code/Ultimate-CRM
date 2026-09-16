import { useEffect, useState } from 'react';
import { api } from '../api';
import { money } from '../utils';

const MATERIAL_KEYS = [
  { value: '', label: '— not linked —' },
  { value: 'asphalt', label: 'Material calc: Asphalt' },
  { value: 'concrete', label: 'Material calc: Concrete' },
  { value: 'pavers', label: 'Material calc: Pavers' },
  { value: 'border', label: 'Material calc: Border / edging' },
  { value: 'sand', label: 'Material calc: Sand' },
  { value: 'cement', label: 'Material calc: Portland cement' },
  { value: 'rcaBase', label: 'Material calc: RCA base' },
];
const MATERIAL_LABEL = MATERIAL_KEYS.reduce((acc, m) => { acc[m.value] = m.label; return acc; }, {});

const BLANK = { name: '', description: '', unit: '', unit_price: '', material_key: '' };

export default function Items() {
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  function load() { api.catalogItems().then(setItems); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createCatalogItem({ ...form, unit_price: Number(form.unit_price) || 0, material_key: form.material_key || null });
    setForm(BLANK);
    setShowForm(false);
    load();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, description: item.description || '', unit: item.unit || '', unit_price: item.unit_price, material_key: item.material_key || '' });
  }
  async function saveEdit(id) {
    await api.updateCatalogItem(id, { ...editDraft, unit_price: Number(editDraft.unit_price) || 0, material_key: editDraft.material_key || null });
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
          <h1>Items &amp; price book</h1>
          <p className="sub">Preset materials and services with their usual cost, so estimates and the material calculator can pull in a product name, description, and unit cost instead of retyping them.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New item</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field">
              <label>Product name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Asphalt Paving" required />
            </div>
            <div className="field">
              <label>Unit cost</label>
              <input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0.00" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Hot-mix asphalt, installed and compacted" />
            </div>
            <div className="field">
              <label>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. ton, yd³, bag, each" />
            </div>
            <div className="field">
              <label>Link to material calculator (optional)</label>
              <select value={form.material_key} onChange={(e) => setForm({ ...form, material_key: e.target.value })}>
                {MATERIAL_KEYS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save item</button></div>
          </form>
        </div>
      )}

      {!items ? <div className="loading">Loading…</div> : items.length === 0 ? (
        <div className="card"><div className="empty">No preset items yet — add materials and services you price often.</div></div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Product name</th><th>Description</th><th>Unit cost</th><th>Unit</th><th>Linked to</th><th></th></tr></thead>
            <tbody>
              {items.map((item) => {
                const editing = editingId === item.id;
                return (
                  <tr key={item.id}>
                    {editing ? (
                      <>
                        <td><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                        <td><input value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} /></td>
                        <td><input type="number" min="0" step="0.01" value={editDraft.unit_price} onChange={(e) => setEditDraft({ ...editDraft, unit_price: e.target.value })} style={{ width: 90 }} /></td>
                        <td><input value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} style={{ width: 80 }} /></td>
                        <td>
                          <select value={editDraft.material_key} onChange={(e) => setEditDraft({ ...editDraft, material_key: e.target.value })}>
                            {MATERIAL_KEYS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </td>
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
                        <td className="muted">{item.material_key ? MATERIAL_LABEL[item.material_key] || item.material_key : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn subtle sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                          <button type="button" className="btn subtle sm" onClick={() => remove(item.id)}>✕</button>
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
