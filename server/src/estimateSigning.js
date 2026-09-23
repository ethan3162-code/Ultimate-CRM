// Shared "an estimate just got signed" logic — the exact same side effects whether the customer
// signed it themselves on the public, token-gated approval page (routes/public.js) or a staff
// member captured the signature in person from inside the app (routes/jobs.js's authenticated
// /estimates/:estimateId/sign, for handing the phone/tablet to a customer standing right there).
// Marks the estimate signed, auto-creates the Project + first invoice for an Opportunity-anchored
// estimate that doesn't have one yet, logs activity, and fires the estimate_signed automation +
// notify-the-business alert — factored out here so neither call site has to duplicate it.
const db = require('./db');
const {
  logActivity, getEstimateFull, createInvoiceFromEstimate, createProjectFromDeal, resolveEstimateParty,
} = require('./helpers');
const { fireTrigger } = require('./automationEngine');
const notify = require('./notify');

function signEstimateRecord(estimate, { signed_name, signature_data_url }) {
  db.prepare(`
    UPDATE estimates SET signed_name = ?, signed_at = datetime('now'), signature_data_url = ?, status = CASE WHEN status = 'draft' THEN 'approved' ELSE status END
    WHERE id = ?
  `).run(signed_name.trim(), signature_data_url || null, estimate.id);

  // The Lead -> Appointment -> Opportunity -> Estimate pipeline (Sept 2026): an estimate written
  // against an Opportunity that hasn't become a Project yet gets that Project — and its first
  // invoice — created automatically the moment it's signed, landing in "Pending schedule" rather
  // than requiring a person to come back and do it by hand.
  let jobId = estimate.job_id;
  if (!jobId && estimate.deal_id) {
    const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id);
    if (deal) {
      const { address } = resolveEstimateParty(estimate);
      jobId = createProjectFromDeal(deal, estimate.total, address, 'pending_schedule');
      db.prepare(`UPDATE estimates SET job_id = ? WHERE id = ?`).run(jobId, estimate.id);
      const freshEstimate = getEstimateFull(estimate.id);
      createInvoiceFromEstimate(freshEstimate, jobId);
      if (deal.stage !== 'won') {
        db.prepare(`UPDATE deals SET stage = 'won', updated_at = datetime('now') WHERE id = ?`).run(deal.id);
        logActivity('deal', deal.id, 'stage_change', `Stage moved from "${deal.stage}" to "won" (estimate signed).`);
        fireTrigger('deal_stage_changed', {
          related_type: 'deal', related_id: deal.id,
          dedupe_id: `${deal.id}:won`,
          title: deal.title, value: deal.value, from_stage: deal.stage, to_stage: 'won',
          deal_id: deal.id,
        });
      }
    }
  }

  logActivity('job', jobId, 'estimate', `Estimate ${estimate.number} signed by ${signed_name.trim()}.`);

  const job = jobId ? db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) : null;
  const contact = job?.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(job.contact_id) : null;
  fireTrigger('estimate_signed', {
    related_type: 'job', related_id: jobId,
    dedupe_id: `estimate-signed:${estimate.id}`,
    number: estimate.number, total: estimate.total, job_title: job?.title,
    contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
    contact_email: contact ? contact.email : null,
  });

  // Separate from the automation above — automations email the customer (or log an activity);
  // this is the "notify us" alert the business asked for, sent regardless of whether any
  // automation is configured for estimate_signed at all.
  const signedDeal = !job && estimate.deal_id ? db.prepare(`SELECT * FROM deals WHERE id = ?`).get(estimate.deal_id) : null;
  notify.notifyEstimateSigned({
    estimate, job, deal: signedDeal,
    contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
  }).catch(() => {});

  return jobId;
}

module.exports = { signEstimateRecord };
