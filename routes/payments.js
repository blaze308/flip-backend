const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const axios = require("axios");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

/**
 * @route   POST /api/payments/set-preferred-method
 * @desc    Set user's preferred payment method
 * @access  Private
 */
router.post(
  "/set-preferred-method",
  authenticateJWT,
  requireAuth,
  [
    body("paymentMethod")
      .isIn(["ancient_flip_pay", "google_play", "app_store", "paystack"])
      .withMessage("Invalid payment method"),
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
      const { paymentMethod } = req.body;

      // Update user's preferred payment method
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          "preferences.preferredPaymentMethod": paymentMethod,
          "preferences.paymentMethodUpdatedAt": new Date(),
        },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      console.log(`💳 Payment method updated for user ${user._id}: ${paymentMethod}`);

      res.json({
        success: true,
        message: "Payment method updated successfully",
        data: {
          preferredPaymentMethod: updatedUser.preferences?.preferredPaymentMethod,
        },
      });
    } catch (error) {
      console.error("Set preferred payment method error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update payment method",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/payments/available-methods
 * @desc    Get available payment methods for user (based on platform/region)
 * @access  Private
 */
router.get("/available-methods", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const methods = [
      "ancient_flip_pay", // Always available
    ];

    // Determine platform from request header or default to both
    const platform = req.get("x-platform") || "all"; // android, ios, all

    // Add platform-specific IAP
    if (platform === "android" || platform === "all") {
      methods.push("google_play");
    }
    if (platform === "ios" || platform === "all") {
      methods.push("app_store");
    }

    // Add Paystack for all users (available in supported countries)
    methods.push("paystack");

    res.json({
      success: true,
      message: "Available payment methods retrieved",
      data: {
        methods,
        supportedCountries: ["GH", "NG", "ZA", "KE"], // Paystack supported countries
      },
    });
  } catch (error) {
    console.error("Get available methods error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payment methods",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/payments/preferred-method
 * @desc    Get user's preferred payment method
 * @access  Private
 */
router.get("/preferred-method", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const preferredMethod = user.preferences?.preferredPaymentMethod || "ancient_flip_pay";

    res.json({
      success: true,
      message: "Preferred payment method retrieved",
      data: {
        method: preferredMethod,
      },
    });
  } catch (error) {
    console.error("Get preferred method error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve preferred method",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   POST /api/payments/process-ancient-flip-pay
 * @desc    Process payment using AncientFlip Pay (in-app credits/coins)
 * @access  Private
 */
router.post(
  "/process-ancient-flip-pay",
  authenticateJWT,
  requireAuth,
  [
    body("packageId")
      .notEmpty()
      .withMessage("Package ID is required"),
    body("amount")
      .isInt({ min: 1 })
      .withMessage("Amount must be a positive integer"),
    body("description")
      .optional()
      .isLength({ max: 200 })
      .withMessage("Description must be 200 characters or less"),
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
      const { packageId, amount, description, paymentMethod } = req.body;

      // Check user has sufficient balance
      const currentBalance = user.gamification?.coins || 0;
      if (currentBalance < amount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient coins balance",
        });
      }

      // Create transaction record
      const transaction = await Transaction.createTransaction({
        userId: user._id,
        type: "purchase",
        currency: "coins",
        amount: -amount, // Debit
        description: description || `Package purchase: ${packageId}`,
        payment: {
          method: "ancient_flip_pay",
          transactionId: `afp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: "completed",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      console.log(
        `💳 AncientFlip Pay processed for user ${user._id}: ${amount} coins, Package: ${packageId}`
      );

      res.json({
        success: true,
        message: "Payment processed successfully",
        data: {
          transactionId: transaction._id,
          packageId,
          coinsDeducted: amount,
        },
      });
    } catch (error) {
      console.error("Process ancient flip pay error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process payment",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/payments/paystack/initialize
 * @desc    Initialize Paystack payment transaction
 * @access  Private
 */
router.post(
  "/paystack/initialize",
  authenticateJWT,
  requireAuth,
  [
    body("amount")
      .isInt({ min: 1 })
      .withMessage("Amount must be a positive integer"),
    body("email")
      .isEmail()
      .withMessage("Valid email required"),
    body("currency")
      .isIn(["GHS", "NGN", "ZAR", "KES"])
      .withMessage("Currency must be GHS, NGN, ZAR, or KES"),
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

      const { amount, email, currency } = req.body;
      const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

      if (!paystackSecretKey) {
        return res.status(500).json({
          success: false,
          message: "Paystack not configured",
        });
      }

      // Call Paystack API to initialize transaction
      const paystackResponse = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          amount: amount * 100, // Convert to kobo/cents
          email,
          currency,
          metadata: {
            userId: req.user._id.toString(),
          },
        },
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!paystackResponse.data.status) {
        return res.status(400).json({
          success: false,
          message: paystackResponse.data.message || "Paystack initialization failed",
        });
      }

      console.log(
        `🔵 Paystack transaction initialized for user ${req.user._id}: ${amount} ${currency}`
      );

      res.json({
        success: true,
        message: "Payment initialized successfully",
        data: {
          reference: paystackResponse.data.data.reference,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
        },
      });
    } catch (error) {
      console.error("Initialize Paystack transaction error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to initialize payment",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/payments/paystack/verify
 * @desc    Verify Paystack payment and credit coins
 * @access  Private
 */
router.post(
  "/paystack/verify",
  authenticateJWT,
  requireAuth,
  [
    body("reference")
      .notEmpty()
      .withMessage("Payment reference is required"),
    body("coinAmount")
      .isInt({ min: 1 })
      .withMessage("Coin amount must be a positive integer"),
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

      const { reference, coinAmount } = req.body;
      const { user } = req;
      const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

      if (!paystackSecretKey) {
        return res.status(500).json({
          success: false,
          message: "Paystack not configured",
        });
      }

      // Verify with Paystack
      const paystackResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
          },
        }
      );

      if (!paystackResponse.data.status || paystackResponse.data.data.status !== "success") {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
          data: {
            status: paystackResponse.data.data.status,
          },
        });
      }

      // Verify reference belongs to this user
      const paystackData = paystackResponse.data.data;
      if (paystackData.metadata?.userId !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Payment verification failed - user mismatch",
        });
      }

      // Create transaction record
      const transaction = await Transaction.createTransaction({
        userId: user._id,
        type: "purchase",
        currency: "coins",
        amount: coinAmount,
        description: `Paystack purchase - ${coinAmount} coins`,
        payment: {
          method: "paystack",
          transactionId: reference,
          amount: paystackData.amount / 100, // Convert from kobo back to amount
          currency: paystackData.currency,
          status: "completed",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Update user's coins
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: { "gamification.coins": coinAmount },
        },
        { new: true }
      );

      console.log(
        `✅ Paystack payment verified for user ${user._id}: Reference ${reference}, ${coinAmount} coins added`
      );

      res.json({
        success: true,
        message: "Payment verified and coins added",
        data: {
          transactionId: transaction._id,
          coinsAdded: coinAmount,
          newBalance: updatedUser.gamification?.coins,
        },
      });
    } catch (error) {
      console.error("Verify Paystack payment error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to verify payment",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/payments/google-play/verify
 * @desc    Verify Google Play in-app purchase and credit coins
 * @access  Private
 */
router.post(
  "/google-play/verify",
  authenticateJWT,
  requireAuth,
  [
    body("productId")
      .notEmpty()
      .withMessage("Product ID is required"),
    body("purchaseToken")
      .notEmpty()
      .withMessage("Purchase token is required"),
    body("coinAmount")
      .isInt({ min: 1 })
      .withMessage("Coin amount must be a positive integer"),
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

      const { productId, purchaseToken, coinAmount } = req.body;
      const { user } = req;

      // Check if this purchase token has already been used
      const existingTransaction = await Transaction.findOne({
        "payment.transactionId": purchaseToken,
        "payment.method": "google_play",
      });

      if (existingTransaction) {
        console.log(`⚠️ Duplicate Google Play purchase attempt: ${purchaseToken}`);
        return res.status(400).json({
          success: false,
          message: "This purchase has already been processed",
        });
      }

      // TODO: Implement actual Google Play verification using googleapis package
      // For production, use Google Play Developer API to verify purchaseToken
      // For now, basic validation
      const isVerified = purchaseToken && purchaseToken.length > 0;

      if (!isVerified) {
        return res.status(400).json({
          success: false,
          message: "Purchase verification failed",
        });
      }

      // Create transaction record
      const transaction = await Transaction.createTransaction({
        userId: user._id,
        type: "purchase",
        currency: "coins",
        amount: coinAmount,
        description: `Google Play purchase - ${coinAmount} coins`,
        payment: {
          method: "google_play",
          transactionId: purchaseToken,
          productId: productId,
          status: "completed",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Update user's coins
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: { "gamification.coins": coinAmount },
        },
        { new: true }
      );

      console.log(
        `🟢 Google Play purchase verified for user ${user._id}: Product ${productId}, ${coinAmount} coins added`
      );

      res.json({
        success: true,
        message: "Purchase verified and coins added",
        data: {
          transactionId: transaction._id,
          coinsAdded: coinAmount,
          newBalance: updatedUser.gamification?.coins,
        },
      });
    } catch (error) {
      console.error("Verify Google Play purchase error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to verify purchase",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/payments/app-store/verify
 * @desc    Verify App Store in-app purchase and credit coins
 * @access  Private
 */
router.post(
  "/app-store/verify",
  authenticateJWT,
  requireAuth,
  [
    body("productId")
      .notEmpty()
      .withMessage("Product ID is required"),
    body("receipt")
      .notEmpty()
      .withMessage("Receipt is required"),
    body("coinAmount")
      .isInt({ min: 1 })
      .withMessage("Coin amount must be a positive integer"),
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

      const { productId, receipt, coinAmount } = req.body;
      const { user } = req;
      const appStoreSharedSecret = process.env.APP_STORE_SHARED_SECRET;

      if (!appStoreSharedSecret) {
        console.error("App Store credentials not configured");
        return res.status(500).json({
          success: false,
          message: "App Store verification not configured",
        });
      }

      // TODO: Implement App Store verification using App Store Server API
      // For now, simulate verification
      const isVerified = receipt && receipt.length > 0;

      if (!isVerified) {
        return res.status(400).json({
          success: false,
          message: "Receipt verification failed",
        });
      }

      // Create transaction record
      const transaction = await Transaction.createTransaction({
        userId: user._id,
        type: "purchase",
        currency: "coins",
        amount: coinAmount,
        description: `App Store purchase - ${coinAmount} coins`,
        payment: {
          method: "app_store",
          transactionId: `receipt_${Date.now()}`,
          productId: productId,
          status: "completed",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Update user's coins
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: { "gamification.coins": coinAmount },
        },
        { new: true }
      );

      console.log(
        `🍎 App Store purchase verified for user ${user._id}: Product ${productId}, ${coinAmount} coins added`
      );

      res.json({
        success: true,
        message: "Purchase verified and coins added",
        data: {
          transactionId: transaction._id,
          coinsAdded: coinAmount,
          newBalance: updatedUser.gamification?.coins,
        },
      });
    } catch (error) {
      console.error("Verify App Store purchase error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to verify purchase",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/payments/purchase-and-send-gift
 * @desc    Purchase coins and automatically send a gift
 * @access  Private
 */
router.post(
  "/purchase-and-send-gift",
  authenticateJWT,
  requireAuth,
  [
    body("paymentMethod")
      .isIn(["paystack", "google_play", "app_store", "ancient_flip_pay"])
      .withMessage("Invalid payment method"),
    body("coinPackageId")
      .notEmpty()
      .withMessage("Coin package ID is required"),
    body("giftData")
      .isObject()
      .withMessage("Gift data is required"),
    body("giftData.giftId")
      .notEmpty()
      .withMessage("Gift ID is required"),
    body("giftData.receiverId")
      .notEmpty()
      .withMessage("Receiver ID is required"),
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

      const { paymentMethod, coinPackageId, giftData } = req.body;
      const { user } = req;

      // Map coin package IDs to amounts
      const packageCoins = {
        coins_8000: 8000,
        coins_16000: 16000,
        coins_64000: 64000,
        coins_128000: 128000,
        coins_320000: 320000,
        coins_640000: 640000,
        coins_800000: 800000,
      };

      const coinAmount = packageCoins[coinPackageId];
      if (!coinAmount) {
        return res.status(400).json({
          success: false,
          message: "Invalid coin package ID",
        });
      }

      // Verify gift exists
      const Gift = require("../models/Gift");
      const gift = await Gift.findOne({ giftId: giftData.giftId, active: true });
      if (!gift) {
        return res.status(404).json({
          success: false,
          message: "Gift not found or inactive",
        });
      }

      const quantity = giftData.quantity || 1;
      const giftCost = gift.coins * quantity;

      // Verify receiver exists
      const User = require("../models/User");
      const receiver = await User.findById(giftData.receiverId);
      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: "Receiver not found",
        });
      }

      // Step 1: Process payment based on method
      let paymentSuccess = false;
      let paymentReference = "";

      if (paymentMethod === "ancient_flip_pay") {
        // Use existing coins
        const currentCoins = user.gamification?.coins || 0;
        if (currentCoins < coinAmount) {
          return res.status(400).json({
            success: false,
            message: "Insufficient coins in AncientFlip Pay",
          });
        }
        paymentSuccess = true;
        paymentReference = `ancient_pay_${Date.now()}`;
      } else {
        // For Paystack, Google Play, App Store - payment should be verified separately
        // This endpoint assumes payment was already completed
        return res.status(400).json({
          success: false,
          message: "For external payments, complete payment first then use /gifts/send",
        });
      }

      if (!paymentSuccess) {
        return res.status(400).json({
          success: false,
          message: "Payment failed",
        });
      }

      // Step 2: Credit coins to user
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: { "gamification.coins": coinAmount },
        },
        { new: true }
      );

      // Step 3: Record payment transaction
      await Transaction.createTransaction({
        userId: user._id,
        type: "purchase",
        currency: "coins",
        amount: coinAmount,
        description: `Purchased ${coinAmount} coins to send gift`,
        payment: {
          method: paymentMethod,
          transactionId: paymentReference,
          status: "completed",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Step 4: Send the gift
      const GiftSent = require("../models/GiftSent");
      const giftsSent = [];

      for (let i = 0; i < quantity; i++) {
        const giftSent = new GiftSent({
          author: user._id,
          authorId: user._id.toString(),
          receiver: giftData.receiverId,
          receiverId: giftData.receiverId,
          gift: gift._id,
          giftId: gift.giftId,
          diamondsQuantity: gift.coins,
          context: giftData.context || "live",
          liveStreamId: giftData.contextId,
        });

        await giftSent.save();
        giftsSent.push(giftSent);
      }

      // Step 5: Deduct gift cost
      const finalUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: { "gamification.coins": -giftCost },
        },
        { new: true }
      );

      // Step 6: Record gift transaction
      await Transaction.createTransaction({
        userId: user._id,
        type: "gift_sent",
        currency: "coins",
        amount: -giftCost,
        description: `Sent ${quantity}x ${gift.name} to ${receiver.displayName || receiver.username}`,
        metadata: {
          giftId: gift.giftId,
          giftName: gift.name,
          receiverId: giftData.receiverId,
          quantity: quantity,
          purchasedCoins: coinAmount,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      console.log(
        `🎁💰 Purchase and send: ${user._id} bought ${coinAmount} coins, sent ${quantity}x ${gift.name} (${giftCost} coins)`
      );

      res.json({
        success: true,
        message: "Coins purchased and gift sent successfully",
        data: {
          coinsPurchased: coinAmount,
          giftsSent: giftsSent,
          giftCost: giftCost,
          finalBalance: finalUser.gamification.coins,
        },
      });
    } catch (error) {
      console.error("Purchase and send gift error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to purchase and send gift",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

module.exports = router;
