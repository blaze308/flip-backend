const mongoose = require("mongoose");

/**
 * LiveViewer Schema for MongoDB
 * Tracks who is currently watching a live stream
 */
const liveViewerSchema = new mongoose.Schema(
  {
    // Viewer Information
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

    // Live Stream Information
    liveId: {
      type: String,
      required: true,
      index: true,
    },
    liveAuthorId: {
      type: String,
      required: true,
      index: true,
    },

    // Watching Status
    watching: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Join/Leave Timestamps
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
    },

    // Watch Duration (in seconds)
    watchDuration: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
liveViewerSchema.index({ liveId: 1, watching: 1 });
liveViewerSchema.index({ liveId: 1, authorId: 1 }, { unique: true });
liveViewerSchema.index({ authorId: 1, watching: 1 });

// Method to leave live
liveViewerSchema.methods.leaveLive = function () {
  this.watching = false;
  this.leftAt = new Date();
  if (this.joinedAt) {
    this.watchDuration = Math.floor((this.leftAt - this.joinedAt) / 1000);
  }
};

// Method to rejoin live
liveViewerSchema.methods.rejoinLive = function () {
  this.watching = true;
  this.joinedAt = new Date();
  this.leftAt = null;
};

// Static method to get current viewer count
liveViewerSchema.statics.getCurrentViewerCount = async function (liveId) {
  return this.countDocuments({ liveId: liveId, watching: true });
};

// Static method to get all current viewers
liveViewerSchema.statics.getCurrentViewers = async function (liveId) {
  return this.find({ liveId: liveId, watching: true })
    .populate("author", "displayName photoURL username")
    .sort({ joinedAt: -1 });
};

// Static method to get or create viewer
liveViewerSchema.statics.getOrCreate = async function (
  authorId,
  liveId,
  liveAuthorId
) {
  let viewer = await this.findOne({ liveId: liveId, authorId: authorId });

  if (!viewer) {
    viewer = await this.create({
      author: authorId,
      authorId: authorId,
      liveId: liveId,
      liveAuthorId: liveAuthorId,
      watching: true,
      joinedAt: new Date(),
    });
  } else if (!viewer.watching) {
    viewer.rejoinLive();
    await viewer.save();
  }

  return viewer;
};

module.exports = mongoose.model("LiveViewer", liveViewerSchema);

