/** CollectionNote — follow-up / call-log entries against a delinquent loan. */
import mongoose from 'mongoose';
import { COLLECTION_ACTIVITY_TYPES, COLLECTION_OUTCOMES } from '../constants/index.js';

const collectionNoteSchema = new mongoose.Schema(
  {
    loanAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount',
      required: true,
      index: true,
    },
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    activityType: { type: String, enum: COLLECTION_ACTIVITY_TYPES, default: 'call' },
    outcome: { type: String, enum: COLLECTION_OUTCOMES, default: 'other' },
    notes: { type: String, required: true, maxlength: 2000 },
    promiseToPayDate: { type: Date, default: null },
    followUpDate: { type: Date, default: null },
    /** Snapshot of the ageing bucket when the note was written. */
    bucketAtEntry: { type: String, default: 'current' },
    dpdAtEntry: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

collectionNoteSchema.index({ loanAccount: 1, createdAt: -1 });
collectionNoteSchema.set('toJSON', { virtuals: true });

export default mongoose.model('CollectionNote', collectionNoteSchema);
