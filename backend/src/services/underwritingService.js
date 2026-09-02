/**
 * Underwriting: the automated rule engine plus manual officer decisions.
 *
 * Every threshold comes from the Config document, so credit policy is an admin
 * setting rather than a code change. `evaluate()` is pure — it takes the
 * application, the bureau report and the policy and returns a decision object,
 * which makes the whole credit policy unit-testable without a database.
 */
import LoanApplication from '../models/LoanApplication.js';
import UnderwritingDecision from '../models/UnderwritingDecision.js';
import ApiError from '../utils/ApiError.js';
import {
  APPLICATION_STATUS,
  DECISION,
  OPEN_UNDERWRITING_STATUSES,
  EVENTS,
} from '../constants/index.js';
import {
  calculateEmi,
  calculateFoir,
  maxEligiblePrincipal,
  buildAmortisationSchedule,
  totalInterest,
  round2,
} from '../utils/emi.js';
import { getPolicy, roiForScore } from './configService.js';
import { recordAudit } from './auditService.js';
import { notifyUser, notifyStaff } from './notificationService.js';
import { emitToStaff, emitToUser, broadcastDataChange } from '../realtime/socket.js';

/** Rounds a sanction amount down to the nearest ₹1,000. */
const roundSanction = (amount) => Math.floor(Number(amount) / 1000) * 1000;

/**
 * Builds a priced offer for a given amount/tenure/rate.
 * Shared by the rule engine and by manual approvals so both price identically.
 */
export function buildOffer({ amount, roi, tenureMonths, processingFeePct }) {
  const emi = calculateEmi(amount, roi, tenureMonths);
  const schedule = buildAmortisationSchedule({
    principal: amount,
    annualRatePct: roi,
    months: tenureMonths,
  });
  const interest = totalInterest(schedule);

  return {
    amount: round2(amount),
    roi: round2(roi),
    tenureMonths,
    emi,
    processingFee: round2((amount * processingFeePct) / 100),
    totalInterest: interest,
    totalPayable: round2(amount + interest),
    generatedAt: new Date(),
    // Offers are valid for 15 days, mirroring typical retail practice.
    expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
  };
}

/**
 * The credit policy, as a pure function.
 *
 * @returns {{decision:string, rulesApplied:string[], reason:string, score:number,
 *            dti:number|null, offer:object|null}}
 */
export function evaluate({ application, bureau, policy }) {
  const { product, underwriting } = policy;
  const rulesApplied = [];

  const score = bureau.score;
  const income = Number(application.employment?.monthlyIncome || 0);
  const existingEmi = Number(application.employment?.existingEmi || 0);
  const pan = String(application.kyc?.pan || '').toUpperCase();
  const tenureMonths = Number(application.tenureRequested);

  const reject = (reason, rule) => ({
    decision: DECISION.AUTO_REJECTED,
    rulesApplied: [...rulesApplied, rule],
    reason,
    score,
    dti: null,
    offer: null,
  });

  // --- Hard knock-out rules -------------------------------------------------
  if (pan && (underwriting.blacklistedPans || []).map((p) => p.toUpperCase()).includes(pan)) {
    return reject('PAN appears on the internal negative list.', 'blacklist.pan');
  }

  if (score < underwriting.minScore) {
    return reject(
      `Bureau score ${score} is below the minimum acceptable score of ${underwriting.minScore}.`,
      'bureau.minScore'
    );
  }
  rulesApplied.push('bureau.minScore');

  if (income < underwriting.minMonthlyIncome) {
    return reject(
      `Declared monthly income is below the required minimum of ₹${underwriting.minMonthlyIncome.toLocaleString('en-IN')}.`,
      'income.minimum'
    );
  }
  rulesApplied.push('income.minimum');

  // --- Affordability: cap the sanction so FOIR stays within policy ----------
  const roi = roiForScore(score, policy);
  const affordablePrincipal = maxEligiblePrincipal({
    monthlyIncome: income,
    existingEmi,
    maxFoir: underwriting.maxDti,
    annualRatePct: roi,
    months: tenureMonths,
  });

  const sanctionAmount = roundSanction(
    Math.min(Number(application.amountRequested), affordablePrincipal, product.maxAmount)
  );
  rulesApplied.push('affordability.foir');

  if (sanctionAmount < product.minAmount) {
    return reject(
      `Income net of existing obligations supports only ₹${sanctionAmount.toLocaleString('en-IN')}, below the ₹${product.minAmount.toLocaleString('en-IN')} minimum ticket size.`,
      'affordability.minTicket'
    );
  }

  const offer = buildOffer({
    amount: sanctionAmount,
    roi,
    tenureMonths,
    processingFeePct: product.processingFeePct,
  });

  const dti = calculateFoir({ monthlyIncome: income, existingEmi, proposedEmi: offer.emi });

  // --- Straight-through approval vs manual queue ----------------------------
  if (score >= underwriting.autoApproveScore && dti <= underwriting.maxDti) {
    rulesApplied.push('autoApprove.score');
    return {
      decision: DECISION.AUTO_APPROVED,
      rulesApplied,
      reason: `Bureau score ${score} meets the straight-through threshold of ${underwriting.autoApproveScore} and FOIR ${(dti * 100).toFixed(1)}% is within the ${(underwriting.maxDti * 100).toFixed(0)}% limit.`,
      score,
      dti,
      offer,
    };
  }

  rulesApplied.push('route.manualReview');
  return {
    decision: DECISION.ROUTED_MANUAL,
    rulesApplied,
    reason:
      score < underwriting.autoApproveScore
        ? `Bureau score ${score} is between the floor (${underwriting.minScore}) and the auto-approval threshold (${underwriting.autoApproveScore}) — manual credit review required.`
        : `FOIR ${(dti * 100).toFixed(1)}% exceeds the automated limit — manual credit review required.`,
    score,
    dti,
    offer, // recommended terms the officer may accept or override
  };
}

