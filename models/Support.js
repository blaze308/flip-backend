const mongoose = require("mongoose");

/**
 * Support Schema
 * Feedback, reports, contact us submissions
 */
const supportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["feedback", "report", "contact"],
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // For reports
    reportTargetType: {
      type: String,
      enum: ["user", "post", "comment", "story", "chat"],
    },
    reportTargetId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    reportReason: {
      type: String,
      trim: true,
    },
    // Contact info for unauthenticated contact
    email: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved"],
      default: "pending",
    },
  },
  { timestamps: true }
);

supportSchema.index({ type: 1, createdAt: -1 });
supportSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model("Support", supportSchema);
