const mongoose = require('mongoose');

/**
 * User Task Schema
 * Tracks individual user progress on tasks
 */
const userTaskSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
  },
  isCompleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  completedAt: {
    type: Date,
  },
  isClaimed: {
    type: Boolean,
    default: false,
  },
  claimedAt: {
    type: Date,
  },
  // For daily/weekly tasks - tracks when they reset
  expiresAt: {
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

// Compound indexes
userTaskSchema.index({ user: 1, task: 1 }, { unique: true });
userTaskSchema.index({ user: 1, isCompleted: 1 });
userTaskSchema.index({ user: 1, isClaimed: 1 });

userTaskSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to update progress
userTaskSchema.methods.updateProgress = async function (increment = 1) {
  this.progress += increment;
  
  // Check if task is completed
  const task = await mongoose.model('Task').findById(this.task);
  if (task && this.progress >= task.requirement.target) {
    this.isCompleted = true;
    this.completedAt = new Date();
  }
  
  return this.save();
};

// Instance method to claim rewards
userTaskSchema.methods.claimRewards = async function () {
  if (!this.isCompleted) {
    throw new Error('Task not completed yet');
  }
  
  if (this.isClaimed) {
    throw new Error('Rewards already claimed');
  }
  
  const task = await mongoose.model('Task').findById(this.task);
  const user = await mongoose.model('User').findById(this.user);
  
  if (!task || !user) {
    throw new Error('Task or user not found');
  }
  
  // Award rewards
  if (task.rewards.coins > 0) {
    await user.addCoins(task.rewards.coins);
  }
  
  if (task.rewards.xp > 0) {
    await user.addExperience(task.rewards.xp);
  }
  
  // Mark as claimed
  this.isClaimed = true;
  this.claimedAt = new Date();
  await this.save();
  
  return {
    coins: task.rewards.coins,
    diamonds: task.rewards.diamonds,
    xp: task.rewards.xp,
  };
};

const UserTask = mongoose.model('UserTask', userTaskSchema);

module.exports = UserTask;

