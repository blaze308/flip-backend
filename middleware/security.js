const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

/**
 * Rate limiting configurations for different endpoint types
 */

// General API rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
    retryAfter: Math.ceil(
      (parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000
    ),
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health" || req.path === "/";
  },
});

// Strict rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per windowMs
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
    code: "AUTH_RATE_LIMIT_EXCEEDED",
    retryAfter: 900, // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Very strict rate limiting for account deletion
const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 deletion attempts per hour
  message: {
    success: false,
    message: "Too many account deletion attempts, please try again later.",
    code: "DELETE_RATE_LIMIT_EXCEEDED",
    retryAfter: 3600, // 1 hour in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate rate limiting for profile updates
const updateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 profile updates per 5 minutes
  message: {
    success: false,
    message: "Too many profile updates, please try again later.",
    code: "UPDATE_RATE_LIMIT_EXCEEDED",
    retryAfter: 300, // 5 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security middleware configuration
 */
const securityMiddleware = [
  // Helmet for various security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for API
  }),

  // Data sanitization against NoSQL query injection
  mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }) => {
      console.warn(`Sanitized key ${key} in request from ${req.ip}`);
    },
  }),

  // Data sanitization against XSS
  xss(),
];

/**
 * CORS configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : ["http://localhost:3000", "http://localhost:8080"];

    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      process.env.NODE_ENV === "development"
    ) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "X-API-Key",
  ],
  exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
  maxAge: 86400, // 24 hours
};

/**
 * Request validation middleware
 */
const validateRequest = (req, res, next) => {
  // Check for required headers
  const contentType = req.get("Content-Type");

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    // Allow multipart/form-data for upload endpoints ONLY (not stories - stories can be JSON or multipart)
    const isUploadEndpoint = req.path.startsWith("/upload");
    const isMultipart =
      contentType && contentType.includes("multipart/form-data");
    const isJson = contentType && contentType.includes("application/json");

    if (!isUploadEndpoint && !isMultipart && !isJson) {
      return res.status(400).json({
        success: false,
        message: "Content-Type must be application/json",
        code: "INVALID_CONTENT_TYPE",
      });
    }

    if (isUploadEndpoint && !isMultipart) {
      return res.status(400).json({
        success: false,
        message: "Content-Type must be multipart/form-data for file uploads",
        code: "INVALID_CONTENT_TYPE",
      });
    }
  }

  // Check request size (different limits for uploads vs regular requests)
  const contentLength = req.get("Content-Length");
  const isUploadEndpoint = req.path.startsWith("/upload");
  const maxSize = isUploadEndpoint ? 100 * 1024 * 1024 : 10 * 1024 * 1024; // 100MB for uploads, 10MB for regular

  if (contentLength && parseInt(contentLength) > maxSize) {
    return res.status(413).json({
      success: false,
      message: `Request entity too large. Maximum size: ${
        maxSize / (1024 * 1024)
      }MB`,
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader("X-Powered-By");

  // Add custom security headers
  res.setHeader("X-API-Version", "1.0");
  res.setHeader("X-Request-ID", req.id || Date.now().toString());

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  next();
};

/**
 * Error handling middleware for security-related errors
 */
const securityErrorHandler = (error, req, res, next) => {
  // Handle CORS errors
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy violation",
      code: "CORS_ERROR",
    });
  }

  // Handle rate limit errors
  if (error.status === 429) {
    return res.status(429).json({
      success: false,
      message: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: error.retryAfter,
    });
  }

  // Handle payload too large errors
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request payload too large",
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  // Handle malformed JSON
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
      code: "INVALID_JSON",
    });
  }

  next(error);
};

/**
 * IP whitelist middleware (for admin endpoints)
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;

    if (allowedIPs.length === 0 || allowedIPs.includes(clientIP)) {
      return next();
    }

    console.warn(`IP whitelist violation from ${clientIP}`);
    return res.status(403).json({
      success: false,
      message: "Access denied from this IP address",
      code: "IP_NOT_ALLOWED",
    });
  };
};

/**
 * Request logging for security monitoring
 */
const securityLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
  ];

  const url = req.originalUrl || req.url;
  const body = JSON.stringify(req.body);
  const query = JSON.stringify(req.query);

  const isSuspicious = suspiciousPatterns.some(
    (pattern) => pattern.test(url) || pattern.test(body) || pattern.test(query)
  );

  if (isSuspicious) {
    console.warn(`🚨 Suspicious request detected:`, {
      ip: req.ip,
      method: req.method,
      url: url,
      userAgent: req.get("User-Agent"),
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString(),
    });
  }

  // Log response time and status
  res.on("finish", () => {
    const duration = Date.now() - startTime;

    if (res.statusCode >= 400 || duration > 5000) {
      console.log(
        `${req.method} ${url} - ${res.statusCode} - ${duration}ms - ${req.ip}`
      );
    }
  });

  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  deleteLimiter,
  updateLimiter,
  securityMiddleware,
  corsOptions,
  validateRequest,
  securityHeaders,
  securityErrorHandler,
  ipWhitelist,
  securityLogger,
};
