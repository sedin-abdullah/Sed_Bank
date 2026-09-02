/** 404 + centralised error handling. Every error leaves the API in one shape. */
import multer from 'multer';
import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
};

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export const errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Something went wrong.';
  let details = err.details;

  // Mongoose schema validation -> 422 with per-field messages.
  if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    message = 'Validation failed.';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for "${err.path}".`;
  } else if (err.code === 11000) {
    // Duplicate key -> 409 naming the offending field.
    status = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    message = `A record with this ${field} already exists.`;
    details = [{ field, message: 'Must be unique.' }];
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${env.maxUploadMb} MB.`
        : `Upload failed: ${err.message}`;
  }

  if (status >= 500) {
    logger.error(err.stack || err);
  }

  res.status(status).json({
    success: false,
    error: {
      message,
      ...(details ? { details } : {}),
      ...(env.isProd ? {} : { stack: status >= 500 ? err.stack : undefined }),
    },
  });
};

export default { notFoundHandler, errorHandler };
