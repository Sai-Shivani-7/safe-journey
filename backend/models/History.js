import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  userId: String,
  source: String,
  destination: String,
  date: { type: Date, default: Date.now },
});

export default mongoose.model("History", historySchema);
