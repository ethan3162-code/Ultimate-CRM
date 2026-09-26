const express = require('express');
const db = require('../db');
const { logActivity } = require('../helpers');
const { fireTrigger } = require('../automationEngine');
const { canSeePrices, checkSectionEdit, getPermissions } = require('../auth');

// Hides dollar figures for a login whose price visibility is off (see Users & permissions —
// "Can see prices"). Deliberately explicit about which fields count as a price, rather than
// matching by field name, so a differently-named non-money field never gets swept up by
// accident. `null` (not 0) so the client can tell "hidden" apart from "actually zero".
function redactDealMoney(deal) {
  return { ...deal, value: null, ha_lead_fee: null, price_hidden: true };
}

const router = express.Router();

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
// A lead (stage 'new') only ever becomes an Opportunity by having an appointment scheduled
// against it — see routes/appointments.js's POST handler, which does that promotion itself the
// moment a lead's first appointment is booked. So no other path (a manual stage edit here, a
// Kanban drag, the old "+ New opportunity"/"Qualify" shortcuts) is allowed to take a lead
// straight into one of these stages without an appointment already on file. 'lost' is exempt —
// disqualifying a lead that never gets an appointment is still a normal, appointment-free path.
const OPPORTUNITY_STAGES = ['qualified', 'proposal', 'negotiation', 'won'];

// Deterministic deal score (Salesforce/HubSpot-style lead scoring, no ML) — a plain
// 0-100 number plus a Hot/Warm/Cool label, so reps can tell at a glance what to work
// next. Inputs: sales-set probability, deal size, whether the lead has an attributed
// source, and how long it's been since anything happened on the deal.
function scoreDeal(deal, lastActivityAt) {
  if (deal.stage === 'won') return { score: 100, label: 'Won' };
  if (deal.stage === 'lost') return { score: 0, label: 'Lost' };
  let score = Number(deal.probability) || 0;
  if (deal.value >= 50000) score += 15;
  else if (deal.value >= 20000) score += 8;
  else if (deal.value >= 5000) score += 3;
  if (deal.source) score += 5;
  const referenceDate = lastActivityAt || deal.updated_at || deal.created_at;
  const daysSince = referenceDate ? Math.floor((Date.now() - new Date(referenceDate.replace(' ', 'T') + 'Z').getTime()) / 86400000) : 0;
  if (daysSince > 14) score -= 20;
  else if (daysSince > 7) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cool';
  return { score, label, days_since_activity: daysSince };
}

function withScore(deal) {
  const lastActivity = db.prepare(`SELECT MAX(created_at) AS d FROM activities WHERE related_type = 'deal' AND related_id = ?`).get(deal.id).d;
  return { ...deal, ...scoreDeal(deal, lastActivity) };
}

// Customer info shown on the pipeline (Joist/Salesforce-style): prefer the
// linked contact's own phone/address, and fall back to the company's when the
// contact doesn't have one set.
function withCustomerInfo(deal) {
  return {
    ...deal,
    customer_phone: deal.contact_phone || deal.company_phone || null,
    customer_address: deal.contact_address || deal.company_address || null,
  };
}

const DEAL_SELECT = `
  SELECT d.*, c.first_name, c.last_name, c.phone AS contact_phone, c.address AS contact_address,
         co.name AS company_name, co.phone AS company_phone, co.address AS company_address,
         ou.username AS owner_username, ou.role AS owner_role,
         cu.username AS created_by_username, uu.username AS updated_by_username
  FROM deals d
  LEFT JOIN contacts c ON c.id = d.contact_id
  LEFT JOIN companies co ON co.id = d.company_id
  LEFT JOIN users ou ON ou.id = d.owner_user_id
  LEFT JOIN users cu ON cu.id = d.created_by_user_id
  LEFT JOIN users uu ON uu.id = d.updated_by_user_id
`;

router.get('/', (req, res) => {
  const rows = db.prepare(`${DEAL_SELECT} ORDER BY d.updated_at DESC`).all();
  const out = rows.map(withCustomerInfo).map(withScore);
  res.json(canSeePrices(req.user) ? out : out.map(redactDealMoney));
});

const LEAD_DETAIL_FIELDS = [
  'lead_status', 'lead_type', 'job_timeframe', 'followup_date', 'lead_notes', 'inquiry_notes',
  'project_description', 'preferred_callback_time', 'preferred_consult_time', 'sub_service_type',
  'lead_owner', 'method_of_entry', 'ha_match_type',
];

