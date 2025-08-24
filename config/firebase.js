const admin = require("firebase-admin");

/**
 * Initialize Firebase Admin SDK
 * This allows us to verify Firebase ID tokens sent from the Flutter app
 */
const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length === 0) {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI,
        token_uri: process.env.FIREBASE_TOKEN_URI,
        auth_provider_x509_cert_url:
          process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });

      console.log("✅ Firebase Admin SDK initialized successfully");
    }
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin SDK:", error.message);
    process.exit(1);
  }
};

/**
 * Verify Firebase ID Token
 * @param {string} idToken - Firebase ID token from Flutter app
 * @returns {Promise<Object>} - Decoded token with user information
 */
const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return {
      success: true,
      user: decodedToken,
    };
  } catch (error) {
    console.error("Token verification error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get user data from Firebase Auth
 * @param {string} uid - Firebase user UID
 * @returns {Promise<Object>} - Firebase user record
 */
const getFirebaseUser = async (uid) => {
  try {
    const userRecord = await admin.auth().getUser(uid);
    return {
      success: true,
      user: userRecord,
    };
  } catch (error) {
    console.error("Error fetching Firebase user:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete user from Firebase Auth
 * @param {string} uid - Firebase user UID
 * @returns {Promise<Object>} - Success/error result
 */
const deleteFirebaseUser = async (uid) => {
  try {
    await admin.auth().deleteUser(uid);
    return {
      success: true,
      message: "User deleted from Firebase Auth",
    };
  } catch (error) {
    console.error("Error deleting Firebase user:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  initializeFirebase,
  verifyIdToken,
  getFirebaseUser,
  deleteFirebaseUser,
  admin,
};
