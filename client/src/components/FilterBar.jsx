// Generic instant filter bar (Sept 2026) — a row of dropdowns, each scoped to one field on the
// records already loaded client-side (same "filter what's already in memory" approach the
// Estimates search box uses), so picking a value narrows the view immediately with no round trip
// to the server. Reusable across any list page: the page owns the actual filter values and the
// filtering logic against its own records — this component only renders the controls and reports
// changes back up.
//
// `filters`: [{ key, label, options: [{ value, label }] }] — options should NOT include an
// "All ..." placeholder; this component adds that itself so every dropdown's first entry reads
// the same way everywhere.
// `values`: { [key]: value } — an empty string means "no filter set" for that field.
// `onChange(key, value)`: called when one dropdown changes.
// `onClear()`: called by the "Clear filters" button — only rendered while at least one filter is active.
export default function FilterBar({ filters, values, onChange, onClear }) {
  const activeCount = filters.filter((f) => values[f.key]).length;
  return (
    <div className="filter-bar">
      {filters.map((f) => (
        <div className="filter-bar-field" key={f.key}>
          <select
            value={values[f.key] || ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            className={'filter-select' + (values[f.key] ? ' active' : '')}
            aria-label={f.label}
          >
            <option value="">All {f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ))}
      {activeCount > 0 && (
        <button type="button" className="btn sm subtle" onClick={onClear}>
          Clear filters{activeCount > 1 ? ` (${activeCount})` : ''}
        </button>
      )}
    </div>
  );
}
