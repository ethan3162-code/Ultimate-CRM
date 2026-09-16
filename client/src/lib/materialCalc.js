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
  paversPerPallet: 100,
  wastePercent: 10,
  perimeterFt: '',
  drypackDepthIn: 1.5,
  drypackRatio: 4,
  cementBagVolumeFt3: 1,
  baseDepthIn: 6,
  footingWidthFt: 0.5,
  footingDepthFt: 0.5,
  bagYieldFt3: 0.6,
};

/**
 * Pavers: SF -> pallets of pavers, border linear feet (single units — borders
 * aren't palletized), drypack bedding (sand + portland cement, by volume) split
 * into sand yards and cement bags, RCA base yards, and footing cement bags for
 * the edge restraint.
 *
 * Pavers are ordered by the pallet, so the individual-unit count is rounded up
 * to whole pallets using how many units the supplier packs per pallet.
 *
 * Drypack is the sand/cement bedding course under the pavers, sized by its own
 * height. It's split by a sand:cement ratio (parts sand per 1 part cement, 4:1
 * is a common structural mix) into a sand volume and a cement volume, and the
 * cement volume is converted to bags via the bag's loose volume (~1 ft3 for a
 * standard 94lb bag of portland cement).
 *
 * RCA base volume is sized the same way, by its own height.
 *
 * Perimeter is used only for the border/edge-restraint run and its footing; if
 * left blank it's estimated from SF assuming a roughly square area (4 x sqrt(SF)).
 */
export function calcPavers({
  sf,
  paverSfCoverage,
  paversPerPallet,
  wastePercent,
  perimeterFt,
  drypackDepthIn,
  drypackRatio,
  cementBagVolumeFt3,
  baseDepthIn,
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
  const perPallet = Number(paversPerPallet) || 1;
  const palletCount = Math.ceil(paverCount / perPallet);

  const drypackDepth = Number(drypackDepthIn) || 0;
  const drypackVolumeFt3 = sqft * (drypackDepth / 12);
  const drypackYd3 = round(drypackVolumeFt3 / 27);
  const ratio = Number(drypackRatio) || 1;
  const sandShare = ratio / (ratio + 1);
  const cementShare = 1 / (ratio + 1);
  const drypackSandYd3 = round(drypackYd3 * sandShare);
  const cementBagVolume = Number(cementBagVolumeFt3) || 1;
  const drypackCementBags = Math.ceil((drypackVolumeFt3 * cementShare) / cementBagVolume);

  const baseDepth = Number(baseDepthIn) || 0;
  const rcaBaseYd3 = round((sqft * (baseDepth / 12)) / 27);

  const footingWidth = Number(footingWidthFt) || 0;
  const footingDepth = Number(footingDepthFt) || 0;
  const bagYield = Number(bagYieldFt3) || 1;
  const footingVolumeFt3 = perimeter * footingWidth * footingDepth;
  const footingCementBags = Math.ceil(footingVolumeFt3 / bagYield);

  return {
    paverCount,
    palletCount,
    perimeterFt: round(perimeter, 1),
    drypackYd3,
    drypackSandYd3,
    drypackCementBags,
    rcaBaseYd3,
    footingCementBags,
  };
}
