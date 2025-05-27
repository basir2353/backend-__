const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  day: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  type: { type: String, required: true },
  doctorName: { type: String, required: true },
  avatarSrc: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 👈 Add this
  createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Appointment', appointmentSchema);