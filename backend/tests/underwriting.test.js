/**
 * Credit policy — the rule engine's `evaluate()` is pure, so the whole
 * underwriting decision tree is testable without a database.
 */
import { describe, expect, test } from '@jest/globals';
import { evaluate, buildOffer } from '../src/services/underwritingService.js';
import { DECISION } from '../src/constants/index.js';
import { calculateFoir } from '../src/utils/emi.js';

const policy = {
  product: {
    code: 'PL',
    name: 'Personal Loan',
    minAmount: 50000,
    maxAmount: 2000000,
    minTenureMonths: 6,
    maxTenureMonths: 60,
    minRoi: 10.5,
    maxRoi: 24,
    processingFeePct: 2,
  },
  underwriting: {
    minScore: 600,
    autoApproveScore: 750,
    maxDti: 0.5,
    minMonthlyIncome: 15000,
    blacklistedPans: ['BLACK1234L'],
    riskPricing: [
      { minScore: 800, roi: 11.5, label: 'Excellent' },
      { minScore: 750, roi: 13.5, label: 'Very Good' },
      { minScore: 700, roi: 16, label: 'Good' },
      { minScore: 650, roi: 19, label: 'Fair' },
      { minScore: 300, roi: 23, label: 'Poor' },
    ],
  },
};

/** Minimal application shape the rule engine reads. */
const application = (overrides = {}) => ({
  amountRequested: 400000,
  tenureRequested: 24,
  kyc: { pan: 'ABCDE1234F' },
  employment: { monthlyIncome: 90000, existingEmi: 5000 },
  ...overrides,
});

const bureau = (score) => ({ score });

describe('hard knock-out rules', () => {
  test('a blacklisted PAN is always rejected, whatever the score', () => {
    const result = evaluate({
      application: application({ kyc: { pan: 'BLACK1234L' } }),
      bureau: bureau(880),
      policy,
    });

    expect(result.decision).toBe(DECISION.AUTO_REJECTED);
    expect(result.rulesApplied).toContain('blacklist.pan');
    expect(result.reason).toMatch(/negative list/i);
    expect(result.offer).toBeNull();
  });

  test('the blacklist match is case-insensitive', () => {
    const result = evaluate({
      application: application({ kyc: { pan: 'black1234l' } }),
      bureau: bureau(800),
      policy,
    });
    expect(result.decision).toBe(DECISION.AUTO_REJECTED);
  });

  test('a score below the floor is rejected', () => {
    const result = evaluate({ application: application(), bureau: bureau(540), policy });

    expect(result.decision).toBe(DECISION.AUTO_REJECTED);
    expect(result.rulesApplied).toContain('bureau.minScore');
    expect(result.reason).toContain('540');
    expect(result.reason).toContain('600');
  });

  test('a score exactly at the floor is not rejected on score', () => {
    const result = evaluate({ application: application(), bureau: bureau(600), policy });
    expect(result.decision).not.toBe(DECISION.AUTO_REJECTED);
  });

  test('income below the policy minimum is rejected', () => {
    const result = evaluate({
      application: application({ employment: { monthlyIncome: 12000, existingEmi: 0 } }),
      bureau: bureau(820),
      policy,
    });

    expect(result.decision).toBe(DECISION.AUTO_REJECTED);
    expect(result.rulesApplied).toContain('income.minimum');
  });
});

describe('straight-through approval', () => {
  test('a high score within FOIR is auto-approved with a priced offer', () => {
    const result = evaluate({ application: application(), bureau: bureau(820), policy });

    expect(result.decision).toBe(DECISION.AUTO_APPROVED);
    expect(result.offer).not.toBeNull();
    expect(result.offer.amount).toBe(400000);
    // 820 lands in the 800+ band.
    expect(result.offer.roi).toBe(11.5);
    expect(result.offer.emi).toBeGreaterThan(0);
    expect(result.offer.processingFee).toBe(8000); // 2% of 4,00,000
    expect(result.dti).toBeLessThanOrEqual(policy.underwriting.maxDti);
  });

  test('the rate is priced from the risk grid', () => {
    const bands = [
      [820, 11.5],
      [770, 13.5],
      [720, 16],
      [670, 19],
      [620, 23],
    ];

    bands.forEach(([score, expectedRoi]) => {
      const result = evaluate({
        application: application({ employment: { monthlyIncome: 300000, existingEmi: 0 } }),
        bureau: bureau(score),
        policy,
      });
      expect(result.offer.roi).toBe(expectedRoi);
    });
  });

  test('a score exactly at the auto-approval threshold approves', () => {
    const result = evaluate({
      application: application({ employment: { monthlyIncome: 300000, existingEmi: 0 } }),
      bureau: bureau(750),
      policy,
    });
    expect(result.decision).toBe(DECISION.AUTO_APPROVED);
  });
});

