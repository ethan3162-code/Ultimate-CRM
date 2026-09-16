// Lead-source options for a home-services/paving contractor, so reporting on
// "where leads come from" stays clean instead of a free-text mess. The first
// six are the marketing channels Ethan asked to track directly; the rest are
// practical extras (repeat business, in-person, and system-generated) that
// those six channels don't cover.
export const LEAD_SOURCES = [
  'Google Ads',
  'Web forms',
  'Referral',
  'Direct',
  'SEO (organic)',
  'Meta/Facebook ads',
  'Repeat customer',
  'Walk-in / door hanger',
  'Yelp',
  'Angi/HomeAdvisor',
  'Trade show',
  'Webhook',
  'Other',
];

// Job-costing expense categories — a standard contractor cost breakdown (materials,
// crew time, equipment, permits/fees, subcontractors) so profitability reporting can
// group spend the way a paving/home-services business actually thinks about it.
export const EXPENSE_CATEGORIES = [
  'Materials',
  'Labor',
  'Equipment',
  'Subcontractor',
  'Permits & fees',
  'Disposal',
  'Other',
];