/**
 * Runs the rule engine against a persisted application and applies the outcome:
 * writes the decision record, moves the application status, notifies everyone.
 */
export async function runAutoDecision({ application, bureau, actor = null, ip = '' }) {
  const policy = await getPolicy();
  const result = evaluate({ application, bureau, policy });

  application.bureauScore = result.score;
  application.dti = result.dti;
  application.decisionType = result.decision;

  if (result.decision === DECISION.AUTO_APPROVED) {
    application.status = APPLICATION_STATUS.APPROVED;
    application.stage = 'offer';
    application.offer.set(result.offer);
    application.decidedAt = new Date();
    application.decidedBy = null;
    application.rejectionReason = '';
  } else if (result.decision === DECISION.AUTO_REJECTED) {
    application.status = APPLICATION_STATUS.REJECTED;
    application.stage = 'bureau';
    application.decidedAt = new Date();
    application.rejectionReason = result.reason;
  } else {
    application.status = APPLICATION_STATUS.IN_REVIEW;
    application.stage = 'bureau';
    // Recommended terms are stored so the officer sees pre-computed pricing.
    if (result.offer) application.offer.set({ ...result.offer, generatedAt: null });
  }

  application.remarks.push({
    message: result.reason,
    byName: 'Rule Engine',
    kind: 'decision',
  });

  await application.save();

  await UnderwritingDecision.create({
    application: application._id,
    decision: result.decision,
    decidedBy: null,
    decidedByName: 'Rule Engine',
    remarks: result.reason,
    score: result.score,
    dti: result.dti,
    rulesApplied: result.rulesApplied,
    approvedAmount: result.offer?.amount ?? null,
    approvedRoi: result.offer?.roi ?? null,
    approvedTenure: result.offer?.tenureMonths ?? null,
  });

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: `underwriting.${result.decision}`,
    description: result.reason,
    actor,
    meta: { score: result.score, dti: result.dti, rules: result.rulesApplied },
    ip,
  });

  await publishDecision(application, result.decision, result.reason);
  return { application, result };
}

/** Notification + realtime fan-out shared by automated and manual decisions. */
async function publishDecision(application, decision, reason) {
  const isApproved = [DECISION.AUTO_APPROVED, DECISION.APPROVED].includes(decision);
  const isRejected = [DECISION.AUTO_REJECTED, DECISION.REJECTED].includes(decision);

  let title;
  let type;
  if (isApproved) {
    title = 'Your loan has been approved!';
    type = 'success';
  } else if (isRejected) {
    title = 'Your loan application was not approved';
    type = 'error';
  } else if (decision === DECISION.SENT_BACK) {
    title = 'More information needed on your application';
    type = 'warning';
  } else {
    title = 'Your application is under review';
    type = 'info';
  }

  await notifyUser({
    userId: application.applicant,
    title,
    message: `${application.applicationNo}: ${reason}`,
    type,
    category: 'application',
    link: `/app/applications/${application._id}`,
    alsoEmail: true,
  });

  const payload = {
    applicationId: String(application._id),
    applicationNo: application.applicationNo,
    status: application.status,
    stage: application.stage,
    decision,
  };

  emitToUser(application.applicant, EVENTS.APPLICATION_UPDATED, payload);
  emitToStaff(EVENTS.APPLICATION_UPDATED, payload);
  broadcastDataChange(['applications', 'dashboard'], { userId: application.applicant });
}

/**
 * Manual officer decision: approve (optionally on revised terms), reject, or
 * send back for more information. A remark is mandatory on every path.
 */
