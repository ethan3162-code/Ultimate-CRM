const db = require('./db');

const tables = ['appointments', 'automation_runs', 'automations', 'tickets', 'payments', 'invoice_items', 'invoices', 'estimate_items', 'estimates', 'jobs', 'deals', 'activities', 'contacts', 'companies', 'catalog_items'];
for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
for (const t of tables) db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(t);

function insertCompany(c) {
  return db.prepare(`INSERT INTO companies (name, industry, phone, email, address) VALUES (?,?,?,?,?)`)
    .run(c.name, c.industry, c.phone, c.email, c.address).lastInsertRowid;
}
function insertContact(c) {
  return db.prepare(`INSERT INTO contacts (company_id, first_name, last_name, email, phone, title) VALUES (?,?,?,?,?,?)`)
    .run(c.company_id, c.first_name, c.last_name, c.email, c.phone, c.title).lastInsertRowid;
}
function insertDeal(d) {
  return db.prepare(`INSERT INTO deals (contact_id, company_id, title, value, stage, probability, expected_close) VALUES (?,?,?,?,?,?,?)`)
    .run(d.contact_id, d.company_id, d.title, d.value, d.stage, d.probability, d.expected_close).lastInsertRowid;
}
function insertCatalogItem(c) {
  return db.prepare(`INSERT INTO catalog_items (description, unit, unit_price, material_key) VALUES (?,?,?,?)`)
    .run(c.description, c.unit, c.unit_price, c.material_key || null).lastInsertRowid;
}
function insertJob(j) {
  return db.prepare(`INSERT INTO jobs (contact_id, company_id, deal_id, title, status, address, scheduled_date) VALUES (?,?,?,?,?,?,?)`)
    .run(j.contact_id, j.company_id, j.deal_id || null, j.title, j.status, j.address, j.scheduled_date).lastInsertRowid;
}
function insertEstimate(e, items) {
  const id = db.prepare(`INSERT INTO estimates (job_id, number, status, tax_rate) VALUES (?,?,?,?)`)
    .run(e.job_id, e.number, e.status, e.tax_rate).lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO estimate_items (estimate_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(id, it.description, it.qty, it.unit_price);
  }
  return id;
}
function insertInvoice(inv, items, payments) {
  const id = db.prepare(`INSERT INTO invoices (job_id, estimate_id, number, status, tax_rate, due_date) VALUES (?,?,?,?,?,?)`)
    .run(inv.job_id, inv.estimate_id || null, inv.number, inv.status, inv.tax_rate, inv.due_date).lastInsertRowid;
  for (const it of items) {
    db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price) VALUES (?,?,?,?)`)
      .run(id, it.description, it.qty, it.unit_price);
  }
  for (const p of (payments || [])) {
    db.prepare(`INSERT INTO payments (invoice_id, amount, method, paid_at) VALUES (?,?,?,?)`)
      .run(id, p.amount, p.method, p.paid_at);
  }
  return id;
}
function insertAppointment(a) {
  return db.prepare(`
    INSERT INTO appointments (contact_id, company_id, job_id, deal_id, title, description, location, start_time, end_time, status)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    a.contact_id || null, a.company_id || null, a.job_id || null, a.deal_id || null,
    a.title, a.description || null, a.location || null, a.start_time, a.end_time, a.status || 'scheduled'
  ).lastInsertRowid;
}
function insertTicket(t) {
  const id = db.prepare(`
    INSERT INTO tickets (contact_id, company_id, job_id, subject, description, status, priority, sla_due_at, satisfaction_score, resolved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    t.contact_id || null, t.company_id || null, t.job_id || null, t.subject, t.description || null,
    t.status || 'open', t.priority || 'medium', t.sla_due_at, t.satisfaction_score || null, t.resolved_at || null
  ).lastInsertRowid;
  return id;
}
function hoursFromNow(h) {
  return db.prepare(`SELECT datetime('now', ?) AS d`).get(`${h >= 0 ? '+' : ''}${h} hours`).d;
}
function log(related_type, related_id, type, note, daysAgo = 0) {
  const created_at = daysAgo
    ? db.prepare(`SELECT datetime('now', ?) AS d`).get(`-${daysAgo} days`).d
    : undefined;
  if (created_at) {
    db.prepare(`INSERT INTO activities (related_type, related_id, type, note, created_at) VALUES (?,?,?,?,?)`)
      .run(related_type, related_id, type, note, created_at);
  } else {
    db.prepare(`INSERT INTO activities (related_type, related_id, type, note) VALUES (?,?,?,?)`)
      .run(related_type, related_id, type, note);
  }
}

// --- Companies ---
const acme = insertCompany({ name: 'Acme Roofing & Exteriors', industry: 'Home Services', phone: '(555) 210-4488', email: 'office@acmeroofing.com', address: '412 Cedar St, Madison, WI' });
const brightline = insertCompany({ name: 'Brightline Analytics', industry: 'B2B SaaS', phone: '(555) 934-1120', email: 'hello@brightline.io', address: '88 Market St, Austin, TX' });
const northwood = insertCompany({ name: 'Northwood Dental Group', industry: 'Healthcare', phone: '(555) 662-7710', email: 'admin@northwooddental.com', address: '19 Birch Ave, Portland, OR' });
const summit = insertCompany({ name: 'Summit Retail Partners', industry: 'Retail', phone: '(555) 447-2200', email: 'contact@summitretail.com', address: '600 Commerce Blvd, Denver, CO' });
const harbor = insertCompany({ name: 'Harbor Logistics Co.', industry: 'Logistics', phone: '(555) 331-9982', email: 'ops@harborlogistics.com', address: '77 Pier Rd, Seattle, WA' });
const graystone = insertCompany({ name: 'Graystone Property Management', industry: 'Real Estate', phone: '(555) 809-3345', email: 'info@graystonepm.com', address: '245 Elm Ct, Nashville, TN' });

// --- Contacts ---
const cJohn = insertContact({ company_id: acme, first_name: 'John', last_name: 'Meyer', email: 'john@acmeroofing.com', phone: '(555) 210-4489', title: 'Owner' });
const cPriya = insertContact({ company_id: brightline, first_name: 'Priya', last_name: 'Shah', email: 'priya@brightline.io', phone: '(555) 934-1121', title: 'VP Sales' });
const cDana = insertContact({ company_id: northwood, first_name: 'Dana', last_name: 'Ruiz', email: 'dana@northwooddental.com', phone: '(555) 662-7711', title: 'Office Manager' });
const cTom = insertContact({ company_id: summit, first_name: 'Tom', last_name: 'Whitfield', email: 'tom@summitretail.com', phone: '(555) 447-2201', title: 'Director of Ops' });
const cElena = insertContact({ company_id: harbor, first_name: 'Elena', last_name: 'Cho', email: 'elena@harborlogistics.com', phone: '(555) 331-9983', title: 'COO' });
const cMarcus = insertContact({ company_id: graystone, first_name: 'Marcus', last_name: 'Bell', email: 'marcus@graystonepm.com', phone: '(555) 809-3346', title: 'Property Manager' });
const cSara = insertContact({ company_id: acme, first_name: 'Sara', last_name: 'Meyer', email: 'sara@acmeroofing.com', phone: '(555) 210-4490', title: 'Office Admin' });
const cLeo = insertContact({ company_id: brightline, first_name: 'Leo', last_name: 'Nakamura', email: 'leo@brightline.io', phone: '(555) 934-1122', title: 'Head of RevOps' });

// --- Deals across pipeline stages ---
const d1 = insertDeal({ contact_id: cPriya, company_id: brightline, title: 'Brightline — Growth plan upgrade', value: 42000, stage: 'negotiation', probability: 70, expected_close: '2026-10-15' });
const d2 = insertDeal({ contact_id: cTom, company_id: summit, title: 'Summit Retail — POS rollout (12 stores)', value: 68000, stage: 'proposal', probability: 50, expected_close: '2026-11-01' });
const d3 = insertDeal({ contact_id: cElena, company_id: harbor, title: 'Harbor Logistics — Fleet tracking pilot', value: 25000, stage: 'qualified', probability: 30, expected_close: '2026-11-20' });
const d4 = insertDeal({ contact_id: cMarcus, company_id: graystone, title: 'Graystone — Portfolio-wide onboarding', value: 15500, stage: 'new', probability: 15, expected_close: '2026-12-05' });
const d5 = insertDeal({ contact_id: cLeo, company_id: brightline, title: 'Brightline — Add-on seats (Q4)', value: 9800, stage: 'won', probability: 100, expected_close: '2026-09-01' });
const d6 = insertDeal({ contact_id: cDana, company_id: northwood, title: 'Northwood Dental — Front desk suite', value: 6200, stage: 'lost', probability: 0, expected_close: '2026-08-20' });
const d7 = insertDeal({ contact_id: cTom, company_id: summit, title: 'Summit Retail — Loyalty module', value: 18000, stage: 'qualified', probability: 35, expected_close: '2026-12-15' });
const d8 = insertDeal({ contact_id: cElena, company_id: harbor, title: 'Harbor Logistics — Full fleet contract', value: 88000, stage: 'new', probability: 10, expected_close: '2027-01-10' });

// --- Field ops: jobs -> estimates -> invoices -> payments (Joist-style) ---
const j1 = insertJob({ contact_id: cJohn, company_id: acme, title: 'Roof replacement — 412 Cedar St', status: 'in_progress', address: '412 Cedar St, Madison, WI', scheduled_date: '2026-09-18' });
const e1 = insertEstimate({ job_id: j1, number: 'EST-1001', status: 'approved', tax_rate: 0.055 }, [
  { description: 'Tear-off existing shingles (28 sq)', qty: 28, unit_price: 65 },
  { description: 'Architectural shingles, installed', qty: 28, unit_price: 210 },
  { description: 'Ice & water shield, valleys + eaves', qty: 1, unit_price: 480 },
  { description: 'Dumpster + disposal', qty: 1, unit_price: 375 },
]);
insertInvoice({ job_id: j1, estimate_id: e1, number: 'INV-2001', status: 'partial', tax_rate: 0.055, due_date: '2026-09-25' },
  [
    { description: 'Tear-off existing shingles (28 sq)', qty: 28, unit_price: 65 },
    { description: 'Architectural shingles, installed', qty: 28, unit_price: 210 },
    { description: 'Ice & water shield, valleys + eaves', qty: 1, unit_price: 480 },
    { description: 'Dumpster + disposal', qty: 1, unit_price: 375 },
  ],
  [{ amount: 4000, method: 'ach', paid_at: '2026-09-10 14:22:00' }]
);

const j2 = insertJob({ contact_id: cSara, company_id: acme, title: 'Gutter repair — rear addition', status: 'completed', address: '412 Cedar St, Madison, WI', scheduled_date: '2026-09-05' });
const e2 = insertEstimate({ job_id: j2, number: 'EST-1002', status: 'approved', tax_rate: 0.055 }, [
  { description: 'Gutter section replacement (40 ft)', qty: 40, unit_price: 18 },
  { description: 'Downspout, 2-piece', qty: 2, unit_price: 95 },
]);
insertInvoice({ job_id: j2, estimate_id: e2, number: 'INV-2002', status: 'paid', tax_rate: 0.055, due_date: '2026-09-12' },
  [
    { description: 'Gutter section replacement (40 ft)', qty: 40, unit_price: 18 },
    { description: 'Downspout, 2-piece', qty: 2, unit_price: 95 },
  ],
  [{ amount: 926.35, method: 'card', paid_at: '2026-09-06 09:14:00' }]
);

const j3 = insertJob({ contact_id: cMarcus, company_id: graystone, title: 'Storm damage inspection — Unit 4B', status: 'scheduled', address: '245 Elm Ct, Nashville, TN', scheduled_date: '2026-09-22' });
insertEstimate({ job_id: j3, number: 'EST-1003', status: 'draft', tax_rate: 0.0475 }, [
  { description: 'Inspection + photo report', qty: 1, unit_price: 150 },
]);

const j4 = insertJob({ contact_id: cDana, company_id: northwood, title: 'Parking lot resealing', status: 'completed', address: '19 Birch Ave, Portland, OR', scheduled_date: '2026-08-28' });
const e4 = insertEstimate({ job_id: j4, number: 'EST-1004', status: 'approved', tax_rate: 0 }, [
  { description: 'Sealcoat application (3,200 sq ft)', qty: 3200, unit_price: 0.22 },
  { description: 'Line striping, 24 stalls', qty: 24, unit_price: 12 },
]);
insertInvoice({ job_id: j4, estimate_id: e4, number: 'INV-2003', status: 'overdue', tax_rate: 0, due_date: '2026-09-08' },
  [
    { description: 'Sealcoat application (3,200 sq ft)', qty: 3200, unit_price: 0.22 },
    { description: 'Line striping, 24 stalls', qty: 24, unit_price: 12 },
  ],
  []
);

const j5 = insertJob({ contact_id: cElena, company_id: harbor, title: 'Warehouse dock door repair', status: 'in_progress', address: '77 Pier Rd, Seattle, WA', scheduled_date: '2026-09-19' });
insertEstimate({ job_id: j5, number: 'EST-1005', status: 'sent', tax_rate: 0.065 }, [
  { description: 'Dock door panel replacement', qty: 1, unit_price: 1250 },
  { description: 'Motor + sensor service', qty: 1, unit_price: 340 },
]);

// --- Project schedule: each job moves through four finish-out stages (demo, site prep,
// installation, final walkthrough), each with its own day-length. The project's total
// length (and therefore its end date) is the sum of those days, and progress is the
// cumulative days through the current stage as a % of that total — not a free-form number.
const STAGE_KEYS = ['demo', 'site_prep', 'installation', 'final_walkthrough'];
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function setSchedule(jobId, start_date, stage, days) {
  const total = STAGE_KEYS.reduce((sum, k) => sum + (days[k] || 0), 0) || 1;
  const idx = stage ? STAGE_KEYS.indexOf(stage) : -1;
  const cumulative = idx < 0 ? 0 : STAGE_KEYS.slice(0, idx + 1).reduce((sum, k) => sum + (days[k] || 0), 0);
  const progress_percent = Math.round((cumulative / total) * 100);
  const end_date = addDays(start_date, total);
  db.prepare(`
    UPDATE jobs SET start_date = ?, end_date = ?, stage = ?, progress_percent = ?,
      demo_days = ?, site_prep_days = ?, installation_days = ?, final_walkthrough_days = ?
    WHERE id = ?
  `).run(start_date, end_date, stage || null, progress_percent, days.demo, days.site_prep, days.installation, days.final_walkthrough, jobId);
}
setSchedule(j1, '2026-09-10', 'installation', { demo: 1, site_prep: 2, installation: 10, final_walkthrough: 1 });
setSchedule(j2, '2026-09-01', 'final_walkthrough', { demo: 1, site_prep: 1, installation: 3, final_walkthrough: 1 });
setSchedule(j3, '2026-09-22', 'demo', { demo: 1, site_prep: 1, installation: 1, final_walkthrough: 1 });
setSchedule(j4, '2026-08-28', 'final_walkthrough', { demo: 1, site_prep: 2, installation: 4, final_walkthrough: 1 });
setSchedule(j5, '2026-09-15', 'site_prep', { demo: 1, site_prep: 2, installation: 5, final_walkthrough: 1 });

// --- Appointments (local + would sync to Google Calendar once connected) ---
insertAppointment({
  contact_id: cJohn, company_id: acme, job_id: j1,
  title: 'Site walkthrough — roof tear-off progress',
  description: 'Walk the site with John to confirm tear-off progress before shingles go on.',
  location: '412 Cedar St, Madison, WI',
  start_time: '2026-09-17T15:00:00.000Z', end_time: '2026-09-17T16:00:00.000Z',
});
insertAppointment({
  contact_id: cMarcus, company_id: graystone, job_id: j3,
  title: 'Storm damage inspection — Unit 4B',
  description: 'Initial inspection and photo report for the insurance claim.',
  location: '245 Elm Ct, Nashville, TN',
  start_time: '2026-09-22T18:00:00.000Z', end_time: '2026-09-22T19:00:00.000Z',
});
insertAppointment({
  contact_id: cElena, company_id: harbor, job_id: j5,
  title: 'Dock door follow-up service call',
  description: 'Customer reported grinding noise after the motor/sensor service.',
  location: '77 Pier Rd, Seattle, WA',
  start_time: '2026-09-18T20:30:00.000Z', end_time: '2026-09-18T21:30:00.000Z',
});

// --- Service tickets (support issues, tied into the same contact/job graph) ---
const t1 = insertTicket({
  contact_id: cJohn, company_id: acme, job_id: j1,
  subject: 'Leak near chimney flashing after last night\'s rain',
  description: 'Customer noticed a small drip in the attic near the chimney the morning after the tear-off started.',
  status: 'open', priority: 'urgent', sla_due_at: hoursFromNow(-6), // already breached, to demo the automation firing
});
const t2 = insertTicket({
  contact_id: cDana, company_id: northwood, job_id: j4,
  subject: 'Question about striping paint durability',
  description: 'Asking whether the striping paint used is rated for heavy freeze-thaw cycles.',
  status: 'pending', priority: 'low', sla_due_at: hoursFromNow(150),
});
const t3 = insertTicket({
  contact_id: cElena, company_id: harbor, job_id: j5,
  subject: 'Dock door making noise after motor service',
  description: 'Grinding noise reported the day after the motor/sensor service was completed.',
  status: 'open', priority: 'high', sla_due_at: hoursFromNow(10),
});
const t4 = insertTicket({
  contact_id: cSara, company_id: acme, job_id: j2,
  subject: 'Downspout extension request',
  description: 'Wants an additional downspout extension added near the new gutter run.',
  status: 'resolved', priority: 'medium', sla_due_at: hoursFromNow(-48),
  satisfaction_score: 5, resolved_at: '2026-09-11 16:00:00',
});

log('ticket', t1, 'note', 'Ticket opened — crew notified to check flashing seal today.', 0);
log('ticket', t3, 'note', 'Scheduled a tech to inspect the motor tomorrow morning.', 1);
log('ticket', t4, 'note', 'Added downspout extension at no charge; customer confirmed it looks good.', 3);
log('ticket', t4, 'automation', 'Customer rated this resolution 5/5.', 3);

// --- Activity timeline (spans deals, jobs, contacts — the unified graph) ---
log('deal', d1, 'note', 'Priya confirmed budget approved for Q4, wants contract by Oct 1.', 2);
log('deal', d1, 'email', 'Sent revised proposal with add-on seat pricing.', 5);
log('deal', d2, 'call', '30-min call with Tom — walked through rollout timeline for all 12 stores.', 3);
log('deal', d2, 'note', 'Waiting on legal review from Summit before signature.', 1);
log('deal', d3, 'email', 'Introduced fleet tracking pilot scope to Elena.', 6);
log('job', j1, 'note', 'Crew started tear-off this morning, weather holding.', 5);
log('job', j1, 'payment', 'Deposit of $4,000 received via ACH.', 5);
log('job', j2, 'payment', 'Invoice INV-2002 paid in full.', 9);
log('job', j4, 'note', 'Invoice INV-2003 is 7 days overdue — reminder sent.', 1);
log('contact', cJohn, 'call', 'John asked about adding gutter guards to next job.', 4);
log('company', acme, 'note', 'Long-time customer since 2024 — always pays on time historically.', 20);

// --- Automations (the "when -> then" engine, seeded with realistic starter rules) ---
function insertAutomation(a) {
  return db.prepare(`
    INSERT INTO automations (name, trigger_type, trigger_config, action_type, action_config, enabled)
    VALUES (?,?,?,?,?,1)
  `).run(a.name, a.trigger_type, JSON.stringify(a.trigger_config || {}), a.action_type, JSON.stringify(a.action_config || {})).lastInsertRowid;
}

insertAutomation({
  name: 'Follow up when a proposal goes out',
  trigger_type: 'deal_stage_changed',
  trigger_config: { to_stage: 'proposal' },
  action_type: 'send_email',
  action_config: { subject: 'Following up on your proposal', body: 'Hi {{contact_name}}, wanted to make sure the proposal for {{title}} came through okay — happy to walk through it.' },
});
insertAutomation({
  name: 'Nudge overdue invoices',
  trigger_type: 'invoice_overdue',
  trigger_config: { days_overdue: 3 },
  action_type: 'send_email',
  action_config: { subject: 'Invoice {{number}} is overdue', body: 'Hi {{contact_name}}, a friendly reminder that invoice {{number}} ({{balance}} balance) is past due — let us know if you have questions.' },
});
insertAutomation({
  name: 'Thank customers after payment',
  trigger_type: 'invoice_paid',
  trigger_config: {},
  action_type: 'log_activity',
  action_config: { message: 'Invoice {{number}} paid in full — thank-you note queued for {{contact_name}}.' },
});
insertAutomation({
  name: 'Schedule a maintenance check-in after job completion',
  trigger_type: 'job_completed',
  trigger_config: {},
  action_type: 'create_followup_job',
  action_config: { title: '30-day maintenance check-in', days_offset: 30 },
});
insertAutomation({
  name: 'Remind reps to send contract after negotiation starts',
  trigger_type: 'deal_stage_changed',
  trigger_config: { to_stage: 'negotiation' },
  action_type: 'log_activity',
  action_config: { message: 'Reminder: send the updated contract for {{title}} within 24 hours.' },
});
insertAutomation({
  name: 'Escalate SLA-breached tickets',
  trigger_type: 'ticket_overdue',
  trigger_config: {},
  action_type: 'log_activity',
  action_config: { message: 'SLA breached on "{{subject}}" ({{priority}} priority) — needs immediate attention.' },
});
insertAutomation({
  name: 'Flag low satisfaction scores for follow-up',
  trigger_type: 'ticket_resolved',
  trigger_config: { max_satisfaction: 3 },
  action_type: 'log_activity',
  action_config: { message: 'Ticket "{{subject}}" resolved with a low satisfaction score ({{satisfaction_score}}/5) — worth a personal follow-up.' },
});

// --- Preset items (price book) ---
// material_key ties a preset to a material-calculator row so its price can
// auto-fill there; presets with no material_key are general-purpose (labor,
// disposal, etc.) for building estimates by hand.
insertCatalogItem({ description: 'Asphalt paving, installed', unit: 'ton', unit_price: 130, material_key: 'asphalt' });
insertCatalogItem({ description: 'Concrete, installed', unit: 'yd³', unit_price: 155, material_key: 'concrete' });
insertCatalogItem({ description: 'Pavers', unit: 'pallet', unit_price: 420, material_key: 'pavers' });
insertCatalogItem({ description: 'Border / edging paver', unit: 'unit', unit_price: 3.25, material_key: 'border' });
insertCatalogItem({ description: 'Bedding sand', unit: 'yd³', unit_price: 45, material_key: 'sand' });
insertCatalogItem({ description: 'Portland cement', unit: 'bag', unit_price: 14, material_key: 'cement' });
insertCatalogItem({ description: 'RCA base', unit: 'yd³', unit_price: 38, material_key: 'rcaBase' });
insertCatalogItem({ description: 'Labor — install crew (per day)', unit: 'day', unit_price: 850, material_key: null });
insertCatalogItem({ description: 'Dumpster + disposal', unit: 'each', unit_price: 375, material_key: null });
insertCatalogItem({ description: 'Mobilization / equipment setup', unit: 'each', unit_price: 250, material_key: null });

console.log('Seed complete:');
console.log(` companies: ${db.prepare('SELECT COUNT(*) c FROM companies').get().c}`);
console.log(` contacts: ${db.prepare('SELECT COUNT(*) c FROM contacts').get().c}`);
console.log(` deals: ${db.prepare('SELECT COUNT(*) c FROM deals').get().c}`);
console.log(` jobs: ${db.prepare('SELECT COUNT(*) c FROM jobs').get().c}`);
console.log(` estimates: ${db.prepare('SELECT COUNT(*) c FROM estimates').get().c}`);
console.log(` invoices: ${db.prepare('SELECT COUNT(*) c FROM invoices').get().c}`);
console.log(` payments: ${db.prepare('SELECT COUNT(*) c FROM payments').get().c}`);
console.log(` activities: ${db.prepare('SELECT COUNT(*) c FROM activities').get().c}`);
console.log(` automations: ${db.prepare('SELECT COUNT(*) c FROM automations').get().c}`);
console.log(` tickets: ${db.prepare('SELECT COUNT(*) c FROM tickets').get().c}`);
console.log(` appointments: ${db.prepare('SELECT COUNT(*) c FROM appointments').get().c}`);
console.log(` catalog_items: ${db.prepare('SELECT COUNT(*) c FROM catalog_items').get().c}`);
