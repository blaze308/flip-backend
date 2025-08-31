const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const Story = require("../models/Story");
const User = require("../models/User");
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const { body, validationResult, param, query } = require("express-validator");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/stories");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `story-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|mp3|wav|m4a/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only images, videos, and audio files are allowed."
        )
      );
    }
  },
});

// Validation middleware
const validateStoryCreation = [
  body("mediaType")
    .isIn(["text", "image", "video", "audio"])
    .withMessage("Invalid media type"),
  body("textContent")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Text content must be 500 characters or less"),
  body("caption")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Caption must be 200 characters or less"),
  body("privacy")
    .optional()
    .isIn(["public", "friends", "closeFriends", "custom"])
    .withMessage("Invalid privacy setting"),
  body("mentions")
    .optional()
    .isArray()
    .withMessage("Mentions must be an array"),
  body("hashtags")
    .optional()
    .isArray()
    .withMessage("Hashtags must be an array"),
];

const validateReaction = [
  body("reactionType")
    .isIn(["like", "love", "haha", "wow", "sad", "angry", "fire", "clap"])
    .withMessage("Invalid reaction type"),
];

// Helper function to get user's friends and close friends
async function getUserRelationships(userId) {
  try {
    const user = await User.findById(userId).populate("friends closeFriends");
    return {
      friends: user.friends?.map((f) => f._id.toString()) || [],
      closeFriends: user.closeFriends?.map((f) => f._id.toString()) || [],
    };
  } catch (error) {
    return { friends: [], closeFriends: [] };
  }
}

// Routes

/**
 * @route   POST /api/stories
 * @desc    Create a new story
 * @access  Private
 */
