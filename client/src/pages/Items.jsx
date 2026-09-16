import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { money } from '../utils';

const CALC_MATERIAL_KEYS = [
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'pavers', label: 'Pavers' },
  { value: 'border', label: 'Border / edging' },
  { value: 'sand', label: 'Sand' },
  { value: 'cement', label: 'Portland cement' },
  { value: 'rcaBase', label: 'RCA base' },
];
const MATERIAL_LABEL = CALC_MATERIAL_KEYS.reduce((acc, m) => { acc[m.value] = m.label; return acc; }, {});

const BLANK_SALE = { name: '', description: '', unit: '', unit_price: '' };
const BLANK_CALC = { name: '', brand: '', description: '', unit: '', unit_price: '', material_key: CALC_MATERIAL_KEYS[0].value, sf_per_pallet: '' };

const TABS = [
  { key: 'sales', label: 'Sales items', hint: 'Products and services you add to job estimates — labor, add-ons, anything you sell.' },
  { key: 'calculator', label: 'Calculator materials', hint: 'Raw materials linked to the Material Calculator (asphalt, concrete, pavers, sand, cement, base). Picking one there fills in its price — and for pavers, the pallet coverage — automatically.' },
];

export default function Items() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('sales');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_SALE);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  function load() { api.catalogItems().then(setItems); }
  useEffect(load, []);

  const salesItems = useMemo(() => (items || []).filter((i) => !i.material_key), [items]);
  const calcItems = useMemo(() => (items || []).filter((i) => i.material_key), [items]);
  const visible = tab === 'sales' ? salesItems : calcItems;
  const isCalcTab = tab === 'calculator';

  function switchTab(key) {
    setTab(key);
    setShowForm(false);
    setEditingId(null);
    setForm(key === 'calculator' ? BLANK_CALC : BLANK_SALE);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (isCalcTab) {
      await api.createCatalogItem({
        ...form,
        unit_price: Number(form.unit_price) || 0,
        material_key: form.material_key,
        brand: form.brand || null,
        sf_per_pallet: form.sf_per_pallet === '' ? null : Number(form.sf_per_pallet),
      });
    } else {
      await api.createCatalogItem({
        name: form.name,
        description: form.description,
        unit: form.unit,
        unit_price: Number(form.unit_price) || 0,
        material_key: null,
        brand: null,
        sf_per_pallet: null,
      });
    }
    setForm(isCalcTab ? BLANK_CALC : BLANK_SALE);
    setShowForm(false);
    load();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      brand: item.brand || '',
      description: item.description || '',
      unit: item.unit || '',
      unit_price: item.unit_price,
      material_key: item.material_key || '',
      sf_per_pallet: item.sf_per_pallet ?? '',
    });
  }
  async function saveEdit(id) {
    await api.updateCatalogItem(id, {
      ...editDraft,
      unit_price: Number(editDraft.unit_price) || 0,
      material_key: editDraft.material_key || null,
      brand: editDraft.brand || null,
      sf_per_pallet: editDraft.sf_per_pallet === '' ? null : Number(editDraft.sf_per_pallet),
    });
    setEditingId(null);
    load();
  }
  async function remove(id) {
    await api.deleteCatalogItem(id);
    load();
  }

  const showPalletField = (materialKey) => materialKey === 'pavers';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Items &amp; price book</h1>
          <p className="sub">Sales items are what you drop into a job estimate. Calculator materials feed the Material Calculator — kept separate so your estimate picker only shows things you actually sell by the line.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New item</button>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'tab' + (tab === t.key ? ' active' : '')}
            onClick={() => switchTab(t.key)}
          >
            {t.label} <span className="muted">({t.key === 'sales' ? salesItems.length : calcItems.length})</span>
          </button>
        ))}
      </div>
      <p className="sub" style={{ margin: '-6px 0 16px' }}>{TABS.find((t) => t.key === tab).hint}</p>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field">
              <label>Product name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isCalcTab ? 'e.g. Nicolock Courtstone' : 'e.g. Sealcoating'} required />
            </div>
            <div className="field">
              <label>Unit cost</label>
              <input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0.00" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={isCalcTab ? 'e.g. Hot-mix asphalt, installed and compacted' : 'e.g. Line-item description shown on the estimate'} />
            </div>
            <div className="field">
              <label>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. ton, yd³, bag, each" />
            </div>
            {isCalcTab && (
              <div className="field">
                <label>Material calculator</label>
                <select value={form.material_key} onChange={(e) => setForm({ ...form, material_key: e.target.value })}>
                  {CALC_MATERIAL_KEYS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            )}
            {isCalcTab && showPalletField(form.material_key) && (
              <>
                <div className="field">
                  <label>Brand</label>
                  <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Nicolock, Cambridge" />
                </div>
                <div className="field">
                  <label>SF per pallet</label>
                  <input type="number" min="0" step="1" value={form.sf_per_pallet} onChange={(e) => setForm({ ...form, sf_per_pallet: e.target.value })} placeholder="e.g. 128" />
                </div>
              </>
            )}
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save item</button></div>
          </form>
        </div>
      )}

      {!items ? <div className="loading">Loading…</div> : visible.length === 0 ? (
        <div className="card"><div className="empty">{isCalcTab ? 'No calculator materials yet — add priced materials to auto-fill the Material Calculator.' : 'No sales items yet — add products and services you price often.'}</div></div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              {isCalcTab ? (
                <tr><th>Product name</th><th>Brand</th><th>Description</th><th>Unit cost</th><th>Unit</th><th>SF/pallet</th><th>Linked to</th><th></th></tr>
              ) : (
                <tr><th>Product name</th><th>Description</th><th>Unit cost</th><th>Unit</th><th></th></tr>
              )}
            </thead>
            <tbody>
              {visible.map((item) => {
                const editing = editingId === item.id;
                if (isCalcTab) {
                  return (
                    <tr key={item.id}>
                      {editing ? (
                        <>
                          <td><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                          <td><input value={editDraft.brand} onChange={(e) => setEditDraft({ ...editDraft, brand: e.target.value })} style={{ width: 90 }} /></td>
                          <td><input value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} /></td>
                          <td><input type="number" min="0" step="0.01" value={editDraft.unit_price} onChange={(e) => setEditDraft({ ...editDraft, unit_price: e.target.value })} style={{ width: 90 }} /></td>
                          <td><input value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} style={{ width: 80 }} /></td>
                          <td><input type="number" min="0" value={editDraft.sf_per_pallet} onChange={(e) => setEditDraft({ ...editDraft, sf_per_pallet: e.target.value })} style={{ width: 80 }} /></td>
                          <td>
                            <select value={editDraft.material_key} onChange={(e) => setEditDraft({ ...editDraft, material_key: e.target.value })}>
                              {CALC_MATERIAL_KEYS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
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
                          <td className="muted">{item.brand || '—'}</td>
                          <td className="muted">{item.description || '—'}</td>
                          <td className="mono">{money(item.unit_price)}</td>
                          <td className="muted">{item.unit || '—'}</td>
                          <td className="mono">{item.sf_per_pallet ?? '—'}</td>
                          <td className="muted">{MATERIAL_LABEL[item.material_key] || item.material_key}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn subtle sm" onClick={() => startEdit(item)}>Edit</button>{' '}
                            <button type="button" className="btn subtle sm" onClick={() => remove(item.id)}>✕</button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                }
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
