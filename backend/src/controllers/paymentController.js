/** Repayment endpoints — self-serve gateway flow and ops manual entry. */
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginated, getQuery } from '../utils/http.js';
import loanService from '../services/loanService.js';
import paymentService from '../services/paymentService.js';

/** Step 1 of the customer flow — create a mock gateway order. */
export const initiate = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.body.loanId, req.user);
  const order = await paymentService.initiatePayment({
    loan,
    amount: req.body.amount,
    type: req.body.type,
  });
  return created(res, { order });
});

/** Step 2 — verify the gateway signature and post the payment to the ledger. */
export const confirm = asyncHandler(async (req, res) => {
  const { payment, loan, closed, regeneration } = await paymentService.confirmPayment({
    ...req.body,
    actor: req.user,
    ip: req.ip,
  });
  return created(res, { payment, loan, closed, regeneration });
});

/** Ops records an offline payment (branch, NEFT, cash). */
export const record = asyncHandler(async (req, res) => {
  const { payment, loan, closed, regeneration } = await paymentService.recordManualPayment({
    ...req.body,
    actor: req.user,
    ip: req.ip,
  });
  return created(res, { payment, loan, closed, regeneration });
});

export const list = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = getQuery(req);
  const { items, total } = await paymentService.listPayments({
    actor: req.user,
    filters,
    page,
    limit,
  });
  return paginated(res, items, { page, limit, total });
});

export default { initiate, confirm, record, list };
