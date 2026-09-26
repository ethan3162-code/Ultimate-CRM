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
// A deal can hold more than one of these at once (see utils.js's splitWorkTypes/joinWorkTypes) —
// e.g. a project needing both asphalt paving and pavers work.
export const WORK_TYPES = [
  'Asphalt paving',
  'Concrete',
  'Pavers',
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
// "Follow Up AI" (added later that month) is a second, separate follow-up status alongside the
// original (now human-worked) "Follow Up" — the user's own ask, to be able to flip a lead
// between a person following up and an automated one. Setting either one auto-enrolls the lead's
// contact in the active campaign of that exact name (see routes/deals.js's PATCH /:id handler).
export const LEAD_STATUSES = ['New', 'Follow Up', 'Follow Up AI', 'Unresponsive', 'Restart', 'Lost', 'Converted'];
export const LEAD_TYPES = ['New business', 'Repeat customer', 'Referral', 'Other'];
export const JOB_TIMEFRAMES = ['ASAP', 'Within 30 days', '1-3 months', 'Just researching', 'Other'];
export const METHOD_OF_ENTRY = ['Call center', 'Web form', 'Phone', 'Walk-in', 'Referral', 'Email', 'Other'];
export const HA_MATCH_TYPES = ['Exact match', 'Similar match', 'N/A'];

// Project status lifecycle (Sept 2026) — matches the user's real paving-project-management
// tool's Project Status field. Distinct from the construction-phase "stage" bar (Demo/Site
// prep/Installation/Final walkthrough, see Schedule.jsx) — this is the project's overall
// lifecycle, that's the day-by-day build-out progress within it.
// 'pending_schedule' (Sept 2026) is the landing status for a Project created automatically the
// moment a customer signs an estimate written against an Opportunity (see routes/public.js's
// /estimates/:token/sign) — it exists, but nobody's put it on the calendar yet. The manual
// "+ Create project" button on a won Opportunity (DealDetail.jsx) still defaults to 'accepted'.
export const PROJECT_STATUSES = ['pending_schedule', 'accepted', 'scheduled', 'in_progress', 'complete', 'on_hold', 'cancelled'];
export const PROJECT_STATUS_LABEL = {
  pending_schedule: 'Pending Schedule',
  accepted: 'Project Accepted',
  scheduled: 'Project Scheduled',
  in_progress: 'Project In Progress',
  complete: 'Project Complete',
  on_hold: 'Project On Hold',
  cancelled: 'Project Cancelled',
};
