/**
 * Repayments: self-serve collection through the mock gateway, manual recording
 * by ops, part-prepayment with schedule regeneration, and foreclosure.
 *
 * Allocation rule (applied consistently everywhere):
 *   within an installment  ->  penalty, then interest, then principal
 *   across installments    ->  oldest first
 */
import dayjs from 'dayjs';
import LoanAccount from '../models/LoanAccount.js';
import EMISchedule from '../models/EMISchedule.js';
import Payment from '../models/Payment.js';
import ApiError from '../utils/ApiError.js';
import {
  EMI_STATUS,
  LOAN_STATUS,
  LIVE_LOAN_STATUSES,
  PAYMENT_TYPES,
  PAYMENT_STATUS,
  EVENTS,
} from '../constants/index.js';
import { round2, calculateEmi, buildAmortisationSchedule } from '../utils/emi.js';
import { getPolicy } from './configService.js';
import { recordAudit } from './auditService.js';
import { notifyUser, notifyStaff } from './notificationService.js';
import gateway from '../mocks/paymentGateway.js';
import {
  getSchedule,
  applyTotals,
  closeIfSettled,
  refreshLoanDelinquency,
  getForeclosureQuote,
  interestOutstanding,
  principalOutstanding,
  penaltyOutstanding,
  dueOnEmi,
} from './loanService.js';
import { emitToStaff, emitToUser, broadcastDataChange } from '../realtime/socket.js';

/** Tolerance for float comparison on money values (half a paisa). */
const EPSILON = 0.005;

/** Installments that still owe something. */
const isOpen = (emi) => ![EMI_STATUS.PAID, EMI_STATUS.WAIVED].includes(emi.status);

/**
 * Applies `amount` across the given installments, oldest first.
 * Mutates the EMI documents in memory and returns the allocation breakdown.
 */
function allocateAcross(emis, amount) {
  let remaining = round2(amount);
  const allocations = [];
  let penaltyTotal = 0;
  let interestTotal = 0;
  let principalTotal = 0;

  for (const emi of emis) {
    if (remaining <= EPSILON) break;

    const allocation = { emi: emi._id, installmentNo: emi.installmentNo, penalty: 0, interest: 0, principal: 0 };

    // 1. Late fee.
    const penaltyDue = penaltyOutstanding(emi);
    if (penaltyDue > 0) {
      const pay = Math.min(penaltyDue, remaining);
      emi.penaltyPaid = round2(emi.penaltyPaid + pay);
      allocation.penalty = round2(pay);
      remaining = round2(remaining - pay);
    }

    // 2. Interest, then 3. principal — both drawn from `amountPaid`.
    const interestDue = interestOutstanding(emi);
    if (remaining > EPSILON && interestDue > 0) {
      const pay = Math.min(interestDue, remaining);
      emi.amountPaid = round2(emi.amountPaid + pay);
      allocation.interest = round2(pay);
      remaining = round2(remaining - pay);
    }

    const principalDue = principalOutstanding(emi);
    if (remaining > EPSILON && principalDue > 0) {
      const pay = Math.min(principalDue, remaining);
      emi.amountPaid = round2(emi.amountPaid + pay);
      allocation.principal = round2(pay);
      remaining = round2(remaining - pay);
    }

    if (allocation.penalty || allocation.interest || allocation.principal) {
      // Settle or downgrade the installment's status.
      emi.status = dueOnEmi(emi) <= EPSILON ? EMI_STATUS.PAID : EMI_STATUS.PARTIALLY_PAID;
      if (emi.status === EMI_STATUS.PAID) {
        emi.paidAt = new Date();
        emi.dpd = 0;
      }

      penaltyTotal += allocation.penalty;
      interestTotal += allocation.interest;
      principalTotal += allocation.principal;
      allocations.push(allocation);
    }
  }

  return {
    allocations,
    penaltyComponent: round2(penaltyTotal),
    interestComponent: round2(interestTotal),
    principalComponent: round2(principalTotal),
    unallocated: round2(Math.max(0, remaining)),
  };
}

/**
 * Rebuilds the tail of a schedule after a principal prepayment.
 * Keeps the original due dates and maturity, lowering the EMI instead.
 */
