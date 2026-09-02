/** Document — an uploaded supporting file attached to a loan application. */
import mongoose from 'mongoose';
import { DOCUMENT_TYPE_LIST, VERIFICATION_STATUS } from '../constants/index.js';

const documentSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true,
      index: true,
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: DOCUMENT_TYPE_LIST, required: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    /** Relative URL served by the API (`/uploads/<file>`), never an absolute disk path. */
    fileUrl: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    sizeBytes: { type: Number, default: 0 },
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
      index: true,
    },
    remarks: { type: String, default: '' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

documentSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Document', documentSchema);
