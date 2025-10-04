const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const jwt = require("jsonwebtoken");
const Story = require("../models/Story");
const User = require("../models/User");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const { body, validationResult, param, query } = require("express-validator");

// Helper function to get username from user object (prefer short username)
const getUsernameFromUser = (user) => {
  // Priority: profile.username > profile.firstName > email prefix > first word of displayName > "user"
  if (user.profile?.username) return user.profile.username;
  if (user.profile?.firstName) return user.profile.firstName;
  if (user.email) return user.email.split("@")[0];
  if (user.displayName) {
    // Get first name from display name (e.g., "John Doe" -> "John")
    return user.displayName.split(" ")[0];
  }
  return "user";
};

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

// Validation middleware (flexible for both JSON and multipart)
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
    .custom((value) => {
      // Allow both arrays and JSON strings (for multipart)
      if (Array.isArray(value)) return true;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed);
        } catch (e) {
          return false;
        }
      }
      return false;
    })
    .withMessage("Mentions must be an array"),
  body("hashtags")
    .optional()
    .custom((value) => {
      // Allow both arrays and JSON strings (for multipart)
      if (Array.isArray(value)) return true;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed);
        } catch (e) {
          return false;
        }
      }
      return false;
    })
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
 * @route   GET /api/stories/public
 * @desc    Get public stories feed (no authentication required)
 * @access  Public
 */
