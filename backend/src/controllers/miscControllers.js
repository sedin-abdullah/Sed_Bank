/**
 * Smaller controllers grouped by concern: eligibility, configuration,
 * dashboards, notifications, audit, the exposed mock integrations, and the
 * environment-gated test hooks.
 */
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { ok, paginated, getQuery } from '../utils/http.js';
import env from '../config/env.js';
import { ROLES } from '../constants/index.js';

import AuditLog from '../models/AuditLog.js';
import LoanAccount from '../models/LoanAccount.js';
import EMISchedule from '../models/EMISchedule.js';

import eligibilityService from '../services/eligibilityService.js';
import configService from '../services/configService.js';
import dashboardService from '../services/dashboardService.js';
import notificationService from '../services/notificationService.js';
import loanService from '../services/loanService.js';

import kycProvider from '../mocks/kycProvider.js';
import bureauProvider from '../mocks/bureauProvider.js';
import pennyDrop from '../mocks/pennyDropProvider.js';
import gateway from '../mocks/paymentGateway.js';
import messenger from '../mocks/messenger.js';

/* ------------------------------------------------------------------ */
/* Eligibility (public)                                                */
/* ------------------------------------------------------------------ */

export const eligibilityController = {
  check: asyncHandler(async (req, res) => ok(res, await eligibilityService.checkEligibility(req.body))),
  product: asyncHandler(async (_req, res) => ok(res, { product: await configService.getPublicProduct() })),
};

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export const configController = {
  /** Full policy — admin only. */
  get: asyncHandler(async (_req, res) => {
    const config = await configService.getConfig();
    return ok(res, { config: config.toJSON() });
  }),

  update: asyncHandler(async (req, res) => {
    const config = await configService.updateConfig(req.body, req.user, req.ip);
    return ok(res, { config: config.toJSON() });
  }),
};

/* ------------------------------------------------------------------ */
/* Dashboards                                                          */
/* ------------------------------------------------------------------ */

export const dashboardController = {
  admin: asyncHandler(async (_req, res) => ok(res, await dashboardService.getAdminDashboard())),
  customer: asyncHandler(async (req, res) =>
    ok(res, await dashboardService.getCustomerDashboard(req.user._id))
  ),
  /** Routes the caller to whichever dashboard their role owns. */
  auto: asyncHandler(async (req, res) =>
    ok(
      res,
      req.user.role === ROLES.CUSTOMER
        ? await dashboardService.getCustomerDashboard(req.user._id)
        : await dashboardService.getAdminDashboard()
    )
  ),
};

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export const notificationController = {
  list: asyncHandler(async (req, res) => {
    const { limit, unreadOnly } = getQuery(req);
    const [items, unread] = await Promise.all([
      notificationService.listForUser(req.user._id, { limit, unreadOnly }),
      notificationService.countUnread(req.user._id),
    ]);
    return ok(res, { notifications: items, unreadCount: unread });
  }),

  markRead: asyncHandler(async (req, res) => {
    const notification = await notificationService.markRead(req.user._id, req.params.id);
    if (!notification) throw ApiError.notFound('Notification not found.');
    return ok(res, { notification });
  }),

  markAllRead: asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.user._id);
    return ok(res, { unreadCount: 0 });
  }),
};

/* ------------------------------------------------------------------ */
/* Audit trail (admin)                                                 */
/* ------------------------------------------------------------------ */

