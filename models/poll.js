
const mongoose = require('mongoose');
// Poll model
const pollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  choices: [
    {
      text: { type: String, required: true },
      votes: { type: Number, default: 0 }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Poll', pollSchema);