router.post(
  "/",
  authenticateToken,
  requireSyncedUser,
  upload.single("media"),
  validateStoryCreation,
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

      const {
        mediaType,
        textContent,
        textStyle,
        caption,
        mentions = [],
        hashtags = [],
        privacy = "public",
        customViewers = [],
        allowReplies = true,
        allowReactions = true,
        allowScreenshot = true,
        metadata = {},
      } = req.body;

      // Validate required fields based on media type
      if (mediaType === "text" && !textContent) {
        return res.status(400).json({
          success: false,
          message: "Text content is required for text stories",
        });
      }

      if (mediaType !== "text" && !req.file) {
        return res.status(400).json({
          success: false,
          message: "Media file is required for non-text stories",
        });
      }

      // Get user information (req.user is already the database user from requireSyncedUser)
      const user = req.user;

      // Prepare story data
      const storyData = {
        userId: user._id,
        username: user.username,
        userAvatar: user.profileImageUrl,
        mediaType,
        textContent: mediaType === "text" ? textContent : undefined,
        textStyle:
          mediaType === "text" && textStyle ? JSON.parse(textStyle) : undefined,
        caption,
        mentions: mentions.map((m) => (m.startsWith("@") ? m : `@${m}`)),
        hashtags: hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)),
        privacy,
        customViewers: privacy === "custom" ? customViewers : [],
        allowReplies: Boolean(allowReplies),
        allowReactions: Boolean(allowReactions),
        allowScreenshot: Boolean(allowScreenshot),
        metadata:
          typeof metadata === "string" ? JSON.parse(metadata) : metadata,
      };

      // Handle media file
      if (req.file) {
        // In production, upload to cloud storage (AWS S3, Google Cloud, etc.)
        storyData.mediaUrl = `/uploads/stories/${req.file.filename}`;

        // For videos, you might want to generate thumbnails
        if (mediaType === "video") {
          // TODO: Generate video thumbnail
          storyData.thumbnailUrl = `/uploads/thumbnails/${req.file.filename}.jpg`;
        }

        // For audio/video, you might want to extract duration
        if (mediaType === "video" || mediaType === "audio") {
          // TODO: Extract media duration using ffmpeg or similar
          storyData.duration = 30000; // Mock 30 seconds
        }
      }

      // Create story
      const story = new Story(storyData);
      await story.save();

      res.status(201).json({
        success: true,
        message: "Story created successfully",
        data: story,
      });
    } catch (error) {
      console.error("Error creating story:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create story",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/stories/feed
 * @desc    Get stories feed for user
 * @access  Private
 */
router.get(
  "/feed",
  authenticateToken,
  requireSyncedUser,
  [
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("offset").optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      // Get user's relationships
      const { friends, closeFriends } = await getUserRelationships(
        req.user._id
      );
      const followingIds = []; // TODO: Get following list from user relationships

      // Get stories feed
      const storyGroups = await Story.getStoriesFeed(
        req.user._id,
        followingIds,
        friends
      );

      res.json({
        success: true,
        message: "Stories feed retrieved successfully",
        data: {
          feed: storyGroups,
          hasMore: storyGroups.length === limit,
        },
      });
    } catch (error) {
      console.error("Error fetching stories feed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch stories feed",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/stories/user/:userId
 * @desc    Get stories for a specific user
 * @access  Private
 */
router.get(
  "/user/:userId",
  authenticateToken,
  requireSyncedUser,
  [param("userId").isMongoId().withMessage("Invalid user ID")],
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

      const { userId } = req.params;

      // Get user's relationships for privacy checking
      const { friends, closeFriends } = await getUserRelationships(
        req.user._id
      );

      // Get user's stories
      const stories = await Story.getActiveStoriesForUser(userId);

      // Filter stories based on privacy settings
      const visibleStories = stories.filter((story) =>
        story.canBeViewedBy(req.user._id, friends, closeFriends)
      );

      res.json({
        success: true,
        message: "User stories retrieved successfully",
        data: {
          stories: visibleStories,
        },
      });
    } catch (error) {
      console.error("Error fetching user stories:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user stories",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/stories/my-stories
 * @desc    Get current user's stories
 * @access  Private
 */
router.get("/my-stories", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const stories = await Story.find({
      userId: req.user._id,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "My stories retrieved successfully",
      data: {
        stories,
      },
    });
  } catch (error) {
    console.error("Error fetching my stories:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch my stories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/stories/:storyId/view
 * @desc    Mark story as viewed
 * @access  Private
 */
router.post(
  "/:storyId/view",
  authenticateToken,
  requireSyncedUser,
  [param("storyId").isMongoId().withMessage("Invalid story ID")],
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

      const { storyId } = req.params;

      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      // Check if user can view this story
      const { friends, closeFriends } = await getUserRelationships(
        req.user._id
      );
      if (!story.canBeViewedBy(req.user._id, friends, closeFriends)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to view this story",
        });
      }

      // Get user info (req.user is already the database user)
      const user = req.user;

      // Add viewer
      await story.addViewer(user._id, user.username, user.profileImageUrl);

      res.json({
        success: true,
        message: "Story marked as viewed",
      });
    } catch (error) {
      console.error("Error viewing story:", error);
      res.status(500).json({
        success: false,
        message: "Failed to mark story as viewed",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   POST /api/stories/:storyId/react
 * @desc    Add reaction to story
 * @access  Private
 */
router.post(
  "/:storyId/react",
  authenticateToken,
  requireSyncedUser,
  [
    param("storyId").isMongoId().withMessage("Invalid story ID"),
    ...validateReaction,
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

      const { storyId } = req.params;
      const { reactionType } = req.body;

      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      // Check if reactions are allowed
      if (!story.allowReactions) {
        return res.status(403).json({
          success: false,
          message: "Reactions are not allowed on this story",
        });
      }

      // Check if user can view this story
      const { friends, closeFriends } = await getUserRelationships(
        req.user._id
      );
      if (!story.canBeViewedBy(req.user._id, friends, closeFriends)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to react to this story",
        });
      }

      // Get user info (req.user is already the database user)
      const user = req.user;

      // Add reaction
      await story.addReaction(
        user._id,
        user.username,
        reactionType,
        user.profileImageUrl
      );

      res.json({
        success: true,
        message: "Reaction added successfully",
      });
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add reaction",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   DELETE /api/stories/:storyId/react
 * @desc    Remove reaction from story
 * @access  Private
 */
router.delete(
  "/:storyId/react",
  authenticateToken,
  requireSyncedUser,
  [param("storyId").isMongoId().withMessage("Invalid story ID")],
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

      const { storyId } = req.params;

      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      // Remove reaction
      await story.removeReaction(req.user._id);

      res.json({
        success: true,
        message: "Reaction removed successfully",
      });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({
        success: false,
        message: "Failed to remove reaction",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/stories/:storyId/viewers
 * @desc    Get story viewers
 * @access  Private
 */
router.get(
  "/:storyId/viewers",
  authenticateToken,
  requireSyncedUser,
  [param("storyId").isMongoId().withMessage("Invalid story ID")],
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

      const { storyId } = req.params;

      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      // Check if user owns this story
      if (story.userId.toString() !== req.user._id) {
        return res.status(403).json({
          success: false,
          message: "You can only view viewers of your own stories",
        });
      }

      res.json({
        success: true,
        message: "Story viewers retrieved successfully",
        data: {
          viewers: story.viewers,
        },
      });
    } catch (error) {
      console.error("Error fetching story viewers:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch story viewers",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   DELETE /api/stories/:storyId
 * @desc    Delete a story
 * @access  Private
 */
router.delete(
  "/:storyId",
  authenticateToken,
  requireSyncedUser,
  [param("storyId").isMongoId().withMessage("Invalid story ID")],
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

      const { storyId } = req.params;

      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      // Check if user owns this story
      if (story.userId.toString() !== req.user._id) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own stories",
        });
      }

      // Soft delete by setting isActive to false
      story.isActive = false;
      await story.save();

      // TODO: Delete media files from storage

      res.json({
        success: true,
        message: "Story deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete story",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/stories/analytics
 * @desc    Get story analytics for current user
 * @access  Private
 */
router.get(
  "/analytics",
  authenticateToken,
  requireSyncedUser,
  [
    query("startDate").optional().isISO8601().toDate(),
    query("endDate").optional().isISO8601().toDate(),
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

      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
      } = req.query;

      const analytics = await Story.getStoryAnalytics(
        req.user._id,
        startDate,
        endDate
      );

      res.json({
        success: true,
        message: "Story analytics retrieved successfully",
        data: analytics[0] || {
          totalStories: 0,
          totalViews: 0,
          totalReactions: 0,
          avgViewsPerStory: 0,
          avgReactionsPerStory: 0,
          mediaTypeBreakdown: [],
        },
      });
    } catch (error) {
      console.error("Error fetching story analytics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch story analytics",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Cleanup expired stories (run periodically)
router.post("/cleanup", async (req, res) => {
  try {
    const result = await Story.cleanupExpiredStories();

    res.json({
      success: true,
      message: "Expired stories cleaned up successfully",
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error cleaning up expired stories:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup expired stories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
