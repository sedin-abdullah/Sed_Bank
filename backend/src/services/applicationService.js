/**
 * Loan origination (LOS) service — owns the application lifecycle from draft
 * through KYC, documents, bureau pull, offer acceptance, e-sign and the
 * borrower's payout account.
 *
 * Each step guards the statuses it is legal from, so the API can never be driven
 * out of order even if the UI is bypassed.
 */
import mongoose from 'mongoose';
import LoanApplication from '../models/LoanApplication.js';
import Document from '../models/Document.js';
import BureauReport from '../models/BureauReport.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';
import {
  APPLICATION_STATUS,
  KYC_STATUS,
  VERIFICATION_STATUS,
  ROLES,
  STAFF_ROLES,
  EVENTS,
} from '../constants/index.js';
import { round2 } from '../utils/emi.js';
import { getPolicy } from './configService.js';
import { recordAudit } from './auditService.js';
import { notifyUser, notifyStaff } from './notificationService.js';
import { runAutoDecision } from './underwritingService.js';
import { issueOtp, verifyOtp } from './otpService.js';
import kycProvider from '../mocks/kycProvider.js';
import bureauProvider from '../mocks/bureauProvider.js';
import pennyDrop from '../mocks/pennyDropProvider.js';
import { emitToStaff, emitToUser, broadcastDataChange } from '../realtime/socket.js';

/** Statuses in which the customer may still edit their application. */
const EDITABLE_STATUSES = [APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SENT_BACK];

/**
 * Loads an application and enforces ownership: customers only ever reach their
 * own records; staff reach any. This is the single choke point for that rule.
 */
export async function loadApplication(id, actor, { populate = false } = {}) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid application id.');

  let query = LoanApplication.findById(id);
  if (populate) {
    query = query
      .populate('applicant', 'name email mobile pan kycStatus createdAt')
      .populate('bureauReport')
      .populate('loanAccount', 'loanNo status sanctionedAmount emiAmount');
  }

  const application = await query;
  if (!application) throw ApiError.notFound('Application not found.');

  if (actor.role === ROLES.CUSTOMER) {
    const ownerId = application.applicant?._id ?? application.applicant;
    if (String(ownerId) !== String(actor._id)) {
      throw ApiError.forbidden('You do not have access to this application.');
    }
  }

  return application;
}

/** Blocks a customer from running two live applications at once. */
async function assertNoOpenApplication(userId) {
  const blocking = [
    APPLICATION_STATUS.DRAFT,
    APPLICATION_STATUS.SUBMITTED,
    APPLICATION_STATUS.IN_REVIEW,
    APPLICATION_STATUS.SENT_BACK,
    APPLICATION_STATUS.APPROVED,
    APPLICATION_STATUS.OFFER_ACCEPTED,
    APPLICATION_STATUS.AGREEMENT_SIGNED,
  ];

  const existing = await LoanApplication.findOne({ applicant: userId, status: { $in: blocking } });
  if (existing) {
    throw ApiError.conflict(
      `You already have an application in progress (${existing.applicationNo}). Please complete or withdraw it first.`,
      [{ field: 'application', message: 'An application is already in progress.', applicationId: String(existing._id) }]
    );
  }
}

/** Validates the requested amount/tenure against the live product configuration. */
async function assertWithinProduct({ amountRequested, tenureRequested }) {
  const { product } = await getPolicy();

  if (amountRequested < product.minAmount || amountRequested > product.maxAmount) {
    throw ApiError.badRequest(
      `Loan amount must be between ₹${product.minAmount.toLocaleString('en-IN')} and ₹${product.maxAmount.toLocaleString('en-IN')}.`,
      [{ field: 'amountRequested', message: 'Outside the permitted range for this product.' }]
    );
  }
  if (tenureRequested < product.minTenureMonths || tenureRequested > product.maxTenureMonths) {
    throw ApiError.badRequest(
      `Tenure must be between ${product.minTenureMonths} and ${product.maxTenureMonths} months.`,
      [{ field: 'tenureRequested', message: 'Outside the permitted range for this product.' }]
    );
  }
  return product;
}

