const mongoose = require("mongoose");

/**
 * AudioChatUser Schema for MongoDB
 * Handles users in audio/video party rooms (seats/chairs)
 */
const audioChatUserSchema = new mongoose.Schema(
  {
    // Live Stream Reference
    liveStream: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveStream",
      required: true,
      index: true,
    },
    liveStreamId: {
      type: String,
      required: true,
      index: true,
    },

    // Joined User Information
    joinedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    joinedUserId: {
      type: String,
      index: true,
    },
    joinedUserUid: {
      type: Number, // Agora/Zego UID
    },

    // Seat Information
    seatIndex: {
      type: Number,
      required: true,
      min: 0,
      max: 8, // 0-8 for 9 seats max
    },

    // Permissions
    canTalk: {
      type: Boolean,
      default: false,
    },
    enabledVideo: {
      type: Boolean,
      default: false,
    },
    enabledAudio: {
      type: Boolean,
      default: true,
    },

    // Status
    leftRoom: {
      type: Boolean,
      default: false,
    },

    // Mute Status
    userSelfMutedAudio: [
      {
        type: String,
      },
    ],
    usersMutedByHostAudio: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
audioChatUserSchema.index({ liveStreamId: 1, seatIndex: 1 });
audioChatUserSchema.index({ liveStreamId: 1, joinedUserId: 1 });
audioChatUserSchema.index({ liveStreamId: 1, leftRoom: 1 });

// Method to check if user is muted
audioChatUserSchema.methods.isMuted = function () {
  return (
    this.userSelfMutedAudio.length > 0 ||
    this.usersMutedByHostAudio.length > 0 ||
    !this.enabledAudio
  );
};

// Method to mute user
audioChatUserSchema.methods.muteUser = function (mutedBy = "self") {
  if (mutedBy === "self") {
    if (!this.userSelfMutedAudio.includes(this.joinedUserId)) {
      this.userSelfMutedAudio.push(this.joinedUserId);
    }
  } else {
    if (!this.usersMutedByHostAudio.includes(this.joinedUserId)) {
      this.usersMutedByHostAudio.push(this.joinedUserId);
    }
  }
  this.enabledAudio = false;
};

// Method to unmute user
audioChatUserSchema.methods.unmuteUser = function (unmutedBy = "self") {
  if (unmutedBy === "self") {
    this.userSelfMutedAudio = this.userSelfMutedAudio.filter(
      (id) => id !== this.joinedUserId
    );
  } else {
    this.usersMutedByHostAudio = this.usersMutedByHostAudio.filter(
      (id) => id !== this.joinedUserId
    );
  }
  // Only enable audio if not muted by other means
  if (
    this.userSelfMutedAudio.length === 0 &&
    this.usersMutedByHostAudio.length === 0
  ) {
    this.enabledAudio = true;
  }
};

// Static method to find available seat
audioChatUserSchema.statics.findAvailableSeat = async function (
  liveStreamId,
  maxSeats = 6
) {
  const occupiedSeats = await this.find({
    liveStreamId: liveStreamId,
    leftRoom: false,
    joinedUserId: { $exists: true, $ne: null },
  }).select("seatIndex");

  const occupiedIndexes = occupiedSeats.map((seat) => seat.seatIndex);

  for (let i = 0; i < maxSeats; i++) {
    if (!occupiedIndexes.includes(i)) {
      return i;
    }
  }

  return null; // No available seats
};

module.exports = mongoose.model("AudioChatUser", audioChatUserSchema);

