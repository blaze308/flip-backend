const express = require("express");
const router = express.Router();
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const User = require("../models/User");
const ProfileVisit = require("../models/ProfileVisit");

// @route   POST /api/social/close-friends/add/:userId
// @desc    Add user to close friends
// @access  Private
router.post("/close-friends/add/:userId", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { userId } = req.params;

    if (userId === user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot add yourself to close friends",
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already in close friends
    if (user.closeFriends && user.closeFriends.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "User is already in your close friends",
      });
    }

    // Add to close friends
    if (!user.closeFriends) {
      user.closeFriends = [];
    }
    user.closeFriends.push(userId);
    await user.save();

    res.json({
      success: true,
      message: "Added to close friends",
    });
  } catch (error) {
    console.error("Add close friend error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add close friend",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/social/close-friends/remove/:userId
// @desc    Remove user from close friends
// @access  Private
router.post("/close-friends/remove/:userId", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { userId } = req.params;

    if (!user.closeFriends || !user.closeFriends.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "User is not in your close friends",
      });
    }

    // Remove from close friends
    user.closeFriends = user.closeFriends.filter((id) => id.toString() !== userId);
    await user.save();

    res.json({
      success: true,
      message: "Removed from close friends",
    });
  } catch (error) {
    console.error("Remove close friend error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove close friend",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/social/close-friends
// @desc    Get close friends list
// @access  Private
router.get("/close-friends", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const closeFriends = await User.find({
      _id: { $in: user.closeFriends || [] },
      isActive: true,
      deletedAt: null,
    }).select("displayName photoURL profile.username gamification");

    res.json({
      success: true,
      message: "Close friends retrieved successfully",
      data: { closeFriends },
    });
  } catch (error) {
    console.error("Get close friends error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve close friends",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/social/following
// @desc    Get users the current user is following
// @access  Private
router.get("/following", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const following = await User.find({
      _id: { $in: user.following || [] },
      isActive: true,
      deletedAt: null,
    })
      .select("displayName photoURL profile.username gamification")
      .skip(skip)
      .limit(parseInt(limit));

    const total = user.following ? user.following.length : 0;

    res.json({
      success: true,
      message: "Following list retrieved successfully",
      data: {
        following,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          hasMore: skip + following.length < total,
        },
      },
    });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve following list",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/social/visits/record/:userId
// @desc    Record a profile visit
// @access  Private
router.post("/visits/record/:userId", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { userId } = req.params;

    // Don't record self-visits
    if (userId === user._id.toString()) {
      return res.json({
        success: true,
        message: "Self-visit not recorded",
      });
    }

    // Record visit
    await ProfileVisit.recordVisit(user._id, userId);

    // Update visited user's visit count
    await User.findByIdAndUpdate(userId, {
      $inc: { profileVisitsCount: 1 },
    });

    res.json({
      success: true,
      message: "Visit recorded",
    });
  } catch (error) {
    console.error("Record visit error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record visit",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/social/visits/visitors
// @desc    Get users who visited my profile
// @access  Private
router.get("/visits/visitors", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { limit = 50 } = req.query;

    const visits = await ProfileVisit.getVisitors(user._id, parseInt(limit));

    res.json({
      success: true,
      message: "Visitors retrieved successfully",
      data: { visits },
    });
  } catch (error) {
    console.error("Get visitors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve visitors",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/social/visits/visited
// @desc    Get profiles I visited
// @access  Private
router.get("/visits/visited", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { limit = 50 } = req.query;

    const visits = await ProfileVisit.getVisitedProfiles(user._id, parseInt(limit));

    res.json({
      success: true,
      message: "Visited profiles retrieved successfully",
      data: { visits },
    });
  } catch (error) {
    console.error("Get visited profiles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve visited profiles",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/social/block/:userId
// @desc    Block a user
// @access  Private
router.post("/block/:userId", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { userId } = req.params;

    if (userId === user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot block yourself",
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already blocked
    if (user.blockedUsers && user.blockedUsers.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "User is already blocked",
      });
    }

    // Block the user
    await user.blockUser(userId);

    // Notify admin/developer about the block (for moderation purposes)
    // Log the block action for review
    console.log(`[BLOCK ACTION] User ${user._id} (${user.displayName || user.email}) blocked user ${userId} (${targetUser.displayName || targetUser.email})`);

    // TODO: Send notification to admin/moderation team
    // This could be done via email, webhook, or admin dashboard notification

    res.json({
      success: true,
      message: "User blocked successfully. Their content will be removed from your feed.",
    });
  } catch (error) {
    console.error("Block user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to block user",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/social/unblock/:userId
// @desc    Unblock a user
// @access  Private
router.post("/unblock/:userId", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { userId } = req.params;

    // Check if user is blocked
    if (!user.blockedUsers || !user.blockedUsers.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "User is not blocked",
      });
    }

    // Unblock the user
    await user.unblockUser(userId);

    res.json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    console.error("Unblock user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unblock user",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/social/blacklist
// @desc    Get blocked users list
// @access  Private
router.get("/blacklist", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const blockedUsers = await User.find({
      _id: { $in: user.blockedUsers || [] },
    }).select("displayName photoURL profile.username");

    res.json({
      success: true,
      message: "Blacklist retrieved successfully",
      data: { blockedUsers },
    });
  } catch (error) {
    console.error("Get blacklist error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve blacklist",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

module.exports = router;


