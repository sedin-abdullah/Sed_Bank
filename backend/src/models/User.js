/**
 * User — both borrowers (role: customer) and internal staff live here,
 * separated by `role`. Credentials are never returned by default.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, ROLE_LIST, STAFF_ROLES, USER_STATUS, KYC_STATUS } from '../constants/index.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Mobile must be a valid 10-digit Indian number.'],
    },
    // `select: false` keeps the hash out of every ordinary query result.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_LIST, default: ROLES.CUSTOMER, index: true },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },

    // Borrower-only KYC identifiers. Aadhaar is stored as a masked reference only —
    // the full number never touches the database.
    pan: { type: String, uppercase: true, trim: true, default: '' },
    aadhaarRef: { type: String, trim: true, default: '' },
    kycStatus: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.NOT_STARTED,
    },

    mobileVerified: { type: Boolean, default: false },
    /** Marks accounts created by the seed script so demo data is obvious in the UI. */
    isDemo: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Tested for membership rather than "not a customer" so that a document loaded
// without `role` in its projection — every populated `applicant`, for one — is
// reported as a borrower instead of silently claiming staff privileges.
userSchema.virtual('isStaff').get(function isStaff() {
  return STAFF_ROLES.includes(this.role);
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
