/**
 * ============================================================
 * ENHANCED LIVE PARTY VIDEO MANAGEMENT
 * ============================================================
 * Backend Routes for improved video party functionality
 * Includes: seat management, host controls, real-time updates
 * 
 * Add these endpoints to /api/live routes
 */

const express = require("express");
const router = express.Router();
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const LiveStream = require("../models/LiveStream");
const AudioChatUser = require("../models/AudioChatUser");

// ========== PARTY SEAT MANAGEMENT ==========

/**
 * @route   GET /api/live/:id/party/seats
 * @desc    Get all seats for a party live stream
 * @access  Public
 */
router.get("/:id/party/seats", async (req, res) => {
  try {
    const seats = await AudioChatUser.find({
      liveStreamId: req.params.id,
    })
      .populate("joinedUser", "displayName photoURL username")
      .sort({ seatIndex: 1 });

    res.json({
      success: true,
      data: seats,
      count: seats.length,
    });
  } catch (error) {
    console.error("Get party seats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch seats",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/party/seats/join
 * @desc    Join a party room seat
 * @access  Private
 */
router.post("/:id/party/seats/join", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { seatIndex, userUid } = req.body;

    if (typeof seatIndex !== "number" || !userUid) {
      return res.status(400).json({
        success: false,
        message: "seatIndex and userUid are required",
      });
    }

    const liveStream = await LiveStream.findById(req.params.id);
    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    if (!liveStream.streaming) {
      return res.status(400).json({
        success: false,
        message: "Live stream has ended",
      });
    }

    // Check if user is already in a seat
    const existingSeat = await AudioChatUser.findOne({
      liveStreamId: req.params.id,
      joinedUserId: req.user._id.toString(),
      leftRoom: false,
    });

    if (existingSeat) {
      return res.status(400).json({
        success: false,
        message: "You are already in a seat. Leave first.",
        occupiedSeatIndex: existingSeat.seatIndex,
      });
    }

    // Get seat
    const seat = await AudioChatUser.findOne({
      liveStreamId: req.params.id,
      seatIndex: seatIndex,
    });

    if (!seat) {
      return res.status(404).json({
        success: false,
        message: "Seat not found",
      });
    }

    // Check if seat is occupied
    if (seat.joinedUserId && !seat.leftRoom) {
      return res.status(400).json({
        success: false,
        message: "Seat is already occupied",
      });
    }

    // Join the seat
    seat.joinedUser = req.user._id;
    seat.joinedUserId = req.user._id.toString();
    seat.joinedUserUid = userUid;
    seat.canTalk = false; // Host needs to approve for non-hosts
    seat.enabledVideo = false; // Video off by default
    seat.enabledAudio = true;
    seat.leftRoom = false;
    await seat.save();

    await seat.populate("joinedUser", "displayName photoURL username");

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").to(`live:${liveStream._id}`).emit("live:seat:updated", {
        seat: seat.toJSON(),
        action: "joined",
      });
    }

    res.json({
      success: true,
      data: seat,
    });
  } catch (error) {
    console.error("Join party seat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join seat",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/party/seats/:seatIndex/leave
 * @desc    Leave a party room seat
 * @access  Private
 */
router.post(
  "/:id/party/seats/:seatIndex/leave",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const seatIndex = parseInt(req.params.seatIndex);

      const seat = await AudioChatUser.findOne({
        liveStreamId: req.params.id,
        seatIndex: seatIndex,
        joinedUserId: req.user._id.toString(),
      });

      if (!seat) {
        return res.status(404).json({
          success: false,
          message: "You are not in this seat",
        });
      }

      // Leave the seat
      seat.joinedUser = null;
      seat.joinedUserId = null;
      seat.joinedUserUid = null;
      seat.canTalk = false;
      seat.enabledVideo = false;
      seat.enabledAudio = false;
      seat.leftRoom = true;
      await seat.save();

      // Emit socket event
      if (req.app.get("io")) {
        req.app
          .get("io")
          .to(`live:${req.params.id}`)
          .emit("live:seat:updated", {
            seatIndex: seatIndex,
            action: "left",
          });
      }

      res.json({
        success: true,
        message: "Left seat successfully",
      });
    } catch (error) {
      console.error("Leave party seat error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to leave seat",
        error: error.message,
      });
    }
  }
);

// ========== HOST CONTROLS ==========

/**
 * @route   POST /api/live/:id/party/host/mute
 * @desc    Host mutes a user
 * @access  Private (Host only)
 */
