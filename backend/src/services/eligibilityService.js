/**
 * Pre-qualification (public, no login, no persistence).
 *
 * Gives an indicative amount / EMI / rate from declared income and obligations.
 * Deliberately conservative and clearly labelled "indicative" — the binding
 * offer is only produced after the bureau pull during underwriting.
 */
import {
  calculateEmi,
  maxEligiblePrincipal,
  calculateFoir,
  round2,
  totalInterest,
  buildAmortisationSchedule,
} from '../utils/emi.js';
import { getPolicy } from './configService.js';

/**
 * @param {object} input
 * @param {number} input.monthlyIncome
 * @param {string} input.employmentType
 * @param {number} [input.existingEmi]
 * @param {number} [input.desiredAmount]
 * @param {number} [input.tenureMonths]
 */
export async function checkEligibility(input) {
  const policy = await getPolicy();
  const { product, underwriting } = policy;

  const monthlyIncome = Number(input.monthlyIncome);
  const existingEmi = Number(input.existingEmi || 0);
  const tenureMonths = Number(input.tenureMonths || product.maxTenureMonths);

  const reasons = [];

  if (monthlyIncome < underwriting.minMonthlyIncome) {
    reasons.push(
      `A minimum monthly income of ₹${underwriting.minMonthlyIncome.toLocaleString('en-IN')} is required.`
    );
  }
  if (existingEmi >= monthlyIncome * underwriting.maxDti) {
    reasons.push('Existing EMI obligations already use up the permitted income share.');
  }

  // Indicative pricing uses the mid-point of the product band, since no bureau
  // score exists yet at pre-qualification time.
  const indicativeRoi = round2((product.minRoi + product.maxRoi) / 2);

  if (reasons.length) {
    return {
      eligible: false,
      reasons,
      indicativeRoi,
      product: { name: product.name, code: product.code },
    };
  }

  const headroom = maxEligiblePrincipal({
    monthlyIncome,
    existingEmi,
    maxFoir: underwriting.maxDti,
    annualRatePct: indicativeRoi,
    months: tenureMonths,
  });

  // Cap by product limits and, when the applicant named an amount, by that too.
  const cappedByProduct = Math.min(headroom, product.maxAmount);
  const requested = Number(input.desiredAmount || 0);
  const eligibleAmount = Math.floor(
    (requested > 0 ? Math.min(cappedByProduct, requested) : cappedByProduct) / 1000
  ) * 1000;

  if (eligibleAmount < product.minAmount) {
    return {
      eligible: false,
      reasons: [
        `Your income supports up to ₹${eligibleAmount.toLocaleString('en-IN')}, which is below the minimum loan size of ₹${product.minAmount.toLocaleString('en-IN')}.`,
      ],
      indicativeRoi,
      maxEligibleAmount: eligibleAmount,
      product: { name: product.name, code: product.code },
    };
  }

  const emi = calculateEmi(eligibleAmount, indicativeRoi, tenureMonths);
  const schedule = buildAmortisationSchedule({
    principal: eligibleAmount,
    annualRatePct: indicativeRoi,
    months: tenureMonths,
  });

  return {
    eligible: true,
    reasons: [],
    maxEligibleAmount: Math.floor(cappedByProduct / 1000) * 1000,
    eligibleAmount,
    tenureMonths,
    indicativeRoi,
    emi,
    processingFee: round2((eligibleAmount * product.processingFeePct) / 100),
    processingFeePct: product.processingFeePct,
    totalInterest: totalInterest(schedule),
    totalPayable: round2(eligibleAmount + totalInterest(schedule)),
    foir: calculateFoir({ monthlyIncome, existingEmi, proposedEmi: emi }),
    maxFoir: underwriting.maxDti,
    product: {
      name: product.name,
      code: product.code,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      minTenureMonths: product.minTenureMonths,
      maxTenureMonths: product.maxTenureMonths,
    },
    disclaimer:
      'Indicative only. The final offer depends on credit bureau checks and document verification.',
  };
}

export default { checkEligibility };
