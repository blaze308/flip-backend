const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to the file to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
const uploadImage = async (filePath, options = {}) => {
  try {
    const defaultOptions = {
      resource_type: "image",
      folder: "ancientflip/images",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      transformation: [
        { quality: "auto", fetch_format: "auto" },
        { width: 1080, height: 1080, crop: "limit" },
      ],
      ...options,
    };

    console.log("📸 Uploading image to Cloudinary:", filePath);
    const result = await cloudinary.uploader.upload(filePath, defaultOptions);
    console.log("📸 Cloudinary upload successful:", result.secure_url);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error("📸 Cloudinary upload error:", error);
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

/**
 * Upload video to Cloudinary
 * @param {string} filePath - Path to the video file to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
const uploadVideo = async (filePath, options = {}) => {
  try {
    const defaultOptions = {
      resource_type: "video",
      folder: "ancientflip/videos",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      transformation: [
        { quality: "auto", fetch_format: "auto" },
        { width: 1080, height: 1920, crop: "limit" },
      ],
      ...options,
    };

    console.log("🎥 Uploading video to Cloudinary:", filePath);
    const result = await cloudinary.uploader.upload(filePath, defaultOptions);
    console.log("🎥 Cloudinary video upload successful:", result.secure_url);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      duration: result.duration,
      thumbnailUrl: result.secure_url.replace(/\.[^/.]+$/, ".jpg"), // Generate thumbnail URL
    };
  } catch (error) {
    console.error("🎥 Cloudinary video upload error:", error);
    throw new Error(`Cloudinary video upload failed: ${error.message}`);
  }
};

/**
 * Generate video thumbnail
 * @param {string} videoPublicId - Public ID of the uploaded video
 * @param {Object} options - Thumbnail options
 * @returns {string} Thumbnail URL
 */
const generateVideoThumbnail = (videoPublicId, options = {}) => {
  const defaultOptions = {
    resource_type: "video",
    format: "jpg",
    transformation: [
      { quality: "auto" },
      { width: 800, height: 600, crop: "fill" },
      { start_offset: "0" }, // Take thumbnail from the beginning
    ],
    ...options,
  };

  return cloudinary.url(videoPublicId, defaultOptions);
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Public ID of the file to delete
 * @param {string} resourceType - Type of resource ('image' or 'video')
 * @returns {Promise<Object>} Deletion result
 */
const deleteFile = async (publicId, resourceType = "image") => {
  try {
    console.log(`🗑️ Deleting ${resourceType} from Cloudinary:`, publicId);
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    console.log("🗑️ Cloudinary deletion result:", result);
    return result;
  } catch (error) {
    console.error("🗑️ Cloudinary deletion error:", error);
    throw new Error(`Cloudinary deletion failed: ${error.message}`);
  }
};

/**
 * Upload file buffer to Cloudinary (for chat media)
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
const uploadToCloudinary = async (buffer, options = {}) => {
  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: options.resource_type || "auto",
          folder: options.folder || "ancientflip/chat",
          public_id: options.public_id,
          use_filename: options.use_filename || false,
          unique_filename: options.unique_filename !== false,
          overwrite: options.overwrite || false,
          quality: options.quality || "auto",
          fetch_format: options.fetch_format || "auto",
          ...options,
        },
        (error, result) => {
          if (error) {
            console.error("📤 Cloudinary buffer upload error:", error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log(
              "📤 Cloudinary buffer upload successful:",
              result.secure_url
            );
            resolve(result);
          }
        }
      );

      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error("📤 Cloudinary buffer upload error:", error);
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

/**
 * Upload audio file to Cloudinary
 * @param {string|Buffer} file - File path or buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
const uploadAudio = async (file, options = {}) => {
  try {
    const defaultOptions = {
      resource_type: "video", // Cloudinary treats audio as video
      folder: "ancientflip/audio",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options,
    };

    console.log("🎵 Uploading audio to Cloudinary");
    let result;

    if (Buffer.isBuffer(file)) {
      result = await uploadToCloudinary(file, defaultOptions);
    } else {
      result = await cloudinary.uploader.upload(file, defaultOptions);
    }

    console.log("🎵 Cloudinary audio upload successful:", result.secure_url);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      duration: result.duration,
    };
  } catch (error) {
    console.error("🎵 Cloudinary audio upload error:", error);
    throw new Error(`Cloudinary audio upload failed: ${error.message}`);
  }
};

/**
 * Upload raw file (for lottie, svga, etc.)
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
const uploadRawFile = async (buffer, options = {}) => {
  try {
    const defaultOptions = {
      resource_type: "raw",
      folder: "ancientflip/files",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options,
    };

    console.log("📄 Uploading raw file to Cloudinary");
    const result = await uploadToCloudinary(buffer, defaultOptions);
    console.log("📄 Cloudinary raw file upload successful:", result.secure_url);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error("📄 Cloudinary raw file upload error:", error);
    throw new Error(`Cloudinary raw file upload failed: ${error.message}`);
  }
};

/**
 * Get file info from Cloudinary
 * @param {string} publicId - Public ID of the file
 * @param {string} resourceType - Type of resource ('image', 'video', 'raw')
 * @returns {Promise<Object>} File info
 */
const getFileInfo = async (publicId, resourceType = "image") => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error("📋 Cloudinary get file info error:", error);
    throw new Error(`Failed to get file info: ${error.message}`);
  }
};

/**
 * Validate file type for chat uploads
 * @param {string} mimeType - File MIME type
 * @param {string} messageType - Message type (image, video, audio, lottie, svga, file)
 * @returns {boolean} Whether file type is valid
 */
const validateChatFileType = (mimeType, messageType) => {
  const validTypes = {
    image: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ],
    video: [
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
    ],
    audio: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/aac",
      "audio/webm",
    ],
    lottie: ["application/json", "text/plain"],
    svga: ["application/octet-stream", "application/x-svga"],
    file: [], // Allow all file types for general file messages
  };

  if (messageType === "file") {
    return true; // Allow all file types for general file messages
  }

  return validTypes[messageType]?.includes(mimeType.toLowerCase()) || false;
};

module.exports = {
  cloudinary,
  uploadImage,
  uploadVideo,
  uploadAudio,
  uploadRawFile,
  uploadToCloudinary,
  generateVideoThumbnail,
  deleteFile,
  getFileInfo,
  validateChatFileType,
};
