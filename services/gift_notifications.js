const { emitToUser } = require("../config/socket");

/**
 * Gift Notifications Service
 * Handles broadcasting gift events to users and live rooms
 */

/**
 * Notify a user and/or live stream about a sent gift
 * @param {Object} giftData - Data about the gift and transaction
 * @param {Object} sender - Sender user object
 * @param {Object} receiver - Receiver user object
 * @param {string} context - 'live', 'chat', 'profile', 'post'
 * @param {string} contextId - ID of the context (e.g., liveStreamId)
 */
const notifyGiftSent = (giftData, sender, receiver, context, contextId) => {
    const socketConfig = require("../config/socket");
    const io = socketConfig.io; // This might be null if not initialized yet, but in practice it will be there

    const notification = {
        type: "gift_received",
        gift: {
            id: giftData.giftId,
            name: giftData.giftName,
            icon: giftData.giftIcon,
            animation: giftData.animation,
            coins: giftData.coins,
        },
        sender: {
            userId: sender._id.toString(),
            displayName: sender.displayName,
            photoURL: sender.photoURL,
            username: sender.username,
            isMVP: sender.gamification?.isMVP || false,
        },
        receiver: {
            userId: receiver._id.toString(),
            displayName: receiver.displayName,
        },
        quantity: giftData.quantity || 1,
        context: context,
        contextId: contextId,
        timestamp: new Date(),
    };

    // 1. Notify the receiver personally
    socketConfig.emitToUser(receiver._id.toString(), "gift_received", notification);

    // 2. If in a live stream, broadcast to the entire room for animations
    if (context === "live" && contextId && socketConfig.getOnlineUsersCount() > 0) {
        const liveRoom = `live:${contextId}`;
        try {
            // Direct access to io if needed for room broadcast
            const io = require("../server").get("io");
            if (io) {
                io.to(liveRoom).emit("live:gift:sent", notification);
                console.log(`🎥 Broadcasted gift to live room ${liveRoom}`);
            }
        } catch (err) {
            console.error("Error broadcasting gift to live room:", err);
        }
    }

    // 3. Log high-value gifts specifically
    if (giftData.coins >= 1000) {
        console.log(`💎 High value gift sent! ${notification.sender.displayName} → ${notification.receiver.displayName} (${giftData.coins} coins)`);
    }
};

module.exports = {
    notifyGiftSent,
};
