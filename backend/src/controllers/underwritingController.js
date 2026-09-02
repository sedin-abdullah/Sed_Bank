/** Credit officer worklist and decisions. */
import LoanApplication from '../models/LoanApplication.js';
import UnderwritingDecision from '../models/UnderwritingDecision.js';
import Document from '../models/Document.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, paginated, getQuery } from '../utils/http.js';
import underwritingService from '../services/underwritingService.js';
import applicationService from '../services/applicationService.js';
import { VERIFICATION_STATUS } from '../constants/index.js';

/** Applications awaiting a credit decision, newest first. */
export const queue = asyncHandler(async (req, res) => {
  const { page, limit, status, search } = getQuery(req);

  const query = underwritingService.getQueueFilter(status);

  if (search) {
    query.applicationNo = { $regex: search, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    LoanApplication.find(query)
      .populate('applicant', 'name email mobile')
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LoanApplication.countDocuments(query),
  ]);

  return paginated(res, items, { page, limit, total });
});

export const decide = asyncHandler(async (req, res) => {
  const application = await underwritingService.applyManualDecision({
    applicationId: req.params.id,
    ...req.body,
    actor: req.user,
    ip: req.ip,
  });

  return ok(res, { application });
});

/** Every decision ever taken on an application, oldest first. */
export const history = asyncHandler(async (req, res) => {
  await applicationService.loadApplication(req.params.id, req.user);
  const decisions = await UnderwritingDecision.find({ application: req.params.id })
    .sort({ decidedAt: 1 })
    .lean();
  return ok(res, { decisions });
});

/** Ops marks an uploaded document verified or rejected. */
export const verifyDocument = asyncHandler(async (req, res) =>
  ok(res, {
    document: await applicationService.verifyDocument({
      documentId: req.params.documentId,
      status: req.body.status,
      remarks: req.body.remarks,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const deleteDocument = asyncHandler(async (req, res) => {
  await applicationService.deleteDocument({
    documentId: req.params.documentId,
    actor: req.user,
    ip: req.ip,
  });
  return ok(res, { deleted: true });
});

/** Documents still pending verification — the ops officer's queue. */
export const pendingDocuments = asyncHandler(async (req, res) => {
  const { page, limit } = getQuery(req);

  const query = { verificationStatus: VERIFICATION_STATUS.PENDING };

  const [items, total] = await Promise.all([
    Document.find(query)
      .populate('owner', 'name email')
      .populate('application', 'applicationNo status')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Document.countDocuments(query),
  ]);

  return paginated(res, items, { page, limit, total });
});

export default { queue, decide, history, verifyDocument, deleteDocument, pendingDocuments };
