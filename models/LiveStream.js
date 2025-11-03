const mongoose = require("mongoose");

/**
 * LiveStream Schema for MongoDB
 * Handles all types of live streaming: regular live, party live, audio party, PK battles
 */
const liveStreamSchema = new mongoose.Schema(
  {
    // Author/Host Information
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
    authorUid: {
      type: Number, // Agora/Zego UID
      required: true,
    },

    // Live Stream Type
    liveType: {
      type: String,
      enum: ["live", "party", "audio", "battle"],
      default: "live",
      index: true,
    },

    // Live Stream Sub-Type (for categorization)
    liveSubType: {
      type: String,
      enum: ["Talking", "Singing", "Dancing", "Friends", "Games", "Other"],
      default: "Talking",
    },

    // Streaming Status
    streaming: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Channel Information
    streamingChannel: {
      type: String,
      required: true,
    },

    // Title and Description
    title: {
      type: String,
      default: "",
    },
    streamingTags: {
      type: String,
      default: "",
    },

    // Privacy Settings
    private: {
      type: Boolean,
      default: false,
    },
    privateViewersId: [
      {
        type: String,
      },
    ],
    privateLivePrice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
    },

    // Viewers and Statistics
    viewersCount: {
      type: Number,
      default: 0,
    },
    viewersId: [
      {
        type: String,
      },
    ],
    viewersUid: [
      {
        type: Number,
      },
    ],
    reachedPeople: [
      {
        type: String,
      },
    ],
    likes: [
      {
        type: String,
      },
    ],

    // Diamonds/Coins
    streamingDiamonds: {
      type: Number,
      default: 0,
    },
    authorTotalDiamonds: {
      type: Number,
      default: 0,
    },
    giftsTotal: {
      type: Number,
      default: 0,
    },

    // Gift Senders
    giftSenders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GiftSender",
      },
    ],

    // Co-Host/Party Features
    coHostAvailable: {
      type: Boolean,
      default: false,
    },
    coHostAuthor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    coHostAuthorUid: {
      type: Number,
    },
    coHostUID: [
      {
        type: Number,
      },
    ],

    // Party Live Settings
    numberOfChairs: {
      type: Number,
      default: 6, // 4, 6, or 9 seats
    },
    partyType: {
      type: String,
      enum: ["video", "audio"],
      default: "video",
    },
    partyTheme: {
      type: String, // URL to theme image
    },
    invitedPartyUid: [
      {
        type: Number,
      },
    ],
    audioHostsList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // User Management
    removedUsersId: [
      {
        type: String,
      },
    ],
    mutedUsersId: [
      {
        type: String,
      },
    ],
    unMutedUsersId: [
      {
        type: String,
      },
    ],
    userSelfMutedAudio: [
      {
        type: String,
      },
    ],

    // PK Battle Features
    isPKBattle: {
      type: Boolean,
      default: false,
    },
    pkRequester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    pkReceiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Invitation System
    authorInvited: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    authorInvitedUid: {
      type: Number,
    },
    invitedBroadCasterId: {
      type: String,
    },
    invitationAccepted: {
      type: Boolean,
      default: false,
    },
    invitationLivePending: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveStream",
    },

    // Followers gained during live
    newFollowers: [
      {
        type: String,
      },
    ],

    // Admin Controls
    endByAdmin: {
      type: Boolean,
      default: false,
    },

    // First Live Flag
    firstLive: {
      type: Boolean,
      default: false,
    },

    // Streaming Time
    streamingTime: {
      type: String,
      default: "00:00",
    },

    // Thumbnail/Cover Image
    image: {
      type: String,
    },

    // Location
    geoPoint: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },

    // Hashtags
    hashTags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hashtag",
      },
    ],
    hashTagsId: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
liveStreamSchema.index({ streaming: 1, createdAt: -1 });
liveStreamSchema.index({ authorId: 1, streaming: 1 });
liveStreamSchema.index({ liveType: 1, streaming: 1 });
liveStreamSchema.index({ geoPoint: "2dsphere" });

// Virtual for live viewers count
liveStreamSchema.virtual("liveViewersCount").get(function () {
  return this.viewersId ? this.viewersId.length : 0;
});

// Method to add viewer
liveStreamSchema.methods.addViewer = function (userId, userUid) {
  if (!this.viewersId.includes(userId)) {
    this.viewersId.push(userId);
    this.viewersCount = this.viewersId.length;
  }
  if (userUid && !this.viewersUid.includes(userUid)) {
    this.viewersUid.push(userUid);
  }
  if (!this.reachedPeople.includes(userId)) {
    this.reachedPeople.push(userId);
  }
};

// Method to remove viewer
liveStreamSchema.methods.removeViewer = function (userId, userUid) {
  this.viewersId = this.viewersId.filter((id) => id !== userId);
  this.viewersCount = this.viewersId.length;
  if (userUid) {
    this.viewersUid = this.viewersUid.filter((uid) => uid !== userUid);
  }
};

// Method to add diamonds
liveStreamSchema.methods.addDiamonds = function (amount) {
  this.streamingDiamonds = (this.streamingDiamonds || 0) + amount;
  this.authorTotalDiamonds = (this.authorTotalDiamonds || 0) + amount;
  this.giftsTotal = (this.giftsTotal || 0) + amount;
};

module.exports = mongoose.model("LiveStream", liveStreamSchema);

