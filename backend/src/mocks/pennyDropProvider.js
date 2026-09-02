/**
 * Mock bank-account penny-drop verification.
 * Validates the account number / IFSC shape and returns a simulated
 * "name at bank" match, exactly like a real payout partner would.
 */
import crypto from 'node:crypto';

export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_REGEX = /^\d{9,18}$/;

export function verifyBankAccount({ accountNumber, ifsc, accountHolder }) {
  const acc = String(accountNumber || '').trim();
  const code = String(ifsc || '').toUpperCase().trim();

  if (!ACCOUNT_REGEX.test(acc)) {
    return { verified: false, reason: 'Account number must be 9–18 digits.' };
  }
  if (!IFSC_REGEX.test(code)) {
    return { verified: false, reason: 'IFSC format is invalid. Expected e.g. HDFC0001234.' };
  }
  // Reserved failing account so the unhappy path stays reachable from the UI.
  if (acc.endsWith('0000')) {
    return { verified: false, reason: 'Penny drop failed — account is inactive or frozen.' };
  }

  return {
    verified: true,
    reason: '',
    nameAtBank: accountHolder || 'ACCOUNT HOLDER',
    nameMatchScore: 1,
    bankName: `${code.slice(0, 4)} Bank`,
    branchCode: code.slice(-6),
    referenceId: `PD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    amountCredited: 1,
    provider: 'mock-penny-drop',
    verifiedAt: new Date().toISOString(),
  };
}

export default { verifyBankAccount, IFSC_REGEX, ACCOUNT_REGEX };
