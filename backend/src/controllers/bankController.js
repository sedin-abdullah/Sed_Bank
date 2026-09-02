/** Partner bank / disbursement account master data. */
import Bank from '../models/Bank.js';
import LoanAccount from '../models/LoanAccount.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginated, getQuery } from '../utils/http.js';
import { USER_STATUS } from '../constants/index.js';
import { recordAudit } from '../services/auditService.js';
import { broadcastDataChange } from '../realtime/socket.js';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, search, type, status } = getQuery(req);

  const query = {};
  if (type && type !== 'all') query.type = type;
  if (status && status !== 'all') query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { branch: { $regex: search, $options: 'i' } },
    ];
  }

  const [rows, total] = await Promise.all([
    Bank.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Bank.countDocuments(query),
  ]);

  return paginated(res, rows.map((bank) => bank.toJSON()), { page, limit, total });
});

export const create = asyncHandler(async (req, res) => {
  const existing = await Bank.findOne({ code: req.body.code });
  if (existing) {
    throw ApiError.conflict('A bank with this code already exists.', [
      { field: 'code', message: 'Must be unique.' },
    ]);
  }

  const bank = await Bank.create({ ...req.body, createdBy: req.user._id });

  await recordAudit({
    entity: 'Bank',
    entityId: bank._id,
    action: 'bank.created',
    description: `${bank.name} (${bank.code}) added as a ${bank.type} bank`,
    actor: req.user,
    ip: req.ip,
  });

  broadcastDataChange(['banks', 'dashboard']);
  return created(res, { bank: bank.toJSON() });
});

export const detail = asyncHandler(async (req, res) => {
  const bank = await Bank.findById(req.params.id);
  if (!bank) throw ApiError.notFound('Bank not found.');
  return ok(res, { bank: bank.toJSON() });
});

export const update = asyncHandler(async (req, res) => {
  const bank = await Bank.findById(req.params.id);
  if (!bank) throw ApiError.notFound('Bank not found.');

  if (req.body.code && req.body.code !== bank.code) {
    const clash = await Bank.findOne({ code: req.body.code, _id: { $ne: bank._id } });
    if (clash) {
      throw ApiError.conflict('A bank with this code already exists.', [
        { field: 'code', message: 'Must be unique.' },
      ]);
    }
  }

  Object.entries(req.body).forEach(([key, value]) => {
    if (value !== undefined) bank[key] = value;
  });

  await bank.save();

  await recordAudit({
    entity: 'Bank',
    entityId: bank._id,
    action: 'bank.updated',
    description: `${bank.name} (${bank.code}) updated`,
    actor: req.user,
    meta: { fields: Object.keys(req.body) },
    ip: req.ip,
  });

  broadcastDataChange(['banks']);
  return ok(res, { bank: bank.toJSON() });
});

/**
 * Removes a bank, or deactivates it when it is already referenced by a
 * disbursement — historic loans must keep pointing at a real record.
 */
export const remove = asyncHandler(async (req, res) => {
  const bank = await Bank.findById(req.params.id);
  if (!bank) throw ApiError.notFound('Bank not found.');

  const used = await LoanAccount.countDocuments({ disbursementBank: bank._id });

  if (used > 0) {
    bank.status = USER_STATUS.INACTIVE;
    await bank.save();

    await recordAudit({
      entity: 'Bank',
      entityId: bank._id,
      action: 'bank.deactivated',
      description: `${bank.name} deactivated (referenced by ${used} disbursement${used === 1 ? '' : 's'})`,
      actor: req.user,
      ip: req.ip,
    });

    broadcastDataChange(['banks']);
    return ok(res, {
      bank: bank.toJSON(),
      deactivated: true,
      message: `This bank is used by ${used} loan${used === 1 ? '' : 's'}, so it was deactivated instead of deleted.`,
    });
  }

  await bank.deleteOne();

  await recordAudit({
    entity: 'Bank',
    entityId: bank._id,
    action: 'bank.deleted',
    description: `${bank.name} (${bank.code}) deleted`,
    actor: req.user,
    ip: req.ip,
  });

  broadcastDataChange(['banks', 'dashboard']);
  return ok(res, { deleted: true });
});

export default { list, create, detail, update, remove };
