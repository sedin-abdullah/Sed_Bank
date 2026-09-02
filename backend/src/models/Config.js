/**
 * Config — a single tenant-wide settings document holding the loan product
 * definition and the underwriting rule thresholds. Nothing about pricing or
 * credit policy is hardcoded in application logic; it is all read from here.
 */
import mongoose from 'mongoose';

export const CONFIG_KEY = 'global';

const productSchema = new mongoose.Schema(
  {
    code: { type: String, default: 'PL' },
    name: { type: String, default: 'Personal Loan' },
    minAmount: { type: Number, default: 50000, min: 1000 },
    maxAmount: { type: Number, default: 2000000, min: 1000 },
    minTenureMonths: { type: Number, default: 6, min: 1 },
    maxTenureMonths: { type: Number, default: 60, min: 1 },
    minRoi: { type: Number, default: 10.5, min: 0 },
    maxRoi: { type: Number, default: 24, min: 0 },
    processingFeePct: { type: Number, default: 2, min: 0, max: 10 },
    /** Late fee charged on an EMI once it turns overdue, as % of the installment. */
    latePenaltyPct: { type: Number, default: 2, min: 0, max: 25 },
    /** Charged on the outstanding principal when a loan is foreclosed early. */
    foreclosureChargePct: { type: Number, default: 3, min: 0, max: 10 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const underwritingSchema = new mongoose.Schema(
  {
    /** Below this bureau score the application is auto-rejected. */
    minScore: { type: Number, default: 600, min: 300, max: 900 },
    /** At or above this score (and within DTI) the application is auto-approved. */
    autoApproveScore: { type: Number, default: 750, min: 300, max: 900 },
    /** Maximum share of monthly income that may go to EMIs (FOIR / DTI), 0..1. */
    maxDti: { type: Number, default: 0.5, min: 0.05, max: 0.9 },
    /** Minimum declared monthly income to qualify at all. */
    minMonthlyIncome: { type: Number, default: 15000, min: 0 },
    /** PANs that must always be rejected regardless of score. */
    blacklistedPans: { type: [String], default: [] },
    /** Score band -> interest rate, used to price approved offers. */
    riskPricing: {
      type: [
        {
          _id: false,
          minScore: Number,
          roi: Number,
          label: String,
        },
      ],
      default: [
        { minScore: 800, roi: 11.5, label: 'Excellent' },
        { minScore: 750, roi: 13.5, label: 'Very Good' },
        { minScore: 700, roi: 16, label: 'Good' },
        { minScore: 650, roi: 19, label: 'Fair' },
        { minScore: 300, roi: 23, label: 'Poor' },
      ],
    },
  },
  { _id: false }
);

const configSchema = new mongoose.Schema(
  {
    key: { type: String, default: CONFIG_KEY, unique: true, index: true },
    product: { type: productSchema, default: () => ({}) },
    underwriting: { type: underwritingSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

/** Reads the singleton, creating it with defaults on first access. */
configSchema.statics.getSingleton = async function getSingleton() {
  const existing = await this.findOne({ key: CONFIG_KEY });
  if (existing) return existing;
  return this.create({ key: CONFIG_KEY });
};

export default mongoose.model('Config', configSchema);
