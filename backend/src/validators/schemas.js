/**
 * Zod request schemas — the server-side half of "validate on both sides".
 * The frontend validates for UX; these run regardless of what the client does.
 */
import { z } from 'zod';
import {
  ROLE_LIST,
  APPLICATION_STATUS_LIST,
  DOCUMENT_TYPE_LIST,
  VERIFICATION_STATUS,
  EMPLOYMENT_TYPES,
  LOAN_PURPOSES,
  MANUAL_DECISIONS,
  PAYMENT_TYPES,
  PAYMENT_MODES,
  BANK_TYPES,
  COLLECTION_ACTIVITY_TYPES,
  COLLECTION_OUTCOMES,
  USER_STATUS,
  LOAN_STATUS,
} from '../constants/index.js';
import { DELINQUENCY_BUCKETS } from '../utils/emi.js';

/* ---------------------------------------------------------------- */
/* Primitives                                                        */
/* ---------------------------------------------------------------- */

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id.');

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.');

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');

/**
 * Password policy: 8+ characters with a letter, a digit and a symbol.
 * Enforced server-side so a bypassed UI cannot create a weak account.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .regex(/[A-Za-z]/, 'Password must include a letter.')
  .regex(/\d/, 'Password must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

const pan = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN (e.g. ABCDE1234F).');

const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC (e.g. HDFC0001234).');

const money = (label = 'Amount') =>
  z.coerce.number({ invalid_type_error: `${label} must be a number.` }).finite().nonnegative();

const positiveMoney = (label = 'Amount') =>
  z.coerce.number({ invalid_type_error: `${label} must be a number.` }).finite().positive();

const otpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.');

const remarks = z
  .string()
  .trim()
  .min(5, 'Please provide a remark of at least 5 characters.')
  .max(1000);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
});

/* ---------------------------------------------------------------- */
/* Auth                                                              */
/* ---------------------------------------------------------------- */

export const authSchemas = {
  register: z.object({
    name: z.string().trim().min(2, 'Enter your full name.').max(120),
    email,
    mobile,
    password,
  }),
  login: z.object({
    email,
    password: z.string().min(1, 'Enter your password.'),
  }),
  requestOtp: z.object({
    mobile,
    purpose: z.enum(['signup', 'login']).default('login'),
  }),
  verifyOtp: z.object({
    mobile,
    code: otpCode,
    purpose: z.enum(['signup', 'login']).default('login'),
  }),
  updateProfile: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    mobile: mobile.optional(),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: password,
  }),
};

/* ---------------------------------------------------------------- */
/* Eligibility                                                       */
/* ---------------------------------------------------------------- */

export const eligibilitySchema = z.object({
  monthlyIncome: positiveMoney('Monthly income'),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  existingEmi: money('Existing EMI').default(0),
  desiredAmount: money('Desired amount').optional(),
  tenureMonths: z.coerce.number().int().min(1).max(360).optional(),
});

/* ---------------------------------------------------------------- */
/* Applications                                                      */
/* ---------------------------------------------------------------- */

const employment = z.object({
  type: z.enum(EMPLOYMENT_TYPES, { required_error: 'Select your employment type.' }),
  employerName: z.string().trim().max(160).optional().default(''),
  monthlyIncome: positiveMoney('Monthly income'),
  existingEmi: money('Existing EMI').default(0),
  experienceYears: z.coerce.number().min(0).max(60).default(0),
});

const personal = z.object({
  fullName: z.string().trim().max(120).optional(),
  dob: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a valid 6-digit pincode.')
    .optional(),
});

