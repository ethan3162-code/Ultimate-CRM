import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { dateTime } from '../utils';

// Hatch-style Campaigns (Sept 2026; extended later that month to actually send). A campaign is
// still the explicit "we've set this up" switch that unlocks the trigger-based auto-text/
// auto-email automations on the Automations page (see automationEngine.js's hasActiveCampaign())
// — but it now ALSO owns its own message and can drip-send it on a times-per-day / for-N-days
// schedule to whichever contacts a rep enrolls in it. Enrollment itself happens from a
// Conversations thread ("Add to campaign"), never automatically by segment — this page is where
// you author the message/schedule and see who's currently in each campaign.
const CHANNEL_LABEL = { sms: 'SMS', email: 'Email', both: 'SMS + Email' };
const STATUS_LABEL = { active: 'Sending', completed: 'Completed', stopped: 'Stopped' };

const BLANK_FORM = { name: '', notes: '', message: '', channel: 'sms', times_per_day: 1, duration_days: 7 };

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [enrollments, setEnrollments] = useState(null);

  function load() {
    api.campaigns().then(setCampaigns);
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createCampaign({
      name: form.name,
      notes: form.notes || null,
      message: form.message || null,
      channel: form.channel,
      times_per_day: Number(form.times_per_day) || 1,
      duration_days: Number(form.duration_days) || 1,
    });
    setForm(BLANK_FORM);
    setShowForm(false);
    load();
  }

  async function toggle(c) {
    setBusyId(c.id);
    await api.updateCampaign(c.id, { status: c.status === 'active' ? 'paused' : 'active' });
    setBusyId(null);
    load();
  }

  async function remove(c) {
    setBusyId(c.id);
    await api.deleteCampaign(c.id);
    setBusyId(null);
    if (expandedId === c.id) setExpandedId(null);
    load();
  }

  async function toggleEnrollments(c) {
    if (expandedId === c.id) { setExpandedId(null); setEnrollments(null); return; }
    setExpandedId(c.id);
    setEnrollments(null);
    api.campaignEnrollments(c.id).then(setEnrollments);
  }

  async function removeEnrollment(enrollmentId, campaignId) {
    await api.removeCampaignEnrollment(enrollmentId);
    api.campaignEnrollments(campaignId).then(setEnrollments);
    load();
  }

  const activeCount = campaigns ? campaigns.filter((c) => c.status === 'active').length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p className="sub">
            The switch that unlocks automated texting and email — no auto-message from the{' '}
            <Link to="/automations">Automations</Link> page reaches a real customer until at least one campaign here is active.
            A campaign can also send its own message on a schedule to contacts you add to it from a{' '}
            <Link to="/conversations">Conversations</Link> thread.
          </p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>+ New campaign</button>
      </div>

      {campaigns && activeCount === 0 && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '3px solid var(--amber)' }}>
          <h2>Auto-messaging is paused</h2>
          <p className="sub" style={{ margin: '-4px 0 0' }}>
            You have no active campaign yet, so the seeded auto-text automations (instant reply to a new lead, estimate follow-up,
            review request, stale-lead re-engage) are staying quiet — each one logs "not sent" instead of texting or emailing anyone.
            Create a campaign below to start sending.
          </p>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form onSubmit={submit} className="form-grid">
            <div className="field"><label>Campaign name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Restart a cold conversation" required /></div>
            <div className="field">
              <label>Channel</label>
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="both">Both — SMS and email</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Message <span className="muted" style={{ fontWeight: 400 }}>— use {'{{first_name}}'} to personalize</span></label>
              <textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Hi {{first_name}}, just following up on your project — happy to answer any questions!" />
            </div>
            <div className="field">
              <label>Times per day</label>
              <input type="number" min="1" value={form.times_per_day} onChange={(e) => setForm({ ...form, times_per_day: e.target.value })} />
            </div>
            <div className="field">
              <label>For how many days</label>
              <input type="number" min="1" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What this campaign covers, for your own reference." />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create campaign</button></div>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Campaigns {campaigns ? `(${campaigns.length})` : ''}</h2>
        {!campaigns ? <div className="loading">Loading…</div> : campaigns.length === 0 ? (
          <div className="empty">No campaigns yet — create one above to turn on automated texting and email.</div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {campaigns.map((c) => (
              <div key={c.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px', opacity: c.status === 'active' ? 1 : 0.6 }}>
                <div className="row between">
                  <span className="row" style={{ gap: 8 }}>
                    <span className="link-strong">{c.name}</span>
                    <span className={'pill' + (c.status === 'active' ? ' green' : '')}>{c.status}</span>
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" disabled={busyId === c.id} onClick={() => toggle(c)}>{c.status === 'active' ? 'Pause' : 'Activate'}</button>
                    <button className="btn subtle sm" disabled={busyId === c.id} onClick={() => remove(c)}>Delete</button>
                  </div>
                </div>
                {c.message && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>&ldquo;{c.message}&rdquo;</div>
                )}
                <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12 }}>{CHANNEL_LABEL[c.channel] || c.channel}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{c.times_per_day}×/day for {c.duration_days} day{c.duration_days === 1 ? '' : 's'}</span>
                  <button type="button" className="link-strong" style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => toggleEnrollments(c)}>
                    {c.active_enrollment_count} currently enrolled {expandedId === c.id ? '▴' : '▾'}
                  </button>
                </div>
                {c.notes && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{c.notes}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Created {dateTime(c.created_at)}{c.created_by_username ? ` by ${c.created_by_username}` : ''}
                </div>

                {expandedId === c.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                    {!enrollments ? <div className="loading">Loading…</div> : enrollments.length === 0 ? (
                      <div className="empty" style={{ padding: '8px 0' }}>Nobody's been added to this campaign yet — do that from a contact's Conversations thread.</div>
                    ) : (
                      <div className="stack" style={{ gap: 6 }}>
                        {enrollments.map((e) => (
                          <div key={e.id} className="row between" style={{ fontSize: 13 }}>
                            <span className="row" style={{ gap: 6 }}>
                              <Link to={`/conversations/${e.contact_id}`} className="link-strong">{e.contact_name}</Link>
                              <span className="muted">{STATUS_LABEL[e.status] || e.status}{e.stopped_reason ? ` — ${e.stopped_reason}` : ''} · {e.sends_count} sent</span>
                            </span>
                            {e.status === 'active' && (
                              <button type="button" className="btn subtle sm" onClick={() => removeEnrollment(e.id, c.id)}>Remove</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
