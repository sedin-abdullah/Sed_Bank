/**
 * LoanAccount — the servicing (LMS) aggregate created at disbursement.
 * Ledger totals are denormalised here so dashboards never have to sum payments.
 */
import mongoose from 'mongoose';
import { LOAN_STATUS } from '../constants/index.js';
import { DELINQUENCY_BUCKETS } from '../utils/emi.js';
import { nextSequence } from './Counter.js';

const loanAccountSchema = new mongoose.Schema(
  {
    loanNo: { type: String, unique: true, index: true },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true,
      index: true,
    },
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    sanctionedAmount: { type: Number, required: true, min: 0 },
    roi: { type: Number, required: true, min: 0 },
    tenureMonths: { type: Number, required: true, min: 1 },
    emiAmount: { type: Number, required: true, min: 0 },
    processingFee: { type: Number, default: 0 },
    /** Sanctioned amount less the processing fee actually credited to the borrower. */
    disbursedAmount: { type: Number, default: 0 },

    disbursedAt: { type: Date, default: null },
    disbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    disbursementBank: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', default: null },
    disbursementRef: { type: String, default: '' },

    startDate: { type: Date, default: null },
    firstEmiDate: { type: Date, default: null },
    maturityDate: { type: Date, default: null },

    status: {
      type: String,
      enum: Object.values(LOAN_STATUS),
      default: LOAN_STATUS.ACTIVE,
      index: true,
    },

    // Running ledger balances.
    principalOutstanding: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    principalPaid: { type: Number, default: 0 },
    interestPaid: { type: Number, default: 0 },
    penaltyAccrued: { type: Number, default: 0 },
    penaltyPaid: { type: Number, default: 0 },
    /**
     * Principal settled by a part-prepayment. Prepaid principal is removed from
     * the regenerated schedule, so it is tracked here to keep the "paid" totals
     * complete (see loanService.applyTotals).
     */
    principalPrepaid: { type: Number, default: 0 },
    /** Non-schedule charges actually collected (e.g. the foreclosure charge). */
    otherChargesPaid: { type: Number, default: 0 },

    // Delinquency snapshot, refreshed by the sweep job.
    dpd: { type: Number, default: 0, index: true },
    bucket: { type: String, enum: DELINQUENCY_BUCKETS, default: 'current', index: true },
    overdueAmount: { type: Number, default: 0 },
    overdueEmiCount: { type: Number, default: 0 },
    lastSweepAt: { type: Date, default: null },

    closedAt: { type: Date, default: null },
    closureReason: { type: String, default: '' },
    nocIssuedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

loanAccountSchema.index({ status: 1, bucket: 1 });
loanAccountSchema.index({ borrower: 1, status: 1 });

loanAccountSchema.pre('save', async function assignLoanNo(next) {
  if (!this.loanNo) {
    this.loanNo = await nextSequence('loanAccount', 'SB-LN-');
  }
  next();
});

loanAccountSchema.set('toJSON', { virtuals: true });

export { DELINQUENCY_BUCKETS };
export default mongoose.model('LoanAccount', loanAccountSchema);
