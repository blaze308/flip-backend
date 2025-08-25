const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
const {
  uploadImage,
  uploadVideo,
  generateVideoThumbnail,
} = require("../config/cloudinary");

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename for temporary storage
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `temp-${uniqueSuffix}${extension}`);
  },
});

const imageFilter = (req, file, cb) => {
  console.log("📸 Image filter - File details:", {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Check if file is an image by MIME type
  const validImageTypes = [
    "image/jpeg",
    "image/jpg", 
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/svg+xml"
  ];

  // Also check by file extension as fallback
  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  const isValidMimeType = file.mimetype && validImageTypes.includes(file.mimetype);
  const isValidExtension = validExtensions.includes(fileExtension);

  if (isValidMimeType || isValidExtension) {
    console.log("📸 Image filter - File accepted");
    cb(null, true);
  } else {
    console.error("📸 Image filter - File rejected:", {
      mimetype: file.mimetype,
      extension: fileExtension,
      originalname: file.originalname
    });
    cb(new Error(`Only image files are allowed! Received: ${file.mimetype || 'unknown'} (${fileExtension})`), false);
  }
};

const videoFilter = (req, file, cb) => {
  console.log("🎥 Video filter - File details:", {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Check if file is a video by MIME type
  const validVideoTypes = [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo", // .avi
    "video/x-ms-wmv",  // .wmv
    "video/webm",
    "video/3gpp",      // .3gp
    "video/x-flv",     // .flv
    "video/x-matroska" // .mkv
  ];

  // Also check by file extension as fallback
  const validExtensions = ['.mp4', '.mpeg', '.mpg', '.mov', '.avi', '.wmv', '.webm', '.3gp', '.flv', '.mkv'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  const isValidMimeType = file.mimetype && validVideoTypes.includes(file.mimetype);
  const isValidExtension = validExtensions.includes(fileExtension);

  if (isValidMimeType || isValidExtension) {
    console.log("🎥 Video filter - File accepted");
    cb(null, true);
  } else {
    console.error("🎥 Video filter - File rejected:", {
      mimetype: file.mimetype,
      extension: fileExtension,
      originalname: file.originalname
    });
    cb(new Error(`Only video files are allowed! Received: ${file.mimetype || 'unknown'} (${fileExtension})`), false);
  }
};

const imageUpload = multer({
  storage: storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for images
  },
});

const videoUpload = multer({
  storage: storage,
  fileFilter: videoFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
});

/**
 * POST /upload/image
 *
 * Upload a single image file to Cloudinary
 */
router.post(
  "/image",
  authenticateToken,
  requireSyncedUser,
  imageUpload.single("image"),
  async (req, res) => {
    let tempFilePath = null;

    try {
      console.log("📸 Upload request received");
      console.log("📸 User:", req.user?.email);
      console.log("📸 File:", req.file ? req.file.filename : "No file");

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file provided",
        });
      }

      tempFilePath = req.file.path;

      // Upload to Cloudinary
      const cloudinaryResult = await uploadImage(tempFilePath, {
        folder: `ancientflip/users/${req.user.uid}/images`,
      });

      console.log(
        "📸 Image uploaded successfully to Cloudinary:",
        cloudinaryResult.url
      );

      res.status(201).json({
        success: true,
        message: "Image uploaded successfully",
        data: {
          imageUrl: cloudinaryResult.url,
          publicId: cloudinaryResult.publicId,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          format: cloudinaryResult.format,
          size: cloudinaryResult.bytes,
        },
      });
    } catch (error) {
      console.error("📸 Upload error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload image",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    } finally {
      // Clean up temporary file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log("📸 Temporary file cleaned up:", tempFilePath);
        } catch (cleanupError) {
          console.error("📸 Failed to cleanup temporary file:", cleanupError);
        }
      }
    }
  }
);

/**
 * POST /upload/video
 *
 * Upload a single video file to Cloudinary
 */
router.post(
  "/video",
  authenticateToken,
  requireSyncedUser,
  videoUpload.single("video"),
  async (req, res) => {
    let tempFilePath = null;

    try {
      console.log("🎥 Video upload request received");
      console.log("🎥 User:", req.user?.email);
      console.log("🎥 File:", req.file ? req.file.filename : "No file");

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No video file provided",
        });
      }

      tempFilePath = req.file.path;

      // Upload to Cloudinary
      const cloudinaryResult = await uploadVideo(tempFilePath, {
        folder: `ancientflip/users/${req.user.uid}/videos`,
      });

      // Generate thumbnail
      const thumbnailUrl = generateVideoThumbnail(cloudinaryResult.publicId, {
        width: 800,
        height: 600,
        crop: "fill",
      });

      console.log(
        "🎥 Video uploaded successfully to Cloudinary:",
        cloudinaryResult.url
      );
      console.log("🎥 Video thumbnail generated:", thumbnailUrl);

      res.status(201).json({
        success: true,
        message: "Video uploaded successfully",
        data: {
          videoUrl: cloudinaryResult.url,
          thumbnailUrl: thumbnailUrl,
          publicId: cloudinaryResult.publicId,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          format: cloudinaryResult.format,
          size: cloudinaryResult.bytes,
          duration: cloudinaryResult.duration,
        },
      });
    } catch (error) {
      console.error("🎥 Video upload error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload video",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    } finally {
      // Clean up temporary file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log("🎥 Temporary file cleaned up:", tempFilePath);
        } catch (cleanupError) {
          console.error("🎥 Failed to cleanup temporary file:", cleanupError);
        }
      }
    }
  }
);

/**
 * POST /upload/multiple-images
 *
 * Upload multiple image files to Cloudinary
 */
router.post(
  "/multiple-images",
  authenticateToken,
  requireSyncedUser,
  imageUpload.array("images", 10), // Max 10 images
  async (req, res) => {
    const tempFilePaths = [];

    try {
      console.log("📸 Multiple images upload request received");
      console.log("📸 User:", req.user?.email);
      console.log("📸 Files count:", req.files ? req.files.length : 0);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No image files provided",
        });
      }

      const uploadPromises = req.files.map(async (file) => {
        tempFilePaths.push(file.path);

        const cloudinaryResult = await uploadImage(file.path, {
          folder: `ancientflip/users/${req.user.uid}/images`,
        });

        return {
          imageUrl: cloudinaryResult.url,
          publicId: cloudinaryResult.publicId,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          format: cloudinaryResult.format,
          size: cloudinaryResult.bytes,
        };
      });

      const uploadResults = await Promise.all(uploadPromises);

      console.log("📸 Multiple images uploaded successfully to Cloudinary");

      res.status(201).json({
        success: true,
        message: `${uploadResults.length} images uploaded successfully`,
        data: {
          images: uploadResults,
          count: uploadResults.length,
        },
      });
    } catch (error) {
      console.error("📸 Multiple images upload error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload images",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    } finally {
      // Clean up temporary files
      tempFilePaths.forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log("📸 Temporary file cleaned up:", filePath);
          } catch (cleanupError) {
            console.error("📸 Failed to cleanup temporary file:", cleanupError);
          }
        }
      });
    }
  }
);

module.exports = router;
