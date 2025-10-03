const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const multer = require("multer");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const {
  uploadToCloudinary,
  uploadRawFile,
  uploadAudio,
} = require("../config/cloudinary");
const {
  messageSendLimiter,
  chatCreationLimiter,
  chatFileUploadLimiter,
  validateMessageContent,
  validateChatCreation,
  sanitizeMessageContent,
  logChatActivity,
} = require("../middleware/chatMiddleware");
const {
  emitNewMessage,
  emitMessageUpdate,
  emitChatUpdate,
} = require("../config/socket");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for chat messages
    cb(null, true);
  },
});

/**
 * @route   GET /api/chats
 * @desc    Get all chats for the authenticated user
 * @access  Private
 */
router.get(
  "/",
  authenticateJWT,
  requireAuth,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("search")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Search query must be between 1 and 100 characters"),
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
      const { page = 1, limit = 20, search } = req.query;
      const skip = (page - 1) * limit;

      let chats;
      if (search) {
        chats = await Chat.searchChats(user._id, search)
          .limit(parseInt(limit))
          .skip(skip)
          .populate(
            "members.userId",
            "displayName photoURL profile.username email"
          )
          .populate(
            "lastMessage.senderId",
            "displayName profile.username email"
          );
      } else {
        chats = await Chat.findActiveChatsForUser(user._id)
          .limit(parseInt(limit))
          .skip(skip)
          .populate(
            "members.userId",
            "displayName photoURL profile.username email"
          )
          .populate(
            "lastMessage.senderId",
            "displayName profile.username email"
          );
      }

      // Get unread message counts for each chat
      const chatsWithUnreadCounts = await Promise.all(
        chats.map(async (chat) => {
          const unreadCount = await Message.getUnreadCount(chat._id, user._id);
          return {
            ...chat.toJSON(),
            unreadCount,
          };
        })
      );

      res.json({
        success: true,
        message: "Chats retrieved successfully",
        data: {
          chats: chatsWithUnreadCounts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: chatsWithUnreadCounts.length,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch chats",
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/chats/:chatId
 * @desc    Get a specific chat by ID
 * @access  Private
 */
router.get(
  "/:chatId",
  authenticateJWT,
  requireAuth,
  [param("chatId").isMongoId().withMessage("Invalid chat ID")],
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
      const { chatId } = req.params;

      const chat = await Chat.findById(chatId)
        .populate(
          "members.userId",
          "displayName photoURL profile.username email"
        )
        .populate("lastMessage.senderId", "displayName profile.username email");

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      // Check if user is a member of this chat
      if (!chat.isMember(user._id)) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this chat",
        });
      }

      // Get unread message count
      const unreadCount = await Message.getUnreadCount(chatId, user._id);

      res.json({
        success: true,
        message: "Chat retrieved successfully",
        data: {
          chat: {
            ...chat.toJSON(),
            unreadCount,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching chat:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch chat",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/chats
 * @desc    Create a new chat (group chat or direct chat)
 * @access  Private
 */
router.post(
  "/",
  authenticateJWT,
  chatCreationLimiter,
  logChatActivity("CREATE_CHAT"),
  validateChatCreation,
  [
    body("description")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    body("participants.*")
      .isMongoId()
      .withMessage("Each participant must be a valid user ID"),
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
      const { type, name, description, participants } = req.body;

      // For direct chats, ensure exactly 2 participants
      if (type === "direct" && participants.length !== 1) {
        return res.status(400).json({
          success: false,
          message: "Direct chats must have exactly 1 other participant",
        });
      }

      // For group chats, ensure at least 1 other participant
      if (type === "group" && participants.length < 1) {
        return res.status(400).json({
          success: false,
          message: "Group chats must have at least 1 other participant",
        });
      }

      // For direct chats, check if chat already exists
      if (type === "direct") {
        const existingChat = await Chat.findDirectChat(
          user._id,
          participants[0]
        );
        if (existingChat) {
          return res.json({
            success: true,
            message: "Direct chat already exists",
            data: { chat: existingChat },
          });
        }
      }

      // Get participant user data - just verify they exist
      const participantUsers = await User.find({
        _id: { $in: participants },
      }).select("_id");

      if (participantUsers.length !== participants.length) {
        return res.status(400).json({
          success: false,
          message: "One or more participants not found",
        });
      }

      // Create chat members array - simplified to just userId and role
      const members = [
        {
          userId: user._id,
          role: type === "group" ? "admin" : "member",
        },
        ...participantUsers.map((participant) => ({
          userId: participant._id,
          role: "member",
        })),
      ];

      // Create the chat
      const chatData = {
        type,
        name: name || (type === "direct" ? undefined : `Group Chat`),
        description,
        members,
        createdBy: user._id,
        participants:
          type === "direct" ? [user._id, participants[0]] : undefined,
      };

      const chat = new Chat(chatData);
      await chat.save();

      // Populate the created chat with full user data
      await chat.populate(
        "members.userId",
        "displayName photoURL profile.username email"
      );

      res.status(201).json({
        success: true,
        message: "Chat created successfully",
        data: { chat },
      });
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create chat",
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/chats/:chatId/messages
 * @desc    Get messages in a chat
 * @access  Private
 */
router.get(
  "/:chatId/messages",
  authenticateJWT,
  requireAuth,
  [
    param("chatId").isMongoId().withMessage("Invalid chat ID"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("before")
      .optional()
      .isISO8601()
      .withMessage("Before must be a valid ISO date"),
    query("after")
      .optional()
      .isISO8601()
      .withMessage("After must be a valid ISO date"),
    query("type")
      .optional()
      .isIn([
        "text",
        "image",
        "video",
        "audio",
        "lottie",
        "svga",
        "file",
        "location",
        "contact",
      ])
      .withMessage("Invalid message type"),
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
      const { chatId } = req.params;
      const { page = 1, limit = 50, before, after, type } = req.query;

      // Check if user is a member of this chat
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

      // Get messages
      const options = {
        limit: parseInt(limit),
        skip: (page - 1) * limit,
        before: before ? new Date(before) : null,
        after: after ? new Date(after) : null,
        type,
        userId: user._id,
      };

      const messages = await Message.findInChat(chatId, options);

      // Update user's last seen in chat
      await chat.updateLastSeen(user._id);

      res.json({
        success: true,
        message: "Messages retrieved successfully",
        data: {
          messages: messages.reverse(), // Reverse to show oldest first
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: messages.length,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch messages",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/chats/:chatId/messages
 * @desc    Send a message in a chat
 * @access  Private
 */
router.post(
  "/:chatId/messages",
  authenticateJWT,
  requireAuth,
  messageSendLimiter,
  chatFileUploadLimiter,
  upload.single("media"),
  logChatActivity("SEND_MESSAGE"),
  sanitizeMessageContent,
  validateMessageContent,
  [
    param("chatId").isMongoId().withMessage("Invalid chat ID"),
    body("replyToMessageId")
      .optional()
      .isMongoId()
      .withMessage("Invalid reply message ID"),
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
      const { chatId } = req.params;
      const { type, content, replyToMessageId, location, contact } = req.body;

      // Check if user is a member of this chat
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

      // Check if user can send messages
      if (!chat.canPerformAction(user._id, "whoCanSendMessages")) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to send messages in this chat",
        });
      }

      // Prepare message data
      const messageData = {
        chatId,
        senderId: user._id,
        senderFirebaseUid: user.firebaseUid,
        senderName: user.displayName || user.username,
        senderAvatar: user.photoURL,
        type,
        content: content || null,
      };

      // Handle media upload
      if (
        req.file &&
        ["image", "video", "audio", "lottie", "svga", "file"].includes(type)
      ) {
        try {
          let uploadResult;

          // Handle different file types with appropriate upload methods
          if (type === "audio") {
            uploadResult = await uploadAudio(req.file.buffer, {
              folder: `chat_media/audio`,
              public_id: `${chatId}_${Date.now()}`,
            });
          } else if (type === "lottie" || type === "svga") {
            uploadResult = await uploadRawFile(req.file.buffer, {
              folder: `chat_media/${type}`,
              public_id: `${chatId}_${Date.now()}`,
            });
          } else {
            // Handle images, videos, and general files
            let resourceType = "auto";
            if (type === "video") resourceType = "video";
            if (type === "file") resourceType = "raw";

            uploadResult = await uploadToCloudinary(req.file.buffer, {
              resource_type: resourceType,
              folder: `chat_media/${type}s`,
              public_id: `${chatId}_${Date.now()}`,
            });
          }

          messageData.media = {
            url: uploadResult.secure_url || uploadResult.url,
            thumbnailUrl:
              type === "video"
                ? generateVideoThumbnail(uploadResult.public_id, {
                    width: 800,
                    height: 600,
                    crop: "fill",
                  })
                : uploadResult.eager?.[0]?.secure_url ||
                  uploadResult.secure_url ||
                  uploadResult.url,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            duration: uploadResult.duration || null,
            dimensions: {
              width: uploadResult.width || null,
              height: uploadResult.height || null,
            },
          };

          // Handle special file types
          if (type === "lottie") {
            try {
              messageData.media.lottieData = JSON.parse(
                req.file.buffer.toString()
              );
            } catch (parseError) {
              console.error("Failed to parse Lottie JSON:", parseError);
              messageData.media.lottieData = null;
            }
          } else if (type === "svga") {
            messageData.media.svgaData = {
              size: req.file.size,
              originalName: req.file.originalname,
            };
          }
        } catch (uploadError) {
          console.error("Media upload error:", uploadError);
          return res.status(500).json({
            success: false,
            message: "Failed to upload media",
            error: uploadError.message,
          });
        }
      }

      // Handle location messages
      if (type === "location" && location) {
        messageData.location = {
          latitude: parseFloat(location.latitude),
          longitude: parseFloat(location.longitude),
          address: location.address || null,
          name: location.name || null,
        };
      }

      // Handle contact messages
      if (type === "contact" && contact) {
        messageData.contact = {
          name: contact.name,
          phoneNumber: contact.phoneNumber || null,
          email: contact.email || null,
          avatar: contact.avatar || null,
        };
      }

      // Handle reply messages
      if (replyToMessageId) {
        const replyToMessage = await Message.findById(
          replyToMessageId
        ).populate("senderId", "displayName username");

        if (replyToMessage && replyToMessage.chatId.toString() === chatId) {
          messageData.replyTo = {
            messageId: replyToMessage._id,
            senderId: replyToMessage.senderId._id,
            senderName:
              replyToMessage.senderId.displayName ||
              replyToMessage.senderId.username,
            content: replyToMessage.content
              ? replyToMessage.content.substring(0, 200)
              : "",
            type: replyToMessage.type,
            timestamp: replyToMessage.createdAt,
          };
        }
      }

      // Set expiration time if chat has auto-delete enabled
      if (chat.settings?.autoDeleteMessages?.enabled) {
        const hours = chat.settings.autoDeleteMessages.duration || 24;
        messageData.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      }

      // Create and save the message
      const message = new Message(messageData);
      await message.save();

      // Update chat's last message
      await chat.updateLastMessage(message);

      // Populate the message
      await message.populate("senderId", "displayName photoURL username");
      if (message.replyTo) {
        await message.populate("replyTo.senderId", "displayName username");
      }

      // Emit socket event for real-time messaging
      emitNewMessage(message);

      res.status(201).json({
        success: true,
        message: "Message sent successfully",
        data: { message },
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send message",
        error: error.message,
      });
    }
  }
);

/**
 * @route   PUT /api/chats/:chatId/messages/:messageId/read
 * @desc    Mark a message as read
 * @access  Private
 */
router.put(
  "/:chatId/messages/:messageId/read",
  authenticateJWT,
  requireAuth,
  [
    param("chatId").isMongoId().withMessage("Invalid chat ID"),
    param("messageId").isMongoId().withMessage("Invalid message ID"),
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
      const { chatId, messageId } = req.params;

      // Check if user is a member of this chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isMember(user._id)) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this chat",
        });
      }

      // Find and mark message as read
      const message = await Message.findOne({
        _id: messageId,
        chatId,
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }

      await message.markAsRead(user._id, user.username);

      // Emit socket event for read receipt
      emitMessageUpdate(messageId, chatId, "read", {
        userId: user._id,
        username: user.username,
      });

      res.json({
        success: true,
        message: "Message marked as read",
      });
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({
        success: false,
        message: "Failed to mark message as read",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/chats/:chatId/messages/:messageId/reactions
 * @desc    Add or update reaction to a message
 * @access  Private
 */
router.post(
  "/:chatId/messages/:messageId/reactions",
  authenticateJWT,
  requireAuth,
  [
    param("chatId").isMongoId().withMessage("Invalid chat ID"),
    param("messageId").isMongoId().withMessage("Invalid message ID"),
    body("emoji")
      .isLength({ min: 1, max: 10 })
      .withMessage("Emoji must be between 1 and 10 characters"),
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
      const { chatId, messageId } = req.params;
      const { emoji } = req.body;

      // Check if user is a member of this chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isMember(user._id)) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this chat",
        });
      }

      // Find and add reaction to message
      const message = await Message.findOne({
        _id: messageId,
        chatId,
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }

      await message.addReaction(user._id, user.username, emoji);

      // Emit socket event for reaction
      emitMessageUpdate(messageId, chatId, "reaction_added", {
        userId: user._id,
        username: user.username,
        emoji,
        reactions: message.getGroupedReactions(),
      });

      res.json({
        success: true,
        message: "Reaction added successfully",
        data: {
          reactions: message.getGroupedReactions(),
        },
      });
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add reaction",
        error: error.message,
      });
    }
  }
);

/**
 * @route   DELETE /api/chats/:chatId/messages/:messageId/reactions
 * @desc    Remove reaction from a message
 * @access  Private
 */
router.delete(
  "/:chatId/messages/:messageId/reactions",
  authenticateJWT,
  requireAuth,
  [
    param("chatId").isMongoId().withMessage("Invalid chat ID"),
    param("messageId").isMongoId().withMessage("Invalid message ID"),
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
      const { chatId, messageId } = req.params;

      // Check if user is a member of this chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isMember(user._id)) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this chat",
        });
      }

      // Find and remove reaction from message
      const message = await Message.findOne({
        _id: messageId,
        chatId,
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }

      await message.removeReaction(user._id);

      // Emit socket event for reaction removal
      emitMessageUpdate(messageId, chatId, "reaction_removed", {
        userId: user._id,
        username: user.username,
        reactions: message.getGroupedReactions(),
      });

      res.json({
        success: true,
        message: "Reaction removed successfully",
        data: {
          reactions: message.getGroupedReactions(),
        },
      });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({
        success: false,
        message: "Failed to remove reaction",
        error: error.message,
      });
    }
  }
);

module.exports = router;
