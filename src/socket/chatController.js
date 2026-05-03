import { onlineUsers } from "./index.js";
import { User, Chat, Message } from "../model/index.js";
import mongoose from "mongoose";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const getUserId = (socket) => {
  return socket.data.user?._id?.toString();
};

const chatValidator = async (socket, chatId) => {
  const userId = getUserId(socket);

  if (!chatId) {
    throw new Error("chatId is required");
  }

  const chat = await Chat.findOne({
    _id: toObjectId(chatId),
    participants: { $in: [toObjectId(userId)] },
  });

  if (!chat) {
    throw new Error("Unauthorized access to chat");
  }

  return chat;
};

const newChatCreated = async (io, chatId) => {
  const chat = await Chat.findById(chatId).lean();
  if (!chat) return;
  const chatData = {
    ...chat,
    lastMessage: {},
    unreadMessageCount: 0,
  };

  io.to(chat.participants.map((p) => p.toString())).emit(
    "chat-created",
    chatData,
  );
};

const joinChatRoom = async (socket, io, data) => {
  try {
    const { chatId } = data;
    if (!chatId) {
      return socket.emit("socket-error", "chatId is required");
    }
    await chatValidator(socket, chatId);
    socket.join(chatId.toString());
  } catch (error) {
    socket.emit("socket-error", error.message);
  }
};

const createPrivateChat = async (socket, io, data) => {
  const userId = getUserId(socket);
  const { receiverId } = data;
  try {
    if (!receiverId) {
      return socket.emit("socket-error", "receiverId is required");
    }

    if (userId === receiverId) {
      throw new Error("You cannot chat with yourself");
    }

    const participants = [userId, receiverId]
      .map((id) => toObjectId(id))
      .sort((a, b) => a.toString().localeCompare(b.toString()));

    let chat = await Chat.findOne({
      type: "private",
      participants: { $size: 2, $all: participants },
    });

    if (!chat) {
      chat = await Chat.create({
        type: "private",
        participants,
      });
    }
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const createGroupChat = async (socket, io, data) => {
  try {
    const userId = getUserId(socket);
    const groupName = data.groupName?.trim();
    const participantIds = data.participantIds || [];

    if (!groupName) {
      throw new Error("groupName is required");
    }

    if (participantIds.length < 1) {
      throw new Error("Group chat must have at least 1 participants");
    }

    const groupMembers = [...new Set([...participantIds, userId])].map((id) =>
      toObjectId(id),
    );

    const chat = await Chat.create({
      participants: groupMembers,
      type: "group",
      groupName,
      groupAdmin: toObjectId(userId),
    });

    await newChatCreated(io, chat._id);
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const chatList = async (socket, io) => {
  const userId = getUserId(socket);
  const pipeline = [
    {
      $match: {
        participants: toObjectId(userId),
      },
    },
    {
      $sort: { updatedAt: -1 },
    },
    {
      $lookup: {
        from: "messages",
        localField: "lastMessage",
        foreignField: "_id",
        as: "lastMessage",
      },
    },
    {
      $unwind: {
        path: "$lastMessage",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.sender",
        foreignField: "_id",
        as: "lastMessage.sender",
      },
    },
    {
      $unwind: {
        path: "$lastMessage.sender",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "messages",
        let: { chatId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$chatId", "$$chatId"] },
                  { $ne: ["$sender", toObjectId(userId)] },
                  {
                    $not: {
                      $in: [toObjectId(userId), "$readBy"],
                    },
                  },
                ],
              },
            },
          },
          { $count: "unreadCount" },
        ],
        as: "unreadData",
      },
    },
    {
      $addFields: {
        unreadMessageCount: {
          $ifNull: [{ $arrayElemAt: ["$unreadData.unreadCount", 0] }, 0],
        },
      },
    },
    {
      $project: {
        participants: 1,
        updatedAt: 1,
        unreadMessageCount: 1,
        "lastMessage.content": 1,
        "lastMessage.createdAt": 1,
        "lastMessage.sender._id": 1,
        "lastMessage.sender.name": 1,
        "lastMessage.sender.email": 1,
      },
    },
  ];

  const chats = await Chat.aggregate(pipeline);
  socket.emit("chat-list", chats);
};

const messageList = async (socket, io, data) => {
  try {
    const userId = getUserId(socket);
    const { chatId, page = 1, limit = 20 } = data;

    await chatValidator(socket, chatId);

    const chatObjectId = toObjectId(chatId);
    const userObjectId = toObjectId(userId);

    const result = await Message.aggregate([
      { $match: { chatId: chatObjectId } },

      {
        $facet: {
          messages: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "sender",
                foreignField: "_id",
                as: "sender",
                pipeline: [{ $project: { name: 1, email: 1 } }],
              },
            },
            { $unwind: "$sender" },
          ],

          total: [{ $count: "count" }],

          unread: [
            {
              $match: {
                sender: { $ne: userObjectId },
                readBy: {
                  $not: {
                    $elemMatch: { $eq: userObjectId },
                  },
                },
              },
            },
            { $count: "count" },
          ],
        },
      },
    ]);

    const messages = result?.[0]?.messages || [];
    const totalMessages = result?.[0]?.total?.[0]?.count || 0;
    const unreadMessagesCount = result?.[0]?.unread?.[0]?.count || 0;

    socket.emit("message-list", {
      messages,
      unreadMessagesCount,
      page,
      limit,
      totalMessages,
      hasMore: page * limit < totalMessages,
    });
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const sendMessage = async (socket, io, data) => {
  const { chatId, content } = data;

  try {
    const userId = getUserId(socket);

    if (!content?.trim()) {
      throw new Error("Message content required");
    }
    const chat = await chatValidator(socket, chatId);

    const message = await Message.create({
      chatId: chat._id,
      sender: userId,
      content,
    });

    chat.lastMessage = message._id;
    await chat.save();
    io.to(chat._id.toString()).emit("new-message", {
      ...message.toObject(),
      sender: socket.data.user,
    });
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const markAllMessagesAsRead = async (socket, io, data) => {
  try {
    const userId = getUserId(socket);
    const { chatId } = data;

    const chat = await chatValidator(socket, chatId);
    const userObjectId = toObjectId(userId);
    const chatObjectId = toObjectId(chatId);

    const result = await Message.updateMany(
      {
        chatId: chatObjectId,
        sender: { $ne: userObjectId },
        readBy: {
          $not: { $elemMatch: { $eq: userObjectId } },
        },
      },
      {
        $addToSet: { readBy: userObjectId },
      },
    );

    io.to(chatId.toString()).emit("messages-read", {
      chatId,
      userId,
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error(error);
    socket.emit("socket-error", error.message);
  }
};

const getUserStatus = (socket, io, data) => {
  const { userId } = data;

  if (!userId) {
    return socket.emit("socket-error", "userId is required");
  }

  const online = onlineUsers.has(userId.toString());
  socket.emit("user-active-status", {
    userId,
    online,
  });
};

export default {
  joinChatRoom,
  createGroupChat,
  createPrivateChat,
  chatList,
  messageList,
  sendMessage,
  markAllMessagesAsRead,
  getUserStatus,
};
