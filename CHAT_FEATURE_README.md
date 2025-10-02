# Chat Feature Backend Implementation

## 🚀 Overview

The chat feature backend has been successfully implemented with comprehensive support for:

- **Text Messages**: Rich text messaging with mentions and formatting
- **Media Messages**: Images, videos, audio files
- **Special Files**: Lottie animations and SVGA files
- **Location Sharing**: GPS coordinates with address information
- **Contact Sharing**: Contact card sharing
- **Real-time Communication**: Socket.IO powered live messaging
- **Message Reactions**: Emoji reactions to messages
- **Read Receipts**: Message delivery and read status tracking
- **Typing Indicators**: Real-time typing status
- **File Uploads**: Cloudinary integration for all media types

## 📁 New Files Created

### Models

- `backend/models/Chat.js` - Chat schema with support for direct and group chats
- `backend/models/Message.js` - Message schema with all media types and features

### Routes

- `backend/routes/chats.js` - Complete REST API for chat operations

### Configuration

- `backend/config/socket.js` - Socket.IO setup and real-time event handlers

### Middleware

- `backend/middleware/chatMiddleware.js` - Chat-specific validation and rate limiting

### Updated Files

- `backend/server.js` - Integrated chat routes and Socket.IO
- `backend/config/cloudinary.js` - Extended for lottie/svga file support
- `backend/package.json` - Added Socket.IO dependency

## 🔗 API Endpoints

### Chat Management

```
GET    /api/chats                    - Get user's chats
GET    /api/chats/:chatId            - Get specific chat details
POST   /api/chats                    - Create new chat (direct/group)
```

### Message Operations

```
GET    /api/chats/:chatId/messages   - Get chat messages
POST   /api/chats/:chatId/messages   - Send message
PUT    /api/chats/:chatId/messages/:messageId/read - Mark as read
```

### Message Reactions

```
POST   /api/chats/:chatId/messages/:messageId/reactions - Add reaction
DELETE /api/chats/:chatId/messages/:messageId/reactions - Remove reaction
```

## 📱 Message Types Supported

### 1. Text Messages

```json
{
  "type": "text",
  "content": "Hello world! @username #hashtag"
}
```

### 2. Image Messages

```json
{
  "type": "image",
  "content": "Optional caption"
}
```

**Supported formats**: JPEG, PNG, GIF, WebP, SVG
**Max size**: 10MB

### 3. Video Messages

```json
{
  "type": "video",
  "content": "Optional caption"
}
```

**Supported formats**: MP4, MPEG, QuickTime, AVI, WebM
**Max size**: 100MB

### 4. Audio Messages

```json
{
  "type": "audio"
}
```

**Supported formats**: MP3, WAV, OGG, AAC, WebM
**Max size**: 25MB

### 5. Lottie Animations

```json
{
  "type": "lottie"
}
```

**Supported formats**: JSON files with Lottie animation data
**Max size**: 5MB

### 6. SVGA Animations

```json
{
  "type": "svga"
}
```

**Supported formats**: SVGA binary files
**Max size**: 10MB

### 7. Location Messages

```json
{
  "type": "location",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "address": "San Francisco, CA",
    "name": "Golden Gate Bridge"
  }
}
```

### 8. Contact Messages

```json
{
  "type": "contact",
  "contact": {
    "name": "John Doe",
    "phoneNumber": "+1234567890",
    "email": "john@example.com",
    "avatar": "https://example.com/avatar.jpg"
  }
}
```

### 9. File Messages

```json
{
  "type": "file"
}
```

**Supported formats**: Any file type
**Max size**: 50MB

## 🔄 Real-time Events (Socket.IO)

### Client → Server Events

```javascript
// Join a chat room
socket.emit("join_chat", chatId);

// Leave a chat room
socket.emit("leave_chat", chatId);

// Typing indicators
socket.emit("typing_start", { chatId });
socket.emit("typing_stop", { chatId });

// Message status updates
socket.emit("message_delivered", { messageId, chatId });
socket.emit("message_read", { messageId, chatId });
socket.emit("mark_chat_read", { chatId });

// Presence updates
socket.emit("update_presence", { status: "online" });
```

### Server → Client Events

```javascript
// New message received
socket.on("new_message", (data) => {
  // data.message contains the full message object
});

// Message updates (reactions, edits, etc.)
socket.on("message_update", (data) => {
  // data: { messageId, updateType, data, timestamp }
});

// Chat updates (member changes, settings, etc.)
socket.on("chat_update", (data) => {
  // data: { chatId, updateType, data, timestamp }
});

// User status updates
socket.on("user_online", (data) => {
  // data: { userId, username, displayName }
});

socket.on("user_offline", (data) => {
  // data: { userId, username, lastSeen }
});

// Typing indicators
socket.on("user_typing", (data) => {
  // data: { userId, username, displayName, chatId }
});

socket.on("user_stopped_typing", (data) => {
  // data: { userId, username, chatId }
});

// Read receipts
socket.on("message_read_update", (data) => {
  // data: { messageId, readBy, username }
});

socket.on("chat_read_update", (data) => {
  // data: { chatId, readBy, username, messageCount }
});
```

## 🔒 Security Features

### Rate Limiting

- **Message sending**: 30 messages per minute per user
- **Chat creation**: 10 chats per 5 minutes per user
- **File uploads**: 10 uploads per minute per user

### Validation

- Message content sanitization (XSS protection)
- File type validation based on message type
- File size limits per message type
- Coordinate validation for location messages
- Input length limits and format validation

### Authentication

- Firebase token verification for all endpoints
- Socket.IO authentication middleware
- User membership verification for chat access