/** Creates a new application. `submit: true` sends it straight to the queue. */
export async function createApplication({ payload, actor, ip = '', submit = true }) {
  await assertNoOpenApplication(actor._id);
  const product = await assertWithinProduct(payload);

  const application = new LoanApplication({
    ...payload,
    applicant: actor._id,
    productCode: product.code,
    productName: product.name,
    personal: { ...payload.personal, fullName: payload.personal?.fullName || actor.name },
    status: submit ? APPLICATION_STATUS.SUBMITTED : APPLICATION_STATUS.DRAFT,
    stage: submit ? 'kyc' : 'application',
    submittedAt: submit ? new Date() : null,
  });

  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: submit ? 'application.submitted' : 'application.created',
    description: submit
      ? `Application ${application.applicationNo} submitted for ₹${payload.amountRequested.toLocaleString('en-IN')} over ${payload.tenureRequested} months`
      : `Draft application ${application.applicationNo} created`,
    actor,
    ip,
  });

  if (submit) {
    // The worklist must update live, without an admin refresh.
    const summary = await summarise(application, actor);
    emitToStaff(EVENTS.APPLICATION_CREATED, summary);
    notifyStaff({
      title: 'New loan application received',
      message: `${application.applicationNo} — ${actor.name} requested ₹${payload.amountRequested.toLocaleString('en-IN')}`,
      type: 'info',
      link: `/admin/applications/${application._id}`,
    });
    broadcastDataChange(['applications', 'dashboard'], { userId: actor._id });
  }

  return application;
}

/** Compact shape used by worklists and realtime payloads. */
async function summarise(application, applicant = null) {
  const person =
    applicant ?? (await User.findById(application.applicant).select('name email mobile').lean());

  return {
    _id: String(application._id),
    applicationNo: application.applicationNo,
    status: application.status,
    stage: application.stage,
    amountRequested: application.amountRequested,
    tenureRequested: application.tenureRequested,
    purpose: application.purpose,
    bureauScore: application.bureauScore,
    createdAt: application.createdAt,
    submittedAt: application.submittedAt,
    applicant: person
      ? { _id: String(person._id), name: person.name, email: person.email, mobile: person.mobile }
      : null,
  };
}

export { summarise };

/** Customer edits to a draft or sent-back application. */
export async function updateApplication({ id, payload, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if (!EDITABLE_STATUSES.includes(application.status)) {
    throw ApiError.conflict(
      `This application is "${application.status}" and can no longer be edited.`
    );
  }

  if (payload.amountRequested || payload.tenureRequested) {
    await assertWithinProduct({
      amountRequested: payload.amountRequested ?? application.amountRequested,
      tenureRequested: payload.tenureRequested ?? application.tenureRequested,
    });
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'employment' || key === 'personal') application[key].set(value);
    else application[key] = value;
  });

  // Re-submitting after a send-back puts the file back in the officer's queue.
  if (application.status === APPLICATION_STATUS.SENT_BACK) {
    application.status = APPLICATION_STATUS.IN_REVIEW;
    application.remarks.push({
      message: 'Applicant responded to the information request.',
      by: actor._id,
      byName: actor.name,
      kind: 'update',
    });
  }

  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'application.updated',
    description: `Application ${application.applicationNo} updated by the applicant`,
    actor,
    meta: { fields: Object.keys(payload) },
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application));
  broadcastDataChange(['applications'], { userId: application.applicant });
  return application;
}

/** Moves a draft into the underwriting pipeline. */
export async function submitApplication({ id, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if (application.status !== APPLICATION_STATUS.DRAFT) {
    throw ApiError.conflict('Only a draft application can be submitted.');
  }

  await assertWithinProduct(application);

  application.status = APPLICATION_STATUS.SUBMITTED;
  application.stage = 'kyc';
  application.submittedAt = new Date();
  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'application.submitted',
    description: `Application ${application.applicationNo} submitted`,
    actor,
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_CREATED, await summarise(application, actor));
  notifyStaff({
    title: 'New loan application received',
    message: `${application.applicationNo} — ${actor.name}`,
    link: `/admin/applications/${application._id}`,
  });
  broadcastDataChange(['applications', 'dashboard'], { userId: actor._id });

  return application;
}

