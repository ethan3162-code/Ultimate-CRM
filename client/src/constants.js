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

// Type-of-work categorization for an opportunity (Salesforce "Service Type" equivalent) —
// closes the "type of work" reporting gap so Sales can be broken out the way the business
// actually quotes jobs.
export const WORK_TYPES = [
  'Asphalt paving',
  'Concrete',
  'Sealcoating & striping',
  'Outdoor kitchen',
  'Sidewalks',
  'Masonry',
  'Other',
];

// Residential vs. commercial — a standard second axis contractor CRMs report Sales by,
// alongside service type.
export const CUSTOMER_TYPES = ['Residential', 'Commercial'];

// Lead-detail field options (Salesforce Lead-object parity, Sept 2026) — matches the level
// of detail Ethan's Salesforce Lead record captures, minus the tool-specific "(Hatch)"
// nurture-platform statuses, which are dropped in favor of the plain disposition they represent.
export const LEAD_STATUSES = ['New', 'Follow Up', 'Unresponsive', 'Restart', 'Lost', 'Converted'];
export const LEAD_TYPES = ['New business', 'Repeat customer', 'Referral', 'Other'];
export const JOB_TIMEFRAMES = ['ASAP', 'Within 30 days', '1-3 months', 'Just researching', 'Other'];
export const METHOD_OF_ENTRY = ['Call center', 'Web form', 'Phone', 'Walk-in', 'Referral', 'Email', 'Other'];
export const HA_MATCH_TYPES = ['Exact match', 'Similar match', 'N/A'];
