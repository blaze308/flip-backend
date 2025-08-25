require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");

// Import configurations
const { connectDB, checkDBHealth } = require("./config/database");
const { initializeFirebase } = require("./config/firebase");

// Import middleware
const {
  generalLimiter,
  authLimiter,
  deleteLimiter,
  updateLimiter,
  securityMiddleware,
  corsOptions,
  validateRequest,
  securityHeaders,
  securityErrorHandler,
  securityLogger,
} = require("./middleware/security");

const {
  globalErrorHandler,
  notFoundHandler,
} = require("./middleware/errorHandler");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const postRoutes = require("./routes/posts");
const uploadRoutes = require("./routes/upload");

// Initialize Express app
const app = express();

// Trust proxy (important for rate limiting and IP detection)
app.set("trust proxy", 1);

// Initialize Firebase and Database
const initializeServices = async () => {
  try {
    console.log("🚀 Initializing services...");

    // Initialize Firebase Admin SDK
    initializeFirebase();

    // Connect to MongoDB
    await connectDB();

    console.log("✅ All services initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize services:", error);
    process.exit(1);
  }
};

// Security middleware (apply early)
app.use(securityHeaders);
app.use(securityLogger);
app.use(...securityMiddleware);

// CORS configuration
app.use(cors(corsOptions));

// Request parsing middleware
app.use(compression()); // Compress responses
app.use(
  express.json({
    limit: "10mb",
    strict: true,
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Request validation
app.use(validateRequest);

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Apply rate limiting
app.use(generalLimiter);

// Health check endpoint (no rate limiting)
app.get("/health", async (req, res) => {
  try {
    const dbHealth = checkDBHealth();

    res.json({
      success: true,
      message: "Server is healthy",
      data: {
        server: "running",
        database: dbHealth,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Server health check failed",
      error: error.message,
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AncientFlip API Server",
    version: "1.0.0",
    documentation: "/docs",
    health: "/health",
    endpoints: {
      auth: "/auth",
      users: "/users",
      posts: "/posts",
    },
  });
});

// API Routes with specific rate limiting
app.use("/auth", authLimiter, authRoutes);
app.use("/users/profile", updateLimiter); // Apply update limiter to profile updates
app.use("/users/account", deleteLimiter); // Apply delete limiter to account deletion
app.use("/users", userRoutes);
app.use("/posts", postRoutes);
app.use("/upload", uploadRoutes);

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));

// Security error handler (before global error handler)
app.use(securityErrorHandler);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(globalErrorHandler);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n📴 Received ${signal}. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      console.error("❌ Error during server shutdown:", err);
      process.exit(1);
    }

    console.log("✅ Server closed successfully");

    // Close database connection
    const mongoose = require("mongoose");
    mongoose.connection.close(false, () => {
      console.log("✅ Database connection closed");
      process.exit(0);
    });
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("⚠️ Forcing shutdown after timeout");
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    // Initialize services first
    await initializeServices();

    // Start the server
    const server = app.listen(PORT, HOST, () => {
      console.log(`
🚀 AncientFlip API Server Started Successfully!

📍 Server Details:
   • Environment: ${process.env.NODE_ENV || "development"}
   • Host: ${HOST}
   • Port: ${PORT}
   • URL: http://${HOST}:${PORT}

🔗 Available Endpoints:
   • Health Check: http://${HOST}:${PORT}/health
   • Authentication: http://${HOST}:${PORT}/auth
   • User Management: http://${HOST}:${PORT}/users
   • Posts: http://${HOST}:${PORT}/posts

🔒 Security Features:
   • Rate limiting enabled
   • CORS configured
   • Security headers applied
   • Request validation active
   • Firebase token verification ready

📊 Database:
   • MongoDB connected
   • Models initialized
   • Audit logging enabled

Ready to serve your Flutter app! 🎉
      `);
    });

    // Store server reference for graceful shutdown
    global.server = server;

    return server;
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
