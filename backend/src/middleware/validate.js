/**
 * Zod-backed request validation.
 * Parsed (and coerced) output replaces the raw input, so controllers always
 * receive clean, typed data — the client is never trusted.
 */
import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';

const formatIssues = (error) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

/**
 * @param {object} schemas { body?, query?, params? } of Zod schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
    if (schemas.query) {
      // req.query is a getter-only property on Express 5; assign to a side channel.
      req.validatedQuery = schemas.query.parse(req.query ?? {});
    }
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      return next(ApiError.unprocessable('Validation failed.', formatIssues(error)));
    }
    return next(error);
  }
};

export default validate;
