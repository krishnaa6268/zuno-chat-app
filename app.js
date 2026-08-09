import "dotenv/config";
import express from "express";
import statusMonitor from "express-status-monitor";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { connectDatabase } from "./server/config/database.js";
import { registerChatSocket } from "./server/socket/chatSocket.js";

const PORT = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(statusMonitor());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve("./public")));
app.get("/", (req, res) => res.sendFile(path.resolve("./public/index.html")));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

await connectDatabase();
registerChatSocket(io);

server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server is running on port ${PORT}`),
);
