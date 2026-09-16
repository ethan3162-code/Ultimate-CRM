// Pure calculation helpers for the material calculator.
// Standard paving-estimation formulas. Every default below is editable in the
// UI — real products (paver size, stone density, mix design) vary by supplier,
// so these are sensible starting points, not fixed constants.

export function round(n, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

export const ASPHALT_DEFAULTS = { thicknessIn: 2, densityLbFt3: 145 };

/** Asphalt: SF -> tons. tons = SF x (thickness/12) x density(lb/ft3) / 2000 */
export function calcAsphalt({ sf, thicknessIn, densityLbFt3 }) {
  const sqft = Number(sf) || 0;
  const thick = Number(thicknessIn) || 0;
  const density = Number(densityLbFt3) || 0;
  const cubicFt = sqft * (thick / 12);
  const tons = (cubicFt * density) / 2000;
  return { cubicFt: round(cubicFt), tons: round(tons) };
}

export const CONCRETE_DEFAULTS = { thicknessIn: 4 };

/** Concrete: SF -> cubic yards. cy = SF x (thickness/12) / 27 */
export function calcConcrete({ sf, thicknessIn }) {
  const sqft = Number(sf) || 0;
  const thick = Number(thicknessIn) || 0;
  const cubicFt = sqft * (thick / 12);
  const cubicYards = cubicFt / 27;
  return { cubicFt: round(cubicFt), cubicYards: round(cubicYards) };
}

export const PAVER_DEFAULTS = {
  paverSfCoverage: 0.45,
  wastePercent: 10,
  perimeterFt: '',
  sandDepthIn: 1,
  sandDensityLbFt3: 100,
  baseDepthIn: 6,
  baseDensityLbFt3: 105,
  footingWidthFt: 0.5,
  footingDepthFt: 0.5,
  bagYieldFt3: 0.6,
};

/**
 * Pavers: SF -> paver count, border linear feet, bedding sand, RCA base, footing cement bags.
 * Perimeter is used only for the border/edge-restraint run and its footing; if left blank
 * it's estimated from SF assuming a roughly square area (4 x sqrt(SF)).
 */
export function calcPavers({
  sf,
  paverSfCoverage,
  wastePercent,
  perimeterFt,
  sandDepthIn,
  sandDensityLbFt3,
  baseDepthIn,
  baseDensityLbFt3,
  footingWidthFt,
  footingDepthFt,
  bagYieldFt3,
}) {
  const sqft = Number(sf) || 0;
  const coverage = Number(paverSfCoverage) || 1;
  const waste = Number(wastePercent) || 0;
  const perimeter = perimeterFt !== '' && perimeterFt != null && !Number.isNaN(Number(perimeterFt))
    ? Number(perimeterFt)
    : 4 * Math.sqrt(sqft || 0);

  const paverCount = Math.ceil((sqft / coverage) * (1 + waste / 100));

  const sandDepth = Number(sandDepthIn) || 0;
  const sandDensity = Number(sandDensityLbFt3) || 0;
  const sandTons = round((sqft * (sandDepth / 12) * sandDensity) / 2000);

  const baseDepth = Number(baseDepthIn) || 0;
  const baseDensity = Number(baseDensityLbFt3) || 0;
  const rcaBaseTons = round((sqft * (baseDepth / 12) * baseDensity) / 2000);

  const footingWidth = Number(footingWidthFt) || 0;
  const footingDepth = Number(footingDepthFt) || 0;
  const bagYield = Number(bagYieldFt3) || 1;
  const footingVolumeFt3 = perimeter * footingWidth * footingDepth;
  const cementBags = Math.ceil(footingVolumeFt3 / bagYield);

  return {
    paverCount,
    perimeterFt: round(perimeter, 1),
    sandTons,
    rcaBaseTons,
    cementBags,
  };
}
