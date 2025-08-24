const mongoose = require("mongoose");

/**
 * User Schema for MongoDB
 * This schema stores user data from Firebase Auth plus additional app-specific data
 *
 * Key Design Decisions:
 * - firebaseUid is the primary identifier linking to Firebase Auth
 * - providers array tracks which auth methods user has used (email, google.com, apple.com, phone)
 * - Flexible profile data structure for future expansion
 * - Automatic timestamps for createdAt and updatedAt
 * - Indexes for performance on common queries
 */
const userSchema = new mongoose.Schema(
  {
    // Firebase Authentication Data
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    email: {
      type: String,
      required: function () {
        // Email is required unless user signed up with phone only
        return (
          !this.phoneNumber ||
          this.providers.includes("password") ||
          this.providers.includes("google.com")
        );
      },
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: function (email) {
          if (!email) return true; // Allow empty if not required
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },
        message: "Please provide a valid email address",
      },
    },

    displayName: {
      type: String,
      trim: true,
      maxlength: [100, "Display name cannot exceed 100 characters"],
    },

    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (phone) {
          if (!phone) return true; // Allow empty
          return /^\+[1-9]\d{1,14}$/.test(phone); // E.164 format
        },
        message: "Please provide a valid phone number in E.164 format",
      },
    },

    photoURL: {
      type: String,
      trim: true,
      validate: {
        validator: function (url) {
          if (!url) return true; // Allow empty
          return /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid photo URL",
      },
    },

    // Authentication Providers (email, google.com, apple.com, phone, etc.)
    providers: [
      {
        type: String,
        enum: [
          "password",
          "google.com",
          "apple.com",
          "phone",
          "facebook.com",
          "twitter.com",
        ],
      },
    ],

    // Email verification status from Firebase
    emailVerified: {
      type: Boolean,
      default: false,
    },

    // User Status
    isActive: {
      type: Boolean,
      default: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    // User Role and Permissions
    role: {
      type: String,
      enum: ["user", "premium", "admin", "moderator"],
      default: "user",
    },

    permissions: [
      {
        type: String,
        enum: ["read", "write", "delete", "admin", "moderate"],
      },
    ],

    // App-specific Profile Data
    profile: {
      firstName: {
        type: String,
        trim: true,
        maxlength: [50, "First name cannot exceed 50 characters"],
      },
      lastName: {
        type: String,
        trim: true,
        maxlength: [50, "Last name cannot exceed 50 characters"],
      },
      bio: {
        type: String,
        trim: true,
        maxlength: [500, "Bio cannot exceed 500 characters"],
      },
      dateOfBirth: {
        type: Date,
        validate: {
          validator: function (date) {
            if (!date) return true;
            return date < new Date();
          },
          message: "Date of birth must be in the past",
        },
      },
      gender: {
        type: String,
        enum: ["male", "female", "other", "prefer_not_to_say"],
      },
      location: {
        country: String,
        state: String,
        city: String,
      },
      preferences: {
        language: {
          type: String,
          default: "en",
        },
        timezone: {
          type: String,
          default: "UTC",
        },
        notifications: {
          email: {
            type: Boolean,
            default: true,
          },
          push: {
            type: Boolean,
            default: true,
          },
          sms: {
            type: Boolean,
            default: false,
          },
        },
        privacy: {
          profileVisible: {
            type: Boolean,
            default: true,
          },
          showEmail: {
            type: Boolean,
            default: false,
          },
          showPhone: {
            type: Boolean,
            default: false,
          },
        },
      },
    },

    // Activity Tracking
    lastLogin: {
      type: Date,
      default: Date.now,
    },

    lastActive: {
      type: Date,
      default: Date.now,
    },

    loginCount: {
      type: Number,
      default: 1,
    },

    // Device Information (for security and analytics)
    devices: [
      {
        deviceId: String,
        deviceType: {
          type: String,
          enum: ["ios", "android", "web", "desktop"],
        },
        deviceName: String,
        lastUsed: {
          type: Date,
          default: Date.now,
        },
        pushToken: String, // For push notifications
      },
    ],

    // Subscription/Premium Features
    subscription: {
      plan: {
        type: String,
        enum: ["free", "premium", "pro"],
        default: "free",
      },
      startDate: Date,
      endDate: Date,
      isActive: {
        type: Boolean,
        default: false,
      },
      autoRenew: {
        type: Boolean,
        default: false,
      },
    },

    // Analytics and Metrics
    stats: {
      totalSessions: {
        type: Number,
        default: 0,
      },
      totalTimeSpent: {
        type: Number,
        default: 0, // in minutes
      },
      lastSessionDuration: {
        type: Number,
        default: 0, // in minutes
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
userSchema.index({ email: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ "profile.firstName": 1, "profile.lastName": 1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isActive: 1, isBlocked: 1 });

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.displayName || this.email || "User";
});

// Pre-save middleware
userSchema.pre("save", function (next) {
  // Update lastActive timestamp
  this.lastActive = new Date();

  // Ensure providers array doesn't have duplicates
  if (this.providers) {
    this.providers = [...new Set(this.providers)];
  }

  next();
});

// Instance methods
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  this.loginCount += 1;
  return this.save();
};

userSchema.methods.addProvider = function (provider) {
  if (!this.providers.includes(provider)) {
    this.providers.push(provider);
  }
  return this.save();
};

userSchema.methods.removeProvider = function (provider) {
  this.providers = this.providers.filter((p) => p !== provider);
  return this.save();
};

userSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

userSchema.methods.restore = function () {
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

// Static methods
userSchema.statics.findActive = function () {
  return this.find({ isActive: true, deletedAt: null });
};

userSchema.statics.findByFirebaseUid = function (uid) {
  return this.findOne({ firebaseUid: uid, deletedAt: null });
};

userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase(), deletedAt: null });
};

module.exports = mongoose.model("User", userSchema);
