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
      username: {
        type: String,
        required: [true, "Username is required"],
        trim: true,
        unique: true,
        minlength: [3, "Username must be at least 3 characters"],
        maxlength: [30, "Username cannot exceed 30 characters"],
        validate: {
          validator: function (username) {
            return /^[a-zA-Z0-9_]+$/.test(username); // Only alphanumeric and underscore
          },
          message:
            "Username can only contain letters, numbers, and underscores",
        },
      },
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
      website: {
        type: String,
        trim: true,
        maxlength: [200, "Website URL cannot exceed 200 characters"],
        validate: {
          validator: function (url) {
            if (!url) return true; // Allow empty
            return /^https?:\/\/.+/.test(url);
          },
          message: "Please provide a valid website URL",
        },
      },
      occupation: {
        type: String,
        trim: true,
        maxlength: [100, "Occupation cannot exceed 100 characters"],
      },
      interests: [
        {
          type: String,
          trim: true,
        },
      ],
      coverPhotoURL: {
        type: String,
        trim: true,
        validate: {
          validator: function (url) {
            if (!url) return true; // Allow empty
            return /^https?:\/\/.+/.test(url);
          },
          message: "Please provide a valid cover photo URL",
        },
      },
      socialLinks: {
        instagram: String,
        tiktok: String,
        twitter: String,
        youtube: String,
        facebook: String,
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

    // Social Features
    bookmarkedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],

    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    hiddenPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],

    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

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

    // Gamification & Levels
    gamification: {
      // Wealth Level (based on coins sent)
      creditsSent: {
        type: Number,
        default: 0,
        min: 0,
      },
      wealthLevel: {
        type: Number,
        default: 0,
        min: 0,
        max: 200,
      },

      // Live Level (based on gifts received)
      giftsReceived: {
        type: Number,
        default: 0,
        min: 0,
      },
      liveLevel: {
        type: Number,
        default: 0,
        min: 0,
        max: 40,
      },

      // Coins & Currency
      coins: {
        type: Number,
        default: 0,
        min: 0,
      },
      diamonds: {
        type: Number,
        default: 0,
        min: 0,
      },
      points: {
        type: Number,
        default: 0,
        min: 0,
      },

      // VIP System (3 tiers)
      isNormalVip: {
        type: Boolean,
        default: false,
      },
      isSuperVip: {
        type: Boolean,
        default: false,
      },
      isDiamondVip: {
        type: Boolean,
        default: false,
      },
      vipExpiresAt: {
        type: Date,
        default: null,
      },

      // MVP Premium Membership
      isMVP: {
        type: Boolean,
        default: false,
      },
      mvpExpiresAt: {
        type: Date,
        default: null,
      },

      // Guardian System (3 tiers)
      guardianType: {
        type: String,
        enum: ["silver", "gold", "king", null],
        default: null,
      },
      guardianExpiresAt: {
        type: Date,
        default: null,
      },
      guardingUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      guardedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      // Experience & Progress
      experiencePoints: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalGiftsSent: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Host Status
    isHost: {
      type: Boolean,
      default: false,
      index: true,
    },
    hostApprovedAt: {
      type: Date,
      default: null,
    },

    // Agency System
    agency: {
      agencyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agency',
        default: null,
      },
      role: {
        type: String,
        enum: ['owner', 'agent', 'host', null],
        default: null,
      },
      joinedAt: {
        type: Date,
        default: null,
      },
    },

    // Social Features
    closeFriends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    profileVisitsCount: {
      type: Number,
      default: 0,
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
// Note: email and firebaseUid indexes are created via unique constraint in schema
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

// Social feature methods
userSchema.methods.bookmarkPost = function (postId) {
  if (!this.bookmarkedPosts.includes(postId)) {
    this.bookmarkedPosts.push(postId);
  }
  return this.save();
};

userSchema.methods.unbookmarkPost = function (postId) {
  this.bookmarkedPosts = this.bookmarkedPosts.filter(
    (id) => id.toString() !== postId.toString()
  );
  return this.save();
};

userSchema.methods.followUser = function (userId) {
  if (!this.following.includes(userId)) {
    this.following.push(userId);
  }
  return this.save();
};

userSchema.methods.unfollowUser = function (userId) {
  this.following = this.following.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

userSchema.methods.addFollower = function (userId) {
  if (!this.followers.includes(userId)) {
    this.followers.push(userId);
  }
  return this.save();
};

userSchema.methods.removeFollower = function (userId) {
  this.followers = this.followers.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

userSchema.methods.hidePost = function (postId) {
  if (!this.hiddenPosts.includes(postId)) {
    this.hiddenPosts.push(postId);
  }
  return this.save();
};

userSchema.methods.unhidePost = function (postId) {
  this.hiddenPosts = this.hiddenPosts.filter(
    (id) => id.toString() !== postId.toString()
  );
  return this.save();
};

userSchema.methods.blockUser = function (userId) {
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
  }
  return this.save();
};

userSchema.methods.unblockUser = function (userId) {
  this.blockedUsers = this.blockedUsers.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

// Gamification methods
userSchema.methods.addCoins = function (amount) {
  if (!this.gamification) this.gamification = {};
  this.gamification.coins = (this.gamification.coins || 0) + amount;
  return this.save();
};

userSchema.methods.deductCoins = function (amount) {
  if (!this.gamification) this.gamification = {};
  const currentCoins = this.gamification.coins || 0;
  if (currentCoins < amount) {
    throw new Error("Insufficient coins");
  }
  this.gamification.coins = currentCoins - amount;
  return this.save();
};

userSchema.methods.addCreditsSent = function (amount) {
  if (!this.gamification) this.gamification = {};
  this.gamification.creditsSent = (this.gamification.creditsSent || 0) + amount;
  this.gamification.wealthLevel = this.calculateWealthLevel();
  return this.save();
};

userSchema.methods.addGiftsReceived = function (amount) {
  if (!this.gamification) this.gamification = {};
  this.gamification.giftsReceived =
    (this.gamification.giftsReceived || 0) + amount;
  this.gamification.liveLevel = this.calculateLiveLevel();
  return this.save();
};

userSchema.methods.calculateWealthLevel = function () {
  const creditsSent = this.gamification?.creditsSent || 0;
  const wealthThresholds = [
    0, 3000, 6000, 16000, 30000, 52000, 85000, 137000, 214000, 323000, 492000,
    741000, 1100000, 1690000, 2528000, 3637000, 5137000, 7337000, 10137000,
    14137000, 19137000, 26137000, 35137000, 47137000, 62137000, 81137000,
    105137000, 135137000, 172137000, 218137000, 275137000, 345137000,
    430137000, 533137000, 657137000, 805137000, 981137000, 1189137000,
    1433137000, 1717137000, 2047137000, 2427137000, 2863137000, 3361137000,
    3927137000, 4567137000, 5289137000, 6099137000, 7005137000, 8015137000,
    9137137000, 10379137000, 11749137000, 13255137000, 14905137000,
    16707137000, 18669137000, 20799137000, 23105137000, 25595137000,
    28277137000, 31159137000, 34249137000, 37555137000, 41085137000,
    44847137000, 48849137000, 53099137000, 57605137000, 62375137000,
    67417137000, 72739137000, 78349137000, 84255137000, 90465137000,
    96987137000, 103829137000, 110999137000, 118505137000, 126355137000,
    134557137000, 143119137000, 152049137000, 161355137000, 171045137000,
    181127137000, 191609137000, 202499137000, 213805137000, 225535137000,
    237697137000, 250299137000, 263349137000, 276855137000, 290825137000,
    305267137000, 320189137000, 335599137000, 351505137000, 367915137000,
    384837137000, 402279137000, 420249137000, 438755137000, 457805137000,
    477407137000, 497569137000, 518299137000, 539605137000, 561495137000,
    583977137000, 607059137000, 630749137000, 655055137000, 679985137000,
    705547137000, 731749137000, 758599137000, 786105137000, 814275137000,
    843117137000, 872639137000, 902849137000, 933755137000, 965365137000,
    997687137000, 1030729137000, 1064499137000, 1099005137000, 1134255137000,
    1170257137000, 1207019137000, 1244549137000, 1282855137000, 1321945137000,
    1361827137000, 1402509137000, 1443999137000, 1486305137000, 1529435137000,
    1573397137000, 1618199137000, 1663849137000, 1710355137000, 1757725137000,
    1805967137000, 1855089137000, 1905099137000, 1956005137000, 2007815137000,
    2060537137000, 2114179137000, 2168749137000, 2224255137000, 2280705137000,
    2338107137000, 2396469137000, 2455799137000, 2516105137000, 2577395137000,
    2639677137000, 2702959137000, 2767249137000, 2832555137000, 2898885137000,
    2966247137000, 3034649137000, 3104099137000, 3174605137000, 3246175137000,
    3318817137000, 3392539137000, 3467349137000, 3543255137000, 3620265137000,
    3698387137000, 3777629137000, 3857999137000, 3939505137000, 4022155137000,
    4105957137000, 4190919137000, 4277049137000, 4364355137000, 4452845137000,
    4542527137000, 4633409137000, 4725499137000, 4818805137000, 4913335137000,
    5009097137000, 5106099137000, 5204349137000, 5303855137000, 5404625137000,
    5506667137000, 5609989137000, 5714599137000, 5820505137000, 5927715137000,
    6036237137000, 6146079137000, 6257249137000, 6369755137000,
  ]; // 200 levels

  for (let i = wealthThresholds.length - 1; i >= 0; i--) {
    if (creditsSent >= wealthThresholds[i]) {
      return i;
    }
  }
  return 0;
};

userSchema.methods.calculateLiveLevel = function () {
  const giftsReceived = this.gamification?.giftsReceived || 0;
  const liveThresholds = [
    0, 10000, 70000, 250000, 630000, 1410000, 3010000, 5710000, 10310000,
    18110000, 31010000, 52010000, 85010000, 137010000, 214010000, 323010000,
    492010000, 741010000, 1100010000, 1689010000, 2528010000, 3637010000,
    5137010000, 7337010000, 10137010000, 14137010000, 19137010000, 26137010000,
    35137010000, 47137010000, 62137010000, 81137010000, 105137010000,
    135137010000, 172137010000, 218137010000, 275137010000, 345137010000,
    430137010000, 533137010000,
  ]; // 40 levels

  for (let i = liveThresholds.length - 1; i >= 0; i--) {
    if (giftsReceived >= liveThresholds[i]) {
      return i;
    }
  }
  return 0;
};

userSchema.methods.activateVIP = async function (tier, months) {
  if (!this.gamification) this.gamification = {};

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  // Update legacy fields
  this.gamification.isNormalVip = tier === "normal";
  this.gamification.isSuperVip = tier === "super";
  this.gamification.isDiamondVip = tier === "diamond";
  this.gamification.vipExpiresAt = expiresAt;

  // Create Subscription record
  const Subscription = mongoose.model("Subscription");
  await Subscription.create({
    userId: this._id,
    type: "vip",
    tier: tier,
    startDate: now,
    endDate: expiresAt,
    paymentMethod: "coins", // Default for now, can be updated from route
    status: "active"
  });

  return this.save();
};

userSchema.methods.activateMVP = async function (months) {
  if (!this.gamification) this.gamification = {};

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  this.gamification.isMVP = true;
  this.gamification.mvpExpiresAt = expiresAt;

  // Create Subscription record
  const Subscription = mongoose.model("Subscription");
  await Subscription.create({
    userId: this._id,
    type: "mvp",
    startDate: now,
    endDate: expiresAt,
    paymentMethod: "coins",
    status: "active"
  });

  return this.save();
};

userSchema.methods.activateGuardian = async function (type, months, targetUserId) {
  if (!this.gamification) this.gamification = {};

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  this.gamification.guardianType = type;
  this.gamification.guardianExpiresAt = expiresAt;
  this.gamification.guardingUserId = targetUserId;

  // Create Subscription record
  const Subscription = mongoose.model("Subscription");
  await Subscription.create({
    userId: this._id,
    type: "guardian",
    tier: type,
    targetUserId: targetUserId,
    startDate: now,
    endDate: expiresAt,
    paymentMethod: "coins",
    status: "active"
  });

  return this.save();
};

// Add Experience Points (with MVP 2x boost)
userSchema.methods.addExperience = function (xp) {
  if (!this.gamification) this.gamification = {};

  // Check if user has active MVP
  const now = new Date();
  const hasMVP =
    this.gamification.isMVP &&
    this.gamification.mvpExpiresAt &&
    this.gamification.mvpExpiresAt > now;

  // Apply 2x XP boost for MVP users
  const xpToAdd = hasMVP ? xp * 2 : xp;

  this.gamification.experiencePoints =
    (this.gamification.experiencePoints || 0) + xpToAdd;

  console.log(
    `🎯 Added ${xpToAdd} XP to ${this.displayName} (MVP Boost: ${hasMVP ? "YES" : "NO"})`
  );

  return this.save();
};

userSchema.methods.checkAndExpireSubscriptions = async function () {
  if (!this.gamification) return this.save();

  const now = new Date();
  let changed = false;

  // Sync with Subscription model and expire old ones
  const Subscription = mongoose.model("Subscription");

  // Find all active subscriptions that should have expired
  const expiredSubs = await Subscription.find({
    userId: this._id,
    status: "active",
    endDate: { $lt: now }
  });

  if (expiredSubs.length > 0) {
    for (const sub of expiredSubs) {
      sub.status = "expired";
      await sub.save();
    }
  }

  // Check VIP expiration (Legacy support)
  if (
    this.gamification.vipExpiresAt &&
    this.gamification.vipExpiresAt < now
  ) {
    this.gamification.isNormalVip = false;
    this.gamification.isSuperVip = false;
    this.gamification.isDiamondVip = false;
    this.gamification.vipExpiresAt = null;
    changed = true;
  }

  // Check MVP expiration (Legacy support)
  if (this.gamification.mvpExpiresAt && this.gamification.mvpExpiresAt < now) {
    this.gamification.isMVP = false;
    this.gamification.mvpExpiresAt = null;
    changed = true;
  }

  // Check Guardian expiration (Legacy support)
  if (
    this.gamification.guardianExpiresAt &&
    this.gamification.guardianExpiresAt < now
  ) {
    this.gamification.guardianType = null;
    this.gamification.guardianExpiresAt = null;
    this.gamification.guardingUserId = null;
    changed = true;
  }

  return changed ? this.save() : Promise.resolve(this);
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
