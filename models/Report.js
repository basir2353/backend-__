const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['hazard', 'safety', 'incident'] // Added 'incident'
  },
  date: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  reportToHR: {
    type: Boolean,
    default: false
  },
  anonymous: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  involvedParties: [{
    type: String
  }],
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'in-progress', 'resolved']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Report', reportSchema);