async function regenerateSchedule({ loan, prepayAmount, asOf }) {
  const schedule = await getSchedule(loan._id);

  // Only untouched, still-future installments are re-cut.
  const future = schedule.filter(
    (emi) => emi.status === EMI_STATUS.PENDING && emi.amountPaid === 0 && dayjs(emi.dueDate).isAfter(asOf)
  );

  if (!future.length) {
    throw ApiError.badRequest(
      'There are no future installments left to prepay against. Use foreclosure to settle the loan.'
    );
  }

  const remainingPrincipal = round2(future.reduce((sum, emi) => sum + emi.principal, 0));

  if (prepayAmount >= remainingPrincipal - EPSILON) {
    throw ApiError.badRequest(
      `A part-payment must be less than the remaining principal of ₹${remainingPrincipal.toLocaleString('en-IN')}. Use foreclosure to close the loan.`,
      [{ field: 'amount', message: 'Exceeds the prepayable principal.' }]
    );
  }

  const newPrincipal = round2(remainingPrincipal - prepayAmount);
  const rows = buildAmortisationSchedule({
    principal: newPrincipal,
    annualRatePct: loan.roi,
    months: future.length,
    firstDueDate: future[0].dueDate,
  });

  await Promise.all(
    future.map((emi, index) => {
      const row = rows[index];
      emi.openingBalance = row.openingBalance;
      emi.principal = row.principal;
      emi.interest = row.interest;
      emi.totalAmount = row.totalAmount;
      emi.closingBalance = row.closingBalance;
      return emi.save();
    })
  );

  loan.principalPrepaid = round2((loan.principalPrepaid || 0) + prepayAmount);
  loan.emiAmount = calculateEmi(newPrincipal, loan.roi, future.length);

  return { newPrincipal, newEmi: loan.emiAmount, installmentsRecut: future.length };
}

/* ------------------------------------------------------------------ */
/* Core posting                                                        */
/* ------------------------------------------------------------------ */

/**
 * Posts a payment against a loan. This is the only function that writes to the
 * ledger — the customer gateway flow and the ops manual-entry flow both call it.
 *
 * @param {object} params
 * @param {object} params.loan       LoanAccount document
 * @param {number} params.amount
 * @param {'emi'|'part_payment'|'foreclosure'} params.type
 * @param {string} params.mode
 * @param {object} params.actor      whoever triggered it
 * @param {boolean} [params.byStaff] true when ops records an offline payment
 */
