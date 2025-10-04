const express = require("express");
const { body, validationResult, query, param } = require("express-validator");
const Comment = require("../models/Comment");
const Post = require("../models/Post");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");

const router = express.Router();

/**
 * GET /comments/post/:postId
 *
 * Get comments for a specific post
 */
router.get(
  "/post/:postId",
  authenticateJWT,
  requireAuth,
  [
    param("postId").isMongoId().withMessage("Invalid post ID"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("sortBy")
      .optional()
      .isIn(["createdAt", "likes"])
      .withMessage("Invalid sort field"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc", "1", "-1"])
      .withMessage("Invalid sort order"),
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
      const { user } = req;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const sortBy = req.query.sortBy || "createdAt";
      const sortOrder =
        req.query.sortOrder === "asc" || req.query.sortOrder === "1" ? 1 : -1;

      // Check if post exists and user can view it
      const post = await Post.findById(postId).populate("userId");
      if (!post || !post.isActive || post.deletedAt) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Check if user can view the post (public or following)
      const canViewPost =
        post.isPublic ||
        post.userId._id.toString() === user._id.toString() ||
        user.following
          .map((id) => id.toString())
          .includes(post.userId._id.toString());

      if (!canViewPost) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Get comments (returns plain objects from aggregation)
      const comments = await Comment.findByPost(postId, {
        page,
        limit,
        sortBy,
        sortOrder,
        userId: user._id.toString(), // Pass userId for isLiked calculation
      });

      // Format comments
      const formattedComments = comments.map((comment) => {
        // Format user data
        if (comment.userId) {
          comment.author =
            comment.userId.profile?.username ||
            comment.userId.displayName ||
            `${comment.userId.profile?.firstName || ""} ${
              comment.userId.profile?.lastName || ""
            }`.trim() ||
            "Unknown User";
          comment.avatar = comment.userId.photoURL || "";

          // Remove sensitive user data
          delete comment.userId.profile;
          delete comment.userId.displayName;
          delete comment.userId.photoURL;
          delete comment.userId;
        }

        return comment;
      });

      // Get total count for pagination
      const totalComments = await Comment.countDocuments({
        postId,
        isDeleted: false,
        moderationStatus: "approved",
        parentCommentId: null,
      });

      res.json({
        success: true,
        message: "Comments retrieved successfully",
        data: {
          comments: formattedComments,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalComments / limit),
            totalComments,
            hasNextPage: page < Math.ceil(totalComments / limit),
            hasPrevPage: page > 1,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch comments",
        error: error.message,
      });
    }
  }
);

/**
 * POST /comments
 *
 * Create a new comment
 */
router.post(
  "/",
  authenticateJWT,
  requireAuth,
  [
    body("postId").isMongoId().withMessage("Invalid post ID"),
    body("content")
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage("Comment must be between 1 and 1000 characters"),
    body("parentCommentId")
      .optional()
      .isMongoId()
      .withMessage("Invalid parent comment ID"),
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
      const { postId, content, parentCommentId } = req.body;

      // Check if post exists and user can comment
      const post = await Post.findById(postId).populate("userId");
      if (!post || !post.isActive || post.deletedAt) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Check if user can view/comment on the post
      const canComment =
        post.isPublic ||
        post.userId._id.toString() === user._id.toString() ||
        user.following
          .map((id) => id.toString())
          .includes(post.userId._id.toString());

      if (!canComment) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // If replying to a comment, check if parent exists
      if (parentCommentId) {
        const parentComment = await Comment.findById(parentCommentId);
        if (
          !parentComment ||
          parentComment.isDeleted ||
          parentComment.deletedAt
        ) {
          return res.status(404).json({
            success: false,
            message: "Parent comment not found",
          });
        }
      }

      // Create comment
      const comment = new Comment({
        postId,
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        content,
        parentCommentId: parentCommentId || null,
      });

      await comment.save();

      // Update post comment count
      await Post.findByIdAndUpdate(postId, { $inc: { comments: 1 } });

      // Populate user data
      await comment.populate(
        "userId",
        "displayName photoURL profile.firstName profile.lastName profile.username"
      );

      // Format response
      const commentObj = comment.toObject();
      commentObj.isLiked = false;
      commentObj.author =
        commentObj.userId.profile?.username ||
        commentObj.userId.displayName ||
        `${commentObj.userId.profile?.firstName || ""} ${
          commentObj.userId.profile?.lastName || ""
        }`.trim() ||
        "Unknown User";
      commentObj.avatar = commentObj.userId.photoURL || "";

      // Remove sensitive data
      delete commentObj.likedBy;
      delete commentObj.userId;

      // Log comment creation
      AuditLog.create({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "comment_create",
        resource: "comment",
        resourceId: comment._id.toString(),
        details: {
          postId,
          parentCommentId,
          contentLength: content.length,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch(console.error);

      res.status(201).json({
        success: true,
        message: "Comment created successfully",
        data: commentObj,
      });
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create comment",
        error: error.message,
      });
    }
  }
);

/**
 * PUT /comments/:commentId
 *
 * Update a comment
 */
router.put(
  "/:commentId",
  authenticateJWT,
  requireAuth,
  [
    param("commentId").isMongoId().withMessage("Invalid comment ID"),
    body("content")
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage("Comment must be between 1 and 1000 characters"),
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

      const { commentId } = req.params;
      const { content } = req.body;
      const { user, firebaseUser } = req;

      // Find comment
      const comment = await Comment.findById(commentId).populate(
        "userId",
        "displayName photoURL profile.firstName profile.lastName profile.username"
      );
      if (!comment || comment.isDeleted || comment.deletedAt) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check if user owns the comment
      if (comment.userId._id.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Update comment
      const oldContent = comment.content;
      comment.content = content;
      comment.isEdited = true;
      await comment.save();

      // Format response
      const commentObj = comment.toObject();
      commentObj.isLiked = comment.isLikedBy(user._id);
      commentObj.author =
        commentObj.userId.profile?.username ||
        commentObj.userId.displayName ||
        `${commentObj.userId.profile?.firstName || ""} ${
          commentObj.userId.profile?.lastName || ""
        }`.trim() ||
        "Unknown User";
      commentObj.avatar = commentObj.userId.photoURL || "";

      // Remove sensitive data
      delete commentObj.likedBy;
      delete commentObj.userId;

      // Log comment update
      AuditLog.create({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "comment_update",
        resource: "comment",
        resourceId: comment._id.toString(),
        details: {
          oldContent,
          newContent: content,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch(console.error);

      res.json({
        success: true,
        message: "Comment updated successfully",
        data: commentObj,
      });
    } catch (error) {
      console.error("Error updating comment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update comment",
        error: error.message,
      });
    }
  }
);

/**
 * DELETE /comments/:commentId
 *
 * Delete a comment
 */
router.delete(
  "/:commentId",
  authenticateJWT,
  requireAuth,
  [param("commentId").isMongoId().withMessage("Invalid comment ID")],
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

      const { commentId } = req.params;
      const { user, firebaseUser } = req;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment || comment.isDeleted || comment.deletedAt) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check if user owns the comment
      if (comment.userId.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Soft delete comment
      await comment.softDelete(user._id);

      // Update post comment count
      await Post.findByIdAndUpdate(comment.postId, { $inc: { comments: -1 } });

      // Log comment deletion
      AuditLog.create({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "comment_delete",
        resource: "comment",
        resourceId: comment._id.toString(),
        details: {
          postId: comment.postId,
          content: comment.content,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch(console.error);

      res.json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete comment",
        error: error.message,
      });
    }
  }
);

/**
 * POST /comments/:commentId/like
 *
 * Toggle like on a comment
 */
router.post(
  "/:commentId/like",
  authenticateJWT,
  requireAuth,
  [param("commentId").isMongoId().withMessage("Invalid comment ID")],
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

      const { commentId } = req.params;
      const { user, firebaseUser } = req;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment || comment.isDeleted || comment.deletedAt) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Toggle like
      const isLiked = await comment.toggleLike(user._id);

      // Log like action
      AuditLog.create({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: isLiked ? "comment_like" : "comment_unlike",
        resource: "comment",
        resourceId: comment._id.toString(),
        details: {
          postId: comment.postId,
          newLikeCount: comment.likes,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }).catch(console.error);

      res.json({
        success: true,
        message: isLiked ? "Comment liked" : "Comment unliked",
        data: {
          isLiked,
          likes: comment.likes,
        },
      });
    } catch (error) {
      console.error("Error toggling comment like:", error);
      res.status(500).json({
        success: false,
        message: "Failed to toggle comment like",
        error: error.message,
      });
    }
  }
);

