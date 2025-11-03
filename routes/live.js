const express = require("express");
const router = express.Router();
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const LiveStream = require("../models/LiveStream");
const LiveMessage = require("../models/LiveMessage");
const LiveViewer = require("../models/LiveViewer");
const AudioChatUser = require("../models/AudioChatUser");
const GiftSent = require("../models/GiftSent");
const GiftSender = require("../models/GiftSender");
const Gift = require("../models/Gift");
const User = require("../models/User");

/**
 * @route   POST /api/live/create
 * @desc    Create a new live stream
 * @access  Private
 */
router.post("/create", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const {
      liveType,
      liveSubType,
      streamingChannel,
      title,
      numberOfChairs,
      partyType,
      private: isPrivate,
      authorUid,
    } = req.body;

    // Validate required fields
    if (!streamingChannel || !authorUid) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: streamingChannel, authorUid",
      });
    }

    // Create live stream
    const liveStream = await LiveStream.create({
      author: req.user._id,
      authorId: req.user._id.toString(),
      authorUid: authorUid,
      liveType: liveType || "live",
      liveSubType: liveSubType || "Talking",
      streamingChannel: streamingChannel,
      title: title || "",
      numberOfChairs: numberOfChairs || 6,
      partyType: partyType || "video",
      private: isPrivate || false,
      streaming: true,
    });

    // If it's a party live, create empty seats
    if (liveType === "party" || liveType === "audio") {
      const seats = numberOfChairs || 6;
      const seatPromises = [];

      for (let i = 0; i < seats; i++) {
        // Seat 0 is reserved for the host
        if (i === 0) {
          seatPromises.push(
            AudioChatUser.create({
              liveStream: liveStream._id,
              liveStreamId: liveStream._id.toString(),
              joinedUser: req.user._id,
              joinedUserId: req.user._id.toString(),
              joinedUserUid: authorUid,
              seatIndex: 0,
              canTalk: true,
              enabledVideo: liveType === "party",
              enabledAudio: true,
              leftRoom: false,
            })
          );
        } else {
          seatPromises.push(
            AudioChatUser.create({
              liveStream: liveStream._id,
              liveStreamId: liveStream._id.toString(),
              seatIndex: i,
              canTalk: false,
              enabledVideo: false,
              enabledAudio: true,
              leftRoom: false,
            })
          );
        }
      }

      await Promise.all(seatPromises);
    }

    // Create system message
    await LiveMessage.createSystemMessage(
      req.user._id.toString(),
      liveStream._id.toString(),
      "Live stream started"
    );

    // Populate author
    await liveStream.populate("author", "displayName photoURL username");

    // Emit socket event for new live
    if (req.app.get("io")) {
      req.app.get("io").emit("live:created", {
        liveStream: liveStream,
      });
    }

    res.status(201).json({
      success: true,
      data: liveStream,
    });
  } catch (error) {
    console.error("Create live stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create live stream",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/live/active
 * @desc    Get all active live streams
 * @access  Public
 */
router.get("/active", async (req, res) => {
  try {
    const { liveType, limit = 20, skip = 0 } = req.query;

    const query = { streaming: true, endByAdmin: false };
    if (liveType && liveType !== "all") {
      query.liveType = liveType;
    }

    const liveStreams = await LiveStream.find(query)
      .populate("author", "displayName photoURL username")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await LiveStream.countDocuments(query);

    res.json({
      success: true,
      data: liveStreams,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > parseInt(skip) + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get active live streams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch live streams",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/live/:id
 * @desc    Get live stream details
 * @access  Public
 */
router.get("/:id", async (req, res) => {
  try {
    const liveStream = await LiveStream.findById(req.params.id)
      .populate("author", "displayName photoURL username")
      .populate("coHostAuthor", "displayName photoURL username");

    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    res.json({
      success: true,
      data: liveStream,
    });
  } catch (error) {
    console.error("Get live stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch live stream",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/join
 * @desc    Join a live stream as viewer
 * @access  Private
 */
router.post("/:id/join", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { userUid } = req.body;

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

    // Check if user is removed
    if (liveStream.removedUsersId.includes(req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: "You have been removed from this live stream",
      });
    }

    // Add viewer
    liveStream.addViewer(req.user._id.toString(), userUid);
    await liveStream.save();

    // Create or update viewer record
    await LiveViewer.getOrCreate(
      req.user._id.toString(),
      liveStream._id.toString(),
      liveStream.authorId
    );

    // Create join message
    await LiveMessage.create({
      author: req.user._id,
      authorId: req.user._id.toString(),
      liveStream: liveStream._id,
      liveStreamId: liveStream._id.toString(),
      messageType: "JOIN",
      message: "joined the live",
    });

    // Emit socket event
    if (req.app.get("io")) {
      req.app
        .get("io")
        .to(`live:${liveStream._id}`)
        .emit("live:viewer:joined", {
          liveStreamId: liveStream._id.toString(),
          userId: req.user._id.toString(),
          viewersCount: liveStream.viewersCount,
        });
    }

    res.json({
      success: true,
      data: {
        liveStream: liveStream,
        viewersCount: liveStream.viewersCount,
      },
    });
  } catch (error) {
    console.error("Join live stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join live stream",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/leave
 * @desc    Leave a live stream
 * @access  Private
 */
router.post("/:id/leave", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { userUid } = req.body;

    const liveStream = await LiveStream.findById(req.params.id);

    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    // Remove viewer
    liveStream.removeViewer(req.user._id.toString(), userUid);
    await liveStream.save();

    // Update viewer record
    const viewer = await LiveViewer.findOne({
      liveId: liveStream._id.toString(),
      authorId: req.user._id.toString(),
    });

    if (viewer) {
      viewer.leaveLive();
      await viewer.save();
    }

    // Create leave message
    await LiveMessage.create({
      author: req.user._id,
      authorId: req.user._id.toString(),
      liveStream: liveStream._id,
      liveStreamId: liveStream._id.toString(),
      messageType: "LEAVE",
      message: "left the live",
    });

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").to(`live:${liveStream._id}`).emit("live:viewer:left", {
        liveStreamId: liveStream._id.toString(),
        userId: req.user._id.toString(),
        viewersCount: liveStream.viewersCount,
      });
    }

    res.json({
      success: true,
      message: "Left live stream successfully",
    });
  } catch (error) {
    console.error("Leave live stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave live stream",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/end
 * @desc    End a live stream (host only)
 * @access  Private
 */
router.post("/:id/end", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const liveStream = await LiveStream.findById(req.params.id);

    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    // Check if user is the host
    if (liveStream.authorId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the host can end the live stream",
      });
    }

    liveStream.streaming = false;
    await liveStream.save();

    // Update all viewers
    await LiveViewer.updateMany(
      { liveId: liveStream._id.toString(), watching: true },
      { watching: false, leftAt: new Date() }
    );

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").to(`live:${liveStream._id}`).emit("live:ended", {
        liveStreamId: liveStream._id.toString(),
      });
    }

    res.json({
      success: true,
      message: "Live stream ended successfully",
      data: {
        totalViewers: liveStream.viewersId.length,
        totalDiamonds: liveStream.streamingDiamonds,
        duration: liveStream.streamingTime,
      },
    });
  } catch (error) {
    console.error("End live stream error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end live stream",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/message
 * @desc    Send a message in live stream
 * @access  Private
 */
router.post("/:id/message", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { message, messageType = "COMMENT" } = req.body;

    if (!message && messageType === "COMMENT") {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    const liveStream = await LiveStream.findById(req.params.id);

    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    const liveMessage = await LiveMessage.create({
      author: req.user._id,
      authorId: req.user._id.toString(),
      liveStream: liveStream._id,
      liveStreamId: liveStream._id.toString(),
      message: message,
      messageType: messageType,
    });

    await liveMessage.populate("author", "displayName photoURL username");

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").to(`live:${liveStream._id}`).emit("live:message", {
        message: liveMessage,
      });
    }

    res.status(201).json({
      success: true,
      data: liveMessage,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/live/:id/messages
 * @desc    Get live stream messages
 * @access  Public
 */
router.get("/:id/messages", async (req, res) => {
  try {
    const { limit = 50, before } = req.query;

    const query = { liveStreamId: req.params.id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await LiveMessage.find(query)
      .populate("author", "displayName photoURL username")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: messages.reverse(), // Return in chronological order
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/live/:id/viewers
 * @desc    Get current viewers
 * @access  Public
 */
router.get("/:id/viewers", async (req, res) => {
  try {
    const viewers = await LiveViewer.getCurrentViewers(req.params.id);

    res.json({
      success: true,
      data: viewers,
      count: viewers.length,
    });
  } catch (error) {
    console.error("Get viewers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch viewers",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/live/:id/seats
 * @desc    Get party room seats
 * @access  Public
 */
router.get("/:id/seats", async (req, res) => {
  try {
    const seats = await AudioChatUser.find({
      liveStreamId: req.params.id,
    })
      .populate("joinedUser", "displayName photoURL username")
      .sort({ seatIndex: 1 });

    res.json({
      success: true,
      data: seats,
    });
  } catch (error) {
    console.error("Get seats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch seats",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/seats/:seatIndex/join
 * @desc    Join a party room seat
 * @access  Private
 */
router.post("/:id/seats/:seatIndex/join", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const { userUid } = req.body;
    const seatIndex = parseInt(req.params.seatIndex);

    const liveStream = await LiveStream.findById(req.params.id);

    if (!liveStream) {
      return res.status(404).json({
        success: false,
        message: "Live stream not found",
      });
    }

    // Check if user is already in a seat
    const existingSeat = await AudioChatUser.findOne({
      liveStreamId: req.params.id,
      joinedUserId: req.user._id.toString(),
      leftRoom: false,
    });

    if (existingSeat) {
      // Remove from old seat
      existingSeat.joinedUser = null;
      existingSeat.joinedUserId = null;
      existingSeat.joinedUserUid = null;
      existingSeat.canTalk = false;
      existingSeat.enabledVideo = false;
      await existingSeat.save();
    }

    // Find the seat
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
    seat.canTalk = false; // Host needs to approve
    seat.enabledVideo = false;
    seat.enabledAudio = true;
    seat.leftRoom = false;
    await seat.save();

    await seat.populate("joinedUser", "displayName photoURL username");

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").to(`live:${liveStream._id}`).emit("live:seat:joined", {
        seat: seat,
      });
    }

    res.json({
      success: true,
      data: seat,
    });
  } catch (error) {
    console.error("Join seat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join seat",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/live/:id/seats/:seatIndex/leave
 * @desc    Leave a party room seat
 * @access  Private
 */
router.post("/:id/seats/:seatIndex/leave", authenticateToken, requireSyncedUser, async (req, res) => {
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
    seat.leftRoom = false;
    await seat.save();

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").to(`live:${req.params.id}`).emit("live:seat:left", {
        seatIndex: seatIndex,
        userId: req.user._id.toString(),
      });
    }

    res.json({
      success: true,
      message: "Left seat successfully",
    });
  } catch (error) {
    console.error("Leave seat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave seat",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/live/gifts
 * @desc    Get available gifts
 * @access  Public
 */
router.get("/gifts/all", async (req, res) => {
  try {
    const gifts = await Gift.getActiveGifts();

    res.json({
      success: true,
      data: gifts,
    });
  } catch (error) {
    console.error("Get gifts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch gifts",
      error: error.message,
    });
  }
});

module.exports = router;

