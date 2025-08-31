const mongoose = require("mongoose");

/**
 * Comment Schema for MongoDB
 * Supports nested comments (replies) and user interactions
 */
const commentSchema = new mongoose.Schema(
  {
    // Basic Comment Information
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

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

    // Comment Content
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, "Comment content cannot exceed 2000 characters"],
    },

    // Reply System
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },

    repliesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Engagement Metrics
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

    // Moderation and Status
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Moderation Status
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "flagged"],
      default: "approved",
      index: true,
    },

    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    moderatedAt: {
      type: Date,
      default: null,
    },

    // Reporting System
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    reportedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        reason: {
          type: String,
          enum: [
            "spam",
            "harassment",
            "inappropriate",
            "misinformation",
            "other",
          ],
        },
        reportedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Metadata
    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    // Edit History
    editHistory: [
      {
        content: String,
        editedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    lastEditedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for Performance
commentSchema.index({ postId: 1, createdAt: -1 }); // Comments for a post, newest first
commentSchema.index({ userId: 1, createdAt: -1 }); // User's comments
commentSchema.index({ parentCommentId: 1, createdAt: 1 }); // Replies to a comment
commentSchema.index({ moderationStatus: 1, createdAt: -1 }); // Moderation queue
commentSchema.index({ isDeleted: 1, createdAt: -1 }); // Active comments
commentSchema.index({ firebaseUid: 1, postId: 1 }); // User's comments on specific post

// Virtual for checking if comment is a reply
commentSchema.virtual("isReply").get(function () {
  return this.parentCommentId != null;
});

// Virtual for checking if comment is top-level
commentSchema.virtual("isTopLevel").get(function () {
  return this.parentCommentId == null;
});

// Static Methods

/**
 * Find comments for a specific post
 */
commentSchema.statics.findByPost = function (postId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
    includeReplies = false,
    userId = null,
  } = options;

  const query = {
    postId: mongoose.Types.ObjectId(postId),
    isDeleted: false,
    moderationStatus: "approved",
  };

  // Only top-level comments unless includeReplies is true
  if (!includeReplies) {
    query.parentCommentId = null;
  }

  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  const aggregationPipeline = [
    { $match: query },
    { $sort: sort },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userId",
        pipeline: [
          {
            $project: {
              username: 1,
              profilePicture: 1,
              isVerified: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$userId" },
    {
      $addFields: {
        isLiked: userId
          ? {
              $in: [mongoose.Types.ObjectId(userId), "$likedBy"],
            }
          : false,
      },
    },
    {
      $project: {
        likedBy: 0, // Don't send the full likedBy array
        reportedBy: 0, // Don't send report details
        ipAddress: 0,
        userAgent: 0,
        editHistory: 0,
      },
    },
  ];

  return this.aggregate(aggregationPipeline);
};

/**
 * Find replies for a specific comment
 */
commentSchema.statics.findReplies = function (commentId, options = {}) {
  const { page = 1, limit = 10, userId = null } = options;

  const query = {
    parentCommentId: mongoose.Types.ObjectId(commentId),
    isDeleted: false,
    moderationStatus: "approved",
  };

  const aggregationPipeline = [
    { $match: query },
    { $sort: { createdAt: 1 } }, // Replies in chronological order
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userId",
        pipeline: [
          {
            $project: {
              username: 1,
              profilePicture: 1,
              isVerified: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$userId" },
    {
      $addFields: {
        isLiked: userId
          ? {
              $in: [mongoose.Types.ObjectId(userId), "$likedBy"],
            }
          : false,
      },
    },
    {
      $project: {
        likedBy: 0,
        reportedBy: 0,
        ipAddress: 0,
        userAgent: 0,
        editHistory: 0,
      },
    },
  ];

  return this.aggregate(aggregationPipeline);
};

/**
 * Get comment count for a post
 */
commentSchema.statics.getCommentCount = function (postId) {
  return this.countDocuments({
    postId: mongoose.Types.ObjectId(postId),
    isDeleted: false,
    moderationStatus: "approved",
  });
};

/**
 * Soft delete a comment
 */
commentSchema.methods.softDelete = function (deletedBy = null) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

/**
 * Like/Unlike a comment
 */
commentSchema.methods.toggleLike = function (userId) {
  const userObjectId = mongoose.Types.ObjectId(userId);
  const isLiked = this.likedBy.includes(userObjectId);

  if (isLiked) {
    // Unlike
    this.likedBy.pull(userObjectId);
    this.likes = Math.max(0, this.likes - 1);
  } else {
    // Like
    this.likedBy.push(userObjectId);
    this.likes += 1;
  }

  return this.save();
};

/**
 * Add a reply to this comment
 */
commentSchema.methods.addReply = function () {
  this.repliesCount += 1;
  return this.save();
};

/**
 * Remove a reply from this comment
 */
commentSchema.methods.removeReply = function () {
  this.repliesCount = Math.max(0, this.repliesCount - 1);
  return this.save();
};

// Pre-save middleware
commentSchema.pre("save", function (next) {
  // Update lastEditedAt if content was modified
  if (this.isModified("content") && !this.isNew) {
    this.lastEditedAt = new Date();

    // Add to edit history
    if (
      this.content !== this.editHistory[this.editHistory.length - 1]?.content
    ) {
      this.editHistory.push({
        content: this.content,
        editedAt: new Date(),
      });
    }
  }

  next();
});

// Post-save middleware to update post comment count
commentSchema.post("save", async function (doc) {
  if (doc.isNew && !doc.isDeleted) {
    // New comment created, increment post comment count
    await mongoose.model("Post").findByIdAndUpdate(doc.postId, {
      $inc: { comments: 1 },
    });

    // If it's a reply, increment parent comment reply count
    if (doc.parentCommentId) {
      await mongoose.model("Comment").findByIdAndUpdate(doc.parentCommentId, {
        $inc: { repliesCount: 1 },
      });
    }
  }
});

// Post-save middleware for soft delete
commentSchema.post("save", async function (doc) {
  if (doc.isModified("isDeleted") && doc.isDeleted) {
    // Comment was soft deleted, decrement post comment count
    await mongoose.model("Post").findByIdAndUpdate(doc.postId, {
      $inc: { comments: -1 },
    });

    // If it's a reply, decrement parent comment reply count
    if (doc.parentCommentId) {
      await mongoose.model("Comment").findByIdAndUpdate(doc.parentCommentId, {
        $inc: { repliesCount: -1 },
      });
    }
  }
});

const Comment = mongoose.model("Comment", commentSchema);

module.exports = Comment;
