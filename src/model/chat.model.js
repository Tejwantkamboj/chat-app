import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    type: {
      type: String,
      enum: ["private", "group"],
      default: "private",
    },
    groupName: {
      type: String,
      trim: true,
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  },
  { timestamps: true },
);

schema.index({ participants: 1 });
schema.index({ updatedAt: -1 });

schema.pre("validate", function (next) {
  if (this.type === "private" && this.participants.length !== 2) {
    return next(new Error("Private chat must have exactly 2 participants"));
  }

  if (this.type === "group") {
    if (this.participants.length < 2) {
      return next(new Error("Group chat must have at least 2 participants"));
    }

    if (!this.groupName || this.groupName.trim() === "") {
      return next(new Error("Group name is required for group chats"));
    }

    if (!this.groupAdmin) {
      return next(new Error("Group admin is required for group chats"));
    }
  }

  next();
});

export default mongoose.model("Chat", schema);
