const cloudinary = require('cloudinary').v2;
const config = require('./config');

let cloudinaryConfigured = false;

if (config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true
  });
  cloudinaryConfigured = true;
  console.log('[Cloudinary] Configured successfully.');
} else {
  console.log('[Cloudinary] Running in dev fallback mode.');
}

/**
 * Uploads a file buffer to Cloudinary.
 * @param {Buffer} buffer - File data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type
 * @returns {Promise<{ url: string, publicId: string }>}
 */
async function uploadToCloudinary(buffer, fileName, mimeType) {
  if (!cloudinaryConfigured) {
    // Development fallback
    const id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const fakeUrl = `https://res.cloudinary.com/demo/image/upload/${id}/${encodeURIComponent(fileName)}`;
    return {
      url: fakeUrl,
      publicId: id,
      bytes: buffer.length
    };
  }

  const resourceType = mimeType.includes('pdf') ? 'raw' : 'image';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'legalhelp_docs',
        resource_type: resourceType,
        public_id: `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          bytes: result.bytes || buffer.length
        });
      }
    );

    uploadStream.end(buffer);
  });
}

module.exports = {
  uploadToCloudinary
};

