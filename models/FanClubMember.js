const mongoose = require('mongoose');

/**
 * Fan Club Member Schema
 * Represents a user's membership in a fan club
 */
const fanClubMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  fanClub: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FanClub',
    required: true,
    index: true,
  },
  badgeEnabled: {
    type: Boolean,
    default: true, // Show badge in chat
  },
  intimacyLevel: {
    type: Number,
    default: 0,
  },
  totalContribution: {
    type: Number,
    default: 0, // Total coins spent
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  lastRenewalAt: {
    type: Date,
    default: Date.now,
  },
  renewalCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'kicked'],
    default: 'active',
  },
  kickedAt: {
    type: Date,
  },
  kickedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  kickReason: {
    type: String,
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

// Compound index for user-fanClub uniqueness
fanClubMemberSchema.index({ user: 1, fanClub: 1 }, { unique: true });

// Update timestamp on save
fanClubMemberSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to check if membership is active
fanClubMemberSchema.methods.isActive = function() {
  return this.status === 'active' && this.expiresAt > new Date();
};

// Instance method to renew membership
fanClubMemberSchema.methods.renew = function(durationDays = 30) {
  this.expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  this.lastRenewalAt = Date.now();
  this.renewalCount++;
  this.status = 'active';
  return this.save();
};

// Instance method to kick member
fanClubMemberSchema.methods.kick = function(kickedBy, reason) {
  this.status = 'kicked';
  this.kickedAt = Date.now();
  this.kickedBy = kickedBy;
  this.kickReason = reason;
  return this.save();
};

const FanClubMember = mongoose.model('FanClubMember', fanClubMemberSchema);

module.exports = FanClubMember;

