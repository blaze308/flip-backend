const mongoose = require('mongoose');

/**
 * Daily Reward Schema
 * Tracks daily login rewards for users
 */
const dailyRewardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  day: {
    type: Number,
    required: true,
    min: 1,
    max: 7, // 7-day cycle
  },
  coins: {
    type: Number,
    required: true,
    min: 0,
  },
  diamonds: {
    type: Number,
    default: 0,
    min: 0,
  },
  claimedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  streakCount: {
    type: Number,
    default: 1,
    min: 1,
  },
});

// Compound index for user and date
dailyRewardSchema.index({ user: 1, claimedAt: -1 });

const DailyReward = mongoose.model('DailyReward', dailyRewardSchema);

module.exports = DailyReward;

