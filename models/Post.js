const mongoose = require("mongoose");

/**
 * Post Schema for MongoDB
 * Supports text, image, and video posts with rich metadata
 */
const postSchema = new mongoose.Schema(
  {
    // Basic Post Information
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

    // Post Type and Content
    type: {
      type: String,
      enum: ["text", "image", "video"],
      required: true,
      index: true,
    },

    content: {
      type: String,
      trim: true,
      maxlength: [2000, "Post content cannot exceed 2000 characters"],
    },

    // Media URLs
    imageUrls: [
      {
        type: String,
        validate: {
          validator: function (url) {
            return /^https?:\/\/.+/.test(url);
          },
          message: "Please provide valid image URLs",
        },
      },
    ],

    videoUrl: {
      type: String,
      validate: {
        validator: function (url) {
          if (!url) return true;
          return /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid video URL",
      },
    },

    videoThumbnail: {
      type: String,
      validate: {
        validator: function (url) {
          if (!url) return true;
          return /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid thumbnail URL",
      },
    },

    // Video-specific metadata
    videoDuration: {
      type: Number, // Duration in seconds
      min: [0, "Video duration cannot be negative"],
    },

    // Text Post Styling (for text posts)
    textStyle: {
      backgroundColor: {
        type: String,
        validate: {
          validator: function (color) {
            if (!color) return true;
            return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
          },
          message: "Background color must be a valid hex color",
        },
      },
      textColor: {
        type: String,
        validate: {
          validator: function (color) {
            if (!color) return true;
            return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
          },
          message: "Text color must be a valid hex color",
        },
      },
      fontFamily: {
        type: String,
        maxlength: [50, "Font family name cannot exceed 50 characters"],
      },
      fontSize: {
        type: Number,
        min: [8, "Font size cannot be less than 8"],
        max: [72, "Font size cannot exceed 72"],
      },
      fontWeight: {
        type: String,
        enum: [
          "normal",
          "bold",
          "100",
          "200",
          "300",
          "400",
          "500",
          "600",
          "700",
          "800",
          "900",
        ],
      },
      textAlign: {
        type: String,
        enum: ["left", "center", "right", "justify"],
        default: "left",
      },
    },

    // Engagement Metrics
    likes: {
      type: Number,
      default: 0,
      min: [0, "Likes cannot be negative"],
    },

    comments: {
      type: Number,
      default: 0,
      min: [0, "Comments cannot be negative"],
    },

    shares: {
      type: Number,
      default: 0,
      min: [0, "Shares cannot be negative"],
    },

    views: {
      type: Number,
      default: 0,
      min: [0, "Views cannot be negative"],
    },

    // User Interactions
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Content Metadata
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [30, "Tag cannot exceed 30 characters"],
      },
    ],

    mentions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        username: {
          type: String,
          required: true,
        },
      },
    ],

    location: {
      name: {
        type: String,
        trim: true,
        maxlength: [100, "Location name cannot exceed 100 characters"],
      },
      coordinates: {
        latitude: {
          type: Number,
          min: [-90, "Latitude must be between -90 and 90"],
          max: [90, "Latitude must be between -90 and 90"],
        },
        longitude: {
          type: Number,
          min: [-180, "Longitude must be between -180 and 180"],
          max: [180, "Longitude must be between -180 and 180"],
        },
      },
    },

    // Post Status and Visibility
    isActive: {
      type: Boolean,
      default: true,
    },

    isPublic: {
      type: Boolean,
      default: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    // Content Moderation
    isReported: {
      type: Boolean,
      default: false,
    },

    reportCount: {
      type: Number,
      default: 0,
      min: [0, "Report count cannot be negative"],
    },

    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "flagged"],
      default: "approved",
    },

    // Analytics
    analytics: {
      impressions: {
        type: Number,
        default: 0,
      },
      reach: {
        type: Number,
        default: 0,
      },
      engagement: {
        type: Number,
        default: 0,
      },
      clickThroughRate: {
        type: Number,
        default: 0,
      },
    },

    // Soft Delete
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: {
      transform: function (doc, ret) {
        // Remove sensitive fields when converting to JSON
        delete ret.__v;
        delete ret.deletedAt;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ firebaseUid: 1, createdAt: -1 });
