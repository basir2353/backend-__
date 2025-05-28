const mongoose = require('mongoose');

// Choice subdocument schema
const choiceSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  votes: {
    type: Number,
    default: 0
  }
});

// Poll schema
const pollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
    minlength: 5
  },
  choices: {
    type: [choiceSchema],
    validate: [arr => arr.length >= 2, 'At least two choices are required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('Poll', pollSchema);
