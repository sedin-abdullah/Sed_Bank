/**
 * Mock Aadhaar / DigiLocker e-KYC provider.
 *
 * No data ever leaves the process. Validation is real (format checks against the
 * genuine PAN/Aadhaar patterns) but verification is simulated, so the app can
 * exercise the whole KYC step without touching a live UIDAI/DigiLocker endpoint.
 */
import crypto from 'node:crypto';

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const AADHAAR_REGEX = /^\d{12}$/;

const ref = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

/**
 * Verifies a PAN. Structurally invalid PANs fail; anything well-formed passes,
 * except the reserved test PAN `AAAAA0000A` which always fails so the unhappy
 * path is reachable from the UI.
 */
export function verifyPan(pan) {
  const value = String(pan || '').toUpperCase().trim();

  if (!PAN_REGEX.test(value)) {
    return { verified: false, reason: 'PAN format is invalid. Expected AAAAA9999A.', referenceId: null };
  }
  if (value === 'AAAAA0000A') {
    return { verified: false, reason: 'PAN not found in the issuing authority records.', referenceId: null };
  }

  return {
    verified: true,
    reason: '',
    referenceId: ref('PAN'),
    provider: 'mock-nsdl',
    nameOnRecord: null, // A real provider would return the registered name here.
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Verifies an Aadhaar number. Only the last four digits are ever returned —
 * the caller must never persist the full number.
 */
export function verifyAadhaar(aadhaar) {
  const value = String(aadhaar || '').replace(/\s|-/g, '');

  if (!AADHAAR_REGEX.test(value)) {
    return { verified: false, reason: 'Aadhaar must be 12 digits.', last4: '', referenceId: null };
  }
  if (value === '000000000000') {
    return { verified: false, reason: 'Aadhaar could not be authenticated.', last4: '', referenceId: null };
  }

  return {
    verified: true,
    reason: '',
    last4: value.slice(-4),
    referenceId: ref('UID'),
    provider: 'mock-digilocker',
    verifiedAt: new Date().toISOString(),
  };
}

/** Simulated liveness/selfie check — always passes in the sandbox. */
export function verifySelfie() {
  return {
    verified: true,
    confidence: 0.97,
    referenceId: ref('LIV'),
    provider: 'mock-liveness',
    verifiedAt: new Date().toISOString(),
  };
}

export default { verifyPan, verifyAadhaar, verifySelfie, PAN_REGEX, AADHAAR_REGEX };
