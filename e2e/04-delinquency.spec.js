/**
 * Delinquency path: an aged loan turns overdue, accrues a late fee, appears in
 * the correct collections bucket, is chased, and is then cleared by a payment.
 *
 * The loan's schedule is aged with the `/api/testing/backdate-loan` hook rather
 * than waiting a real month.
 */
import { test, expect } from '@playwright/test';
import { API_URL } from '../playwright.config.js';
import {
  TESTIDS,
  DEMO,
  newCustomer,
  login,
  logout,
  registerCustomer,
  submitApplication,
  completeKyc,
  uploadDocument,
  runCreditCheck,
  acceptOfferAndSign,
  addPayoutAccount,
  verifyDocumentsAndDisburse,
  backdateLoan,
  navigateTo,
  expectToast,
} from './helpers.js';

test.describe('Delinquency path', () => {
  test('an aged loan becomes overdue, is bucketed, chased and then cleared', async ({
    page,
    request,
  }) => {
    const customer = newCustomer('overdue');

    // ---------- Get a live loan on the books ----------
    await registerCustomer(page, customer);
    const { applicationId } = await submitApplication(page, {
      amount: 300000,
      tenure: 24,
      income: 85000,
      existingEmi: 3000,
    });

    await completeKyc(page);
    await uploadDocument(page, 'income_proof', 'payslip.pdf');
    await runCreditCheck(page, 'excellent');
    await acceptOfferAndSign(page);
    await addPayoutAccount(page);
    await logout(page);

    await login(page, DEMO.ops);
    const { loanNo, loanId } = await verifyDocumentsAndDisburse(page, applicationId);
    await logout(page);

    // ---------- Age the schedule by 75 days ----------
    // First EMI falls due at +30 days, so two installments are now past due.
    const aged = await backdateLoan(request, API_URL, loanId, 75);
    expect(aged.loan.dpd).toBeGreaterThan(0);
    expect(aged.loan.overdueAmount).toBeGreaterThan(0);
    expect(['1-30', '31-60', '61-90']).toContain(aged.loan.bucket);
    // A late fee must have been charged on the aged installments.
    expect(aged.loan.penaltyAccrued).toBeGreaterThan(0);

    // ---------- Collections officer sees it ----------
    await login(page, DEMO.collections);
    await navigateTo(page, 'collections');
    await expect(page.getByTestId(TESTIDS.adminCollections.root)).toBeVisible();

    // The ageing KPIs must reflect the delinquency, not zeros.
    await expect(page.getByTestId(TESTIDS.adminCollections.delinquentCount)).not.toHaveText('0');
    await expect(page.getByTestId(TESTIDS.adminCollections.table)).toContainText(loanNo);

    // Filtering to the loan's own bucket keeps it visible.
    await page.getByTestId(TESTIDS.adminCollections.bucketFilter).selectOption(aged.loan.bucket);
    await expect(page.getByTestId(TESTIDS.adminCollections.table)).toContainText(loanNo, {
      timeout: 15_000,
    });

    // ---------- Bulk reminder ----------
    await page.getByTestId(TESTIDS.adminCollections.selectAll).check();
    await page.getByTestId(TESTIDS.adminCollections.sendReminders).click();
    await expect(page.getByTestId(TESTIDS.common.modal)).toBeVisible();
    await page.getByRole('button', { name: /^Send \d+ reminder/ }).click();
    await expectToast(page, /reminder/i);

    // ---------- Log a follow-up on the account ----------
    await page.goto(`/admin/loans/${loanId}`);
    await expect(page.getByTestId(TESTIDS.adminLoanDetail.root)).toBeVisible();

    await page.getByTestId(TESTIDS.adminCollections.addNote).click();
    await expect(page.getByTestId(TESTIDS.adminCollections.noteModal)).toBeVisible();
    await page.getByTestId(TESTIDS.adminCollections.noteTypeSelect).selectOption('call');
    await page.getByTestId(TESTIDS.adminCollections.noteOutcomeSelect).selectOption('promise_to_pay');
    await page
      .getByTestId(TESTIDS.adminCollections.noteTextInput)
      .fill('Spoke to the borrower. They will clear both overdue EMIs by Friday.');
    await page.getByTestId(TESTIDS.adminCollections.noteSubmit).click();
    await expect(page.getByTestId(TESTIDS.adminCollections.noteModal)).toBeHidden({
      timeout: 20_000,
    });

    await logout(page);

    // ---------- Borrower sees the overdue position ----------
    await login(page, { email: customer.email, password: customer.password });
    await page.goto(`/app/loans/${loanId}`);
    await expect(page.getByTestId(TESTIDS.loanDetail.status)).toContainText('Overdue');

    // The schedule must flag the aged installments.
    await expect(
      page.getByTestId(TESTIDS.loanDetail.scheduleTable).locator('tbody tr').first()
    ).toContainText('Overdue');

    // ---------- Clear the dues ----------
    await page.getByTestId(TESTIDS.loanDetail.payNow).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.payModal)).toBeVisible();

    // The pre-filled amount is the oldest installment's dues including the fee.
    const amount = await page.getByTestId(TESTIDS.loanDetail.payAmountInput).inputValue();
    expect(Number(amount)).toBeGreaterThan(0);

    await page.getByTestId(TESTIDS.loanDetail.payConfirm).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.payModal)).toBeHidden({ timeout: 25_000 });

    // The first installment is now settled, penalty included.
    await expect(
      page.getByTestId(TESTIDS.loanDetail.scheduleTable).locator('tbody tr').first()
    ).toContainText('Paid', { timeout: 20_000 });
  });
});
