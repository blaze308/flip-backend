const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Message Schema for MongoDB
 * Supports text, audio, images, lottie, svga files, and other media types
 */

// Message Type Enum
const MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "lottie",
  "svga",
  "file",
  "location",
  "contact",
  "system", // For system messages like "User joined", "User left", etc.
];

// Message Status Enum
const MESSAGE_STATUS = ["sent", "delivered", "read", "failed"];

// Message Reaction Schema
const messageReactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    emoji: {
      type: String,
      required: true,
      maxlength: 10, // Support for emoji sequences
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Message Media Schema
const messageMediaSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      validate: {
        validator: function (url) {
          return /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid media URL",
      },
    },
    thumbnailUrl: {
      type: String,
      validate: {
        validator: function (url) {
          if (!url) return true;
          return /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid thumbnail URL",
      },
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number, // in bytes
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
    },
    duration: {
      type: Number, // Duration in seconds for audio/video
      min: 0,
    },
    dimensions: {
      width: {
        type: Number,
        min: 0,
      },
      height: {
        type: Number,
        min: 0,
      },
    },
    // For lottie animations
    lottieData: {
      type: Schema.Types.Mixed, // JSON data for lottie animations
    },
    // For SVGA animations
    svgaData: {
      type: Schema.Types.Mixed, // SVGA specific data
    },
  },
  { _id: false }
);

// Message Location Schema
const messageLocationSchema = new Schema(
  {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    address: {
      type: String,
      maxlength: 200,
    },
    name: {
      type: String,
      maxlength: 100,
    },
  },
  { _id: false }
);

// Message Contact Schema
const messageContactSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    phoneNumber: {
      type: String,
      maxlength: 20,
    },
    email: {
      type: String,
      maxlength: 100,
    },
    avatar: {
      type: String,
    },
  },
  { _id: false }
);

// Reply/Forward Reference Schema
const messageReferenceSchema = new Schema(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderName: {
      type: String,
      required: false, // Not required - can fetch from senderId
    },
    content: {
      type: String,
      maxlength: 200, // Truncated content for preview
    },
    type: {
      type: String,
      enum: MESSAGE_TYPES,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

// Main Message Schema
const messageSchema = new Schema(
  {
    // Basic Message Information
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    senderFirebaseUid: {
      type: String,
      required: true,
      index: true,
    },

    senderName: {
      type: String,
      required: false, // Not required - can fetch from senderId
      default: null,
    },

    senderAvatar: {
      type: String,
      default: null,
    },

    // Message Type and Content
    type: {
      type: String,
      enum: MESSAGE_TYPES,
      required: true,
      index: true,
    },

    // Text content (for text messages and captions)
    content: {
      type: String,
      trim: true,
      maxlength: [4000, "Message content cannot exceed 4000 characters"],
      required: function () {
        return this.type === "text" || this.type === "system";
      },
    },

    // Media content (for non-text messages)
    media: {
      type: messageMediaSchema,
      required: function () {
        return ["image", "video", "audio", "lottie", "svga", "file"].includes(
          this.type
        );
      },
    },

    // Location data (for location messages)
    location: {
      type: messageLocationSchema,
      required: function () {
        return this.type === "location";
      },
    },

    // Contact data (for contact messages)
    contact: {
      type: messageContactSchema,
      required: function () {
        return this.type === "contact";
      },
    },

    // Message Status
    status: {
      type: String,
      enum: MESSAGE_STATUS,
      default: "sent",
      index: true,
    },

    // Message Reactions
    reactions: [messageReactionSchema],

    // Reply/Forward Reference
    replyTo: {
      type: messageReferenceSchema,
      default: null,
    },

    forwardedFrom: {
      type: messageReferenceSchema,
      default: null,
    },

    // Message Metadata
    mentions: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        username: {
          type: String,
          required: true,
        },
        startIndex: {
          type: Number,
          required: true,
        },
        length: {
          type: Number,
          required: true,
        },
      },
    ],

    // Message Threading (for group chats)
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    // Read Receipts
    readBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        username: {
          type: String,
          required: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Delivery Receipts
    deliveredTo: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        username: {
          type: String,
          required: true,
        },
        deliveredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Message Flags
    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ], // Users who have deleted this message for themselves

    // System Message Data (for system messages)
    systemData: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Message Priority (for important messages)
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },

    // Auto-delete timestamp (if chat has auto-delete enabled)
    expiresAt: {
      type: Date,
      default: null,
    },

    // Message Analytics
    analytics: {
      views: {
        type: Number,
        default: 0,
      },
      clicks: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ type: 1, createdAt: -1 });
messageSchema.index({ status: 1, createdAt: -1 });
messageSchema.index({ threadId: 1, createdAt: 1 });
messageSchema.index({ expiresAt: 1 });
messageSchema.index({ isDeleted: 1, createdAt: -1 });

// Compound indexes for common queries
messageSchema.index({ chatId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, type: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, type: 1, createdAt: -1 });

// Text index for message search
messageSchema.index({ content: "text", "media.fileName": "text" });

// Virtual for reaction count
messageSchema.virtual("reactionCount").get(function () {
  return this.reactions.length;
});

// Virtual for read count
messageSchema.virtual("readCount").get(function () {
  return this.readBy.length;
});

// Virtual for delivery count
messageSchema.virtual("deliveryCount").get(function () {
  return this.deliveredTo.length;
});

// Virtual for time ago
messageSchema.virtual("timeAgo").get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "now";
});

// Virtual for formatted file size
messageSchema.virtual("formattedFileSize").get(function () {
  if (!this.media || !this.media.fileSize) return "";

  const bytes = this.media.fileSize;
  const sizes = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
});

