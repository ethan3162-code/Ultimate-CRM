import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { dateTime } from '../utils';

const POLL_MS = 4000;

function avatarLetters(username) {
  return (username || '?').slice(0, 2).toUpperCase();
}

export default function Messages() {
  const { user: me } = useAuth();
  const [channels, setChannels] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const threadRef = useRef(null);

  function loadChannels() {
    return api.chatChannels().then((rows) => { setChannels(rows); return rows; });
  }
  function loadMessages(id) {
    return api.chatMessages(id).then((rows) => {
      setMessages(rows);
      // Marking read server-side already zeroed this on the next channel-list refresh, but do it
      // optimistically too so the badge doesn't flash stale for a few seconds.
      setChannels((prev) => prev && prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
    });
  }

  useEffect(() => {
    loadChannels().then((rows) => {
      if (rows && rows.length && activeId === null) setActiveId(rows[0].id);
    });
    api.usersDirectory().then(setDirectory).catch(() => setDirectory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId != null) loadMessages(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Simple poll-based "live" updates — no websocket layer in this app, matches the rest of the
  // CRM (Calendar's Google sync, Home's approvals card, etc.), just on a short interval since
  // chat wants to feel current.
  useEffect(() => {
    const t = setInterval(() => {
      loadChannels();
      if (activeId != null) loadMessages(activeId);
    }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, activeId]);

  const active = useMemo(() => channels && channels.find((c) => c.id === activeId), [channels, activeId]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setSending(true);
    setDraft('');
    try {
      await api.sendChatMessage(activeId, body);
      await loadMessages(activeId);
      loadChannels();
    } finally {
      setSending(false);
    }
  }

  function toggleUser(id) {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function startChat(e) {
    e.preventDefault();
    if (selectedUserIds.length === 0) return;
    setCreating(true);
    try {
      const channel = await api.createChatChannel({
        member_user_ids: selectedUserIds,
        is_dm: selectedUserIds.length === 1,
        name: selectedUserIds.length > 1 ? newChannelName.trim() : undefined,
      });
      setShowNew(false);
      setSelectedUserIds([]);
      setNewChannelName('');
      await loadChannels();
      setActiveId(channel.id);
    } finally {
      setCreating(false);
    }
  }

  async function leaveChannel(channel) {
    if (channel.is_dm) return;
    if (!confirm(`Leave "${channel.name}"? You'll stop seeing new messages here unless someone adds you back.`)) return;
    await api.leaveChatChannel(channel.id);
    setActiveId(null);
    loadChannels();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="sub">Chat with anyone else on the team — direct messages or a shared channel — without leaving the CRM.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowNew(true)}>+ New message</button>
      </div>

      {!channels ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="chat-shell">
          <div className="chat-sidebar">
            {channels.length === 0 ? (
              <div className="empty" style={{ padding: '24px 12px' }}>No conversations yet — start one with "+ New message".</div>
            ) : channels.map((c) => (
              <button
                key={c.id}
                type="button"
                className={'chat-channel-row' + (c.id === activeId ? ' active' : '')}
                onClick={() => setActiveId(c.id)}
              >
                <span className="chat-avatar">{avatarLetters(c.name)}</span>
                <span className="chat-channel-info">
                  <span className="chat-channel-name">{c.name}{!c.is_dm && <span className="pill" style={{ marginLeft: 6 }}>group</span>}</span>
                  <span className="chat-channel-preview">{c.last_message || 'No messages yet'}</span>
                </span>
                {c.unread_count > 0 && <span className="chat-unread-badge">{c.unread_count}</span>}
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
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>
                      {active.members.map((m) => m.username).join(', ')}
                    </div>
                  </div>
                  {!active.is_dm && <button type="button" className="btn subtle sm" onClick={() => leaveChannel(active)}>Leave</button>}
                </div>

                <div className="chat-thread" ref={threadRef}>
                  {!messages ? (
                    <div className="loading">Loading…</div>
                  ) : messages.length === 0 ? (
                    <div className="empty">Say hello — no messages here yet.</div>
                  ) : messages.map((m) => {
                    const mine = me && m.user_id === me.id;
                    return (
                      <div key={m.id} className={'chat-bubble-row' + (mine ? ' mine' : '')}>
                        {!mine && <span className="chat-avatar sm">{avatarLetters(m.username)}</span>}
                        <div className={'chat-bubble' + (mine ? ' mine' : '')}>
                          {!mine && <div className="chat-bubble-sender">{m.username}</div>}
                          <div className="chat-bubble-body">{m.body}</div>
                          <div className="chat-bubble-time">{dateTime(m.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={send} className="chat-composer">
                  <input
                    placeholder={`Message ${active.name}…`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={sending}
                  />
                  <button className="btn primary sm" type="submit" disabled={sending || !draft.trim()}>Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {showNew && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !creating && setShowNew(false)}>
          <div className="modal-card">
            <h3>New message</h3>
            <p className="sub">Pick one person for a direct message, or several to start a group channel.</p>
            <form onSubmit={startChat} className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label>To</label>
                <div className="stack" style={{ gap: 4, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                  {directory.filter((u) => !me || u.id !== me.id).map((u) => (
                    <label key={u.id} className="row" style={{ gap: 8, fontSize: 13.5 }}>
                      <input type="checkbox" checked={selectedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                      {u.username}
                    </label>
                  ))}
                </div>
              </div>
              {selectedUserIds.length > 1 && (
                <div className="field">
                  <label>Channel name <span className="muted" style={{ fontWeight: 400 }}>— optional</span></label>
                  <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. Crew scheduling" />
                </div>
              )}
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn subtle" onClick={() => setShowNew(false)} disabled={creating}>Cancel</button>
                <button type="submit" className="btn primary" disabled={creating || selectedUserIds.length === 0}>
                  {creating ? 'Starting…' : selectedUserIds.length > 1 ? 'Create channel' : 'Start chat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
