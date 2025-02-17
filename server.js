const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const rooms = new Map();

//middleware for cors
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.options("*", cors()); // Enable preflight for all routes

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/api/room/create", (req, res) => {
  const roomId = uuidv4();
  rooms.set(roomId, {
    elements: [],
    users: new Map(),
    createdAt: Date.now(),
  });
  res.json({ roomId });
});

app.get("/api/room/exists/:roomId", (req, res) => {
  const exists = rooms.has(req.params.roomId);
  res.json({ exists });
});

io.on("connection", (socket) => {
  console.log("a user connected backend", socket.id);

  socket.on("create-room", (name) => {
    const roomId = uuidv4();
    rooms.set(roomId, {
      elements: [],
      users: new Map(),
    });
    socket.join(roomId);

    const userName = name ? name :`Guest_${Math.floor(Math.random() * 10000)}`;
    const room = rooms.get(roomId);
    room.users.set(socket.id, { userName });

    socket.emit("room-created", { roomId, userName });
    console.log("room created and joined", room);
  });

  socket.on("join-room", ({ roomFromHash: roomId, userName }) => {
    if (!rooms.has(roomId)) {
      socket.emit("invalid-room");
      return;
    }

    socket.join(roomId);
    const room = rooms.get(roomId);
    const finalName = userName
      ? userName
      : `Guest_${Math.floor(Math.random() * 10000)}`;

    room.users.set(socket.id, { userName: finalName });

    console.log(`User ${socket.id} joined room ${roomId}`);

    console.log(room.users, "users");
    // Send existing elements ONLY to the newly joined user
    socket.emit("send-updates", room.elements);
    socket.emit("users-joined", Array.from(room.users.values()));
  });

  // Handle element updates
  socket.on("elements-update", ({ currentRoomId, elements }) => {
    const room = rooms.get(currentRoomId);
    if (room) {
      room.elements = elements;

      // Send updates only to users in the same room (excluding sender)
      socket.to(currentRoomId).emit("send-updates", elements);
    }
  });

  //Handle cursor updates
  socket.on("cursor-update", ({ roomId, position }) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.to(roomId).emit("cursor-update", {
        socketId: socket.id,
        position,
        userName: room.users.get(socket.id)?.userName || "Guest"
      });
    }
  });

  // New event: update username
  socket.on("update-username", ({ roomId, newUserName }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    if (room.users.has(socket.id)) {
      room.users.set(socket.id, { userName: newUserName });
      console.log(
        `User ${socket.id} updated username to ${newUserName} in room ${roomId}`
      );
      // Optionally, broadcast the updated user list to others in the room
      socket.to(roomId).emit("users-joined", Array.from(room.users.values()));
    }
  });

  //handle room leave

  socket.on("leave-room", (roomId) => {
    if (!rooms.has(roomId)) return;
    socket.leave(roomId);
    const room = rooms.get(roomId);
    if (room.users.has(socket.id)) {
      room.users.delete(socket.id);
      console.log(`User ${socket.id} left room ${roomId}`);
    }
    // Notify the leaving client so it can stop listening for updates.
    // socket.emit("room-left", roomId);
  });

  // Handle cursor updates
  // socket.on("cursor-update", ({ roomId, position }) => {
  //   const room = rooms.get(roomId);
  //   if (room) {
  //     room.users.set(socket.id, {
  //       ...room.users.get(socket.id),
  //       cursor: position,
  //     });
  //     updatePresence(roomId);
  //   }
  // });
  

  // socket.on("disconnect", () => {
  //   rooms.forEach((room, roomId) => {
  //     if (room.users.has(socket.id)) {
  //       room.users.delete(socket.id);
  //       updatePresence(roomId);
  //     }
  //   });
  // });

  // function updatePresence(roomId) {
  //   const room = rooms.get(roomId);
  //   const users = Array.from(room.users.values());
  //   io.to(roomId).emit("presence-update", users);
  // }

  //
  socket.on("disconnect", () => {
    console.log(`User ${socket.id} disconnected`);

    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.leave(roomId);
      }
    });
  });
});

server.listen(3001, () => {
  console.log("Signaling server running on port 3001");
});
