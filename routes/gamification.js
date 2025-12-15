const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");

const router = express.Router();

/**
 * GET /api/gamification/levels
 *
 * Get user's current levels and stats
 */
router.get("/levels", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    // Check and expire subscriptions
    await user.checkAndExpireSubscriptions();

    res.json({
      success: true,
      message: "Levels retrieved successfully",
      data: {
        gamification: user.gamification || {},
        levels: {
          wealth: {
            level: user.gamification?.wealthLevel || 0,
            creditsSent: user.gamification?.creditsSent || 0,
            nextLevelAt: getNextWealthThreshold(
              user.gamification?.wealthLevel || 0
            ),
          },
          live: {
            level: user.gamification?.liveLevel || 0,
            giftsReceived: user.gamification?.giftsReceived || 0,
            nextLevelAt: getNextLiveThreshold(
              user.gamification?.liveLevel || 0
            ),
          },
        },
        currency: {
          coins: user.gamification?.coins || 0,
          diamonds: user.gamification?.diamonds || 0,
          points: user.gamification?.points || 0,
        },
        subscriptions: {
          vip: {
            isNormalVip: user.gamification?.isNormalVip || false,
            isSuperVip: user.gamification?.isSuperVip || false,
            isDiamondVip: user.gamification?.isDiamondVip || false,
            expiresAt: user.gamification?.vipExpiresAt,
          },
          mvp: {
            isActive: user.gamification?.isMVP || false,
            expiresAt: user.gamification?.mvpExpiresAt,
          },
          guardian: {
            type: user.gamification?.guardianType,
            expiresAt: user.gamification?.guardianExpiresAt,
            guardingUserId: user.gamification?.guardingUserId,
          },
        },
      },
    });
  } catch (error) {
    console.error("Get levels error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve levels",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * POST /api/gamification/vip/purchase
 *
 * Purchase VIP subscription
 */
router.post(
  "/vip/purchase",
  authenticateJWT,
  requireAuth,
  [
    body("tier")
      .isIn(["normal", "super", "diamond"])
      .withMessage("Invalid VIP tier"),
    body("months")
      .isInt({ min: 1, max: 12 })
      .withMessage("Months must be between 1 and 12"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const { tier, months } = req.body;

      // VIP prices per month
      const prices = {
        normal: 95000,
        super: 100000,
        diamond: 250000,
      };

      const totalCost = prices[tier] * months;
      const currentCoins = user.gamification?.coins || 0;

      if (currentCoins < totalCost) {
        return res.status(400).json({
          success: false,
          message: "Insufficient coins",
          code: "INSUFFICIENT_COINS",
          required: totalCost,
          current: currentCoins,
        });
      }

      // Deduct coins
      await user.deductCoins(totalCost);

      // Activate VIP
      await user.activateVIP(tier, months);

      // Add credits sent for wealth level
      await user.addCreditsSent(totalCost);

      // Log purchase
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "vip_purchase",
        success: true,
        details: {
          tier,
          months,
          cost: totalCost,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: `${tier.charAt(0).toUpperCase() + tier.slice(1)} VIP activated for ${months} month(s)`,
        data: {
          tier,
          months,
          cost: totalCost,
          expiresAt: user.gamification.vipExpiresAt,
          remainingCoins: user.gamification.coins,
        },
      });
    } catch (error) {
      console.error("VIP purchase error:", error);

      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.user?.firebaseUid,
        action: "vip_purchase",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: error.message || "Failed to purchase VIP",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /api/gamification/mvp/purchase
 *
 * Purchase MVP subscription
 * Accepts durationDays to align with mobile packages (30, 90, 180, 365).
 */
router.post(
  "/mvp/purchase",
  authenticateJWT,
  requireAuth,
  [
    body("durationDays")
      .isInt({ min: 30, max: 365 })
      .withMessage("durationDays must be between 30 and 365"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const { durationDays } = req.body;

      // Map mobile package durations to months + price table (keeps discounts)
      const pricingTable = {
        30: { months: 1, cost: 7085 },
        90: { months: 3, cost: 20000 },
        180: { months: 6, cost: 38000 },
        365: { months: 12, cost: 70000 },
      };

      const selected = pricingTable[durationDays];
      if (!selected) {
        return res.status(400).json({
          success: false,
          message: "Invalid MVP duration",
          code: "INVALID_DURATION",
        });
      }

      const { months, cost: totalCost } = selected;
      const currentCoins = user.gamification?.coins || 0;

      if (currentCoins < totalCost) {
        return res.status(400).json({
          success: false,
          message: "Insufficient coins",
          code: "INSUFFICIENT_COINS",
          required: totalCost,
          current: currentCoins,
        });
      }

      // Deduct coins
      await user.deductCoins(totalCost);

      // Activate MVP (expects months)
      await user.activateMVP(months);

      // Add credits sent for wealth level
      await user.addCreditsSent(totalCost);

      // Log purchase
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "mvp_purchase",
        success: true,
        details: {
          months,
          durationDays,
          cost: totalCost,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: `MVP activated for ${months} month(s)`,
        data: {
          months,
          durationDays,
          cost: totalCost,
          expiresAt: user.gamification.mvpExpiresAt,
          remainingCoins: user.gamification.coins,
        },
      });
    } catch (error) {
      console.error("MVP purchase error:", error);

      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.user?.firebaseUid,
        action: "mvp_purchase",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: error.message || "Failed to purchase MVP",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /api/gamification/guardian/purchase
 *
 * Purchase Guardian subscription
 */
router.post(
  "/guardian/purchase",
  authenticateJWT,
  requireAuth,
  [
    body("type")
      .isIn(["silver", "gold", "king"])
      .withMessage("Invalid guardian type"),
    body("months")
      .isInt({ min: 1, max: 12 })
      .withMessage("Months must be between 1 and 12"),
    body("targetUserId")
      .notEmpty()
      .withMessage("Target user ID is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const { type, months, targetUserId } = req.body;

      // Guardian prices per month
      const prices = {
        silver: 15000,
        gold: 30000,
        king: 150000,
      };

      const totalCost = prices[type] * months;
      const currentCoins = user.gamification?.coins || 0;

      if (currentCoins < totalCost) {
        return res.status(400).json({
          success: false,
          message: "Insufficient coins",
          code: "INSUFFICIENT_COINS",
          required: totalCost,
          current: currentCoins,
        });
      }

      // Check if target user exists
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "Target user not found",
        });
      }

      // Deduct coins
      await user.deductCoins(totalCost);

      // Activate Guardian
      await user.activateGuardian(type, months, targetUserId);

      // Update target user's guardedBy field
      if (!targetUser.gamification) targetUser.gamification = {};
      targetUser.gamification.guardedByUserId = user._id;
      await targetUser.save();

      // Add credits sent for wealth level
      await user.addCreditsSent(totalCost);

      // Log purchase
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "guardian_purchase",
        success: true,
        details: {
          type,
          months,
          cost: totalCost,
          targetUserId,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: `${type.charAt(0).toUpperCase() + type.slice(1)} Guardian activated for ${months} month(s)`,
        data: {
          type,
          months,
          cost: totalCost,
          targetUser: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          expiresAt: user.gamification.guardianExpiresAt,
          remainingCoins: user.gamification.coins,
        },
      });
    } catch (error) {
      console.error("Guardian purchase error:", error);

      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.user?.firebaseUid,
        action: "guardian_purchase",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: error.message || "Failed to purchase Guardian",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /api/gamification/coins/add
 *
 * Add coins to user (for testing or admin purposes)
 */
router.post(
  "/coins/add",
  authenticateJWT,
  requireAuth,
  [
    body("amount")
      .isInt({ min: 1 })
      .withMessage("Amount must be a positive integer"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const { amount } = req.body;

      await user.addCoins(amount);

      // Log coin addition
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "coins_add",
        success: true,
        details: {
          amount,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: `${amount} coins added`,
        data: {
          coins: user.gamification.coins,
        },
      });
    } catch (error) {
      console.error("Add coins error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to add coins",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

// Helper functions
function getNextWealthThreshold(currentLevel) {
  const wealthThresholds = [
    0, 3000, 6000, 16000, 30000, 52000, 85000, 137000, 214000, 323000, 492000,
    741000, 1100000, 1690000, 2528000, 3637000, 5137000, 7337000, 10137000,
    14137000, 19137000, 26137000, 35137000, 47137000, 62137000, 81137000,
    105137000, 135137000, 172137000, 218137000, 275137000, 345137000,
    430137000, 533137000, 657137000, 805137000, 981137000, 1189137000,
    1433137000, 1717137000, 2047137000, 2427137000, 2863137000, 3361137000,
    3927137000, 4567137000, 5289137000, 6099137000, 7005137000, 8015137000,
    9137137000, 10379137000, 11749137000, 13255137000, 14905137000,
    16707137000, 18669137000, 20799137000, 23105137000, 25595137000,
    28277137000, 31159137000, 34249137000, 37555137000, 41085137000,
    44847137000, 48849137000, 53099137000, 57605137000, 62375137000,
    67417137000, 72739137000, 78349137000, 84255137000, 90465137000,
    96987137000, 103829137000, 110999137000, 118505137000, 126355137000,
    134557137000, 143119137000, 152049137000, 161355137000, 171045137000,
    181127137000, 191609137000, 202499137000, 213805137000, 225535137000,
    237697137000, 250299137000, 263349137000, 276855137000, 290825137000,
    305267137000, 320189137000, 335599137000, 351505137000, 367915137000,
    384837137000, 402279137000, 420249137000, 438755137000, 457805137000,
    477407137000, 497569137000, 518299137000, 539605137000, 561495137000,
    583977137000, 607059137000, 630749137000, 655055137000, 679985137000,
    705547137000, 731749137000, 758599137000, 786105137000, 814275137000,
    843117137000, 872639137000, 902849137000, 933755137000, 965365137000,
    997687137000, 1030729137000, 1064499137000, 1099005137000, 1134255137000,
    1170257137000, 1207019137000, 1244549137000, 1282855137000, 1321945137000,
    1361827137000, 1402509137000, 1443999137000, 1486305137000, 1529435137000,
    1573397137000, 1618199137000, 1663849137000, 1710355137000, 1757725137000,
    1805967137000, 1855089137000, 1905099137000, 1956005137000, 2007815137000,
    2060537137000, 2114179137000, 2168749137000, 2224255137000, 2280705137000,
    2338107137000, 2396469137000, 2455799137000, 2516105137000, 2577395137000,
    2639677137000, 2702959137000, 2767249137000, 2832555137000, 2898885137000,
    2966247137000, 3034649137000, 3104099137000, 3174605137000, 3246175137000,
    3318817137000, 3392539137000, 3467349137000, 3543255137000, 3620265137000,
    3698387137000, 3777629137000, 3857999137000, 3939505137000, 4022155137000,
    4105957137000, 4190919137000, 4277049137000, 4364355137000, 4452845137000,
    4542527137000, 4633409137000, 4725499137000, 4818805137000, 4913335137000,
    5009097137000, 5106099137000, 5204349137000, 5303855137000, 5404625137000,
    5506667137000, 5609989137000, 5714599137000, 5820505137000, 5927715137000,
    6036237137000, 6146079137000, 6257249137000, 6369755137000,
  ];

  if (currentLevel >= wealthThresholds.length - 1) {
    return null; // Max level reached
  }

  return wealthThresholds[currentLevel + 1];
}

function getNextLiveThreshold(currentLevel) {
  const liveThresholds = [
    0, 10000, 70000, 250000, 630000, 1410000, 3010000, 5710000, 10310000,
    18110000, 31010000, 52010000, 85010000, 137010000, 214010000, 323010000,
    492010000, 741010000, 1100010000, 1689010000, 2528010000, 3637010000,
    5137010000, 7337010000, 10137010000, 14137010000, 19137010000, 26137010000,
    35137010000, 47137010000, 62137010000, 81137010000, 105137010000,
    135137010000, 172137010000, 218137010000, 275137010000, 345137010000,
    430137010000, 533137010000,
  ];

  if (currentLevel >= liveThresholds.length - 1) {
    return null; // Max level reached
  }

  return liveThresholds[currentLevel + 1];
}

module.exports = router;

