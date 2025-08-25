const mongoose = require("mongoose");

/**
 * Comment Schema for post comments
 */
const commentSchema = new mongoose.Schema(
  {
    // Post reference
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

    // User who created the comment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    firebaseUid: {
      type: String,
      required: true,
      index: true,
    },

    // Comment content
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },

    // Parent comment for replies (optional)
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },

    // Engagement metrics
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },

    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Reply count for parent comments
    replyCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Status flags
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    // Moderation
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "flagged"],
      default: "approved",
      index: true,
    },

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
commentSchema.index({ postId: 1, createdAt: -1 });
commentSchema.index({ userId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });
commentSchema.index({ isActive: 1, moderationStatus: 1, deletedAt: 1 });

// Virtual for formatted time ago
commentSchema.virtual("timeAgo").get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return this.createdAt.toLocaleDateString();
});

// Static method to find comments for a post
commentSchema.statics.findByPost = function (postId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = -1,
    includeReplies = false,
  } = options;

  const query = {
    postId,
    isActive: true,
    moderationStatus: "approved",
    deletedAt: null,
  };

  // Only get top-level comments unless includeReplies is true
  if (!includeReplies) {
    query.parentCommentId = null;
  }

  return this.find(query)
    .populate(
      "userId",
      "displayName photoURL profile.firstName profile.lastName profile.username"
    )
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to find replies for a comment
commentSchema.statics.findReplies = function (parentCommentId, options = {}) {
  const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = 1 } = options;

  return this.find({
    parentCommentId,
    isActive: true,
    moderationStatus: "approved",
    deletedAt: null,
  })
    .populate(
      "userId",
      "displayName photoURL profile.firstName profile.lastName profile.username"
    )
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Instance method to check if user liked the comment
commentSchema.methods.isLikedBy = function (userId) {
  return this.likedBy.includes(userId);
};

// Instance method to toggle like
commentSchema.methods.toggleLike = async function (userId) {
  const isLiked = this.isLikedBy(userId);

  if (isLiked) {
    this.likedBy.pull(userId);
    this.likes = Math.max(0, this.likes - 1);
  } else {
    this.likedBy.push(userId);
    this.likes += 1;
  }

  await this.save();
  return !isLiked;
};

// Pre-save middleware to update reply count on parent
commentSchema.pre("save", async function (next) {
  if (this.isNew && this.parentCommentId) {
    await this.constructor.findByIdAndUpdate(this.parentCommentId, {
      $inc: { replyCount: 1 },
    });
  }
  next();
});

// Pre-remove middleware to update reply count on parent
commentSchema.pre("deleteOne", { document: true }, async function (next) {
  if (this.parentCommentId) {
    await this.constructor.findByIdAndUpdate(this.parentCommentId, {
      $inc: { replyCount: -1 },
    });
  }
  next();
});

// Soft delete method
commentSchema.methods.softDelete = async function (deletedBy) {
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.isActive = false;

  // Update reply count on parent if this is a reply
  if (this.parentCommentId) {
    await this.constructor.findByIdAndUpdate(this.parentCommentId, {
      $inc: { replyCount: -1 },
    });
  }

  await this.save();
};

module.exports = mongoose.model("Comment", commentSchema);
