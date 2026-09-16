const express = require('express');
const { computeInsights } = require('../insights');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(computeInsights());
});

module.exports = router;
