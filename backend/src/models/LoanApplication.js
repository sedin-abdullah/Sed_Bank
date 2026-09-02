/**
 * LoanApplication — the origination (LOS) aggregate. It carries the applicant's
 * declared details plus the state of every downstream step (KYC, bureau, offer,
 * e-sign, bank verification) so the customer stepper can render from one document.
 */
import mongoose from 'mongoose';
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_LIST,
  APPLICATION_STAGES,
  EMPLOYMENT_TYPES,
  LOAN_PURPOSES,
  KYC_STATUS,
} from '../constants/index.js';
import { nextSequence } from './Counter.js';

const employmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    employerName: { type: String, trim: true, default: '' },
    monthlyIncome: { type: Number, required: true, min: 0 },
    existingEmi: { type: Number, default: 0, min: 0 },
    experienceYears: { type: Number, default: 0, min: 0, max: 60 },
  },
  { _id: false }
);

const personalSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: '' },
    dob: { type: Date, default: null },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const kycSchema = new mongoose.Schema(
  {
    pan: { type: String, uppercase: true, trim: true, default: '' },
    /** Only the last four Aadhaar digits are ever persisted. */
    aadhaarLast4: { type: String, trim: true, default: '' },
    panVerified: { type: Boolean, default: false },
    aadhaarVerified: { type: Boolean, default: false },
    selfieVerified: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(KYC_STATUS), default: KYC_STATUS.NOT_STARTED },
    provider: { type: String, default: 'mock-digilocker' },
    referenceId: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const offerSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    tenureMonths: { type: Number, default: 0 },
    emi: { type: Number, default: 0 },
    processingFee: { type: Number, default: 0 },
    totalInterest: { type: Number, default: 0 },
    totalPayable: { type: Number, default: 0 },
    generatedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const agreementSchema = new mongoose.Schema(
  {
    otpVerified: { type: Boolean, default: false },
    signedAt: { type: Date, default: null },
    consentText: { type: String, default: '' },
    signerIp: { type: String, default: '' },
    referenceId: { type: String, default: '' },
  },
  { _id: false }
);

const bankAccountSchema = new mongoose.Schema(
  {
    accountHolder: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
    ifsc: { type: String, uppercase: true, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    /** Mock penny-drop reference for the audit trail. */
    pennyDropRef: { type: String, default: '' },
  },
  { _id: false }
);

const remarkSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: 'System' },
    at: { type: Date, default: Date.now },
    kind: { type: String, default: 'note' },
  },
  { _id: false }
);

const loanApplicationSchema = new mongoose.Schema(
  {
    applicationNo: { type: String, unique: true, index: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productCode: { type: String, default: 'PL' },
    productName: { type: String, default: 'Personal Loan' },

    amountRequested: { type: Number, required: true, min: 0 },
    tenureRequested: { type: Number, required: true, min: 1 },
    purpose: { type: String, enum: LOAN_PURPOSES, required: true },
    purposeNote: { type: String, trim: true, default: '' },

    employment: { type: employmentSchema, required: true },
    personal: { type: personalSchema, default: () => ({}) },
    kyc: { type: kycSchema, default: () => ({}) },
    offer: { type: offerSchema, default: () => ({}) },
    agreement: { type: agreementSchema, default: () => ({}) },
    bankAccount: { type: bankAccountSchema, default: () => ({}) },

    status: {
      type: String,
      enum: APPLICATION_STATUS_LIST,
      default: APPLICATION_STATUS.DRAFT,
      index: true,
    },
    stage: { type: String, enum: APPLICATION_STAGES, default: 'application' },

    bureauReport: { type: mongoose.Schema.Types.ObjectId, ref: 'BureauReport', default: null },
    bureauScore: { type: Number, default: null },
    /** Snapshot of FOIR at decision time, kept for the underwriting 360 view. */
    dti: { type: Number, default: null },

    loanAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanAccount', default: null },

    submittedAt: { type: Date, default: null },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decisionType: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },

    remarks: { type: [remarkSchema], default: [] },
  },
  { timestamps: true }
);

// Worklist queries filter by status and sort by recency.
loanApplicationSchema.index({ status: 1, createdAt: -1 });
loanApplicationSchema.index({ applicant: 1, createdAt: -1 });

loanApplicationSchema.pre('save', async function assignApplicationNo(next) {
  if (!this.applicationNo) {
    this.applicationNo = await nextSequence('loanApplication', 'SB-APP-');
  }
  next();
});

loanApplicationSchema.set('toJSON', { virtuals: true });

export default mongoose.model('LoanApplication', loanApplicationSchema);
