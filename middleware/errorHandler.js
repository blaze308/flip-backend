const AuditLog = require('../models/AuditLog');

/**
 * Global error handling middleware
 * This should be the last middleware in the chain
 */
const globalErrorHandler = async (error, req, res, next) => {
  console.error('Global error handler:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });

  // Log critical errors to audit log
  if (req.user || req.firebaseUser) {
    try {
      await AuditLog.logAction({
        userId: req.user?._id,
        firebaseUid: req.firebaseUser?.uid,
        action: 'error',
        success: false,
        errorMessage: error.message,
        details: {
          url: req.originalUrl,
          method: req.method,
          statusCode: error.statusCode || 500,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
    } catch (logError) {
      console.error('Failed to log error to audit log:', logError);
    }
  }

  // Default error response
  let statusCode = error.statusCode || 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    code = 'INVALID_ID';
  } else if (error.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
    code = 'DUPLICATE_ENTRY';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  } else if (error.name === 'MongooseError') {
    statusCode = 500;
    message = 'Database error';
    code = 'DATABASE_ERROR';
  }

  // Send error response
  const errorResponse = {
    success: false,
    message,
    code,
    timestamp: new Date().toISOString(),
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error = error.message;
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error class for API errors
 */
class APIError extends Error {
  constructor(message, statusCode = 500, code = 'API_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'APIError';
  }
}

/**
 * Error response helper
 */
const sendErrorResponse = (res, statusCode, message, code = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    code: code || `ERROR_${statusCode}`,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  APIError,
  sendErrorResponse,
};
