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
 * Get file info from Cloudinary
 * @param {string} publicId - Public ID of the file
 * @param {string} resourceType - Type of resource ('image' or 'video')
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

module.exports = {
  cloudinary,
  uploadImage,
  uploadVideo,
  generateVideoThumbnail,
  deleteFile,
  getFileInfo,
};
