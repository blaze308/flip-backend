const express = require("express");
const router = express.Router();
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const Ranking = require("../models/Ranking");
const GiftSent = require("../models/GiftSent");
const User = require("../models/User");
const moment = require("moment");

// @route   GET /api/rankings/:type/:period
// @desc    Get rankings (host or rich, daily or weekly)
// @access  Private
router.get("/:type/:period", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { type, period } = req.params;
    const user = req.user;

    // Validate parameters
    if (!['host', 'rich'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ranking type. Must be 'host' or 'rich'",
      });
    }

    if (!['daily', 'weekly'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Must be 'daily' or 'weekly'",
      });
    }

    // Calculate period start
    const now = moment();
    let periodStart;
    
    if (period === 'daily') {
      periodStart = now.startOf('day').toDate();
    } else {
      periodStart = now.startOf('week').toDate();
    }

    // Get top 40 rankings
    const rankings = await Ranking.getTopRankings(type, period, periodStart, 40);

    // Calculate ranks
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
      ranking.rewardCoins = Ranking.calculateReward(index + 1);
    });

    // Save ranks
    await Promise.all(rankings.map((r) => r.save()));

    // Find current user's ranking
    const userRanking = rankings.find(
      (r) => r.user._id.toString() === user._id.toString()
    );

    res.json({
      success: true,
      message: "Rankings retrieved successfully",
      data: {
        rankings: rankings.map((r) => ({
          rank: r.rank,
          user: {
            id: r.user._id,
            displayName: r.user.displayName,
            username: r.user.profile?.username,
            photoURL: r.user.photoURL,
            wealthLevel: r.user.gamification?.wealthLevel,
            liveLevel: r.user.gamification?.liveLevel,
            isVip: r.user.gamification?.isNormalVip || r.user.gamification?.isSuperVip || r.user.gamification?.isDiamondVip,
            isMVP: r.user.gamification?.isMVP,
          },
          score: r.score,
          rewardCoins: r.rewardCoins,
          rewardClaimed: r.rewardClaimed,
        })),
        userRanking: userRanking
          ? {
              rank: userRanking.rank,
              score: userRanking.score,
              rewardCoins: userRanking.rewardCoins,
              rewardClaimed: userRanking.rewardClaimed,
            }
          : null,
        period: {
          type: period,
          start: periodStart,
          end: period === 'daily' ? moment(periodStart).endOf('day').toDate() : moment(periodStart).endOf('week').toDate(),
        },
      },
    });
  } catch (error) {
    console.error("Get rankings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get rankings",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// @route   POST /api/rankings/claim
// @desc    Claim ranking reward
// @access  Private
router.post("/claim", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { type, period, periodStart } = req.body;

    // Find ranking
    const ranking = await Ranking.findOne({
      user: user._id,
      type,
      period,
      periodStart: new Date(periodStart),
    });

    if (!ranking) {
      return res.status(404).json({
        success: false,
        message: "Ranking not found",
      });
    }

    // Claim reward
    const rewardCoins = await ranking.claimReward();

    res.json({
      success: true,
      message: `Ranking reward claimed! You received ${rewardCoins} coins.`,
      data: {
        rewardCoins,
      },
    });
  } catch (error) {
    console.error("Claim ranking reward error:", error);
    
    if (error.message === "Reward already claimed" || error.message === "No reward available for this rank") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to claim ranking reward",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// @route   GET /api/rankings/rules
// @desc    Get ranking rules and reward structure
// @access  Public
router.get("/rules", async (req, res) => {
  try {
    const rewardStructure = [];
    for (let rank = 1; rank <= 40; rank++) {
      rewardStructure.push({
        rank,
        coins: Ranking.calculateReward(rank),
      });
    }

    res.json({
      success: true,
      message: "Ranking rules retrieved",
      data: {
        types: {
          host: {
            title: "Host Ranking",
            description: "Top streamers by gifts received",
            metric: "Total diamonds from gifts received",
          },
          rich: {
            title: "Rich Ranking",
            description: "Top spenders by coins sent",
            metric: "Total coins sent as gifts",
          },
        },
        periods: {
          daily: {
            title: "Daily Rankings",
            description: "Resets every day at midnight",
            duration: "24 hours",
          },
          weekly: {
            title: "Weekly Rankings",
            description: "Resets every Monday at midnight",
            duration: "7 days",
          },
        },
        rewards: rewardStructure,
        claimRequirements: {
          minimumRank: 40,
          claimWindow: "24 hours after period ends",
        },
      },
    });
  } catch (error) {
    console.error("Get ranking rules error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get ranking rules",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

module.exports = router;

