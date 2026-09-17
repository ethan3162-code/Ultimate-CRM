// Login/logout/me for the user-accounts system (Sept 2026) — kept separate from the existing
// /api/auth router, which is entirely Google Calendar OAuth and predates this.
const express = require('express');
const db = require('../db');
const { verifyPassword, signToken, setSessionCookie, clearSessionCookie, publicUser } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username).trim().toLowerCase());
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'incorrect username or password' });
  }
  const token = signToken(user);
  setSessionCookie(res, token);
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not signed in' });
  res.json(publicUser(req.user));
});

module.exports = router;
