const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Session = require("../models/Session");
const { authenticateToken } = require("../middleware/auth");
const { getFirebaseUser } = require("../config/firebase");
const { generatePhoneAuthUsername } = require("../utils/usernameGenerator");

const router = express.Router();

/**
 * POST /auth/sync-user
 *
 * This is the core endpoint that handles user synchronization between Firebase and our database.
 * It's called from the Flutter app after successful Firebase authentication.
 *
 * This endpoint handles multiple scenarios:
 * 1. New user registration (first time login)
 * 2. Existing user login (update last login, sync any profile changes)
 * 3. OAuth account linking (user signs in with different provider but same email)
 * 4. Profile updates from Firebase (display name, photo, email verification status)
 *
 * The Flutter app should call this endpoint:
 * - After successful Firebase authentication (any method)
 * - When user profile is updated in Firebase
 * - Periodically to sync any changes
 */
router.post(
  "/sync-user",
  authenticateToken,
  [
    body("deviceInfo.deviceType")
      .optional()
      .isIn(["ios", "android", "web", "desktop"])
      .withMessage("Invalid device type"),
    body("deviceInfo.deviceId")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Device ID must be between 1 and 100 characters"),
    body("deviceInfo.appVersion")
      .optional()
      .isLength({ min: 1, max: 20 })
      .withMessage("App version must be between 1 and 20 characters"),
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

      const { firebaseUser } = req;
      const { deviceInfo, forceUpdate = false } = req.body;

      // Get additional user data from Firebase if needed
      const firebaseUserData = await getFirebaseUser(firebaseUser.uid);
      if (!firebaseUserData.success) {
        return res.status(400).json({
          success: false,
          message: "Failed to fetch user data from Firebase",
          error: firebaseUserData.error,
        });
      }

      const fbUser = firebaseUserData.user;

      // Extract provider information from Firebase
      const providers = fbUser.providerData.map((provider) => {
        switch (provider.providerId) {
          case "password":
            return "password";
          case "google.com":
            return "google.com";
          case "apple.com":
            return "apple.com";
          case "phone":
            return "phone";
          case "facebook.com":
            return "facebook.com";
          case "twitter.com":
            return "twitter.com";
          default:
            return provider.providerId;
        }
      });

      // Check if user already exists in our database
      let user = await User.findByFirebaseUid(firebaseUser.uid);
      let isNewUser = false;

      if (!user) {
        // New user - create account
        isNewUser = true;

        // Check if user with same email exists (for account linking)
        let existingUser = null;
        if (fbUser.email) {
          existingUser = await User.findByEmail(fbUser.email);
        }

        if (existingUser && !forceUpdate) {
          // User exists with same email but different Firebase UID
          // This shouldn't happen with proper Firebase setup, but handle it gracefully
          await AuditLog.logAction({
            firebaseUid: firebaseUser.uid,
            action: "register",
            success: false,
            errorMessage: "Email already exists with different account",
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
            deviceInfo,
          });

          return res.status(409).json({
            success: false,
            message:
              "An account with this email already exists. Please contact support.",
            code: "EMAIL_EXISTS",
          });
        }

        // Create new user
        user = new User({
          firebaseUid: firebaseUser.uid,
          email: fbUser.email?.toLowerCase(),
          displayName: fbUser.displayName,
          phoneNumber: fbUser.phoneNumber,
          photoURL: fbUser.photoURL,
          providers: providers,
          emailVerified: fbUser.emailVerified || false,
          lastLogin: new Date(),
          loginCount: 1,
        });

        // Set initial profile data
        if (fbUser.displayName) {
          const nameParts = fbUser.displayName.split(" ");
          user.profile.firstName = nameParts[0];
          if (nameParts.length > 1) {
            user.profile.lastName = nameParts.slice(1).join(" ");
          }
        }

        // Generate username for phone authentication users
        if (
          providers.includes("phone") &&
          fbUser.phoneNumber &&
          !fbUser.displayName
        ) {
          try {
            const generatedUsername = await generatePhoneAuthUsername(
              fbUser.phoneNumber,
              User,
              new Date()
            );
            user.profile.username = generatedUsername;
            user.displayName = generatedUsername; // Also set as display name
            console.log(
              `Generated username for phone user: ${generatedUsername}`
            );
          } catch (error) {
            console.error("Failed to generate username for phone user:", error);
            // Fallback to a simple timestamp-based username
            const timestamp = Date.now().toString().slice(-6);
            user.profile.username = `user${timestamp}`;
            user.displayName = `user${timestamp}`;
          }
        }

        await user.save();

        // Log successful registration
        await AuditLog.logAction({
          userId: user._id,
          firebaseUid: firebaseUser.uid,
          action: "register",
          success: true,
          details: {
            providers: providers,
            email: fbUser.email,
            emailVerified: fbUser.emailVerified,
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
          deviceInfo,
        });
      } else {
        // Existing user - update profile and login info
        let hasChanges = false;

        // Update basic profile info if changed
        if (fbUser.email && fbUser.email.toLowerCase() !== user.email) {
          user.email = fbUser.email.toLowerCase();
          hasChanges = true;
        }

        if (fbUser.displayName && fbUser.displayName !== user.displayName) {
          user.displayName = fbUser.displayName;
          hasChanges = true;
        }

        if (fbUser.phoneNumber && fbUser.phoneNumber !== user.phoneNumber) {
          user.phoneNumber = fbUser.phoneNumber;
          hasChanges = true;
        }

        if (fbUser.photoURL && fbUser.photoURL !== user.photoURL) {
          user.photoURL = fbUser.photoURL;
          hasChanges = true;
        }

        if (fbUser.emailVerified !== user.emailVerified) {
          user.emailVerified = fbUser.emailVerified;
          hasChanges = true;
        }

        // Update providers (add new ones, don't remove existing)
        const currentProviders = user.providers || [];
        const newProviders = [...new Set([...currentProviders, ...providers])];
        if (newProviders.length !== currentProviders.length) {
          user.providers = newProviders;
          hasChanges = true;
        }

        // Update login info
        user.lastLogin = new Date();
        user.loginCount += 1;
        hasChanges = true;

        if (hasChanges) {
          await user.save();
        }

        // Log successful login
        await AuditLog.logAction({
          userId: user._id,
          firebaseUid: firebaseUser.uid,
          action: "login",
          success: true,
          details: {
            providers: providers,
            hasProfileChanges: hasChanges,
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
          deviceInfo,
        });
      }

      // Update device information if provided
      if (deviceInfo) {
        const existingDeviceIndex = user.devices.findIndex(
          (device) => device.deviceId === deviceInfo.deviceId
        );

        if (existingDeviceIndex >= 0) {
          // Update existing device
          user.devices[existingDeviceIndex] = {
            ...user.devices[existingDeviceIndex],
            ...deviceInfo,
            lastUsed: new Date(),
          };
        } else {
          // Add new device
          user.devices.push({
            ...deviceInfo,
            lastUsed: new Date(),
          });
        }

        await user.save();
      }

      // Create or update session
      const sessionId = `${firebaseUser.uid}_${Date.now()}`;
      const session = new Session({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        sessionId,
        deviceInfo,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        startTime: new Date(),
      });

      await session.save();

      // Return user data
      const responseData = {
        success: true,
        message: isNewUser
          ? "User account created successfully"
          : "User profile synced successfully",
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
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
          },
          isNewUser,
          sessionId,
        },
      };

      res.status(isNewUser ? 201 : 200).json(responseData);
    } catch (error) {
      console.error("Sync user error:", error);

      // Log failed sync attempt
      await AuditLog.logAction({
        firebaseUid: req.firebaseUser?.uid,
        action: isNewUser ? "register" : "login",
        success: false,
        errorMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        deviceInfo: req.body.deviceInfo,
      });

      res.status(500).json({
        success: false,
        message: "Failed to sync user data",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /auth/verify
 *
 * Check if the authenticated user exists in our database
 * Useful for the Flutter app to determine if sync-user needs to be called
 */
router.get("/verify", authenticateToken, async (req, res) => {
  try {
    const { firebaseUser } = req;

    const user = await User.findByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database",
        code: "USER_NOT_SYNCED",
        syncRequired: true,
      });
    }

    res.json({
      success: true,
      message: "User verified",
      data: {
        user: {
          id: user._id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          displayName: user.displayName,
          isActive: user.isActive,
          role: user.role,
          lastLogin: user.lastLogin,
        },
        syncRequired: false,
      },
    });
  } catch (error) {
    console.error("Verify user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify user",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * POST /auth/logout
 *
 * End user session and log the logout action
 */
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const { firebaseUser, user } = req;

    // End session if sessionId provided
    if (sessionId) {
      await Session.findOneAndUpdate(
        { sessionId, firebaseUid: firebaseUser.uid },
        {
          endTime: new Date(),
          isActive: false,
          endReason: "logout",
        }
      );
    }

    // Log logout action
    if (user) {
      await AuditLog.logAction({
        userId: user._id,
        firebaseUid: firebaseUser.uid,
        action: "logout",
        success: true,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to logout",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

module.exports = router;