## 📊 Database Schema

### Chat Collection

```javascript
{
  _id: ObjectId,
  type: "direct" | "group",
  name: String, // Required for group chats
  description: String,
  avatar: String,
  members: [{
    userId: ObjectId,
    firebaseUid: String,
    username: String,
    displayName: String,
    avatar: String,
    role: "admin" | "moderator" | "member",
    joinedAt: Date,
    lastSeenAt: Date,
    isActive: Boolean,
    notifications: {
      enabled: Boolean,
      sound: Boolean,
      vibration: Boolean
    }
  }],
  createdBy: ObjectId,
  status: "active" | "archived" | "deleted",
  lastMessage: {
    messageId: ObjectId,
    content: String,
    type: String,
    senderId: ObjectId,
    senderName: String,
    timestamp: Date
  },
  messageCount: Number,
  settings: {
    whoCanAddMembers: "admin" | "moderator" | "all",
    whoCanEditInfo: "admin" | "moderator" | "all",
    whoCanSendMessages: "admin" | "moderator" | "all",
    maxMembers: Number,
    autoDeleteMessages: {
      enabled: Boolean,
      duration: Number // hours
    }
  },
  participants: [ObjectId], // For direct chats
  createdAt: Date,
  updatedAt: Date
}
```

### Message Collection

```javascript
{
  _id: ObjectId,
  chatId: ObjectId,
  senderId: ObjectId,
  senderFirebaseUid: String,
  senderName: String,
  senderAvatar: String,
  type: "text" | "image" | "video" | "audio" | "lottie" | "svga" | "file" | "location" | "contact" | "system",
  content: String,
  media: {
    url: String,
    thumbnailUrl: String,
    fileName: String,
    fileSize: Number,
    mimeType: String,
    duration: Number,
    dimensions: { width: Number, height: Number },
    lottieData: Object, // For lottie files
    svgaData: Object    // For svga files
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    name: String
  },
  contact: {
    name: String,
    phoneNumber: String,
    email: String,
    avatar: String
  },
  status: "sent" | "delivered" | "read" | "failed",
  reactions: [{
    userId: ObjectId,
    username: String,
    emoji: String,
    createdAt: Date
  }],
  replyTo: {
    messageId: ObjectId,
    senderId: ObjectId,
    senderName: String,
    content: String,
    type: String,
    timestamp: Date
  },
  readBy: [{
    userId: ObjectId,
    username: String,
    readAt: Date
  }],
  deliveredTo: [{
    userId: ObjectId,
    username: String,
    deliveredAt: Date
  }],
  mentions: [{
    userId: ObjectId,
    username: String,
    startIndex: Number,
    length: Number
  }],
  isEdited: Boolean,
  editedAt: Date,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedFor: [ObjectId],
  priority: "low" | "normal" | "high" | "urgent",
  expiresAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## 🚀 Getting Started

### 1. Environment Variables

Add to your `.env` file:

```env
# Existing variables...

# Socket.IO (optional)
FRONTEND_URL=http://localhost:3000
```

### 2. Start the Server

```bash
cd backend
npm install
npm run dev
```

### 3. Test the API

The server will start with chat endpoints available at:

- Base URL: `http://localhost:3000/api/chats`
- Socket.IO: `ws://localhost:3000`

### 4. Socket.IO Connection (Client)

```javascript
import io from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: {
    token: "your-firebase-token",
  },
});

// Join a chat
socket.emit("join_chat", "chat-id");

// Listen for new messages
socket.on("new_message", (data) => {
  console.log("New message:", data.message);
});
```

## 🔧 Maintenance

### Automatic Cleanup

The server automatically runs cleanup tasks every hour to:

- Remove expired messages (if auto-delete is enabled)
- Clean up expired stories
- Maintain database performance

### Manual Cleanup

```javascript
// Clean expired messages
await Message.cleanupExpiredMessages();

// Clean expired stories
await Story.cleanupExpiredStories();
```

## 📈 Performance Considerations

### Indexing

The following indexes are automatically created:

- Chat queries: `{ "members.userId": 1, status: 1 }`
- Message queries: `{ chatId: 1, createdAt: -1 }`
- Search queries: Text index on message content
- Real-time queries: `{ chatId: 1, isDeleted: 1, createdAt: -1 }`

### File Storage

- All media files are stored in Cloudinary
- Automatic optimization and compression
- CDN delivery for global performance
- Thumbnail generation for videos

### Socket.IO Optimization

- Room-based message broadcasting
- Connection pooling and management
- Automatic reconnection handling
- Presence management

## 🐛 Troubleshooting

### Common Issues

1. **Socket.IO Connection Failed**

   - Check Firebase token validity
   - Verify CORS settings
   - Ensure user exists in database

2. **File Upload Errors**

   - Check file size limits
   - Verify MIME type support
   - Confirm Cloudinary configuration

3. **Message Not Delivered**
   - Verify user is chat member
   - Check rate limiting
   - Validate message content

### Debug Mode

Enable debug logging:

```bash
DEBUG=socket.io* npm run dev
```

## 🎯 Next Steps

The chat feature backend is now complete and ready for integration with your Flutter mobile app. Key integration points:

1. **Authentication**: Use Firebase tokens for API and Socket.IO
2. **File Uploads**: Implement multipart form data for media messages
3. **Real-time**: Connect to Socket.IO for live messaging
4. **UI Components**: Build chat interfaces using the provided API
5. **Push Notifications**: Integrate with Firebase Cloud Messaging

The backend provides a solid foundation for a modern, feature-rich chat system with support for all major message types and real-time communication features.