router.post('/', (req, res) => {
  const {
    contact_id, company_id, title, value, stage, probability, expected_close, source, rep, work_type, customer_type,
    phone_estimate, repeat_referral, ha_lead_fee, owner_user_id,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const detail = LEAD_DETAIL_FIELDS.reduce((acc, f) => ({ ...acc, [f]: req.body[f] ?? (f === 'lead_status' ? 'New' : null) }), {});
  const result = db.prepare(`
    INSERT INTO deals (
      contact_id, company_id, title, value, stage, probability, expected_close, source, rep, work_type, customer_type,
      phone_estimate, repeat_referral, ha_lead_fee,
      lead_status, lead_type, job_timeframe, followup_date, lead_notes, inquiry_notes,
      project_description, preferred_callback_time, preferred_consult_time, sub_service_type,
      lead_owner, method_of_entry, ha_match_type, owner_user_id, created_by_user_id, updated_by_user_id
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?, ?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?)
  `).run(
    contact_id || null, company_id || null, title, value || 0, stage || 'new', probability ?? 20, expected_close || null, source || null,
    rep || null, work_type || null, customer_type || 'Residential',
    phone_estimate ? 1 : 0, repeat_referral ? 1 : 0, ha_lead_fee || null,
    detail.lead_status, detail.lead_type, detail.job_timeframe, detail.followup_date, detail.lead_notes, detail.inquiry_notes,
    detail.project_description, detail.preferred_callback_time, detail.preferred_consult_time, detail.sub_service_type,
    detail.lead_owner, detail.method_of_entry, detail.ha_match_type,
    owner_user_id || null, req.user.id, req.user.id
  );
  const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(result.lastInsertRowid);
  logActivity('deal', deal.id, 'note', `Deal "${deal.title}" created.`);
  const dealContact = deal.contact_id ? db.prepare(`SELECT first_name, last_name, email, phone, mobile_phone FROM contacts WHERE id = ?`).get(deal.contact_id) : null;
  fireTrigger('deal_created', {
    related_type: 'deal', related_id: deal.id,
    title: deal.title, value: deal.value, stage: deal.stage,
    deal_id: deal.id, contact_id: deal.contact_id || null,
    contact_name: dealContact ? `${dealContact.first_name} ${dealContact.last_name}` : null,
    contact_email: dealContact ? dealContact.email : null,
    contact_phone: dealContact ? (dealContact.mobile_phone || dealContact.phone) : null,
    source: deal.source || null,
  });
  res.status(201).json(deal);
});

router.get('/:id', (req, res) => {
  const deal = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'not found' });
  const activities = db.prepare(`SELECT a.*, u.username AS created_by_username FROM activities a LEFT JOIN users u ON u.id = a.created_by_user_id WHERE a.related_type = 'deal' AND a.related_id = ? ORDER BY a.created_at DESC`).all(req.params.id);
  const jobs = db.prepare(`SELECT id, title, status FROM jobs WHERE deal_id = ? ORDER BY created_at DESC`).all(req.params.id);
  // A project is only ever created automatically once a customer signs an estimate (see
  // routes/public.js's /estimates/:token/sign) — never at estimate creation. So while this deal
  // has no project yet, the UI needs to know whether an estimate is out there pending a signature,
  // rather than offering any way to skip straight to a project.
  const estimates = db.prepare(`SELECT id, number, status, signed_at, declined_at, created_at FROM estimates WHERE deal_id = ? ORDER BY created_at DESC`).all(req.params.id);
  // Whether this lead has an appointment on file at all — that's what the UI gates the
  // Lead -> Opportunity stage buttons on (see OPPORTUNITY_STAGES above).
  const appointments = db.prepare(`SELECT id, title, start_time, status FROM appointments WHERE deal_id = ? ORDER BY start_time DESC`).all(req.params.id);
  const full = withScore(withCustomerInfo(deal));
  res.json({ ...(canSeePrices(req.user) ? full : redactDealMoney(full)), activities, jobs, estimates, appointments });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (req.body.stage && !STAGES.includes(req.body.stage)) {
    return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  }
  if (req.body.stage && existing.stage === 'new' && OPPORTUNITY_STAGES.includes(req.body.stage)) {
    const hasAppointment = db.prepare(`SELECT 1 FROM appointments WHERE deal_id = ? LIMIT 1`).get(existing.id);
    if (!hasAppointment) {
      return res.status(400).json({ error: 'Schedule an appointment for this lead before it can become an opportunity.' });
    }
  }
  const pageLevel = (getPermissions(req.user).pipeline === 'edit' || getPermissions(req.user).leads === 'edit') ? 'edit' : 'view';
  const sectionError = checkSectionEdit(req.user, pageLevel, req.body);
  if (sectionError) return res.status(403).json({ error: sectionError });
  const updates = { ...existing, ...req.body };
  // Qualifying/disqualifying a lead (via the Leads page's Qualify/Disqualify buttons, which
  // only PATCH `stage`) implies a lead_status too, unless the caller set one explicitly.
  if (req.body.stage && req.body.stage !== existing.stage && req.body.lead_status === undefined) {
    if (req.body.stage === 'lost') updates.lead_status = 'Lost';
    else if (existing.stage === 'new') updates.lead_status = 'Converted';
  }
  db.prepare(`
    UPDATE deals SET
      contact_id=?, company_id=?, title=?, value=?, stage=?, probability=?, expected_close=?, source=?, rep=?, work_type=?, customer_type=?,
      phone_estimate=?, repeat_referral=?, ha_lead_fee=?,
      lead_status=?, lead_type=?, job_timeframe=?, followup_date=?, lead_notes=?, inquiry_notes=?,
      project_description=?, preferred_callback_time=?, preferred_consult_time=?, sub_service_type=?,
      lead_owner=?, method_of_entry=?, ha_match_type=?, owner_user_id=?, updated_by_user_id=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    updates.contact_id, updates.company_id, updates.title, updates.value, updates.stage, updates.probability, updates.expected_close, updates.source,
    updates.rep, updates.work_type, updates.customer_type,
    updates.phone_estimate ? 1 : 0, updates.repeat_referral ? 1 : 0, updates.ha_lead_fee || null,
    updates.lead_status, updates.lead_type, updates.job_timeframe, updates.followup_date, updates.lead_notes, updates.inquiry_notes,
    updates.project_description, updates.preferred_callback_time, updates.preferred_consult_time, updates.sub_service_type,
    updates.lead_owner, updates.method_of_entry, updates.ha_match_type, updates.owner_user_id || null, req.user.id,
    req.params.id
  );

  if (req.body.stage && req.body.stage !== existing.stage) {
    logActivity('deal', existing.id, 'stage_change', `Stage moved from "${existing.stage}" to "${req.body.stage}".`);
    const contact = updates.contact_id ? db.prepare(`SELECT first_name, last_name, email FROM contacts WHERE id = ?`).get(updates.contact_id) : null;
    const company = updates.company_id ? db.prepare(`SELECT name FROM companies WHERE id = ?`).get(updates.company_id) : null;
    fireTrigger('deal_stage_changed', {
      related_type: 'deal', related_id: existing.id,
      dedupe_id: `${existing.id}:${req.body.stage}`,
      title: updates.title, value: updates.value, from_stage: existing.stage, to_stage: req.body.stage,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contact_email: contact ? contact.email : null,
      company_name: company ? company.name : null,
      deal_id: existing.id,
    });
  }

  // Auto-enroll into a matching campaign when a lead's status changes to one of the nurture
  // statuses (Sept 2026 — the user's own ask, from the Leads page's Lead Status dropdown): setting
  // lead_status to "Follow Up", "Follow Up AI", "Unresponsive", or "Restart" enrolls this deal's
  // contact in the active campaign of that exact name, if one exists — same campaign_enrollments
  // row the Conversations thread's manual "Add to campaign" control creates (see
  // routes/campaigns.js's POST /:id/enroll), just triggered by the status change instead of a
  // person picking a campaign. No matching campaign, or already actively enrolled in it, is a
  // silent no-op — this never blocks or errors the status update. New/Lost/Converted don't
  // trigger it; those aren't nurture statuses.
  const FOLLOWUP_LEAD_STATUSES = ['Follow Up', 'Follow Up AI', 'Unresponsive', 'Restart'];
  if (
    req.body.lead_status && req.body.lead_status !== existing.lead_status &&
    FOLLOWUP_LEAD_STATUSES.includes(req.body.lead_status) && updates.contact_id
  ) {
    const campaign = db.prepare(`SELECT * FROM campaigns WHERE status = 'active' AND lower(name) = lower(?)`).get(req.body.lead_status);
    if (campaign) {
      const already = db.prepare(`SELECT 1 FROM campaign_enrollments WHERE campaign_id = ? AND contact_id = ? AND status = 'active'`).get(campaign.id, updates.contact_id);
      if (!already) {
        db.prepare(`INSERT INTO campaign_enrollments (campaign_id, contact_id, enrolled_by_user_id) VALUES (?, ?, ?)`).run(campaign.id, updates.contact_id, req.user.id);
        logActivity('contact', updates.contact_id, 'automation', `Added to campaign "${campaign.name}" automatically — lead status set to "${req.body.lead_status}".`);
      }
    }
  }

  res.json(db.prepare(`SELECT * FROM deals WHERE id = ?`).get(req.params.id));
});

router.post('/:id/activities', (req, res) => {
  const { note, type } = req.body;
  if (!note) return res.status(400).json({ error: 'note is required' });
  // Notes are append-only — there is deliberately no PATCH/DELETE route for activities anywhere
  // in the API, and created_by_user_id is stamped from the logged-in session so the timeline can
  // always show who wrote each note.
  logActivity('deal', req.params.id, type || 'note', note, req.user && req.user.id);
  const activities = db.prepare(`SELECT a.*, u.username AS created_by_username FROM activities a LEFT JOIN users u ON u.id = a.created_by_user_id WHERE a.related_type = 'deal' AND a.related_id = ? ORDER BY a.created_at DESC`).all(req.params.id);
  res.status(201).json(activities);
});

module.exports = router;