/**
 * KYC step — PAN + Aadhaar against the mocked provider, plus a simulated
 * liveness check. Only the last four Aadhaar digits are ever persisted.
 */
export async function submitKyc({ id, payload, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if ([APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CANCELLED, APPLICATION_STATUS.DISBURSED].includes(application.status)) {
    throw ApiError.conflict('KYC cannot be updated on a closed application.');
  }

  const panResult = kycProvider.verifyPan(payload.pan);
  if (!panResult.verified) {
    application.kyc.set({ status: KYC_STATUS.FAILED, pan: String(payload.pan).toUpperCase() });
    await application.save();
    throw ApiError.badRequest(panResult.reason, [{ field: 'pan', message: panResult.reason }]);
  }

  const aadhaarResult = kycProvider.verifyAadhaar(payload.aadhaar);
  if (!aadhaarResult.verified) {
    application.kyc.set({ status: KYC_STATUS.FAILED, pan: panResult.referenceId ? String(payload.pan).toUpperCase() : '' });
    await application.save();
    throw ApiError.badRequest(aadhaarResult.reason, [{ field: 'aadhaar', message: aadhaarResult.reason }]);
  }

  const selfieResult = kycProvider.verifySelfie();

  application.kyc.set({
    pan: String(payload.pan).toUpperCase(),
    aadhaarLast4: aadhaarResult.last4,
    panVerified: true,
    aadhaarVerified: true,
    selfieVerified: selfieResult.verified,
    status: KYC_STATUS.VERIFIED,
    provider: 'mock-digilocker',
    referenceId: aadhaarResult.referenceId,
    verifiedAt: new Date(),
  });
  application.stage = 'documents';
  await application.save();

  // Mirror verified identifiers onto the user profile for reuse.
  await User.findByIdAndUpdate(application.applicant, {
    pan: application.kyc.pan,
    aadhaarRef: `XXXXXXXX${aadhaarResult.last4}`,
    kycStatus: KYC_STATUS.VERIFIED,
  });

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'kyc.verified',
    description: `KYC verified (PAN ${application.kyc.pan}, Aadhaar XXXX${aadhaarResult.last4})`,
    actor,
    meta: { provider: 'mock-digilocker', referenceId: aadhaarResult.referenceId },
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application));
  broadcastDataChange(['applications'], { userId: application.applicant });

  return application;
}

/** Attaches an uploaded file to an application. */
/**
 * The bytes of one document, for the authorised download route.
 *
 * A borrower may read only their own uploads; any staff member may read any.
 * Documents uploaded before files were stored in Mongo have no `data` — their
 * bytes were lost with the ephemeral disk — and report that plainly rather
 * than 404ing as though the record did not exist.
 */
export async function getDocumentFile({ documentId, actor }) {
  const document = await Document.findById(documentId).select('+data');
  if (!document) throw ApiError.notFound('Document not found.');

  const isOwner = String(document.owner) === String(actor._id);
  if (!isOwner && !STAFF_ROLES.includes(actor.role)) {
    throw ApiError.forbidden('You do not have access to this document.');
  }

  if (!document.data || document.data.length === 0) {
    throw ApiError.gone(
      'This file is no longer available. It was uploaded before documents were stored durably and the server\'s temporary disk has since been recycled. Please upload it again.'
    );
  }

  return document;
}

