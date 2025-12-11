/**
 * Ghost Live Cleanup Job
 * Runs every 5 minutes to clean up abandoned party lives
 * 
 * Ghost lives = parties with no heartbeat for 15+ minutes
 * This prevents accumulation of dead party streams
 */

const cron = require("node-cron");
const LiveStream = require("../models/LiveStream");
const AudioChatUser = require("../models/AudioChatUser");

// Constants
const HEARTBEAT_CHECK_INTERVAL = "*/5 * * * *"; // Every 5 minutes
const GHOST_TIMEOUT_MINUTES = 15; // Mark as ghost after 15 min no heartbeat
const CLEANUP_THRESHOLD_MINUTES = 20; // Clean up if 20+ min old

/**
 * Check and mark ghost lives
 * A live is ghost if:
 * - It's still marked as streaming (true)
 * - No heartbeat for 15+ minutes
 * - It's a party live (video or audio)
 */
const checkAndMarkGhosts = async () => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Find all active party streams with old heartbeats
    const ghostLives = await LiveStream.find({
      streaming: true,
      $or: [
        {
          liveType: { $in: ["party", "audio"] },
          lastHeartbeat: { $lt: fifteenMinutesAgo },
        },
      ],
    });

    for (const live of ghostLives) {
      try {
        // Update ghost status
        live.checkIfGhost(GHOST_TIMEOUT_MINUTES);
        await live.save();

        console.log(`[Ghost Check] Marked live ${live._id} as ghost`);
      } catch (error) {
        console.error(`[Ghost Check] Error marking live ${live._id}:`, error.message);
      }
    }

    console.log(`[Ghost Check] Checked ${ghostLives.length} potential ghost lives`);
  } catch (error) {
    console.error("[Ghost Check] Error in checkAndMarkGhosts:", error.message);
  }
};

/**
 * Remove ghost lives and their associated data
 * Also removes seat records to free up resources
 */
const removeGhostLives = async () => {
  try {
    const cleanupThreshold = new Date(Date.now() - CLEANUP_THRESHOLD_MINUTES * 60 * 1000);

    // Find and remove ghost lives
    const ghostLives = await LiveStream.find({
      isGhost: true,
      streaming: true,
      createdAt: { $lt: cleanupThreshold },
    });

    for (const live of ghostLives) {
      try {
        // Remove associated seat records
        await AudioChatUser.deleteMany({
          liveStreamId: live._id,
        });

        // Mark as not streaming instead of deleting (keep for records)
        live.streaming = false;
        live.save();

        console.log(
          `[Cleanup] Removed ghost live ${live._id} (${
            live.authorId
          }, created ${live.createdAt.toISOString()})`
        );
      } catch (error) {
        console.error(`[Cleanup] Error cleaning up live ${live._id}:`, error.message);
      }
    }

    console.log(`[Cleanup] Cleaned up ${ghostLives.length} ghost lives`);

    // Log current status
    const activeParties = await LiveStream.countDocuments({
      liveType: { $in: ["party", "audio"] },
      streaming: true,
    });

    const ghostParties = await LiveStream.countDocuments({
      liveType: { $in: ["party", "audio"] },
      isGhost: true,
      streaming: true,
    });

    console.log(`[Status] Active parties: ${activeParties}, Ghost parties: ${ghostParties}`);
  } catch (error) {
    console.error("[Cleanup] Error in removeGhostLives:", error.message);
  }
};

/**
 * Start the ghost cleanup job
 * Should be called during server initialization
 */
const startGhostCleanupJob = () => {
  try {
    // Run ghost check and cleanup every 5 minutes
    const job = cron.schedule(HEARTBEAT_CHECK_INTERVAL, async () => {
      console.log("[Ghost Cleanup] Running scheduled ghost live cleanup...");

      // 1. Check and mark ghost lives
      await checkAndMarkGhosts();

      // 2. Remove old ghost lives
      await removeGhostLives();
    });

    console.log("✅ Ghost cleanup cron job started (every 5 minutes)");

    // Return job for testing/stopping if needed
    return job;
  } catch (error) {
    console.error("❌ Failed to start ghost cleanup job:", error);
  }
};

/**
 * Manual trigger for ghost cleanup (useful for testing)
 */
const triggerGhostCleanup = async () => {
  console.log("[Manual Trigger] Running ghost cleanup manually...");
  await checkAndMarkGhosts();
  await removeGhostLives();
};

module.exports = {
  startGhostCleanupJob,
  triggerGhostCleanup,
  checkAndMarkGhosts,
  removeGhostLives,
};
