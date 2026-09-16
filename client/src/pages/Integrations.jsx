import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Integrations() {
  const [webhook, setWebhook] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState('');
  const [email, setEmail] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState(null);
  const [sending, setSending] = useState(false);

  function load() {
    api.webhookInfo().then(setWebhook);
    api.emailStatus().then(setEmail);
  }
  useEffect(load, []);

  async function regenerate() {
    if (!confirm('Regenerate the webhook key? Any form or Zapier/Make automation already pointed at the old URL will stop working until you update it.')) return;
    const next = await api.regenerateWebhook();
    setWebhook(next);
  }

  function copy(text, label) {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  async function sendTest(e) {
    e.preventDefault();
    if (!testTo.trim()) return;
    setSending(true);
    setTestStatus(null);
    try {
      await api.sendTestEmail(testTo.trim());
      setTestStatus({ ok: true, message: `Test email sent to ${testTo.trim()}.` });
    } catch (err) {
      setTestStatus({ ok: false, message: err.message });
    }
    setSending(false);
  }

  const samplePayload = `{
  "name": "Jordan Reyes",
  "email": "jordan@example.com",
  "phone": "555-0134",
  "message": "Interested in a driveway estimate",
  "source": "Website contact form"
}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Integrations</h1>
          <p className="sub">Bring leads in from other tools, and let automations send real email reminders instead of just logging them.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Lead capture webhook</h2>
        <p className="sub" style={{ margin: '-4px 0 14px' }}>
          Point a website contact form, or a Zapier/Make automation connecting Facebook Lead Ads, Google Forms, HomeAdvisor, Angi, or anything else, at this URL. Every submission creates a Contact and a new deal in your pipeline automatically — no duplicate contacts if the same person submits twice.
        </p>

        {!webhook ? <div className="loading">Loading…</div> : (
          <>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Webhook URL</label>
              <div className="row" style={{ gap: 8 }}>
                <input readOnly value={webhook.url} style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn sm" onClick={() => copy(webhook.url, 'url')}>{copied === 'url' ? 'Copied!' : 'Copy'}</button>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Webhook key <span className="muted" style={{ fontWeight: 400 }}>— send as <code>?key=</code> or an <code>X-Webhook-Key</code> header</span></label>
              <div className="row" style={{ gap: 8 }}>
                <input readOnly type={showKey ? 'text' : 'password'} value={webhook.key} style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn sm" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
                <button type="button" className="btn sm" onClick={() => copy(webhook.key, 'key')}>{copied === 'key' ? 'Copied!' : 'Copy'}</button>
              </div>
            </div>
            <button type="button" className="btn subtle sm" onClick={regenerate}>Regenerate key</button>

            <div style={{ marginTop: 16 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Example request body (JSON)</div>
              <pre className="code-block">{samplePayload}</pre>
              <p className="sub" style={{ margin: '8px 0 0' }}>
                Only <code>name</code> (or <code>first_name</code>/<code>last_name</code>), <code>email</code>, or <code>phone</code> is required — send whatever the source gives you. <code>source</code> shows up on the contact and deal so you can tell where a lead came from; <code>company</code> and <code>value</code> are optional too.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Email reminders (Gmail)</h2>
        <p className="sub" style={{ margin: '-4px 0 14px' }}>
          Automations with a "Send an email" action log a note either way — connect Gmail here so they also actually deliver, for things like overdue-invoice reminders and follow-ups.
        </p>

        {!email ? <div className="loading">Loading…</div> : email.configured ? (
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <span className="pill green">Connected · {email.fromEmail}</span>
          </div>
        ) : (
          <div className="card" style={{ background: 'var(--paper-raised)', marginBottom: 14 }}>
            <div className="kicker" style={{ marginBottom: 6 }}>Not connected yet</div>
            <p className="sub" style={{ margin: '0 0 6px' }}>
              In Render, open this service's Environment settings and add:
            </p>
            <pre className="code-block">{`GMAIL_USER=you@gmail.com\nGMAIL_APP_PASSWORD=your 16-character app password\nGMAIL_FROM_NAME=Your Business Name (optional)`}</pre>
            <p className="sub" style={{ margin: '8px 0 0' }}>
              An app password isn't your normal Gmail password — generate one at myaccount.google.com under Security → 2-Step Verification → App passwords (2-Step Verification has to be turned on first). Redeploy after saving the variables.
            </p>
          </div>
        )}

        <form onSubmit={sendTest} className="row" style={{ gap: 8 }}>
          <input
            type="email" placeholder="Send a test email to…" value={testTo}
            onChange={(e) => setTestTo(e.target.value)} style={{ flex: 1, maxWidth: 320 }}
          />
          <button className="btn sm" type="submit" disabled={sending || !testTo.trim()}>{sending ? 'Sending…' : 'Send test'}</button>
        </form>
        {testStatus && (
          <p className={testStatus.ok ? 'sub' : 'sub'} style={{ color: testStatus.ok ? 'var(--accent)' : 'var(--red)', marginTop: 8 }}>
            {testStatus.message}
          </p>
        )}
      </div>
    </>
  );
}
