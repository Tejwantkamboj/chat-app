import { User } from "../model/index.js";
import chatController from "./chatController.js";
import envConfig from "../config/envConfig.js";
import jwt from "jsonwebtoken";
let onlineUsers = new Map();

const getHandshakeToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  const headerToken = socket.handshake.headers?.token;
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
  "create-private-chat": (socket, io, data) =>
    chatController.createPrivateChat(socket, io, data),
  "chat-list": async (socket, io, data) =>
    await chatController.chatList(socket, io),
  "message-list": async (socket, io, data) =>
    await chatController.messageList(socket, io, data),
  "send-message": async (socket, io, data) =>
    await chatController.sendMessage(socket, io, data),
  "mark-messages-as-read": async (socket, io, data) =>
    await chatController.markAllMessagesAsRead(socket, io, data),
  "user-active-status": async (socket, io, data) =>
    await chatController.getUserStatus(socket, io, data),
};

const initializeSocket = (io) => {
  io.use(socketAuth);

  io.on("connection", (socket) => {
    try {
      const userId = socket.data.user?._id?.toString();
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }

      onlineUsers.get(userId).add(socket.id);
      io.emit("user:online", { userId });

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
        const userId = socket.data.user?._id?.toString();
        if (!userId) return;
        const userSockets = onlineUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            onlineUsers.delete(userId);
            io.emit("user:offline", { userId });
          }
        }
      });
    } catch (err) {
      console.error("Connection error:", err.message);
      socket.disconnect(true);
    }
  });
};

export { initializeSocket, onlineUsers };