export async function postPayment({
  loan,
  amount,
  type = PAYMENT_TYPES.EMI,
  mode = 'mock_gateway',
  gatewayRef = '',
  notes = '',
  actor,
  byStaff = false,
  ip = '',
}) {
  const value = round2(amount);
  if (!(value > 0)) throw ApiError.badRequest('Payment amount must be greater than zero.');

  if (!LIVE_LOAN_STATUSES.includes(loan.status)) {
    throw ApiError.conflict(`Loan ${loan.loanNo} is "${loan.status}" and cannot accept payments.`);
  }

  const asOf = new Date();
  const policy = await getPolicy();

  // Age the loan first so late fees are on the books before money is applied.
  await refreshLoanDelinquency(loan, { policy, asOf });

  let schedule = await getSchedule(loan._id);
  let result;
  let closureNote = '';
  let regeneration = null;

  if (type === PAYMENT_TYPES.FORECLOSURE) {
    const quote = await getForeclosureQuote(loan, { asOf });

    if (value < quote.totalPayable - EPSILON) {
      throw ApiError.badRequest(
        `Foreclosure requires the full settlement amount of ₹${quote.totalPayable.toLocaleString('en-IN')}.`,
        [{ field: 'amount', message: `Minimum ₹${quote.totalPayable}` }]
      );
    }

    const openRows = schedule.filter(isOpen);

    // Waive unaccrued interest by writing it off the future rows. Doing it on the
    // schedule (rather than skipping it during allocation) keeps the
    // penalty -> interest -> principal invariant intact for every derivation.
    openRows.forEach((emi) => {
      if (dayjs(emi.dueDate).startOf('day').isAfter(dayjs(asOf).endOf('day'))) {
        emi.interest = round2(Math.min(emi.amountPaid, emi.interest));
        emi.totalAmount = round2(emi.interest + emi.principal);
      }
    });

    // Everything still owed after the waiver — matches the quote exactly.
    const settleable = round2(openRows.reduce((sum, emi) => sum + dueOnEmi(emi), 0));
    result = allocateAcross(openRows, settleable);
    await Promise.all(openRows.map((emi) => emi.save()));

    loan.otherChargesPaid = round2((loan.otherChargesPaid || 0) + quote.foreclosureCharge);
    result.unallocated = round2(Math.max(0, value - settleable - quote.foreclosureCharge));
    closureNote = `Foreclosed on ${dayjs(asOf).format('DD MMM YYYY')} — ₹${quote.foreclosureCharge.toLocaleString('en-IN')} foreclosure charge, ₹${quote.interestSaved.toLocaleString('en-IN')} future interest waived`;
    schedule = await getSchedule(loan._id);
  } else if (type === PAYMENT_TYPES.PART_PAYMENT) {
    // Clear anything already due first, then prepay principal with the rest.
    const dueRows = schedule.filter(
      (emi) => isOpen(emi) && dueOnEmi(emi) > 0 && !dayjs(emi.dueDate).startOf('day').isAfter(dayjs(asOf).endOf('day'))
    );
    result = allocateAcross(dueRows, value);

    // Validate and re-cut the tail BEFORE persisting anything, so a rejected
    // prepayment cannot leave the schedule half-updated.
    const prepay = result.unallocated;
    if (prepay > EPSILON) {
      regeneration = await regenerateSchedule({ loan, prepayAmount: prepay, asOf });
      result.principalComponent = round2(result.principalComponent + prepay);
      result.unallocated = 0;
    } else if (!result.allocations.length) {
      throw ApiError.badRequest('Nothing is currently outstanding on this loan.');
    }

    await Promise.all(dueRows.map((emi) => emi.save()));
    schedule = await getSchedule(loan._id);
  } else {
    // Ordinary EMI collection — oldest installment first, may cover several.
    const openRows = schedule.filter(isOpen);
    if (!openRows.length) {
      throw ApiError.conflict('This loan has no outstanding installments.');
    }
    result = allocateAcross(openRows, value);
    await Promise.all(openRows.map((emi) => emi.save()));

    if (result.unallocated > EPSILON) {
      throw ApiError.badRequest(
        `₹${result.unallocated.toLocaleString('en-IN')} exceeds everything currently outstanding. Use "Part payment" or "Foreclose" to pay more than the schedule.`,
        [{ field: 'amount', message: 'Exceeds total outstanding.' }]
      );
    }
    schedule = await getSchedule(loan._id);
  }

  // --- Persist the ledger row ---------------------------------------------
  const payment = await Payment.create({
    loanAccount: loan._id,
    borrower: loan.borrower,
    amount: value,
    type,
    mode,
    status: PAYMENT_STATUS.SUCCESS,
    principalComponent: result.principalComponent,
    interestComponent: result.interestComponent,
    penaltyComponent: result.penaltyComponent,
    excessAmount: result.unallocated,
    allocations: result.allocations,
    gatewayRef,
    recordedBy: byStaff ? actor._id : null,
    notes,
    paidAt: asOf,
  });

  applyTotals(loan, schedule);

  const closed = await closeIfSettled(loan, schedule, {
    reason: closureNote || 'Loan fully repaid',
  });
  // Early settlement is recorded distinctly from running to maturity.
  if (closed && type === PAYMENT_TYPES.FORECLOSURE) loan.status = LOAN_STATUS.FORECLOSED;

  await loan.save();

  // --- Trail, notifications, realtime -------------------------------------
  const label =
    type === PAYMENT_TYPES.FORECLOSURE
      ? 'Foreclosure settlement'
      : type === PAYMENT_TYPES.PART_PAYMENT
        ? 'Part payment'
        : 'EMI payment';

  await recordAudit({
    entity: 'LoanAccount',
    entityId: loan._id,
    action: `payment.${type}`,
    description: `${label} of ₹${value.toLocaleString('en-IN')} received on ${loan.loanNo}${byStaff ? ` (recorded by ${actor.name})` : ''}${regeneration ? ` — EMI revised to ₹${regeneration.newEmi.toLocaleString('en-IN')}` : ''}`,
    actor,
    meta: { paymentNo: payment.paymentNo, type, mode, closed },
    ip,
  });

  await notifyUser({
    userId: loan.borrower,
    title: closed ? 'Loan closed — congratulations!' : `${label} received`,
    message: closed
      ? `Loan ${loan.loanNo} is now fully settled. Your No-Dues Certificate is ready to download.`
      : `₹${value.toLocaleString('en-IN')} received against ${loan.loanNo}. Outstanding principal is now ₹${loan.principalOutstanding.toLocaleString('en-IN')}.`,
    type: 'success',
    category: 'payment',
    link: `/app/loans/${loan._id}`,
    alsoEmail: true,
  });

  if (closed) {
    notifyStaff({
      title: 'Loan closed',
      message: `${loan.loanNo} — ${closureNote || 'fully repaid'}`,
      type: 'success',
      link: `/admin/loans/${loan._id}`,
    });
  }

  const payload = {
    loanId: String(loan._id),
    loanNo: loan.loanNo,
    paymentNo: payment.paymentNo,
    amount: value,
    status: loan.status,
  };
  emitToUser(loan.borrower, EVENTS.PAYMENT_RECORDED, payload);
  emitToStaff(EVENTS.PAYMENT_RECORDED, payload);
  emitToUser(loan.borrower, EVENTS.LOAN_UPDATED, { loanId: String(loan._id), status: loan.status });
  emitToStaff(EVENTS.LOAN_UPDATED, { loanId: String(loan._id), status: loan.status });
  broadcastDataChange(['loans', 'payments', 'collections', 'dashboard'], { userId: loan.borrower });

  return { payment, loan, closed, regeneration };
}

