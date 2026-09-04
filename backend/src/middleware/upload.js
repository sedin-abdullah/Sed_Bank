/**
 * Multer memory storage for KYC / income documents.
 *
 * The file is held in memory and then written into the Document row, because
 * the API's local disk does not survive a redeploy on our hosting. Uploads are
 * capped well below the 16 MB BSON document limit.
 */
import multer from 'multer';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG, PNG, WEBP or PDF files are accepted.'));
    }
    return cb(null, true);
  },
});

export default upload;
