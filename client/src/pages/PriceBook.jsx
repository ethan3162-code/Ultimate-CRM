// Sales items only — one half of what used to be one combined "Items & price book" page, split
// out (Sept 2026) so it can be permission-gated separately from the calculator's own catalog (see
// Items.jsx, which — despite the filename — is now labeled "Price book"; this file is now labeled
// "Items", even though its permission key is 'price_book'). These are the priced products/
// services you drop into a job estimate, kept separate from the calculator's raw-material catalog
// so your estimate picker only shows things you actually sell by the line.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { money, csvToCatalogItems } from '../utils';
import { usePermission } from '../auth';

const BLANK = { name: '', description: '', unit: '', unit_price: '' };

export default function PriceBook() {
  const { canEdit } = usePermission('price_book');
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  // Bulk import from a CSV — a price list exported from Joist, QuickBooks, or a spreadsheet
  // (Sept 2026). `importText` is the raw file/paste content; the preview table below derives
  // from it live via csvToCatalogItems, so editing the pasted text updates the preview as you go.
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  function load() { api.catalogItems().then(setItems); }
  useEffect(load, []);

  // null before anything's been read/pasted yet; [] specifically means the text had no
  // recognizable name/product column, which the UI below calls out distinctly from "0 rows".
  const importRows = useMemo(() => (importText.trim() ? csvToCatalogItems(importText) : null), [importText]);

  function openImport() {
    setImportOpen(true);
    setImportText('');
    setImportFileName('');
    setImportResult(null);
  }
  function closeImport() {
    setImportOpen(false);
  }
  function onImportFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ''));
    reader.readAsText(file);
  }
  async function runImport() {
    if (!importRows || !importRows.length) return;
    setImporting(true);
    try {
      const result = await api.bulkImportCatalogItems(importRows);
      setImportResult(result);
      setImportText('');
      setImportFileName('');
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setImporting(false);
    }
  }

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
        {canEdit && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={openImport}>Import from CSV…</button>
            <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New item</button>
          </div>
        )}
      </div>

      {importOpen && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>Import items from a CSV</h2>
          <p className="sub">
            Upload a price-list export — from Joist, QuickBooks, or a spreadsheet's "Save as CSV" — and it's matched up by
            column name (Name/Item Name/Product Name, Description, Unit Cost/Price, Unit) automatically. Review the preview
            below before importing; nothing is added until you click Import.
          </p>
          <input
            ref={fileInputRef} type="file" accept=".csv,text/csv"
            onChange={onImportFileChange}
          />
          {importFileName && <p className="sub" style={{ margin: '6px 0 0' }}>Loaded <strong>{importFileName}</strong>.</p>}

          <div className="field" style={{ marginTop: 10 }}>
            <label>Or paste CSV text</label>
            <textarea
              rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder={'Name,Description,Unit Cost,Unit\nSealcoating,Driveway sealcoat application,0.18,sq ft'}
              value={importText} onChange={(e) => { setImportText(e.target.value); setImportResult(null); }}
            />
          </div>

          {importText.trim() && importRows === null && (
            <div className="empty" style={{ marginTop: 10 }}>
              Couldn't find a name/product column in that file's header row — check that the first row has a column
              like "Name", "Item Name", or "Product Name".
            </div>
          )}

          {importRows && importRows.length > 0 && (
            <>
              <p className="sub" style={{ marginTop: 12 }}>Preview — {importRows.length} item{importRows.length === 1 ? '' : 's'} found:</p>
              <div className="table-wrap">
                <table className="list">
                  <thead><tr><th>Product name</th><th>Description</th><th>Unit cost</th><th>Unit</th></tr></thead>
                  <tbody>
                    {importRows.slice(0, 8).map((it, i) => (
                      <tr key={i}>
                        <td className="link-strong">{it.name}</td>
                        <td className="muted">{it.description || '—'}</td>
                        <td className="mono">{money(it.unit_price)}</td>
                        <td className="muted">{it.unit || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 8 && <p className="sub">…and {importRows.length - 8} more.</p>}
            </>
          )}

          {importResult && (
            <div className="sub" style={{ margin: '10px 0 0', color: 'var(--accent-ink)' }}>
              ✓ Imported {importResult.inserted} item{importResult.inserted === 1 ? '' : 's'}.
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn primary" type="button" disabled={!importRows || !importRows.length || importing} onClick={runImport}>
              {importing ? 'Importing…' : `Import${importRows && importRows.length ? ` ${importRows.length} item${importRows.length === 1 ? '' : 's'}` : ''}`}
            </button>
            <button className="btn subtle" type="button" onClick={closeImport}>Close</button>
          </div>
        </div>
      )}

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
