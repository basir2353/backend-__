const User  = require('../models/Call')
const express = require('express');

const router = express.Router();
router
.get('/calls', async (req, res) => {
  try {
    const calls = await Call.find()
      .populate('caller', 'username email role')
      .populate('callee', 'username email role')
      .sort({ startTime: -1 });
    res.json(calls);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;