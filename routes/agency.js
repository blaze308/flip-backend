const express = require("express");
const router = express.Router();
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const Agency = require("../models/Agency");
const AgencyMember = require("../models/AgencyMember");
const User = require("../models/User");
const { body, validationResult } = require("express-validator");

// @route   POST /api/agency/create
// @desc    Create a new agency (owner)
// @access  Private
router.post(
  "/create",
  authenticateToken,
  requireSyncedUser,
  [
    body("name").trim().notEmpty().withMessage("Agency name is required"),
    body("description").optional().trim(),
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

      // Check if user already owns an agency
      const existingAgency = await Agency.findOne({ owner: user._id });
      if (existingAgency) {
        return res.status(400).json({
          success: false,
          message: "You already own an agency",
        });
      }

      // Check if user is already in an agency
      const existingMembership = await AgencyMember.findOne({ user: user._id, status: "active" });
      if (existingMembership) {
        return res.status(400).json({
          success: false,
          message: "You are already a member of an agency",
        });
      }

      // Generate unique agency ID
      const agencyId = await Agency.generateAgencyId();

      // Create agency
      const agency = await Agency.create({
        name,
        description: description || "",
        agencyId,
        owner: user._id,
        benefits: [
          "12% commission on host earnings",
          "Recruit sub-agents",
          "Manage hosts",
          "Track earnings and performance",
        ],
        rules: [
          "Maintain active status",
          "Support your hosts",
          "Follow platform guidelines",
        ],
      });

      // Create owner membership
      await AgencyMember.create({
        user: user._id,
        agency: agency._id,
        role: "owner",
        status: "active",
      });

      // Update user
      user.agency = {
        agencyId: agency._id,
        role: "owner",
        joinedAt: Date.now(),
      };
      await user.save();

      res.status(201).json({
        success: true,
        message: "Agency created successfully",
        data: { agency },
      });
    } catch (error) {
      console.error("Create agency error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create agency",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }
);

// @route   POST /api/agency/join
// @desc    Join an agency by agency ID
// @access  Private
router.post(
  "/join",
  authenticateToken,
  requireSyncedUser,
  [body("agencyId").trim().notEmpty().withMessage("Agency ID is required")],
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
      const { agencyId } = req.body;

      // Check if user is already in an agency
      const existingMembership = await AgencyMember.findOne({ user: user._id, status: "active" });
      if (existingMembership) {
        return res.status(400).json({
          success: false,
          message: "You are already a member of an agency",
        });
      }

      // Find agency
      const agency = await Agency.findOne({ agencyId, status: "active" });
      if (!agency) {
        return res.status(404).json({
          success: false,
          message: "Agency not found",
        });
      }

      // Create membership (as host by default)
      const membership = await AgencyMember.create({
        user: user._id,
        agency: agency._id,
        role: "host",
        applicationStatus: "pending",
        status: "active",
      });

      // Update user
      user.agency = {
        agencyId: agency._id,
        role: "host",
        joinedAt: Date.now(),
      };
      await user.save();

      res.json({
        success: true,
        message: "Application submitted successfully",
        data: { membership, agency },
      });
    } catch (error) {
      console.error("Join agency error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to join agency",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      });
    }
  }
);

// @route   GET /api/agency/my-agency
// @desc    Get current user's agency info
// @access  Private
router.get("/my-agency", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;

    const membership = await AgencyMember.findOne({ user: user._id, status: "active" })
      .populate("agency")
      .populate("invitedBy", "displayName photoURL")
      .populate("assignedAgent", "displayName photoURL");

    if (!membership) {
      return res.json({
        success: true,
        message: "Not a member of any agency",
        data: { membership: null },
      });
    }

    res.json({
      success: true,
      message: "Agency info retrieved successfully",
      data: { membership },
    });
  } catch (error) {
    console.error("Get my agency error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve agency info",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   POST /api/agency/leave
// @desc    Leave current agency
// @access  Private
router.post("/leave", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;

    const membership = await AgencyMember.findOne({ user: user._id, status: "active" });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "You are not a member of any agency",
      });
    }

    // Can't leave if you're the owner
    if (membership.role === "owner") {
      return res.status(400).json({
        success: false,
        message: "Agency owners cannot leave. Please transfer ownership or close the agency.",
      });
    }

    // Update membership
    membership.status = "inactive";
    membership.leftAt = Date.now();
    await membership.save();

    // Update user
    user.agency = {
      agencyId: null,
      role: null,
      joinedAt: null,
    };
    await user.save();

    // Update agency counts
    const agency = await Agency.findById(membership.agency);
    if (agency) {
      if (membership.role === "agent") {
        agency.agentsCount = Math.max(0, agency.agentsCount - 1);
      } else if (membership.role === "host") {
        agency.hostsCount = Math.max(0, agency.hostsCount - 1);
      }
      await agency.save();
    }

    res.json({
      success: true,
      message: "Left agency successfully",
    });
  } catch (error) {
    console.error("Leave agency error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave agency",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

// @route   GET /api/agency/stats
// @desc    Get agency statistics (for agents/owners)
// @access  Private
router.get("/stats", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { user } = req;

    const membership = await AgencyMember.findOne({ user: user._id, status: "active" });

    if (!membership || (membership.role !== "agent" && membership.role !== "owner")) {
      return res.status(403).json({
        success: false,
        message: "Only agents and owners can view stats",
      });
    }

    const stats = {
      invitedAgentsCount: membership.invitedAgentsCount,
      hostsCount: membership.hostsCount,
      totalEarnings: membership.totalEarnings,
      totalCommission: membership.totalCommission,
    };

    res.json({
      success: true,
      message: "Stats retrieved successfully",
      data: { stats },
    });
  } catch (error) {
    console.error("Get agency stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve stats",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
});

module.exports = router;

