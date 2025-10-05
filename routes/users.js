const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Session = require("../models/Session");
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const { deleteFirebaseUser } = require("../config/firebase");

const router = express.Router();

/**
 * GET /users/profile
 *
 * Get the complete profile data for the authenticated user
 */
router.get("/profile", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    // Update last active timestamp
    user.lastActive = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Profile retrieved successfully",
      data: {
        user: {
          id: user._id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          photoURL: user.photoURL,
          providers: user.providers,
          emailVerified: user.emailVerified,
          role: user.role,
          isActive: user.isActive,
          profile: user.profile,
          subscription: user.subscription,
          stats: user.stats,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          lastActive: user.lastActive,
          loginCount: user.loginCount,
        },
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * PUT /users/profile
 *
 * Update user profile information
 * Only updates fields that are provided in the request body
 */
router.put(
  "/profile",
  authenticateJWT,
  requireAuth,
  [
    // Validation rules
    body("displayName")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Display name must be between 1 and 100 characters")
      .trim(),

    body("profile.firstName")
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage("First name must be between 1 and 50 characters")
      .trim(),

    body("profile.lastName")
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage("Last name must be between 1 and 50 characters")
      .trim(),

    body("profile.bio")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Bio cannot exceed 500 characters")
      .trim(),

    body("profile.dateOfBirth")
      .optional()
      .isISO8601()
      .withMessage("Date of birth must be a valid date")
      .custom((value) => {
        if (new Date(value) >= new Date()) {
          throw new Error("Date of birth must be in the past");
        }
        return true;
      }),

    body("profile.gender")
      .optional()
      .isIn(["male", "female", "other", "prefer_not_to_say"])
      .withMessage("Invalid gender value"),

    body("profile.location.country")
      .optional()
      .isLength({ min: 2, max: 50 })
      .withMessage("Country must be between 2 and 50 characters"),

    body("profile.location.state")
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage("State must be between 1 and 50 characters"),

    body("profile.location.city")
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage("City must be between 1 and 50 characters"),

    body("profile.preferences.language")
      .optional()
      .isLength({ min: 2, max: 5 })
      .withMessage("Language code must be between 2 and 5 characters"),

    body("profile.preferences.timezone")
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage("Timezone must be between 1 and 50 characters"),

    body("profile.preferences.notifications.email")
      .optional()
      .isBoolean()
      .withMessage("Email notification preference must be boolean"),

    body("profile.preferences.notifications.push")
      .optional()
      .isBoolean()
      .withMessage("Push notification preference must be boolean"),

    body("profile.preferences.notifications.sms")
      .optional()
      .isBoolean()
      .withMessage("SMS notification preference must be boolean"),

    body("profile.preferences.privacy.profileVisible")
      .optional()
      .isBoolean()
      .withMessage("Profile visibility preference must be boolean"),

    body("profile.preferences.privacy.showEmail")
      .optional()
      .isBoolean()
      .withMessage("Show email preference must be boolean"),

    body("profile.preferences.privacy.showPhone")
      .optional()
      .isBoolean()
      .withMessage("Show phone preference must be boolean"),

    body("photoURL")
      .optional()
      .isURL()
      .withMessage("Photo URL must be a valid URL"),

    body("profile.website")
      .optional()
      .isURL()
      .withMessage("Website must be a valid URL"),

    body("profile.occupation")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Occupation cannot exceed 100 characters")
      .trim(),

    body("profile.interests")
      .optional()
      .isArray()
      .withMessage("Interests must be an array"),

    body("profile.coverPhotoURL")
      .optional()
      .isURL()
      .withMessage("Cover photo URL must be a valid URL"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { user } = req;
      const updateData = req.body;

      // Track what fields are being updated for audit log
      const updatedFields = [];

      // Update basic fields
      if (updateData.displayName !== undefined) {
        user.displayName = updateData.displayName;
        updatedFields.push("displayName");
      }

      if (updateData.photoURL !== undefined) {
        user.photoURL = updateData.photoURL;
        updatedFields.push("photoURL");
      }

      // Update profile fields
      if (updateData.profile) {
        // Initialize profile if it doesn't exist
        if (!user.profile) {
          user.profile = {};
        }

        // Update nested profile fields
        const profileFields = [
          "firstName",
          "lastName",
          "bio",
          "dateOfBirth",
          "gender",
          "website",
          "occupation",
          "coverPhotoURL",
        ];

        profileFields.forEach((field) => {
          if (updateData.profile[field] !== undefined) {
            user.profile[field] = updateData.profile[field];
            updatedFields.push(`profile.${field}`);
          }
        });

        // Update interests array
        if (updateData.profile.interests !== undefined) {
          user.profile.interests = updateData.profile.interests;
          updatedFields.push("profile.interests");
        }

        // Update location
        if (updateData.profile.location) {
          if (!user.profile.location) {
            user.profile.location = {};
          }

          ["country", "state", "city"].forEach((field) => {
            if (updateData.profile.location[field] !== undefined) {
              user.profile.location[field] = updateData.profile.location[field];
              updatedFields.push(`profile.location.${field}`);
            }
          });
        }

        // Update preferences
        if (updateData.profile.preferences) {
          if (!user.profile.preferences) {
            user.profile.preferences = {
              language: "en",
              timezone: "UTC",
              notifications: {
                email: true,
                push: true,
                sms: false,
              },
              privacy: {
                profileVisible: true,
                showEmail: false,
                showPhone: false,
              },
            };
          }

          // Update language and timezone
          if (updateData.profile.preferences.language !== undefined) {
            user.profile.preferences.language =
              updateData.profile.preferences.language;
            updatedFields.push("profile.preferences.language");
          }

          if (updateData.profile.preferences.timezone !== undefined) {
            user.profile.preferences.timezone =
              updateData.profile.preferences.timezone;
            updatedFields.push("profile.preferences.timezone");
          }

          // Update notification preferences
          if (updateData.profile.preferences.notifications) {
            ["email", "push", "sms"].forEach((field) => {
              if (
                updateData.profile.preferences.notifications[field] !==
                undefined
              ) {
                user.profile.preferences.notifications[field] =
                  updateData.profile.preferences.notifications[field];
                updatedFields.push(
                  `profile.preferences.notifications.${field}`
                );
              }
            });
          }

          // Update privacy preferences
          if (updateData.profile.preferences.privacy) {
            ["profileVisible", "showEmail", "showPhone"].forEach((field) => {
              if (updateData.profile.preferences.privacy[field] !== undefined) {
                user.profile.preferences.privacy[field] =
                  updateData.profile.preferences.privacy[field];
                updatedFields.push(`profile.preferences.privacy.${field}`);
              }
            });
          }
        }
      }

      // Save the updated user
      await user.save();

      // Log the profile update
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "profile_update",
        success: true,
        details: {
          updatedFields,
          updateData: updateData,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user: {
            id: user._id,
            firebaseUid: user.firebaseUid,
            email: user.email,
            displayName: user.displayName,
            phoneNumber: user.phoneNumber,
            photoURL: user.photoURL,
            providers: user.providers,
            emailVerified: user.emailVerified,
            role: user.role,
            isActive: user.isActive,
            profile: user.profile,
            subscription: user.subscription,
            updatedAt: user.updatedAt,
          },
          updatedFields,
        },
      });
    } catch (error) {
      console.error("Update profile error:", error);

      // Log failed update attempt
      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.firebaseUser?.uid,
        action: "profile_update",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * DELETE /users/account
 *
 * Delete user account and all associated data
 * This is a permanent action that:
 * 1. Soft deletes the user in our database
 * 2. Deletes the user from Firebase Auth
 * 3. Ends all active sessions
 * 4. Logs the deletion for audit purposes
 */
router.delete(
  "/account",
  authenticateJWT,
  requireAuth,
  [
    body("confirmDeletion")
      .equals("DELETE_MY_ACCOUNT")
      .withMessage(
        'Please confirm account deletion by sending "DELETE_MY_ACCOUNT"'
      ),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Account deletion confirmation required",
          errors: errors.array(),
        });
      }

      const { user, firebaseUser } = req;

      // Log the deletion attempt first
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "account_delete",
        success: true,
        details: {
          email: user.email,
          displayName: user.displayName,
          providers: user.providers,
          accountAge: Date.now() - user.createdAt.getTime(),
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // End all active sessions
      await Session.endAllUserSessions(user._id, "account_delete");

      // Soft delete user in our database
      await user.softDelete();

      // Delete user from Firebase Auth
      const firebaseDeleteResult = await deleteFirebaseUser(firebaseUser.uid);

      if (!firebaseDeleteResult.success) {
        console.error(
          "Failed to delete user from Firebase:",
          firebaseDeleteResult.error
        );
        // Continue with the process even if Firebase deletion fails
        // The user is already soft-deleted in our database
      }

      res.json({
        success: true,
        message: "Account deleted successfully",
        data: {
          deletedAt: user.deletedAt,
          firebaseDeleted: firebaseDeleteResult.success,
        },
      });
    } catch (error) {
      console.error("Delete account error:", error);

      // Log failed deletion attempt
      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.firebaseUser?.uid,
        action: "account_delete",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(500).json({
        success: false,
        message: "Failed to delete account",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /users/sessions
 *
 * Get user's active sessions for security monitoring
 */
router.get("/sessions", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;

    const sessions = await Session.findActiveSessions(user._id)
      .sort({ startTime: -1 })
      .limit(20)
      .select("-__v");

    res.json({
      success: true,
      message: "Sessions retrieved successfully",
      data: {
        sessions,
        totalActive: sessions.length,
      },
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve sessions",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * DELETE /users/sessions/:sessionId
 *
 * End a specific session (useful for "log out from other devices")
 */
router.delete(
  "/sessions/:sessionId",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = req;
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
        userId: user._id,
        isActive: true,
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: "Session not found",
        });
      }

      await session.endSession("force_logout");

      // Log the session termination
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "logout",
        success: true,
        details: {
          sessionId,
          reason: "force_logout",
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: "Session ended successfully",
      });
    } catch (error) {
      console.error("End session error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to end session",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /users/audit-logs
 *
 * Get user's audit logs for security and activity monitoring
 */
router.get("/audit-logs", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const { user } = req;
    const { limit = 50, page = 1 } = req.query;

    const logs = await AuditLog.getUserLogs(user._id, parseInt(limit));

    res.json({
      success: true,
      message: "Audit logs retrieved successfully",
      data: {
        logs,
        total: logs.length,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve audit logs",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * POST /users/:userId/follow
 *
 * Follow or unfollow a user
 */
router.post(
  "/:userId/follow",
  authenticateJWT,
  requireAuth,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { user: currentUser } = req;

      // Can't follow yourself
      if (userId === currentUser._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "You cannot follow yourself",
        });
      }

      const targetUser = await User.findOne({
        _id: userId,
        isActive: true,
        deletedAt: null,
      });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const isFollowing = currentUser.following.includes(userId);

      if (isFollowing) {
        // Unfollow
        await currentUser.unfollowUser(userId);
        await targetUser.removeFollower(currentUser._id);
      } else {
        // Follow
        await currentUser.followUser(userId);
        await targetUser.addFollower(currentUser._id);
      }

      // Log follow action
      await AuditLog.logAction({
        userId: currentUser._id,
        firebaseUid: currentUser.firebaseUid,
        action: isFollowing ? "user_unfollow" : "user_follow",
        resource: "user",
        resourceId: userId,
        success: true,
        details: {
          targetUserEmail: targetUser.email,
          targetUserDisplayName: targetUser.displayName,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: isFollowing ? "User unfollowed" : "User followed",
        data: {
          isFollowing: !isFollowing,
          followersCount: targetUser.followers.length,
          followingCount: currentUser.following.length,
        },
      });
    } catch (error) {
      console.error("Follow user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to follow/unfollow user",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * PUT /users/notifications
 *
 * Update user notification preferences
 */
router.put(
  "/notifications",
  authenticateJWT,
  requireAuth,
  [
    body("email").optional().isBoolean().withMessage("Email must be boolean"),
    body("push").optional().isBoolean().withMessage("Push must be boolean"),
    body("sms").optional().isBoolean().withMessage("SMS must be boolean"),
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
      const { email, push, sms } = req.body;

      // Update notification preferences
      if (email !== undefined) {
        user.profile.preferences.notifications.email = email;
      }
      if (push !== undefined) {
        user.profile.preferences.notifications.push = push;
      }
      if (sms !== undefined) {
        user.profile.preferences.notifications.sms = sms;
      }

      await user.save();

      // Log notification update
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        action: "notifications_update",
        resource: "user",
        resourceId: user._id.toString(),
        success: true,
        details: {
          email: user.profile.preferences.notifications.email,
          push: user.profile.preferences.notifications.push,
          sms: user.profile.preferences.notifications.sms,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        message: "Notification preferences updated",
        data: {
          notifications: user.profile.preferences.notifications,
        },
      });
    } catch (error) {
      console.error("Update notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update notification preferences",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /users/following
 *
 * Get list of users that the current user is following
 */
router.get("/following", authenticateJWT, async (req, res) => {
  try {
    const { user } = req;

    // Get the list of users that the current user is following
    const followingUsers = await User.find({
      _id: { $in: user.following },
      isActive: true,
      deletedAt: null,
    })
      .select(
        "_id displayName photoURL username profile.firstName profile.lastName"
      )
      .lean();

    // Format the response
    const formattedUsers = followingUsers.map((followingUser) => ({
      id: followingUser._id,
      displayName: followingUser.displayName,
      username:
        followingUser.username ||
        `${followingUser.profile?.firstName || ""} ${
          followingUser.profile?.lastName || ""
        }`.trim() ||
        followingUser.displayName,
      photoURL: followingUser.photoURL,
      avatar: followingUser.photoURL,
    }));

    res.json({
      success: true,
      message: "Following users retrieved successfully",
      data: {
        users: formattedUsers,
        count: formattedUsers.length,
      },
    });
  } catch (error) {
    console.error("Get following users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get following users",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

module.exports = router;
