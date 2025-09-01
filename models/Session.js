const mongoose = require("mongoose");

/**
 * Session Schema for tracking user sessions
 * Useful for analytics, security monitoring, and user activity tracking
 */
const sessionSchema = new mongoose.Schema(
  {
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

    // Session Information
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Device and Platform Info
    deviceInfo: {
      deviceId: String,
      deviceType: {
        type: String,
        enum: ["ios", "android", "web", "desktop"],
      },
      deviceName: String,
      osVersion: String,
      appVersion: String,
      platform: String,
    },

    // Location and Network
    ipAddress: {
      type: String,
      required: true,
    },

    userAgent: String,

    location: {
      country: String,
      region: String,
      city: String,
      timezone: String,
    },

    // Session Timing
    startTime: {
      type: Date,
      default: Date.now,
      required: true,
    },

    endTime: Date,

    duration: {
      type: Number, // in minutes
      default: 0,
    },

    lastActivity: {
      type: Date,
      default: Date.now,
    },

    // Session Status
    isActive: {
      type: Boolean,
      default: true,
    },

    endReason: {
      type: String,
      enum: [
        "logout",
        "timeout",
        "force_logout",
        "token_expired",
        "device_change",
      ],
    },

    // Security Flags
    isSuspicious: {
      type: Boolean,
      default: false,
    },

    securityFlags: [
      {
        type: String,
        enum: [
          "new_device",
          "new_location",
          "multiple_sessions",
          "unusual_activity",
        ],
      },
    ],

    // Remember Me flag for extended sessions
    rememberMe: {
      type: Boolean,
      default: false,
    },

    // Token tracking (partial tokens for security)
    accessToken: String,
    refreshToken: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
sessionSchema.index({ userId: 1, startTime: -1 });
sessionSchema.index({ firebaseUid: 1, isActive: 1 });
sessionSchema.index({ startTime: -1 });
sessionSchema.index({ isActive: 1 });

// Instance methods
sessionSchema.methods.endSession = function (reason = "logout") {
  this.endTime = new Date();
  this.isActive = false;
  this.endReason = reason;
  this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60)); // minutes
  return this.save();
};

sessionSchema.methods.updateActivity = function () {
  this.lastActivity = new Date();
  return this.save();
};

// Static methods
sessionSchema.statics.findActiveSessions = function (userId) {
  return this.find({ userId, isActive: true });
};

sessionSchema.statics.endAllUserSessions = function (
  userId,
  reason = "force_logout"
) {
  return this.updateMany(
    { userId, isActive: true },
    {
      endTime: new Date(),
      isActive: false,
      endReason: reason,
    }
  );
};

module.exports = mongoose.model("Session", sessionSchema);