/**
 * GET /comments/:commentId/replies
 *
 * Get replies for a comment
 */
router.get(
  "/:commentId/replies",
  authenticateJWT,
  requireAuth,
  [
    param("commentId").isMongoId().withMessage("Invalid comment ID"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage("Limit must be between 1 and 20"),
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

      const { commentId } = req.params;
      const { user } = req;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      // Check if parent comment exists
      const parentComment = await Comment.findById(commentId);
      if (
        !parentComment ||
        !parentComment.isActive ||
        parentComment.deletedAt
      ) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Get replies
      const replies = await Comment.findReplies(commentId, { page, limit });

      // Add isLiked field for current user
      const repliesWithLikeStatus = replies.map((reply) => {
        const replyObj = reply.toObject();
        replyObj.isLiked = reply.isLikedBy(user._id);

        // Format user data
        if (replyObj.userId) {
          replyObj.author =
            replyObj.userId.profile?.username ||
            replyObj.userId.displayName ||
            `${replyObj.userId.profile?.firstName || ""} ${
              replyObj.userId.profile?.lastName || ""
            }`.trim() ||
            "Unknown User";
          replyObj.avatar = replyObj.userId.photoURL || "";
        }

        // Remove sensitive data
        delete replyObj.likedBy;
        delete replyObj.userId;

        return replyObj;
      });

      res.json({
        success: true,
        message: "Replies retrieved successfully",
        data: {
          replies: repliesWithLikeStatus,
          pagination: {
            currentPage: page,
            hasNextPage: replies.length === limit,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching replies:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch replies",
        error: error.message,
      });
    }
  }
);

module.exports = router;
