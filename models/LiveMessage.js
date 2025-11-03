const mongoose = require("mongoose");

/**
 * LiveMessage Schema for MongoDB
 * Handles all messages in live streams: comments, gifts, system messages, etc.
 */
const liveMessageSchema = new mongoose.Schema(
  {
    // Author Information
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorId: {
      type: String,
      required: true,
      index: true,
    },

    // Live Stream Reference
    liveStream: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveStream",
      required: true,
      index: true,
    },
    liveStreamId: {
      type: String,
      required: true,
      index: true,
    },

    // Message Content
    message: {
      type: String,
      default: "",
    },

    // Message Type
    messageType: {
      type: String,
      enum: [
        "COMMENT",
        "FOLLOW",
        "GIFT",
        "SYSTEM",
        "JOIN",
        "HOST",
        "LEAVE",
        "REMOVED",
        "PLATFORM",
      ],
      required: true,
      index: true,
    },

    // Gift Information (if messageType is GIFT)
    giftLive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftSent",
    },
    giftLiveId: {
      type: String,
    },
    giftId: {
      type: String,
    },

    // Co-Host Information (if messageType is HOST)
    coHostAvailable: {
      type: Boolean,
      default: false,
    },
    coHostAuthor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    coHostAuthorUid: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
liveMessageSchema.index({ liveStreamId: 1, createdAt: -1 });
liveMessageSchema.index({ liveStreamId: 1, messageType: 1 });
liveMessageSchema.index({ authorId: 1, liveStreamId: 1 });

// Static method to create a comment
liveMessageSchema.statics.createComment = function (
  authorId,
  liveStreamId,
  message
) {
  return this.create({
    author: authorId,
    authorId: authorId,
    liveStream: liveStreamId,
    liveStreamId: liveStreamId,
    message: message,
    messageType: "COMMENT",
  });
};

// Static method to create a gift message
liveMessageSchema.statics.createGiftMessage = function (
  authorId,
  liveStreamId,
  giftSentId,
  giftId
) {
  return this.create({
    author: authorId,
    authorId: authorId,
    liveStream: liveStreamId,
    liveStreamId: liveStreamId,
    messageType: "GIFT",
    giftLive: giftSentId,
    giftLiveId: giftSentId,
    giftId: giftId,
  });
};

// Static method to create a system message
liveMessageSchema.statics.createSystemMessage = function (
  authorId,
  liveStreamId,
  message
) {
  return this.create({
    author: authorId,
    authorId: authorId,
    liveStream: liveStreamId,
    liveStreamId: liveStreamId,
    message: message,
    messageType: "SYSTEM",
  });
};

module.exports = mongoose.model("LiveMessage", liveMessageSchema);

