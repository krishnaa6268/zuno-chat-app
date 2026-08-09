import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";

const PORT = process.env.PORT || 8000;
const app = express();

const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve("./public")));

app.get("/", (req, res) => {
  res.sendFile("/public/index.html");
});

//  socket refers client connection, io refers to server connection
io.on("connection", (socket) => {
  console.log("A new user has connected:", socket.id);

  // Listen for chat messages from the client 
  socket.on("chat-message", (message) => {
    console.log("Received message from", socket.id, ":", message);

    io.emit("message", { text: message, senderId: socket.id });

    // socket.broadcast.emit("message", message); //broadcast to all clients except sender - (only see received message from other users)
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
