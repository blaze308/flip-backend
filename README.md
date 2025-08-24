# AncientFlip Backend API

A production-ready Node.js/Express backend with Firebase Authentication integration for the AncientFlip Flutter mobile app.

## 🚀 Features

- **Firebase Authentication Integration**: Complete Firebase Admin SDK setup with token verification
- **MongoDB Database**: Comprehensive user management with audit logging
- **Security First**: Rate limiting, CORS, input validation, and security headers
- **Account Linking**: Intelligent handling of multiple auth providers for same email
- **Session Management**: Track user sessions across devices
- **Audit Logging**: Complete activity tracking for security and compliance
- **Production Ready**: Error handling, graceful shutdown, and monitoring

## 📁 Project Structure

```
backend/
├── config/
│   ├── database.js          # MongoDB connection and health checks
│   └── firebase.js          # Firebase Admin SDK configuration
├── middleware/
│   ├── auth.js              # Firebase token verification middleware
│   ├── errorHandler.js      # Global error handling
│   └── security.js          # Security middleware and rate limiting
├── models/
│   ├── User.js              # User schema with comprehensive profile data
│   ├── Session.js           # Session tracking for security
│   └── AuditLog.js          # Activity logging for compliance
├── routes/
│   ├── auth.js              # Authentication endpoints
│   └── users.js             # User management endpoints
├── .env.example             # Environment variables template
├── package.json             # Dependencies and scripts
└── server.js                # Main application entry point
```

## 🔧 Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Configuration

Copy the environment template and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/ancientflip

# Firebase Configuration (from Firebase Console)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
# ... (see .env.example for all required Firebase fields)

# Security
JWT_SECRET=your-super-secret-jwt-key-here
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### 3. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Copy the values to your `.env` file

### 4. MongoDB Setup

**Local MongoDB:**

```bash
# Install MongoDB locally or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

**MongoDB Atlas (Recommended for production):**

1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a cluster
3. Get connection string and add to `MONGODB_URI_PROD`

### 5. Start the Server

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

## 📡 API Endpoints

### Authentication Endpoints

#### POST `/auth/sync-user`

Synchronize user data between Firebase and database. Call this after Firebase authentication.

**Headers:**

```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Body:**

```json
{
  "deviceInfo": {
    "deviceType": "ios",
    "deviceId": "unique-device-id",
    "deviceName": "iPhone 15 Pro",
    "appVersion": "1.0.0"
  },
  "forceUpdate": false
}
```

**Response:**

```json
{
  "success": true,
  "message": "User profile synced successfully",
  "data": {
    "user": {
      "id": "user-id",
      "firebaseUid": "firebase-uid",
      "email": "user@example.com",
      "displayName": "John Doe",
      "providers": ["password", "google.com"],
      "profile": { ... },
      "subscription": { ... }
    },
    "isNewUser": false,
    "sessionId": "session-id"
  }
}
```

#### GET `/auth/verify`

Check if user exists in database.

**Headers:**

```
Authorization: Bearer <firebase-id-token>
```

**Response:**

```json
{
  "success": true,
  "message": "User verified",
  "data": {
    "user": { ... },
    "syncRequired": false
  }
}
```

### User Management Endpoints

#### GET `/users/profile`

Get complete user profile.

#### PUT `/users/profile`

Update user profile information.

**Body:**

```json
{
  "displayName": "New Display Name",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "bio": "Software developer",
    "preferences": {
      "language": "en",
      "notifications": {
        "email": true,
        "push": true,
        "sms": false
      }
    }
  }
}
```

#### DELETE `/users/account`

Delete user account permanently.

**Body:**

```json
{
  "confirmDeletion": "DELETE_MY_ACCOUNT"
}
```

#### GET `/users/sessions`

Get user's active sessions.

#### DELETE `/users/sessions/:sessionId`

End a specific session.

#### GET `/users/audit-logs`

Get user's activity logs.

## 🔒 Security Features

### Rate Limiting

- **General API**: 100 requests per 15 minutes
- **Authentication**: 20 requests per 15 minutes
- **Profile Updates**: 10 requests per 5 minutes
- **Account Deletion**: 3 requests per hour

### Security Headers

- Helmet.js for security headers
- CORS configuration
- XSS protection
- NoSQL injection prevention
- Request size limits

### Authentication

- Firebase ID token verification
- Automatic token validation
- Session tracking
- Device management

## 🔗 Flutter Integration

### 1. Update Flutter HTTP Service

```dart
class ApiService {
  static const String baseUrl = 'http://your-server:3000';

  static Future<Map<String, String>> _getHeaders() async {
    final user = FirebaseAuth.instance.currentUser;
    final token = await user?.getIdToken();

    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> syncUser({
    required Map<String, dynamic> deviceInfo,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/sync-user'),
      headers: await _getHeaders(),
      body: json.encode({'deviceInfo': deviceInfo}),
    );

    return json.decode(response.body);
  }
}
```

### 2. Call Sync After Firebase Auth

```dart
// After successful Firebase authentication
final result = await FirebaseAuthService.signInWithEmailAndPassword(
  email: email,
  password: password,
);

if (result.success) {
  // Sync with backend
  await ApiService.syncUser(
    deviceInfo: {
      'deviceType': Platform.isIOS ? 'ios' : 'android',
      'deviceId': await _getDeviceId(),
      'appVersion': await _getAppVersion(),
    },
  );
}
```

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
MONGODB_URI_PROD=mongodb+srv://...
FIREBASE_PROJECT_ID=your-production-project
# ... other production values
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Health Monitoring

The server provides a health check endpoint at `/health`:

```json
{
  "success": true,
  "message": "Server is healthy",
  "data": {
    "server": "running",
    "database": {
      "status": "connected",
      "host": "localhost",
      "name": "ancientflip"
    },
    "uptime": 3600,
    "memory": { ... },
    "version": "1.0.0"
  }
}
```

## 📊 Database Schema

### User Model

- Firebase UID (unique identifier)
- Profile information (name, email, phone, photo)
- Authentication providers
- Preferences and settings
- Subscription information
- Activity statistics

### Session Model

- User session tracking
- Device information
- IP address and location
- Session duration and activity

### Audit Log Model

- User action logging
- Security event tracking
- Error logging
- Compliance data

## 🔧 Development

### Scripts

```bash
npm run dev      # Development with nodemon
npm start        # Production server
npm test         # Run tests
npm run lint     # ESLint checking
npm run lint:fix # Fix ESLint issues
```

### Testing

```bash
npm test
```

## 📝 License

MIT License - see LICENSE file for details.

---

## 🆘 Support

For issues and questions:

1. Check the logs: `tail -f logs/app.log`
2. Verify environment variables
3. Check Firebase configuration
4. Ensure MongoDB connection
5. Review rate limiting settings

The backend is designed to integrate seamlessly with your Firebase-authenticated Flutter app while providing enterprise-grade security and monitoring capabilities.
# flip-backend
