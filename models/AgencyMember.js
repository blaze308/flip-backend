const mongoose = require('mongoose');

/**
 * Agency Member Schema
 * Represents a user's membership in an agency (as agent or host)
 */
const agencyMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  agency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['owner', 'agent', 'host'],
    required: true,
  },
  // For agents
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  invitedAgentsCount: {
    type: Number,
    default: 0,
  },
  hostsCount: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  totalCommission: {
    type: Number,
    default: 0,
  },
  // For hosts
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  hostEarnings: {
    type: Number,
    default: 0,
  },
  // Application status for hosts
  applicationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  },
  applicationDate: {
    type: Date,
    default: Date.now,
  },
  approvedDate: {
    type: Date,
  },
  // Activity tracking
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  leftAt: {
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

// Compound index for user-agency uniqueness
agencyMemberSchema.index({ user: 1, agency: 1 }, { unique: true });

// Update timestamp on save
agencyMemberSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to calculate commission
agencyMemberSchema.methods.calculateCommission = function(earnings, commissionRate) {
  return Math.floor(earnings * (commissionRate / 100));
};

// Instance method to update activity
agencyMemberSchema.methods.updateActivity = function() {
  this.lastActivityAt = Date.now();
  return this.save();
};

const AgencyMember = mongoose.model('AgencyMember', agencyMemberSchema);

module.exports = AgencyMember;