export async function applyManualDecision({
  applicationId,
  decision,
  remarks,
  approvedAmount,
  roi,
  tenureMonths,
  actor,
  ip = '',
}) {
  const application = await LoanApplication.findById(applicationId);
  if (!application) throw ApiError.notFound('Application not found.');

  if (!OPEN_UNDERWRITING_STATUSES.includes(application.status)) {
    throw ApiError.conflict(
      `Application ${application.applicationNo} is "${application.status}" and is no longer in the underwriting queue.`
    );
  }

  const policy = await getPolicy();
  const { product, underwriting } = policy;

  if (decision === DECISION.APPROVED) {
    // Officers may revise the terms, but never outside the product's bounds.
    const amount = Number(approvedAmount ?? application.offer?.amount ?? application.amountRequested);
    const tenure = Number(tenureMonths ?? application.offer?.tenureMonths ?? application.tenureRequested);
    const rate = Number(roi ?? application.offer?.roi ?? roiForScore(application.bureauScore ?? 700, policy));

    if (amount < product.minAmount || amount > product.maxAmount) {
      throw ApiError.badRequest(
        `Approved amount must be between ₹${product.minAmount.toLocaleString('en-IN')} and ₹${product.maxAmount.toLocaleString('en-IN')}.`
      );
    }
    if (tenure < product.minTenureMonths || tenure > product.maxTenureMonths) {
      throw ApiError.badRequest(
        `Tenure must be between ${product.minTenureMonths} and ${product.maxTenureMonths} months.`
      );
    }
    if (rate < product.minRoi || rate > product.maxRoi) {
      throw ApiError.badRequest(
        `Interest rate must be between ${product.minRoi}% and ${product.maxRoi}%.`
      );
    }

    const offer = buildOffer({
      amount,
      roi: rate,
      tenureMonths: tenure,
      processingFeePct: product.processingFeePct,
    });

    const dti = calculateFoir({
      monthlyIncome: application.employment.monthlyIncome,
      existingEmi: application.employment.existingEmi,
      proposedEmi: offer.emi,
    });

    // A manual override may exceed the automated FOIR limit, but it is recorded.
    const exceededFoir = dti > underwriting.maxDti;

    application.offer.set(offer);
    application.status = APPLICATION_STATUS.APPROVED;
    application.stage = 'offer';
    application.dti = dti;
    application.rejectionReason = '';
    application.decisionType = DECISION.APPROVED;

    await finaliseDecision({
      application,
      decision: DECISION.APPROVED,
      remarks: exceededFoir
        ? `${remarks} [Override: FOIR ${(dti * 100).toFixed(1)}% exceeds the ${(underwriting.maxDti * 100).toFixed(0)}% policy limit.]`
        : remarks,
      actor,
      ip,
      offer,
      dti,
    });
  } else if (decision === DECISION.REJECTED) {
    application.status = APPLICATION_STATUS.REJECTED;
    application.stage = 'bureau';
    application.rejectionReason = remarks;
    application.decisionType = DECISION.REJECTED;

    await finaliseDecision({ application, decision: DECISION.REJECTED, remarks, actor, ip });
  } else if (decision === DECISION.SENT_BACK) {
    application.status = APPLICATION_STATUS.SENT_BACK;
    // Send the customer back to the documents step to supply what is missing.
    application.stage = 'documents';
    application.decisionType = DECISION.SENT_BACK;

    await finaliseDecision({ application, decision: DECISION.SENT_BACK, remarks, actor, ip });
  } else {
    throw ApiError.badRequest(`Unsupported decision "${decision}".`);
  }

  return application;
}

async function finaliseDecision({ application, decision, remarks, actor, ip, offer = null, dti = null }) {
  application.decidedAt = new Date();
  application.decidedBy = actor?._id ?? null;
  application.remarks.push({
    message: remarks,
    by: actor?._id ?? null,
    byName: actor?.name ?? 'Officer',
    kind: 'decision',
  });

  await application.save();

  await UnderwritingDecision.create({
    application: application._id,
    decision,
    decidedBy: actor?._id ?? null,
    decidedByName: actor?.name ?? 'Officer',
    remarks,
    score: application.bureauScore ?? null,
    dti: dti ?? application.dti ?? null,
    rulesApplied: ['manual.officerDecision'],
    approvedAmount: offer?.amount ?? null,
    approvedRoi: offer?.roi ?? null,
    approvedTenure: offer?.tenureMonths ?? null,
  });

  await recordAudit({
    entity: 'LoanApplication',
    entityId: application._id,
    action: `underwriting.${decision}`,
    description: `${decision.replace('_', ' ')} by ${actor?.name ?? 'officer'} — ${remarks}`,
    actor,
    meta: { decision, offer },
    ip,
  });

  notifyStaff({
    title: `Application ${application.applicationNo} ${decision.replace('_', ' ')}`,
    message: remarks,
    type: decision === DECISION.APPROVED ? 'success' : 'info',
    link: `/admin/applications/${application._id}`,
  });

  await publishDecision(application, decision, remarks);
}

/** Officer worklist: applications still awaiting a credit decision. */
export function getQueueFilter(status) {
  if (status && status !== 'all') return { status };
  return { status: { $in: OPEN_UNDERWRITING_STATUSES } };
}

export default {
  evaluate,
  buildOffer,
  runAutoDecision,
  applyManualDecision,
  getQueueFilter,
};
