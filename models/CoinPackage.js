const mongoose = require("mongoose");

/**
 * Coin Package Model
 * Defines available coin packages for purchase
 */
const coinPackageSchema = new mongoose.Schema(
  {
    // Package Identification
    productId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Package Details
    coins: {
      type: Number,
      required: true,
      min: 1,
    },

    // Pricing (in USD, will be converted based on user currency)
    priceUSD: {
      type: Number,
      required: true,
      min: 0,
    },

    // Display Information
    displayName: {
      type: String,
      required: true,
    },
    description: String,
    image: String,

    // Package Type
    type: {
      type: String,
      enum: ["normal", "popular", "hot", "best_value"],
      default: "normal",
    },

    // Bonus
    bonusCoins: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Discount
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Availability
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Platform-specific product IDs
    googlePlayProductId: String,
    appStoreProductId: String,

    // Sort order
    sortOrder: {
      type: Number,
      default: 0,
    },

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
coinPackageSchema.index({ isActive: 1, sortOrder: 1 });
coinPackageSchema.index({ type: 1, sortOrder: 1 });

// Virtual for total coins (coins + bonus)
coinPackageSchema.virtual("totalCoins").get(function () {
  return this.coins + this.bonusCoins;
});

// Static method to get all active packages
coinPackageSchema.statics.getActivePackages = async function () {
  return this.find({ isActive: true }).sort({ sortOrder: 1, priceUSD: 1 });
};

// Static method to get package by product ID
coinPackageSchema.statics.getByProductId = async function (productId) {
  return this.findOne({ productId, isActive: true });
};

// Static method to seed default packages
coinPackageSchema.statics.seedDefaultPackages = async function () {
  const defaultPackages = [
    {
      productId: "pay15",
      coins: 8000,
      priceUSD: 15,
      displayName: "Starter Pack",
      description: "Perfect for getting started",
      type: "normal",
      bonusCoins: 0,
      sortOrder: 1,
      googlePlayProductId: "com.ancientflip.pay15",
      appStoreProductId: "pay15",
    },
    {
      productId: "pay30",
      coins: 16000,
      priceUSD: 30,
      displayName: "Popular Pack",
      description: "Most popular choice",
      type: "popular",
      bonusCoins: 2000,
      sortOrder: 2,
      googlePlayProductId: "com.ancientflip.pay30",
      appStoreProductId: "pay30",
    },
    {
      productId: "pay120",
      coins: 64000,
      priceUSD: 120,
      displayName: "Hot Pack",
      description: "Great value for money",
      type: "hot",
      bonusCoins: 10000,
      discountPercent: 10,
      sortOrder: 3,
      googlePlayProductId: "com.ancientflip.pay120",
      appStoreProductId: "pay120",
    },
    {
      productId: "pay240",
      coins: 128000,
      priceUSD: 240,
      displayName: "Premium Pack",
      description: "For serious users",
      type: "normal",
      bonusCoins: 25000,
      discountPercent: 15,
      sortOrder: 4,
      googlePlayProductId: "com.ancientflip.pay240",
      appStoreProductId: "pay240",
    },
    {
      productId: "pay552",
      coins: 320000,
      priceUSD: 552,
      displayName: "Elite Pack",
      description: "Best value package",
      type: "best_value",
      bonusCoins: 80000,
      discountPercent: 20,
      sortOrder: 5,
      googlePlayProductId: "com.ancientflip.pay552",
      appStoreProductId: "pay552",
    },
    {
      productId: "pay1056",
      coins: 640000,
      priceUSD: 1056,
      displayName: "Ultimate Pack",
      description: "Maximum coins",
      type: "best_value",
      bonusCoins: 200000,
      discountPercent: 25,
      sortOrder: 6,
      googlePlayProductId: "com.ancientflip.pay1056",
      appStoreProductId: "pay1056",
    },
    {
      productId: "pay1275",
      coins: 800000,
      priceUSD: 1275,
      displayName: "Mega Pack",
      description: "The ultimate package",
      type: "best_value",
      bonusCoins: 300000,
      discountPercent: 30,
      sortOrder: 7,
      googlePlayProductId: "com.ancientflip.pay1275",
      appStoreProductId: "pay1275",
    },
  ];

  for (const pkg of defaultPackages) {
    await this.findOneAndUpdate(
      { productId: pkg.productId },
      pkg,
      { upsert: true, new: true }
    );
  }

  console.log("✅ Default coin packages seeded");
};

const CoinPackage = mongoose.model("CoinPackage", coinPackageSchema);

module.exports = CoinPackage;

