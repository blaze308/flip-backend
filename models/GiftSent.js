const mongoose = require("mongoose");

/**
 * GiftSent Schema for MongoDB
 * Tracks individual gift transactions
 */
const giftSentSchema = new mongoose.Schema(
  {
    // Sender Information
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorId: {
      type: String,
      required: true,
      index: true,
    },

    // Receiver Information
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: String,
      required: true,
      index: true,
    },

    // Gift Information
    gift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
      required: true,
    },
    giftId: {
      type: String,
      required: true,
    },

    // Transaction Details
    diamondsQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    // Context (where was the gift sent)
    context: {
      type: String,
      enum: ["live", "profile", "chat", "post"],
      default: "live",
    },

    // Live Stream Reference (if sent in live)
    liveStream: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveStream",
    },
    liveStreamId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
giftSentSchema.index({ authorId: 1, createdAt: -1 });
giftSentSchema.index({ receiverId: 1, createdAt: -1 });
giftSentSchema.index({ liveStreamId: 1, createdAt: -1 });
giftSentSchema.index({ authorId: 1, receiverId: 1 });

// Static method to get total gifts sent by user
giftSentSchema.statics.getTotalSentByUser = async function (userId) {
  const result = await this.aggregate([
    { $match: { authorId: userId } },
    { $group: { _id: null, total: { $sum: "$diamondsQuantity" } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
};

// Static method to get total gifts received by user
giftSentSchema.statics.getTotalReceivedByUser = async function (userId) {
  const result = await this.aggregate([
    { $match: { receiverId: userId } },
    { $group: { _id: null, total: { $sum: "$diamondsQuantity" } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
};

// Static method to get top gifters in a live stream
giftSentSchema.statics.getTopGiftersInLive = async function (
  liveStreamId,
  limit = 10
) {
  return this.aggregate([
    { $match: { liveStreamId: liveStreamId } },
    {
      $group: {
        _id: "$authorId",
        author: { $first: "$author" },
        totalDiamonds: { $sum: "$diamondsQuantity" },
        giftCount: { $sum: 1 },
      },
    },
    { $sort: { totalDiamonds: -1 } },
    { $limit: limit },
  ]);
};

module.exports = mongoose.model("GiftSent", giftSentSchema);