router.get(
  "/public",
  [
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("offset").optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      console.log(
        "📖 Public stories endpoint called with limit:",
        limit,
        "offset:",
        offset
      );

      // Check if there are any stories at all
      const totalStories = await Story.countDocuments();
      console.log("📖 Total stories in database:", totalStories);

      const publicStories = await Story.countDocuments({ privacy: "public" });
      console.log("📖 Public stories in database:", publicStories);

      const activePublicStories = await Story.countDocuments({
        isActive: true,
        expiresAt: { $gt: new Date() },
        privacy: "public",
      });
      console.log("📖 Active public stories:", activePublicStories);

      // Get public stories only - Populate user details like posts do
      const storyGroups = await Story.aggregate([
        {
          $match: {
            isActive: true,
            expiresAt: { $gt: new Date() },
            privacy: "public", // Only public stories
          },
        },
        {
          $group: {
            _id: "$userId",
            stories: { $push: "$$ROOT" },
            lastStoryTime: { $max: "$createdAt" },
            hasUnviewedStories: { $first: true },
          },
        },
        // Lookup user details
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Add formatted username and avatar (EXACT same as posts)
        {
          $addFields: {
            username: {
              $cond: [
                { $ne: ["$userDetails.profile.username", null] },
                "$userDetails.profile.username",
                {
                  $cond: [
                    { $ne: ["$userDetails.displayName", null] },
                    "$userDetails.displayName",
                    {
                      $trim: {
                        input: {
                          $concat: [
                            { $ifNull: ["$userDetails.profile.firstName", ""] },
                            " ",
                            { $ifNull: ["$userDetails.profile.lastName", ""] },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
            userAvatar: "$userDetails.photoURL",
          },
        },
        // Remove userDetails to clean up response
        {
          $project: {
            userDetails: 0,
          },
        },
        {
          $sort: { lastStoryTime: -1 },
        },
        {
          $skip: offset,
        },
        {
          $limit: limit,
        },
      ]);

      console.log(
        "📖 Aggregation completed, story groups found:",
        storyGroups.length
      );

      res.json({
        success: true,
        message: "Public stories feed retrieved successfully",
        data: {
          feed: storyGroups,
          hasMore: storyGroups.length === limit,
        },
      });
    } catch (error) {
      console.error("Error fetching public stories feed:", error);
      console.error("Error stack:", error.stack);

      // Return empty feed instead of error for better UX
      res.json({
        success: true,
        message: "Public stories feed retrieved successfully",
        data: {
          feed: [],
          hasMore: false,
        },
      });
    }
  }
);

/**
 * @route   GET /api/stories/feed
 * @desc    Get stories feed for user (MUST come before /:storyId)
 * @access  Private
 */
router.get(
  "/feed",
  authenticateJWT,
  requireAuth,
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

      // Build filter for stories (EXCLUDE current user's stories - they see it in "Your Story" button)
      const filter = {
        isActive: true,
        expiresAt: { $gt: new Date() },
        $or: [
          // Public stories from anyone (including current user)
          { privacy: "public" },
          // Friends stories
          {
            privacy: "friends",
            userId: { $in: friends },
          },
          // Close friends stories
          {
            privacy: "closeFriends",
            userId: { $in: closeFriends },
          },
          // Custom privacy where user is in customViewers
          {
            privacy: "custom",
            customViewers: req.user._id,
          },
        ],
      };

      // Aggregate stories by user - Populate user details like posts do
      const storyGroups = await Story.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$userId",
            stories: { $push: "$$ROOT" },
            lastStoryTime: { $max: "$createdAt" },
            hasUnviewedStories: {
              $first: {
                $cond: {
                  if: {
                    $not: {
                      $in: [req.user._id, { $ifNull: ["$viewedBy", []] }],
                    },
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
        },
        // Lookup user details
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Add formatted username and avatar (EXACT same as posts)
        {
          $addFields: {
            username: {
              $cond: [
                { $ne: ["$userDetails.profile.username", null] },
                "$userDetails.profile.username",
                {
                  $cond: [
                    { $ne: ["$userDetails.displayName", null] },
                    "$userDetails.displayName",
                    {
                      $trim: {
                        input: {
                          $concat: [
                            { $ifNull: ["$userDetails.profile.firstName", ""] },
                            " ",
                            { $ifNull: ["$userDetails.profile.lastName", ""] },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
            userAvatar: "$userDetails.photoURL",
          },
        },
        // Remove userDetails to clean up response
        {
          $project: {
            userDetails: 0,
          },
        },
        { $sort: { hasUnviewedStories: -1, lastStoryTime: -1 } },
        { $skip: offset },
        { $limit: limit },
      ]);

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
 * @route   GET /api/stories/:storyId
 * @desc    Get a single story by ID
 * @access  Public (for public stories) / Private (for private stories)
 */
router.get("/:storyId", async (req, res) => {
  try {
    const { storyId } = req.params;
    console.log(`📖 Fetching story: ${storyId}`);

    // Find the story
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    // Check if story is expired
    if (!story.isActive || story.expiresAt <= new Date()) {
      return res.status(404).json({
        success: false,
        message: "Story not found or has expired",
      });
    }

    // For public stories, allow guest access
    if (story.privacy === "public") {
      return res.json({
        success: true,
        message: "Story retrieved successfully",
        data: story,
      });
    }

    // For private stories, require authentication
    // Try to get user from JWT token (optional for this route)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user) {
          userId = user._id;
        }
      } catch (error) {
        // Invalid token, treat as guest
        console.log("📖 Invalid token for story access, treating as guest");
      }
    }

    // If no valid user and story is not public, deny access
    if (!userId) {
      return res.status(403).json({
        success: false,
        message: "Authentication required to view this story",
      });
    }

    // Check if user can view this private story
    // For now, allow if user is the owner or if it's friends/close friends
    // TODO: Implement proper privacy checks based on relationships
    if (story.userId.toString() === userId.toString()) {
      // User can view their own story
      return res.json({
        success: true,
        message: "Story retrieved successfully",
        data: story,
      });
    }

    // For friends/close friends stories, we'd need to check relationships
    // For now, deny access to other users' private stories
    return res.status(403).json({
      success: false,
      message: "You don't have permission to view this story",
    });
  } catch (error) {
    console.error("Error fetching story:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch story",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/stories
 * @desc    Create a new story
 * @access  Private
 */
router.post("/", authenticateJWT, requireAuth, async (req, res) => {
  // Handle file upload for media stories ONLY
  const handleMediaUpload = () => {
    return new Promise((resolve, reject) => {
      upload.single("media")(req, res, (err) => {
        if (err) {
          console.error("📖 Multer error:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  try {
    console.log("📖 Story Creation Request:");
    console.log("  - Content-Type:", req.headers["content-type"]);
    console.log("  - Raw body keys:", Object.keys(req.body));
    console.log("  - Body:", JSON.stringify(req.body, null, 2));
    console.log("  - Media Type:", req.body.mediaType);
    console.log(
      "  - Is multipart?:",
      req.headers["content-type"]?.includes("multipart")
    );

    // For multipart requests, we need to run multer FIRST to parse the body
    if (req.headers["content-type"]?.includes("multipart")) {
      console.log("📖 Detected multipart request - running multer first");
      try {
        await handleMediaUpload();
        console.log(
          "📖 After multer - Body:",
          JSON.stringify(req.body, null, 2)
        );
        console.log(
          "📖 After multer - File:",
          req.file ? "Present" : "Missing"
        );
      } catch (uploadError) {
        console.error("📖 Multer upload error:", uploadError);
        return res.status(400).json({
          success: false,
          message: "File upload failed",
          error: uploadError.message,
        });
      }
    }

    // Parse body fields (handle both JSON and multipart string values)
    const parseField = (field) => {
      if (typeof field === "string") {
        try {
          return JSON.parse(field);
        } catch (e) {
          return field;
        }
      }
      return field;
    };

    const {
      mediaType,
      textContent,
      textStyle,
      caption,
      privacy = "public",
    } = req.body;

    // Validate mediaType
    if (
      !mediaType ||
      !["text", "image", "video", "audio"].includes(mediaType)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or missing media type. Must be text, image, video, or audio",
      });
    }

    // Parse boolean fields (multipart sends as strings)
    const allowReplies = req.body.allowReplies === "false" ? false : true;
    const allowReactions = req.body.allowReactions === "false" ? false : true;
    const allowScreenshot = req.body.allowScreenshot === "false" ? false : true;

    const mentions = parseField(req.body.mentions) || [];
    const hashtags = parseField(req.body.hashtags) || [];
    const customViewers = parseField(req.body.customViewers) || [];
    const metadata = parseField(req.body.metadata) || {};

    // Validate and handle based on media type
    if (mediaType === "text") {
      // TEXT STORY - No file upload needed
      if (!textContent) {
        return res.status(400).json({
          success: false,
          message: "Text content is required for text stories",
        });
      }
      console.log("📖 Creating TEXT story (no file upload)");
    } else {
      // MEDIA STORY (image/video/audio) - File should already be uploaded by multer
      console.log(`📖 Creating ${mediaType.toUpperCase()} story`);

      // Verify file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: `Media file is required for ${mediaType} stories`,
        });
      }

      console.log("📖 File uploaded successfully:", req.file.filename);
    }

    // Get user information (req.user is already the database user from requireAuth)
    const user = req.user;
    console.log("📖 Story Creation Debug:");
    console.log("  - User ID:", user._id);
    console.log("  - Username (profile):", user.profile?.username);
    console.log("  - Display Name:", user.displayName);
    console.log("  - Email:", user.email);
    console.log("  - PhotoURL:", user.photoURL);
    console.log("  - ProfileImageUrl:", user.profileImageUrl);
    console.log("  - Profile:", user.profile);
    console.log("  - Media Type:", mediaType);
    console.log("  - Text Content:", textContent);
    console.log("  - Text Style:", textStyle);

    // Prepare story data
    const userAvatar =
      user.photoURL ||
      user.profile?.profilePicture ||
      user.profileImageUrl ||
      null;
    console.log("  - Final userAvatar:", userAvatar);

    const storyData = {
      userId: user._id,
      username: getUsernameFromUser(user),
      userAvatar: userAvatar,
      mediaType,
      textContent: mediaType === "text" ? textContent : undefined,
      textStyle:
        mediaType === "text" && textStyle
          ? typeof textStyle === "string"
            ? JSON.parse(textStyle)
            : textStyle
          : undefined,
      caption,
      mentions: mentions.map((m) => (m.startsWith("@") ? m : `@${m}`)),
      hashtags: hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)),
      privacy,
      customViewers: privacy === "custom" ? customViewers : [],
      allowReplies: Boolean(allowReplies),
      allowReactions: Boolean(allowReactions),
      allowScreenshot: Boolean(allowScreenshot),
      metadata: typeof metadata === "string" ? JSON.parse(metadata) : metadata,
    };

    // Handle media file - Upload to Cloudinary
    if (req.file) {
      try {
        const {
          uploadImage,
          uploadVideo,
          uploadAudio,
          generateVideoThumbnail,
        } = require("../config/cloudinary");
        const fs = require("fs");

        let cloudinaryResult;

        if (mediaType === "image") {
          console.log("📖 Uploading image to Cloudinary:", req.file.path);
          cloudinaryResult = await uploadImage(req.file.path, {
            folder: `stories/${user._id}`,
          });
          storyData.mediaUrl = cloudinaryResult.url;
        } else if (mediaType === "video") {
          console.log("📖 Uploading video to Cloudinary:", req.file.path);
          cloudinaryResult = await uploadVideo(req.file.path, {
            folder: `stories/${user._id}`,
          });
          storyData.mediaUrl = cloudinaryResult.url;
          storyData.thumbnailUrl = generateVideoThumbnail(
            cloudinaryResult.publicId
          );
          storyData.duration = cloudinaryResult.duration * 1000; // Convert to ms
        } else if (mediaType === "audio") {
          console.log("📖 Uploading audio to Cloudinary:", req.file.path);
          cloudinaryResult = await uploadAudio(req.file.path, {
            folder: `stories/${user._id}`,
          });
          storyData.mediaUrl = cloudinaryResult.url;
          storyData.duration = cloudinaryResult.duration * 1000; // Convert to ms
        }

        // Delete temporary file
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error("📖 Error deleting temp file:", unlinkError);
        }

        console.log("📖 Cloudinary upload successful:", storyData.mediaUrl);
      } catch (cloudinaryError) {
        console.error("📖 Cloudinary upload error:", cloudinaryError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload media to cloud storage",
          error: cloudinaryError.message,
        });
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
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * @route   GET /api/stories/user/:userId
 * @desc    Get stories for a specific user
 * @access  Private
 */
router.get(
  "/user/:userId",
  authenticateJWT,
  requireAuth,
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
router.get("/my-stories", authenticateJWT, requireAuth, async (req, res) => {
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
  authenticateJWT,
  requireAuth,
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
      await story.addViewer(
        user._id,
        getUsernameFromUser(user),
        user.profileImageUrl
      );

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
  authenticateJWT,
  requireAuth,
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
        getUsernameFromUser(user),
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
  authenticateJWT,
  requireAuth,
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
  authenticateJWT,
  requireAuth,
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
  authenticateJWT,
  requireAuth,
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
      console.log("📖 Delete Story Debug:");
      console.log("  - Story userId:", story.userId.toString());
      console.log("  - Request user _id:", req.user._id.toString());
      console.log(
        "  - Match:",
        story.userId.toString() === req.user._id.toString()
      );

      if (story.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own stories",
        });
      }

      // Delete media from Cloudinary if exists
      if (story.mediaUrl && story.mediaUrl.includes("cloudinary.com")) {
        try {
          const { deleteFile } = require("../config/cloudinary");

          // Extract public_id from Cloudinary URL
          const urlParts = story.mediaUrl.split("/");
          const publicIdWithExtension = urlParts.slice(-2).join("/"); // Get folder/filename
          const publicId = publicIdWithExtension.split(".")[0]; // Remove extension

          // Determine resource type
          let resourceType = "image";
          if (story.mediaType === "video") resourceType = "video";
          if (story.mediaType === "audio") resourceType = "video"; // Cloudinary uses 'video' for audio

          console.log(
            `📖 Deleting ${resourceType} from Cloudinary: ${publicId}`
          );
          await deleteFile(publicId, resourceType);
          console.log("📖 Cloudinary file deleted successfully");
        } catch (cloudinaryError) {
          console.error("📖 Cloudinary deletion error:", cloudinaryError);
          // Continue anyway - soft delete the record even if Cloudinary fails
        }
      }

      // Soft delete by setting isActive to false
      story.isActive = false;
      await story.save();

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
  authenticateJWT,
  requireAuth,
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
