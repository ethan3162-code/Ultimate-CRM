/**
 * Template-based "smart draft" generator.
 *
 * This is deliberately NOT a live LLM call: the deployed app has no API key
 * to call one with, and hardcoding one isn't safe. Instead this composes
 * drafts from the same structured data a real model would be given as
 * context, with a little phrase variation so repeated drafts don't read
 * identically. Swap `pick()` calls for a real completion API later by
 * replacing the body of each draft function below — the call sites
 * (routes/ai.js) don't need to change.
 */

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function seedFrom(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const OPENERS = ['Hi {{name}},', 'Hello {{name}},', '{{name}}, hi —'];
const CLOSERS = ['Let me know if you have any questions.', 'Happy to hop on a call if that is easier.', 'Just reply here whenever works for you.'];
const SIGNOFFS = ['Best,', 'Thanks,', 'Talk soon,'];

function render(tpl, ctx) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => (ctx[k] ?? '').toString());
}

function draftDealFollowUp(ctx) {
  const seed = seedFrom(String(ctx.deal_id || ctx.title || 'x'));
  const name = ctx.contact_name || 'there';
  const opener = render(pick(OPENERS, seed), { name });
  const idleLine = ctx.idle_days
    ? `It's been about ${ctx.idle_days} days since we last touched base on ${ctx.title}, so I wanted to check in.`
    : `Wanted to follow up on ${ctx.title}.`;
  const stageLine = {
    new: `I'd love to learn a bit more about what you're looking to solve.`,
    qualified: `Happy to put together a proposal whenever you're ready.`,
    proposal: `Wanted to make sure the proposal came through okay and see if you had any questions.`,
    negotiation: `Let me know if there's anything on the terms we should revisit.`,
  }[ctx.stage] || `Wanted to see where things stand on your end.`;
  const body = `${opener}\n\n${idleLine} ${stageLine}\n\n${pick(CLOSERS, seed + 1)}\n\n${pick(SIGNOFFS, seed + 2)}`;
  return { subject: `Following up: ${ctx.title}`, body, generated_by: 'template' };
}

function draftDealRecap(ctx) {
  const name = ctx.contact_name || 'there';
  const seed = seedFrom(String(ctx.deal_id || ctx.title || 'x'));
  const recent = (ctx.activities || []).slice(0, 5);
  const bullets = recent.length
    ? recent.map((a) => `- ${a.note}`).join('\n')
    : '- No activity logged yet.';
  const body = `${render(pick(OPENERS, seed), { name })}\n\nQuick recap on ${ctx.title} (currently in "${ctx.stage}", ${ctx.value ? `valued at $${Number(ctx.value).toLocaleString()}` : 'value not set'}):\n\n${bullets}\n\n${pick(CLOSERS, seed + 1)}\n\n${pick(SIGNOFFS, seed + 2)}`;
  return { subject: `Recap: ${ctx.title}`, body, generated_by: 'template' };
}

function draftTicketReply(ctx) {
  const name = ctx.contact_name || 'there';
  const seed = seedFrom(String(ctx.ticket_id || ctx.subject || 'x'));
  const priorityLine = {
    urgent: `I've flagged this as urgent on our end and I'm on it right away.`,
    high: `I've prioritized this and I'm looking into it now.`,
    medium: `Thanks for flagging this — I'm looking into it.`,
    low: `Thanks for the note — I'll get this sorted.`,
  }[ctx.priority] || `Thanks for reaching out.`;
  const body = `${render(pick(OPENERS, seed), { name })}\n\n${priorityLine} Regarding "${ctx.subject}"${ctx.description ? `: ${ctx.description}` : ''} — I'll update you as soon as I know more.\n\n${pick(CLOSERS, seed + 1)}\n\n${pick(SIGNOFFS, seed + 2)}`;
  return { subject: `Re: ${ctx.subject}`, body, generated_by: 'template' };
}

function draftInvoiceReminder(ctx) {
  const name = ctx.contact_name || 'there';
  const seed = seedFrom(String(ctx.invoice_id || ctx.number || 'x'));
  const body = `${render(pick(OPENERS, seed), { name })}\n\nA friendly reminder that invoice ${ctx.number} (balance ${ctx.balance}) was due ${ctx.due_date}. Let me know if you'd like to arrange payment or have any questions about the charges.\n\n${pick(CLOSERS, seed + 1)}\n\n${pick(SIGNOFFS, seed + 2)}`;
  return { subject: `Reminder: invoice ${ctx.number}`, body, generated_by: 'template' };
}

module.exports = { draftDealFollowUp, draftDealRecap, draftTicketReply, draftInvoiceReminder };
