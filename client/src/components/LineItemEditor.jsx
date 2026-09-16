import { money } from '../utils';

export default function LineItemEditor({ items, setItems, taxRate, setTaxRate }) {
  function updateItem(i, field, value) {
    const next = items.slice();
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  }
  function addRow() {
    setItems([...items, { description: '', qty: 1, unit_price: 0 }]);
  }
  function removeRow(i) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const tax = subtotal * (Number(taxRate) || 0);

  return (
    <div>
      <table className="line-items">
        <thead>
          <tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="e.g. Labor, materials…" /></td>
              <td className="num"><input type="number" step="any" value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
              <td className="num"><input type="number" step="any" value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} /></td>
              <td><button type="button" className="btn subtle sm" onClick={() => removeRow(i)}>✕</button></td>
            </tr>
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
      <div className="totals-row"><span className="lbl">Tax</span><span className="amt">{money(tax)}</span></div>
      <div className="totals-row"><span className="lbl">Total</span><span className="amt">{money(subtotal + tax)}</span></div>
    </div>
  );
}
