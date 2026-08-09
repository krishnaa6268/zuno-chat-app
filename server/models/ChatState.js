import mongoose from "mongoose";

const chatStateSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  clearedAt: { type: Date, default: null },
}, { timestamps: true });
chatStateSchema.index({ username: 1, roomId: 1 }, { unique: true });

export const ChatState = mongoose.model("ChatState", chatStateSchema);
