import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    members: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

export const Room = mongoose.model("Room", roomSchema);
