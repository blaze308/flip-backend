const express = require("express");
const router = express.Router();
const { query, body, validationResult } = require("express-validator");
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

/**
 * @route   POST /api/gifts/send
 * @desc    Send a gift to another user
 * @access  Private
 */
router.post(
  "/send",
  authenticateJWT,
  requireAuth,
  [
    body("giftId")
      .notEmpty()
      .withMessage("Gift ID is required"),
    body("receiverId")
      .notEmpty()
      .withMessage("Receiver ID is required"),
    body("context")
      .optional()
      .isIn(["live", "profile", "chat", "post"])
      .withMessage("Invalid context"),
    body("contextId")
      .optional()
      .isString()
      .withMessage("Context ID must be a string"),
    body("message")
      .optional()
      .isString()
      .withMessage("Message must be a string"),
    body("quantity")
      .optional()
      .isInt({ min: 1, max: 99 })
      .withMessage("Quantity must be between 1 and 99"),
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

      const { giftId, receiverId, context = "live", contextId, message, quantity = 1 } = req.body;
      const { user } = req;

      // Prevent sending gift to self
      if (receiverId === user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "You cannot send a gift to yourself",
        });
      }

      // Find the gift
      const gift = await Gift.findOne({ giftId: giftId, active: true });
      if (!gift) {
        return res.status(404).json({
          success: false,
          message: "Gift not found or inactive",
        });
      }

      // Calculate total cost
      const totalCost = gift.coins * quantity;

      // Check if user has enough coins
      const User = require("../models/User");
      const sender = await User.findById(user._id);

      if (!sender) {
        return res.status(404).json({
          success: false,
          message: "Sender not found",
        });
      }

      const currentCoins = sender.gamification?.coins || 0;

      if (currentCoins < totalCost) {
        return res.status(400).json({
          success: false,
          message: "Insufficient coins",
          data: {
            required: totalCost,
            current: currentCoins,
            shortfall: totalCost - currentCoins,
          },
        });
      }

      // Verify receiver exists
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: "Receiver not found",
        });
      }

      // Deduct coins from sender
      sender.gamification.coins -= totalCost;
      await sender.save();

      // Create gift sent records (one for each quantity)
      const giftsSent = [];
      for (let i = 0; i < quantity; i++) {
        const giftSent = new GiftSent({
          author: user._id,
          authorId: user._id.toString(),
          receiver: receiverId,
          receiverId: receiverId,
          gift: gift._id,
          giftId: gift.giftId,
          diamondsQuantity: gift.coins,
          context: context,
          liveStreamId: contextId,
        });

        await giftSent.save();
        giftsSent.push(giftSent);
      }

      // Record transaction
      const Transaction = require("../models/Transaction");
      await Transaction.createTransaction({
        userId: user._id,
        type: "gift_sent",
        currency: "coins",
        amount: -totalCost,
        description: `Sent ${quantity}x ${gift.name} to ${receiver.displayName || receiver.username}`,
        metadata: {
          giftId: gift.giftId,
          giftName: gift.name,
          receiverId: receiverId,
          quantity: quantity,
          context: context,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Update Rankings (Rich & Host)
      try {
        const User = require("../models/User");
        // Sender's wealth increase
        await User.findByIdAndUpdate(user._id, { $inc: { "gamification.creditsSent": totalCost } });
        // Receiver's gifts received increase
        await User.findByIdAndUpdate(receiverId, { $inc: { "gamification.giftsReceived": totalCost } });
      } catch (rankError) {
        console.error("Error updating rankings:", rankError);
      }

      // Notify via Socket.IO
      try {
        const { notifyGiftSent } = require("../services/gift_notifications");
        notifyGiftSent(
          {
            giftId: gift.giftId,
            giftName: gift.name,
            giftIcon: gift.iconUrl,
            animation: gift.svgaUrl || gift.fileUrl,
            coins: gift.coins,
            quantity: quantity,
          },
          sender,
          receiver,
          context,
          contextId
        );
      } catch (notifyError) {
        console.error("Error sending gift notification:", notifyError);
      }

      console.log(
        `🎁 Gift sent: ${user._id} → ${receiverId} | ${quantity}x ${gift.name} (${totalCost} coins)`
      );

      res.json({
        success: true,
        message: "Gift sent successfully",
        data: {
          giftsSent: giftsSent,
          totalCost: totalCost,
          remainingCoins: sender.gamification.coins,
        },
      });
    } catch (error) {
      console.error("Send gift error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send gift",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

module.exports = router;

