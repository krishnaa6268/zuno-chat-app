import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import path from "path";

const PORT = process.env.PORT || 8000;
const MONGODB_URL = process.env.MONGODB_URL || process.env.MONGODB_URI;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const messageSchema = new mongoose.Schema(
  {
    senderName: { type: String, required: true, trim: true, maxlength: 30 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    seenBy: [{ username: String, seenAt: Date }],
  },
  { timestamps: true },
);

const chatStateSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  clearedAt: { type: Date, default: null },
});

const Message = mongoose.model("Message", messageSchema);
const ChatState = mongoose.model("ChatState", chatStateSchema);
let databaseReady = false;

if (MONGODB_URL) {
  mongoose
    .connect(MONGODB_URL)
    .then(() => {
      databaseReady = true;
      console.log("Connected to MongoDB");
    })
    .catch((error) =>
      console.error("MongoDB connection failed:", error.message),
    );
} else {
  console.warn("MongoDB is not configured. Add MONGODB_URL to .env.");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve("./public")));

app.get("/", (req, res) => res.sendFile(path.resolve("./public/index.html")));

const cleanUsername = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 30);
const serializeMessage = (message) => ({
  id: message._id.toString(),
  senderName: message.senderName,
  text: message.text,
  createdAt: message.createdAt,
  seenBy: message.seenBy || [],
});

io.on("connection", (socket) => {
  console.log("A new user has connected:", socket.id);

  socket.on("register-user", async (requestedName, callback) => {
    const username = cleanUsername(requestedName);
    if (!username)
      return callback?.({ ok: false, error: "Please enter a username." });
    if (!databaseReady)
      return callback?.({
        ok: false,
        error: "Database is unavailable. Try again shortly.",
      });

    try {
      socket.data.username = username;
      console.log(`${username} joined the chat`);
      const state = await ChatState.findOneAndUpdate(
        { username },
        { $setOnInsert: { username } },
        { returnDocument: "after", upsert: true },
      );
      const filter = state.clearedAt
        ? { createdAt: { $gt: state.clearedAt } }
        : {};
      const messages = await Message.find(filter)
        .sort({ createdAt: 1 })
        .limit(200);
      const unseenIds = messages
        .filter(
          (message) =>
            message.senderName !== username &&
            !message.seenBy.some((entry) => entry.username === username),
        )
        .map((message) => message._id);

      if (unseenIds.length) {
        await Message.updateMany(
          { _id: { $in: unseenIds } },
          { $push: { seenBy: { username, seenAt: new Date() } } },
        );
        io.emit("messages-seen", {
          messageIds: unseenIds.map(String),
          username,
        });
      }

      callback?.({
        ok: true,
        username,
        messages: messages.map(serializeMessage),
      });
    } catch (error) {
      console.error("Could not register user:", error.message);
      callback?.({ ok: false, error: "Could not load chat history." });
    }
  });

  socket.on("chat-message", async (rawText, callback) => {
    const username = socket.data.username;
    const text = String(rawText || "")
      .trim()
      .slice(0, 2000);
    if (!username)
      return callback?.({ ok: false, error: "Choose a username first." });
    if (!text) return;

    try {
      const message = await Message.create({ senderName: username, text });
      io.emit("message", serializeMessage(message));
      callback?.({ ok: true });
    } catch (error) {
      console.error("Could not save message:", error.message);
      callback?.({ ok: false, error: "Message could not be saved." });
    }
  });

  socket.on("mark-seen", async (messageIds) => {
    const username = socket.data.username;
    const ids = Array.isArray(messageIds)
      ? messageIds.filter(mongoose.isObjectIdOrHexString)
      : [];
    if (!username || !ids.length) return;

    const messages = await Message.find({
      _id: { $in: ids },
      senderName: { $ne: username },
    });
    const unseenIds = messages
      .filter(
        (message) =>
          !message.seenBy.some((entry) => entry.username === username),
      )
      .map((message) => message._id);
    if (!unseenIds.length) return;

    await Message.updateMany(
      { _id: { $in: unseenIds } },
      { $push: { seenBy: { username, seenAt: new Date() } } },
    );
    io.emit("messages-seen", { messageIds: unseenIds.map(String), username });
  });

  socket.on("clear-chat", async (callback) => {
    const username = socket.data.username;
    if (!username)
      return callback?.({ ok: false, error: "Choose a username first." });

    try {
      await ChatState.findOneAndUpdate(
        { username },
        { $set: { clearedAt: new Date() } },
        { upsert: true },
      );
      callback?.({ ok: true });
    } catch (error) {
      console.error("Could not clear chat:", error.message);
      callback?.({ ok: false, error: "Could not clear your chat." });
    }
  });

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
