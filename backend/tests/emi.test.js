/**
 * Loan mathematics — pure functions, no database.
 * These guard the money: an error here silently corrupts every schedule.
 */
import { describe, expect, test } from '@jest/globals';
import dayjs from 'dayjs';
import {
  round2,
  calculateEmi,
  principalFromEmi,
  buildAmortisationSchedule,
  totalInterest,
  calculateFoir,
  maxEligiblePrincipal,
  addMonthsClamped,
  daysPastDue,
  bucketForDpd,
} from '../src/utils/emi.js';

describe('round2', () => {
  test('rounds to two decimals without binary float artefacts', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('calculateEmi', () => {
  test('matches the standard reducing-balance formula', () => {
    // ₹1,00,000 at 12% for 12 months is a well-known ₹8,884.88.
    expect(calculateEmi(100000, 12, 12)).toBeCloseTo(8884.88, 2);
  });

  test('falls back to simple division at a zero rate', () => {
    expect(calculateEmi(120000, 0, 12)).toBe(10000);
  });

  test('returns 0 for non-positive inputs', () => {
    expect(calculateEmi(0, 12, 12)).toBe(0);
    expect(calculateEmi(100000, 12, 0)).toBe(0);
    expect(calculateEmi(-5000, 12, 12)).toBe(0);
  });

  test('a longer tenure lowers the EMI but raises total interest', () => {
    const short = calculateEmi(500000, 14, 12);
    const long = calculateEmi(500000, 14, 60);
    expect(long).toBeLessThan(short);
    expect(long * 60).toBeGreaterThan(short * 12);
  });
});

describe('principalFromEmi', () => {
  test('is the exact inverse of calculateEmi', () => {
    const emi = calculateEmi(750000, 13.5, 36);
    expect(principalFromEmi(emi, 13.5, 36)).toBeCloseTo(750000, 0);
  });

  test('handles a zero rate', () => {
    expect(principalFromEmi(10000, 0, 12)).toBe(120000);
  });
});

describe('buildAmortisationSchedule', () => {
  const principal = 400000;
  const rate = 11.5;
  const months = 24;
  const schedule = buildAmortisationSchedule({
    principal,
    annualRatePct: rate,
    months,
    startDate: new Date('2026-01-15'),
  });

  test('produces one row per installment', () => {
    expect(schedule).toHaveLength(months);
    expect(schedule[0].installmentNo).toBe(1);
    expect(schedule[months - 1].installmentNo).toBe(months);
  });

  test('principal components sum exactly to the sanctioned amount', () => {
    const sum = round2(schedule.reduce((total, row) => total + row.principal, 0));
    expect(sum).toBe(principal);
  });

  test('closes out at a zero balance', () => {
    expect(schedule[months - 1].closingBalance).toBe(0);
  });

  test('every row is internally consistent', () => {
    schedule.forEach((row) => {
      expect(round2(row.principal + row.interest)).toBe(row.totalAmount);
      expect(round2(row.openingBalance - row.principal)).toBe(row.closingBalance);
      expect(row.principal).toBeGreaterThan(0);
      expect(row.interest).toBeGreaterThanOrEqual(0);
    });
  });

  test('the balance decreases monotonically', () => {
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i].openingBalance).toBeLessThan(schedule[i - 1].openingBalance);
      expect(schedule[i].openingBalance).toBe(schedule[i - 1].closingBalance);
    }
  });

  test('interest falls and principal rises over the term', () => {
    expect(schedule[0].interest).toBeGreaterThan(schedule[months - 1].interest);
    expect(schedule[0].principal).toBeLessThan(schedule[months - 1].principal);
  });

  test('due dates are monthly, starting one month after disbursement', () => {
    expect(dayjs(schedule[0].dueDate).format('YYYY-MM-DD')).toBe('2026-02-15');
    expect(dayjs(schedule[1].dueDate).format('YYYY-MM-DD')).toBe('2026-03-15');
    expect(dayjs(schedule[months - 1].dueDate).format('YYYY-MM-DD')).toBe('2028-01-15');
  });

  test('total interest is positive and below the principal for normal terms', () => {
    const interest = totalInterest(schedule);
    expect(interest).toBeGreaterThan(0);
    expect(interest).toBeLessThan(principal);
  });

  test('a single-installment loan settles the whole principal at once', () => {
    const single = buildAmortisationSchedule({ principal: 50000, annualRatePct: 12, months: 1 });
    expect(single).toHaveLength(1);
    expect(single[0].principal).toBe(50000);
    expect(single[0].closingBalance).toBe(0);
  });

  test('a zero-rate loan charges no interest', () => {
    const free = buildAmortisationSchedule({ principal: 120000, annualRatePct: 0, months: 12 });
    expect(totalInterest(free)).toBe(0);
    expect(round2(free.reduce((total, row) => total + row.principal, 0))).toBe(120000);
  });

  test('returns an empty schedule for invalid input', () => {
    expect(buildAmortisationSchedule({ principal: 0, annualRatePct: 12, months: 12 })).toEqual([]);
    expect(buildAmortisationSchedule({ principal: 1000, annualRatePct: 12, months: 0 })).toEqual([]);
  });
});

