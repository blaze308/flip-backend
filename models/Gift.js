const mongoose = require("mongoose");

/**
 * Gift Schema for MongoDB
 * Defines available gifts that users can send
 */
const giftSchema = new mongoose.Schema(
  {
    // Gift Identification
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    giftId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Gift Media
    iconUrl: {
      type: String,
      required: true,
    },
    svgaUrl: {
      type: String, // SVGA animation URL
    },
    fileUrl: {
      type: String, // Lottie JSON URL or other format
    },

    // Gift Type
    type: {
      type: String,
      enum: ["svga", "lottie", "mp4", "gif"],
      default: "svga",
    },

    // Cost
    coins: {
      type: Number,
      required: true,
      min: 0,
    },
    weight: {
      type: Number, // Same as coins, for compatibility
      required: true,
      min: 0,
    },

    // Category
    category: {
      type: String,
      enum: ["basic", "premium", "luxury", "special"],
      default: "basic",
    },

    // Availability
    active: {
      type: Boolean,
      default: true,
    },

    // Display Order
    sortOrder: {
      type: Number,
      default: 0,
    },

    // Special Properties
    isAnimated: {
      type: Boolean,
      default: true,
    },
    duration: {
      type: Number, // Animation duration in seconds
      default: 3,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
giftSchema.index({ active: 1, sortOrder: 1 });
giftSchema.index({ category: 1, coins: 1 });
giftSchema.index({ coins: 1 });

// Virtual for display
giftSchema.virtual("displayPrice").get(function () {
  if (this.coins >= 1000) {
    return `${(this.coins / 1000).toFixed(1)}K`;
  }
  return this.coins.toString();
});

// Static method to get all active gifts
giftSchema.statics.getActiveGifts = function () {
  return this.find({ active: true }).sort({ sortOrder: 1, coins: 1 });
};

// Static method to get gifts by category
giftSchema.statics.getGiftsByCategory = function (category) {
  return this.find({ active: true, category: category }).sort({
    sortOrder: 1,
    coins: 1,
  });
};

// Static method to get gifts by price range
giftSchema.statics.getGiftsByPriceRange = function (minCoins, maxCoins) {
  return this.find({
    active: true,
    coins: { $gte: minCoins, $lte: maxCoins },
  }).sort({ coins: 1 });
};

module.exports = mongoose.model("Gift", giftSchema);

