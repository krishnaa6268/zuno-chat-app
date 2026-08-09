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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve("./public")));

app.use(
  statusMonitor({
    websocket: io, // latest version of express-status-monitor supports passing the socket.io instance
  }),
);

app.get("/", (req, res) => res.sendFile(path.resolve("./public/index.html")));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

await connectDatabase();
registerChatSocket(io);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing process or set a different PORT.`,
    );
  } else {
    console.error("Server error:", error);
  }
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server is running on port ${PORT}`),
);
