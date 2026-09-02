/**
 * Payment — the money ledger. Every successful collection (self-serve via the
 * mock gateway, or manually recorded by ops) writes one row here with its
 * penalty/interest/principal split so statements reconcile exactly.
 */
import mongoose from 'mongoose';
import { PAYMENT_TYPES, PAYMENT_MODES, PAYMENT_STATUS } from '../constants/index.js';
import { nextSequence } from './Counter.js';

const allocationSchema = new mongoose.Schema(
  {
    emi: { type: mongoose.Schema.Types.ObjectId, ref: 'EMISchedule' },
    installmentNo: Number,
    penalty: { type: Number, default: 0 },
    interest: { type: Number, default: 0 },
    principal: { type: Number, default: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    paymentNo: { type: String, unique: true, index: true },
    loanAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount',
      required: true,
      index: true,
    },
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: Object.values(PAYMENT_TYPES), default: PAYMENT_TYPES.EMI },
    mode: { type: String, enum: PAYMENT_MODES, default: 'mock_gateway' },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.SUCCESS,
      index: true,
    },

    // How the amount was split when applied to the schedule.
    principalComponent: { type: Number, default: 0 },
    interestComponent: { type: Number, default: 0 },
    penaltyComponent: { type: Number, default: 0 },
    excessAmount: { type: Number, default: 0 },
    allocations: { type: [allocationSchema], default: [] },

    /** Mock gateway order/transaction reference. */
    gatewayRef: { type: String, default: '' },
    /** Set when ops records an offline payment on the borrower's behalf. */
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
    paidAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ loanAccount: 1, paidAt: -1 });

paymentSchema.pre('save', async function assignPaymentNo(next) {
  if (!this.paymentNo) {
    this.paymentNo = await nextSequence('payment', 'SB-PAY-', 6);
  }
  next();
});

paymentSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Payment', paymentSchema);