export const applicationSchemas = {
  create: z.object({
    amountRequested: positiveMoney('Loan amount'),
    tenureRequested: z.coerce.number().int().min(1, 'Select a tenure.').max(360),
    purpose: z.enum(LOAN_PURPOSES, { required_error: 'Select the purpose of the loan.' }),
    purposeNote: z.string().trim().max(300).optional().default(''),
    employment,
    personal: personal.optional().default({}),
    // When false the application is stored as a draft the customer can resume.
    submit: z.boolean().default(true),
  }),

  update: z
    .object({
      amountRequested: positiveMoney('Loan amount').optional(),
      tenureRequested: z.coerce.number().int().min(1).max(360).optional(),
      purpose: z.enum(LOAN_PURPOSES).optional(),
      purposeNote: z.string().trim().max(300).optional(),
      employment: employment.partial().optional(),
      personal: personal.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update.' }),

  kyc: z.object({
    pan,
    aadhaar: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ''))
      .refine((value) => /^\d{12}$/.test(value), 'Aadhaar must be 12 digits.'),
  }),

  document: z.object({
    type: z.enum(DOCUMENT_TYPE_LIST, { required_error: 'Select a document type.' }),
  }),

  verifyDocument: z.object({
    status: z.enum([VERIFICATION_STATUS.VERIFIED, VERIFICATION_STATUS.REJECTED]),
    remarks: z.string().trim().max(500).optional().default(''),
  }),

  bureau: z.object({
    // Honoured only when ENABLE_TEST_HOOKS=true; lets QA drive each decision branch.
    simulate: z
      .enum(['excellent', 'very_good', 'good', 'fair', 'poor', 'bad', 'random'])
      .optional(),
  }),

  esign: z.object({ code: otpCode }),

  bankAccount: z.object({
    accountHolder: z.string().trim().min(2, 'Enter the account holder name.').max(120),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, 'Account number must be 9–18 digits.'),
    ifsc,
  }),

  list: pagination.extend({
    status: z.enum([...APPLICATION_STATUS_LIST, 'all', 'queue']).optional(),
    applicant: objectId.optional(),
  }),
};

/* ---------------------------------------------------------------- */
/* Underwriting                                                      */
/* ---------------------------------------------------------------- */

export const underwritingSchemas = {
  decision: z
    .object({
      decision: z.enum(MANUAL_DECISIONS, { required_error: 'Select a decision.' }),
      remarks,
      approvedAmount: positiveMoney('Approved amount').optional(),
      roi: z.coerce.number().min(0).max(60).optional(),
      tenureMonths: z.coerce.number().int().min(1).max(360).optional(),
    })
    .refine(
      (data) => data.decision !== 'approved' || data.approvedAmount === undefined || data.approvedAmount > 0,
      { message: 'Approved amount must be greater than zero.', path: ['approvedAmount'] }
    ),
};

/* ---------------------------------------------------------------- */
/* Loans, payments                                                   */
/* ---------------------------------------------------------------- */

export const loanSchemas = {
  disburse: z.object({
    bankId: objectId.optional(),
  }),
  list: pagination.extend({
    status: z.enum([...Object.values(LOAN_STATUS), 'all']).optional(),
    bucket: z.enum([...DELINQUENCY_BUCKETS, 'all']).optional(),
    borrower: objectId.optional(),
  }),
};

export const paymentSchemas = {
  initiate: z.object({
    loanId: objectId,
    amount: positiveMoney('Payment amount'),
    type: z.enum(Object.values(PAYMENT_TYPES)).default(PAYMENT_TYPES.EMI),
  }),
  confirm: z.object({
    orderId: z.string().min(10, 'Missing gateway order reference.'),
    paymentId: z.string().min(6, 'Missing gateway payment reference.'),
    signature: z.string().min(16, 'Missing gateway signature.'),
    type: z.enum(Object.values(PAYMENT_TYPES)).optional(),
  }),
  record: z.object({
    loanId: objectId,
    amount: positiveMoney('Payment amount'),
    type: z.enum(Object.values(PAYMENT_TYPES)).default(PAYMENT_TYPES.EMI),
    mode: z.enum(PAYMENT_MODES).default('neft'),
    notes: z.string().trim().max(500).optional().default(''),
  }),
  list: pagination.extend({
    loanAccount: objectId.optional(),
    type: z.enum([...Object.values(PAYMENT_TYPES), 'all']).optional(),
  }),
};

