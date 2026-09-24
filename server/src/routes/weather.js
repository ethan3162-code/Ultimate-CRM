const express = require('express');
const weather = require('../weather');

const router = express.Router();

// Home page's weather panel (Sept 2026) — always reachable to any signed-in login, same as
// tasks/chat, since Home itself is an always-shown page regardless of per-login permissions.
// Only two fixed locations are ever accepted; anything else quietly falls back to NYC rather
// than erroring, since this drives a toggle with exactly two options on the client.
router.get('/', async (req, res) => {
  if (!weather.isConfigured()) return res.json({ configured: false });
  const locationKey = req.query.location === 'long_island' ? 'long_island' : 'nyc';
  try {
    const data = await weather.fetchDaily(locationKey);
    res.json({ configured: true, ...data });
  } catch (err) {
    res.status(502).json({ configured: true, error: err.message });
  }
});

module.exports = router;
