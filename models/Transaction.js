const mongoose = require("mongoose");

/**
 * Transaction Model
 * Tracks all coin/diamond transactions (purchases, gifts, earnings, etc.)
 */
const transactionSchema = new mongoose.Schema(
  {
    // User who made the transaction
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Transaction type
    type: {
      type: String,
      enum: [
        "purchase", // Buying coins/diamonds with real money
        "gift_sent", // Sending a gift
        "gift_received", // Receiving a gift
        "vip_purchase", // Buying VIP membership
        "mvp_purchase", // Buying MVP membership
        "guardian_purchase", // Buying Guardian status
        "reward", // System reward (daily login, achievement, etc.)
        "refund", // Refund for a purchase
        "admin_adjustment", // Manual adjustment by admin
        "withdrawal", // Cashing out (if supported)
      ],
      required: true,
      index: true,
    },

    // Currency type
    currency: {
      type: String,
      enum: ["coins", "diamonds", "points"],
      required: true,
    },

    // Amount (positive for credit, negative for debit)
    amount: {
      type: Number,
      required: true,
    },

    // Balance after transaction
    balanceAfter: {
      type: Number,
      required: true,
    },

    // Related user (for gifts, guardian purchases, etc.)
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Related entity (gift, live stream, etc.)
    relatedEntityType: {
      type: String,
      enum: ["gift", "live_stream", "post", "chat", "vip", "mvp", "guardian", null],
      default: null,
    },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Payment details (for purchases)
    payment: {
      method: {
        type: String,
        enum: ["stripe", "paypal", "apple_pay", "google_pay", "admin", null],
        default: null,
      },
      transactionId: String, // External payment provider transaction ID
      amount: Number, // Real money amount
      currency: String, // USD, EUR, etc.
      status: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded", null],
        default: null,
      },
    },

    // Description
    description: {
      type: String,
      maxlength: 500,
    },

    // Metadata (flexible field for additional data)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "completed",
      index: true,
    },

    // IP address for security
    ipAddress: String,

    // User agent
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, currency: 1, createdAt: -1 });
transactionSchema.index({ "payment.transactionId": 1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// Static method to get user's transaction history
transactionSchema.statics.getUserTransactions = async function (
  userId,
  { type, currency, limit = 50, skip = 0 } = {}
) {
  const query = { userId, status: "completed" };

  if (type) query.type = type;
  if (currency) query.currency = currency;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate("relatedUserId", "displayName photoURL username")
    .lean();
};

// Static method to get user's balance summary
transactionSchema.statics.getUserBalanceSummary = async function (userId) {
  const transactions = await this.find({
    userId,
    status: "completed",
  }).sort({ createdAt: -1 });

  // Get latest balance for each currency
  const latestCoins = transactions.find((t) => t.currency === "coins");
  const latestDiamonds = transactions.find((t) => t.currency === "diamonds");
  const latestPoints = transactions.find((t) => t.currency === "points");

  // Calculate totals
  const totalSpent = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalEarned = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    coins: latestCoins?.balanceAfter || 0,
    diamonds: latestDiamonds?.balanceAfter || 0,
    points: latestPoints?.balanceAfter || 0,
    totalSpent,
    totalEarned,
    transactionCount: transactions.length,
  };
};

// Static method to create a transaction
transactionSchema.statics.createTransaction = async function (data) {
  const User = mongoose.model("User");

  // Get current user balance
  const user = await User.findById(data.userId);
  if (!user) {
    throw new Error("User not found");
  }

  let currentBalance = 0;
  switch (data.currency) {
    case "coins":
      currentBalance = user.gamification?.coins || 0;
      break;
    case "diamonds":
      currentBalance = user.gamification?.diamonds || 0;
      break;
    case "points":
      currentBalance = user.gamification?.points || 0;
      break;
  }

  // Calculate new balance
  const newBalance = currentBalance + data.amount;

  // Prevent negative balance (unless it's an admin adjustment)
  if (newBalance < 0 && data.type !== "admin_adjustment") {
    throw new Error("Insufficient balance");
  }

  // Create transaction
  const transaction = await this.create({
    ...data,
    balanceAfter: newBalance,
    status: data.status || "completed",
  });

  // Update user balance
  const updateField = `gamification.${data.currency}`;
  await User.findByIdAndUpdate(data.userId, {
    [updateField]: newBalance,
  });

  return transaction;
};

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;

