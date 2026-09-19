import { money } from '../utils';

// A quick-add starting point for the three milestones most paving & masonry jobs bill against.
// Percentages are just a sane starting split — every name and number here is editable like any
// other row, and nothing stops the user from renaming, re-splitting, or adding more of their own.
const PRESET_SCHEDULE = [
  { name: '1st Payment Due on Start Date', percent: 40 },
  { name: '2nd Payment Due after Demo is Completed', percent: 30 },
  { name: 'Final Payment Due upon Completion', percent: 30 },
];

// A named, multi-milestone payment schedule for an estimate — "Deposit", "1st payment due on
// start date", "Final payment due on completion", each carrying its own % of the estimate's
// total. `total` is the estimate's current (live, unsaved-included) total, so the $ column next
// to each row updates immediately as line items or tax change, before the estimate is even saved.
export default function PaymentScheduleEditor({ rows, setRows, total }) {
  function updateRow(i, field, value) {
    const next = rows.slice();
    next[i] = { ...next[i], [field]: value };
    setRows(next);
  }
  function addRow() {
    setRows([...rows, { name: '', percent: 0 }]);
  }
  function removeRow(i) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  function addPreset() {
    setRows([...rows, ...PRESET_SCHEDULE]);
  }

  const allocated = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const remaining = Math.round((100 - allocated) * 100) / 100;
  const pillClass = remaining === 0 ? 'green' : remaining < 0 ? 'red' : 'amber';
  const pillText = remaining === 0 ? 'Fully allocated (100%)' : remaining > 0 ? `${remaining}% remaining` : `${Math.abs(remaining)}% over 100%`;

  return (
    <div className="payment-schedule-editor" style={{ margin: '10px 0' }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <label style={{ marginBottom: 0 }}>Payment schedule <span className="muted" style={{ fontWeight: 400 }}>— optional, shown to the customer on the estimate</span></label>
        {rows.length > 0 && <span className={`pill ${pillClass}`}>{pillText}</span>}
      </div>

      {rows.length > 0 && (
        <table className="line-items">
          <thead>
            <tr><th>Payment name</th><th className="num">%</th><th className="num">Amount</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input value={r.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="e.g. Deposit" /></td>
                <td className="num"><input type="number" step="any" min="0" max="100" value={r.percent} onChange={(e) => updateRow(i, 'percent', e.target.value)} /></td>
                <td className="num muted">{money(total * ((Number(r.percent) || 0) / 100))}</td>
                <td><button type="button" className="btn subtle sm" onClick={() => removeRow(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={addRow}>+ Add payment</button>
        {rows.length === 0 && (
          <button type="button" className="btn subtle sm" onClick={addPreset}>+ Use standard schedule (start / demo / completion)</button>
        )}
      </div>
    </div>
  );
}
