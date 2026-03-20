const express = require("express");
const { body, validationResult } = require("express-validator");
const Support = require("../models/Support");
const User = require("../models/User");
const { authenticateJWT, requireAuth, optionalJWTAuth } = require("../middleware/jwtAuth");
const { notifyUserReported } = require("../services/admin_notification_service");

const router = express.Router();

/**
 * @route   GET /api/support/feedback
 * @desc    Get current user's feedback submissions
 * @access  Private
 */
router.get(
  "/feedback",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = req;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const skip = (page - 1) * limit;

      const [feedback, total] = await Promise.all([
        Support.find({ type: "feedback", userId: user._id })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select("subject message status createdAt")
          .lean(),
        Support.countDocuments({ type: "feedback", userId: user._id }),
      ]);

      res.json({
        success: true,
        data: {
          feedback,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + feedback.length < total,
          },
        },
      });
    } catch (error) {
      console.error("Get feedback error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve feedback",
      });
    }
  }
);

/**
 * @route   POST /api/support/feedback
 * @desc    Submit feedback
 * @access  Private
 */
router.post(
  "/feedback",
  authenticateJWT,
  requireAuth,
  [
    body("subject").optional().trim().isLength({ max: 200 }),
    body("message")
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ min: 1, max: 2000 })
      .withMessage("Message must be between 1 and 2000 characters"),
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
      const { subject, message } = req.body;

      await Support.create({
        type: "feedback",
        userId: user._id,
        subject: subject || "Feedback",
        message,
      });

      res.json({
        success: true,
        message: "Feedback submitted successfully. Thank you!",
      });
    } catch (error) {
      console.error("Feedback submit error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to submit feedback",
      });
    }
  }
);

/**
 * @route   POST /api/support/report
 * @desc    Report user or content
 * @access  Private
 */
router.post(
  "/report",
  authenticateJWT,
  requireAuth,
  [
    body("targetType")
      .isIn(["user", "post", "comment", "story", "chat"])
      .withMessage("Invalid target type"),
    body("targetId").notEmpty().withMessage("Target ID is required"),
    body("reason").optional().trim().isLength({ max: 500 }),
    body("message").optional().trim().isLength({ max: 1000 }),
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
      const { targetType, targetId, reason, message } = req.body;

      let reportedUser = null;
      if (targetType === "user") {
        reportedUser = await User.findById(targetId).select("displayName email profile");
      }

      await Support.create({
        type: "report",
        userId: user._id,
        reportTargetType: targetType,
        reportTargetId: targetId,
        reportReason: reason || "No reason provided",
        message: message || reason || "Report submitted",
      });

      if (reportedUser) {
        try {
          await notifyUserReported(user, reportedUser, reason || "Reported");
        } catch (notifyErr) {
          console.error("Admin notify failed:", notifyErr);
        }
      }

      res.json({
        success: true,
        message: "Report submitted successfully. We will review it shortly.",
      });
    } catch (error) {
      console.error("Report submit error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to submit report",
      });
    }
  }
);

/**
 * @route   POST /api/support/contact
 * @desc    Contact us (can be used with or without auth)
 * @access  Public (optional auth - attaches userId if logged in)
 */
router.post(
  "/contact",
  optionalJWTAuth,
  [
    body("subject")
      .notEmpty()
      .withMessage("Subject is required")
      .isLength({ max: 200 }),
    body("message")
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ min: 1, max: 2000 }),
    body("email").optional().isEmail().withMessage("Invalid email"),
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

      const { subject, message, email } = req.body;
      const userId = req.user?._id || null;

      await Support.create({
        type: "contact",
        userId,
        subject,
        message,
        email: email || req.user?.email || null,
      });

      res.json({
        success: true,
        message: "Message sent successfully. We will get back to you soon.",
      });
    } catch (error) {
      console.error("Contact submit error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send message",
      });
    }
  }
);

module.exports = router;
