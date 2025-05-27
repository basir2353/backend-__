const ReportSchema = new mongoose.Schema({
  type: String,
  date: String,
  time: String,
  reportToHR: Boolean,
  anonymous: Boolean,
  location: String,
  description: String,
  involvedParties: [String],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true, // <-- error because this is missing
  }
});