postSchema.index({ type: 1, createdAt: -1 });
postSchema.index({ isActive: 1, isPublic: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ "location.coordinates": "2dsphere" }); // For geospatial queries
postSchema.index({ moderationStatus: 1, createdAt: -1 });

// Compound indexes for common queries
postSchema.index({ userId: 1, type: 1, createdAt: -1 });
postSchema.index({
  isActive: 1,
  isPublic: 1,
  moderationStatus: 1,
  createdAt: -1,
});

// Virtual for engagement rate
postSchema.virtual("engagementRate").get(function () {
  if (this.views === 0) return 0;
  return ((this.likes + this.comments + this.shares) / this.views) * 100;
});

// Virtual for time ago
postSchema.virtual("timeAgo").get(function () {
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

// Pre-save middleware
postSchema.pre("save", function (next) {
  // Validate post type specific requirements
  if (
    this.type === "image" &&
    (!this.imageUrls || this.imageUrls.length === 0)
  ) {
    return next(new Error("Image posts must have at least one image URL"));
  }

  if (this.type === "video" && !this.videoUrl) {
    return next(new Error("Video posts must have a video URL"));
  }

  if (
    this.type === "text" &&
    (!this.content || this.content.trim().length === 0)
  ) {
    return next(new Error("Text posts must have content"));
  }

  // Clean up tags
  if (this.tags) {
    this.tags = this.tags
      .filter((tag) => tag && tag.trim().length > 0)
      .map((tag) => tag.trim().toLowerCase())
      .slice(0, 10); // Limit to 10 tags

    // Remove duplicates
    this.tags = [...new Set(this.tags)];
  }

  next();
});

// Instance methods
postSchema.methods.like = function (userId) {
  if (!this.likedBy.includes(userId)) {
    this.likedBy.push(userId);
    this.likes += 1;
  }
  return this.save();
};

postSchema.methods.unlike = function (userId) {
  const index = this.likedBy.indexOf(userId);
  if (index > -1) {
    this.likedBy.splice(index, 1);
    this.likes = Math.max(0, this.likes - 1);
  }
  return this.save();
};

postSchema.methods.incrementViews = function () {
  this.views += 1;
  this.analytics.impressions += 1;
  return this.save();
};

postSchema.methods.incrementShares = function () {
  this.shares += 1;
  this.analytics.engagement += 1;
  return this.save();
};

postSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

postSchema.methods.restore = function () {
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

// Static methods
postSchema.statics.findActive = function () {
  return this.find({
    isActive: true,
    deletedAt: null,
    moderationStatus: { $in: ["approved", "pending"] },
  });
};

postSchema.statics.findPublic = function () {
  return this.find({
    isActive: true,
    isPublic: true,
    deletedAt: null,
    moderationStatus: "approved",
  });
};

postSchema.statics.findByUser = function (userId) {
  return this.find({
    userId,
    isActive: true,
    deletedAt: null,
  }).sort({ createdAt: -1 });
};

postSchema.statics.findByFirebaseUid = function (firebaseUid) {
  return this.find({
    firebaseUid,
    isActive: true,
    deletedAt: null,
  }).sort({ createdAt: -1 });
};

postSchema.statics.findByType = function (type) {
  return this.find({
    type,
    isActive: true,
    isPublic: true,
    deletedAt: null,
    moderationStatus: "approved",
  }).sort({ createdAt: -1 });
};

postSchema.statics.findByTags = function (tags) {
  return this.find({
    tags: { $in: tags },
    isActive: true,
    isPublic: true,
    deletedAt: null,
    moderationStatus: "approved",
  }).sort({ createdAt: -1 });
};

postSchema.statics.findNearLocation = function (
  longitude,
  latitude,
  maxDistance = 10000
) {
  return this.find({
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance, // in meters
      },
    },
    isActive: true,
    isPublic: true,
    deletedAt: null,
    moderationStatus: "approved",
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model("Post", postSchema);