describe('addMonthsClamped', () => {
  test('clamps a 31st start date into a shorter month', () => {
    expect(dayjs(addMonthsClamped(new Date('2026-01-31'), 1)).format('YYYY-MM-DD')).toBe('2026-02-28');
  });

  test('handles a leap year correctly', () => {
    expect(dayjs(addMonthsClamped(new Date('2028-01-31'), 1)).format('YYYY-MM-DD')).toBe('2028-02-29');
  });

  test('keeps the day of month where it exists', () => {
    expect(dayjs(addMonthsClamped(new Date('2026-03-15'), 3)).format('YYYY-MM-DD')).toBe('2026-06-15');
  });
});

describe('calculateFoir', () => {
  test('expresses obligations as a fraction of income', () => {
    expect(calculateFoir({ monthlyIncome: 100000, existingEmi: 10000, proposedEmi: 30000 })).toBe(0.4);
  });

  test('treats zero income as infinitely over-leveraged', () => {
    expect(calculateFoir({ monthlyIncome: 0, proposedEmi: 5000 })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('maxEligiblePrincipal', () => {
  test('caps the loan so FOIR stays within policy', () => {
    const principal = maxEligiblePrincipal({
      monthlyIncome: 100000,
      existingEmi: 10000,
      maxFoir: 0.5,
      annualRatePct: 12,
      months: 24,
    });

    // The affordable EMI is 50000 - 10000 = 40000.
    const emi = calculateEmi(principal, 12, 24);
    expect(emi).toBeCloseTo(40000, 0);
    expect(calculateFoir({ monthlyIncome: 100000, existingEmi: 10000, proposedEmi: emi }))
      .toBeLessThanOrEqual(0.5);
  });

  test('returns zero when obligations already exhaust the limit', () => {
    expect(
      maxEligiblePrincipal({
        monthlyIncome: 50000,
        existingEmi: 30000,
        maxFoir: 0.5,
        annualRatePct: 12,
        months: 24,
      })
    ).toBe(0);
  });
});

describe('delinquency ageing', () => {
  test('daysPastDue is zero before and on the due date', () => {
    const asOf = new Date('2026-06-10');
    expect(daysPastDue(new Date('2026-06-20'), asOf)).toBe(0);
    expect(daysPastDue(new Date('2026-06-10'), asOf)).toBe(0);
  });

  test('daysPastDue counts whole days once overdue', () => {
    expect(daysPastDue(new Date('2026-06-01'), new Date('2026-06-10'))).toBe(9);
  });

  test('buckets follow standard collections bands', () => {
    expect(bucketForDpd(0)).toBe('current');
    expect(bucketForDpd(1)).toBe('1-30');
    expect(bucketForDpd(30)).toBe('1-30');
    expect(bucketForDpd(31)).toBe('31-60');
    expect(bucketForDpd(60)).toBe('31-60');
    expect(bucketForDpd(61)).toBe('61-90');
    expect(bucketForDpd(90)).toBe('61-90');
    expect(bucketForDpd(91)).toBe('90+');
    expect(bucketForDpd(365)).toBe('90+');
  });
});