// Instance Methods

// Check if message is read by user
messageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some(
    (read) => read.userId.toString() === userId.toString()
  );
};

// Check if message is delivered to user
messageSchema.methods.isDeliveredTo = function (userId) {
  return this.deliveredTo.some(
    (delivery) => delivery.userId.toString() === userId.toString()
  );
};

// Mark message as read by user
messageSchema.methods.markAsRead = function (userId, username) {
  if (!this.isReadBy(userId)) {
    this.readBy.push({
      userId,
      username,
      readAt: new Date(),
    });

    // Update status if not already read
    if (this.status !== "read") {
      this.status = "read";
    }
  }
  return this.save();
};

// Mark message as delivered to user
messageSchema.methods.markAsDelivered = function (userId, username) {
  if (!this.isDeliveredTo(userId)) {
    this.deliveredTo.push({
      userId,
      username,
      deliveredAt: new Date(),
    });

    // Update status if still sent
    if (this.status === "sent") {
      this.status = "delivered";
    }
  }
  return this.save();
};

// Add reaction to message
messageSchema.methods.addReaction = function (userId, username, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );

  // Add new reaction
  this.reactions.push({
    userId,
    username,
    emoji,
    createdAt: new Date(),
  });

  return this.save();
};

// Remove reaction from message
messageSchema.methods.removeReaction = function (userId) {
  this.reactions = this.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Edit message content
messageSchema.methods.editContent = function (newContent) {
  if (this.type !== "text") {
    throw new Error("Only text messages can be edited");
  }

  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Delete message for everyone
messageSchema.methods.deleteForEveryone = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = "This message was deleted";
  return this.save();
};

// Delete message for specific user
messageSchema.methods.deleteForUser = function (userId) {
  if (!this.deletedFor.includes(userId)) {
    this.deletedFor.push(userId);
  }
  return this.save();
};

// Check if message is deleted for user
messageSchema.methods.isDeletedForUser = function (userId) {
  return this.deletedFor.includes(userId) || this.isDeleted;
};

// Get grouped reactions
messageSchema.methods.getGroupedReactions = function () {
  const grouped = {};

  this.reactions.forEach((reaction) => {
    if (!grouped[reaction.emoji]) {
      grouped[reaction.emoji] = [];
    }
    grouped[reaction.emoji].push(reaction);
  });

  return grouped;
};

// Static Methods

// Find messages in chat
messageSchema.statics.findInChat = function (chatId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    before = null,
    after = null,
    type = null,
    userId = null,
  } = options;

  let query = {
    chatId,
    isDeleted: false,
  };

  // Add user-specific deletion filter
  if (userId) {
    query.deletedFor = { $ne: userId };
  }

  // Add time filters
  if (before) {
    query.createdAt = { ...query.createdAt, $lt: before };
  }
  if (after) {
    query.createdAt = { ...query.createdAt, $gt: after };
  }

  // Add type filter
  if (type) {
    query.type = type;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate("senderId", "displayName photoURL username")
    .populate("replyTo.senderId", "displayName username")
    .populate("forwardedFrom.senderId", "displayName username");
};

// Search messages in chat
messageSchema.statics.searchInChat = function (
  chatId,
  searchQuery,
  userId = null
) {
  let query = {
    chatId,
    isDeleted: false,
    $text: { $search: searchQuery },
  };

  // Add user-specific deletion filter
  if (userId) {
    query.deletedFor = { $ne: userId };
  }

  return this.find(query, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" }, createdAt: -1 })
    .populate("senderId", "displayName photoURL username");
};

// Get unread messages count for user in chat
messageSchema.statics.getUnreadCount = function (chatId, userId) {
  return this.countDocuments({
    chatId,
    isDeleted: false,
    deletedFor: { $ne: userId },
    senderId: { $ne: userId }, // Don't count own messages
    "readBy.userId": { $ne: userId },
  });
};

// Get media messages in chat
messageSchema.statics.getMediaMessages = function (
  chatId,
  mediaTypes = ["image", "video"],
  userId = null
) {
  let query = {
    chatId,
    type: { $in: mediaTypes },
    isDeleted: false,
  };

  // Add user-specific deletion filter
  if (userId) {
    query.deletedFor = { $ne: userId };
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .populate("senderId", "displayName photoURL username");
};

// Clean up expired messages
messageSchema.statics.cleanupExpiredMessages = function () {
  return this.updateMany(
    { expiresAt: { $lt: new Date() } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        content: "This message has expired",
      },
    }
  );
};

// Pre-save middleware
messageSchema.pre("save", function (next) {
  // Validate message type specific requirements
  if (
    this.type === "text" &&
    (!this.content || this.content.trim().length === 0)
  ) {
    return next(new Error("Text messages must have content"));
  }

  if (
    ["image", "video", "audio", "lottie", "svga", "file"].includes(this.type) &&
    !this.media
  ) {
    return next(new Error(`${this.type} messages must have media data`));
  }

  if (this.type === "location" && !this.location) {
    return next(new Error("Location messages must have location data"));
  }

  if (this.type === "contact" && !this.contact) {
    return next(new Error("Contact messages must have contact data"));
  }

  // Set expiration time if chat has auto-delete enabled
  if (this.isNew && !this.expiresAt) {
    // This would be set based on chat settings
    // For now, we'll leave it null and set it in the route handler
  }

  next();
});

// Pre-find middleware to exclude deleted messages by default
messageSchema.pre(/^find/, function () {
  // Only apply this filter if not explicitly querying for deleted messages
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
});

module.exports = mongoose.model("Message", messageSchema);
