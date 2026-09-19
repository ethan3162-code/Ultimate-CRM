import { Fragment, useMemo, useState } from 'react';
import { money, estimateBreakdown } from '../utils';

/** A searchable "Items" picker modal (Joist-style) — replaces the old plain <select> dropdown.
    `catalog` is already filtered by the caller to sales items only (no material_key — see
    PriceBook.jsx / JobDetail.jsx's `!c.material_key` filter), so whatever list lands here is
    exactly the "Items" catalog, never Price Book calculator materials. */
function ItemPickerModal({ catalog, onPick, onClose }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => (
      (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
    ));
  }, [catalog, query]);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card wide">
        <h3>Add an item</h3>
        <p className="sub">Search your Items catalog and add it as a line.</p>
        <input
          className="item-picker-search" autoFocus placeholder="Search items…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <div className="item-picker-list">
          {results.length === 0 && <div className="item-picker-empty">No items match "{query}".</div>}
          {results.map((c) => (
            <button type="button" key={c.id} className="item-picker-row" onClick={() => onPick(c)}>
              <span>
                <span className="name">{c.name}</span>
                {c.description && <span className="desc">{c.description}</span>}
              </span>
              <span className="price">{money(c.unit_price)}{c.unit ? ` / ${c.unit}` : ''}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn subtle" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function LineItemEditor({ items, setItems, taxRate, setTaxRate, catalog, markupPercent, discountType, discountValue }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function updateItem(i, field, value) {
    const next = items.slice();
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  }
  function addRow() {
    setItems([...items, { description: '', notes: '', qty: 1, unit_price: 0 }]);
  }
  function removeRow(i) {
    setItems(items.filter((_, idx) => idx !== i));
  }
  function pickFromCatalog(item) {
    // Keep the item's name as the line's short title and its catalog description as its own
    // field (`notes`) — a catalog item's description is often a whole multi-paragraph scope-of-
    // work writeup (see Items.jsx), which needs to render as its own block under the line on the
    // estimate/PDF, not get squashed into the same single-line field as the name.
    setItems([...items, { description: item.name, notes: item.description || '', qty: 1, unit_price: item.unit_price }]);
    setPickerOpen(false);
  }

  // Markup/discount are set in PricingAdjustments (a separate component next to the payment
  // schedule, since like it they apply to the estimate as a whole rather than any one line) —
  // read-only here, just folded into the same totals breakdown so there's only ever one "Total"
  // on screen instead of two that could disagree.
  const { subtotal, markupAmount, discountAmount, tax, total } = estimateBreakdown(items, taxRate, markupPercent, discountType, discountValue);

  return (
    <div>
      {catalog && catalog.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button type="button" className="btn sm" onClick={() => setPickerOpen(true)}>+ Add from Items…</button>
        </div>
      )}
      <table className="line-items">
        <thead>
          <tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <Fragment key={i}>
              <tr>
                <td><input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="e.g. Labor, materials…" /></td>
                <td className="num"><input type="number" step="any" value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
                <td className="num"><input type="number" step="any" value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} /></td>
                <td><button type="button" className="btn subtle sm" onClick={() => removeRow(i)}>✕</button></td>
              </tr>
              <tr className="line-item-notes-row">
                <td colSpan={4}>
                  <textarea
                    className="line-item-notes" rows={2} value={it.notes || ''}
                    onChange={(e) => updateItem(i, 'notes', e.target.value)}
                    placeholder="Description shown under this line on the estimate (optional)"
                  />
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn sm" onClick={addRow}>+ Add line item</button>
      <div className="totals-row">
        <span className="lbl">Tax rate</span>
        <input
          type="number" step="0.001" style={{ width: 70, border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}
          value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
        />
      </div>
      <div className="totals-row"><span className="lbl">Subtotal</span><span className="amt">{money(subtotal)}</span></div>
      {markupAmount > 0 && (
        <div className="totals-row"><span className="lbl">Markup{markupPercent ? ` (${markupPercent}%)` : ''}</span><span className="amt">{money(markupAmount)}</span></div>
      )}
      {discountAmount > 0 && (
        <div className="totals-row"><span className="lbl">Discount</span><span className="amt">-{money(discountAmount)}</span></div>
      )}
      <div className="totals-row"><span className="lbl">Tax</span><span className="amt">{money(tax)}</span></div>
      <div className="totals-row"><span className="lbl">Total</span><span className="amt">{money(total)}</span></div>

      {pickerOpen && (
        <ItemPickerModal catalog={catalog} onPick={pickFromCatalog} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