/* ---------------------------------------------------------------- */
/* Collections                                                       */
/* ---------------------------------------------------------------- */

export const collectionSchemas = {
  note: z.object({
    activityType: z.enum(COLLECTION_ACTIVITY_TYPES).default('call'),
    outcome: z.enum(COLLECTION_OUTCOMES).default('other'),
    notes: z.string().trim().min(3, 'Enter a note.').max(2000),
    promiseToPayDate: z.coerce.date().optional(),
    followUpDate: z.coerce.date().optional(),
  }),
  list: pagination.extend({
    bucket: z.enum([...DELINQUENCY_BUCKETS, 'all']).optional(),
  }),
  remind: z.object({
    loanIds: z.array(objectId).min(1, 'Select at least one account.').max(200),
    message: z.string().trim().max(500).optional().default(''),
  }),
};

/* ---------------------------------------------------------------- */
/* Admin masters                                                     */
/* ---------------------------------------------------------------- */

export const userSchemas = {
  create: z.object({
    name: z.string().trim().min(2, 'Enter a name.').max(120),
    email,
    mobile,
    // Optional: a generated password is returned when omitted.
    password: password.optional(),
    role: z.enum(ROLE_LIST),
    status: z.enum(Object.values(USER_STATUS)).default(USER_STATUS.ACTIVE),
  }),
  update: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      mobile: mobile.optional(),
      role: z.enum(ROLE_LIST).optional(),
      status: z.enum(Object.values(USER_STATUS)).optional(),
      password: password.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update.' }),
  list: pagination.extend({
    role: z.enum([...ROLE_LIST, 'all', 'staff']).optional(),
    status: z.enum([...Object.values(USER_STATUS), 'all']).optional(),
  }),
};

export const bankSchemas = {
  create: z.object({
    name: z.string().trim().min(2, 'Enter the bank name.').max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, 'Enter a short code.')
      .max(20)
      .regex(/^[A-Z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only.'),
    type: z.enum(Object.values(BANK_TYPES)).default(BANK_TYPES.DISBURSEMENT),
    accountName: z.string().trim().max(120).optional().default(''),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, 'Account number must be 9–18 digits.')
      .optional()
      .or(z.literal('')),
    ifsc: ifsc.optional().or(z.literal('')),
    branch: z.string().trim().max(120).optional().default(''),
    contactPerson: z.string().trim().max(120).optional().default(''),
    contactEmail: email.optional().or(z.literal('')),
    status: z.enum(Object.values(USER_STATUS)).default(USER_STATUS.ACTIVE),
  }),
  list: pagination.extend({
    type: z.enum([...Object.values(BANK_TYPES), 'all']).optional(),
    status: z.enum([...Object.values(USER_STATUS), 'all']).optional(),
  }),
};

bankSchemas.update = bankSchemas.create
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update.' });

/* ---------------------------------------------------------------- */
/* Configuration                                                     */
/* ---------------------------------------------------------------- */

const productConfig = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  minAmount: positiveMoney('Minimum amount').optional(),
  maxAmount: positiveMoney('Maximum amount').optional(),
  minTenureMonths: z.coerce.number().int().min(1).max(360).optional(),
  maxTenureMonths: z.coerce.number().int().min(1).max(360).optional(),
  minRoi: z.coerce.number().min(0).max(60).optional(),
  maxRoi: z.coerce.number().min(0).max(60).optional(),
  processingFeePct: z.coerce.number().min(0).max(10).optional(),
  latePenaltyPct: z.coerce.number().min(0).max(25).optional(),
  foreclosureChargePct: z.coerce.number().min(0).max(10).optional(),
});

