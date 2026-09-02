/** EMISchedule — one row per installment of a loan's amortisation schedule. */
import mongoose from 'mongoose';
import { EMI_STATUS } from '../constants/index.js';

const emiScheduleSchema = new mongoose.Schema(
  {
    loanAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount',
      required: true,
      index: true,
    },
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    installmentNo: { type: Number, required: true, min: 1 },
    dueDate: { type: Date, required: true, index: true },

    openingBalance: { type: Number, default: 0 },
    principal: { type: Number, required: true, min: 0 },
    interest: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    closingBalance: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(EMI_STATUS),
      default: EMI_STATUS.PENDING,
      index: true,
    },
    amountPaid: { type: Number, default: 0 },
    penalty: { type: Number, default: 0 },
    penaltyPaid: { type: Number, default: 0 },
    /** Set once when the installment first turns overdue so the fee is never double-charged. */
    penaltyAppliedAt: { type: Date, default: null },
    dpd: { type: Number, default: 0 },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One row per installment number per loan.
emiScheduleSchema.index({ loanAccount: 1, installmentNo: 1 }, { unique: true });
emiScheduleSchema.index({ status: 1, dueDate: 1 });

/** Outstanding on this installment, including any unpaid late fee. */
emiScheduleSchema.virtual('amountDue').get(function amountDue() {
  const due = this.totalAmount + this.penalty - this.amountPaid - this.penaltyPaid;
  return Math.max(0, Math.round((due + Number.EPSILON) * 100) / 100);
});

emiScheduleSchema.set('toJSON', { virtuals: true });

export default mongoose.model('EMISchedule', emiScheduleSchema);
