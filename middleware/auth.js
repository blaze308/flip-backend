const { verifyIdToken } = require('../config/firebase');
const User = require('../models/User');

/**
 * Middleware to verify Firebase ID token and authenticate requests
 * This middleware:
 * 1. Extracts the Authorization header from the request
 * 2. Verifies the Firebase ID token using Firebase Admin SDK
 * 3. Attaches the decoded user info to req.user for use in routes
 * 4. Optionally loads the complete user profile from our database
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN',
      });
    }

    // Expected format: "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT',
      });
    }

    // Verify the Firebase ID token
    const verificationResult = await verifyIdToken(token);
    
    if (!verificationResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid or expired token.',
        code: 'INVALID_TOKEN',
        error: verificationResult.error,
      });
    }

    // Attach Firebase user info to request
    req.firebaseUser = verificationResult.user;
    
    // Optionally load user from our database
    // This gives us access to additional profile data we store
    try {
      const dbUser = await User.findOne({ firebaseUid: verificationResult.user.uid });
      req.user = dbUser; // This might be null if user hasn't synced yet
    } catch (dbError) {
      console.error('Error loading user from database:', dbError);
      // Continue without database user - some endpoints might not need it
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
      code: 'AUTH_ERROR',
    });
  }
};

/**
 * Middleware to ensure user exists in our database
 * Use this after authenticateToken for endpoints that require a synced user
 */
const requireSyncedUser = (req, res, next) => {
  if (!req.user) {
    return res.status(404).json({
      success: false,
      message: 'User not found in database. Please sync your account first.',
      code: 'USER_NOT_SYNCED',
      syncEndpoint: '/auth/sync-user',
    });
  }
  next();
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
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      });
    }

    // Check if user has all required permissions
    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = permissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
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
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required.',
      code: 'ADMIN_REQUIRED',
    });
  }
  next();
};

/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no token is provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      req.firebaseUser = null;
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      req.firebaseUser = null;
      req.user = null;
      return next();
    }

    const verificationResult = await verifyIdToken(token);
    
    if (verificationResult.success) {
      req.firebaseUser = verificationResult.user;
      
      try {
        const dbUser = await User.findOne({ firebaseUid: verificationResult.user.uid });
        req.user = dbUser;
      } catch (dbError) {
        req.user = null;
      }
    } else {
      req.firebaseUser = null;
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    req.firebaseUser = null;
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  requireSyncedUser,
  requirePermissions,
  requireAdmin,
  optionalAuth,
};