export async function addDocument({ id, file, type, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if (!file) throw ApiError.badRequest('No file was uploaded.');

  // Mint the id first so the download URL can be built in one write.
  const documentId = new mongoose.Types.ObjectId();
  const extension = (file.originalname.match(/\.[a-z0-9]{1,9}$/i) || [''])[0].toLowerCase();

  const document = await Document.create({
    _id: documentId,
    application: application._id,
    owner: application.applicant,
    type,
    originalName: file.originalname,
    storedName: `${documentId}${extension}`,
    // Served by an authorised route, not from static disk: the bytes live in
    // Mongo so they survive a redeploy, and only the owner or staff may read
    // them. The old /uploads path was world-readable to anyone with the name.
    fileUrl: `/api/documents/${documentId}/file`,
    data: file.buffer,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    verificationStatus: VERIFICATION_STATUS.PENDING,
  });

  if (application.stage === 'documents' || application.stage === 'kyc') {
    application.stage = 'documents';
    await application.save();
  }

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'document.uploaded',
    description: `${type.replace(/_/g, ' ')} uploaded (${file.originalname})`,
    actor,
    meta: { documentId: String(document._id), type },
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application));
  broadcastDataChange(['applications'], { userId: application.applicant });

  return document;
}

export async function listDocuments(id, actor) {
  const application = await loadApplication(id, actor);
  return Document.find({ application: application._id }).sort({ createdAt: 1 }).lean();
}

/** Ops verifies or rejects an uploaded document. */
export async function verifyDocument({ documentId, status, remarks = '', actor, ip = '' }) {
  const document = await Document.findById(documentId);
  if (!document) throw ApiError.notFound('Document not found.');

  document.verificationStatus = status;
  document.remarks = remarks;
  document.verifiedBy = actor._id;
  document.verifiedAt = new Date();
  await document.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: document.application,
    action: `document.${status}`,
    description: `${document.type.replace(/_/g, ' ')} marked ${status}${remarks ? ` — ${remarks}` : ''}`,
    actor,
    meta: { documentId: String(document._id) },
    ip,
  });

  await notifyUser({
    userId: document.owner,
    title: `Document ${status}`,
    message: `Your ${document.type.replace(/_/g, ' ')} was ${status}${remarks ? `: ${remarks}` : ''}.`,
    type: status === VERIFICATION_STATUS.VERIFIED ? 'success' : 'warning',
    category: 'document',
    link: `/app/applications/${document.application}`,
  });

  broadcastDataChange(['applications'], { userId: document.owner });
  return document;
}

export async function deleteDocument({ documentId, actor, ip = '' }) {
  const document = await Document.findById(documentId);
  if (!document) throw ApiError.notFound('Document not found.');

  if (actor.role === ROLES.CUSTOMER && String(document.owner) !== String(actor._id)) {
    throw ApiError.forbidden('You do not have access to this document.');
  }
  if (document.verificationStatus === VERIFICATION_STATUS.VERIFIED) {
    throw ApiError.conflict('A verified document cannot be removed.');
  }

  await document.deleteOne();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: document.application,
    action: 'document.deleted',
    description: `${document.type.replace(/_/g, ' ')} removed`,
    actor,
    ip,
  });

  broadcastDataChange(['applications'], { userId: document.owner });
  return true;
}

/**
 * Pulls the (mocked) bureau report and immediately runs the rule engine, so the
 * applicant sees their score and decision in one step.
 *
 * `simulate` is honoured only when test hooks are enabled — it is how the E2E
 * suite drives the approve / review / reject branches deterministically.
 */
export async function pullBureau({ id, actor, ip = '', simulate = null }) {
  const application = await loadApplication(id, actor);

  if (application.kyc.status !== KYC_STATUS.VERIFIED) {
    throw ApiError.conflict('Complete KYC before running the credit bureau check.');
  }
  if (
    ![APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.IN_REVIEW, APPLICATION_STATUS.SENT_BACK].includes(
      application.status
    )
  ) {
    throw ApiError.conflict(
      `A bureau check cannot be run on an application that is "${application.status}".`
    );
  }

  const raw = bureauProvider.pullBureauReport(
    env.enableTestHooks && simulate ? { simulate } : {}
  );

  const report = await BureauReport.create({
    application: application._id,
    applicant: application.applicant,
    provider: raw.provider,
    score: raw.score,
    band: raw.band,
    summary: raw.summary,
    reportJson: raw,
    pulledAt: new Date(),
  });

  application.bureauReport = report._id;
  application.bureauScore = report.score;
  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'bureau.pulled',
    description: `Credit bureau report pulled — score ${report.score} (${report.band.replace('_', ' ')})`,
    actor,
    meta: { score: report.score, inquiryId: raw.inquiryId },
    ip,
  });

  // Rule engine runs straight after the pull.
  const { application: decided, result } = await runAutoDecision({
    application,
    bureau: report,
    actor,
    ip,
  });

  return { application: decided, report, decision: result };
}

