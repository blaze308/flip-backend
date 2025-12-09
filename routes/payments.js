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
      const googlePlayPackageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
      const googlePlayPrivateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY;

      if (!googlePlayPackageName || !googlePlayPrivateKey) {
        console.error("Google Play credentials not configured");
        return res.status(500).json({
          success: false,
          message: "Google Play verification not configured",
        });
      }

      // TODO: Implement Google Play verification using androidpublisher API
      // For now, simulate verification
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

module.exports = router;
