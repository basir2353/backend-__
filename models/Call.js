const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  callee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  duration: { type: Number }, // in seconds
  status: { type: String, enum: ['initiated', 'accepted', 'rejected', 'ended'], default: 'initiated' }
});

module.exports = mongoose.model('Call', CallSchema);