const mongoose = require('mongoose');
const user = require('./User'); // Assuming User model is in the same directory
const reportSchema = new mongoose.Schema({
user: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User', // ✅ Corrected: 'User', not 'Users'
  required: true
}

,
  type: {
    type: String,
    required: true,
    enum: ['option1', 'option2', 'option3'] // adjust based on your real options
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
  timestamps: true // adds createdAt and updatedAt
});

module.exports = mongoose.model('Report', reportSchema);
