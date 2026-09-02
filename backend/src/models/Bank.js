/**
 * Bank — partner banks and the house accounts money is disbursed from.
 * Mirrors the "Add Bank" master-data pattern used across the Sed* products.
 */
import mongoose from 'mongoose';
import { BANK_TYPES, USER_STATUS } from '../constants/index.js';

const bankSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    type: {
      type: String,
      enum: Object.values(BANK_TYPES),
      default: BANK_TYPES.DISBURSEMENT,
      index: true,
    },
    accountName: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
    ifsc: { type: String, uppercase: true, trim: true, default: '' },
    branch: { type: String, trim: true, default: '' },
    contactPerson: { type: String, trim: true, default: '' },
    contactEmail: { type: String, lowercase: true, trim: true, default: '' },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bankSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    // Never leak a full account number to the client.
    if (ret.accountNumber && ret.accountNumber.length > 4) {
      ret.accountNumberMasked = `XXXX${ret.accountNumber.slice(-4)}`;
    } else {
      ret.accountNumberMasked = ret.accountNumber || '';
    }
    delete ret.accountNumber;
    return ret;
  },
});

export default mongoose.model('Bank', bankSchema);
