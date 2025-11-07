const express = require("express");
const router = express.Router();
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const DailyReward = require("../models/DailyReward");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const moment = require("moment");

// Daily reward amounts (7-day cycle)
const DAILY_REWARDS = [
  { day: 1, coins: 100, diamonds: 0 },
  { day: 2, coins: 150, diamonds: 0 },
  { day: 3, coins: 200, diamonds: 0 },
  { day: 4, coins: 250, diamonds: 0 },
  { day: 5, coins: 300, diamonds: 0 },
  { day: 6, coins: 400, diamonds: 0 },
  { day: 7, coins: 500, diamonds: 10 }, // Bonus on day 7
];

// @route   GET /api/rewards/daily/status
// @desc    Get daily reward status for current user
// @access  Private
router.get("/daily/status", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const user = req.user;

    // Get last claimed reward
    const lastReward = await DailyReward.findOne({ user: user._id })
      .sort({ claimedAt: -1 })
      .limit(1);

    const now = moment();
    let canClaim = true;
    let nextDay = 1;
    let streakCount = 0;

    if (lastReward) {
      const lastClaimDate = moment(lastReward.claimedAt);
      const hoursSinceLastClaim = now.diff(lastClaimDate, 'hours');

      // Check if already claimed today
      if (hoursSinceLastClaim < 24) {
        canClaim = false;
        nextDay = lastReward.day;
      } else if (hoursSinceLastClaim < 48) {
        // Within grace period - continue streak
        nextDay = (lastReward.day % 7) + 1;
        streakCount = lastReward.streakCount;
      } else {
        // Streak broken - reset to day 1
        nextDay = 1;
        streakCount = 0;
      }
    }

    const nextReward = DAILY_REWARDS.find((r) => r.day === nextDay);

    res.json({
      success: true,
      message: "Daily reward status retrieved",
      data: {
        canClaim,
        nextDay,
        nextReward,
        streakCount,
        lastClaimedAt: lastReward?.claimedAt,
        allRewards: DAILY_REWARDS,
      },
    });
  } catch (error) {
    console.error("Get daily reward status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get daily reward status",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// @route   POST /api/rewards/daily/claim
// @desc    Claim daily login reward
// @access  Private
router.post("/daily/claim", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const user = req.user;

    // Get last claimed reward
    const lastReward = await DailyReward.findOne({ user: user._id })
      .sort({ claimedAt: -1 })
      .limit(1);

    const now = moment();
    let nextDay = 1;
    let streakCount = 1;

    if (lastReward) {
      const lastClaimDate = moment(lastReward.claimedAt);
      const hoursSinceLastClaim = now.diff(lastClaimDate, 'hours');

      // Check if already claimed today
      if (hoursSinceLastClaim < 24) {
        return res.status(400).json({
          success: false,
          message: "Daily reward already claimed today",
        });
      }

      // Check streak
      if (hoursSinceLastClaim < 48) {
        // Continue streak
        nextDay = (lastReward.day % 7) + 1;
        streakCount = lastReward.streakCount + 1;
      }
      // else: streak broken, reset to day 1
    }

    const rewardData = DAILY_REWARDS.find((r) => r.day === nextDay);
    if (!rewardData) {
      return res.status(500).json({
        success: false,
        message: "Invalid reward day",
      });
    }

    // Create reward record
    const reward = await DailyReward.create({
      user: user._id,
      day: nextDay,
      coins: rewardData.coins,
      diamonds: rewardData.diamonds,
      streakCount,
    });

    // Credit coins to user
    await user.addCoins(rewardData.coins);

    // Award XP
    await user.addExperience(10); // 10 XP for daily login

    // Create transaction record
    await Transaction.create({
      receiver: user._id,
      type: "reward",
      currency: "coins",
      amount: rewardData.coins,
      status: "completed",
      metadata: {
        source: "daily_reward",
        day: nextDay,
        streakCount,
      },
    });

    res.json({
      success: true,
      message: "Daily reward claimed successfully!",
      data: {
        reward: {
          day: nextDay,
          coins: rewardData.coins,
          diamonds: rewardData.diamonds,
          streakCount,
        },
        nextDay: (nextDay % 7) + 1,
      },
    });
  } catch (error) {
    console.error("Claim daily reward error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to claim daily reward",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// @route   GET /api/rewards/history
// @desc    Get reward claim history for current user
// @access  Private
router.get("/history", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const rewards = await DailyReward.find({ user: user._id })
      .sort({ claimedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DailyReward.countDocuments({ user: user._id });

    res.json({
      success: true,
      message: "Reward history retrieved",
      data: {
        rewards,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get reward history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get reward history",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

module.exports = router;