describe('manual review routing', () => {
  test('a mid-band score routes to an officer with recommended terms', () => {
    const result = evaluate({ application: application(), bureau: bureau(690), policy });

    expect(result.decision).toBe(DECISION.ROUTED_MANUAL);
    expect(result.rulesApplied).toContain('route.manualReview');
    // Recommended pricing is still computed so the officer sees a starting point.
    expect(result.offer).not.toBeNull();
    expect(result.offer.roi).toBe(19);
    expect(result.reason).toMatch(/manual credit review/i);
  });
});

describe('affordability capping', () => {
  test('the sanction is reduced so FOIR stays within the limit', () => {
    // Income 40k, existing EMI 5k -> affordable EMI is 15k, well below the
    // EMI a 20L request over 24 months would need.
    const result = evaluate({
      application: application({
        amountRequested: 2000000,
        employment: { monthlyIncome: 40000, existingEmi: 5000 },
      }),
      bureau: bureau(800),
      policy,
    });

    expect(result.decision).toBe(DECISION.AUTO_APPROVED);
    expect(result.offer.amount).toBeLessThan(2000000);
    expect(result.dti).toBeLessThanOrEqual(policy.underwriting.maxDti);
    expect(result.rulesApplied).toContain('affordability.foir');
  });

  test('the sanction never exceeds the product maximum', () => {
    const result = evaluate({
      application: application({
        amountRequested: 2000000,
        employment: { monthlyIncome: 5000000, existingEmi: 0 },
      }),
      bureau: bureau(850),
      policy,
    });

    expect(result.offer.amount).toBeLessThanOrEqual(policy.product.maxAmount);
  });

  test('sanctions are rounded down to the nearest thousand', () => {
    const result = evaluate({
      application: application({
        amountRequested: 2000000,
        employment: { monthlyIncome: 63000, existingEmi: 3000 },
      }),
      bureau: bureau(810),
      policy,
    });

    expect(result.offer.amount % 1000).toBe(0);
  });

  test('too little headroom for the minimum ticket size is rejected', () => {
    const result = evaluate({
      application: application({
        amountRequested: 400000,
        employment: { monthlyIncome: 16000, existingEmi: 7000 },
      }),
      bureau: bureau(800),
      policy,
    });

    expect(result.decision).toBe(DECISION.AUTO_REJECTED);
    expect(result.rulesApplied).toContain('affordability.minTicket');
    expect(result.reason).toMatch(/minimum ticket size/i);
  });

  test('the approved EMI genuinely fits inside the FOIR limit', () => {
    const result = evaluate({
      application: application({
        amountRequested: 1500000,
        employment: { monthlyIncome: 120000, existingEmi: 20000 },
      }),
      bureau: bureau(830),
      policy,
    });

    const foir = calculateFoir({
      monthlyIncome: 120000,
      existingEmi: 20000,
      proposedEmi: result.offer.emi,
    });
    expect(foir).toBeLessThanOrEqual(policy.underwriting.maxDti);
  });
});

describe('buildOffer', () => {
  test('prices an offer consistently', () => {
    const offer = buildOffer({ amount: 500000, roi: 12, tenureMonths: 36, processingFeePct: 2 });

    expect(offer.amount).toBe(500000);
    expect(offer.processingFee).toBe(10000);
    // 5,00,000 at 1%/month over 36 months = 16,607.15.
    expect(offer.emi).toBeCloseTo(16607.15, 2);
    expect(offer.totalInterest).toBeGreaterThan(0);
    expect(offer.totalPayable).toBeCloseTo(500000 + offer.totalInterest, 2);
    expect(offer.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('total payable always equals principal plus interest', () => {
    [
      [100000, 10.5, 6],
      [750000, 18, 48],
      [2000000, 24, 60],
    ].forEach(([amount, roi, months]) => {
      const offer = buildOffer({ amount, roi, tenureMonths: months, processingFeePct: 2 });
      expect(offer.totalPayable).toBeCloseTo(amount + offer.totalInterest, 2);
    });
  });
});

describe('policy is data, not code', () => {
  test('raising the auto-approval threshold changes the outcome for the same file', () => {
    const strict = {
      ...policy,
      underwriting: { ...policy.underwriting, autoApproveScore: 850 },
    };

    const lenient = evaluate({ application: application(), bureau: bureau(800), policy });
    const strictResult = evaluate({ application: application(), bureau: bureau(800), policy: strict });

    expect(lenient.decision).toBe(DECISION.AUTO_APPROVED);
    expect(strictResult.decision).toBe(DECISION.ROUTED_MANUAL);
  });

  test('tightening the FOIR limit reduces the sanctioned amount', () => {
    const tight = { ...policy, underwriting: { ...policy.underwriting, maxDti: 0.25 } };

    const loose = evaluate({
      application: application({ amountRequested: 2000000 }),
      bureau: bureau(820),
      policy,
    });
    const tightResult = evaluate({
      application: application({ amountRequested: 2000000 }),
      bureau: bureau(820),
      policy: tight,
    });

    expect(tightResult.offer.amount).toBeLessThan(loose.offer.amount);
  });
});
