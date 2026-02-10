const nodemailer = require("nodemailer");

/**
 * Email Configuration Service
 * Handles sending emails for admin notifications
 */

let transporter = null;

/**
 * Initialize email transporter
 */
const initializeEmail = () => {
  try {
    const emailService = process.env.EMAIL_SERVICE || "gmail";
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD; // App-specific password for Gmail

    // If email is not configured, return null
    if (!emailUser || !emailPassword) {
      console.log("📧 Email service not configured (EMAIL_USER or EMAIL_PASSWORD not set)");
      return null;
    }

    transporter = nodemailer.createTransport({
      service: emailService,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    console.log("✅ Email service initialized successfully");
    return transporter;
  } catch (error) {
    console.error("❌ Error initializing email service:", error.message);
    return null;
  }
};

/**
 * Send email
 * @param {Object} options - Email options { to, subject, html, text }
 */
const sendEmail = async (options) => {
  try {
    // Initialize if not already done
    if (!transporter) {
      transporter = initializeEmail();
    }

    if (!transporter) {
      console.log("📧 Email service not available - skipping email send");
      return { success: false, error: "Email service not configured" };
    }

    const adminEmail = process.env.ADMIN_EMAIL || "ancientsflip@gmail.com";
    const fromEmail = process.env.EMAIL_USER || adminEmail;

    const mailOptions = {
      from: `AncientFlip <${fromEmail}>`,
      to: options.to || adminEmail,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""), // Strip HTML for text version
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent successfully to ${mailOptions.to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send HTML email with template
 */
const sendHtmlEmail = async (to, subject, htmlContent) => {
  return sendEmail({
    to,
    subject,
    html: htmlContent,
  });
};

module.exports = {
  initializeEmail,
  sendEmail,
  sendHtmlEmail,
};
