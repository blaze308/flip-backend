const express = require("express");
const { param, query, validationResult } = require("express-validator");
const Notification = require("../models/Notification");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for user
 * @access  Private
 */
router.get(
  "/",
  authenticateJWT,
  requireAuth,
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 50 }).toInt(),
    query("unreadOnly").optional().isBoolean().toBoolean(),
  ],
  async (req, res) => {
    try {
      const { user } = req;
      const { page = 1, limit = 20, unreadOnly } = req.query;
      const skip = (page - 1) * limit;

      const filter = { userId: user._id };
      if (unreadOnly === true) {
        filter.isRead = false;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .limit(parseInt(limit))
          .skip(skip)
          .lean(),
        Notification.countDocuments(filter),
        Notification.countDocuments({ userId: user._id, isRead: false }),
      ]);

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            hasMore: skip + notifications.length < total,
          },
        },
      });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get notifications",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get("/unread-count", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const count = await Notification.countDocuments({
      userId: user._id,
      isRead: false,
    });

    res.json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
    });
  }
});

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  "/:id/read",
  authenticateJWT,
  requireAuth,
  [param("id").isMongoId().withMessage("Invalid notification ID")],
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
      const { id } = req.params;

      const notification = await Notification.findOneAndUpdate(
        { _id: id, userId: user._id },
        { isRead: true, readAt: new Date() },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      res.json({
        success: true,
        message: "Notification marked as read",
        data: notification,
      });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to mark notification as read",
      });
    }
  }
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put("/read-all", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const result = await Notification.updateMany(
      { userId: user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark all as read",
    });
  }
});

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete(
  "/:id",
  authenticateJWT,
  requireAuth,
  [param("id").isMongoId().withMessage("Invalid notification ID")],
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
      const { id } = req.params;

      const notification = await Notification.findOneAndDelete({
        _id: id,
        userId: user._id,
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      res.json({
        success: true,
        message: "Notification deleted",
      });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete notification",
      });
    }
  }
);

module.exports = router;
