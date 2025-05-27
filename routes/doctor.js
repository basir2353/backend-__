// Get online doctors (for employees)
const User  = require('../models/User')
const express = require('express');
const Call = 
 require('../models/Call')

const router = express.Router();

router
.get('/doctors', async (req, res) => {
  try {
    const doctors = await User.find({ 
      role: 'doctor', 
      isOnline: true
    }).select('name email');
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});



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


module.exports= router