/* ------------------------------------------------------------------ */
/* Self-serve gateway flow                                             */
/* ------------------------------------------------------------------ */

/** Step 1 — create a mock gateway order for the amount the customer chose. */
export async function initiatePayment({ loan, amount, type = PAYMENT_TYPES.EMI }) {
  const value = round2(amount);
  if (!(value > 0)) throw ApiError.badRequest('Enter an amount greater than zero.');

  if (!LIVE_LOAN_STATUSES.includes(loan.status)) {
    throw ApiError.conflict(`Loan ${loan.loanNo} is "${loan.status}" and cannot accept payments.`);
  }

  const order = gateway.createOrder({ amount: value, loanAccountId: loan._id, purpose: type });

  return {
    ...order,
    // The sandbox mints the checkout result the browser SDK would normally return.
    sandboxCheckout: gateway.simulateCheckout(order.orderId),
    loanNo: loan.loanNo,
  };
}

/** Step 2 — verify the gateway signature, then post to the ledger. */
export async function confirmPayment({ orderId, paymentId, signature, type, actor, ip = '' }) {
  const verification = gateway.verifyPayment({ orderId, paymentId, signature });
  if (!verification.verified) throw ApiError.badRequest(verification.reason);

  const loan = await LoanAccount.findById(verification.loanAccountId);
  if (!loan) throw ApiError.notFound('Loan account not found for this order.');
  if (String(loan.borrower) !== String(actor._id)) {
    throw ApiError.forbidden('This payment order belongs to a different borrower.');
  }

  // Guard against a replayed capture callback.
  const existing = await Payment.findOne({ gatewayRef: paymentId });
  if (existing) {
    throw ApiError.conflict('This payment has already been recorded.', [
      { field: 'paymentId', message: `Recorded as ${existing.paymentNo}` },
    ]);
  }

  return postPayment({
    loan,
    amount: verification.amount,
    type: type || verification.purpose || PAYMENT_TYPES.EMI,
    mode: 'mock_gateway',
    gatewayRef: paymentId,
    actor,
    ip,
  });
}

/** Ops records an offline/branch payment on the borrower's behalf. */
export async function recordManualPayment({ loanId, amount, type, mode, notes, actor, ip = '' }) {
  const loan = await LoanAccount.findById(loanId);
  if (!loan) throw ApiError.notFound('Loan account not found.');

  return postPayment({
    loan,
    amount,
    type,
    mode: mode || 'neft',
    notes,
    actor,
    byStaff: true,
    ip,
  });
}

/** Ledger listing with role scoping. */
export async function listPayments({ actor, filters = {}, page = 1, limit = 20 }) {
  const query = {};
  if (actor.role === 'customer') query.borrower = actor._id;
  if (filters.loanAccount) query.loanAccount = filters.loanAccount;
  if (filters.type && filters.type !== 'all') query.type = filters.type;

  const [items, total] = await Promise.all([
    Payment.find(query)
      .populate('loanAccount', 'loanNo')
      .populate('borrower', 'name email')
      .sort({ paidAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(query),
  ]);

  return { items, total };
}

/** Next installment the borrower owes — drives the dashboard "Next EMI" card. */
export async function getNextDue(loanId) {
  const next = await EMISchedule.findOne({
    loanAccount: loanId,
    status: { $in: [EMI_STATUS.PENDING, EMI_STATUS.PARTIALLY_PAID, EMI_STATUS.OVERDUE] },
  }).sort({ installmentNo: 1 });

  if (!next) return null;

  return {
    _id: String(next._id),
    installmentNo: next.installmentNo,
    dueDate: next.dueDate,
    totalAmount: next.totalAmount,
    penalty: next.penalty,
    amountPaid: next.amountPaid,
    amountDue: dueOnEmi(next),
    status: next.status,
    dpd: next.dpd,
  };
}

export default {
  postPayment,
  initiatePayment,
  confirmPayment,
  recordManualPayment,
  listPayments,
  getNextDue,
};