router.post("/:id/party/host/mute", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { targetUserId, seatIndex } = req.body;

    const liveStream = await LiveStream.findById(req.params.id);
    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    // Check if user is host
    if (liveStream.authorId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the host can perform this action",
      });
    }

    // Get user's seat
    const seat = await AudioChatUser.findOne({
      liveStreamId: req.params.id,
      seatIndex: seatIndex,
      joinedUserId: targetUserId,
    });

    if (!seat) {
      return res.status(404).json({
        success: false,
        message: "User not found in seat",
      });
    }

    // Mute user
    seat.enabledAudio = false;
    if (!seat.usersMutedByHostAudio.includes(targetUserId)) {
      seat.usersMutedByHostAudio.push(targetUserId);
    }
    await seat.save();

    // Emit socket event to target user
    if (req.app.get("io")) {
      req.app.get("io").emit("live:host:action", {
        action: "mute",
        targetUserId: targetUserId,
        liveStreamId: req.params.id,
      });
    }

    res.json({
      success: true,
      message: "User muted",
      data: seat,
    });
  } catch (error) {
    console.error("Mute user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mute user",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/party/host/unmute
 * @desc    Host unmutes a user
 * @access  Private (Host only)
 */
router.post(
  "/:id/party/host/unmute",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { targetUserId, seatIndex } = req.body;

      const liveStream = await LiveStream.findById(req.params.id);
      if (!liveStream) {
        return res.status(404).json({
          success: false,
          message: "Live stream not found",
        });
      }

      // Check if user is host
      if (liveStream.authorId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Only the host can perform this action",
        });
      }

      // Get user's seat
      const seat = await AudioChatUser.findOne({
        liveStreamId: req.params.id,
        seatIndex: seatIndex,
        joinedUserId: targetUserId,
      });

      if (!seat) {
        return res.status(404).json({
          success: false,
          message: "User not found in seat",
        });
      }

      // Unmute user
      seat.enabledAudio = true;
      seat.usersMutedByHostAudio = seat.usersMutedByHostAudio.filter(
        (id) => id !== targetUserId
      );
      await seat.save();

      // Emit socket event to target user
      if (req.app.get("io")) {
        req.app.get("io").emit("live:host:action", {
          action: "unmute",
          targetUserId: targetUserId,
          liveStreamId: req.params.id,
        });
      }

      res.json({
        success: true,
        message: "User unmuted",
        data: seat,
      });
    } catch (error) {
      console.error("Unmute user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to unmute user",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/live/:id/party/host/disable-video
 * @desc    Host disables a user's video
 * @access  Private (Host only)
 */
router.post(
  "/:id/party/host/disable-video",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { targetUserId, seatIndex } = req.body;

      const liveStream = await LiveStream.findById(req.params.id);
      if (!liveStream) {
        return res.status(404).json({
          success: false,
          message: "Live stream not found",
        });
      }

      // Check if user is host
      if (liveStream.authorId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Only the host can perform this action",
        });
      }

      // Get user's seat
      const seat = await AudioChatUser.findOne({
        liveStreamId: req.params.id,
        seatIndex: seatIndex,
        joinedUserId: targetUserId,
      });

      if (!seat) {
        return res.status(404).json({
          success: false,
          message: "User not found in seat",
        });
      }

      // Disable video
      seat.enabledVideo = false;
      await seat.save();

      // Emit socket event to target user
      if (req.app.get("io")) {
        req.app.get("io").emit("live:host:action", {
          action: "disable_video",
          targetUserId: targetUserId,
          liveStreamId: req.params.id,
        });
      }

      res.json({
        success: true,
        message: "User video disabled",
        data: seat,
      });
    } catch (error) {
      console.error("Disable video error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to disable video",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/live/:id/party/host/remove-user
 * @desc    Host removes a user from the live
 * @access  Private (Host only)
 */
router.post(
  "/:id/party/host/remove-user",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { targetUserId, seatIndex } = req.body;

      const liveStream = await LiveStream.findById(req.params.id);
      if (!liveStream) {
        return res.status(404).json({
          success: false,
          message: "Live stream not found",
        });
      }

      // Check if user is host
      if (liveStream.authorId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Only the host can perform this action",
        });
      }

      // Get user's seat
      const seat = await AudioChatUser.findOne({
        liveStreamId: req.params.id,
        seatIndex: seatIndex,
        joinedUserId: targetUserId,
      });

      if (!seat) {
        return res.status(404).json({
          success: false,
          message: "User not found in seat",
        });
      }

      // Mark user as removed
      seat.joinedUser = null;
      seat.joinedUserId = null;
      seat.joinedUserUid = null;
      seat.canTalk = false;
      seat.enabledVideo = false;
      seat.enabledAudio = false;
      seat.leftRoom = true;
      await seat.save();

      // Add to removed users list
      if (!liveStream.removedUsersId.includes(targetUserId)) {
        liveStream.removedUsersId.push(targetUserId);
        await liveStream.save();
      }

      // Emit socket event to target user
      if (req.app.get("io")) {
        req.app.get("io").emit("live:user:removed", {
          userId: targetUserId,
          liveStreamId: req.params.id,
          reason: "Host removed you",
        });

        // Also emit to all to update UI
        req.app.get("io").to(`live:${req.params.id}`).emit("live:seat:updated", {
          seatIndex: seatIndex,
          action: "removed",
        });
      }

      res.json({
        success: true,
        message: "User removed from live",
        data: seat,
      });
    } catch (error) {
      console.error("Remove user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to remove user",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/live/:id/party/host/approve-audio
 * @desc    Host approves audio for a user (allow them to talk)
 * @access  Private (Host only)
 */
router.post(
  "/:id/party/host/approve-audio",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { targetUserId, seatIndex } = req.body;

      const liveStream = await LiveStream.findById(req.params.id);
      if (!liveStream) {
        return res.status(404).json({
          success: false,
          message: "Live stream not found",
        });
      }

      // Check if user is host
      if (liveStream.authorId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Only the host can perform this action",
        });
      }

      // Get user's seat
      const seat = await AudioChatUser.findOne({
        liveStreamId: req.params.id,
        seatIndex: seatIndex,
        joinedUserId: targetUserId,
      });

      if (!seat) {
        return res.status(404).json({
          success: false,
          message: "User not found in seat",
        });
      }

      // Approve audio
      seat.canTalk = true;
      seat.enabledAudio = true;
      seat.usersMutedByHostAudio = [];
      await seat.save();

      // Emit socket event to target user
      if (req.app.get("io")) {
        req.app.get("io").emit("live:host:action", {
          action: "approve_audio",
          targetUserId: targetUserId,
          liveStreamId: req.params.id,
        });
      }

      res.json({
        success: true,
        message: "User audio approved",
        data: seat,
      });
    } catch (error) {
      console.error("Approve audio error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to approve audio",
        error: error.message,
      });
    }
  }
);

module.exports = router;
