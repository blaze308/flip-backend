#!/usr/bin/env node

/**
 * Setup script for AncientFlip Backend
 * This script helps initialize the backend with proper configuration
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log(`
🚀 AncientFlip Backend Setup
============================

This script will help you configure your backend server.
Make sure you have:
1. Firebase project created
2. MongoDB database ready
3. Firebase service account key

Let's get started!
  `);

  try {
    // Check if .env already exists
    if (fs.existsSync(".env")) {
      const overwrite = await question(
        "⚠️  .env file already exists. Overwrite? (y/N): "
      );
      if (overwrite.toLowerCase() !== "y") {
        console.log("Setup cancelled.");
        process.exit(0);
      }
    }

    // Collect configuration
    console.log("\n📊 Database Configuration:");
    const mongoUri =
      (await question(
        "MongoDB URI (local: mongodb://localhost:27017/ancientflip): "
      )) || "mongodb://localhost:27017/ancientflip";

    const mongoUriProd =
      (await question("MongoDB URI (production, optional): ")) || "";

    console.log("\n🔥 Firebase Configuration:");
    console.log(
      "Go to Firebase Console > Project Settings > Service Accounts > Generate New Private Key"
    );

    const firebaseProjectId = await question("Firebase Project ID: ");
    const firebasePrivateKeyId = await question("Firebase Private Key ID: ");
    const firebasePrivateKey = await question(
      "Firebase Private Key (paste the full key): "
    );
    const firebaseClientEmail = await question("Firebase Client Email: ");
    const firebaseClientId = await question("Firebase Client ID: ");

    console.log("\n🔒 Security Configuration:");
    const jwtSecret =
      (await question("JWT Secret (leave empty for auto-generated): ")) ||
      generateRandomSecret();

    const allowedOrigins =
      (await question(
        "Allowed Origins (comma-separated, default: localhost): "
      )) || "http://localhost:3000,http://localhost:8080";

    console.log("\n⚙️  Server Configuration:");
    const port = (await question("Server Port (default: 3000): ")) || "3000";
    const nodeEnv =
      (await question(
        "Environment (development/production, default: development): "
      )) || "development";

    // Create .env file
    const envContent = `# Server Configuration
PORT=${port}
NODE_ENV=${nodeEnv}

# MongoDB Configuration
MONGODB_URI=${mongoUri}
${
  mongoUriProd
    ? `MONGODB_URI_PROD=${mongoUriProd}`
    : ""
}

# Firebase Configuration
FIREBASE_PROJECT_ID=${firebaseProjectId}
FIREBASE_PRIVATE_KEY_ID=${firebasePrivateKeyId}
FIREBASE_PRIVATE_KEY="${firebasePrivateKey.replace(/\\n/g, "\\n")}"
FIREBASE_CLIENT_EMAIL=${firebaseClientEmail}
FIREBASE_CLIENT_ID=${firebaseClientId}
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
      firebaseClientEmail
    )}

# Security
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
ALLOWED_ORIGINS=${allowedOrigins}

# Logging
LOG_LEVEL=info
`;

    fs.writeFileSync(".env", envContent);

    console.log(`
✅ Configuration saved to .env

🚀 Next Steps:
1. Install dependencies: npm install
2. Start MongoDB (if local): mongod
3. Start the server: npm run dev

📱 Flutter Integration:
Update your Flutter app's backend service URL:
- Open flip/lib/services/backend_service.dart
- Change baseUrl to: http://your-server-ip:${port}

🔧 Testing:
- Health check: curl http://localhost:${port}/health
- API documentation: http://localhost:${port}

🎉 Your backend is ready to integrate with your Firebase-authenticated Flutter app!
    `);
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
  } finally {
    rl.close();
  }
}

function generateRandomSecret() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

if (require.main === module) {
  setup();
}

module.exports = { setup };