const underwritingConfig = z.object({
  minScore: z.coerce.number().int().min(300).max(900).optional(),
  autoApproveScore: z.coerce.number().int().min(300).max(900).optional(),
  maxDti: z.coerce.number().min(0.05).max(0.9).optional(),
  minMonthlyIncome: money('Minimum income').optional(),
  blacklistedPans: z.array(pan).max(500).optional(),
  riskPricing: z
    .array(
      z.object({
        minScore: z.coerce.number().int().min(300).max(900),
        roi: z.coerce.number().min(0).max(60),
        label: z.string().trim().max(40).optional().default(''),
      })
    )
    .min(1)
    .optional(),
});

export const configSchema = z
  .object({
    product: productConfig.optional(),
    underwriting: underwritingConfig.optional(),
  })
  .refine((data) => data.product || data.underwriting, { message: 'Nothing to update.' })
  // Cross-field consistency: a range must not invert.
  .refine(
    (data) =>
      !data.product ||
      data.product.minAmount === undefined ||
      data.product.maxAmount === undefined ||
      data.product.minAmount <= data.product.maxAmount,
    { message: 'Minimum amount cannot exceed the maximum amount.', path: ['product', 'minAmount'] }
  )
  .refine(
    (data) =>
      !data.product ||
      data.product.minTenureMonths === undefined ||
      data.product.maxTenureMonths === undefined ||
      data.product.minTenureMonths <= data.product.maxTenureMonths,
    { message: 'Minimum tenure cannot exceed the maximum tenure.', path: ['product', 'minTenureMonths'] }
  )
  .refine(
    (data) =>
      !data.product ||
      data.product.minRoi === undefined ||
      data.product.maxRoi === undefined ||
      data.product.minRoi <= data.product.maxRoi,
    { message: 'Minimum rate cannot exceed the maximum rate.', path: ['product', 'minRoi'] }
  )
  .refine(
    (data) =>
      !data.underwriting ||
      data.underwriting.minScore === undefined ||
      data.underwriting.autoApproveScore === undefined ||
      data.underwriting.minScore <= data.underwriting.autoApproveScore,
    {
      message: 'The rejection floor cannot be above the auto-approval threshold.',
      path: ['underwriting', 'minScore'],
    }
  );

/* ---------------------------------------------------------------- */
/* Notifications, mocks, test hooks                                  */
/* ---------------------------------------------------------------- */

export const notificationSchemas = {
  list: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    unreadOnly: z.coerce.boolean().default(false),
  }),
};

export const mockSchemas = {
  kyc: z.object({
    pan: z.string().trim().optional(),
    aadhaar: z.string().trim().optional(),
  }),
  bureau: z.object({
    simulate: z
      .enum(['excellent', 'very_good', 'good', 'fair', 'poor', 'bad', 'random'])
      .default('random'),
    forceScore: z.coerce.number().int().min(300).max(900).optional(),
  }),
  pennyDrop: z.object({
    accountNumber: z.string().trim(),
    ifsc: z.string().trim(),
    accountHolder: z.string().trim().optional(),
  }),
  order: z.object({
    amount: positiveMoney('Amount'),
    loanAccountId: z.string().trim().default('demo'),
    purpose: z.string().trim().default('emi'),
  }),
};

export const testingSchemas = {
  backdate: z.object({
    loanId: objectId,
    days: z.coerce.number().int().min(1).max(2000),
  }),
  reset: z.object({
    confirm: z.literal('RESET', {
      errorMap: () => ({ message: 'Send confirm: "RESET" to proceed.' }),
    }),
  }),
};

export const idParam = z.object({ id: objectId });

export default {
  authSchemas,
  eligibilitySchema,
  applicationSchemas,
  underwritingSchemas,
  loanSchemas,
  paymentSchemas,
  collectionSchemas,
  userSchemas,
  bankSchemas,
  configSchema,
  notificationSchemas,
  mockSchemas,
  testingSchemas,
  idParam,
  pagination,
  objectId,
};