export const auditController = {
  list: asyncHandler(async (req, res) => {
    const { page, limit, search } = getQuery(req);

    const query = {};
    if (search) {
      query.$or = [
        { action: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { performedByName: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);

    return paginated(res, items, { page, limit, total });
  }),
};

/* ------------------------------------------------------------------ */
/* Mock integrations                                                   */
/* ------------------------------------------------------------------ */

/**
 * The mocked third-party endpoints, exposed directly so their contracts are
 * inspectable from Postman and obvious to anyone auditing what is simulated.
 * They are read-only simulations and never touch application state.
 */
export const mockController = {
  kyc: asyncHandler(async (req, res) =>
    ok(res, {
      pan: req.body.pan ? kycProvider.verifyPan(req.body.pan) : null,
      aadhaar: req.body.aadhaar ? kycProvider.verifyAadhaar(req.body.aadhaar) : null,
      selfie: kycProvider.verifySelfie(),
      notice: 'Simulated KYC response — no data leaves this application.',
    })
  ),

  bureau: asyncHandler(async (req, res) =>
    ok(res, {
      report: bureauProvider.pullBureauReport({
        simulate: req.body.simulate,
        forceScore: req.body.forceScore ?? null,
      }),
    })
  ),

  pennyDrop: asyncHandler(async (req, res) =>
    ok(res, { result: pennyDrop.verifyBankAccount(req.body) })
  ),

  createOrder: asyncHandler(async (req, res) => {
    const order = gateway.createOrder(req.body);
    return ok(res, { order, sandboxCheckout: gateway.simulateCheckout(order.orderId) });
  }),

  verifyOrder: asyncHandler(async (req, res) => ok(res, gateway.verifyPayment(req.body))),

  /** Recent mocked emails/SMS, so QA can prove a notification was dispatched. */
  outbox: asyncHandler(async (_req, res) => ok(res, { messages: messenger.getOutbox(50) })),
};

/* ------------------------------------------------------------------ */
/* Test hooks (ENABLE_TEST_HOOKS only)                                 */
/* ------------------------------------------------------------------ */

/** Blocks the whole test-hook router unless it is explicitly enabled. */
export const requireTestHooks = (_req, _res, next) => {
  if (!env.enableTestHooks) {
    return next(ApiError.forbidden('Test hooks are disabled in this environment.'));
  }
  return next();
};

export const testingController = {
  /**
   * Shifts a loan's schedule back in time so the delinquency path can be
   * exercised without waiting a real month. Test/demo environments only.
   */
  backdateLoan: asyncHandler(async (req, res) => {
    const { loanId, days } = req.body;

    const loan = await LoanAccount.findById(loanId);
    if (!loan) throw ApiError.notFound('Loan account not found.');

    const shift = (value) => (value ? dayjs(value).subtract(days, 'day').toDate() : value);

    loan.disbursedAt = shift(loan.disbursedAt);
    loan.startDate = shift(loan.startDate);
    loan.firstEmiDate = shift(loan.firstEmiDate);
    loan.maturityDate = shift(loan.maturityDate);
    await loan.save();

    const schedule = await EMISchedule.find({ loanAccount: loan._id });
    await Promise.all(
      schedule.map((emi) => {
        emi.dueDate = shift(emi.dueDate);
        return emi.save();
      })
    );

    // Re-age immediately so the caller sees the delinquent state straight away.
    await loanService.refreshLoanDelinquency(loan);

    return ok(res, {
      loan: loan.toJSON(),
      shiftedByDays: days,
      notice: 'Test hook — schedule dates were moved backwards to simulate ageing.',
    });
  }),

  /** Wipes business data (keeps users, banks and config) for a clean test run. */
  reset: asyncHandler(async (_req, res) => {
    const collections = [
      'LoanApplication',
      'Document',
      'BureauReport',
      'UnderwritingDecision',
      'LoanAccount',
      'EMISchedule',
      'Payment',
      'CollectionNote',
      'Notification',
      'AuditLog',
    ];

    const removed = {};
    for (const name of collections) {
      // eslint-disable-next-line no-await-in-loop
      const result = await mongoose.model(name).deleteMany({});
      removed[name] = result.deletedCount;
    }

    messenger.clearOutbox();
    return ok(res, { removed, notice: 'Business data cleared. Users, banks and config were kept.' });
  }),

  /** Forces a delinquency sweep across the portfolio. */
  sweep: asyncHandler(async (_req, res) => ok(res, await loanService.refreshAllDelinquency())),
};

export default {
  eligibilityController,
  configController,
  dashboardController,
  notificationController,
  auditController,
  mockController,
  testingController,
  requireTestHooks,
};
