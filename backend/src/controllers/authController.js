/**
 * Authentication: email/password login plus mobile-OTP signup and login.
 * The OTP channel is mocked (see otpService) — no SMS vendor is involved.
 */
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created } from '../utils/http.js';
import { signToken } from '../middleware/auth.js';
import { ROLES, USER_STATUS, OTP_PURPOSES } from '../constants/index.js';
import { issueOtp, verifyOtp } from '../services/otpService.js';
import { recordAudit } from '../services/auditService.js';
import { broadcastDataChange } from '../realtime/socket.js';
import messenger from '../mocks/messenger.js';

/** Shape returned to the client on any successful authentication. */
const session = (user) => ({
  token: signToken(user),
  user: {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    status: user.status,
    kycStatus: user.kycStatus,
    mobileVerified: user.mobileVerified,
    isDemo: user.isDemo,
  },
});

/** Self-service customer registration. Staff accounts are created by an admin. */
export const register = asyncHandler(async (req, res) => {
  const { name, email, mobile, password } = req.body;

  const clash = await User.findOne({ $or: [{ email }, { mobile }] });
  if (clash) {
    const field = clash.email === email ? 'email' : 'mobile';
    throw ApiError.conflict(`An account with this ${field} already exists.`, [
      { field, message: 'Already registered.' },
    ]);
  }

  const user = await User.create({
    name,
    email,
    mobile,
    passwordHash: await User.hashPassword(password),
    // Self-registration always creates a borrower; roles are never client-supplied.
    role: ROLES.CUSTOMER,
  });

  await recordAudit({
    entity: 'User',
    entityId: user._id,
    action: 'user.registered',
    description: `${user.name} registered as a customer`,
    actor: user,
    ip: req.ip,
  });

  await messenger.sendEmail({
    to: user.email,
    subject: 'Welcome to SedBank',
    text: `Hi ${user.name}, your SedBank account is ready. Sign in to check your loan eligibility.`,
  });

  broadcastDataChange(['users', 'dashboard']);

  return created(res, session(user));
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Identical message for unknown email and wrong password — no account enumeration.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account has been deactivated. Contact your administrator.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  return ok(res, session(user));
});

/** Sends a login/signup OTP to a mobile number. */
export const requestOtp = asyncHandler(async (req, res) => {
  const { mobile, purpose } = req.body;

  const user = await User.findOne({ mobile });

  if (purpose === OTP_PURPOSES.LOGIN && !user) {
    throw ApiError.notFound('No account is registered with this mobile number.');
  }
  if (purpose === OTP_PURPOSES.SIGNUP && user) {
    throw ApiError.conflict('This mobile number is already registered. Please sign in instead.');
  }
  if (user && user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account has been deactivated.');
  }

  const result = await issueOtp({
    identifier: mobile,
    purpose,
    deliverTo: { mobile, email: user?.email },
  });

  return ok(res, { mobile, purpose, ...result });
});

/**
 * Verifies a mobile OTP. For `login` this returns a session. For `signup` it
 * marks the number verified so the registration form can be completed.
 */
export const verifyMobileOtp = asyncHandler(async (req, res) => {
  const { mobile, code, purpose } = req.body;

  await verifyOtp({ identifier: mobile, purpose, code });

  if (purpose === OTP_PURPOSES.SIGNUP) {
    return ok(res, { mobile, verified: true, nextStep: 'complete-registration' });
  }

  const user = await User.findOne({ mobile });
  if (!user) throw ApiError.notFound('No account is registered with this mobile number.');
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden('This account has been deactivated.');

  user.mobileVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  return ok(res, session(user));
});

export const me = asyncHandler(async (req, res) => ok(res, { user: req.user.toJSON() }));

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, mobile } = req.body;

  if (mobile && mobile !== req.user.mobile) {
    const clash = await User.findOne({ mobile, _id: { $ne: req.user._id } });
    if (clash) {
      throw ApiError.conflict('That mobile number is already in use.', [
        { field: 'mobile', message: 'Already registered.' },
      ]);
    }
    req.user.mobile = mobile;
    req.user.mobileVerified = false;
  }
  if (name) req.user.name = name;

  await req.user.save();

  await recordAudit({
    entity: 'User',
    entityId: req.user._id,
    action: 'user.profileUpdated',
    description: 'Profile details updated',
    actor: req.user,
    ip: req.ip,
  });

  return ok(res, { user: req.user.toJSON() });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect.', [
      { field: 'currentPassword', message: 'Incorrect password.' },
    ]);
  }

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();

  await recordAudit({
    entity: 'User',
    entityId: user._id,
    action: 'user.passwordChanged',
    description: 'Password changed',
    actor: user,
    ip: req.ip,
  });

  return ok(res, { changed: true });
});

export default {
  register,
  login,
  requestOtp,
  verifyMobileOtp,
  me,
  updateProfile,
  changePassword,
};
