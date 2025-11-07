const cron = require("node-cron");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

/**
 * VIP Daily Coins Cron Job
 * Runs every day at midnight (00:00) to credit coins to active VIP users
 */

const VIP_DAILY_COINS = {
  normal: 3500,
  super: 16000,
  diamond: 35000,
};

async function creditVIPDailyCoins() {
  try {
    console.log("🎁 Starting VIP Daily Coins distribution...");

    const now = new Date();

    // Find all users with active VIP subscriptions
    const vipUsers = await User.find({
      $or: [
        {
          "gamification.isNormalVip": true,
          "gamification.vipExpiresAt": { $gt: now },
        },
        {
          "gamification.isSuperVip": true,
          "gamification.vipExpiresAt": { $gt: now },
        },
        {
          "gamification.isDiamondVip": true,
          "gamification.vipExpiresAt": { $gt: now },
        },
      ],
    });

    console.log(`📊 Found ${vipUsers.length} active VIP users`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of vipUsers) {
      try {
        // Determine VIP tier and coins to credit
        let coinsToCredit = 0;
        let vipTier = "";

        if (user.gamification.isDiamondVip) {
          coinsToCredit = VIP_DAILY_COINS.diamond;
          vipTier = "Diamond VIP";
        } else if (user.gamification.isSuperVip) {
          coinsToCredit = VIP_DAILY_COINS.super;
          vipTier = "Super VIP";
        } else if (user.gamification.isNormalVip) {
          coinsToCredit = VIP_DAILY_COINS.normal;
          vipTier = "Normal VIP";
        }

        if (coinsToCredit === 0) {
          console.log(`⚠️ User ${user._id} has no valid VIP tier`);
          continue;
        }

        // Credit coins to user
        await user.addCoins(coinsToCredit);

        // Create transaction record
        await Transaction.create({
          receiver: user._id,
          type: "reward",
          currency: "coins",
          amount: coinsToCredit,
          status: "completed",
          metadata: {
            source: "vip_daily_reward",
            vipTier: vipTier,
            creditedAt: now,
          },
        });

        successCount++;
        console.log(
          `✅ Credited ${coinsToCredit} coins to ${user.displayName} (${vipTier})`
        );
      } catch (error) {
        errorCount++;
        console.error(`❌ Error crediting coins to user ${user._id}:`, error);
      }
    }

    console.log(
      `🎉 VIP Daily Coins distribution complete! Success: ${successCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    console.error("❌ VIP Daily Coins cron job error:", error);
  }
}

/**
 * Schedule the cron job to run daily at midnight (00:00)
 * Cron format: second minute hour day month weekday
 */
function startVIPDailyCoinsJob() {
  // Run at midnight every day (00:00)
  cron.schedule("0 0 * * *", async () => {
    console.log("⏰ VIP Daily Coins cron job triggered at", new Date());
    await creditVIPDailyCoins();
  });

  console.log("✅ VIP Daily Coins cron job scheduled (runs at 00:00 daily)");
}

// Export for manual testing
module.exports = {
  startVIPDailyCoinsJob,
  creditVIPDailyCoins, // For manual testing
};

