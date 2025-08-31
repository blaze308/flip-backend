const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;

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
      return next();
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      req.user = null;
      req.tokenPayload = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (user && user.isActive) {
        req.user = user;
        req.tokenPayload = decoded;
      } else {
        req.user = null;
        req.tokenPayload = null;
      }
    } catch (jwtError) {
      req.user = null;
      req.tokenPayload = null;
    }

    next();
  } catch (error) {
    console.error("Optional JWT auth middleware error:", error);
    req.user = null;
    req.tokenPayload = null;
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
