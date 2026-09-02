/** Loan servicing endpoints: disbursement, schedule, statements, foreclosure. */
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginated, getQuery } from '../utils/http.js';
import ApiError from '../utils/ApiError.js';
import loanService from '../services/loanService.js';
import paymentService from '../services/paymentService.js';
import pdfService from '../services/pdfService.js';
import { getTrail } from '../services/auditService.js';
import { LOAN_STATUS } from '../constants/index.js';

/** Ops triggers disbursement on a signed application. */
export const disburse = asyncHandler(async (req, res) => {
  const { loan } = await loanService.disburse({
    applicationId: req.params.applicationId,
    bankId: req.body?.bankId,
    actor: req.user,
    ip: req.ip,
  });
  return created(res, { loan });
});

export const list = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = getQuery(req);
  const { items, total } = await loanService.listLoans({
    actor: req.user,
    filters,
    page,
    limit,
  });
  return paginated(res, items, { page, limit, total });
});

/** Full servicing view: loan, schedule, ledger and next due installment. */
export const detail = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user, { populate: true });
  // Age the account first so the response never shows stale overdue figures.
  await loanService.refreshLoanDelinquency(loan);

  const [schedule, payments, nextDue] = await Promise.all([
    loanService.getSchedule(loan._id),
    loanService.getPayments(loan._id),
    paymentService.getNextDue(loan._id),
  ]);

  return ok(res, {
    loan,
    schedule: schedule.map((emi) => emi.toJSON()),
    payments,
    nextDue,
  });
});

export const schedule = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user);
  const rows = await loanService.getSchedule(loan._id);
  return ok(res, { schedule: rows.map((emi) => emi.toJSON()) });
});

export const payments = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user);
  return ok(res, { payments: await loanService.getPayments(loan._id) });
});

export const foreclosureQuote = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user);

  if (![LOAN_STATUS.ACTIVE, LOAN_STATUS.OVERDUE].includes(loan.status)) {
    throw ApiError.conflict(`Loan ${loan.loanNo} is "${loan.status}" and cannot be foreclosed.`);
  }

  await loanService.refreshLoanDelinquency(loan);
  return ok(res, { quote: await loanService.getForeclosureQuote(loan) });
});

export const timeline = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user);
  return ok(res, { timeline: await getTrail('LoanAccount', loan._id) });
});

/* ------------------------------------------------------------------ */
/* PDF documents                                                       */
/* ------------------------------------------------------------------ */

const sendPdf = (res, buffer, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
};

export const schedulePdf = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user, { populate: true });
  const rows = await loanService.getSchedule(loan._id);

  const buffer = await pdfService.buildSchedulePdf({
    loan: loan.toJSON(),
    borrower: loan.borrower,
    schedule: rows.map((emi) => emi.toJSON()),
  });

  return sendPdf(res, buffer, `${loan.loanNo}-repayment-schedule.pdf`);
});

export const statementPdf = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user, { populate: true });
  await loanService.refreshLoanDelinquency(loan);

  const [rows, ledger] = await Promise.all([
    loanService.getSchedule(loan._id),
    loanService.getPayments(loan._id),
  ]);

  const buffer = await pdfService.buildStatementPdf({
    loan: loan.toJSON(),
    borrower: loan.borrower,
    schedule: rows.map((emi) => emi.toJSON()),
    payments: ledger,
  });

  return sendPdf(res, buffer, `${loan.loanNo}-statement.pdf`);
});

/** No-Dues Certificate — only issued once the account is genuinely settled. */
export const nocPdf = asyncHandler(async (req, res) => {
  const loan = await loanService.loadLoan(req.params.id, req.user, { populate: true });

  if (![LOAN_STATUS.CLOSED, LOAN_STATUS.FORECLOSED].includes(loan.status)) {
    throw ApiError.conflict(
      'A No-Dues Certificate can only be issued once the loan has been fully settled.'
    );
  }

  if (!loan.nocIssuedAt) {
    loan.nocIssuedAt = new Date();
    await loan.save();
  }

  const buffer = await pdfService.buildNocPdf({ loan: loan.toJSON(), borrower: loan.borrower });
  return sendPdf(res, buffer, `${loan.loanNo}-no-dues-certificate.pdf`);
});

export default {
  disburse,
  list,
  detail,
  schedule,
  payments,
  foreclosureQuote,
  timeline,
  schedulePdf,
  statementPdf,
  nocPdf,
};
