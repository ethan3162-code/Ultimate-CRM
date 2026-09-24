import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { dateTime } from '../utils';

const POLL_MS = 5000;

function avatarLetters(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

export default function Conversations() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('outbound'); // 'outbound' = we're texting them; 'inbound' = logging their reply
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pickable, setPickable] = useState([]);
  const threadRef = useRef(null);

  const activeId = contactId ? Number(contactId) : null;

  function loadConversations() {
    return api.customerConversations().then((rows) => { setConversations(rows); return rows; });
  }
  function loadThread(id) {
    return api.customerThread(id).then(setThread);
  }

  useEffect(() => {
    loadConversations().then((rows) => {
      if (rows && rows.length && activeId === null) navigate(`/conversations/${rows[0].contact_id}`, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId != null) { setThread(null); loadThread(activeId); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const t = setInterval(() => {
      loadConversations();
      if (activeId != null) loadThread(activeId);
    }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [thread]);

  // The sidebar's own summary list only includes contacts who already have at least one message,
  // so a conversation just started from the "+ New conversation" picker won't be in it yet —
  // fall back to the thread's own `contact` (returned even for an empty thread) so the header and
  // composer still render for a brand-new conversation.
  const active = useMemo(() => {
    const fromList = conversations && conversations.find((c) => c.contact_id === activeId);
    if (fromList) return fromList;
    if (thread && thread.contact && thread.contact.id === activeId) {
      return { contact_id: thread.contact.id, name: thread.contact.name, phone: thread.contact.phone };
    }
    return null;
  }, [conversations, activeId, thread]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setSending(true);
    setDraft('');
    try {
      if (mode === 'inbound') await api.logInboundCustomerMessage(activeId, body);
      else await api.sendCustomerMessage(activeId, body);
      await loadThread(activeId);
      loadConversations();
    } finally {
      setSending(false);
    }
  }

  async function openNew() {
    const rows = await api.customerMessageableContacts();
    setPickable(rows);
    setShowNew(true);
  }

  function startWith(contact) {
    setShowNew(false);
    navigate(`/conversations/${contact.id}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Conversations</h1>
          <p className="sub">One texting inbox with every customer — send a real text, or log what they said back, without leaving the CRM.</p>
        </div>
        <button className="btn primary sm" onClick={openNew}>+ New conversation</button>
      </div>

      {!conversations ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="chat-shell">
          <div className="chat-sidebar">
            {conversations.length === 0 ? (
              <div className="empty" style={{ padding: '24px 12px' }}>No conversations yet — start one with "+ New conversation".</div>
            ) : conversations.map((c) => (
              <button
                key={c.contact_id}
                type="button"
                className={'chat-channel-row' + (c.contact_id === activeId ? ' active' : '')}
                onClick={() => navigate(`/conversations/${c.contact_id}`)}
              >
                <span className="chat-avatar">{avatarLetters(c.name)}</span>
                <span className="chat-channel-info">
                  <span className="chat-channel-name">{c.name}</span>
                  <span className="chat-channel-preview">{c.last_message || 'No messages yet'}</span>
                </span>
                {c.needs_reply && <span className="chat-unread-badge" title="Waiting on a reply">•</span>}
              </button>
            ))}
          </div>

          <div className="chat-thread-panel">
            {!active ? (
              <div className="empty" style={{ margin: 'auto' }}>Pick a conversation, or start a new one.</div>
            ) : (
              <>
                <div className="chat-thread-head">
                  <div>
                    <div style={{ fontWeight: 600 }}>{active.name}</div>
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>{active.phone || 'No phone number on file'}</div>
                  </div>
                </div>

                <div className="chat-thread" ref={threadRef}>
                  {!thread ? (
                    <div className="loading">Loading…</div>
                  ) : thread.messages.length === 0 ? (
                    <div className="empty">No messages here yet — send a text below, or log what the customer said.</div>
                  ) : thread.messages.map((m) => {
                    const mine = m.direction === 'outbound';
                    return (
                      <div key={m.id} className={'chat-bubble-row' + (mine ? ' mine' : '')}>
                        {!mine && <span className="chat-avatar sm">{avatarLetters(active.name)}</span>}
                        <div className={'chat-bubble' + (mine ? ' mine' : '')}>
                          {!mine && <div className="chat-bubble-sender">{active.name}</div>}
                          {mine && m.automation_name && <div className="chat-bubble-sender">Auto-sent · {m.automation_name}</div>}
                          {mine && !m.automation_name && m.created_by_username && <div className="chat-bubble-sender">{m.created_by_username}</div>}
                          <div className="chat-bubble-body">{m.body}</div>
                          <div className="chat-bubble-time">
                            {dateTime(m.created_at)}
                            {mine && m.status === 'simulated' && ' · not delivered (Twilio not connected)'}
                            {mine && m.status === 'failed' && ' · delivery failed'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={send} className="chat-composer">
                  <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ maxWidth: 180 }}>
                    <option value="outbound">Text them</option>
                    <option value="inbound">Log their reply</option>
                  </select>
                  <input
                    placeholder={mode === 'inbound' ? 'What did the customer say?' : `Text ${active.name}…`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={sending}
                  />
                  <button className="btn primary sm" type="submit" disabled={sending || !draft.trim()}>{mode === 'inbound' ? 'Log' : 'Send'}</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {showNew && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal-card">
            <h3>New conversation</h3>
            <p className="sub">Only contacts with a phone number on file can start a text thread.</p>
            {pickable.length === 0 ? (
              <div className="empty">No contacts have a phone number yet — add one from the Contacts page first.</div>
            ) : (
              <div className="stack" style={{ gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                {pickable.map((c) => (
                  <button key={c.id} type="button" className="chat-channel-row" onClick={() => startWith(c)}>
                    <span className="chat-avatar">{avatarLetters(c.name)}</span>
                    <span className="chat-channel-info">
                      <span className="chat-channel-name">{c.name}</span>
                      <span className="chat-channel-preview">{c.phone}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn subtle" onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
