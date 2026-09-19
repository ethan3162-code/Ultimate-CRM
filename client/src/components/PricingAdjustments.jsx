import { money } from '../utils';

// Global markup and discount for an estimate — sits right next to the payment schedule, since
// like it these apply to the estimate as a whole rather than any one line item. Markup adds a
// flat % on top of the line-item subtotal (the contractor's own margin); a discount then comes
// off that marked-up number, either a flat $ amount or a %. Both feed the same math
// LineItemEditor's totals breakdown uses (see utils.js's estimateBreakdown), so the numbers shown
// here are just a quick live preview of the $ impact — the authoritative Subtotal/Markup/
// Discount/Tax/Total is the one under the line items above.
export default function PricingAdjustments({
  subtotal, markupPercent, setMarkupPercent, discountType, setDiscountType, discountValue, setDiscountValue,
}) {
  const markupAmount = subtotal * ((Number(markupPercent) || 0) / 100);
  const markedUp = subtotal + markupAmount;
  const hasDiscount = discountType != null;
  let rawDiscountAmount = 0;
  if (discountType === 'percent') rawDiscountAmount = markedUp * ((Number(discountValue) || 0) / 100);
  else if (discountType === 'flat') rawDiscountAmount = Number(discountValue) || 0;
  const discountAmount = Math.max(0, Math.min(rawDiscountAmount, markedUp));

  function addDiscount() {
    setDiscountType('percent');
    setDiscountValue('');
  }
  function removeDiscount() {
    setDiscountType(null);
    setDiscountValue('');
  }

  return (
    <div className="pricing-adjustments" style={{ margin: '10px 0' }}>
      <label style={{ marginBottom: 6 }}>Pricing adjustments <span className="muted" style={{ fontWeight: 400 }}>— applied to the whole estimate, before tax</span></label>

      <div className="row between" style={{ alignItems: 'center', marginBottom: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Markup</span>
          <input
            type="number" step="any" min="0" placeholder="0" value={markupPercent}
            onChange={(e) => setMarkupPercent(e.target.value)}
            style={{ width: 70, border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}
          />
          <span style={{ fontSize: 13 }}>%</span>
        </div>
        {markupAmount > 0 && <span className="muted" style={{ fontSize: 13 }}>+{money(markupAmount)}</span>}
      </div>

      {!hasDiscount && (
        <button type="button" className="btn subtle sm" onClick={addDiscount}>+ Add discount</button>
      )}

      {hasDiscount && (
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <div className="method-toggle" style={{ marginBottom: 0, width: 96 }}>
              <button type="button" className={discountType === 'percent' ? 'active' : ''} onClick={() => setDiscountType('percent')}>%</button>
              <button type="button" className={discountType === 'flat' ? 'active' : ''} onClick={() => setDiscountType('flat')}>$</button>
            </div>
            <input
              type="number" step="any" min="0" placeholder="0" value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              style={{ width: 90, border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}
            />
            <button type="button" className="btn subtle sm" onClick={removeDiscount}>✕</button>
          </div>
          {discountAmount > 0 && <span className="muted" style={{ fontSize: 13 }}>-{money(discountAmount)}</span>}
        </div>
      )}
    </div>
  );
}

