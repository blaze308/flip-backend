const mongoose = require("mongoose");
const { Schema } = mongoose;

// Story Media Type Enum
const STORY_MEDIA_TYPES = ["text", "image", "video", "audio"];

// Story Reaction Type Enum
const STORY_REACTION_TYPES = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
  "fire",
  "clap",
];

// Story Privacy Enum
const STORY_PRIVACY_TYPES = ["public", "friends", "closeFriends", "custom"];

// Text Story Style Schema
const textStoryStyleSchema = new Schema(
  {
    backgroundColor: {
      type: Number,
      default: 0xff000000, // Black
    },
    textColor: {
      type: Number,
      default: 0xffffffff, // White
    },
    fontFamily: {
      type: String,
      default: "Roboto",
    },
    fontSize: {
      type: Number,
      default: 24.0,
    },
    fontWeight: {
      type: Number,
      default: 4, // FontWeight.normal index
    },
    textAlign: {
      type: Number,
      default: 1, // TextAlign.center index
    },
    backgroundGradient: {
      type: String, // JSON string for gradient colors
      default: null,
    },
    backgroundImage: {
      type: String, // URL for background image
      default: null,
    },
  },
  { _id: false }
);

// Story Reaction Schema
const storyReactionSchema = new Schema(
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
    userAvatar: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: STORY_REACTION_TYPES,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Story Viewer Schema
const storyViewerSchema = new Schema(
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
    userAvatar: {
      type: String,
      default: null,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Main Story Schema
const storySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    userAvatar: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: STORY_MEDIA_TYPES,
      required: true,
    },
    mediaUrl: {
      type: String,
      required: function () {
        return this.mediaType !== "text";
      },
    },
    thumbnailUrl: {
      type: String,
      default: null, // For videos
    },
    textContent: {
      type: String,
      required: function () {
        return this.mediaType === "text";
      },
      maxlength: 500,
    },
    textStyle: {
      type: textStoryStyleSchema,
      default: null,
    },
    duration: {
      type: Number, // Duration in milliseconds
      default: null,
    },
    caption: {
      type: String,
      maxlength: 200,
      default: null,
    },
    mentions: [
      {
        type: String, // @username mentions
      },
    ],
    hashtags: [
      {
        type: String, // #hashtag tags
      },
    ],
    privacy: {
      type: String,
      enum: STORY_PRIVACY_TYPES,
      default: "public",
    },
    customViewers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    viewers: [storyViewerSchema],
    reactions: [storyReactionSchema],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      },
      index: false, // Disable auto-index; we use compound index instead
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    allowReplies: {
      type: Boolean,
      default: true,
    },
    allowReactions: {
      type: Boolean,
      default: true,
    },
    allowScreenshot: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: Schema.Types.Mixed, // Additional flexible data
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ isActive: 1, expiresAt: 1 }); // Compound index covers both queries
storySchema.index({ "viewers.userId": 1 });
storySchema.index({ "reactions.userId": 1 });

// Virtual for checking if story is expired
storySchema.virtual("isExpired").get(function () {
  return new Date() > this.expiresAt;
});

// Virtual for checking if story is active and valid
storySchema.virtual("isActiveAndValid").get(function () {
  return this.isActive && !this.isExpired;
});

// Virtual for view count
storySchema.virtual("viewCount").get(function () {
  return this.viewers.length;
});

// Virtual for reaction count
storySchema.virtual("reactionCount").get(function () {
  return this.reactions.length;
});

// Virtual for time ago
storySchema.virtual("timeAgo").get(function () {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return "Just now";
  }
});

