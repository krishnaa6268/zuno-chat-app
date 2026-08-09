import mongoose from "mongoose";
import { ChatState } from "../models/ChatState.js";

const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI;

export async function connectDatabase() {
  if (!mongoUrl)
    throw new Error("MongoDB is not configured. Add MONGODB_URL to .env.");
  await mongoose.connect(mongoUrl);
  // Migrates the previous username-only index to username + roomId.
  await ChatState.syncIndexes();
  console.log("Connected to MongoDB");
}
