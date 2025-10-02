const express = require("express");
const { body, param, validationResult } = require("express-validator");
const Chat = require("../models/Chat");
const User = require("../models/User");
const { authenticateJWT } = require("../middleware/jwtAuth");
const { emitCallInvitation, emitCallEnd } = require("../config/socket");

const router = express.Router();

// In-memory call storage (in production, use Redis or database)
const activeCalls = new Map();

/**
 * @route   POST /api/calls/create
 * @desc    Create a new call and send invitations
 * @access  Private
 */
router.post(
  "/create",
  authenticateJWT,
  [
    body("chatId").isMongoId().withMessage("Invalid chat ID"),
    body("participants").isArray().withMessage("Participants must be an array"),
    body("type").isIn(["audio", "video"]).withMessage("Invalid call type"),
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
      const { chatId, participants, type } = req.body;

      // Verify chat exists and user is a member
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      if (!chat.isMember(user._id)) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this chat",
        });
      }

      // Generate unique room ID
      const roomId = `flip-call-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const callId = `call-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Create call data
      const callData = {
        callId,
        roomId,
        chatId,
        callerId: user._id.toString(),
        callerName: user.displayName || user.profile?.username || "User",
        type,
        participants,
        createdAt: new Date(),
        status: "ringing",
      };

      // Store call in memory
      activeCalls.set(callId, callData);

      // Get participant user data for notifications
      const participantUsers = await User.find({
        _id: { $in: participants },
      }).select("_id displayName profile.username");

      // Emit call invitation to all participants via Socket.IO
      const callInvitation = {
        ...callData,
        callerAvatar: user.photoURL,
        participantUsers: participantUsers.map((p) => ({
          id: p._id.toString(),
          name: p.displayName || p.profile?.username || "User",
        })),
      };

      // Emit to all participants
      participants.forEach((participantId) => {
        emitCallInvitation(participantId, callInvitation);
      });

      console.log(`📞 Call created: ${callId} (${type}) in room: ${roomId}`);

      res.status(201).json({
        success: true,
        message: "Call created and invitations sent",
        data: {
          callId,
          roomId,
          type,
          participants,
        },
      });
    } catch (error) {
      console.error("Create call error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create call",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/calls/:callId/join
 * @desc    Join a call
 * @access  Private
 */
router.post(
  "/:callId/join",
  authenticateJWT,
  [param("callId").notEmpty().withMessage("Call ID is required")],
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
      const { callId } = req.params;

      // Get call data
      const callData = activeCalls.get(callId);
      if (!callData) {
        return res.status(404).json({
          success: false,
          message: "Call not found or expired",
        });
      }

      // Check if user is invited
      const isParticipant =
        callData.participants.includes(user._id.toString()) ||
        callData.callerId === user._id.toString();

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: "You are not invited to this call",
        });
      }

      // Update call status
      callData.status = "active";
      if (!callData.joinedParticipants) {
        callData.joinedParticipants = [];
      }
      if (!callData.joinedParticipants.includes(user._id.toString())) {
        callData.joinedParticipants.push(user._id.toString());
      }

      console.log(`📞 User ${user.displayName} joined call: ${callId}`);

      res.json({
        success: true,
        message: "Joined call successfully",
        data: {
          roomId: callData.roomId,
          type: callData.type,
        },
      });
    } catch (error) {
      console.error("Join call error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to join call",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/calls/:callId/end
 * @desc    End a call
 * @access  Private
 */
router.post(
  "/:callId/end",
  authenticateJWT,
  [param("callId").notEmpty().withMessage("Call ID is required")],
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
      const { callId } = req.params;

      // Get call data
      const callData = activeCalls.get(callId);
      if (!callData) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // Check if user can end the call (caller or participant)
      const canEndCall =
        callData.callerId === user._id.toString() ||
        callData.participants.includes(user._id.toString());

      if (!canEndCall) {
        return res.status(403).json({
          success: false,
          message: "You cannot end this call",
        });
      }

      // Update call status
      callData.status = "ended";
      callData.endedAt = new Date();
      callData.endedBy = user._id.toString();

      // Emit call end to all participants
      const allParticipants = [callData.callerId, ...callData.participants];
      allParticipants.forEach((participantId) => {
        emitCallEnd(participantId, {
          callId,
          endedBy: user.displayName || user.profile?.username || "User",
          endedAt: callData.endedAt,
        });
      });

      // Remove call from active calls after a delay (for cleanup)
      setTimeout(() => {
        activeCalls.delete(callId);
      }, 30000); // 30 seconds

      console.log(`📞 Call ended: ${callId} by ${user.displayName}`);

      res.json({
        success: true,
        message: "Call ended successfully",
      });
    } catch (error) {
      console.error("End call error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to end call",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/calls/:callId/reject
 * @desc    Reject a call invitation
 * @access  Private
 */
router.post(
  "/:callId/reject",
  authenticateJWT,
  [param("callId").notEmpty().withMessage("Call ID is required")],
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
      const { callId } = req.params;

      // Get call data
      const callData = activeCalls.get(callId);
      if (!callData) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // Check if user is invited
      const isParticipant = callData.participants.includes(user._id.toString());
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: "You are not invited to this call",
        });
      }

      // Add to rejected participants
      if (!callData.rejectedParticipants) {
        callData.rejectedParticipants = [];
      }
      if (!callData.rejectedParticipants.includes(user._id.toString())) {
        callData.rejectedParticipants.push(user._id.toString());
      }

      console.log(`📞 User ${user.displayName} rejected call: ${callId}`);

      res.json({
        success: true,
        message: "Call rejected successfully",
      });
    } catch (error) {
      console.error("Reject call error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reject call",
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/calls/active
 * @desc    Get active calls for the user
 * @access  Private
 */
router.get("/active", authenticateJWT, async (req, res) => {
  try {
    const { user } = req;
    const userCalls = [];

    // Find calls where user is caller or participant
    for (const [callId, callData] of activeCalls.entries()) {
      if (
        callData.callerId === user._id.toString() ||
        callData.participants.includes(user._id.toString())
      ) {
        if (callData.status === "ringing" || callData.status === "active") {
          userCalls.push({
            callId,
            roomId: callData.roomId,
            type: callData.type,
            status: callData.status,
            callerName: callData.callerName,
            createdAt: callData.createdAt,
          });
        }
      }
    }

    res.json({
      success: true,
      message: "Active calls retrieved successfully",
      data: {
        calls: userCalls,
      },
    });
  } catch (error) {
    console.error("Get active calls error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get active calls",
      error: error.message,
    });
  }
});

// Cleanup expired calls every 5 minutes
setInterval(() => {
  const now = new Date();
  const expiredCalls = [];

  for (const [callId, callData] of activeCalls.entries()) {
    const callAge = now - new Date(callData.createdAt);
    // Remove calls older than 1 hour or ended calls older than 5 minutes
    if (
      callAge > 60 * 60 * 1000 || // 1 hour
      (callData.status === "ended" && callAge > 5 * 60 * 1000) // 5 minutes
    ) {
      expiredCalls.push(callId);
    }
  }

  expiredCalls.forEach((callId) => {
    activeCalls.delete(callId);
    console.log(`📞 Cleaned up expired call: ${callId}`);
  });

  if (expiredCalls.length > 0) {
    console.log(`📞 Cleaned up ${expiredCalls.length} expired calls`);
  }
}, 5 * 60 * 1000); // 5 minutes

module.exports = router;
