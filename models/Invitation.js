const mongoose = require("mongoose");

/**
 * Invitation / Referral Schema
 * Tracks referral codes and invitation history
 */
const invitationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referralCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    invitedUsers: [
      {
        invitedUserId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        invitedAt: {
          type: Date,
          default: Date.now,
        },
        rewardClaimed: {
          type: Boolean,
          default: false,
        },
      },
    ],
    totalInvites: {
      type: Number,
      default: 0,
    },
    totalRewards: {
      coins: { type: Number, default: 0 },
      diamonds: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

invitationSchema.index({ userId: 1 });
invitationSchema.index({ referralCode: 1 });

// Generate unique referral code
invitationSchema.statics.generateReferralCode = function () {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FLIP";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

module.exports = mongoose.model("Invitation", invitationSchema);
