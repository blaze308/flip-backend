const express = require("express");
const router = express.Router();
const { query, validationResult } = require("express-validator");
const GiftSent = require("../models/GiftSent");
const Gift = require("../models/Gift");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");

/**
 * @route   GET /api/gifts
 * @desc    Get all available gifts
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    const gifts = await Gift.find({ isActive: true }).sort({ weight: 1 });

    res.json({
      success: true,
      message: "Gifts retrieved successfully",
      data: { gifts },
    });
  } catch (error) {
    console.error("Get gifts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve gifts",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/gifts/received
 * @desc    Get gifts received by current user
 * @access  Private
 */
router.get(
  "/received",
  authenticateJWT,
  requireAuth,
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("skip")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Skip must be a positive number"),
    query("context")
      .optional()
      .isIn(["live", "profile", "chat", "post"])
      .withMessage("Invalid context"),
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
      const { limit = 50, skip = 0, context } = req.query;

      const query = { receiverId: user._id.toString() };
      if (context) query.context = context;

      const gifts = await GiftSent.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .populate("author", "displayName photoURL username")
        .populate("gift")
        .lean();

      const total = await GiftSent.countDocuments(query);

      // Calculate total value received
      const totalValue = gifts.reduce(
        (sum, g) => sum + g.diamondsQuantity,
        0
      );

      res.json({
        success: true,
        message: "Received gifts retrieved successfully",
        data: {
          gifts,
          totalValue,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip),
            hasMore: total > parseInt(skip) + gifts.length,
          },
        },
      });
    } catch (error) {
      console.error("Get received gifts error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve received gifts",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/gifts/sent
 * @desc    Get gifts sent by current user
 * @access  Private
 */
router.get(
  "/sent",
  authenticateJWT,
  requireAuth,
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("skip")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Skip must be a positive number"),
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
      const { limit = 50, skip = 0 } = req.query;

      const gifts = await GiftSent.find({ authorId: user._id.toString() })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .populate("receiver", "displayName photoURL username")
        .populate("gift")
        .lean();

      const total = await GiftSent.countDocuments({
        authorId: user._id.toString(),
      });

      // Calculate total value sent
      const totalValue = gifts.reduce(
        (sum, g) => sum + g.diamondsQuantity,
        0
      );

      res.json({
        success: true,
        message: "Sent gifts retrieved successfully",
        data: {
          gifts,
          totalValue,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip),
            hasMore: total > parseInt(skip) + gifts.length,
          },
        },
      });
    } catch (error) {
      console.error("Get sent gifts error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve sent gifts",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/gifts/stats
 * @desc    Get gift statistics for current user
 * @access  Private
 */
router.get(
  "/stats",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = req;

      // Get sent stats
      const sentStats = await GiftSent.getTotalGiftsSent(user._id.toString());

      // Get received stats
      const receivedStats = await GiftSent.getTotalGiftsReceived(
        user._id.toString()
      );

      // Get top senders (users who sent gifts to current user)
      const topSenders = await GiftSent.aggregate([
        { $match: { receiverId: user._id.toString() } },
        {
          $group: {
            _id: "$authorId",
            totalGifts: { $sum: 1 },
            totalValue: { $sum: "$diamondsQuantity" },
          },
        },
        { $sort: { totalValue: -1 } },
        { $limit: 10 },
      ]);

      // Populate sender info
      const topSendersWithInfo = await Promise.all(
        topSenders.map(async (sender) => {
          const User = require("../models/User");
          const userInfo = await User.findById(sender._id).select(
            "displayName photoURL username"
          );
          return {
            user: userInfo,
            totalGifts: sender.totalGifts,
            totalValue: sender.totalValue,
          };
        })
      );

      res.json({
        success: true,
        message: "Gift statistics retrieved successfully",
        data: {
          sent: sentStats,
          received: receivedStats,
          topSenders: topSendersWithInfo,
        },
      });
    } catch (error) {
      console.error("Get gift stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve gift statistics",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/gifts/user/:userId/received
 * @desc    Get gifts received by a specific user (public)
 * @access  Public
 */
router.get(
  "/user/:userId/received",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("skip")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Skip must be a positive number"),
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

      const { userId } = req.params;
      const { limit = 20, skip = 0 } = req.query;

      const gifts = await GiftSent.find({ receiverId: userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .populate("author", "displayName photoURL username")
        .populate("gift")
        .lean();

      const total = await GiftSent.countDocuments({ receiverId: userId });

      res.json({
        success: true,
        message: "Received gifts retrieved successfully",
        data: {
          gifts,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip),
            hasMore: total > parseInt(skip) + gifts.length,
          },
        },
      });
    } catch (error) {
      console.error("Get user received gifts error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve received gifts",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

module.exports = router;

