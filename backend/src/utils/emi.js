/**
 * Loan mathematics: EMI, amortisation schedules, affordability (FOIR/DTI) and
 * delinquency bucketing. Pure functions only — no DB access — so they are cheap
 * to unit test and reusable by both the origination and servicing modules.
 */
import dayjs from 'dayjs';

/** Round to 2 decimals, avoiding binary float artefacts (e.g. 1.005 -> 1.01). */
export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Monthly rate as a decimal fraction from an annual percentage. */
export const monthlyRate = (annualRatePct) => Number(annualRatePct) / 12 / 100;

/**
 * Standard reducing-balance EMI:
 *   E = P * r * (1+r)^n / ((1+r)^n - 1)
 * Falls back to simple division when the rate is zero.
 */
export function calculateEmi(principal, annualRatePct, months) {
  const P = Number(principal);
  const n = Number(months);
  if (!(P > 0) || !(n > 0)) return 0;

  const r = monthlyRate(annualRatePct);
  if (r === 0) return round2(P / n);

  const factor = Math.pow(1 + r, n);
  return round2((P * r * factor) / (factor - 1));
}

/** Inverse of calculateEmi — the largest principal serviceable by a given EMI. */
export function principalFromEmi(emi, annualRatePct, months) {
  const E = Number(emi);
  const n = Number(months);
  if (!(E > 0) || !(n > 0)) return 0;

  const r = monthlyRate(annualRatePct);
  if (r === 0) return round2(E * n);

  const factor = Math.pow(1 + r, n);
  return round2((E * (factor - 1)) / (r * factor));
}

/**
 * Adds `count` months to a date, clamping the day-of-month so that a 31st
 * start date does not silently roll into the next month (31 Jan -> 28 Feb).
 */
export function addMonthsClamped(date, count) {
  const base = dayjs(date);
  const target = base.add(count, 'month');
  const lastDayOfTarget = target.endOf('month').date();
  return target.date(Math.min(base.date(), lastDayOfTarget)).startOf('day').toDate();
}

/**
 * Builds a full amortisation schedule.
 *
 * Rounding drift is absorbed by the final installment: its principal is exactly
 * the remaining balance, so the sum of principal components equals the sanctioned
 * amount to the paisa.
 *
 * @returns {Array<{installmentNo, dueDate, openingBalance, principal, interest, totalAmount, closingBalance}>}
 */
export function buildAmortisationSchedule({
  principal,
  annualRatePct,
  months,
  startDate = new Date(),
  firstDueDate = null,
}) {
  const P = round2(principal);
  const n = Number(months);
  if (!(P > 0) || !(n > 0)) return [];

  const r = monthlyRate(annualRatePct);
  const emi = calculateEmi(P, annualRatePct, n);
  const anchor = firstDueDate ? dayjs(firstDueDate).subtract(1, 'month').toDate() : startDate;

  const rows = [];
  let balance = P;

  for (let i = 1; i <= n; i += 1) {
    const openingBalance = round2(balance);
    const interest = round2(openingBalance * r);

    let principalComponent;
    let totalAmount;

    if (i === n) {
      // Final installment settles whatever principal is left.
      principalComponent = openingBalance;
      totalAmount = round2(principalComponent + interest);
    } else {
      principalComponent = round2(emi - interest);
      // Guard against a negative amortisation scenario on very short/odd terms.
      if (principalComponent <= 0) principalComponent = round2(openingBalance / (n - i + 1));
      if (principalComponent > openingBalance) principalComponent = openingBalance;
      totalAmount = round2(principalComponent + interest);
    }

    balance = round2(openingBalance - principalComponent);

    rows.push({
      installmentNo: i,
      dueDate: addMonthsClamped(anchor, i),
      openingBalance,
      principal: principalComponent,
      interest,
      totalAmount,
      closingBalance: balance,
    });
  }

  return rows;
}

/** Total interest payable across a schedule. */
export const totalInterest = (schedule) => round2(schedule.reduce((sum, row) => sum + row.interest, 0));

/**
 * FOIR / DTI — the share of monthly income consumed by debt obligations
 * once the proposed EMI is added. Returned as a 0..n fraction (0.45 = 45%).
 */
export function calculateFoir({ monthlyIncome, existingEmi = 0, proposedEmi = 0 }) {
  const income = Number(monthlyIncome);
  if (!(income > 0)) return Number.POSITIVE_INFINITY;
  return round2(((Number(existingEmi) || 0) + (Number(proposedEmi) || 0)) / income * 100) / 100;
}

/**
 * Largest principal that keeps FOIR within policy, given current obligations.
 * Returns 0 when the applicant has no headroom at all.
 */
export function maxEligiblePrincipal({
  monthlyIncome,
  existingEmi = 0,
  maxFoir,
  annualRatePct,
  months,
}) {
  const affordableEmi = round2(Number(monthlyIncome) * Number(maxFoir) - Number(existingEmi || 0));
  if (!(affordableEmi > 0)) return 0;
  return principalFromEmi(affordableEmi, annualRatePct, months);
}

/** Whole days a due date is past — 0 when not yet due. */
export function daysPastDue(dueDate, asOf = new Date()) {
  const diff = dayjs(asOf).startOf('day').diff(dayjs(dueDate).startOf('day'), 'day');
  return diff > 0 ? diff : 0;
}

/** Standard collections ageing buckets. */
export const DELINQUENCY_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];

export function bucketForDpd(dpd) {
  const days = Number(dpd) || 0;
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export default {
  round2,
  monthlyRate,
  calculateEmi,
  principalFromEmi,
  addMonthsClamped,
  buildAmortisationSchedule,
  totalInterest,
  calculateFoir,
  maxEligiblePrincipal,
  daysPastDue,
  bucketForDpd,
  DELINQUENCY_BUCKETS,
};
