const Busboy = require('busboy');
const { verifyAuthToken } = require('../../lib/clerk');
const { getDb } = require('../../lib/mongodb');
const { atomicReserveFileUpload, refundFileUpload } = require('../../lib/atomic-usage');
const { uploadToCloudinary } = require('../../lib/cloudinary');
const { processDocument } = require('../../lib/ocr');
const config = require('../../lib/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyAuthToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
  }

  return new Promise((resolve) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: config.FREE_MAX_FILE_SIZE_MB * 1024 * 1024,
          files: 1
        }
      });
    } catch (bbErr) {
      res.status(400).json({ error: 'Invalid multipart request: ' + bbErr.message });
      return resolve();
    }

    let fileBuffer = [];
    let fileSizeBytes = 0;
    let fileName = '';
    let mimeType = '';
    let conversationId = '';
    let fileLimitExceeded = false;
    let uploadReservation = null;

    busboy.on('field', (name, val) => {
      if (name === 'conversationId') {
        conversationId = val.trim();
      }
    });

    busboy.on('file', (fieldname, file, info) => {
      fileName = info.filename || 'document';
      mimeType = (info.mimeType || '').toLowerCase();

      // Validate allowed file types: PDF, JPG/JPEG, PNG
      const isAllowed =
        mimeType.includes('pdf') ||
        mimeType.includes('image/jpeg') ||
        mimeType.includes('image/jpg') ||
        mimeType.includes('image/png') ||
        fileName.match(/\.(pdf|jpe?g|png)$/i);

      if (!isAllowed) {
        fileLimitExceeded = true;
        file.resume();
        return;
      }

      file.on('data', (data) => {
        fileSizeBytes += data.length;
        if (fileSizeBytes > config.FREE_MAX_FILE_SIZE_MB * 1024 * 1024) {
          fileLimitExceeded = true;
          file.resume();
          return;
        }
        fileBuffer.push(data);
      });

      file.on('limit', () => {
        fileLimitExceeded = true;
      });
    });

    busboy.on('finish', async () => {
      if (!conversationId) {
        res.status(400).json({ error: 'Missing conversationId in form data' });
        return resolve();
      }

      if (fileLimitExceeded) {
        res.status(400).json({
          error: `File size exceeds maximum allowed limit of ${config.FREE_MAX_FILE_SIZE_MB} MB or file format not supported. Only PDF, JPG, and PNG are allowed.`,
          code: 'FILE_VALIDATION_ERROR'
        });
        return resolve();
      }

      if (fileBuffer.length === 0) {
        res.status(400).json({ error: 'No file uploaded or file was empty.' });
        return resolve();
      }

      const completeBuffer = Buffer.concat(fileBuffer);

      // 1. Atomically check and reserve file upload slot on conversation
      try {
        uploadReservation = await atomicReserveFileUpload(user.uid, conversationId, completeBuffer.length);
      } catch (reserveErr) {
        const status = reserveErr.statusCode || 403;
        res.status(status).json({
          error: reserveErr.message,
          code: reserveErr.code || 'FILE_LIMIT_EXCEEDED',
          details: reserveErr.details || null
        });
        return resolve();
      }

      // 2. Upload file to Cloudinary & Extract Text/OCR
      try {
        const [cloudResult, ocrResult] = await Promise.all([
          uploadToCloudinary(completeBuffer, fileName, mimeType),
          processDocument(completeBuffer, mimeType, fileName)
        ]);

        const db = await getDb();
        const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

        const newDoc = {
          id: docId,
          conversationId,
          userId: user.uid,
          fileName,
          fileType: mimeType || 'application/octet-stream',
          fileSize: completeBuffer.length,
          cloudinaryUrl: cloudResult.url,
          cloudinaryPublicId: cloudResult.publicId,
          fileData: completeBuffer.toString('base64'),
          extractedText: ocrResult.extractedText,
          summary: ocrResult.summary,
          createdAt: new Date()
        };

        await db.collection('documents').insertOne(newDoc);

        res.status(201).json({
          success: true,
          document: {
            id: newDoc.id,
            conversationId: newDoc.conversationId,
            fileName: newDoc.fileName,
            fileType: newDoc.fileType,
            fileSize: newDoc.fileSize,
            cloudinaryUrl: newDoc.cloudinaryUrl,
            summary: newDoc.summary,
            createdAt: newDoc.createdAt
          },
          usage: {
            lifetimeFilesUploaded: uploadReservation.lifetimeFilesUploaded,
            maxFiles: config.FREE_MAX_FILES_PER_CONVERSATION,
            remainingFiles: uploadReservation.remainingFiles
          }
        });
        return resolve();
      } catch (uploadErr) {
        console.error('[Upload] Error uploading or processing file:', uploadErr.message);
        // Refund file upload allowance since processing failed
        await refundFileUpload(user.uid, conversationId);
        res.status(500).json({
          error: 'Failed to process document: ' + uploadErr.message,
          code: 'UPLOAD_PROCESSING_ERROR'
        });
        return resolve();
      }
    });

    req.pipe(busboy);
  });
};

