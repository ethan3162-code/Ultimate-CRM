// Built-in internal team chat (Sept 2026) — the user asked for something Slack-like so logins
// can message each other without leaving the CRM. Two kinds of chat_channels row: a named group
// channel (is_dm = 0) anyone can create and add teammates to, or a direct message (is_dm = 1)
// between a fixed set of members, deduped so starting a DM with the same person twice reopens
// the same thread instead of forking a new one. Mounted with just requireAuth (see index.js) —
// like routes/tasks.js and routes/directory.js, this isn't gated by the page-permission system;
// every active login can use it regardless of what business pages they can see.
const express = require('express');
const db = require('../db');

const router = express.Router();

function memberRows(channelId, excludeUserId) {
  const sql = `
    SELECT u.id, u.username FROM chat_channel_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.channel_id = ?${excludeUserId ? ' AND u.id != ?' : ''}
    ORDER BY u.username
  `;
  return excludeUserId ? db.prepare(sql).all(channelId, excludeUserId) : db.prepare(sql).all(channelId);
}

/** A channel with no explicit name (every DM, or a group someone didn't name) displays as the
    list of everyone else in it — "Jordan, Priya" — same idea as a real messaging app. */
function displayName(channel, meId) {
  if (channel.name) return channel.name;
  const others = memberRows(channel.id, meId);
  return others.length ? others.map((u) => u.username).join(', ') : 'Just you';
}

function summarize(channel, meId) {
  const last = db.prepare(`SELECT body, created_at FROM chat_messages WHERE channel_id = ? ORDER BY id DESC LIMIT 1`).get(channel.id);
  const me = db.prepare(`SELECT last_read_at FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`).get(channel.id, meId);
  const sinceFloor = (me && me.last_read_at) || '0000-00-00T00:00:00Z';
  const unread = db.prepare(`SELECT COUNT(*) c FROM chat_messages WHERE channel_id = ? AND user_id != ? AND created_at > ?`)
    .get(channel.id, meId, sinceFloor).c;
  const members = memberRows(channel.id, null);
  return {
    id: channel.id,
    name: displayName(channel, meId),
    is_dm: !!channel.is_dm,
    members: members.map((u) => ({ id: u.id, username: u.username })),
    last_message: last ? last.body : null,
    last_message_at: last ? last.created_at : channel.created_at,
    unread_count: unread,
  };
}

router.get('/channels', (req, res) => {
  const rows = db.prepare(`
    SELECT c.* FROM chat_channels c
    JOIN chat_channel_members cm ON cm.channel_id = c.id
    WHERE cm.user_id = ?
  `).all(req.user.id);
  const summarized = rows.map((c) => summarize(c, req.user.id));
  summarized.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  res.json(summarized);
});

router.post('/channels', (req, res) => {
  const { name, member_user_ids, is_dm } = req.body;
  const others = Array.from(new Set((member_user_ids || []).map(Number).filter((n) => n && n !== req.user.id)));
  if (others.length === 0) return res.status(400).json({ error: 'pick at least one other person to start a chat with' });

  if (is_dm) {
    // Dedupe: reopen an existing DM with exactly this same set of people rather than forking a
    // new thread every time someone clicks the same name twice.
    const wantedIds = [req.user.id, ...others].sort((a, b) => a - b);
    const myChannelIds = db.prepare(`SELECT channel_id FROM chat_channel_members WHERE user_id = ?`).all(req.user.id).map((r) => r.channel_id);
    for (const cid of myChannelIds) {
      const channel = db.prepare(`SELECT * FROM chat_channels WHERE id = ? AND is_dm = 1`).get(cid);
      if (!channel) continue;
      const memberIds = db.prepare(`SELECT user_id FROM chat_channel_members WHERE channel_id = ?`).all(cid).map((r) => r.user_id).sort((a, b) => a - b);
      if (memberIds.length === wantedIds.length && memberIds.every((id, i) => id === wantedIds[i])) {
        return res.json(summarize(channel, req.user.id));
      }
    }
  }

  const result = db.prepare(`INSERT INTO chat_channels (name, is_dm, created_by_user_id) VALUES (?, ?, ?)`)
    .run(is_dm ? null : ((name || '').trim() || 'New channel'), is_dm ? 1 : 0, req.user.id);
  const channelId = result.lastInsertRowid;
  // Only the creator's last_read_at starts at "now" — there's nothing to have unread yet. Anyone
  // else added starts with NULL, so a message sent moments later still counts as unread for them
  // rather than landing before their (wrongly future-dated) read marker.
  db.prepare(`INSERT OR IGNORE INTO chat_channel_members (channel_id, user_id, last_read_at) VALUES (?, ?, datetime('now'))`).run(channelId, req.user.id);
  const insertOther = db.prepare(`INSERT OR IGNORE INTO chat_channel_members (channel_id, user_id, last_read_at) VALUES (?, ?, NULL)`);
  for (const uid of others) insertOther.run(channelId, uid);
  res.status(201).json(summarize(db.prepare(`SELECT * FROM chat_channels WHERE id = ?`).get(channelId), req.user.id));
});

function requireMember(req, res, next) {
  const membership = db.prepare(`SELECT 1 FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`).get(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: "you're not a member of this chat" });
  next();
}

router.get('/channels/:id/messages', requireMember, (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.channel_id, m.user_id, m.body, m.created_at, u.username
    FROM chat_messages m JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ? ORDER BY m.id ASC
  `).all(req.params.id);
  // Opening a chat marks it read — same "read on open" behavior as any messaging app.
  db.prepare(`UPDATE chat_channel_members SET last_read_at = datetime('now') WHERE channel_id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.json(rows);
});

router.post('/channels/:id/messages', requireMember, (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'message body is required' });
  const result = db.prepare(`INSERT INTO chat_messages (channel_id, user_id, body) VALUES (?, ?, ?)`).run(req.params.id, req.user.id, body);
  db.prepare(`UPDATE chat_channel_members SET last_read_at = datetime('now') WHERE channel_id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  const row = db.prepare(`
    SELECT m.id, m.channel_id, m.user_id, m.body, m.created_at, u.username
    FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(row);
});

// Rename a group channel and/or add members — DMs can't be renamed or grown (start a new group
// channel instead if a conversation needs to include more people).
router.patch('/channels/:id', requireMember, (req, res) => {
  const channel = db.prepare(`SELECT * FROM chat_channels WHERE id = ?`).get(req.params.id);
  if (channel.is_dm) return res.status(400).json({ error: "direct messages can't be renamed or have members added — start a group channel instead" });
  if (req.body.name !== undefined && req.body.name.trim()) {
    db.prepare(`UPDATE chat_channels SET name = ? WHERE id = ?`).run(req.body.name.trim(), req.params.id);
  }
  if (Array.isArray(req.body.add_member_ids)) {
    const insertMember = db.prepare(`INSERT OR IGNORE INTO chat_channel_members (channel_id, user_id, last_read_at) VALUES (?, ?, NULL)`);
    for (const uid of req.body.add_member_ids) { const n = Number(uid); if (n) insertMember.run(req.params.id, n); }
  }
  res.json(summarize(db.prepare(`SELECT * FROM chat_channels WHERE id = ?`).get(req.params.id), req.user.id));
});

// Leave a group channel (not offered for DMs — client hides the option there).
router.post('/channels/:id/leave', requireMember, (req, res) => {
  const channel = db.prepare(`SELECT * FROM chat_channels WHERE id = ?`).get(req.params.id);
  if (channel.is_dm) return res.status(400).json({ error: "you can't leave a direct message" });
  db.prepare(`DELETE FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.status(204).end();
});

module.exports = router;
