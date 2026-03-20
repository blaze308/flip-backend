const Notification = require("../models/Notification");
const User = require("../models/User");

/**
 * Create in-app notification (persisted to DB for notification center)
 * Does not throw - logs errors so main flow isn't broken
 */
async function createNotification({
  userId,
  type,
  title,
  body = "",
  data = {},
}) {
  try {
    if (!userId || !type || !title) {
      console.warn("[NotificationService] Missing required fields:", { userId, type, title });
      return null;
    }

    const notification = await Notification.create({
      userId,
      type,
      title,
      body,
      data,
    });

    return notification;
  } catch (error) {
    console.error("[NotificationService] createNotification error:", error.message);
    return null;
  }
}

/**
 * Notify user when their post is liked
 */
async function notifyPostLiked({ postId, postAuthorId, likerId, likerName }) {
  if (postAuthorId.toString() === likerId.toString()) return null;

  await createNotification({
    userId: postAuthorId,
    type: "like",
    title: "New like",
    body: `${likerName || "Someone"} liked your post`,
    data: { postId, likerId },
  });
}

/**
 * Notify user when their post is commented on
 */
async function notifyPostCommented({ postId, postAuthorId, commenterId, commenterName, commentPreview }) {
  if (postAuthorId.toString() === commenterId.toString()) return null;

  await createNotification({
    userId: postAuthorId,
    type: "comment",
    title: "New comment",
    body: `${commenterName || "Someone"} commented: ${(commentPreview || "").slice(0, 50)}${(commentPreview || "").length > 50 ? "..." : ""}`,
    data: { postId, commenterId },
  });
}

/**
 * Notify user when someone follows them
 */
async function notifyNewFollower({ followedUserId, followerId, followerName }) {
  if (followedUserId.toString() === followerId.toString()) return null;

  await createNotification({
    userId: followedUserId,
    type: "follow",
    title: "New follower",
    body: `${followerName || "Someone"} started following you`,
    data: { followerId },
  });
}

/**
 * Notify user when they receive a gift
 */
async function notifyGiftReceived({ receiverId, senderId, senderName, giftName, quantity }) {
  if (receiverId.toString() === senderId.toString()) return null;

  await createNotification({
    userId: receiverId,
    type: "gift",
    title: "Gift received",
    body: `${senderName || "Someone"} sent you ${quantity > 1 ? `${quantity}x ` : ""}${giftName || "a gift"}`,
    data: { senderId, giftName, quantity },
  });
}

/**
 * Notify user when they receive a new chat message
 */
async function notifyNewChatMessage({ recipientId, senderId, senderName, chatId, messagePreview }) {
  if (recipientId.toString() === senderId.toString()) return null;

  await createNotification({
    userId: recipientId,
    type: "chat",
    title: senderName || "New message",
    body: messagePreview ? `${(messagePreview || "").slice(0, 50)}${(messagePreview || "").length > 50 ? "..." : ""}` : "You have a new message",
    data: { senderId, chatId },
  });
}

module.exports = {
  createNotification,
  notifyPostLiked,
  notifyPostCommented,
  notifyNewFollower,
  notifyGiftReceived,
  notifyNewChatMessage,
};
