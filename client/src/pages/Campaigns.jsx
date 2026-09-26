import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { dateTime } from '../utils';

// Hatch-style Campaigns (Sept 2026) — deliberately thin: a campaign here is just a name, a
// status, and an explicit "we've set this up" record. The actual auto-text/auto-email wording
// still lives on the Automations page (send_sms/send_email actions) — a campaign's only job is
// to be the switch that unlocks them. See automationEngine.js's hasActiveCampaign(): as long as
// zero campaigns exist here with status "active", every send_sms/send_email automation logs a
// "not sent — create a campaign" note instead of actually reaching a customer.
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    api.campaigns().then(setCampaigns);
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createCampaign({ name, notes: notes || null });
    setName(''); setNotes(''); setShowForm(false);
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
            <div className="field"><label>Campaign name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New lead outreach" required /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Notes (optional)</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What this campaign covers, for your own reference." />
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
                {c.notes && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{c.notes}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Created {dateTime(c.created_at)}{c.created_by_username ? ` by ${c.created_by_username}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
