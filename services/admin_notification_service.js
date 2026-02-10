const axios = require("axios");
const { sendHtmlEmail } = require("../config/email");

/**
 * Admin Notification Service
 * Sends notifications to admins when important events occur (user blocking, reports, etc.)
 */

/**
 * Send notification to admin about user blocking
 * @param {Object} blocker - User who blocked
 * @param {Object} blockedUser - User who was blocked
 */
const notifyUserBlocked = async (blocker, blockedUser) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "ancientsflip@gmail.com";
    const adminWebhookUrl = process.env.ADMIN_WEBHOOK_URL;

    const notificationData = {
      event: "user_blocked",
      timestamp: new Date().toISOString(),
      blocker: {
        id: blocker._id.toString(),
        displayName: blocker.displayName || blocker.email || "Unknown",
        email: blocker.email,
        username: blocker.profile?.username,
      },
      blockedUser: {
        id: blockedUser._id.toString(),
        displayName: blockedUser.displayName || blockedUser.email || "Unknown",
        email: blockedUser.email,
        username: blockedUser.profile?.username,
      },
      message: `User ${blocker.displayName || blocker.email} blocked user ${blockedUser.displayName || blockedUser.email}`,
    };

    // Log to console (always)
    console.log(`[ADMIN NOTIFICATION] User Blocked:`, JSON.stringify(notificationData, null, 2));

    // Send webhook if configured
    if (adminWebhookUrl) {
      try {
        await axios.post(adminWebhookUrl, notificationData, {
          timeout: 5000,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "AncientFlip-Backend/1.0",
          },
        });
        console.log(`[ADMIN NOTIFICATION] Webhook sent successfully`);
      } catch (webhookError) {
        console.error(`[ADMIN NOTIFICATION] Webhook failed:`, webhookError.message);
        // Don't throw - webhook failure shouldn't break the blocking flow
      }
    }

    // Send email if configured
    if (adminEmail) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4ECDC4; color: white; padding: 20px; text-align: center; }
              .content { background-color: #f9f9f9; padding: 20px; margin-top: 20px; }
              .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #4ECDC4; }
              .label { font-weight: bold; color: #666; }
              .value { color: #333; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>🚫 User Blocked Notification</h2>
              </div>
              <div class="content">
                <p>A user has been blocked in the AncientFlip app.</p>
                
                <div class="info-box">
                  <div class="label">Blocked By:</div>
                  <div class="value">${blocker.displayName || blocker.email || "Unknown"} (${blocker.profile?.username || "N/A"})</div>
                  <div style="margin-top: 5px; font-size: 12px; color: #666;">ID: ${blocker._id.toString()}</div>
                </div>
                
                <div class="info-box">
                  <div class="label">Blocked User:</div>
                  <div class="value">${blockedUser.displayName || blockedUser.email || "Unknown"} (${blockedUser.profile?.username || "N/A"})</div>
                  <div style="margin-top: 5px; font-size: 12px; color: #666;">ID: ${blockedUser._id.toString()}</div>
                </div>
                
                <div class="info-box">
                  <div class="label">Timestamp:</div>
                  <div class="value">${new Date(notificationData.timestamp).toLocaleString()}</div>
                </div>
              </div>
              <div class="footer">
                <p>This is an automated notification from AncientFlip Admin System</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendHtmlEmail(
          adminEmail,
          `[AncientFlip] User Blocked: ${blockedUser.displayName || blockedUser.email || "Unknown"}`,
          emailHtml
        );
        console.log(`[ADMIN NOTIFICATION] Email sent successfully to: ${adminEmail}`);
      } catch (emailError) {
        console.error(`[ADMIN NOTIFICATION] Email failed:`, emailError.message);
        // Don't throw - email failure shouldn't break the blocking flow
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[ADMIN NOTIFICATION] Error sending notification:", error);
    // Don't throw - notification failure shouldn't break the blocking flow
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to admin about user report
 * @param {Object} reporter - User who reported
 * @param {Object} reportedUser - User who was reported
 * @param {string} reason - Reason for report
 */
const notifyUserReported = async (reporter, reportedUser, reason) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "ancientsflip@gmail.com";
    const adminWebhookUrl = process.env.ADMIN_WEBHOOK_URL;

    const notificationData = {
      event: "user_reported",
      timestamp: new Date().toISOString(),
      reporter: {
        id: reporter._id.toString(),
        displayName: reporter.displayName || reporter.email || "Unknown",
        email: reporter.email,
        username: reporter.profile?.username,
      },
      reportedUser: {
        id: reportedUser._id.toString(),
        displayName: reportedUser.displayName || reportedUser.email || "Unknown",
        email: reportedUser.email,
        username: reportedUser.profile?.username,
      },
      reason: reason,
      message: `User ${reporter.displayName || reporter.email} reported user ${reportedUser.displayName || reportedUser.email} for: ${reason}`,
    };

    console.log(`[ADMIN NOTIFICATION] User Reported:`, JSON.stringify(notificationData, null, 2));

    if (adminWebhookUrl) {
      try {
        await axios.post(adminWebhookUrl, notificationData, {
          timeout: 5000,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "AncientFlip-Backend/1.0",
          },
        });
        console.log(`[ADMIN NOTIFICATION] Webhook sent successfully`);
      } catch (webhookError) {
        console.error(`[ADMIN NOTIFICATION] Webhook failed:`, webhookError.message);
      }
    }

    if (adminEmail) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #FF6B6B; color: white; padding: 20px; text-align: center; }
              .content { background-color: #f9f9f9; padding: 20px; margin-top: 20px; }
              .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #FF6B6B; }
              .label { font-weight: bold; color: #666; }
              .value { color: #333; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>⚠️ User Reported</h2>
              </div>
              <div class="content">
                <p>A user has been reported in the AncientFlip app.</p>
                
                <div class="info-box">
                  <div class="label">Reported By:</div>
                  <div class="value">${reporter.displayName || reporter.email || "Unknown"} (${reporter.profile?.username || "N/A"})</div>
                  <div style="margin-top: 5px; font-size: 12px; color: #666;">ID: ${reporter._id.toString()}</div>
                </div>
                
                <div class="info-box">
                  <div class="label">Reported User:</div>
                  <div class="value">${reportedUser.displayName || reportedUser.email || "Unknown"} (${reportedUser.profile?.username || "N/A"})</div>
                  <div style="margin-top: 5px; font-size: 12px; color: #666;">ID: ${reportedUser._id.toString()}</div>
                </div>
                
                <div class="info-box">
                  <div class="label">Reason:</div>
                  <div class="value">${reason || "Not specified"}</div>
                </div>
                
                <div class="info-box">
                  <div class="label">Timestamp:</div>
                  <div class="value">${new Date(notificationData.timestamp).toLocaleString()}</div>
                </div>
              </div>
              <div class="footer">
                <p>This is an automated notification from AncientFlip Admin System</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendHtmlEmail(
          adminEmail,
          `[AncientFlip] User Reported: ${reportedUser.displayName || reportedUser.email || "Unknown"}`,
          emailHtml
        );
        console.log(`[ADMIN NOTIFICATION] Email sent successfully to: ${adminEmail}`);
      } catch (emailError) {
        console.error(`[ADMIN NOTIFICATION] Email failed:`, emailError.message);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[ADMIN NOTIFICATION] Error sending notification:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  notifyUserBlocked,
  notifyUserReported,
};
