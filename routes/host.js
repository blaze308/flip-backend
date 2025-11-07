const express = require("express");
const router = express.Router();
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const User = require("../models/User");
const LiveStream = require("../models/LiveStream");
const GiftSent = require("../models/GiftSent");

/**
 * @route   GET /api/host/stats
 * @desc    Get host statistics
 * @access  Private
 */
router.get("/stats", authenticateToken, requireSyncedUser, async (req, res) => {
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
router.get("/earnings", authenticateToken, requireSyncedUser, async (req, res) => {
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
 * @route   POST /api/host/apply
 * @desc    Apply to become a host
 * @access  Private
 */
router.post("/apply", authenticateToken, requireSyncedUser, async (req, res) => {
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

