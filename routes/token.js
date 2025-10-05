const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Session = require("../models/Session");
const { authenticateToken } = require("../middleware/auth");
const { getFirebaseUser, deleteFirebaseUser } = require("../config/firebase");

const router = express.Router();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET exists
if (!JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET environment variable is not set!");
  console.error("Please set JWT_SECRET in your environment variables.");
  process.exit(1);
}
// Token expiry configuration - Users stay logged in for extended periods (like Instagram/TikTok)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // 7 days for access token
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "90d"; // 90 days for refresh token (always, no remember me needed)

/**
 * POST /token/exchange
 *
 * Exchange Firebase ID token for our custom JWT tokens
 * This endpoint should be called after successful Firebase authentication
 * Returns both access token (short-lived) and refresh token (long-lived)
 */
router.post(
  "/exchange",
  authenticateToken, // Verify Firebase token first
  [
    body("deviceInfo")
      .optional()
      .isObject()
      .withMessage("Device info must be an object"),
    body("deviceInfo.deviceType")
      .optional()
      .isIn(["ios", "android", "web"])
      .withMessage("Device type must be ios, android, or web"),
    body("deviceInfo.deviceId")
      .optional()
      .isString()
      .withMessage("Device ID must be a string"),
    body("isSignup")
      .optional()
      .isBoolean()
      .withMessage("isSignup must be a boolean"),
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

      const { firebaseUser } = req;
      const { deviceInfo, isSignup = false } = req.body;

      // Find or create user in our database
      let user = await User.findOne({ firebaseUid: firebaseUser.uid });
      let isNewUser = false;

      if (!user) {
        // Check if a user with this email already exists in DB
        // (This handles the case where Firebase user exists but DB user doesn't)
        if (firebaseUser.email) {
          const existingEmailUser = await User.findOne({
            email: firebaseUser.email,
          });

          if (existingEmailUser) {
            // Email exists in DB but with different Firebase UID
            // This is a critical inconsistency - reject it
            console.log(
              `⚠️ Email ${firebaseUser.email} exists in DB with different Firebase UID`
            );
            return res.status(409).json({
              success: false,
              message:
                "An account with this email already exists. Please log in instead.",
              code: "EMAIL_ALREADY_EXISTS",
              isNewUser: false,
            });
          }
        }

        // User doesn't exist in DB
        // If this is a login attempt (not signup), it means:
        // 1. User exists in Firebase but not in DB (incomplete signup)
        // 2. Token exchange failed during their previous signup attempt
        // Solution: Create them in DB now and mark as new user (send to complete profile)
        if (!isSignup) {
          console.log(
            `⚠️ Incomplete signup detected: ${firebaseUser.uid}. Creating user in DB...`
          );
          isNewUser = true; // Mark as new user so they go to complete profile
        } else {
          // This is a signup attempt - create new user
          isNewUser = true;
        }

        // Determine username based on signup method
        const provider = firebaseUser.firebase?.sign_in_provider || "unknown";
        let username;

        if (provider === "google.com" || provider === "apple.com") {
          // OAuth users: use displayName (remove spaces, make lowercase)
          const displayName = firebaseUser.name || firebaseUser.display_name;
          username = displayName
            ? displayName.replace(/\s+/g, "_").toLowerCase().substring(0, 20)
            : firebaseUser.email?.split("@")[0] || `user_${Date.now()}`;
        } else if (firebaseUser.email) {
          // Email users: use email username part (frontend will have sent displayName as username)
          username =
            firebaseUser.name ||
            firebaseUser.display_name ||
            firebaseUser.email.split("@")[0];
        } else {
          // Phone users: should have username in displayName from frontend
          username =
            firebaseUser.name ||
            firebaseUser.display_name ||
            `user${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
        }

        // Ensure username is unique
        let finalUsername = username;
        let counter = 1;
        while (await User.findOne({ "profile.username": finalUsername })) {
          finalUsername = `${username}${counter}`;
          counter++;
        }

        user = new User({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.name || firebaseUser.display_name,
          phoneNumber: firebaseUser.phone_number,
          photoURL: firebaseUser.picture,
          emailVerified: firebaseUser.email_verified || false,
          providers: [provider],
          profile: {
            username: finalUsername,
            bio: "",
            isPrivate: false,
          },
          lastLogin: new Date(),
        });

        await user.save();
        console.log(
          `New user created: ${user.firebaseUid} with username: ${finalUsername}`
        );
      } else {
        // User exists in DB
        // If this is a signup attempt but user already exists, reject it
        if (isSignup) {
          return res.status(409).json({
            success: false,
            message: "Account already exists. Please log in instead.",
            code: "USER_ALREADY_EXISTS",
            isNewUser: false,
          });
        }

        // Update existing user (login)
        user.lastLogin = new Date();
        user.emailVerified = firebaseUser.email_verified || user.emailVerified;

        // Update providers if new one detected
        const currentProvider = firebaseUser.firebase?.sign_in_provider;
        if (currentProvider && !user.providers.includes(currentProvider)) {
          user.providers.push(currentProvider);
        }

        await user.save();
      }

      // Update device information if provided
      if (deviceInfo) {
        const existingDeviceIndex = user.devices.findIndex(
          (device) => device.deviceId === deviceInfo.deviceId
        );

        if (existingDeviceIndex >= 0) {
          user.devices[existingDeviceIndex] = {
            ...user.devices[existingDeviceIndex],
            ...deviceInfo,
            lastUsed: new Date(),
          };
        } else {
          user.devices.push({
            ...deviceInfo,
            lastUsed: new Date(),
          });
        }

        await user.save();
      }

      // Generate JWT tokens with different expiration times based on Remember Me
      const tokenPayload = {
        userId: user._id.toString(),
        firebaseUid: user.firebaseUid,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      };

      // Users stay logged in for extended periods (no remember me needed)
      const accessToken = jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN, // 7 days
        issuer: "ancientflip-backend",
        audience: "ancientflip-app",
      });

      const refreshToken = jwt.sign(
        {
          userId: user._id.toString(),
          tokenType: "refresh",
        },
        JWT_SECRET,
        {
          expiresIn: REFRESH_TOKEN_EXPIRES_IN, // 90 days
          issuer: "ancientflip-backend",
          audience: "ancientflip-app",
        }
      );

      // Create session record
      const sessionId = `${user.firebaseUid}_${Date.now()}`;
      const session = new Session({
        userId: user._id,
        firebaseUid: user.firebaseUid,
        sessionId,
        deviceInfo,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        startTime: new Date(),
        accessToken: accessToken.substring(0, 20) + "...", // Store partial token for tracking
        refreshToken: refreshToken.substring(0, 20) + "...",
      });

      await session.save();

      // Calculate token expiration times (7 days access, 90 days refresh)
      const accessTokenDays = 7;
      const refreshTokenDays = 90;

      const accessTokenExpiresAt = new Date(
        Date.now() + accessTokenDays * 24 * 60 * 60 * 1000
      );
      const refreshTokenExpiresAt = new Date(
        Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000
      );

      res.status(isNewUser ? 201 : 200).json({
        success: true,
        message: isNewUser
          ? "User account created and tokens generated"
          : "Tokens generated successfully",
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
          tokens: {
            accessToken,
            refreshToken,
            accessTokenExpiresAt,
            refreshTokenExpiresAt,
            tokenType: "Bearer",
          },
          isNewUser,
          sessionId,
        },
      });
    } catch (error) {
      console.error("Token exchange error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to exchange tokens",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /token/refresh
 *
 * Refresh access token using refresh token
 * This allows users to stay logged in for extended periods
 */
router.post(
  "/refresh",
  [body("refreshToken").notEmpty().withMessage("Refresh token is required")],
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

      const { refreshToken } = req.body;

      // Verify refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, JWT_SECRET);
      } catch (jwtError) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired refresh token",
          code: "INVALID_REFRESH_TOKEN",
        });
      }

      // Check if it's actually a refresh token
      if (decoded.tokenType !== "refresh") {
        return res.status(401).json({
          success: false,
          message: "Invalid token type",
          code: "INVALID_TOKEN_TYPE",
        });
      }

      // Find user
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(404).json({
          success: false,
          message: "User not found or inactive",
          code: "USER_NOT_FOUND",
        });
      }

      // Generate new access token
      const tokenPayload = {
        userId: user._id.toString(),
        firebaseUid: user.firebaseUid,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      };

      const newAccessToken = jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: "ancientflip-backend",
        audience: "ancientflip-app",
      });

      const accessTokenExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      );

      res.json({
        success: true,
        message: "Access token refreshed successfully",
        data: {
          accessToken: newAccessToken,
          accessTokenExpiresAt,
          tokenType: "Bearer",
        },
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to refresh token",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * POST /token/revoke
 *
 * Revoke refresh token (logout)
 * This invalidates the refresh token and ends the session
 */
router.post(
  "/revoke",
  [body("refreshToken").notEmpty().withMessage("Refresh token is required")],
  async (req, res) => {
    try {
      const { refreshToken } = req.body;

      // Verify and decode token to get user info
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, JWT_SECRET);
      } catch (jwtError) {
        // Even if token is invalid/expired, we'll return success for security
        return res.json({
          success: true,
          message: "Token revoked successfully",
        });
      }

      // Find and end sessions for this user
      await Session.updateMany(
        { userId: decoded.userId },
        {
          endTime: new Date(),
          isActive: false,
        }
      );

      res.json({
        success: true,
        message: "Token revoked successfully",
      });
    } catch (error) {
      console.error("Token revoke error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to revoke token",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
);

/**
 * GET /token/verify
 *
 * Verify if current JWT token is valid
 * Useful for checking authentication status
 */
router.get("/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
        code: "NO_TOKEN",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
        code: "INVALID_TOKEN_FORMAT",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        code: "INVALID_TOKEN",
      });
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive",
        code: "USER_NOT_FOUND",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      data: {
        user: {
          id: user._id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          profile: user.profile,
        },
        tokenInfo: {
          userId: decoded.userId,
          expiresAt: new Date(decoded.exp * 1000),
          issuedAt: new Date(decoded.iat * 1000),
        },
      },
    });
  } catch (error) {
    console.error("Token verify error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify token",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

module.exports = router;
