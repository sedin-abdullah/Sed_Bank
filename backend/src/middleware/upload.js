/**
 * Multer disk storage for KYC / income documents.
 *
 * Files land in UPLOAD_DIR (git-ignored) and are served read-only from /uploads.
 * Filenames are randomised so a user-supplied name can never traverse the path.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

fs.mkdirSync(env.uploadDir, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => {
    // Only the extension is taken from the client; the stem is random.
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safeExt = /^\.[a-z0-9]{1,9}$/.test(ext) ? ext : '';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
  },
});

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
