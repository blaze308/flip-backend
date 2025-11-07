const mongoose = require('mongoose');

/**
 * Task Schema
 * Defines available tasks for users to complete
 */
const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'achievement', 'host', 'live', 'vip', 'party'],
    required: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['social', 'streaming', 'engagement', 'premium', 'special'],
    default: 'social',
  },
  icon: {
    type: String, // Icon name or URL
  },
  requirement: {
    action: {
      type: String,
      required: true,
      // Examples: 'post_create', 'live_start', 'gift_send', 'follow_user', etc.
    },
    target: {
      type: Number,
      required: true,
      min: 1,
    },
    // Optional: specific conditions
    conditions: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  rewards: {
    coins: {
      type: Number,
      default: 0,
      min: 0,
    },
    diamonds: {
      type: Number,
      default: 0,
      min: 0,
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
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

taskSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get active tasks by type
taskSchema.statics.getActiveTasksByType = function (type) {
  return this.find({ type, isActive: true }).sort({ sortOrder: 1 });
};

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;