// Virtual for formatted duration
storySchema.virtual("formattedDuration").get(function () {
  if (!this.duration) return "";

  const minutes = Math.floor(this.duration / 60000);
  const seconds = Math.floor((this.duration % 60000) / 1000);
  return `${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
});

// Instance Methods

// Check if user has viewed this story
storySchema.methods.hasViewedBy = function (userId) {
  return this.viewers.some(
    (viewer) => viewer.userId.toString() === userId.toString()
  );
};

// Check if user has reacted to this story
storySchema.methods.hasReactedBy = function (userId) {
  return this.reactions.some(
    (reaction) => reaction.userId.toString() === userId.toString()
  );
};

// Get reaction by user
storySchema.methods.getReactionBy = function (userId) {
  return this.reactions.find(
    (reaction) => reaction.userId.toString() === userId.toString()
  );
};

// Add viewer to story
storySchema.methods.addViewer = function (userId, username, userAvatar = null) {
  // Check if user already viewed
  if (!this.hasViewedBy(userId)) {
    this.viewers.push({
      userId,
      username,
      userAvatar,
      viewedAt: new Date(),
    });
  }
  return this.save();
};

// Add or update reaction
storySchema.methods.addReaction = function (
  userId,
  username,
  reactionType,
  userAvatar = null
) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );

  // Add new reaction
  this.reactions.push({
    userId,
    username,
    userAvatar,
    type: reactionType,
    createdAt: new Date(),
  });

  return this.save();
};

// Remove reaction
storySchema.methods.removeReaction = function (userId) {
  this.reactions = this.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Check if user can view this story based on privacy settings
storySchema.methods.canBeViewedBy = function (
  userId,
  userFriends = [],
  userCloseFriends = []
) {
  switch (this.privacy) {
    case "public":
      return true;
    case "friends":
      return userFriends.includes(this.userId.toString());
    case "closeFriends":
      return userCloseFriends.includes(this.userId.toString());
    case "custom":
      return this.customViewers.some(
        (viewerId) => viewerId.toString() === userId.toString()
      );
    default:
      return false;
  }
};

// Get grouped reactions by type
storySchema.methods.getGroupedReactions = function () {
  const grouped = {};

  this.reactions.forEach((reaction) => {
    if (!grouped[reaction.type]) {
      grouped[reaction.type] = [];
    }
    grouped[reaction.type].push(reaction);
  });

  return grouped;
};

// Static Methods

// Get active stories for a user
storySchema.statics.getActiveStoriesForUser = function (userId) {
  return this.find({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

// Get stories feed for user (based on following/friends)
storySchema.statics.getStoriesFeed = function (
  userId,
  followingIds = [],
  friendIds = []
) {
  const viewableUserIds = [userId, ...followingIds, ...friendIds];

  return this.aggregate([
    {
      $match: {
        userId: {
          $in: viewableUserIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
        isActive: true,
        expiresAt: { $gt: new Date() },
      },
    },
    {
      $group: {
        _id: "$userId",
        username: { $first: "$username" },
        userAvatar: { $first: "$userAvatar" },
        stories: { $push: "$$ROOT" },
        lastStoryTime: { $max: "$createdAt" },
        hasUnviewedStories: {
          $sum: {
            $cond: [
              {
                $not: {
                  $in: [new mongoose.Types.ObjectId(userId), "$viewers.userId"],
                },
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $sort: { hasUnviewedStories: -1, lastStoryTime: -1 },
    },
  ]);
};

// Clean up expired stories
storySchema.statics.cleanupExpiredStories = function () {
  return this.updateMany(
    { expiresAt: { $lt: new Date() } },
    { $set: { isActive: false } }
  );
};

// Get story analytics for user
storySchema.statics.getStoryAnalytics = function (userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalStories: { $sum: 1 },
        totalViews: { $sum: { $size: "$viewers" } },
        totalReactions: { $sum: { $size: "$reactions" } },
        avgViewsPerStory: { $avg: { $size: "$viewers" } },
        avgReactionsPerStory: { $avg: { $size: "$reactions" } },
        mediaTypeBreakdown: {
          $push: {
            mediaType: "$mediaType",
            views: { $size: "$viewers" },
            reactions: { $size: "$reactions" },
          },
        },
      },
    },
  ]);
};

// Middleware

// Pre-save middleware to validate data
storySchema.pre("save", function (next) {
  // Ensure text stories have text content
  if (this.mediaType === "text" && !this.textContent) {
    return next(new Error("Text stories must have text content"));
  }

  // Ensure non-text stories have media URL
  if (this.mediaType !== "text" && !this.mediaUrl) {
    return next(new Error("Media stories must have a media URL"));
  }

  // Validate mentions format
  this.mentions = this.mentions.map((mention) =>
    mention.startsWith("@") ? mention : `@${mention}`
  );

  // Validate hashtags format
  this.hashtags = this.hashtags.map((hashtag) =>
    hashtag.startsWith("#") ? hashtag : `#${hashtag}`
  );

  next();
});

// Pre-find middleware to exclude expired stories by default
storySchema.pre(/^find/, function () {
  // Only apply this filter if not explicitly querying for expired stories
  if (!this.getQuery().expiresAt && !this.getQuery().isActive === false) {
    this.where({
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
  }
});

// Create and export the model
const Story = mongoose.model("Story", storySchema);

module.exports = Story;
