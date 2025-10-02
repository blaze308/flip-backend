const rateLimit = require("express-rate-limit");
const { validateChatFileType } = require("../config/cloudinary");

/**
 * Chat-specific middleware for validation and rate limiting
 */

// Rate limiter for sending messages
const messageSendLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute per user
  message: {
    success: false,
    message: "Too many messages sent. Please slow down.",
    error: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for system messages
    return req.body.type === "system";
  },
});

// Rate limiter for creating chats
const chatCreationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 new chats per 5 minutes per user
  message: {
    success: false,
    message: "Too many chats created. Please wait before creating more.",
    error: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip;
  },
});

// Rate limiter for file uploads in chat
const chatFileUploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 file uploads per minute per user
  message: {
    success: false,
    message: "Too many file uploads. Please wait before uploading more files.",
    error: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req) => {
    // Skip if no file is being uploaded
    return !req.file;
  },
});

// Middleware to validate message content
const validateMessageContent = (req, res, next) => {
  const { type, content, location, contact } = req.body;

  try {
    // Validate based on message type
    switch (type) {
      case "text":
        if (!content || content.trim().length === 0) {
          return res.status(400).json({
            success: false,
            message: "Text messages must have content",
            error: "INVALID_MESSAGE_CONTENT",
          });
        }
        if (content.length > 4000) {
          return res.status(400).json({
            success: false,
            message: "Message content cannot exceed 4000 characters",
            error: "CONTENT_TOO_LONG",
          });
        }
        break;

      case "image":
      case "video":
      case "audio":
      case "lottie":
      case "svga":
      case "file":
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: `${type} messages must include a file`,
            error: "MISSING_FILE",
          });
        }

        // Validate file type
        if (!validateChatFileType(req.file.mimetype, type)) {
          return res.status(400).json({
            success: false,
            message: `Invalid file type for ${type} message`,
            error: "INVALID_FILE_TYPE",
            details: {
              provided: req.file.mimetype,
              expected: type,
            },
          });
        }

        // Validate file size based on type
        const maxSizes = {
          image: 10 * 1024 * 1024, // 10MB
          video: 100 * 1024 * 1024, // 100MB
          audio: 25 * 1024 * 1024, // 25MB
          lottie: 5 * 1024 * 1024, // 5MB
          svga: 10 * 1024 * 1024, // 10MB
          file: 50 * 1024 * 1024, // 50MB
        };

        if (req.file.size > maxSizes[type]) {
          return res.status(400).json({
            success: false,
            message: `File size exceeds limit for ${type} messages`,
            error: "FILE_TOO_LARGE",
            details: {
              size: req.file.size,
              maxSize: maxSizes[type],
            },
          });
        }
        break;

      case "location":
        if (!location || !location.latitude || !location.longitude) {
          return res.status(400).json({
            success: false,
            message: "Location messages must include latitude and longitude",
            error: "INVALID_LOCATION_DATA",
          });
        }

        // Validate coordinate ranges
        if (
          location.latitude < -90 ||
          location.latitude > 90 ||
          location.longitude < -180 ||
          location.longitude > 180
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid coordinates provided",
            error: "INVALID_COORDINATES",
          });
        }
        break;

      case "contact":
        if (!contact || !contact.name) {
          return res.status(400).json({
            success: false,
            message: "Contact messages must include a name",
            error: "INVALID_CONTACT_DATA",
          });
        }

        // Validate contact data
        if (contact.name.length > 100) {
          return res.status(400).json({
            success: false,
            message: "Contact name cannot exceed 100 characters",
            error: "CONTACT_NAME_TOO_LONG",
          });
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid message type",
          error: "INVALID_MESSAGE_TYPE",
        });
    }

    next();
  } catch (error) {
    console.error("Message validation error:", error);
    res.status(500).json({
      success: false,
      message: "Message validation failed",
      error: error.message,
    });
  }
};

// Middleware to validate chat creation data
const validateChatCreation = (req, res, next) => {
  const { type, name, participants } = req.body;

  try {
    // Validate chat type
    if (!["direct", "group"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Chat type must be either 'direct' or 'group'",
        error: "INVALID_CHAT_TYPE",
      });
    }

    // Validate participants
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Participants must be a non-empty array",
        error: "INVALID_PARTICIPANTS",
      });
    }

    // Validate participant count based on chat type
    if (type === "direct" && participants.length !== 1) {
      return res.status(400).json({
        success: false,
        message: "Direct chats must have exactly 1 other participant",
        error: "INVALID_PARTICIPANT_COUNT",
      });
    }

    if (type === "group") {
      if (participants.length < 1) {
        return res.status(400).json({
          success: false,
          message: "Group chats must have at least 1 other participant",
          error: "INVALID_PARTICIPANT_COUNT",
        });
      }

      if (participants.length > 256) {
        return res.status(400).json({
          success: false,
          message: "Group chats cannot have more than 256 participants",
          error: "TOO_MANY_PARTICIPANTS",
        });
      }

      // Validate group name
      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Group chats must have a name",
          error: "MISSING_GROUP_NAME",
        });
      }

      if (name.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Group name cannot exceed 100 characters",
          error: "GROUP_NAME_TOO_LONG",
        });
      }
    }

    // Check for duplicate participants
    const uniqueParticipants = [...new Set(participants)];
    if (uniqueParticipants.length !== participants.length) {
      return res.status(400).json({
        success: false,
        message: "Duplicate participants are not allowed",
        error: "DUPLICATE_PARTICIPANTS",
      });
    }

    // Check if user is trying to add themselves
    const userId = req.user._id.toString();
    if (participants.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot add yourself as a participant",
        error: "SELF_PARTICIPANT",
      });
    }

    next();
  } catch (error) {
    console.error("Chat creation validation error:", error);
    res.status(500).json({
      success: false,
      message: "Chat creation validation failed",
      error: error.message,
    });
  }
};

// Middleware to sanitize message content
const sanitizeMessageContent = (req, res, next) => {
  try {
    const { content } = req.body;

    if (content && typeof content === "string") {
      // Basic sanitization - remove potentially harmful content
      let sanitized = content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "") // Remove iframe tags
        .replace(/javascript:/gi, "") // Remove javascript: URLs
        .replace(/on\w+\s*=/gi, "") // Remove event handlers
        .trim();

      // Limit consecutive whitespace
      sanitized = sanitized.replace(/\s+/g, " ");

      req.body.content = sanitized;
    }

    next();
  } catch (error) {
    console.error("Message sanitization error:", error);
    res.status(500).json({
      success: false,
      message: "Message sanitization failed",
      error: error.message,
    });
  }
};

// Middleware to log chat activities
const logChatActivity = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();

    // Log the activity
    console.log(`💬 Chat Activity: ${action}`, {
      userId: req.user?._id,
      username: req.user?.username,
      chatId: req.params.chatId,
      messageId: req.params.messageId,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Log response time after request completes
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - startTime;
      console.log(`💬 Chat Activity Completed: ${action} (${duration}ms)`);
      originalSend.call(this, data);
    };

    next();
  };
};

// Middleware to check if user can access chat
const checkChatAccess = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    // This will be implemented in the route handlers
    // since we need to import Chat model there to avoid circular dependencies
    next();
  } catch (error) {
    console.error("Chat access check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check chat access",
      error: error.message,
    });
  }
};

module.exports = {
  messageSendLimiter,
  chatCreationLimiter,
  chatFileUploadLimiter,
  validateMessageContent,
  validateChatCreation,
  sanitizeMessageContent,
  logChatActivity,
  checkChatAccess,
};
