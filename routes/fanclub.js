const express = require("express");
const router = express.Router();
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const FanClub = require("../models/FanClub");
const FanClubMember = require("../models/FanClubMember");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { body, validationResult } = require("express-validator");

// @route   POST /api/fanclub/create
// @desc    Create a fan club
// @access  Private
router.post(
  "/create",
  authenticateToken,
  requireSyncedUser,
  [
    body("name").trim().notEmpty().isLength({ max: 50 }).withMessage("Club name required (max 50 chars)"),
    body("description").optional().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const { name, description } = req.body;

      // Check if user already owns a fan club
      const existingClub = await FanClub.findOne({ owner: user._id });
      if (existingClub) {
        return res.status(400).json({
          success: false,
          message: "You already own a fan club",
        });
      }

      // Create fan club
      const fanClub = await FanClub.create({
        name,
        description: description || "",
        owner: user._id,
      });

      res.status(201).json({
        success: true,
        message: "Fan club created successfully",
        data: { fanClub },
      });
    } catch (error) {
      console.error("Create fan club error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create fan club",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }
);

// @route   POST /api/fanclub/join/:clubId
// @desc    Join a fan club (100 coins)
// @access  Private
router.post("/join/:clubId", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;
    const { clubId } = req.params;

    // Find fan club
    const fanClub = await FanClub.findById(clubId);
    if (!fanClub || fanClub.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Fan club not found",
      });
    }

    // Check if already a member
    const existingMember = await FanClubMember.findOne({
      user: user._id,
      fanClub: clubId,
      status: { $in: ["active", "expired"] },
    });

    if (existingMember && existingMember.isActive()) {
      return res.status(400).json({
        success: false,
        message: "You are already a member of this fan club",
      });
    }

    // Check if club is full
    if (fanClub.memberCount >= fanClub.maxMembers) {
      return res.status(400).json({
        success: false,
        message: "Fan club is full",
      });
    }

    // Check coins
    if (!user.gamification || user.gamification.coins < fanClub.joinFee) {
      return res.status(400).json({
        success: false,
        message: `Insufficient coins. Need ${fanClub.joinFee} coins to join.`,
      });
    }

    // Deduct coins
    await user.deductCoins(fanClub.joinFee);

    // Create or renew membership
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    let membership;
    if (existingMember) {
      membership = await existingMember.renew(30);
    } else {
      membership = await FanClubMember.create({
        user: user._id,
        fanClub: clubId,
        expiresAt,
      });
      await fanClub.addMember();
    }

    // Record transaction
    await Transaction.create({
      sender: user._id,
      receiver: fanClub.owner,
      type: "purchase",
      currency: "coins",
      amount: fanClub.joinFee,
      status: "completed",
      metadata: {
        type: "fanclub_join",
        fanClubId: clubId,
        fanClubName: fanClub.name,
      },
    });

    // Update club revenue
    fanClub.stats.totalRevenue += fanClub.joinFee;
    await fanClub.save();

    res.json({
      success: true,
      message: "Joined fan club successfully",
      data: { membership, fanClub },
    });
  } catch (error) {
    console.error("Join fan club error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join fan club",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/fanclub/renew/:clubId
// @desc    Renew fan club membership (300 coins)
// @access  Private
router.post("/renew/:clubId", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;
    const { clubId } = req.params;

    const membership = await FanClubMember.findOne({
      user: user._id,
      fanClub: clubId,
    }).populate("fanClub");

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "You are not a member of this fan club",
      });
    }

    const fanClub = membership.fanClub;

    // Check coins
    if (!user.gamification || user.gamification.coins < fanClub.renewalFee) {
      return res.status(400).json({
        success: false,
        message: `Insufficient coins. Need ${fanClub.renewalFee} coins to renew.`,
      });
    }

    // Deduct coins
    await user.deductCoins(fanClub.renewalFee);

    // Renew membership
    await membership.renew(30);

    // Record transaction
    await Transaction.create({
      sender: user._id,
      receiver: fanClub.owner,
      type: "purchase",
      currency: "coins",
      amount: fanClub.renewalFee,
      status: "completed",
      metadata: {
        type: "fanclub_renewal",
        fanClubId: clubId,
        fanClubName: fanClub.name,
      },
    });

    // Update club revenue
    fanClub.stats.totalRevenue += fanClub.renewalFee;
    await fanClub.save();

    res.json({
      success: true,
      message: "Membership renewed successfully",
      data: { membership },
    });
  } catch (error) {
    console.error("Renew fan club error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to renew membership",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/fanclub/leave/:clubId
// @desc    Leave a fan club
// @access  Private
router.post("/leave/:clubId", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;
    const { clubId } = req.params;

    const membership = await FanClubMember.findOne({
      user: user._id,
      fanClub: clubId,
      status: "active",
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "You are not a member of this fan club",
      });
    }

    // Update membership status
    membership.status = "expired";
    await membership.save();

    // Update club member count
    const fanClub = await FanClub.findById(clubId);
    if (fanClub) {
      await fanClub.removeMember();
    }

    res.json({
      success: true,
      message: "Left fan club successfully",
    });
  } catch (error) {
    console.error("Leave fan club error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave fan club",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/fanclub/my-club
// @desc    Get user's owned fan club
// @access  Private
router.get("/my-club", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;

    const fanClub = await FanClub.findOne({ owner: user._id });

    if (!fanClub) {
      return res.json({
        success: true,
        message: "No fan club found",
        data: { fanClub: null },
      });
    }

    res.json({
      success: true,
      message: "Fan club retrieved successfully",
      data: { fanClub },
    });
  } catch (error) {
    console.error("Get my club error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve fan club",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/fanclub/joined
// @desc    Get fan clubs user has joined
// @access  Private
router.get("/joined", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;

    const memberships = await FanClubMember.find({
      user: user._id,
      status: "active",
    })
      .populate("fanClub")
      .populate("fanClub.owner", "displayName photoURL");

    res.json({
      success: true,
      message: "Joined clubs retrieved successfully",
      data: { memberships },
    });
  } catch (error) {
    console.error("Get joined clubs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve joined clubs",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/fanclub/members/:clubId
// @desc    Get fan club members
// @access  Private
router.get("/members/:clubId", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { clubId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const members = await FanClubMember.find({
      fanClub: clubId,
      status: "active",
    })
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("user", "displayName photoURL profile.username gamification");

    const total = await FanClubMember.countDocuments({
      fanClub: clubId,
      status: "active",
    });

    res.json({
      success: true,
      message: "Members retrieved successfully",
      data: {
        members,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          hasMore: skip + members.length < total,
        },
      },
    });
  } catch (error) {
    console.error("Get members error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve members",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/fanclub/kick/:memberId
// @desc    Kick a member from fan club (owner only)
// @access  Private
router.post(
  "/kick/:memberId",
  authenticateToken,
  requireSyncedUser,
  [body("reason").optional().trim()],
  async (req, res) => {
    try {
      const { user } = req;
      const { memberId } = req.params;
      const { reason } = req.body;

      const membership = await FanClubMember.findById(memberId).populate("fanClub");

      if (!membership) {
        return res.status(404).json({
          success: false,
          message: "Member not found",
        });
      }

      // Check if user is the club owner
      if (membership.fanClub.owner.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Only the club owner can kick members",
        });
      }

      // Kick member
      await membership.kick(user._id, reason || "No reason provided");

      // Update club member count
      await membership.fanClub.removeMember();

      res.json({
        success: true,
        message: "Member kicked successfully",
      });
    } catch (error) {
      console.error("Kick member error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to kick member",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }
);

// @route   PUT /api/fanclub/update
// @desc    Update fan club info
// @access  Private
router.put(
  "/update",
  authenticateToken,
  requireSyncedUser,
  [
    body("name").optional().trim().isLength({ max: 50 }),
    body("description").optional().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const { name, description } = req.body;

      const fanClub = await FanClub.findOne({ owner: user._id });

      if (!fanClub) {
        return res.status(404).json({
          success: false,
          message: "You don't own a fan club",
        });
      }

      // If changing name, charge fee
      if (name && name !== fanClub.name) {
        if (!user.gamification || user.gamification.coins < fanClub.nameChangeFee) {
          return res.status(400).json({
            success: false,
            message: `Insufficient coins. Need ${fanClub.nameChangeFee} coins to change name.`,
          });
        }
        await user.deductCoins(fanClub.nameChangeFee);
        fanClub.name = name;
      }

      if (description !== undefined) {
        fanClub.description = description;
      }

      await fanClub.save();

      res.json({
        success: true,
        message: "Fan club updated successfully",
        data: { fanClub },
      });
    } catch (error) {
      console.error("Update fan club error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update fan club",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }
);

// @route   POST /api/fanclub/toggle-badge/:clubId
// @desc    Toggle fan club badge display
// @access  Private
router.post("/toggle-badge/:clubId", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;
    const { clubId } = req.params;

    const membership = await FanClubMember.findOne({
      user: user._id,
      fanClub: clubId,
      status: "active",
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "You are not a member of this fan club",
      });
    }

    membership.badgeEnabled = !membership.badgeEnabled;
    await membership.save();

    res.json({
      success: true,
      message: `Badge ${membership.badgeEnabled ? "enabled" : "disabled"}`,
      data: { badgeEnabled: membership.badgeEnabled },
    });
  } catch (error) {
    console.error("Toggle badge error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle badge",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

module.exports = router;


