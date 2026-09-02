/**
 * BureauReport — the (mocked) credit bureau pull for an application.
 * Reports are immutable once written; a re-pull creates a new document.
 */
import mongoose from 'mongoose';

const bureauReportSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true,
      index: true,
    },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, default: 'mock-bureau' },
    score: { type: Number, required: true, min: 300, max: 900 },
    band: { type: String, default: '' },
    summary: {
      openAccounts: { type: Number, default: 0 },
      closedAccounts: { type: Number, default: 0 },
      totalOutstanding: { type: Number, default: 0 },
      enquiriesLast6Months: { type: Number, default: 0 },
      delinquenciesLast24Months: { type: Number, default: 0 },
      oldestAccountMonths: { type: Number, default: 0 },
      creditUtilizationPct: { type: Number, default: 0 },
      writeOffs: { type: Number, default: 0 },
    },
    /** Full mocked payload, kept verbatim for the underwriting 360 view. */
    reportJson: { type: mongoose.Schema.Types.Mixed, default: {} },
    pulledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

bureauReportSchema.set('toJSON', { virtuals: true });

export default mongoose.model('BureauReport', bureauReportSchema);
