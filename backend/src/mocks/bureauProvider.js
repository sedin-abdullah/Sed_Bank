/**
 * Mock credit bureau (CIBIL / Experian style).
 *
 * Returns a randomised score in the 300–900 range plus a coherent report summary
 * (the sub-metrics are derived from the score so the report never contradicts
 * itself — e.g. an 820 score does not come with 6 recent delinquencies).
 *
 * QA determinism: when test hooks are enabled the caller may pass a `simulate`
 * band to force a specific score range, which is how the Playwright suite drives
 * the auto-approve / manual-review / auto-reject paths reliably.
 */
import crypto from 'node:crypto';

/** Score bands used both for pricing labels and for QA simulation. */
export const SCORE_BANDS = {
  excellent: [800, 900],
  very_good: [750, 799],
  good: [700, 749],
  fair: [650, 699],
  poor: [550, 649],
  bad: [300, 549],
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export function bandForScore(score) {
  if (score >= 800) return 'excellent';
  if (score >= 750) return 'very_good';
  if (score >= 700) return 'good';
  if (score >= 650) return 'fair';
  if (score >= 550) return 'poor';
  return 'bad';
}

/**
 * @param {object} options
 * @param {string} [options.simulate] One of SCORE_BANDS keys, or 'random'.
 * @param {number} [options.forceScore] Exact score, overrides `simulate`.
 */
export function pullBureauReport({ simulate = 'random', forceScore = null } = {}) {
  let score;

  if (Number.isFinite(forceScore)) {
    score = Math.min(900, Math.max(300, Math.round(forceScore)));
  } else if (SCORE_BANDS[simulate]) {
    const [min, max] = SCORE_BANDS[simulate];
    score = randomInt(min, max);
  } else {
    // Realistic-ish distribution: most applicants land in the 600–800 range.
    score = randomInt(300, 900);
  }

  const band = bandForScore(score);
  // Derive sub-metrics from the score so the report reads consistently.
  const quality = (score - 300) / 600; // 0 (worst) .. 1 (best)

  const summary = {
    openAccounts: randomInt(1, 6),
    closedAccounts: randomInt(0, 8),
    totalOutstanding: randomInt(0, 900000),
    enquiriesLast6Months: Math.max(0, Math.round((1 - quality) * randomInt(3, 9))),
    delinquenciesLast24Months: Math.max(0, Math.round((1 - quality) * randomInt(2, 6))),
    oldestAccountMonths: Math.round(12 + quality * randomInt(24, 180)),
    creditUtilizationPct: Math.round(15 + (1 - quality) * randomInt(30, 70)),
    writeOffs: quality < 0.35 ? randomInt(0, 2) : 0,
  };

  const factors = [];
  if (summary.delinquenciesLast24Months > 0) factors.push('Recent payment delinquencies reported');
  if (summary.creditUtilizationPct > 60) factors.push('High revolving credit utilisation');
  if (summary.enquiriesLast6Months > 4) factors.push('Multiple recent credit enquiries');
  if (summary.oldestAccountMonths > 96) factors.push('Long, well-established credit history');
  if (summary.writeOffs > 0) factors.push('Written-off account(s) on record');
  if (!factors.length) factors.push('Clean repayment record across active trade lines');

  return {
    provider: 'mock-bureau',
    inquiryId: `BRQ-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    score,
    band,
    scoreRange: { min: 300, max: 900 },
    summary,
    factors,
    pulledAt: new Date().toISOString(),
    disclaimer: 'Simulated bureau data — generated locally for demo purposes only.',
  };
}

export default { pullBureauReport, bandForScore, SCORE_BANDS };
