const mongoose = require('mongoose');

/**
 * Ranking Schema
 * Tracks user rankings for Host and Rich leaderboards
 */
const rankingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['host', 'rich'], // host = gifts received, rich = coins sent
    required: true,
    index: true,
  },
  period: {
    type: String,
    enum: ['daily', 'weekly'],
    required: true,
    index: true,
  },
  score: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  rank: {
    type: Number,
    min: 1,
  },
  // Date range for this ranking period
  periodStart: {
    type: Date,
    required: true,
    index: true,
  },
  periodEnd: {
    type: Date,
    required: true,
  },
  // Reward info
  rewardCoins: {
    type: Number,
    default: 0,
  },
  rewardClaimed: {
    type: Boolean,
    default: false,
  },
  rewardClaimedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound indexes for efficient queries
rankingSchema.index({ type: 1, period: 1, periodStart: 1, score: -1 });
rankingSchema.index({ user: 1, type: 1, period: 1, periodStart: 1 }, { unique: true });

rankingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get top rankings
rankingSchema.statics.getTopRankings = async function (type, period, periodStart, limit = 40) {
  return this.find({
    type,
    period,
    periodStart,
  })
    .sort({ score: -1 })
    .limit(limit)
    .populate('user', 'displayName photoURL profile.username gamification');
};

// Static method to calculate rewards based on rank
rankingSchema.statics.calculateReward = function (rank) {
  const rewardMap = {
    1: 500,
    2: 300,
    3: 100,
    4: 80,
    5: 70,
    6: 60,
    7: 50,
    8: 45,
    9: 40,
    10: 35,
  };
  
  if (rank <= 10) {
    return rewardMap[rank];
  } else if (rank <= 20) {
    return 30;
  } else if (rank <= 30) {
    return 20;
  } else if (rank <= 40) {
    return 10;
  }
  
  return 0;
};

// Instance method to claim reward
rankingSchema.methods.claimReward = async function () {
  if (this.rewardClaimed) {
    throw new Error('Reward already claimed');
  }
  
  if (this.rewardCoins === 0) {
    throw new Error('No reward available for this rank');
  }
  
  const user = await mongoose.model('User').findById(this.user);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Award coins
  await user.addCoins(this.rewardCoins);
  
  // Mark as claimed
  this.rewardClaimed = true;
  this.rewardClaimedAt = new Date();
  await this.save();
  
  return this.rewardCoins;
};

const Ranking = mongoose.model('Ranking', rankingSchema);

module.exports = Ranking;

