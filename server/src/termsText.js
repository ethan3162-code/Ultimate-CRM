// Agreement & Limited Warranty / Terms and Conditions text shown at the bottom of the
// customer-facing Estimate (and carried onto the Invoice PDF). Picked per job by customer type
// (see getJobCustomerType() in helpers.js) — Residential vs Commercial jobs get different clause
// sets, matching the two documents the user has on file.
//
// PLACEHOLDER TEXT — Sept 2026. The user said they have their own real Residential and Commercial
// Terms & Conditions documents and will upload them ("its good the way it is i can uploaded to you
// as well i have a residentail and commercial one"). Until that upload lands, these ten clauses
// (modeled on the same section the user's Joist estimates already carry) are a structural stand-in
// so the document isn't missing this section — swap the CLAUSES arrays below for the uploaded text
// once it's provided, and nothing else on the page needs to change.
const RESIDENTIAL_CLAUSES = [
  ['1. Material Selection & Approval', 'All materials, colors, patterns, and finishes are selected by the customer prior to installation. Natural variations in stone, pavers, and concrete (including color and texture) are inherent to the material and are not grounds for rejection of completed work.'],
  ['2. Mechanic’s Lien Notice', 'Under state law, those who supply labor or materials for this project may file a lien against the property if not paid in full for their services. This notice is provided to comply with applicable lien-law disclosure requirements.'],
  ['3. Unforeseen Conditions & Change Orders', 'This estimate is based on a visual site assessment. Concealed conditions discovered after work begins — including but not limited to poor soil, buried utilities, drainage issues, or existing structural defects — may require a written change order and additional charges before work continues.'],
  ['4. Project Schedule & Delays', 'Start and completion dates are estimates only. Weather, material availability, permitting, and other conditions outside Precision Paving & Masonry’s control may cause reasonable delays without penalty.'],
  ['5. Site Access & Walkthroughs', 'Customer agrees to provide reasonable access to the work area, including clearing vehicles, pets, and obstructions. A final walkthrough will be offered at project completion to confirm the work meets this agreement before final payment is due.'],
  ['6. Entire Agreement', 'This estimate, once signed, together with any signed change orders, constitutes the entire agreement between the parties and supersedes any prior verbal or written understandings.'],
  ['7. Inspection & Right to Cure', 'Customer must notify Precision Paving & Masonry in writing of any workmanship concern within 7 days of project completion. Precision Paving & Masonry will be given a reasonable opportunity to inspect and correct any confirmed defect before any other remedy is sought.'],
  ['8. Limitation of Liability', 'Precision Paving & Masonry’s liability under this agreement is limited to the repair or replacement of defective work. Precision Paving & Masonry is not responsible for pre-existing conditions, damage from third parties, or acts of nature.'],
  ['9. Legal Fees & Governing Law', 'This agreement is governed by the laws of the state in which the project is located. In any dispute arising from this agreement, the prevailing party is entitled to reasonable attorney’s fees and costs.'],
  ['10. Right of Cancellation', 'Customer may cancel this agreement within 3 business days of signing without penalty by providing written notice. Deposits for cancellations after this period, or after materials have been ordered, may be non-refundable to the extent of costs already incurred.'],
];

const COMMERCIAL_CLAUSES = [
  ['1. Material Selection & Approval', 'All materials, colors, patterns, and finishes are selected and approved by an authorized representative of the customer prior to installation. Natural variations in stone, pavers, and concrete are inherent to the material and are not grounds for rejection of completed work.'],
  ['2. Mechanic’s Lien Notice', 'Under state law, those who supply labor or materials for this project may file a lien against the property if not paid in full for their services. This notice is provided to comply with applicable lien-law disclosure requirements.'],
  ['3. Unforeseen Conditions & Change Orders', 'This estimate is based on a visual site assessment. Concealed conditions discovered after work begins — including but not limited to subsurface utilities, soil conditions, or existing structural defects — may require a written change order, signed by both parties, before additional work proceeds.'],
  ['4. Project Schedule & Delays', 'Start and completion dates are estimates only and are not a guaranteed delivery date. Weather, permitting, inspections, material availability, and site conditions outside Precision Paving & Masonry’s control may cause reasonable delays without penalty or liquidated damages, unless separately agreed in writing.'],
  ['5. Site Access & Walkthroughs', 'Customer agrees to provide safe, reasonable access to the work area during business hours, including any required site orientation, safety briefing, or escort. A final walkthrough with the customer’s designated representative will be scheduled at project completion.'],
  ['6. Entire Agreement', 'This estimate, once signed by an authorized representative, together with any signed change orders, constitutes the entire agreement between the parties and supersedes any prior proposal, bid, or verbal understanding.'],
  ['7. Inspection & Right to Cure', 'Customer must notify Precision Paving & Masonry in writing of any workmanship concern within 10 business days of project completion. Precision Paving & Masonry will be given a reasonable opportunity to inspect and correct any confirmed defect before any other remedy is sought.'],
  ['8. Limitation of Liability', 'Precision Paving & Masonry’s liability under this agreement is limited to the repair or replacement of defective work and does not extend to consequential, incidental, or business-interruption damages. Precision Paving & Masonry is not responsible for pre-existing conditions or damage caused by other contractors or third parties on site.'],
  ['9. Legal Fees & Governing Law', 'This agreement is governed by the laws of the state in which the project is located. In any dispute arising from this agreement, the prevailing party is entitled to reasonable attorney’s fees and costs.'],
  ['10. Right of Cancellation', 'Cancellation terms for commercial work are as separately negotiated in this agreement; absent other written terms, deposits are non-refundable once materials have been ordered or work has been scheduled with subcontractors.'],
];

function termsFor(customerType) {
  return {
    heading: 'AGREEMENT & LIMITED WARRANTY / TERMS AND CONDITIONS',
    customerType,
    clauses: customerType === 'Commercial' ? COMMERCIAL_CLAUSES : RESIDENTIAL_CLAUSES,
  };
}

module.exports = { termsFor, RESIDENTIAL_CLAUSES, COMMERCIAL_CLAUSES };

