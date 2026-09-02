/**
 * Domain constants and display metadata.
 * Enum values mirror backend/src/constants/index.js; the labels and colours
 * that go with them live only here, on the presentation side.
 */

export const ROLES = {
  CUSTOMER: 'customer',
  CREDIT_OFFICER: 'credit_officer',
  OPS_OFFICER: 'ops_officer',
  COLLECTIONS_OFFICER: 'collections_officer',
  ADMIN: 'admin',
};

export const STAFF_ROLES = [
  ROLES.CREDIT_OFFICER,
  ROLES.OPS_OFFICER,
  ROLES.COLLECTIONS_OFFICER,
  ROLES.ADMIN,
];

export const isStaff = (role) => STAFF_ROLES.includes(role);

export const ROLE_LABELS = {
  customer: 'Customer',
  credit_officer: 'Credit Officer',
  ops_officer: 'Ops Officer',
  collections_officer: 'Collections Officer',
  admin: 'Administrator',
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

/**
 * Status presentation: label + badge tone.
 * Tones map to the semantic palette (see tailwind.config.js).
 */
export const STATUS_META = {
  // Applications
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'New', tone: 'info' },
  in_review: { label: 'In Review', tone: 'warning' },
  sent_back: { label: 'Sent Back', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  offer_accepted: { label: 'Offer Accepted', tone: 'info' },
  agreement_signed: { label: 'Signed', tone: 'info' },
  disbursed: { label: 'Disbursed', tone: 'success' },
  cancelled: { label: 'Withdrawn', tone: 'neutral' },

  // Loans
  active: { label: 'Active', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
  foreclosed: { label: 'Foreclosed', tone: 'neutral' },
  written_off: { label: 'Written Off', tone: 'danger' },

  // EMIs
  pending: { label: 'Pending', tone: 'neutral' },
  partially_paid: { label: 'Partly Paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  waived: { label: 'Waived', tone: 'neutral' },

  // Documents / KYC
  verified: { label: 'Verified', tone: 'success' },
  not_started: { label: 'Not Started', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },

  // Users / banks
  inactive: { label: 'Inactive', tone: 'neutral' },

  // Payments
  success: { label: 'Success', tone: 'success' },
};

export const statusMeta = (value) =>
  STATUS_META[value] || { label: String(value || '—').replace(/_/g, ' '), tone: 'neutral' };

/** Filter options for the application worklist. */
export const APPLICATION_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'queue', label: 'Needs review' },
  { value: 'submitted', label: 'New' },
  { value: 'in_review', label: 'In review' },
  { value: 'sent_back', label: 'Sent back' },
  { value: 'approved', label: 'Approved' },
  { value: 'offer_accepted', label: 'Offer accepted' },
  { value: 'agreement_signed', label: 'Signed' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Withdrawn' },
];

export const LOAN_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
  { value: 'foreclosed', label: 'Foreclosed' },
];

export const EMPLOYMENT_TYPES = [
  { value: 'salaried', label: 'Salaried' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'business_owner', label: 'Business owner' },
  { value: 'professional', label: 'Professional' },
];

export const LOAN_PURPOSES = [
  { value: 'medical', label: 'Medical expenses' },
  { value: 'education', label: 'Education' },
  { value: 'travel', label: 'Travel' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'home_renovation', label: 'Home renovation' },
  { value: 'debt_consolidation', label: 'Debt consolidation' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' },
];

export const DOCUMENT_TYPES = [
  { value: 'income_proof', label: 'Income proof (payslip / ITR)' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'id_proof', label: 'Identity proof' },
  { value: 'bank_statement', label: 'Bank statement' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_TYPES = [
  { value: 'emi', label: 'EMI payment' },
  { value: 'part_payment', label: 'Part payment (reduces principal)' },
  { value: 'foreclosure', label: 'Foreclosure (settle in full)' },
];

export const PAYMENT_MODES = [
  { value: 'neft', label: 'NEFT / IMPS' },
  { value: 'upi', label: 'UPI' },
  { value: 'netbanking', label: 'Net banking' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

export const BANK_TYPES = [
  { value: 'disbursement', label: 'Disbursement account' },
  { value: 'partner', label: 'Partner bank' },
];

export const COLLECTION_ACTIVITY_TYPES = [
  { value: 'call', label: 'Phone call' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'visit', label: 'Field visit' },
  { value: 'note', label: 'Internal note' },
];

export const COLLECTION_OUTCOMES = [
  { value: 'promise_to_pay', label: 'Promise to pay' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'dispute', label: 'Dispute raised' },
  { value: 'paid', label: 'Paid' },
  { value: 'refused', label: 'Refused to pay' },
  { value: 'other', label: 'Other' },
];

export const DELINQUENCY_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];

export const BUCKET_LABELS = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
};

/** Ordered stages of the origination journey (drives the stepper). */
export const APPLICATION_STAGES = [
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'application', label: 'Application' },
  { key: 'kyc', label: 'KYC' },
  { key: 'documents', label: 'Documents' },
  { key: 'bureau', label: 'Credit check' },
  { key: 'offer', label: 'Offer' },
  { key: 'esign', label: 'e-Sign' },
  { key: 'disbursement', label: 'Disbursement' },
];

/** One plain-English line per journey stage, for the lifecycle detail panel. */
export const STAGE_DETAIL = {
  eligibility:
    'An indicative check against the product rules. Nothing is recorded against your credit file at this point.',
  application:
    'Your loan amount, tenure, purpose, employment and personal details, submitted for assessment.',
  kyc: 'PAN and Aadhaar verification. Both are validated before the application can move on.',
  documents:
    'Income and address proof, uploaded by you and then verified by our operations team.',
  bureau:
    'A credit bureau score is pulled and scored against policy. An excellent score is approved straight through; a mid-band score goes to a credit officer.',
  offer:
    'Your sanctioned amount, interest rate, tenure and EMI. The offer stands until you accept it.',
  esign:
    'The loan agreement, signed with a one-time password. The simulated e-sign leaves an audit trail.',
  disbursement:
    'Funds are released to your verified payout account and the EMI schedule begins.',
};

export const BUREAU_SIMULATIONS = [
  { value: 'random', label: 'Random score (realistic)' },
  { value: 'excellent', label: 'Excellent (800–900)' },
  { value: 'very_good', label: 'Very good (750–799)' },
  { value: 'good', label: 'Good (700–749)' },
  { value: 'fair', label: 'Fair (650–699)' },
  { value: 'poor', label: 'Poor (550–649)' },
  { value: 'bad', label: 'Bad (300–549)' },
];

/** Socket.IO event names — must match backend/src/constants/index.js. */
export const EVENTS = {
  APPLICATION_CREATED: 'application:created',
  APPLICATION_UPDATED: 'application:updated',
  LOAN_UPDATED: 'loan:updated',
  PAYMENT_RECORDED: 'payment:recorded',
  NOTIFICATION_NEW: 'notification:new',
  DATA_CHANGED: 'data:changed',
};

export const DEMO_ACCOUNTS = [
  { role: 'admin', email: 'admin@sedbank.test', password: 'Admin@12345', label: 'Admin' },
  { role: 'credit_officer', email: 'credit@sedbank.test', password: 'Staff@12345', label: 'Credit' },
  { role: 'ops_officer', email: 'ops@sedbank.test', password: 'Staff@12345', label: 'Ops' },
  {
    role: 'collections_officer',
    email: 'collections@sedbank.test',
    password: 'Staff@12345',
    label: 'Collections',
  },
  { role: 'customer', email: 'customer@sedbank.test', password: 'Customer@12345', label: 'Customer' },
];
