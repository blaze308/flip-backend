const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * ⚠️  IMPORTANT: JWT AUTHENTICATION SYSTEM
 *
 * This is the MAIN authentication system for this application.
 * ALL new routes and endpoints should use `authenticateJWT` middleware.
 *
 * DO NOT use `authenticateToken` from middleware/auth.js (Firebase tokens)
 * unless specifically required for Firebase-only operations.
 *
 * Standard pattern for protected routes:
 * router.get('/endpoint', authenticateJWT, async (req, res) => { ... });
 *
 * The JWT system provides:
 * - Custom JWT tokens issued by our backend
 * - Token refresh capabilities
 * - Consistent user object in req.user
 * - Better security and control
 */

const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET exists
if (!JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET environment variable is not set!");
  console.error("Please set JWT_SECRET in your environment variables.");
  process.exit(1);
}

/**
 * Middleware to verify JWT tokens (our custom tokens, not Firebase)
 * This middleware:
 * 1. Extracts the Authorization header from the request
 * 2. Verifies the JWT token using our secret
 * 3. Attaches the decoded user info to req.user for use in routes
 * 4. Loads the complete user profile from our database
 */
const authenticateJWT = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
        code: "NO_TOKEN",
      });
    }

    // Expected format: "Bearer <token>"
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid token format.",
        code: "INVALID_TOKEN_FORMAT",
      });
    }

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      let message = "Access denied. Invalid or expired token.";
      let code = "INVALID_TOKEN";

      if (jwtError.name === "TokenExpiredError") {
        message = "Access denied. Token has expired.";
        code = "TOKEN_EXPIRED";
      } else if (jwtError.name === "JsonWebTokenError") {
        message = "Access denied. Malformed token.";
        code = "MALFORMED_TOKEN";
      }

      return res.status(401).json({
        success: false,
        message,
        code,
        error:
          process.env.NODE_ENV === "development" ? jwtError.message : undefined,
      });
    }

    // Load user from our database
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "User account is inactive.",
        code: "USER_INACTIVE",
      });
    }

    // Attach user info to request
    req.user = user;
    req.tokenPayload = decoded;

    // Also set req.firebaseUser for compatibility with routes that expect it
    // This ensures routes using firebaseUser.uid will work
    req.firebaseUser = {
      uid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
    };

    next();
  } catch (error) {
    console.error("JWT authentication middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
      code: "AUTH_ERROR",
    });
  }
};

/**
 * Optional JWT authentication middleware
 * Tries to authenticate but doesn't fail if no token is provided
 */
const optionalJWTAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.user = null;
      req.tokenPayload = null;
      req.firebaseUser = null;
      return next();
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      req.user = null;
      req.tokenPayload = null;
      req.firebaseUser = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (user && user.isActive) {
        req.user = user;
        req.tokenPayload = decoded;
        // Also set req.firebaseUser for compatibility
        req.firebaseUser = {
          uid: user.firebaseUid,
          email: user.email,
          displayName: user.displayName,
        };
      } else {
        req.user = null;
        req.tokenPayload = null;
        req.firebaseUser = null;
      }
    } catch (jwtError) {
      req.user = null;
      req.tokenPayload = null;
      req.firebaseUser = null;
    }

    next();
  } catch (error) {
    console.error("Optional JWT auth middleware error:", error);
    req.user = null;
    req.tokenPayload = null;
    req.firebaseUser = null;
    next();
  }
};

/**
 * Middleware to check if user has specific permissions
 * @param {Array} permissions - Array of required permissions
 */
const requirePermissions = (permissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
        code: "AUTH_REQUIRED",
      });
    }

    // Check if user has all required permissions
    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = permissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions.",
        code: "INSUFFICIENT_PERMISSIONS",
        required: permissions,
        current: userPermissions,
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required.",
      code: "ADMIN_REQUIRED",
    });
  }
  next();
};

/**
 * Middleware to check if user is authenticated (has valid JWT)
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
      code: "AUTH_REQUIRED",
    });
  }
  next();
};

module.exports = {
  authenticateJWT,
  optionalJWTAuth,
  requirePermissions,
  requireAdmin,
  requireAuth,
};
