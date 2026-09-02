/**
 * Single source of truth for domain enums.
 * Keep in sync with the frontend copy at frontend/src/lib/constants.js.
 */

export const ROLES = {
  CUSTOMER: 'customer',
  CREDIT_OFFICER: 'credit_officer',
  OPS_OFFICER: 'ops_officer',
  COLLECTIONS_OFFICER: 'collections_officer',
  ADMIN: 'admin',
};

export const ROLE_LIST = Object.values(ROLES);

/** Every role that belongs to the internal (admin) portal. */
export const STAFF_ROLES = [
  ROLES.CREDIT_OFFICER,
  ROLES.OPS_OFFICER,
  ROLES.COLLECTIONS_OFFICER,
  ROLES.ADMIN,
];

export const USER_STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' };

export const KYC_STATUS = {
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
};

export const APPLICATION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  IN_REVIEW: 'in_review',
  SENT_BACK: 'sent_back',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  OFFER_ACCEPTED: 'offer_accepted',
  AGREEMENT_SIGNED: 'agreement_signed',
  DISBURSED: 'disbursed',
  CANCELLED: 'cancelled',
};

export const APPLICATION_STATUS_LIST = Object.values(APPLICATION_STATUS);

/** Statuses that still sit in an officer's worklist. */
export const OPEN_UNDERWRITING_STATUSES = [
  APPLICATION_STATUS.SUBMITTED,
  APPLICATION_STATUS.IN_REVIEW,
  APPLICATION_STATUS.SENT_BACK,
];

/** Ordered stages powering the customer-facing progress stepper. */
export const APPLICATION_STAGES = [
  'eligibility',
  'application',
  'kyc',
  'documents',
  'bureau',
  'offer',
  'esign',
  'disbursement',
  'completed',
];

export const DOCUMENT_TYPES = {
  INCOME_PROOF: 'income_proof',
  ADDRESS_PROOF: 'address_proof',
  ID_PROOF: 'id_proof',
  BANK_STATEMENT: 'bank_statement',
  OTHER: 'other',
};

export const DOCUMENT_TYPE_LIST = Object.values(DOCUMENT_TYPES);

export const VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const DECISION = {
  AUTO_APPROVED: 'auto_approved',
  AUTO_REJECTED: 'auto_rejected',
  ROUTED_MANUAL: 'routed_manual',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SENT_BACK: 'sent_back',
};

export const MANUAL_DECISIONS = [DECISION.APPROVED, DECISION.REJECTED, DECISION.SENT_BACK];

export const EMPLOYMENT_TYPES = ['salaried', 'self_employed', 'business_owner', 'professional'];

export const LOAN_PURPOSES = [
  'medical',
  'education',
  'travel',
  'wedding',
  'home_renovation',
  'debt_consolidation',
  'business',
  'other',
];

export const LOAN_STATUS = {
  ACTIVE: 'active',
  OVERDUE: 'overdue',
  CLOSED: 'closed',
  FORECLOSED: 'foreclosed',
  WRITTEN_OFF: 'written_off',
};

export const LIVE_LOAN_STATUSES = [LOAN_STATUS.ACTIVE, LOAN_STATUS.OVERDUE];

export const EMI_STATUS = {
  PENDING: 'pending',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  WAIVED: 'waived',
};

export const PAYMENT_TYPES = {
  EMI: 'emi',
  PART_PAYMENT: 'part_payment',
  FORECLOSURE: 'foreclosure',
};

export const PAYMENT_MODES = ['upi', 'netbanking', 'card', 'neft', 'cash', 'cheque', 'mock_gateway'];

export const PAYMENT_STATUS = { PENDING: 'pending', SUCCESS: 'success', FAILED: 'failed' };

export const BANK_TYPES = { PARTNER: 'partner', DISBURSEMENT: 'disbursement' };

export const COLLECTION_ACTIVITY_TYPES = ['call', 'email', 'sms', 'visit', 'note'];

export const COLLECTION_OUTCOMES = [
  'promise_to_pay',
  'no_answer',
  'wrong_number',
  'dispute',
  'paid',
  'refused',
  'other',
];

export const OTP_PURPOSES = {
  SIGNUP: 'signup',
  LOGIN: 'login',
  ESIGN: 'esign',
};

export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error'];

/** Socket.IO event names shared with the frontend client. */
export const EVENTS = {
  APPLICATION_CREATED: 'application:created',
  APPLICATION_UPDATED: 'application:updated',
  LOAN_UPDATED: 'loan:updated',
  PAYMENT_RECORDED: 'payment:recorded',
  NOTIFICATION_NEW: 'notification:new',
  DATA_CHANGED: 'data:changed',
};

export default {
  ROLES,
  ROLE_LIST,
  STAFF_ROLES,
  USER_STATUS,
  KYC_STATUS,
  APPLICATION_STATUS,
  APPLICATION_STATUS_LIST,
  OPEN_UNDERWRITING_STATUSES,
  APPLICATION_STAGES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LIST,
  VERIFICATION_STATUS,
  DECISION,
  MANUAL_DECISIONS,
  EMPLOYMENT_TYPES,
  LOAN_PURPOSES,
  LOAN_STATUS,
  LIVE_LOAN_STATUSES,
  EMI_STATUS,
  PAYMENT_TYPES,
  PAYMENT_MODES,
  PAYMENT_STATUS,
  BANK_TYPES,
  COLLECTION_ACTIVITY_TYPES,
  COLLECTION_OUTCOMES,
  OTP_PURPOSES,
  NOTIFICATION_TYPES,
  EVENTS,
};
