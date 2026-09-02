/**
 * AuditLog — append-only trail of every state-changing action.
 * Also doubles as the per-application timeline shown to customers and officers.
 */
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    entity: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true },
    /** Human-readable one-liner rendered directly in timelines and activity feeds. */
    description: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    performedByName: { type: String, default: 'System' },
    role: { type: String, default: 'system' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

auditLogSchema.index({ entity: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

auditLogSchema.set('toJSON', { virtuals: true });

export default mongoose.model('AuditLog', auditLogSchema);
