import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
  calcAsphalt, ASPHALT_DEFAULTS,
  calcConcrete, CONCRETE_DEFAULTS,
  calcPavers, PAVER_DEFAULTS,
} from '../lib/materialCalc';

const TYPES = [
  { key: 'asphalt', label: 'Asphalt' },
  { key: 'concrete', label: 'Concrete' },
  { key: 'pavers', label: 'Pavers' },
];

export default function Materials() {
  const navigate = useNavigate();
  const [type, setType] = useState('asphalt');
  const [sf, setSf] = useState('');
  const [asphalt, setAsphalt] = useState(ASPHALT_DEFAULTS);
  const [concrete, setConcrete] = useState(CONCRETE_DEFAULTS);
  const [pavers, setPavers] = useState(PAVER_DEFAULTS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [jobs, setJobs] = useState(null);
  const [jobId, setJobId] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => { api.jobs().then(setJobs); }, []);
  useEffect(() => { setSent(false); }, [type, sf, asphalt, concrete, pavers]);

  const sqft = Number(sf) || 0;

  const result = useMemo(() => {
    if (!sqft) return null;
    if (type === 'asphalt') return calcAsphalt({ sf: sqft, ...asphalt });
    if (type === 'concrete') return calcConcrete({ sf: sqft, ...concrete });
    return calcPavers({ sf: sqft, ...pavers });
  }, [type, sqft, asphalt, concrete, pavers]);

  function lineItems() {
    if (!result) return [];
    if (type === 'asphalt') {
      return [{ description: `Asphalt paving — ${asphalt.thicknessIn}" compacted, ${sqft} SF`, qty: result.tons, unit_price: 0 }];
    }
    if (type === 'concrete') {
      return [{ description: `Concrete — ${concrete.thicknessIn}" slab, ${sqft} SF`, qty: result.cubicYards, unit_price: 0 }];
    }
    return [
      { description: `Pavers — ${sqft} SF`, qty: result.paverCount, unit_price: 0 },
      { description: `Border / edge restraint — ${result.perimeterFt} linear ft`, qty: result.perimeterFt, unit_price: 0 },
      { description: `Bedding sand`, qty: result.sandTons, unit_price: 0 },
      { description: `RCA base`, qty: result.rcaBaseTons, unit_price: 0 },
      { description: `Cement (footing, ${pavers.bagYieldFt3}ft³ bags)`, qty: result.cementBags, unit_price: 0 },
    ];
  }

  function sendToEstimate() {
    if (!jobId || !result) return;
    const items = lineItems();
    sessionStorage.setItem('pendingEstimateItems', JSON.stringify(items));
    navigate(`/jobs/${jobId}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Material calculator</h1>
          <p className="sub">Plug in square footage and get the material quantities for a job — asphalt in tons, concrete in cubic yards, pavers with base, sand, borders, and footing cement.</p>
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
          {type === 'pavers' && (
            <div className="field">
              <label>SF covered per paver</label>
              <input type="number" min="0.01" step="0.01" value={pavers.paverSfCoverage}
                onChange={(e) => setPavers((p) => ({ ...p, paverSfCoverage: e.target.value }))} />
            </div>
          )}
        </div>

        {type === 'pavers' && (
          <div className="form-grid" style={{ marginTop: 12 }}>
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

        <button type="button" className="btn subtle" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Hide' : 'Show'} advanced settings (densities &amp; base depths)
        </button>

        {showAdvanced && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            {type === 'asphalt' && (
              <div className="field">
                <label>Asphalt density (lb/ft³)</label>
                <input type="number" min="0" value={asphalt.densityLbFt3}
                  onChange={(e) => setAsphalt((a) => ({ ...a, densityLbFt3: e.target.value }))} />
              </div>
            )}
            {type === 'pavers' && (
              <>
                <div className="field">
                  <label>Bedding sand depth (in)</label>
                  <input type="number" min="0" step="0.25" value={pavers.sandDepthIn}
                    onChange={(e) => setPavers((p) => ({ ...p, sandDepthIn: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Sand density (lb/ft³)</label>
                  <input type="number" min="0" value={pavers.sandDensityLbFt3}
                    onChange={(e) => setPavers((p) => ({ ...p, sandDensityLbFt3: e.target.value }))} />
                </div>
                <div className="field">
                  <label>RCA base depth (in)</label>
                  <input type="number" min="0" step="0.5" value={pavers.baseDepthIn}
                    onChange={(e) => setPavers((p) => ({ ...p, baseDepthIn: e.target.value }))} />
                </div>
                <div className="field">
                  <label>RCA base density (lb/ft³)</label>
                  <input type="number" min="0" value={pavers.baseDensityLbFt3}
                    onChange={(e) => setPavers((p) => ({ ...p, baseDensityLbFt3: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Footing width (ft)</label>
                  <input type="number" min="0" step="0.1" value={pavers.footingWidthFt}
                    onChange={(e) => setPavers((p) => ({ ...p, footingWidthFt: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Footing depth (ft)</label>
                  <input type="number" min="0" step="0.1" value={pavers.footingDepthFt}
                    onChange={(e) => setPavers((p) => ({ ...p, footingDepthFt: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Cement bag yield (ft³/bag)</label>
                  <input type="number" min="0.1" step="0.1" value={pavers.bagYieldFt3}
                    onChange={(e) => setPavers((p) => ({ ...p, bagYieldFt3: e.target.value }))} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!result ? (
        <div className="card"><div className="empty">Enter a square footage above to see material quantities.</div></div>
      ) : (
        <>
          <div className="kpi-grid" style={{ marginTop: 18, marginBottom: 0 }}>
            {type === 'asphalt' && (
              <>
                <div className="kpi">
                  <div className="label">Asphalt needed</div>
                  <div className="value">{result.tons} tons</div>
                  <div className="delta">{result.cubicFt} ft³ compacted volume</div>
                </div>
              </>
            )}
            {type === 'concrete' && (
              <div className="kpi">
                <div className="label">Concrete needed</div>
                <div className="value">{result.cubicYards} yd³</div>
                <div className="delta">{result.cubicFt} ft³</div>
              </div>
            )}
            {type === 'pavers' && (
              <>
                <div className="kpi">
                  <div className="label">Pavers</div>
                  <div className="value">{result.paverCount}</div>
                  <div className="delta">incl. {pavers.wastePercent}% waste</div>
                </div>
                <div className="kpi">
                  <div className="label">Border / edging</div>
                  <div className="value">{result.perimeterFt} ft</div>
                  <div className="delta">linear feet</div>
                </div>
                <div className="kpi">
                  <div className="label">Bedding sand</div>
                  <div className="value">{result.sandTons} tons</div>
                  <div className="delta">{pavers.sandDepthIn}" depth</div>
                </div>
                <div className="kpi">
                  <div className="label">RCA base</div>
                  <div className="value">{result.rcaBaseTons} tons</div>
                  <div className="delta">{pavers.baseDepthIn}" depth</div>
                </div>
                <div className="kpi">
                  <div className="label">Cement bags</div>
                  <div className="value">{result.cementBags}</div>
                  <div className="delta">for edge footing</div>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h2>Send to a job's estimate</h2>
            <p className="sub" style={{ marginBottom: 12 }}>Adds these quantities as line items on the job — prices start at $0 so you can fill in your own numbers before sending it to the customer.</p>
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
        </>
      )}
    </>
  );
}
