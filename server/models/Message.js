import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    senderName: { type: String, required: true, trim: true, maxlength: 30 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    seenBy: [{ username: String, seenAt: Date }],
  },
  { timestamps: true },
);

export const Message = mongoose.model("Message", messageSchema);
