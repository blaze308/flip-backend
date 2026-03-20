const express = require("express");
const { body, query, validationResult } = require("express-validator");
const Invitation = require("../models/Invitation");
const User = require("../models/User");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");

const router = express.Router();

/**
 * @route   GET /api/invitation/referral-code
 * @desc    Get or create user's referral code
 * @access  Private
 */
router.get(
  "/referral-code",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = req;

      let invitation = await Invitation.findOne({ userId: user._id });

      if (!invitation) {
        let code = Invitation.generateReferralCode();
        while (await Invitation.findOne({ referralCode: code })) {
          code = Invitation.generateReferralCode();
        }
        invitation = await Invitation.create({
          userId: user._id,
          referralCode: code,
        });
      }

      res.json({
        success: true,
        data: {
          referralCode: invitation.referralCode,
          totalInvites: invitation.totalInvites,
          totalRewards: invitation.totalRewards,
        },
      });
    } catch (error) {
      console.error("Get referral code error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get referral code",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/invitation/history
 * @desc    Get invitation history
 * @access  Private
 */
router.get(
  "/history",
  authenticateJWT,
  requireAuth,
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  async (req, res) => {
    try {
      const { user } = req;
      const { page = 1, limit = 20 } = req.query;

      const invitation = await Invitation.findOne({ userId: user._id })
        .populate("invitedUsers.invitedUserId", "displayName photoURL profile.username")
        .lean();

      if (!invitation) {
        return res.json({
          success: true,
          data: {
            history: [],
            totalInvites: 0,
            pagination: { page: 1, limit, total: 0 },
          },
        });
      }

      const history = invitation.invitedUsers || [];
      const skip = (page - 1) * limit;
      const paginated = history.slice(skip, skip + parseInt(limit));

      res.json({
        success: true,
        data: {
          history: paginated.map((h) => ({
            invitedUser: h.invitedUserId,
            invitedAt: h.invitedAt,
            rewardClaimed: h.rewardClaimed,
          })),
          totalInvites: invitation.totalInvites,
          totalRewards: invitation.totalRewards,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: history.length,
          },
        },
      });
    } catch (error) {
      console.error("Get invitation history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get invitation history",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/invitation/send
 * @desc    Send invitation (log for analytics; actual send via share link)
 * @access  Private
 */
router.post(
  "/send",
  authenticateJWT,
  requireAuth,
  [
    body("method")
      .isIn(["sms", "email", "link"])
      .withMessage("Method must be sms, email, or link"),
    body("recipient").optional().trim(),
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

      const { method, recipient } = req.body;
      const { user } = req;

      let invitation = await Invitation.findOne({ userId: user._id });
      if (!invitation) {
        let code = Invitation.generateReferralCode();
        while (await Invitation.findOne({ referralCode: code })) {
          code = Invitation.generateReferralCode();
        }
        invitation = await Invitation.create({
          userId: user._id,
          referralCode: code,
        });
      }

      // Log invitation send (could integrate with email/SMS service later)
      res.json({
        success: true,
        message: "Invitation sent successfully",
        data: {
          referralCode: invitation.referralCode,
          shareLink: `https://flip-backend-mnpg.onrender.com/invite/${invitation.referralCode}`,
        },
      });
    } catch (error) {
      console.error("Send invitation error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send invitation",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   POST /api/invitation/claim-reward/:invitationId
 * @desc    Claim referral reward (when referred user completes signup)
 * @access  Private
 */
router.post(
  "/claim-reward/:invitationId",
  authenticateJWT,
  requireAuth,
  [body("invitedUserId").optional().isMongoId().withMessage("Invalid invited user ID")],
  async (req, res) => {
    try {
      const { user } = req;
      const { invitationId } = req.params;
      const { invitedUserId } = req.body;

      const invitation = await Invitation.findOne({
        _id: invitationId,
        userId: user._id,
      });

      if (!invitation) {
        return res.status(404).json({
          success: false,
          message: "Invitation not found",
        });
      }

      const invitedEntry = invitation.invitedUsers.find(
        (e) => e.invitedUserId?.toString() === invitedUserId
      );

      if (!invitedEntry || invitedEntry.rewardClaimed) {
        return res.status(400).json({
          success: false,
          message: "Reward already claimed or invalid invitation",
        });
      }

      invitedEntry.rewardClaimed = true;
      const rewardCoins = 100;
      const rewardDiamonds = 10;
      invitation.totalRewards.coins += rewardCoins;
      invitation.totalRewards.diamonds += rewardDiamonds;
      await invitation.save();

      // Credit user
      await User.findByIdAndUpdate(user._id, {
        $inc: { "gamification.coins": rewardCoins },
      });

      res.json({
        success: true,
        message: "Reward claimed successfully",
        data: {
          reward: { coins: rewardCoins, diamonds: rewardDiamonds },
        },
      });
    } catch (error) {
      console.error("Claim reward error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to claim reward",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

module.exports = router;