export async function getBureauReport(id, actor) {
  const application = await loadApplication(id, actor);
  if (!application.bureauReport) return null;
  return BureauReport.findById(application.bureauReport).lean();
}

/** Customer accepts the sanctioned offer. */
export async function acceptOffer({ id, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if (application.status !== APPLICATION_STATUS.APPROVED) {
    throw ApiError.conflict('There is no approved offer to accept on this application.');
  }
  if (application.offer.expiresAt && application.offer.expiresAt < new Date()) {
    throw ApiError.conflict('This offer has expired. Please contact support to have it re-issued.');
  }

  application.status = APPLICATION_STATUS.OFFER_ACCEPTED;
  application.stage = 'esign';
  application.offer.acceptedAt = new Date();
  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'offer.accepted',
    description: `Offer accepted — ₹${application.offer.amount.toLocaleString('en-IN')} at ${application.offer.roi}% for ${application.offer.tenureMonths} months`,
    actor,
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application, actor));
  notifyStaff({
    title: 'Offer accepted',
    message: `${application.applicationNo} — awaiting e-signature`,
    type: 'success',
    link: `/admin/applications/${application._id}`,
  });
  broadcastDataChange(['applications', 'dashboard'], { userId: actor._id });

  return application;
}

/** Sends the e-sign consent OTP to the applicant's registered mobile. */
export async function requestAgreementOtp({ id, actor }) {
  const application = await loadApplication(id, actor);

  if (application.status !== APPLICATION_STATUS.OFFER_ACCEPTED) {
    throw ApiError.conflict('Accept the offer before signing the agreement.');
  }

  return issueOtp({
    identifier: `esign:${application._id}`,
    purpose: 'esign',
    deliverTo: { mobile: actor.mobile, email: actor.email },
    subject: 'SedBank — e-sign your loan agreement',
  });
}

/** OTP-based mock e-signature of the loan agreement. */
export async function signAgreement({ id, code, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if (application.status !== APPLICATION_STATUS.OFFER_ACCEPTED) {
    throw ApiError.conflict('This application is not awaiting an e-signature.');
  }

  await verifyOtp({ identifier: `esign:${application._id}`, purpose: 'esign', code });

  const consentText = `I, ${actor.name}, accept the SedBank ${application.productName} of ₹${application.offer.amount.toLocaleString('en-IN')} at ${application.offer.roi}% p.a. for ${application.offer.tenureMonths} months, with an EMI of ₹${application.offer.emi.toLocaleString('en-IN')}, and agree to the loan terms and conditions.`;

  application.agreement.set({
    otpVerified: true,
    signedAt: new Date(),
    consentText,
    signerIp: ip,
    referenceId: `ESIGN-${Date.now().toString(36).toUpperCase()}`,
  });
  application.status = APPLICATION_STATUS.AGREEMENT_SIGNED;
  application.stage = 'disbursement';
  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'agreement.signed',
    description: 'Loan agreement e-signed via OTP consent',
    actor,
    meta: { referenceId: application.agreement.referenceId },
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application, actor));
  notifyStaff({
    title: 'Agreement signed — ready to disburse',
    message: `${application.applicationNo} is awaiting disbursement`,
    type: 'success',
    link: `/admin/applications/${application._id}`,
  });
  broadcastDataChange(['applications', 'dashboard'], { userId: actor._id });

  return application;
}

