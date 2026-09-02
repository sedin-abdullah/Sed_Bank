/**
 * UnderwritingDecision — an append-only record of every credit decision,
 * whether taken by the rule engine (decidedBy = null) or by an officer.
 */
import mongoose from 'mongoose';
import { DECISION } from '../constants/index.js';

const underwritingDecisionSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true,
      index: true,
    },
    decision: { type: String, enum: Object.values(DECISION), required: true },
    /** null means the automated rule engine made the call. */
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedByName: { type: String, default: 'Rule Engine' },
    remarks: { type: String, default: '' },
    /** Snapshot of the inputs so a decision stays explainable after config changes. */
    score: { type: Number, default: null },
    dti: { type: Number, default: null },
    rulesApplied: { type: [String], default: [] },
    approvedAmount: { type: Number, default: null },
    approvedRoi: { type: Number, default: null },
    approvedTenure: { type: Number, default: null },
    decidedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

underwritingDecisionSchema.set('toJSON', { virtuals: true });

export default mongoose.model('UnderwritingDecision', underwritingDecisionSchema);
