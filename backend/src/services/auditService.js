/**
 * Audit trail writer. Every state-changing service call records who did what,
 * to which entity, and why. Failures here are logged but never propagate —
 * an audit write must not roll back a completed business transaction.
 */
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * @param {object} params
 * @param {string} params.entity      e.g. 'LoanApplication'
 * @param {string} params.entityId
 * @param {string} params.action      machine-readable verb, e.g. 'application.submitted'
 * @param {string} [params.description] one-line human summary for timelines
 * @param {object} [params.actor]     req.user, or null for system actions
 * @param {object} [params.meta]
 * @param {string} [params.ip]
 */
export async function recordAudit({
  entity,
  entityId,
  action,
  description = '',
  actor = null,
  meta = {},
  ip = '',
}) {
  try {
    return await AuditLog.create({
      entity,
      entityId,
      action,
      description,
      performedBy: actor?._id ?? null,
      performedByName: actor?.name ?? 'System',
      role: actor?.role ?? 'system',
      meta,
      ip,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Audit write failed for ${entity}/${action}: ${error.message}`);
    return null;
  }
}

/** Chronological trail for one entity — powers the application timeline view. */
export function getTrail(entity, entityId, limit = 100) {
  return AuditLog.find({ entity, entityId }).sort({ timestamp: 1 }).limit(limit).lean();
}

/** Most recent activity across the platform — powers the admin activity feed. */
export function getRecentActivity(limit = 20) {
  return AuditLog.find({}).sort({ timestamp: -1 }).limit(limit).lean();
}

export default { recordAudit, getTrail, getRecentActivity };