/** Mock penny-drop verification of the borrower's payout account. */
export async function verifyBankAccount({ id, payload, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if (
    ![APPLICATION_STATUS.OFFER_ACCEPTED, APPLICATION_STATUS.AGREEMENT_SIGNED, APPLICATION_STATUS.APPROVED].includes(
      application.status
    )
  ) {
    throw ApiError.conflict('A payout account can only be added to an approved application.');
  }

  const result = pennyDrop.verifyBankAccount({
    accountNumber: payload.accountNumber,
    ifsc: payload.ifsc,
    accountHolder: payload.accountHolder || actor.name,
  });

  if (!result.verified) {
    throw ApiError.badRequest(result.reason, [{ field: 'accountNumber', message: result.reason }]);
  }

  application.bankAccount.set({
    accountHolder: payload.accountHolder || actor.name,
    accountNumber: payload.accountNumber,
    ifsc: String(payload.ifsc).toUpperCase(),
    bankName: result.bankName,
    verified: true,
    verifiedAt: new Date(),
    pennyDropRef: result.referenceId,
  });
  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'bankAccount.verified',
    description: `Payout account verified via penny drop (XXXX${String(payload.accountNumber).slice(-4)}, ${result.bankName})`,
    actor,
    meta: { referenceId: result.referenceId },
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application, actor));
  broadcastDataChange(['applications'], { userId: application.applicant });

  return { application, result };
}

/** Customer withdraws an application that has not yet been disbursed. */
export async function withdrawApplication({ id, actor, ip = '' }) {
  const application = await loadApplication(id, actor);

  if ([APPLICATION_STATUS.DISBURSED, APPLICATION_STATUS.CANCELLED].includes(application.status)) {
    throw ApiError.conflict('This application can no longer be withdrawn.');
  }

  application.status = APPLICATION_STATUS.CANCELLED;
  application.remarks.push({
    message: 'Withdrawn by the applicant.',
    by: actor._id,
    byName: actor.name,
    kind: 'status',
  });
  await application.save();

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: 'application.withdrawn',
    description: `Application ${application.applicationNo} withdrawn by the applicant`,
    actor,
    ip,
  });

  emitToStaff(EVENTS.APPLICATION_UPDATED, await summarise(application, actor));
  broadcastDataChange(['applications', 'dashboard'], { userId: actor._id });
  return application;
}

/**
 * Underwriting 360 view: application + documents + bureau report + the derived
 * obligation-to-income figures an officer needs to decide.
 */
export async function getApplicationDetail(id, actor) {
  const application = await loadApplication(id, actor, { populate: true });
  const [documents, policy] = await Promise.all([
    Document.find({ application: application._id }).sort({ createdAt: 1 }).lean(),
    getPolicy(),
  ]);

  const income = Number(application.employment?.monthlyIncome || 0);
  const existingEmi = Number(application.employment?.existingEmi || 0);
  const proposedEmi = Number(application.offer?.emi || 0);

  return {
    application,
    documents,
    obligations: {
      monthlyIncome: income,
      existingEmi,
      proposedEmi,
      existingFoir: income > 0 ? round2((existingEmi / income) * 100) / 100 : null,
      projectedFoir: income > 0 ? round2(((existingEmi + proposedEmi) / income) * 100) / 100 : null,
      maxFoir: policy.underwriting.maxDti,
      // Only staff need to see how close the file sits to policy limits.
      withinPolicy:
        income > 0 ? (existingEmi + proposedEmi) / income <= policy.underwriting.maxDti : false,
    },
  };
}

export default {
  loadApplication,
  createApplication,
  updateApplication,
  submitApplication,
  submitKyc,
  addDocument,
  listDocuments,
  verifyDocument,
  deleteDocument,
  pullBureau,
  getBureauReport,
  acceptOffer,
  requestAgreementOtp,
  signAgreement,
  verifyBankAccount,
  withdrawApplication,
  getApplicationDetail,
  summarise,
  getDocumentFile,
};
