const cron = require("node-cron");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

/**
 * MVP Daily Rewards Cron Job
 * Runs every day at midnight (00:00) to credit rewards to active MVP users
 */

const MVP_DAILY_REWARD = {
    coins: 1000,
    exp: 100,
};

async function creditMVPDailyRewards() {
    try {
        console.log("🎁 Starting MVP Daily Rewards distribution...");

        const now = new Date();

        // Find all users with active MVP subscriptions
        const mvpUsers = await User.find({
            "gamification.isMVP": true,
            "gamification.mvpExpiresAt": { $gt: now },
        });

        console.log(`📊 Found ${mvpUsers.length} active MVP users`);

        let successCount = 0;
        let errorCount = 0;

        for (const user of mvpUsers) {
            try {
                // Credit coins
                await user.addCoins(MVP_DAILY_REWARD.coins);

                // Add experience (MVP already gets 2x boost in addExperience, but we'll grant a base amount)
                user.gamification.experiencePoints += MVP_DAILY_REWARD.exp;
                await user.save();

                // Create transaction record for coins
                await Transaction.create({
                    receiver: user._id,
                    type: "reward",
                    currency: "coins",
                    amount: MVP_DAILY_REWARD.coins,
                    status: "completed",
                    metadata: {
                        source: "mvp_daily_reward",
                        creditedAt: now,
                    },
                });

                successCount++;
                console.log(`✅ Credited rewards to ${user.displayName} (MVP)`);
            } catch (error) {
                errorCount++;
                console.error(`❌ Error rewarding MVP user ${user._id}:`, error);
            }
        }

        console.log(
            `🎉 MVP Daily Rewards distribution complete! Success: ${successCount}, Errors: ${errorCount}`
        );
    } catch (error) {
        console.error("❌ MVP Daily Rewards cron job error:", error);
    }
}

/**
 * Schedule the cron job to run daily at midnight (00:00)
 */
function startMVPDailyRewardsJob() {
    // Run at midnight every day (00:00)
    cron.schedule("0 0 * * *", async () => {
        console.log("⏰ MVP Daily Rewards cron job triggered at", new Date());
        await creditMVPDailyRewards();
    });

    console.log("✅ MVP Daily Rewards cron job scheduled (runs at 00:00 daily)");
}

module.exports = {
    startMVPDailyRewardsJob,
    creditMVPDailyRewards,
};
