import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { money } from '../utils';
import {
  calcAsphalt, ASPHALT_DEFAULTS,
  calcConcrete, CONCRETE_DEFAULTS,
  calcPavers, PAVER_DEFAULTS,
} from '../lib/materialCalc';
import { usePermission } from '../auth';

const TYPES = [
  { key: 'asphalt', label: 'Asphalt' },
  { key: 'concrete', label: 'Concrete' },
  { key: 'pavers', label: 'Pavers' },
];

export default function Materials() {
  const { canEdit } = usePermission('materials');
  const navigate = useNavigate();
  const [type, setType] = useState('asphalt');
  const [sf, setSf] = useState('');
  const [asphalt, setAsphalt] = useState(ASPHALT_DEFAULTS);
  const [concrete, setConcrete] = useState(CONCRETE_DEFAULTS);
  const [pavers, setPavers] = useState(PAVER_DEFAULTS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prices, setPrices] = useState({});
  const [catalog, setCatalog] = useState(null);
  const [paverProductId, setPaverProductId] = useState('');

  const [jobs, setJobs] = useState(null);
  const [jobId, setJobId] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => { api.jobs().then(setJobs); }, []);
  useEffect(() => { api.catalogItems().then(setCatalog); }, []);
  useEffect(() => { setSent(false); }, [type, sf, asphalt, concrete, pavers, prices]);

  const sqft = Number(sf) || 0;

  // Paver products in the price book (brand items like Nicolock or Cambridge)
  // that carry an SF-per-pallet coverage — picking one below fills in both
  // the pallet math and the price in one step.
  const paverProducts = useMemo(
    () => (catalog || []).filter((c) => c.material_key === 'pavers' && c.sf_per_pallet),
    [catalog]
  );
  function selectPaverProduct(id) {
    setPaverProductId(id);
    const product = paverProducts.find((p) => String(p.id) === String(id));
    if (!product) return;
    setPavers((p) => ({ ...p, sfPerPallet: product.sf_per_pallet }));
    setPrice('pavers', String(product.unit_price));
  }

  const result = useMemo(() => {
    if (!sqft) return null;
    if (type === 'asphalt') return calcAsphalt({ sf: sqft, ...asphalt });
    if (type === 'concrete') return calcConcrete({ sf: sqft, ...concrete });
    return calcPavers({ sf: sqft, ...pavers });
  }, [type, sqft, asphalt, concrete, pavers]);

  // The raw material quantities for the active type — description, qty, and unit
  // only. Unit prices live in `prices` (keyed so pavers/border/sand/etc never
  // collide across tabs), so switching tabs or SF doesn't lose what was typed.
  const rows = useMemo(() => {
    if (!result) return [];
    if (type === 'asphalt') {
      return [{ key: 'asphalt', description: `Asphalt paving — ${asphalt.thicknessIn}" compacted, ${sqft} SF`, qty: result.tons, unit: 'tons' }];
    }
    if (type === 'concrete') {
      return [{ key: 'concrete', description: `Concrete — ${concrete.thicknessIn}" slab, ${sqft} SF`, qty: result.cubicYards, unit: 'yd³' }];
    }
    return [
      { key: 'pavers', description: `Pavers — ${sqft} SF incl. ${pavers.wastePercent}% waste (${result.sfWithWaste} SF, ${pavers.sfPerPallet} SF/pallet)`, qty: result.palletCount, unit: 'pallets' },
      { key: 'border', description: `Border / edging — ${result.perimeterFt} linear ft, ${pavers.borderUnitLengthFt} ft/unit`, qty: result.borderUnitCount, unit: 'units' },
      { key: 'sand', description: `Sand — drypack bedding, ${pavers.drypackDepthIn}" depth`, qty: result.drypackSandYd3, unit: 'yd³' },
      { key: 'cement', description: `Portland cement — ${pavers.cementBagsPerYardSand} bags per yd³ of sand`, qty: result.drypackCementBags, unit: 'bags' },
      { key: 'rcaBase', description: `RCA base — ${pavers.baseDepthIn}" depth`, qty: result.rcaBaseYd3, unit: 'yd³' },
    ];
  }, [type, result, sqft, asphalt, concrete, pavers]);

  // Pre-fill a row's price from the price book the first time it appears —
  // never overwrites a price the user already typed (including a deliberate
  // blank), since a key is only missing from `prices` before that first fill.
  useEffect(() => {
    if (!catalog || !catalog.length || !rows.length) return;
    setPrices((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        if (!(r.key in next)) {
          const match = catalog.find((c) => c.material_key === r.key);
          if (match) { next[r.key] = String(match.unit_price); changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, [catalog, rows]);

  const priceFor = (key) => prices[key] ?? '';
  function setPrice(key, value) {
    setPrices((p) => ({ ...p, [key]: value }));
  }
  const totalCost = rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(priceFor(r.key)) || 0), 0);

  function sendToEstimate() {
    if (!jobId || !result) return;
    const items = rows.map((r) => ({ description: r.description, qty: r.qty, unit_price: Number(priceFor(r.key)) || 0 }));
    sessionStorage.setItem('pendingEstimateItems', JSON.stringify(items));
    navigate(`/jobs/${jobId}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Material calculator</h1>
          <p className="sub">Plug in square footage and get the material quantities and cost for a job — asphalt in tons, concrete in cubic yards, pavers by the pallet (pick a brand like Nicolock or Cambridge from your <Link to="/items" className="link-strong">price book</Link> to fill in SF/pallet automatically) with sand, portland cement, and RCA base in cubic yards.</p>
        </div>
      </div>

      <div className="tabs">
        {TYPES.map((t) => (
          <button key={t.key} className={'tab' + (type === t.key ? ' active' : '')} onClick={() => setType(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label>Square footage (SF)</label>
            <input type="number" min="0" value={sf} onChange={(e) => setSf(e.target.value)} placeholder="e.g. 1200" />
          </div>

          {type === 'asphalt' && (
            <div className="field">
              <label>Compacted thickness (in)</label>
              <input type="number" min="0" step="0.25" value={asphalt.thicknessIn}
                onChange={(e) => setAsphalt((a) => ({ ...a, thicknessIn: e.target.value }))} />
            </div>
          )}
          {type === 'concrete' && (
            <div className="field">
              <label>Slab thickness (in)</label>
              <input type="number" min="0" step="0.25" value={concrete.thicknessIn}
                onChange={(e) => setConcrete((c) => ({ ...c, thicknessIn: e.target.value }))} />
            </div>
          )}
          {type === 'pavers' && paverProducts.length > 0 && (
            <div className="field">
              <label>Paver product</label>
              <select value={paverProductId} onChange={(e) => selectPaverProduct(e.target.value)}>
                <option value="">Manual — enter SF/pallet myself</option>
                {paverProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.brand ? `${p.brand} — ` : ''}{p.name} ({p.sf_per_pallet} SF/pallet, {money(p.unit_price)})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {type === 'pavers' && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label>SF per pallet</label>
              <input type="number" min="0.01" step="1" value={pavers.sfPerPallet}
                onChange={(e) => { setPaverProductId(''); setPavers((p) => ({ ...p, sfPerPallet: e.target.value })); }} />
            </div>
            <div className="field">
              <label>Border / edging unit length (ft)</label>
              <input type="number" min="0.1" step="0.1" value={pavers.borderUnitLengthFt}
                onChange={(e) => setPavers((p) => ({ ...p, borderUnitLengthFt: e.target.value }))} />
            </div>
            <div className="field">
              <label>Drypack depth (in) — sand bedding</label>
              <input type="number" min="0" step="0.25" value={pavers.drypackDepthIn}
                onChange={(e) => setPavers((p) => ({ ...p, drypackDepthIn: e.target.value }))} />
            </div>
            <div className="field">
              <label>Portland cement — bags per yd³ of sand</label>
              <input type="number" min="0" step="0.5" value={pavers.cementBagsPerYardSand}
                onChange={(e) => setPavers((p) => ({ ...p, cementBagsPerYardSand: e.target.value }))} />
            </div>
            <div className="field">
              <label>RCA base depth (in)</label>
              <input type="number" min="0" step="0.5" value={pavers.baseDepthIn}
                onChange={(e) => setPavers((p) => ({ ...p, baseDepthIn: e.target.value }))} />
            </div>
            <div className="field">
              <label>Waste / cut allowance (%)</label>
              <input type="number" min="0" value={pavers.wastePercent}
                onChange={(e) => setPavers((p) => ({ ...p, wastePercent: e.target.value }))} />
            </div>
            <div className="field">
              <label>Perimeter (linear ft, optional)</label>
              <input type="number" min="0" value={pavers.perimeterFt} placeholder="auto-estimated if blank"
                onChange={(e) => setPavers((p) => ({ ...p, perimeterFt: e.target.value }))} />
            </div>
          </div>
        )}

        {type === 'asphalt' && (
          <button type="button" className="btn subtle" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? 'Hide' : 'Show'} advanced settings
          </button>
        )}

        {showAdvanced && type === 'asphalt' && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Asphalt density (lb/ft³)</label>
              <input type="number" min="0" value={asphalt.densityLbFt3}
                onChange={(e) => setAsphalt((a) => ({ ...a, densityLbFt3: e.target.value }))} />
            </div>
          </div>
        )}
      </div>

      {!result ? (
        <div className="card"><div className="empty">Enter a square footage above to see material quantities.</div></div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 18 }}>
            <h2>Materials &amp; cost</h2>
            <p className="sub" style={{ marginBottom: 12 }}>Prices pre-fill from your <Link to="/items" className="link-strong">items &amp; price book</Link> when a match exists — override any of them below.</p>
            <table className="line-items">
              <thead>
                <tr><th>Material</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.description}</td>
                    <td className="num mono">{r.qty}</td>
                    <td className="mono">{r.unit}</td>
                    <td className="num">
                      <input type="number" min="0" step="0.01" value={priceFor(r.key)} placeholder="0"
                        onChange={(e) => setPrice(r.key, e.target.value)} />
                    </td>
                    <td className="num mono">{money((Number(r.qty) || 0) * (Number(priceFor(r.key)) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="totals-row"><span className="lbl">Total material cost</span><span className="amt">{money(totalCost)}</span></div>
          </div>

          {canEdit && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>Send to a job's estimate</h2>
            <p className="sub" style={{ marginBottom: 12 }}>Adds these quantities and prices as line items on the job, ready to review before sending it to the customer.</p>
            <div className="form-grid">
              <div className="field">
                <label>Job</label>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">Select a job…</option>
                  {(jobs || []).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.company_name || (j.first_name ? `${j.first_name} ${j.last_name}` : 'no contact')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="button" className="btn primary" style={{ marginTop: 12 }} disabled={!jobId} onClick={sendToEstimate}>
              Send to job estimate
            </button>
            {sent && <span className="muted" style={{ marginLeft: 10 }}>Sent — opening job…</span>}
          </div>
          )}
        </>
      )}
    </>
  );
}
