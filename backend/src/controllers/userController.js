/** Admin user management — create, edit and deactivate internal users. */
import crypto from 'node:crypto';
import User from '../models/User.js';
import LoanApplication from '../models/LoanApplication.js';
import LoanAccount from '../models/LoanAccount.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginated, getQuery } from '../utils/http.js';
import { ROLES, USER_STATUS, STAFF_ROLES } from '../constants/index.js';
import { recordAudit } from '../services/auditService.js';
import { broadcastDataChange } from '../realtime/socket.js';
import messenger from '../mocks/messenger.js';

/** Password used when an admin creates a user without specifying one. */
const generatePassword = () =>
  `Sed${crypto.randomBytes(4).toString('hex')}@${crypto.randomInt(10, 99)}`;

export const list = asyncHandler(async (req, res) => {
  const { page, limit, search, role, status } = getQuery(req);

  const query = {};
  if (role === 'staff') query.role = { $in: STAFF_ROLES };
  else if (role && role !== 'all') query.role = role;
  if (status && status !== 'all') query.status = status;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { mobile: { $regex: search, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(query),
  ]);

  return paginated(res, items, { page, limit, total });
});

export const detail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound('User not found.');

  // Borrowers get their portfolio attached so admins have one place to look.
  const [applications, loans] = await Promise.all([
    LoanApplication.find({ applicant: user._id }).select('applicationNo status amountRequested createdAt').sort({ createdAt: -1 }).lean(),
    LoanAccount.find({ borrower: user._id }).select('loanNo status sanctionedAmount principalOutstanding').lean(),
  ]);

  return ok(res, { user, applications, loans });
});

export const create = asyncHandler(async (req, res) => {
  const { name, email, mobile, role, status } = req.body;

  const clash = await User.findOne({ $or: [{ email }, { mobile }] });
  if (clash) {
    const field = clash.email === email ? 'email' : 'mobile';
    throw ApiError.conflict(`A user with this ${field} already exists.`, [
      { field, message: 'Already in use.' },
    ]);
  }

  const plainPassword = req.body.password || generatePassword();

  const user = await User.create({
    name,
    email,
    mobile,
    role,
    status,
    passwordHash: await User.hashPassword(plainPassword),
    createdBy: req.user._id,
  });

  await recordAudit({
    entity: 'User',
    entityId: user._id,
    action: 'user.created',
    description: `${user.name} added as ${role.replace(/_/g, ' ')}`,
    actor: req.user,
    ip: req.ip,
  });

  await messenger.sendEmail({
    to: user.email,
    subject: 'Your SedBank account has been created',
    text: `Hi ${user.name}, an account has been created for you on SedBank with the role "${role}". Temporary password: ${plainPassword}. Please change it after signing in.`,
  });

  broadcastDataChange(['users', 'dashboard']);

  return created(res, {
    user: user.toJSON(),
    // Returned once so the admin can hand the credential over; never stored in clear.
    ...(req.body.password ? {} : { temporaryPassword: plainPassword }),
  });
});

export const update = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found.');

  const { name, mobile, role, status, password } = req.body;

  // An admin must not be able to lock themselves out of the platform.
  if (String(user._id) === String(req.user._id)) {
    if (status && status !== USER_STATUS.ACTIVE) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }
    if (role && role !== user.role) {
      throw ApiError.badRequest('You cannot change your own role.');
    }
  }

  if (mobile && mobile !== user.mobile) {
    const clash = await User.findOne({ mobile, _id: { $ne: user._id } });
    if (clash) {
      throw ApiError.conflict('That mobile number is already in use.', [
        { field: 'mobile', message: 'Already registered.' },
      ]);
    }
    user.mobile = mobile;
  }

  if (name) user.name = name;
  if (role) user.role = role;
  if (status) user.status = status;
  if (password) user.passwordHash = await User.hashPassword(password);

  await user.save();

  await recordAudit({
    entity: 'User',
    entityId: user._id,
    action: 'user.updated',
    description: `${user.name} updated${status ? ` (status: ${status})` : ''}${role ? ` (role: ${role})` : ''}`,
    actor: req.user,
    meta: { fields: Object.keys(req.body) },
    ip: req.ip,
  });

  broadcastDataChange(['users']);
  return ok(res, { user: user.toJSON() });
});

/** Deactivation rather than deletion — history must stay intact. */
export const deactivate = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  // Keep at least one active admin standing.
  if (user.role === ROLES.ADMIN) {
    const activeAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      _id: { $ne: user._id },
    });
    if (activeAdmins === 0) {
      throw ApiError.badRequest('At least one active administrator must remain.');
    }
  }

  user.status = USER_STATUS.INACTIVE;
  await user.save();

  await recordAudit({
    entity: 'User',
    entityId: user._id,
    action: 'user.deactivated',
    description: `${user.name} deactivated`,
    actor: req.user,
    ip: req.ip,
  });

  broadcastDataChange(['users']);
  return ok(res, { user: user.toJSON() });
});

export default { list, detail, create, update, deactivate };
