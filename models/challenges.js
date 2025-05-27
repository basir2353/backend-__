const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  rewardPoints: { type: Number, required: true },
  participantsCount: { type: Number, default: 0 },
  participants: [{ type: String }] 
});

module.exports = mongoose.model('Challenge', challengeSchema);