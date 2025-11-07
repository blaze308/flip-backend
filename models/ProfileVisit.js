const mongoose = require('mongoose');

/**
 * Profile Visit Schema
 * Tracks who visited whose profile
 */
const profileVisitSchema = new mongoose.Schema({
  visitor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  visited: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  visitCount: {
    type: Number,
    default: 1,
  },
  lastVisitAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for visitor-visited uniqueness
profileVisitSchema.index({ visitor: 1, visited: 1 }, { unique: true });

// Static method to record a visit
profileVisitSchema.statics.recordVisit = async function(visitorId, visitedId) {
  // Don't record self-visits
  if (visitorId.toString() === visitedId.toString()) {
    return null;
  }

  const visit = await this.findOne({ visitor: visitorId, visited: visitedId });

  if (visit) {
    visit.visitCount++;
    visit.lastVisitAt = Date.now();
    return visit.save();
  } else {
    return this.create({ visitor: visitorId, visited: visitedId });
  }
};

// Static method to get visitors for a user
profileVisitSchema.statics.getVisitors = async function(userId, limit = 50) {
  return this.find({ visited: userId })
    .sort({ lastVisitAt: -1 })
    .limit(limit)
    .populate('visitor', 'displayName photoURL profile.username');
};

// Static method to get visited profiles by a user
profileVisitSchema.statics.getVisitedProfiles = async function(userId, limit = 50) {
  return this.find({ visitor: userId })
    .sort({ lastVisitAt: -1 })
    .limit(limit)
    .populate('visited', 'displayName photoURL profile.username');
};

const ProfileVisit = mongoose.model('ProfileVisit', profileVisitSchema);

module.exports = ProfileVisit;

