/**
 * Otp — short-lived one-time codes for mobile signup/login and e-sign consent.
 *
 * The SMS channel is mocked: codes are console-logged and (outside production)
 * echoed in the API response so QA automation can complete the flow. Codes are
 * still hashed at rest and single-use, so the mock keeps the real-world shape.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { OTP_PURPOSES } from '../constants/index.js';

const otpSchema = new mongoose.Schema(
  {
    /** Mobile number, email or application id depending on purpose. */
    identifier: { type: String, required: true, index: true },
    purpose: { type: String, enum: Object.values(OTP_PURPOSES), required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

otpSchema.index({ identifier: 1, purpose: 1, createdAt: -1 });
// Housekeeping: expired codes are removed an hour after they lapse.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

otpSchema.statics.hashCode = (code) => bcrypt.hash(String(code), 8);

otpSchema.methods.matches = function matches(code) {
  return bcrypt.compare(String(code), this.codeHash);
};

export default mongoose.model('Otp', otpSchema);
