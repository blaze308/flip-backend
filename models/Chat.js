const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Chat Schema for MongoDB
 * Supports one-on-one and group chats with rich messaging features
 */

// Chat Type Enum
const CHAT_TYPES = ["direct", "group"];

// Chat Status Enum
const CHAT_STATUS = ["active", "archived", "deleted"];

// Chat Member Schema - Simplified to use userId as primary identifier
const chatMemberSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "moderator", "member"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Notification settings for this chat
    notifications: {
      enabled: {
        type: Boolean,
        default: true,
      },
      sound: {
        type: Boolean,
        default: true,
      },
      vibration: {
        type: Boolean,
        default: true,
      },
    },
  },
  { _id: true }
);

// Main Chat Schema
const chatSchema = new Schema(
  {
    // Chat Basic Information
    type: {
      type: String,
      enum: CHAT_TYPES,
      required: true,
      index: true,
    },

    // Chat Metadata
    name: {
      type: String,
      trim: true,
      maxlength: [100, "Chat name cannot exceed 100 characters"],
      // Required for group chats, optional for direct chats
      required: function () {
        return this.type === "group";
      },
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Chat description cannot exceed 500 characters"],
    },

    avatar: {
      type: String,
      validate: {
        validator: function (url) {
          if (!url) return true;
          return /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid avatar URL",
      },
    },

    // Chat Members
    members: [chatMemberSchema],

    // Chat Creator (for group chats)
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Chat Status
    status: {
      type: String,
      enum: CHAT_STATUS,
      default: "active",
      index: true,
    },

    // Last Message Info (for quick access)
    lastMessage: {
      messageId: {
        type: Schema.Types.ObjectId,
        ref: "Message",
      },
      content: {
        type: String,
        maxlength: 200, // Truncated version for preview
      },
      type: {
        type: String,
        enum: ["text", "image", "video", "audio", "lottie", "svga", "file"],
      },
      senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      senderName: String,
      timestamp: Date,
    },

    // Message Statistics
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Group Chat Settings (only for group chats)
    settings: {
      // Who can add members
      whoCanAddMembers: {
        type: String,
        enum: ["admin", "moderator", "all"],
        default: "admin",
      },
      // Who can change chat info
      whoCanEditInfo: {
        type: String,
        enum: ["admin", "moderator", "all"],
        default: "admin",
      },
      // Who can send messages
      whoCanSendMessages: {
        type: String,
        enum: ["admin", "moderator", "all"],
        default: "all",
      },
      // Maximum members allowed
      maxMembers: {
        type: Number,
        default: 256,
        max: 1000,
      },
      // Auto-delete messages after certain time
      autoDeleteMessages: {
        enabled: {
          type: Boolean,
          default: false,
        },
        duration: {
          type: Number, // in hours
          default: 24,
        },
      },
    },

    // Privacy Settings
    isPublic: {
      type: Boolean,
      default: false, // Private by default
    },

    // For direct chats - quick access to participant IDs
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Soft Delete
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        delete ret.deletedAt;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
chatSchema.index({ type: 1, status: 1, createdAt: -1 });
chatSchema.index({ "members.userId": 1, status: 1 });
chatSchema.index({ participants: 1, type: 1 });
chatSchema.index({ createdBy: 1, createdAt: -1 });
chatSchema.index({ "lastMessage.timestamp": -1 });

// Compound indexes for common queries
chatSchema.index({ type: 1, "members.userId": 1, status: 1 });
chatSchema.index({ participants: 1, "lastMessage.timestamp": -1 });

// Virtual for member count
chatSchema.virtual("memberCount").get(function () {
  return this.members.filter((member) => member.isActive).length;
});

// Virtual for active members
chatSchema.virtual("activeMembers").get(function () {
  return this.members.filter((member) => member.isActive);
});

// Virtual for chat display name (for direct chats)
chatSchema.virtual("displayName").get(function () {
  if (this.type === "group") {
    return this.name;
  }
  // For direct chats, return the other participant's name
  // This would need to be populated with current user context
  return this.name || "Direct Chat";
});

// Instance Methods

// Check if user is a member of this chat
chatSchema.methods.isMember = function (userId) {
  return this.members.some(
    (member) =>
      member.userId.toString() === userId.toString() && member.isActive
  );
};

// Get member by user ID
chatSchema.methods.getMember = function (userId) {
  return this.members.find(
    (member) =>
      member.userId.toString() === userId.toString() && member.isActive
  );
};

// Check if user has specific role
chatSchema.methods.hasRole = function (userId, role) {
  const member = this.getMember(userId);
  return member && member.role === role;
};

// Check if user is admin
chatSchema.methods.isAdmin = function (userId) {
  return this.hasRole(userId, "admin");
};

// Check if user can perform action based on settings
chatSchema.methods.canPerformAction = function (userId, action) {
  const member = this.getMember(userId);
  if (!member) return false;

  const setting = this.settings[action];
  if (!setting) return false;

  switch (setting) {
    case "admin":
      return member.role === "admin";
    case "moderator":
      return ["admin", "moderator"].includes(member.role);
    case "all":
      return true;
    default:
      return false;
  }
};

// Add member to chat
chatSchema.methods.addMember = function (
  userId,
  firebaseUid,
  username,
  displayName,
  avatar = null,
  role = "member"
) {
  // Check if user is already a member
  const existingMember = this.members.find(
    (member) => member.userId.toString() === userId.toString()
  );

  if (existingMember) {
    // Reactivate if inactive
    if (!existingMember.isActive) {
      existingMember.isActive = true;
      existingMember.joinedAt = new Date();
    }
    return this.save();
  }

  // Add new member
  this.members.push({
    userId,
    firebaseUid,
    username,
    displayName,
    avatar,
    role,
    joinedAt: new Date(),
    lastSeenAt: new Date(),
    isActive: true,
  });

  // Update participants array for direct chats
  if (this.type === "direct" && !this.participants.includes(userId)) {
    this.participants.push(userId);
  }

  return this.save();
};

// Remove member from chat
chatSchema.methods.removeMember = function (userId) {
  const member = this.getMember(userId);
  if (member) {
    member.isActive = false;
  }

  // Remove from participants array for direct chats
  if (this.type === "direct") {
    this.participants = this.participants.filter(
      (id) => id.toString() !== userId.toString()
    );
  }

  return this.save();
};

// Update member's last seen
chatSchema.methods.updateLastSeen = function (userId) {
  const member = this.getMember(userId);
  if (member) {
    member.lastSeenAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Update last message info
chatSchema.methods.updateLastMessage = function (message) {
  this.lastMessage = {
    messageId: message._id,
    content: message.content ? message.content.substring(0, 200) : "",
    type: message.type,
    senderId: message.senderId,
    senderName: message.senderName,
    timestamp: message.createdAt || new Date(),
  };
  this.messageCount += 1;
  return this.save();
};

// Archive chat
chatSchema.methods.archive = function () {
  this.status = "archived";
  return this.save();
};

// Restore archived chat
chatSchema.methods.restore = function () {
  this.status = "active";
  return this.save();
};

// Soft delete chat
chatSchema.methods.softDelete = function () {
  this.status = "deleted";
  this.deletedAt = new Date();
  return this.save();
};

// Static Methods

// Find active chats for user
chatSchema.statics.findActiveChatsForUser = function (userId) {
  return this.find({
    "members.userId": userId,
    "members.isActive": true,
    status: "active",
    deletedAt: null,
  }).sort({ "lastMessage.timestamp": -1 });
};

// Find direct chat between two users
chatSchema.statics.findDirectChat = function (userId1, userId2) {
  return this.findOne({
    type: "direct",
    participants: { $all: [userId1, userId2] },
    status: "active",
    deletedAt: null,
  });
};

// Create direct chat between two users
chatSchema.statics.createDirectChat = function (
  user1,
  user2,
  createdBy = null
) {
  return this.create({
    type: "direct",
    participants: [user1.userId, user2.userId],
    createdBy: createdBy || user1.userId,
    members: [
      {
        userId: user1.userId,
        firebaseUid: user1.firebaseUid,
        username: user1.username,
        displayName: user1.displayName,
        avatar: user1.avatar,
        role: "member",
      },
      {
        userId: user2.userId,
        firebaseUid: user2.firebaseUid,
        username: user2.username,
        displayName: user2.displayName,
        avatar: user2.avatar,
        role: "member",
      },
    ],
    status: "active",
  });
};

// Search chats by name
chatSchema.statics.searchChats = function (userId, query) {
  return this.find({
    "members.userId": userId,
    "members.isActive": true,
    status: "active",
    deletedAt: null,
    $or: [
      { name: { $regex: query, $options: "i" } },
      { "members.displayName": { $regex: query, $options: "i" } },
      { "members.username": { $regex: query, $options: "i" } },
    ],
  }).sort({ "lastMessage.timestamp": -1 });
};

// Pre-save middleware
chatSchema.pre("save", function (next) {
  // Ensure direct chats have exactly 2 participants
  if (this.type === "direct" && this.participants.length !== 2) {
    return next(new Error("Direct chats must have exactly 2 participants"));
  }

  // Ensure group chats have at least 2 members
  if (this.type === "group" && this.activeMembers.length < 2) {
    return next(new Error("Group chats must have at least 2 active members"));
  }

  // Set default name for direct chats
  if (this.type === "direct" && !this.name) {
    const activeMembers = this.activeMembers;
    if (activeMembers.length === 2) {
      this.name = `${activeMembers[0].displayName} & ${activeMembers[1].displayName}`;
    }
  }

  next();
});

module.exports = mongoose.model("Chat", chatSchema);
