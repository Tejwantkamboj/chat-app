import { User } from "../model/index.js";
import chatController from "./chatController.js";
import envConfig from "../config/envConfig.js";
import jwt from "jsonwebtoken";

const findOrCreatePrivateChat = async (senderId, receiverId) => {
  const membersHash = [senderId, receiverId].sort().join("_");

  let chat = await Chat.findOne({ membersHash });

  if (!chat) {
    chat = await Chat.create({
      type: "private",
      participants: [senderId, receiverId],
      membersHash,
    });
  }

  return chat;
};

const getHandshakeToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  const headerToken = socket.handshake.headers?.authorization;
  const token = authToken || headerToken;

  if (!token) return null;

  return token.startsWith("Bearer ") ? token.slice(7) : token;
};

const socketAuth = async (socket, next) => {
  try {
    const token = getHandshakeToken(socket);

    if (!token) {
      console.warn("Socket auth failed: No token provided");
      return next(new Error("Unauthorized: No token"));
    }

    const decoded = jwt.verify(token, envConfig.jwt.secret);
    const userId = decoded.sub || decoded.id || decoded._id;

    if (!userId) {
      return next(new Error("Unauthorized: Invalid token payload"));
    }

    const user = await User.findById(userId).select(
      "_id username email profilePicture",
    );

    if (!user) {
      return next(new Error("Unauthorized: User not found"));
    }

    // Attach user to socket
    socket.user = user;
    socket.data = socket.data || {};
    socket.data.user = user;

    next();
  } catch (err) {
    console.error("Socket auth failed:", err.message);
    next(new Error("Unauthorized: Invalid token"));
  }
};

const chatEvents = {
  "create-group-chat": (socket, io, data) =>
    chatController.createGroupChat(socket, io, data),
  "chat-list": async (socket, io, data) =>
    await chatController.chatList(socket, io, data),
};

const initializeSocket = (io) => {
  io.use(socketAuth);

  io.on("connection", (socket) => {
    try {
      console.log(`User connected: ${socket.user._id}`);

      // Join personal room
      socket.join(socket.user._id.toString());

      // Broadcast user online
      io.emit("user-online", {
        userId: socket.user._id,
      });

      Object.entries(chatEvents).forEach(([event, handler]) => {
        socket.on(event, async (data) => {
          try {
            await handler(socket, io, data || {});
          } catch (error) {
            console.error(`Socket event error [${event}]:`, error.message);

            socket.emit("socket-error", {
              event,
              message: error.message || "Something went wrong",
            });
          }
        });
      });

      socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.user._id}`);

        io.emit("user-offline", {
          userId: socket.user._id,
        });
      });
    } catch (err) {
      console.error("Connection error:", err.message);
      socket.disconnect(true);
    }
  });
};

export { initializeSocket };
