import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { dateTime } from '../utils';

export default function Integrations() {
  const [webhook, setWebhook] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState('');
  const [email, setEmail] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [sms, setSms] = useState(null);
  const [testSmsTo, setTestSmsTo] = useState('');
  const [smsTestStatus, setSmsTestStatus] = useState(null);
  const [sendingSms, setSendingSms] = useState(false);
  const [answerForce, setAnswerForce] = useState(null);
  const [checkingNow, setCheckingNow] = useState(false);
  const [backfillSince, setBackfillSince] = useState('2026-01-01');
  const [backfillMsg, setBackfillMsg] = useState(null);

  function load() {
    api.webhookInfo().then(setWebhook);
    api.emailStatus().then(setEmail);
    api.smsStatus().then(setSms);
    api.answerForceStatus().then(setAnswerForce);
  }
  useEffect(load, []);

  // While a check (manual "Check now" or a backfill) is running server-side, poll for progress
  // every few seconds so the recent-activity list and the last-poll summary fill in live, rather
  // than only updating on the next full page load.
  useEffect(() => {
    if (!answerForce?.running) return;
    const t = setInterval(() => { api.answerForceStatus().then(setAnswerForce); }, 3000);
    return () => clearInterval(t);
  }, [answerForce?.running]);

  async function checkAnswerForceNow() {
    setCheckingNow(true);
    try {
      await api.pollAnswerForceNow();
    } finally {
      api.answerForceStatus().then(setAnswerForce);
      setCheckingNow(false);
    }
  }

  async function startBackfill(e) {
    e.preventDefault();
    if (!backfillSince) return;
    setBackfillMsg(null);
    try {
      await api.backfillAnswerForce(backfillSince);
      setBackfillMsg({ ok: true, text: `Started — pulling in every AnswerForce email since ${backfillSince}. This can take a little while for a wide date range; the activity list below will fill in as it goes.` });
    } catch (err) {
      setBackfillMsg({ ok: false, text: err.message });
    }
    api.answerForceStatus().then(setAnswerForce);
  }

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

  async function sendSmsTest(e) {
    e.preventDefault();
    if (!testSmsTo.trim()) return;
    setSendingSms(true);
    setSmsTestStatus(null);
    try {
      await api.sendTestSms(testSmsTo.trim());
      setSmsTestStatus({ ok: true, message: `Test text sent to ${testSmsTo.trim()}.` });
    } catch (err) {
      setSmsTestStatus({ ok: false, message: err.message });
    }
    setSendingSms(false);
  }

  const samplePayload = `{
  "name": "Jordan Reyes",
  "email": "jordan@example.com",
  "phone": "555-0134",
  "message": "Interested in a driveway estimate",
  "source": "Website contact form"
}`;

  const salesforcePayload = `{
  "external_id": "{!$Record.Id}",
  "external_source": "salesforce",
  "first_name": "{!$Record.FirstName}",
  "last_name": "{!$Record.LastName}",
  "email": "{!$Record.Email}",
  "phone": "{!$Record.Phone}",
  "mobile_phone": "{!$Record.MobilePhone}",
  "title": "{!$Record.Title}",
  "address": "{!$Record.Street}, {!$Record.City}, {!$Record.State}",
  "company": "{!$Record.Company}",
  "source": "Salesforce",
  "lead_owner": "{!$Record.Owner.Name}",
  "message": "{!$Record.Description}"
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

      <div className="card section-card accent-blue" style={{ marginBottom: 18 }}>
        <h2 className="section-label">Salesforce → new leads &amp; contacts</h2>
        <p className="sub" style={{ margin: '-4px 0 14px' }}>
          Uses the same webhook above — no Salesforce API credentials needed on our side. In Salesforce, build a
          record-triggered Flow that fires whenever a Lead (or Contact) is created, with an "HTTP Callout" action
          that posts to the webhook URL above. Sending the record's <code>Id</code> as <code>external_id</code> means
          if the Flow also fires on edits, it updates the same record here instead of creating a duplicate every time.
        </p>
        {webhook && (
          <ol style={{ margin: '0 0 14px', paddingLeft: 20, fontSize: 13.5 }}>
            <li style={{ marginBottom: 6 }}>Setup → Flows → New Flow → <strong>Record-Triggered Flow</strong>, object <strong>Lead</strong> (make a second one for <strong>Contact</strong> the same way), trigger on "A record is created or updated."</li>
            <li style={{ marginBottom: 6 }}>Add an <strong>Action</strong> element → <strong>HTTP Callout</strong> (or an External Service pointed at this URL) → method <strong>POST</strong>, URL <code>{webhook.url}</code>, header <code>X-Webhook-Key</code> set to the webhook key below, body type JSON.</li>
            <li>Map the JSON body to the Lead/Contact's merge fields — see the example below.</li>
          </ol>
        )}
        <div className="kicker" style={{ marginBottom: 6 }}>Example Flow HTTP Callout body (Lead)</div>
        <pre className="code-block">{salesforcePayload}</pre>
        <p className="sub" style={{ margin: '8px 0 0' }}>
          Every field here is optional except enough to identify the person (name, email, or phone) — send whatever
          Salesforce fields you've mapped. <code>external_id</code>/<code>external_source</code> are what prevent
          duplicates on re-sync; everything else lands on the matching Contact/Lead fields already in this app
          (owner, method of entry, etc. show up on the Contact/Opportunity detail pages).
        </p>
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

      <div className="card" style={{ marginTop: 18 }}>
        <h2>AnswerForce calls → leads</h2>
        <p className="sub" style={{ margin: '-4px 0 14px' }}>
          Every call AnswerForce answers on your behalf emails a notification to this same inbox — no forwarding needed, and nothing to set up on AnswerForce's side. This checks that inbox every minute for those emails and turns each one into a Contact and a new lead automatically, using the Gmail connection above.
        </p>

        {!answerForce ? <div className="loading">Loading…</div> : !answerForce.configured ? (
          <div className="card" style={{ background: 'var(--paper-raised)', marginBottom: 14 }}>
            <div className="kicker" style={{ marginBottom: 6 }}>Waiting on Gmail</div>
            <p className="sub" style={{ margin: 0 }}>Connect Gmail above first (GMAIL_USER / GMAIL_APP_PASSWORD) — this uses that same inbox, so there's nothing separate to configure here.</p>
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span className="pill green">Watching {answerForce.fromEmail}</span>
              <button type="button" className="btn sm" onClick={checkAnswerForceNow} disabled={checkingNow || answerForce.running}>{checkingNow ? 'Checking…' : 'Check now'}</button>
              {answerForce.running && <span className="muted" style={{ fontSize: 13 }}>Working…</span>}
            </div>
            {answerForce.lastPoll && (
              <p className="sub" style={{ margin: '0 0 14px' }}>
                {answerForce.lastPoll.ok
                  ? `Last checked ${new Date(answerForce.lastPoll.ran_at).toLocaleString()} — scanned ${answerForce.lastPoll.scanned}, ${answerForce.lastPoll.created} new lead${answerForce.lastPoll.created === 1 ? '' : 's'} created, ${answerForce.lastPoll.skipped} already seen${answerForce.lastPoll.failed ? `, ${answerForce.lastPoll.failed} couldn't be parsed` : ''}.`
                  : `Last check failed: ${answerForce.lastPoll.reason}`}
              </p>
            )}

            <div className="card" style={{ background: 'var(--paper-raised)', marginBottom: 14 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Backfill older calls</div>
              <p className="sub" style={{ margin: '0 0 10px' }}>
                The regular check above only looks back 14 days. To pull in everything further back — e.g. every AnswerForce call since the start of the year — set a date and run it once here.
              </p>
              <form onSubmit={startBackfill} className="row" style={{ gap: 8 }}>
                <input type="date" value={backfillSince} onChange={(e) => setBackfillSince(e.target.value)} />
                <button className="btn sm" type="submit" disabled={answerForce.running || !backfillSince}>{answerForce.running ? 'Running…' : 'Backfill from this date'}</button>
              </form>
              {backfillMsg && (
                <p className="sub" style={{ color: backfillMsg.ok ? 'var(--accent)' : 'var(--red)', marginTop: 8 }}>{backfillMsg.text}</p>
              )}
            </div>

            {answerForce.recent.length === 0 ? (
              <div className="empty">No AnswerForce emails processed yet.</div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {answerForce.recent.map((r) => (
                  <div key={r.id} className="row between" style={{ fontSize: 13, borderBottom: '1px solid var(--line-soft)', paddingBottom: 6 }}>
                    <span>
                      {r.deal_id ? <Link to={`/pipeline/${r.deal_id}`}>{r.subject || 'AnswerForce email'}</Link> : (r.subject || 'AnswerForce email')}
                      {r.template === 'forwarded' || r.template === 'unknown' ? <span className="pill amber" style={{ marginLeft: 6 }}>needs review</span> : null}
                    </span>
                    <span className="muted">{r.status === 'failed' ? (r.note || 'failed') : dateTime(r.processed_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Customer texting (Twilio)</h2>
        <p className="sub" style={{ margin: '-4px 0 14px' }}>
          Powers the Conversations inbox and the auto-text automations (instant lead reply, estimate follow-up, review requests, stale-lead re-engagement) with real two-way SMS. Until this is connected, those texts still get logged in each customer's thread — they just aren't actually delivered.
        </p>

        {!sms ? <div className="loading">Loading…</div> : sms.configured ? (
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <span className="pill green">Connected · {sms.fromNumber}</span>
          </div>
        ) : (
          <div className="card" style={{ background: 'var(--paper-raised)', marginBottom: 14 }}>
            <div className="kicker" style={{ marginBottom: 6 }}>Not connected yet</div>
            <p className="sub" style={{ margin: '0 0 6px' }}>
              Create a Twilio account (twilio.com) and buy a phone number — this is the one piece we can't do for you, since it needs your own billing. Then, in Render, open this service's Environment settings and add:
            </p>
            <pre className="code-block">{`TWILIO_ACCOUNT_SID=your account SID (starts with AC…)\nTWILIO_AUTH_TOKEN=your auth token\nTWILIO_FROM_NUMBER=+15551234567 (the number you bought)`}</pre>
            <p className="sub" style={{ margin: '8px 0 0' }}>
              Both live under Account → API keys & tokens in the Twilio console. Redeploy after saving the variables.
            </p>
          </div>
        )}

        <form onSubmit={sendSmsTest} className="row" style={{ gap: 8 }}>
          <input
            type="tel" placeholder="Send a test text to…" value={testSmsTo}
            onChange={(e) => setTestSmsTo(e.target.value)} style={{ flex: 1, maxWidth: 320 }}
          />
          <button className="btn sm" type="submit" disabled={sendingSms || !testSmsTo.trim()}>{sendingSms ? 'Sending…' : 'Send test'}</button>
        </form>
        {smsTestStatus && (
          <p className="sub" style={{ color: smsTestStatus.ok ? 'var(--accent)' : 'var(--red)', marginTop: 8 }}>
            {smsTestStatus.message}
          </p>
        )}
      </div>
    </>
  );
}
