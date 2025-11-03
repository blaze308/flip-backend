const mongoose = require("mongoose");

/**
 * GiftSender Schema for MongoDB
 * Aggregates gift totals per sender in a live stream (for leaderboard)
 */
const giftSenderSchema = new mongoose.Schema(
  {
    // Sender Information
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
    authorName: {
      type: String,
      required: true,
    },

    // Receiver Information
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: String,
      required: true,
      index: true,
    },

    // Live Stream Reference
    liveId: {
      type: String,
      required: true,
      index: true,
    },

    // Total Diamonds Sent
    diamonds: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
giftSenderSchema.index({ liveId: 1, diamonds: -1 });
giftSenderSchema.index({ liveId: 1, authorId: 1 }, { unique: true });
giftSenderSchema.index({ authorId: 1, receiverId: 1 });

// Method to add diamonds
giftSenderSchema.methods.addDiamonds = function (amount) {
  this.diamonds = (this.diamonds || 0) + amount;
};

// Static method to get or create gift sender
giftSenderSchema.statics.getOrCreate = async function (
  authorId,
  authorName,
  receiverId,
  liveId
) {
  let giftSender = await this.findOne({ liveId: liveId, authorId: authorId });

  if (!giftSender) {
    giftSender = await this.create({
      author: authorId,
      authorId: authorId,
      authorName: authorName,
      receiver: receiverId,
      receiverId: receiverId,
      liveId: liveId,
      diamonds: 0,
    });
  }

  return giftSender;
};

// Static method to get top senders in a live
giftSenderSchema.statics.getTopSenders = async function (liveId, limit = 3) {
  return this.find({ liveId: liveId })
    .sort({ diamonds: -1 })
    .limit(limit)
    .populate("author", "displayName photoURL username");
};

module.exports = mongoose.model("GiftSender", giftSenderSchema);

