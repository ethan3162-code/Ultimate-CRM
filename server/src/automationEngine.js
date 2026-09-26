const db = require('./db');
const { logActivity } = require('./helpers');
const mailer = require('./mailer');
const sms = require('./sms');

// --- template rendering: replaces {{field}} with values from context ---
function render(template, ctx) {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = ctx[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function getAutomations(triggerType) {
  return db.prepare(`SELECT * FROM automations WHERE trigger_type = ? AND enabled = 1`).all(triggerType);
}

function alreadyRan(automationId, relatedType, relatedId) {
  return !!db.prepare(`
    SELECT 1 FROM automation_runs WHERE automation_id = ? AND related_type = ? AND related_id = ? LIMIT 1
  `).get(automationId, relatedType, relatedId);
}

function recordRun(automationId, relatedType, relatedId, note) {
  db.prepare(`INSERT INTO automation_runs (automation_id, related_type, related_id, note) VALUES (?,?,?,?)`)
    .run(automationId, relatedType, relatedId, note);
}

// The Campaigns gate (Sept 2026, Hatch-style) — send_sms/send_email below check this before ever
// reaching a real customer. Automations themselves can ship "enabled" from day one (as the four
// seeded auto-texts do), but nothing customer-facing actually goes out until the business has
// created at least one active Campaign — see db.js's campaigns table and the Campaigns page.
function hasActiveCampaign() {
  return !!db.prepare(`SELECT 1 FROM campaigns WHERE status = 'active' LIMIT 1`).get();
}

// --- action executors ---
// ctx always includes: related_type, related_id (the record the activity timeline should attach to)
function runAction(automation, ctx) {
  const config = parseJSON(automation.action_config, {});
  const relatedType = ctx.related_type;
  const relatedId = ctx.related_id;
  let note;

  switch (automation.action_type) {
    case 'log_activity': {
      note = render(config.message || '{{title}}', ctx);
      logActivity(relatedType, relatedId, 'automation', note);
      break;
    }
    case 'send_email': {
      const subject = render(config.subject || '', ctx);
      const body = render(config.body || '', ctx);
      // Campaigns gate (Sept 2026) — no auto-email reaches a customer until the business has
      // created its first active Campaign. Still logged, so it's clear on the record *why*
      // nothing went out rather than looking like the automation silently failed.
      if (!hasActiveCampaign()) {
        note = `Auto-email "${subject}" NOT sent${ctx.contact_name ? ` to ${ctx.contact_name}` : ''} — create a campaign to start sending automated messages.`;
        logActivity(relatedType, relatedId, 'email', note);
        break;
      }
      note = `Auto-email "${subject}" sent${ctx.contact_name ? ` to ${ctx.contact_name}` : ''}: ${body}`;
      logActivity(relatedType, relatedId, 'email', note);
      // Best-effort real delivery via Gmail (see mailer.js) — never blocks the automation,
      // and quietly does nothing until GMAIL_USER/GMAIL_APP_PASSWORD are configured.
      mailer.sendEmail({ to: ctx.contact_email, subject, text: body }).then((result) => {
        if (!result.sent && mailer.isConfigured()) {
          logActivity(relatedType, relatedId, 'email', `Email delivery failed: ${result.reason}`);
        }
      }).catch(() => {});
      break;
    }
    case 'send_sms': {
      const body = render(config.message || '', ctx);
      // Campaigns gate (Sept 2026) — same as send_email above: no auto-text reaches a customer,
      // real or simulated, until at least one active Campaign exists.
      if (!hasActiveCampaign()) {
        note = `Auto-SMS NOT sent${ctx.contact_name ? ` to ${ctx.contact_name}` : ''} — create a campaign to start sending automated messages.`;
        logActivity(relatedType, relatedId, 'sms', note);
        break;
      }
      // Best-effort real delivery via Twilio (see sms.js) — a row always lands in the customer's
      // conversation thread (Messages > Conversations) so the auto-text shows up the same place a
      // rep's own texts do, whether or not Twilio is actually configured yet. Needs a contact_id
      // in ctx to know whose thread it belongs to; falls back to just the activity-log note
      // (as before) for a trigger that doesn't carry one.
      if (ctx.contact_id) {
        sms.sendSms({ to: ctx.contact_phone, body }).then((result) => {
          db.prepare(`
            INSERT INTO customer_messages (contact_id, deal_id, job_id, direction, channel, body, status, automation_name)
            VALUES (?,?,?,'outbound','sms',?,?,?)
          `).run(ctx.contact_id, ctx.deal_id || null, ctx.job_id || null, body, result.sent ? 'sent' : (sms.isConfigured() ? 'failed' : 'simulated'), automation.name);
        }).catch(() => {});
      }
      note = `Auto-SMS sent${ctx.contact_name ? ` to ${ctx.contact_name}` : ''}: ${body}`;
      logActivity(relatedType, relatedId, 'sms', note);
      break;
    }
    case 'create_followup_job': {
      const title = render(config.title || 'Follow-up', ctx);
      const days = Number(config.days_offset || 30);
      const schedDate = db.prepare(`SELECT date('now', ?) AS d`).get(`+${days} days`).d;
      const result = db.prepare(`
        INSERT INTO jobs (contact_id, company_id, title, status, address, scheduled_date)
        VALUES (?,?,?,?,?,?)
      `).run(ctx.job_contact_id || null, ctx.job_company_id || null, title, 'scheduled', ctx.address || null, schedDate);
      note = `Created follow-up job "${title}" scheduled ${schedDate}.`;
      logActivity('job', result.lastInsertRowid, 'automation', `Auto-created by automation "${automation.name}".`);
      logActivity(relatedType, relatedId, 'automation', note);
      break;
    }
    case 'change_deal_stage': {
      if (ctx.deal_id) {
        db.prepare(`UPDATE deals SET stage = ?, updated_at = datetime('now') WHERE id = ?`).run(config.to_stage, ctx.deal_id);
        note = `Deal stage automatically changed to "${config.to_stage}".`;
        logActivity('deal', ctx.deal_id, 'automation', note);
      }
      break;
    }
    default:
      note = `Unknown action type "${automation.action_type}"`;
  }
  return note;
}

function matchesTrigger(automation, triggerType, ctx) {
  const config = parseJSON(automation.trigger_config, {});
  switch (triggerType) {
    case 'deal_stage_changed':
      return !config.to_stage || config.to_stage === ctx.to_stage;
    case 'deal_created':
      return !config.stage || config.stage === ctx.stage;
    case 'invoice_overdue':
      return (ctx.days_overdue || 0) >= Number(config.days_overdue ?? 1);
    case 'ticket_overdue':
      return true; // dedupe handles "only once"; SLA breach itself is the condition
    case 'ticket_created':
      return !config.priority || config.priority === ctx.priority;
    case 'ticket_resolved':
      return config.max_satisfaction === undefined || (ctx.satisfaction_score != null && ctx.satisfaction_score <= Number(config.max_satisfaction));
    case 'invoice_paid':
    case 'job_completed':
    case 'estimate_signed':
      return true;
    case 'estimate_stale':
      return (ctx.days_since_sent || 0) >= Number(config.days_since_sent ?? 3);
    case 'deal_stale':
      return (ctx.days_idle || 0) >= Number(config.days_idle ?? 14);
    default:
      return false;
  }
}

/**
 * Fire all enabled automations matching triggerType against ctx.
 * ctx must include related_type/related_id (what the resulting log attaches to),
 * plus whatever fields the action templates/config reference.
 * dedupeKey (optional): when set, an automation only fires once per (automation, dedupeKey) pair —
 * used for invoice_overdue so reminders don't repeat every check cycle.
 */
function fireTrigger(triggerType, ctx) {
  const automations = getAutomations(triggerType);
  const fired = [];
  for (const automation of automations) {
    if (!matchesTrigger(automation, triggerType, ctx)) continue;
    const dedupeId = ctx.dedupe_id ?? ctx.related_id;
    if (dedupeId !== undefined && alreadyRan(automation.id, ctx.related_type, dedupeId)) continue;
    const note = runAction(automation, ctx);
    recordRun(automation.id, ctx.related_type, dedupeId, note || `Ran "${automation.name}"`);
    fired.push({ automation: automation.name, note });
  }
  return fired;
}

module.exports = { fireTrigger, render };
