/** JWT authentication + role authorisation. Enforced server-side on every route. */
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import User from '../models/User.js';
import { ROLES, STAFF_ROLES, USER_STATUS } from '../constants/index.js';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, name: user.name },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
};

/**
 * Verifies the bearer token and loads the live user record, so a deactivated
 * account loses access immediately rather than at token expiry.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Missing authentication token.');

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch (error) {
    throw ApiError.unauthorized(
      error.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' : 'Invalid token.'
    );
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists.');
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden('This account has been deactivated.');

  req.user = user;
  next();
});

/** Restricts a route to an explicit list of roles. */
export const authorize = (...allowed) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!allowed.includes(req.user.role)) {
    return next(ApiError.forbidden(`This action requires one of: ${allowed.join(', ')}.`));
  }
  return next();
};

/** Any internal user (admin portal). */
export const requireStaff = authorize(...STAFF_ROLES);

/** Super-role only. */
export const requireAdmin = authorize(ROLES.ADMIN);

/**
 * Builds an authorizer where the `admin` super-role always passes.
 * Keeps sub-role routes readable: `authorizeWithAdmin(ROLES.CREDIT_OFFICER)`.
 */
export const authorizeWithAdmin = (...allowed) => authorize(...new Set([...allowed, ROLES.ADMIN]));

export const requireCustomer = authorize(ROLES.CUSTOMER);

export default { signToken, authenticate, authorize, requireStaff, requireAdmin, requireCustomer };
