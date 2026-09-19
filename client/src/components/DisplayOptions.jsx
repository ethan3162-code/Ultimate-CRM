// The customer-view "Display Options" toggle (Sept 2026) — three independent switches controlling
// what a customer-facing estimate/invoice's line-items table shows, matching Joist's own Display
// Options dialog: Rate, Quantity, Item Totals. The document's own Subtotal/Tax/Total always show
// regardless — these three only ever hide/show a column on each line.
export default function DisplayOptions({ value, onChange }) {
  const items = [
    ['show_rate', 'Rate'],
    ['show_qty', 'Quantity'],
    ['show_item_total', 'Item Totals'],
  ];
  return (
    <div className="field" style={{ marginTop: 10 }}>
      <label>What should the customer see on this document?</label>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        {items.map(([key, label]) => (
          <label key={key} className="row" style={{ gap: 6, alignItems: 'center', fontWeight: 400, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={value[key] !== false}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

