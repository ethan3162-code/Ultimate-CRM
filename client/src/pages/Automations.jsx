import { useEffect, useState } from 'react';
import { api } from '../api';
import { timeAgo } from '../utils';

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const TRIGGERS = [
  { key: 'deal_created', label: 'Deal is created', fields: [
    { key: 'stage', label: 'Only when starting stage is…', type: 'select', options: ['', ...STAGES], optional: true },
  ] },
  { key: 'deal_stage_changed', label: 'Deal moves to a stage', fields: [
    { key: 'to_stage', label: 'Target stage', type: 'select', options: STAGES },
  ] },
  { key: 'invoice_overdue', label: 'Invoice becomes overdue', fields: [
    { key: 'days_overdue', label: 'Minimum days overdue', type: 'number', default: 3 },
  ] },
  { key: 'invoice_paid', label: 'Invoice is paid in full', fields: [] },
  { key: 'job_completed', label: 'Job is marked completed', fields: [] },
];

const ACTIONS = [
  { key: 'log_activity', label: 'Log a note on the record', fields: [
    { key: 'message', label: 'Note text', type: 'textarea', placeholder: 'e.g. Follow up on {{title}} within 48 hours' },
  ] },
  { key: 'send_email', label: 'Send an email (simulated)', fields: [
    { key: 'subject', label: 'Subject', placeholder: 'e.g. Following up on your proposal' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Hi {{contact_name}}, …' },
  ] },
  { key: 'send_sms', label: 'Send an SMS (simulated)', fields: [
    { key: 'message', label: 'Message', type: 'textarea', placeholder: 'e.g. Reminder: invoice {{number}} is overdue.' },
  ] },
  { key: 'create_followup_job', label: 'Create a follow-up job', fields: [
    { key: 'title', label: 'Job title', placeholder: 'e.g. 30-day maintenance check-in' },
    { key: 'days_offset', label: 'Days from now', type: 'number', default: 30 },
  ] },
  { key: 'change_deal_stage', label: 'Move the deal to a stage', fields: [
    { key: 'to_stage', label: 'New stage', type: 'select', options: STAGES },
  ] },
];

function triggerSummary(a) {
  const t = TRIGGERS.find((x) => x.key === a.trigger_type);
  if (!t) return a.trigger_type;
  if (a.trigger_type === 'deal_stage_changed') return `Deal moves to "${a.trigger_config.to_stage}"`;
  if (a.trigger_type === 'invoice_overdue') return `Invoice overdue ${a.trigger_config.days_overdue || 1}+ days`;
  if (a.trigger_type === 'deal_created' && a.trigger_config.stage) return `Deal created in "${a.trigger_config.stage}"`;
  return t.label;
}
function actionSummary(a) {
  const act = ACTIONS.find((x) => x.key === a.action_type);
  if (!act) return a.action_type;
  if (a.action_type === 'change_deal_stage') return `Move deal to "${a.action_config.to_stage}"`;
  if (a.action_type === 'create_followup_job') return `Create job "${a.action_config.title || 'Follow-up'}" in ${a.action_config.days_offset || 30}d`;
  return act.label;
}

function ConfigFields({ fields, values, onChange }) {
  return (
    <div className="form-grid" style={{ marginTop: 8 }}>
      {fields.map((f) => (
        <div className="field" key={f.key} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
          <label>{f.label}{f.optional ? ' (optional)' : ''}</label>
          {f.type === 'select' ? (
            <select value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
              {f.options.map((o) => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : '— any —'}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea rows={2} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(f.key, e.target.value)} />
          ) : (
            <input
              type={f.type || 'text'}
              value={values[f.key] ?? f.default ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Automations() {
  const [automations, setAutomations] = useState(null);
  const [runs, setRuns] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState(TRIGGERS[0].key);
  const [actionType, setActionType] = useState(ACTIONS[0].key);
  const [triggerConfig, setTriggerConfig] = useState({});
  const [actionConfig, setActionConfig] = useState({});

  function load() {
    api.automations().then(setAutomations);
    api.automationRuns().then(setRuns);
  }
  useEffect(load, []);

  const trigger = TRIGGERS.find((t) => t.key === triggerType);
  const action = ACTIONS.find((a) => a.key === actionType);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createAutomation({ name, trigger_type: triggerType, trigger_config: triggerConfig, action_type: actionType, action_config: actionConfig });
    setName(''); setTriggerConfig({}); setActionConfig({}); setShowForm(false);
    load();
  }

  async function toggle(a) {
    await api.updateAutomation(a.id, { enabled: !a.enabled });
    load();
  }

  async function remove(a) {
    await api.deleteAutomation(a.id);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Automations</h1>
          <p className="sub">One "when → then" engine drives lead follow-up, payment reminders, and job hand-offs — the same builder powers every module.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New automation</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Automation name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nudge overdue invoices" required />
            </div>

            <div className="form-grid">
              <div className="field">
                <label>When…</label>
                <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value); setTriggerConfig({}); }}>
                  {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Then…</label>
                <select value={actionType} onChange={(e) => { setActionType(e.target.value); setActionConfig({}); }}>
                  {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </div>
            </div>

            {trigger.fields.length > 0 && (
              <>
                <div className="eyebrow" style={{ marginTop: 14 }}>Trigger condition</div>
                <ConfigFields fields={trigger.fields} values={triggerConfig} onChange={(k, v) => setTriggerConfig({ ...triggerConfig, [k]: v })} />
              </>
            )}
            {action.fields.length > 0 && (
              <>
                <div className="eyebrow" style={{ marginTop: 14 }}>Action details</div>
                <ConfigFields fields={action.fields} values={actionConfig} onChange={(k, v) => setActionConfig({ ...actionConfig, [k]: v })} />
              </>
            )}

            <button className="btn primary sm" type="submit" style={{ marginTop: 14 }}>Save automation</button>
          </form>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>Active rules {automations ? `(${automations.length})` : ''}</h2>
          {!automations ? <div className="loading">Loading…</div> : automations.length === 0 ? (
            <div className="empty">No automations yet — create one above.</div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {automations.map((a) => (
                <div key={a.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px', opacity: a.enabled ? 1 : 0.55 }}>
                  <div className="row between">
                    <span className="link-strong">{a.name}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => toggle(a)}>{a.enabled ? 'Disable' : 'Enable'}</button>
                      <button className="btn subtle sm" onClick={() => remove(a)}>Delete</button>
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    <span className="pill green" style={{ marginRight: 6 }}>when</span>{triggerSummary(a)}
                    <span style={{ margin: '0 8px' }}>→</span>
                    <span className="pill amber" style={{ marginRight: 6 }}>then</span>{actionSummary(a)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Automation log</h2>
          {runs.length === 0 ? <div className="empty">No automations have fired yet.</div> : (
            <div className="timeline">
              {runs.map((r) => (
                <div className="timeline-item" key={r.id}>
                  <div className="when">{timeAgo(r.ran_at)}</div>
                  <div className="body"><span className="type-tag">{r.automation_name}</span>{r.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
