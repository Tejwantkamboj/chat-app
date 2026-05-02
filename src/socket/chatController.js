import { User, Chat, Message } from "../model/index.js";
import mongoose from "mongoose";

const getUserId = (socket) => {
  return socket.data.user?._id?.toString();
};

const chatListService = async (io, members) => {
  for (const memberId of members) {
    const chats = await Chat.find({
      participants: memberId,
    })
      .sort({ updatedAt: -1 })
      .populate({
        path: "lastMessage",
        select: "content createdAt",
        populate: {
          path: "sender",
          select: "name email",
        },
      })
      .lean();

    io.to(memberId.toString()).emit("chat-list", chats);
  }
};

const chatList = async (socket, io) => {
  const userId = getUserId(socket);
  await chatListService(io, [userId]);
};

const createGroupChat = async (socket, data, io) => {
  try {
    const userId = getUserId(socket);
    const groupName = data.groupName?.trim();
    const participantIds = data.participantIds || [];

    if (!groupName) {
      throw new Error("groupName is required");
    }

    if (participantIds.length < 2) {
      throw new Error("Group chat must have at least 2 participants");
    }

    const groupMembers = [...new Set([...participantIds, userId])].map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    await Chat.create({
      participants: groupMembers,
      type: "group",
      groupName,
      groupAdmin: userId,
    });

    await chatListService(io, groupMembers);
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const messageList = async (socket, data) => {
  try {
    const userId = getUserId(socket);
    const { chatId, page = 1, limit = 20 } = data;

    if (!chatId) {
      throw new Error("chatId is required");
    }

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId,
    });

    if (!chat) {
      throw new Error("Unauthorized access to chat");
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("sender", "name email")
      .lean();

    const orderedMessages = messages.reverse();
    const total = await Message.countDocuments({ chatId });

    socket.emit("message-list", {
      messages: orderedMessages,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const sendMessage = async (socket, data, io) => {};

export default {
  createGroupChat,
  chatList,
  messageList,
};
