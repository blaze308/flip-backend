const express = require("express");
const { body, validationResult, query } = require("express-validator");
const Post = require("../models/Post");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /posts/feed
 *
 * Get posts for user's feed (public posts, ordered by creation date)
 */
router.get(
  "/feed",
  authenticateToken,
  requireSyncedUser,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("type")
      .optional()
      .isIn(["text", "image", "video"])
      .withMessage("Invalid post type"),
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
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;
      const skip = (page - 1) * limit;

      // Build query
      let query = Post.findPublic();

      if (type) {
        query = query.where("type", type);
      }

      const posts = await query
        .populate(
          "userId",
          "displayName photoURL profile.firstName profile.lastName"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Add user interaction data
      const postsWithInteractions = posts.map((post) => ({
        ...post,
        isLiked: post.likedBy.includes(user._id),
        username:
          post.userId?.displayName ||
          `${post.userId?.profile?.firstName || ""} ${
            post.userId?.profile?.lastName || ""
          }`.trim() ||
          "Unknown User",
        userAvatar: post.userId?.photoURL,
      }));

      res.json({
        success: true,
        message: "Feed retrieved successfully",
        data: {
          posts: postsWithInteractions,
          pagination: {
            page,
            limit,
            hasMore: posts.length === limit,
          },
        },
      });
    } catch (error) {
      console.error("Get feed error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve feed",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /posts/user/:userId
 *
 * Get posts by a specific user
 */
router.get(
  "/user/:userId",
  authenticateToken,
  requireSyncedUser,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
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

      const { userId } = req.params;
      const { user } = req;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Check if user exists
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get posts (show all posts if it's the user's own profile, otherwise only public)
      let query =
        userId === user._id.toString()
          ? Post.findByUser(userId)
          : Post.find({
              userId,
              isActive: true,
              isPublic: true,
              deletedAt: null,
              moderationStatus: "approved",
            });

      const posts = await query
        .populate(
          "userId",
          "displayName photoURL profile.firstName profile.lastName"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Add user interaction data
      const postsWithInteractions = posts.map((post) => ({
        ...post,
        isLiked: post.likedBy.includes(user._id),
        username:
          post.userId?.displayName ||
          `${post.userId?.profile?.firstName || ""} ${
            post.userId?.profile?.lastName || ""
          }`.trim() ||
          "Unknown User",
        userAvatar: post.userId?.photoURL,
      }));

      res.json({
        success: true,
        message: "User posts retrieved successfully",
        data: {
          posts: postsWithInteractions,
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
            photoURL: targetUser.photoURL,
          },
          pagination: {
            page,
            limit,
            hasMore: posts.length === limit,
          },
        },
      });
    } catch (error) {
      console.error("Get user posts error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve user posts",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /posts
 *
 * Create a new post
 */
router.post(
  "/",
  authenticateToken,
  requireSyncedUser,
  [
    body("type")
      .isIn(["text", "image", "video"])
      .withMessage("Invalid post type"),
    body("content")
      .optional()
      .isLength({ max: 2000 })
      .withMessage("Content cannot exceed 2000 characters"),
    body("imageUrls")
      .optional()
      .isArray()
      .withMessage("Image URLs must be an array"),
    body("imageUrls.*").optional().isURL().withMessage("Invalid image URL"),
    body("videoUrl").optional().isURL().withMessage("Invalid video URL"),
    body("videoThumbnail")
      .optional()
      .isURL()
      .withMessage("Invalid video thumbnail URL"),
    body("videoDuration")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Video duration must be a positive integer"),
    body("textStyle.backgroundColor")
      .optional()
      .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .withMessage("Invalid background color"),
    body("textStyle.textColor")
      .optional()
      .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .withMessage("Invalid text color"),
    body("textStyle.fontSize")
      .optional()
      .isInt({ min: 8, max: 72 })
      .withMessage("Font size must be between 8 and 72"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("tags.*")
      .optional()
      .isLength({ min: 1, max: 30 })
      .withMessage("Each tag must be between 1 and 30 characters"),
    body("location.name")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Location name cannot exceed 100 characters"),
    body("isPublic")
      .optional()
      .isBoolean()
      .withMessage("isPublic must be boolean"),
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

      const { user, firebaseUser } = req;
      const postData = req.body;

      // Create new post
      const post = new Post({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        type: postData.type,
        content: postData.content,
        imageUrls: postData.imageUrls,
        videoUrl: postData.videoUrl,
        videoThumbnail: postData.videoThumbnail,
        videoDuration: postData.videoDuration,
        textStyle: postData.textStyle,
        tags: postData.tags,
        location: postData.location,
        isPublic: postData.isPublic !== false, // Default to true
      });

      await post.save();

      // Populate user data
      await post.populate(
        "userId",
        "displayName photoURL profile.firstName profile.lastName"
      );

      // Log post creation
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "post_create",
        resource: "post",
        resourceId: post._id.toString(),
        success: true,
        details: {
          type: post.type,
          isPublic: post.isPublic,
          hasContent: !!post.content,
          hasImages: !!(post.imageUrls && post.imageUrls.length > 0),
          hasVideo: !!post.videoUrl,
          tagCount: post.tags ? post.tags.length : 0,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // Format response
      const responsePost = {
        ...post.toJSON(),
        isLiked: false,
        username:
          post.userId?.displayName ||
          `${post.userId?.profile?.firstName || ""} ${
            post.userId?.profile?.lastName || ""
          }`.trim() ||
          "Unknown User",
        userAvatar: post.userId?.photoURL,
      };

      res.status(201).json({
        success: true,
        message: "Post created successfully",
        data: {
          post: responsePost,
        },
      });
    } catch (error) {
      console.error("Create post error:", error);

      // Log failed post creation
      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.firebaseUser?.uid,
        action: "post_create",
        resource: "post",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: "Failed to create post",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /posts/:postId
 *
 * Get a specific post by ID
 */
router.get(
  "/:postId",
  authenticateToken,
  requireSyncedUser,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const { user } = req;

      const post = await Post.findOne({
        _id: postId,
        isActive: true,
        deletedAt: null,
      }).populate(
        "userId",
        "displayName photoURL profile.firstName profile.lastName"
      );

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Check if user can view this post
      if (
        !post.isPublic &&
        post.userId._id.toString() !== user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Increment view count
      await post.incrementViews();

      // Format response
      const responsePost = {
        ...post.toJSON(),
        isLiked: post.likedBy.includes(user._id),
        username:
          post.userId?.displayName ||
          `${post.userId?.profile?.firstName || ""} ${
            post.userId?.profile?.lastName || ""
          }`.trim() ||
          "Unknown User",
        userAvatar: post.userId?.photoURL,
      };

      res.json({
        success: true,
        message: "Post retrieved successfully",
        data: {
          post: responsePost,
        },
      });
    } catch (error) {
      console.error("Get post error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve post",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * PUT /posts/:postId
 *
 * Update a post (only by the owner)
 */
router.put(
  "/:postId",
  authenticateToken,
  requireSyncedUser,
  [
    body("content")
      .optional()
      .isLength({ max: 2000 })
      .withMessage("Content cannot exceed 2000 characters"),
    body("textStyle.backgroundColor")
      .optional()
      .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .withMessage("Invalid background color"),
    body("textStyle.textColor")
      .optional()
      .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .withMessage("Invalid text color"),
    body("textStyle.fontSize")
      .optional()
      .isInt({ min: 8, max: 72 })
      .withMessage("Font size must be between 8 and 72"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("tags.*")
      .optional()
      .isLength({ min: 1, max: 30 })
      .withMessage("Each tag must be between 1 and 30 characters"),
    body("location.name")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Location name cannot exceed 100 characters"),
    body("isPublic")
      .optional()
      .isBoolean()
      .withMessage("isPublic must be boolean"),
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

      const { postId } = req.params;
      const { user, firebaseUser } = req;
      const updateData = req.body;

      const post = await Post.findOne({
        _id: postId,
        userId: user._id,
        isActive: true,
        deletedAt: null,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found or access denied",
        });
      }

      // Update allowed fields
      const allowedFields = [
        "content",
        "textStyle",
        "tags",
        "location",
        "isPublic",
      ];
      const updatedFields = [];

      allowedFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          post[field] = updateData[field];
          updatedFields.push(field);
        }
      });

      await post.save();
      await post.populate(
        "userId",
        "displayName photoURL profile.firstName profile.lastName"
      );

      // Log post update
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "post_update",
        resource: "post",
        resourceId: post._id.toString(),
        success: true,
        details: {
          updatedFields,
          updateData,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // Format response
      const responsePost = {
        ...post.toJSON(),
        isLiked: post.likedBy.includes(user._id),
        username:
          post.userId?.displayName ||
          `${post.userId?.profile?.firstName || ""} ${
            post.userId?.profile?.lastName || ""
          }`.trim() ||
          "Unknown User",
        userAvatar: post.userId?.photoURL,
      };

      res.json({
        success: true,
        message: "Post updated successfully",
        data: {
          post: responsePost,
          updatedFields,
        },
      });
    } catch (error) {
      console.error("Update post error:", error);

      // Log failed post update
      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.firebaseUser?.uid,
        action: "post_update",
        resource: "post",
        resourceId: req.params.postId,
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: "Failed to update post",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * DELETE /posts/:postId
 *
 * Delete a post (only by the owner)
 */
router.delete(
  "/:postId",
  authenticateToken,
  requireSyncedUser,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const { user, firebaseUser } = req;

      const post = await Post.findOne({
        _id: postId,
        userId: user._id,
        isActive: true,
        deletedAt: null,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found or access denied",
        });
      }

      // Soft delete the post
      await post.softDelete();

      // Log post deletion
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "post_delete",
        resource: "post",
        resourceId: post._id.toString(),
        success: true,
        details: {
          type: post.type,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: "Post deleted successfully",
      });
    } catch (error) {
      console.error("Delete post error:", error);

      // Log failed post deletion
      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.firebaseUser?.uid,
        action: "post_delete",
        resource: "post",
        resourceId: req.params.postId,
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: "Failed to delete post",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /posts/:postId/like
 *
 * Like or unlike a post
 */
router.post(
  "/:postId/like",
  authenticateToken,
  requireSyncedUser,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const { user } = req;

      const post = await Post.findOne({
        _id: postId,
        isActive: true,
        deletedAt: null,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      const isLiked = post.likedBy.includes(user._id);

      if (isLiked) {
        await post.unlike(user._id);
      } else {
        await post.like(user._id);
      }

      res.json({
        success: true,
        message: isLiked ? "Post unliked" : "Post liked",
        data: {
          isLiked: !isLiked,
          likes: post.likes,
        },
      });
    } catch (error) {
      console.error("Toggle like error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to toggle like",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /posts/:postId/share
 *
 * Share a post (increment share count)
 */
router.post(
  "/:postId/share",
  authenticateToken,
  requireSyncedUser,
  async (req, res) => {
    try {
      const { postId } = req.params;

      const post = await Post.findOne({
        _id: postId,
        isActive: true,
        deletedAt: null,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      await post.incrementShares();

      res.json({
        success: true,
        message: "Post shared",
        data: {
          shares: post.shares,
        },
      });
    } catch (error) {
      console.error("Share post error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to share post",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

module.exports = router;
