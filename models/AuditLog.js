const mongoose = require("mongoose");

/**
 * Audit Log Schema for tracking important user actions
 * Essential for security, compliance, and debugging
 */
const auditLogSchema = new mongoose.Schema(
  {
    // User Information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    firebaseUid: {
      type: String,
      index: true,
    },

    // Action Details
    action: {
      type: String,
      required: true,
      enum: [
        // Authentication
        "login",
        "logout",
        "register",
        "password_reset",
        "email_verify",
        // Profile
        "profile_update",
        "profile_view",
        "avatar_change",
        // Account
        "account_delete",
        "account_restore",
        "account_block",
        "account_unblock",
        // Security
        "password_change",
        "email_change",
        "phone_change",
        "provider_link",
        "provider_unlink",
        // Data
        "data_export",
        "data_delete",
        // Posts
        "post_create",
        "post_update",
        "post_delete",
        "post_view",
        "post_like",
        "post_unlike",
        "post_bookmark",
        "post_unbookmark",
        "post_share",
        "post_hide",
        "post_unhide",
        // Comments
        "comment_create",
        "comment_update",
        "comment_delete",
        "comment_like",
        "comment_unlike",
        // Social
        "user_follow",
        "user_unfollow",
        "user_block",
        "user_unblock",
        // Notifications
        "notifications_update",
        // Admin
        "admin_action",
        "role_change",
        "permission_change",
      ],
    },

    // Resource affected (optional)
    resource: {
      type: String,
      enum: [
        "user",
        "profile",
        "account",
        "session",
        "data",
        "post",
        "comment",
      ],
    },

    resourceId: String,

    // Action Details
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Request Information
    ipAddress: String,
    userAgent: String,
    deviceInfo: {
      deviceType: String,
      deviceId: String,
      appVersion: String,
    },

    // Result
    success: {
      type: Boolean,
      required: true,
    },

    errorMessage: String,

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ firebaseUid: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ success: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Static methods
auditLogSchema.statics.logAction = function (data) {
  return this.create({
    userId: data.userId,
    firebaseUid: data.firebaseUid,
    action: data.action,
    resource: data.resource,
    resourceId: data.resourceId,
    details: data.details || {},
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    deviceInfo: data.deviceInfo,
    success: data.success !== false, // default to true
    errorMessage: data.errorMessage,
    metadata: data.metadata || {},
  });
};

auditLogSchema.statics.getUserLogs = function (userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-__v");
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
