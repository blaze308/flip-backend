const mongoose = require('mongoose');

/**
 * Fan Club Schema
 * Represents a fan club created by a user
 */
const fanClubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // One club per user
    index: true,
  },
  badge: {
    type: String,
    default: '', // Badge icon/image URL
  },
  description: {
    type: String,
    default: '',
    maxlength: 200,
  },
  memberCount: {
    type: Number,
    default: 0,
  },
  maxMembers: {
    type: Number,
    default: 100,
  },
  joinFee: {
    type: Number,
    default: 100, // Coins to join
  },
  renewalFee: {
    type: Number,
    default: 300, // Monthly renewal fee
  },
  nameChangeFee: {
    type: Number,
    default: 10000, // Fee to change club name
  },
  privileges: {
    sortPriority: { type: Boolean, default: true },
    exclusiveBadge: { type: Boolean, default: true },
    exclusiveGifts: { type: Boolean, default: true },
    intimacyBonus: { type: Number, default: 5 },
    platformFloatTag: { type: Boolean, default: true },
    votingRights: { type: Number, default: 15 },
    chatPriority: { type: Number, default: 15 },
  },
  stats: {
    totalRevenue: { type: Number, default: 0 },
    totalMembers: { type: Number, default: 0 },
    activeMembers: { type: Number, default: 0 },
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'closed'],
    default: 'active',
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

// Update timestamp on save
fanClubSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to add member
fanClubSchema.methods.addMember = function() {
  this.memberCount++;
  this.stats.totalMembers++;
  this.stats.activeMembers++;
  return this.save();
};

// Instance method to remove member
fanClubSchema.methods.removeMember = function() {
  this.memberCount = Math.max(0, this.memberCount - 1);
  this.stats.activeMembers = Math.max(0, this.stats.activeMembers - 1);
  return this.save();
};

const FanClub = mongoose.model('FanClub', fanClubSchema);

module.exports = FanClub;

