const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const User = require("../models/User");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

/**
 * Socket.IO Configuration and Event Handlers
 * Handles real-time messaging functionality
 */

let io;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error("Authentication token required"));
      }

      // Verify Firebase token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Get user from database
      const user = await User.findOne({ firebaseUid: decodedToken.uid });
      if (!user) {
        return next(new Error("User not found"));
      }

      // Attach user data to socket
      socket.userId = user._id.toString();
      socket.firebaseUid = decodedToken.uid;
      socket.username = user.username;
      socket.displayName = user.displayName || user.username;

      console.log(`🔌 User ${socket.username} connected via Socket.IO`);
      next();
    } catch (error) {
      console.error("Socket authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  // Handle socket connections
  io.on("connection", (socket) => {
    console.log(`✅ Socket connected: ${socket.id} (User: ${socket.username})`);

    // Join user to their personal room for notifications
    socket.join(`user_${socket.userId}`);

    // Handle joining chat rooms
    socket.on("join_chat", async (chatId) => {
      try {
        // Verify user is a member of this chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isMember(socket.userId)) {
          socket.emit("error", { message: "You are not a member of this chat" });
          return;
        }

        socket.join(`chat_${chatId}`);
        console.log(`📱 User ${socket.username} joined chat ${chatId}`);

        // Update user's last seen in chat
        await chat.updateLastSeen(socket.userId);

        // Notify other members that user is online
        socket.to(`chat_${chatId}`).emit("user_online", {
          userId: socket.userId,
          username: socket.username,
          displayName: socket.displayName,
        });

        socket.emit("joined_chat", { chatId });
      } catch (error) {
        console.error("Error joining chat:", error);
        socket.emit("error", { message: "Failed to join chat" });
      }
    });

    // Handle leaving chat rooms
    socket.on("leave_chat", async (chatId) => {
      try {
        socket.leave(`chat_${chatId}`);
        console.log(`📱 User ${socket.username} left chat ${chatId}`);

        // Notify other members that user went offline
        socket.to(`chat_${chatId}`).emit("user_offline", {
          userId: socket.userId,
          username: socket.username,
        });

        socket.emit("left_chat", { chatId });
      } catch (error) {
        console.error("Error leaving chat:", error);
        socket.emit("error", { message: "Failed to leave chat" });
      }
    });

    // Handle typing indicators
    socket.on("typing_start", (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit("user_typing", {
        userId: socket.userId,
        username: socket.username,
        displayName: socket.displayName,
        chatId,
      });
    });

    socket.on("typing_stop", (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit("user_stopped_typing", {
        userId: socket.userId,
        username: socket.username,
        chatId,
      });
    });

    // Handle message delivery confirmation
    socket.on("message_delivered", async (data) => {
      try {
        const { messageId, chatId } = data;
        
        const message = await Message.findById(messageId);
        if (message && message.chatId.toString() === chatId) {
          await message.markAsDelivered(socket.userId, socket.username);
          
          // Notify sender about delivery
          socket.to(`chat_${chatId}`).emit("message_delivery_update", {
            messageId,
            deliveredTo: socket.userId,
            username: socket.username,
          });
        }
      } catch (error) {
        console.error("Error marking message as delivered:", error);
      }
    });

    // Handle message read confirmation
    socket.on("message_read", async (data) => {
      try {
        const { messageId, chatId } = data;
        
        const message = await Message.findById(messageId);
        if (message && message.chatId.toString() === chatId) {
          await message.markAsRead(socket.userId, socket.username);
          
          // Notify sender about read receipt
          socket.to(`chat_${chatId}`).emit("message_read_update", {
            messageId,
            readBy: socket.userId,
            username: socket.username,
          });
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    // Handle bulk message read (when user opens chat)
    socket.on("mark_chat_read", async (data) => {
      try {
        const { chatId } = data;
        
        // Get all unread messages in this chat
        const unreadMessages = await Message.find({
          chatId,
          isDeleted: false,
          deletedFor: { $ne: socket.userId },
          senderId: { $ne: socket.userId },
          "readBy.userId": { $ne: socket.userId },
        });

        // Mark all as read
        const updatePromises = unreadMessages.map(message => 
          message.markAsRead(socket.userId, socket.username)
        );
        
        await Promise.all(updatePromises);

        // Notify other chat members
        if (unreadMessages.length > 0) {
          socket.to(`chat_${chatId}`).emit("chat_read_update", {
            chatId,
            readBy: socket.userId,
            username: socket.username,
            messageCount: unreadMessages.length,
          });
        }

        socket.emit("chat_marked_read", { chatId, messageCount: unreadMessages.length });
      } catch (error) {
        console.error("Error marking chat as read:", error);
        socket.emit("error", { message: "Failed to mark chat as read" });
      }
    });

    // Handle user presence updates
    socket.on("update_presence", (data) => {
      const { status } = data; // online, away, busy, offline
      
      // Broadcast presence update to all user's chats
      socket.broadcast.emit("user_presence_update", {
        userId: socket.userId,
        username: socket.username,
        status,
        lastSeen: new Date(),
      });
    });

    // Handle disconnection
    socket.on("disconnect", async (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id} (User: ${socket.username}) - Reason: ${reason}`);

      try {
        // Update user's last seen in all their chats
        const userChats = await Chat.findActiveChatsForUser(socket.userId);
        const updatePromises = userChats.map(chat => chat.updateLastSeen(socket.userId));
        await Promise.all(updatePromises);

        // Notify all chat members that user went offline
        userChats.forEach(chat => {
          socket.to(`chat_${chat._id}`).emit("user_offline", {
            userId: socket.userId,
            username: socket.username,
            lastSeen: new Date(),
          });
        });
      } catch (error) {
        console.error("Error handling socket disconnect:", error);
      }
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error(`Socket error for user ${socket.username}:`, error);
    });
  });

  console.log("🔌 Socket.IO initialized successfully");
  return io;
};

// Helper functions to emit events from other parts of the application

const emitToChat = (chatId, event, data) => {
  if (io) {
    io.to(`chat_${chatId}`).emit(event, data);
  }
};

const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

const emitNewMessage = (message) => {
  if (io) {
    io.to(`chat_${message.chatId}`).emit("new_message", {
      message: message.toJSON(),
      timestamp: new Date(),
    });
  }
};

const emitMessageUpdate = (messageId, chatId, updateType, data) => {
  if (io) {
    io.to(`chat_${chatId}`).emit("message_update", {
      messageId,
      updateType, // 'edited', 'deleted', 'reaction_added', 'reaction_removed'
      data,
      timestamp: new Date(),
    });
  }
};

const emitChatUpdate = (chatId, updateType, data) => {
  if (io) {
    io.to(`chat_${chatId}`).emit("chat_update", {
      chatId,
      updateType, // 'member_added', 'member_removed', 'info_updated', 'settings_changed'
      data,
      timestamp: new Date(),
    });
  }
};

// Get online users count
const getOnlineUsersCount = () => {
  return io ? io.engine.clientsCount : 0;
};

// Get users in a specific chat room
const getUsersInChat = (chatId) => {
  if (!io) return [];
  
  const room = io.sockets.adapter.rooms.get(`chat_${chatId}`);
  return room ? Array.from(room) : [];
};

module.exports = {
  initializeSocket,
  emitToChat,
  emitToUser,
  emitNewMessage,
  emitMessageUpdate,
  emitChatUpdate,
  getOnlineUsersCount,
  getUsersInChat,
};
