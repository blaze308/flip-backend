const mongoose = require('mongoose');

/**
 * Agency Schema
 * Represents an agency in the system
 */
const agencySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  agencyId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  commissionRate: {
    type: Number,
    default: 12, // 12% commission
    min: 0,
    max: 100,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  totalCommission: {
    type: Number,
    default: 0,
  },
  agentsCount: {
    type: Number,
    default: 0,
  },
  hostsCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'closed'],
    default: 'active',
  },
  benefits: [{
    type: String,
  }],
  rules: [{
    type: String,
  }],
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
agencySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to generate unique agency ID
agencySchema.statics.generateAgencyId = async function() {
  const prefix = 'AG';
  let agencyId;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    agencyId = `${prefix}${randomNum}`;
    exists = await this.findOne({ agencyId });
  }

  return agencyId;
};

const Agency = mongoose.model('Agency', agencySchema);

module.exports = Agency;

