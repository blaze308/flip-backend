const mongoose = require("mongoose");

/**
 * Subscription Model
 * Tracks all user subscriptions (VIP, MVP, Guardian)
 */
const subscriptionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: ["vip", "mvp", "guardian"],
            required: true,
            index: true,
        },

        tier: {
            type: String,
            enum: ["normal", "super", "diamond", "silver", "gold", "king", "premium"],
            default: "premium",
        },

        status: {
            type: String,
            enum: ["active", "expired", "cancelled", "pending"],
            default: "active",
            index: true,
        },

        startDate: {
            type: Date,
            default: Date.now,
        },

        endDate: {
            type: Date,
            required: true,
        },

        autoRenew: {
            type: Boolean,
            default: false,
        },

        paymentMethod: {
            type: String,
            enum: ["coins", "google_play", "app_store", "stripe", "admin"],
            required: true,
        },

        externalTransactionId: {
            type: String,
            default: null,
        },

        // For Guardian subscription: which user is being guarded
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    }
);

// Index for checking active subscriptions efficiently
subscriptionSchema.index({ userId: 1, type: 1, status: 1, endDate: -1 });

// Instance method to check if subscription is currently valid
subscriptionSchema.methods.isValid = function () {
    return this.status === "active" && this.endDate > new Date();
};

const Subscription = mongoose.model("Subscription", subscriptionSchema);

module.exports = Subscription;
