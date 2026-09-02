/** Loan origination endpoints (customer-driven, staff-readable). */
import LoanApplication from '../models/LoanApplication.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/http.js';
import { getQuery } from '../utils/http.js';
import { ROLES, OPEN_UNDERWRITING_STATUSES } from '../constants/index.js';
import applicationService from '../services/applicationService.js';
import { getTrail } from '../services/auditService.js';

/** Worklist / "my applications" — role decides the scope. */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, search, status, applicant } = getQuery(req);

  const query = {};

  if (req.user.role === ROLES.CUSTOMER) {
    query.applicant = req.user._id;
  } else if (applicant) {
    query.applicant = applicant;
  }

  if (status === 'queue') query.status = { $in: OPEN_UNDERWRITING_STATUSES };
  else if (status && status !== 'all') query.status = status;

  if (search) {
    const matches = await User.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const or = [
      { applicationNo: { $regex: search, $options: 'i' } },
      { applicant: { $in: matches.map((u) => u._id) } },
    ];

    // Customers stay scoped to their own records even while searching.
    if (query.applicant) query.$and = [{ applicant: query.applicant }, { $or: or }];
    else query.$or = or;
    delete query.applicant;
  }

  const [items, total] = await Promise.all([
    LoanApplication.find(query)
      .populate('applicant', 'name email mobile')
      .populate('loanAccount', 'loanNo status')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LoanApplication.countDocuments(query),
  ]);

  return paginated(res, items, { page, limit, total });
});

export const detail = asyncHandler(async (req, res) =>
  ok(res, await applicationService.getApplicationDetail(req.params.id, req.user))
);

export const create = asyncHandler(async (req, res) => {
  const { submit, ...payload } = req.body;
  const application = await applicationService.createApplication({
    payload,
    actor: req.user,
    ip: req.ip,
    submit,
  });
  return created(res, { application });
});

export const update = asyncHandler(async (req, res) =>
  ok(res, {
    application: await applicationService.updateApplication({
      id: req.params.id,
      payload: req.body,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const submit = asyncHandler(async (req, res) =>
  ok(res, {
    application: await applicationService.submitApplication({
      id: req.params.id,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const withdraw = asyncHandler(async (req, res) =>
  ok(res, {
    application: await applicationService.withdrawApplication({
      id: req.params.id,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const submitKyc = asyncHandler(async (req, res) =>
  ok(res, {
    application: await applicationService.submitKyc({
      id: req.params.id,
      payload: req.body,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const uploadDocument = asyncHandler(async (req, res) =>
  created(res, {
    document: await applicationService.addDocument({
      id: req.params.id,
      file: req.file,
      type: req.body.type,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const listDocuments = asyncHandler(async (req, res) =>
  ok(res, { documents: await applicationService.listDocuments(req.params.id, req.user) })
);

export const pullBureau = asyncHandler(async (req, res) => {
  const { application, report, decision } = await applicationService.pullBureau({
    id: req.params.id,
    actor: req.user,
    ip: req.ip,
    simulate: req.body?.simulate ?? null,
  });

  return ok(res, {
    application,
    report,
    decision: {
      decision: decision.decision,
      reason: decision.reason,
      score: decision.score,
      dti: decision.dti,
      offer: decision.offer,
    },
  });
});

export const bureauReport = asyncHandler(async (req, res) =>
  ok(res, { report: await applicationService.getBureauReport(req.params.id, req.user) })
);

export const acceptOffer = asyncHandler(async (req, res) =>
  ok(res, {
    application: await applicationService.acceptOffer({
      id: req.params.id,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const requestAgreementOtp = asyncHandler(async (req, res) =>
  ok(res, await applicationService.requestAgreementOtp({ id: req.params.id, actor: req.user }))
);

export const signAgreement = asyncHandler(async (req, res) =>
  ok(res, {
    application: await applicationService.signAgreement({
      id: req.params.id,
      code: req.body.code,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const verifyBankAccount = asyncHandler(async (req, res) => {
  const { application, result } = await applicationService.verifyBankAccount({
    id: req.params.id,
    payload: req.body,
    actor: req.user,
    ip: req.ip,
  });
  return ok(res, { application, verification: result });
});

/** Chronological audit trail — rendered as the application timeline. */
export const timeline = asyncHandler(async (req, res) => {
  // loadApplication enforces the ownership rule before any trail is exposed.
  const application = await applicationService.loadApplication(req.params.id, req.user);
  return ok(res, { timeline: await getTrail('LoanApplication', application._id) });
});

export default {
  list,
  detail,
  create,
  update,
  submit,
  withdraw,
  submitKyc,
  uploadDocument,
  listDocuments,
  pullBureau,
  bureauReport,
  acceptOffer,
  requestAgreementOtp,
  signAgreement,
  verifyBankAccount,
  timeline,
};
