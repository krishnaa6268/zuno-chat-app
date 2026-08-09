import crypto from "crypto";
import mongoose from "mongoose";
import { Room } from "../models/Room.js";
import { Message } from "../models/Message.js";
import { ChatState } from "../models/ChatState.js";

const cleanUsername = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 30);
const cleanRoomCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
const newRoomCode = () => crypto.randomBytes(4).toString("hex").toUpperCase();
const serializeMessage = (message) => ({
  id: message._id.toString(),
  senderName: message.senderName,
  text: message.text,
  createdAt: message.createdAt,
  seenBy: message.seenBy || [],
});

async function enterRoom(io, socket, room) {
  const { username } = socket.data;
  const isMember = room.members.includes(username);
  if (!isMember && room.members.length >= 2)
    return { ok: false, error: "This private room already has two members." };
  if (!isMember) {
    room.members.push(username);
    await room.save();
  }

  if (socket.data.roomId) socket.leave(socket.data.roomId);
  socket.data.roomId = room._id.toString();
  socket.join(socket.data.roomId);
  const state = await ChatState.findOneAndUpdate(
    { username, roomId: room._id },
    { $setOnInsert: { username, roomId: room._id } },
    { returnDocument: "after", upsert: true },
  );
  const filter = {
    roomId: room._id,
    ...(state.clearedAt && { createdAt: { $gt: state.clearedAt } }),
  };
  const messages = await Message.find(filter).sort({ createdAt: 1 }).limit(200);
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
    io.to(socket.data.roomId).emit("messages-seen", {
      messageIds: unseenIds.map(String),
      username,
    });
  }
  return {
    ok: true,
    roomCode: room.code,
    messages: messages.map(serializeMessage),
    memberCount: room.members.length,
  };
}

export function registerChatSocket(io) {
  io.on("connection", (socket) => {
    console.log("A new user has connected:", socket.id);
    socket.on("register-user", (requestedName, callback) => {
      const username = cleanUsername(requestedName);
      if (!username)
        return callback?.({ ok: false, error: "Please enter a username." });
      socket.data.username = username;
      callback?.({ ok: true, username });
    });
    socket.on("create-room", async (callback) => {
      if (!socket.data.username)
        return callback?.({ ok: false, error: "Choose a username first." });
      try {
        let room;
        for (let attempt = 0; attempt < 3 && !room; attempt += 1) {
          try {
            room = await Room.create({ code: newRoomCode(), members: [] });
          } catch (error) {
            if (error.code !== 11000) throw error;
          }
        }
        if (!room) throw new Error("Could not create a unique room code.");
        callback?.(await enterRoom(io, socket, room));
      } catch (error) {
        console.error("Could not create room:", error.message);
        callback?.({ ok: false, error: "Could not create a room." });
      }
    });
    socket.on("join-room", async (requestedCode, callback) => {
      if (!socket.data.username)
        return callback?.({ ok: false, error: "Choose a username first." });
      const code = cleanRoomCode(requestedCode);
      if (!code) return callback?.({ ok: false, error: "Enter a room ID." });
      try {
        const room = await Room.findOne({ code });
        if (!room)
          return callback?.({
            ok: false,
            error: "Room not found. Check the room ID.",
          });
        callback?.(await enterRoom(io, socket, room));
      } catch (error) {
        console.error("Could not join room:", error.message);
        callback?.({ ok: false, error: "Could not join this room." });
      }
    });
    socket.on("chat-message", async (rawText, callback) => {
      const { username, roomId } = socket.data;
      const text = String(rawText || "")
        .trim()
        .slice(0, 2000);
      if (!username || !roomId)
        return callback?.({ ok: false, error: "Join a private room first." });
      if (!text) return;
      try {
        const message = await Message.create({
          roomId,
          senderName: username,
          text,
        });
        io.to(roomId).emit("message", serializeMessage(message));
        callback?.({ ok: true });
      } catch (error) {
        console.error("Could not save message:", error.message);
        callback?.({ ok: false, error: "Message could not be saved." });
      }
    });
    socket.on("mark-seen", async (messageIds) => {
      const { username, roomId } = socket.data;
      const ids = Array.isArray(messageIds)
        ? messageIds.filter(mongoose.isObjectIdOrHexString)
        : [];
      if (!username || !roomId || !ids.length) return;
      const messages = await Message.find({
        _id: { $in: ids },
        roomId,
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
      io.to(roomId).emit("messages-seen", {
        messageIds: unseenIds.map(String),
        username,
      });
    });
    socket.on("clear-chat", async (callback) => {
      const { username, roomId } = socket.data;
      if (!username || !roomId)
        return callback?.({ ok: false, error: "Join a room first." });
      try {
        await ChatState.findOneAndUpdate(
          { username, roomId },
          { $set: { clearedAt: new Date() } },
          { upsert: true },
        );
        callback?.({ ok: true });
      } catch (error) {
        console.error("Could not clear chat:", error.message);
        callback?.({ ok: false, error: "Could not clear your chat." });
      }
    });
    socket.on("end-room", async (callback) => {
      const { username, roomId } = socket.data;
      if (!username || !roomId)
        return callback?.({ ok: false, error: "Join a room first." });
      try {
        const room = await Room.findOne({ _id: roomId, members: username });
        if (!room) return callback?.({ ok: false, error: "This room no longer exists." });

        const roomSockets = await io.in(roomId).fetchSockets();
        await Promise.all([
          Message.deleteMany({ roomId }),
          ChatState.deleteMany({ roomId }),
          Room.deleteOne({ _id: roomId }),
        ]);
        io.to(roomId).emit("room-ended");
        for (const client of roomSockets) {
          client.data.roomId = undefined;
          client.leave(roomId);
        }
        console.log(`${username} ended room ${room.code}`);
        callback?.({ ok: true });
      } catch (error) {
        console.error("Could not end room:", error.message);
        callback?.({ ok: false, error: "Could not end this room." });
      }
    });
    socket.on("disconnect", () => console.log("User disconnected:", socket.id));
  });
}
