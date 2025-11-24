const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const CoinPackage = require("../models/CoinPackage");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");

/**
 * @route   GET /api/wallet/packages
 * @desc    Get all available coin packages
 * @access  Public
 */
router.get("/packages", async (req, res) => {
  try {
    const packages = await CoinPackage.getActivePackages();

    res.json({
      success: true,
      message: "Coin packages retrieved successfully",
      data: { packages },
    });
  } catch (error) {
    console.error("Get coin packages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve coin packages",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/wallet/balance
 * @desc    Get current user's wallet balance
 * @access  Private
 */
router.get("/balance", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const balance = {
      coins: user.gamification?.coins || 0,
      diamonds: user.gamification?.diamonds || 0,
      points: user.gamification?.points || 0,
    };

    res.json({
      success: true,
      message: "Balance retrieved successfully",
      data: { balance },
    });
  } catch (error) {
    console.error("Get balance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve balance",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/wallet/transactions
 * @desc    Get user's transaction history
 * @access  Private
 */
router.get(
  "/transactions",
  authenticateToken,
  requireSyncedUser,
  [
    query("type")
      .optional()
      .isIn([
        "purchase",
        "gift_sent",
        "gift_received",
        "vip_purchase",
        "mvp_purchase",
        "guardian_purchase",
        "reward",
        "refund",
        "admin_adjustment",
        "withdrawal",
      ])
      .withMessage("Invalid transaction type"),
    query("currency")
      .optional()
      .isIn(["coins", "diamonds", "points"])
      .withMessage("Invalid currency"),
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
      const { type, currency, limit = 50, skip = 0 } = req.query;

      const transactions = await Transaction.getUserTransactions(user._id, {
        type,
        currency,
        limit: parseInt(limit),
        skip: parseInt(skip),
      });

      const total = await Transaction.countDocuments({
        userId: user._id,
        status: "completed",
        ...(type && { type }),
        ...(currency && { currency }),
      });

      res.json({
        success: true,
        message: "Transactions retrieved successfully",
        data: {
          transactions,
          pagination: {
            total,
            limit: parseInt(limit),
            skip: parseInt(skip),
            hasMore: total > parseInt(skip) + transactions.length,
          },
        },
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve transactions",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/wallet/summary
 * @desc    Get wallet summary (balance + stats)
 * @access  Private
 */
router.get("/summary", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const summary = await Transaction.getUserBalanceSummary(user._id);

    res.json({
      success: true,
      message: "Wallet summary retrieved successfully",
      data: { summary },
    });
  } catch (error) {
    console.error("Get wallet summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve wallet summary",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   POST /api/wallet/purchase
 * @desc    Purchase coins/diamonds (payment processing)
 * @access  Private
 */
router.post(
  "/purchase",
  authenticateToken,
  requireSyncedUser,
  [
    body("currency")
      .isIn(["coins", "diamonds"])
      .withMessage("Currency must be coins or diamonds"),
    body("amount")
      .isInt({ min: 1 })
      .withMessage("Amount must be a positive integer"),
    body("paymentMethod")
      .isIn(["stripe", "paypal", "apple_pay", "google_pay"])
      .withMessage("Invalid payment method"),
    body("paymentToken").notEmpty().withMessage("Payment token is required"),
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
      const { currency, amount, paymentMethod, paymentToken } = req.body;

      // TODO: Integrate with actual payment provider (Stripe, PayPal, etc.)
      // For now, we'll simulate a successful payment

      // Calculate real money cost (example rates)
      const rates = {
        coins: 0.01, // $0.01 per coin
        diamonds: 0.10, // $0.10 per diamond
      };

      const realMoneyCost = amount * rates[currency];

      // Create transaction
      const transaction = await Transaction.createTransaction({
        userId: user._id,
        type: "purchase",
        currency,
        amount,
        description: `Purchased ${amount} ${currency}`,
        payment: {
          method: paymentMethod,
          transactionId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount: realMoneyCost,
          currency: "USD",
          status: "completed",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Update user's creditsSent for wealth level calculation
      if (currency === "coins") {
        await User.findByIdAndUpdate(user._id, {
          $inc: { "gamification.creditsSent": amount },
        });

        // Recalculate wealth level
        const updatedUser = await User.findById(user._id);
        const newWealthLevel = updatedUser.calculateWealthLevel();
        await User.findByIdAndUpdate(user._id, {
          "gamification.wealthLevel": newWealthLevel,
        });
      }

      res.json({
        success: true,
        message: "Purchase completed successfully",
        data: {
          transaction,
          newBalance: transaction.balanceAfter,
        },
      });
    } catch (error) {
      console.error("Purchase error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to process purchase",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/wallet/transfer
 * @desc    Transfer coins/diamonds to another user (gift)
 * @access  Private
 */
router.post(
  "/transfer",
  authenticateToken,
  requireSyncedUser,
  [
    body("recipientId")
      .notEmpty()
      .withMessage("Recipient ID is required")
      .isMongoId()
      .withMessage("Invalid recipient ID"),
    body("currency")
      .isIn(["coins", "diamonds"])
      .withMessage("Currency must be coins or diamonds"),
    body("amount")
      .isInt({ min: 1 })
      .withMessage("Amount must be a positive integer"),
    body("message")
      .optional()
      .isLength({ max: 200 })
      .withMessage("Message must be 200 characters or less"),
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
      const { recipientId, currency, amount, message } = req.body;

      // Check if recipient exists
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({
          success: false,
          message: "Recipient not found",
        });
      }

      // Check if user has sufficient balance
      const currentBalance =
        currency === "coins"
          ? user.gamification?.coins || 0
          : user.gamification?.diamonds || 0;

      if (currentBalance < amount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance",
        });
      }

      // Create debit transaction for sender
      const debitTransaction = await Transaction.createTransaction({
        userId: user._id,
        type: "gift_sent",
        currency,
        amount: -amount,
        relatedUserId: recipientId,
        description: message || `Sent ${amount} ${currency} to ${recipient.displayName}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Create credit transaction for recipient
      const creditTransaction = await Transaction.createTransaction({
        userId: recipientId,
        type: "gift_received",
        currency,
        amount: amount,
        relatedUserId: user._id,
        description: message || `Received ${amount} ${currency} from ${user.displayName}`,
      });

      // Update sender's creditsSent and recipient's giftsReceived
      await User.findByIdAndUpdate(user._id, {
        $inc: { "gamification.creditsSent": amount },
      });

      await User.findByIdAndUpdate(recipientId, {
        $inc: { "gamification.giftsReceived": amount },
      });

      // Recalculate levels
      const updatedSender = await User.findById(user._id);
      const newWealthLevel = updatedSender.calculateWealthLevel();
      await User.findByIdAndUpdate(user._id, {
        "gamification.wealthLevel": newWealthLevel,
      });

      const updatedRecipient = await User.findById(recipientId);
      const newLiveLevel = updatedRecipient.calculateLiveLevel();
      await User.findByIdAndUpdate(recipientId, {
        "gamification.liveLevel": newLiveLevel,
      });

      res.json({
        success: true,
        message: "Transfer completed successfully",
        data: {
          debitTransaction,
          creditTransaction,
          newBalance: debitTransaction.balanceAfter,
        },
      });
    } catch (error) {
      console.error("Transfer error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to process transfer",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

module.exports = router;

