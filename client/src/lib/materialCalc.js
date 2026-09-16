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
  sfPerPallet: 120,
  wastePercent: 10,
  perimeterFt: '',
  borderUnitLengthFt: 1,
  drypackDepthIn: 1.5,
  cementBagsPerYardSand: 4,
  baseDepthIn: 6,
};

/**
 * Pavers: SF -> pallets of pavers (by SF coverage per pallet), border units
 * (perimeter split into border-piece lengths), sand, portland cement, and
 * RCA base.
 *
 * Pallets are sized by how much SF one pallet covers (as printed on the
 * supplier's pallet tag), not by counting individual paver units.
 *
 * Border/edging pieces come in their own size, so the linear-foot perimeter
 * is converted into a count of border units using that piece's length.
 *
 * Sand is the bedding course under the pavers, sized by its own height in
 * inches. Portland cement is then added at a fixed rate per cubic yard of
 * that sand — a standard field ratio for dry-pack mortar beds, e.g. 4 bags
 * of cement per cubic yard of sand.
 *
 * RCA base volume is sized the same way, by its own height, in cubic yards.
 *
 * Perimeter is used only for the border/edging run; if left blank it's
 * estimated from SF assuming a roughly square area (4 x sqrt(SF)).
 */
export function calcPavers({
  sf,
  sfPerPallet,
  wastePercent,
  perimeterFt,
  borderUnitLengthFt,
  drypackDepthIn,
  cementBagsPerYardSand,
  baseDepthIn,
}) {
  const sqft = Number(sf) || 0;
  const waste = Number(wastePercent) || 0;
  const sfWithWaste = round(sqft * (1 + waste / 100), 1);
  const perPallet = Number(sfPerPallet) || 1;
  const palletCount = Math.ceil(sfWithWaste / perPallet);

  const perimeter = perimeterFt !== '' && perimeterFt != null && !Number.isNaN(Number(perimeterFt))
    ? Number(perimeterFt)
    : 4 * Math.sqrt(sqft || 0);
  const unitLength = Number(borderUnitLengthFt) || 1;
  const borderUnitCount = Math.ceil(perimeter / unitLength);

  const drypackDepth = Number(drypackDepthIn) || 0;
  const drypackSandYd3 = round((sqft * (drypackDepth / 12)) / 27);
  const ratio = Number(cementBagsPerYardSand) || 0;
  const drypackCementBags = Math.ceil(drypackSandYd3 * ratio);

  const baseDepth = Number(baseDepthIn) || 0;
  const rcaBaseYd3 = round((sqft * (baseDepth / 12)) / 27);

  return {
    palletCount,
    sfWithWaste,
    perimeterFt: round(perimeter, 1),
    borderUnitCount,
    drypackSandYd3,
    drypackCementBags,
    rcaBaseYd3,
  };
}
