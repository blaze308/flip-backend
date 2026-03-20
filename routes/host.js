const express = require("express");
const router = express.Router();
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const User = require("../models/User");
const LiveStream = require("../models/LiveStream");
const GiftSent = require("../models/GiftSent");

/**
 * @route   GET /api/host/stats
 * @desc    Get host statistics
 * @access  Private
 */
router.get("/stats", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    // Calculate total earnings (gifts received)
    const totalGiftsReceived = await GiftSent.aggregate([
      { $match: { receiverId: user._id.toString() } },
      { $group: { _id: null, total: { $sum: "$diamondsQuantity" } } },
    ]);

    const totalEarnings = totalGiftsReceived[0]?.total || 0;

    // Calculate current month earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyGifts = await GiftSent.aggregate([
      {
        $match: {
          receiverId: user._id.toString(),
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$diamondsQuantity" } } },
    ]);

    const currentMonthEarnings = monthlyGifts[0]?.total || 0;

    // Calculate last month earnings
    const startOfLastMonth = new Date();
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    startOfLastMonth.setDate(1);
    startOfLastMonth.setHours(0, 0, 0, 0);

    const endOfLastMonth = new Date(startOfMonth);
    endOfLastMonth.setMilliseconds(-1);

    const lastMonthGifts = await GiftSent.aggregate([
      {
        $match: {
          receiverId: user._id.toString(),
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$diamondsQuantity" } } },
    ]);

    const lastMonthEarnings = lastMonthGifts[0]?.total || 0;

    // Get live stream stats
    const totalStreams = await LiveStream.countDocuments({
      authorId: user._id.toString(),
    });

    const totalViewers = await LiveStream.aggregate([
      { $match: { authorId: user._id.toString() } },
      { $group: { _id: null, total: { $sum: "$viewersCount" } } },
    ]);

    const totalViewersCount = totalViewers[0]?.total || 0;

    // Calculate average viewers
    const avgViewers = totalStreams > 0 ? Math.round(totalViewersCount / totalStreams) : 0;

    // Get host level (based on total earnings)
    const hostLevel = calculateHostLevel(totalEarnings);

    res.json({
      success: true,
      message: "Host statistics retrieved successfully",
      data: {
        totalEarnings,
        currentMonthEarnings,
        lastMonthEarnings,
        totalStreams,
        totalViewersCount,
        avgViewers,
        hostLevel,
        isHost: user.isHost || false,
        giftsReceived: user.gamification?.giftsReceived || 0,
        liveLevel: user.gamification?.liveLevel || 0,
      },
    });
  } catch (error) {
    console.error("Get host stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve host statistics",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/host/earnings
 * @desc    Get detailed earnings breakdown
 * @access  Private
 */
router.get("/earnings", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { period = "month" } = req.query; // month, week, year

    let startDate;
    const endDate = new Date();

    switch (period) {
      case "week":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "year":
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case "month":
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    // Get earnings by day
    const earningsByDay = await GiftSent.aggregate([
      {
        $match: {
          receiverId: user._id.toString(),
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          total: { $sum: "$diamondsQuantity" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get top gifters
    const topGifters = await GiftSent.aggregate([
      {
        $match: {
          receiverId: user._id.toString(),
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$authorId",
          total: { $sum: "$diamondsQuantity" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);

    // Populate gifter info
    const topGiftersWithInfo = await Promise.all(
      topGifters.map(async (gifter) => {
        const gifterUser = await User.findById(gifter._id).select(
          "displayName photoURL username"
        );
        return {
          user: gifterUser,
          total: gifter.total,
          count: gifter.count,
        };
      })
    );

    res.json({
      success: true,
      message: "Earnings breakdown retrieved successfully",
      data: {
        period,
        earningsByDay,
        topGifters: topGiftersWithInfo,
        totalEarnings: earningsByDay.reduce((sum, day) => sum + day.total, 0),
        totalGifts: earningsByDay.reduce((sum, day) => sum + day.count, 0),
      },
    });
  } catch (error) {
    console.error("Get earnings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve earnings breakdown",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/host/live/:streamId/stats
 * @desc    Get live stream statistics (current viewers, gifts, duration, etc.)
 * @access  Private (host only)
 */
router.get("/live/:streamId/stats", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { streamId } = req.params;

    const liveStream = await LiveStream.findOne({
      _id: streamId,
      authorId: user._id.toString(),
    }).lean();

    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    const startTime = liveStream.createdAt ? new Date(liveStream.createdAt) : new Date();
    const durationSeconds = liveStream.streaming
      ? Math.floor((Date.now() - startTime.getTime()) / 1000)
      : 0;

    res.json({
      success: true,
      message: "Live statistics retrieved successfully",
      data: {
        currentViewers: liveStream.viewersCount || 0,
        peakViewers: liveStream.viewersCount || 0,
        totalViews: liveStream.viewersCount || 0,
        duration: durationSeconds,
        giftsReceived: liveStream.streamingDiamonds || liveStream.giftsTotal || 0,
        newFollowers: 0,
        likes: (liveStream.likes || []).length,
        streaming: liveStream.streaming || false,
      },
    });
  } catch (error) {
    console.error("Get live stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve live statistics",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/host/application-status
 * @desc    Get host application status
 * @access  Private
 */
router.get("/application-status", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    res.json({
      success: true,
      message: "Application status retrieved successfully",
      data: {
        isHost: user.isHost || false,
        hostApprovedAt: user.hostApprovedAt || null,
        status: user.isHost ? "approved" : "not_applied",
      },
    });
  } catch (error) {
    console.error("Get application status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve application status",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   GET /api/host/rewards
 * @desc    Get host rewards (levels, benefits, next tier)
 * @access  Private
 */
router.get("/rewards", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const totalGiftsReceived = await GiftSent.aggregate([
      { $match: { receiverId: user._id.toString() } },
      { $group: { _id: null, total: { $sum: "$diamondsQuantity" } } },
    ]);
    const totalEarnings = totalGiftsReceived[0]?.total || 0;
    const hostLevel = calculateHostLevel(totalEarnings);

    const levelThresholds = [
      { level: 0, minEarnings: 0, label: "Starter" },
      { level: 1, minEarnings: 100, label: "Rising Star" },
      { level: 2, minEarnings: 1000, label: "Popular" },
      { level: 3, minEarnings: 5000, label: "Trending" },
      { level: 4, minEarnings: 10000, label: "Star" },
      { level: 5, minEarnings: 25000, label: "Super Star" },
      { level: 6, minEarnings: 50000, label: "Elite" },
      { level: 7, minEarnings: 100000, label: "Legend" },
      { level: 8, minEarnings: 250000, label: "Icon" },
      { level: 9, minEarnings: 500000, label: "Mega" },
      { level: 10, minEarnings: 1000000, label: "Ultimate" },
    ];

    const currentTier = levelThresholds.find((t) => t.level === hostLevel) || levelThresholds[0];
    const nextTier = levelThresholds.find((t) => t.level === hostLevel + 1);
    const progressToNext = nextTier
      ? Math.min(100, ((totalEarnings - currentTier.minEarnings) / (nextTier.minEarnings - currentTier.minEarnings)) * 100)
      : 100;

    res.json({
      success: true,
      message: "Host rewards retrieved successfully",
      data: {
        hostLevel,
        totalEarnings,
        currentTier: currentTier.label,
        nextTier: nextTier?.label || null,
        progressToNext: Math.round(progressToNext),
        rewards: levelThresholds.map((t) => ({
          level: t.level,
          label: t.label,
          minEarnings: t.minEarnings,
          unlocked: hostLevel >= t.level,
        })),
      },
    });
  } catch (error) {
    console.error("Get host rewards error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve host rewards",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * @route   POST /api/host/apply
 * @desc    Apply to become a host
 * @access  Private
 */
router.post("/apply", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    if (user.isHost) {
      return res.status(400).json({
        success: false,
        message: "You are already a host",
      });
    }

    // Simple auto-approval for now
    // In production, you'd have an approval process
    user.isHost = true;
    user.hostApprovedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Host application approved!",
      data: {
        isHost: true,
        hostApprovedAt: user.hostApprovedAt,
      },
    });
  } catch (error) {
    console.error("Host application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process host application",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * Calculate host level based on total earnings
 */
function calculateHostLevel(totalEarnings) {
  if (totalEarnings >= 1000000) return 10;
  if (totalEarnings >= 500000) return 9;
  if (totalEarnings >= 250000) return 8;
  if (totalEarnings >= 100000) return 7;
  if (totalEarnings >= 50000) return 6;
  if (totalEarnings >= 25000) return 5;
  if (totalEarnings >= 10000) return 4;
  if (totalEarnings >= 5000) return 3;
  if (totalEarnings >= 1000) return 2;
  if (totalEarnings >= 100) return 1;
  return 0;
}

module.exports = router;

