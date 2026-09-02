/**
 * Rejection paths: automatic decline on a low bureau score, and a manual
 * officer rejection. Also covers the affordability decline (income too low for
 * the minimum ticket size).
 */
import { test, expect } from '@playwright/test';
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
  decideApplication,
} from './helpers.js';

test.describe('Rejection paths', () => {
  test('a low bureau score is auto-rejected with a reason the applicant can see', async ({ page }) => {
    const customer = newCustomer('reject');

    await registerCustomer(page, customer);
    const { applicationId } = await submitApplication(page, {
      amount: 200000,
      tenure: 24,
      income: 60000,
      existingEmi: 2000,
    });

    await completeKyc(page);
    await uploadDocument(page, 'income_proof', 'payslip.pdf');

    // A "bad" band sits below the configured rejection floor.
    await runCreditCheck(page, 'bad');

    await expect(page.getByTestId(TESTIDS.applicationDetail.status)).toContainText('Rejected');

    // The decline reason must be shown — not a dead end.
    const notice = page.getByTestId(TESTIDS.applicationDetail.rejected);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/below the minimum acceptable score/i);

    // The stepper marks the credit-check step as terminated.
    await expect(page.getByTestId('application-stepper-step-bureau')).toHaveAttribute(
      'data-state',
      'failed'
    );

    // A rejected application offers a way forward.
    await expect(notice).toContainText(/apply again/i);

    // No offer or e-sign panel is reachable.
    await expect(page.getByTestId(TESTIDS.applicationDetail.offerSection)).toBeHidden();
    await expect(page.getByTestId(TESTIDS.applicationDetail.esignSection)).toBeHidden();

    await logout(page);

    // Officer view confirms the same decision, attributed to the rule engine.
    await login(page, DEMO.credit);
    await page.goto(`/admin/applications/${applicationId}`);
    await expect(page.getByTestId(TESTIDS.adminReview.status)).toContainText('Rejected');
    await expect(page.getByTestId(TESTIDS.adminReview.decisionsPanel)).toContainText('Rule Engine');

    // A decided application no longer offers decision buttons.
    await expect(page.getByTestId(TESTIDS.adminReview.approve)).toBeHidden();
    await expect(page.getByTestId(TESTIDS.adminReview.reject)).toBeHidden();
  });

  test('an officer can reject a manually-reviewed application', async ({ page }) => {
    const customer = newCustomer('manualreject');

    await registerCustomer(page, customer);
    const { applicationId } = await submitApplication(page, {
      amount: 500000,
      tenure: 48,
      income: 80000,
      existingEmi: 12000,
    });

    await completeKyc(page, { pan: 'PQRST5678K' });
    await uploadDocument(page, 'income_proof', 'payslip.pdf');
    await runCreditCheck(page, 'fair');
    await expect(page.getByTestId(TESTIDS.applicationDetail.status)).toContainText('In Review');

    await logout(page);

    await login(page, DEMO.credit);
    await decideApplication(
      page,
      applicationId,
      'rejected',
      'Declined: recent delinquencies on the bureau report and insufficient income headroom.'
    );
    await expect(page.getByTestId(TESTIDS.adminReview.status)).toContainText('Rejected');

    await logout(page);

    // The applicant sees the officer's reason verbatim.
    await login(page, { email: customer.email, password: customer.password });
    await page.goto(`/app/applications/${applicationId}`);
    await expect(page.getByTestId(TESTIDS.applicationDetail.rejected)).toContainText(
      'recent delinquencies'
    );
  });

  test('the eligibility calculator declines an income below policy', async ({ page }) => {
    const customer = newCustomer('ineligible');
    await registerCustomer(page, customer);

    await page.goto('/app/eligibility');
    await expect(page.getByTestId(TESTIDS.eligibility.root)).toBeVisible();

    await page.getByTestId(TESTIDS.eligibility.incomeInput).fill('9000');
    await page.getByTestId(TESTIDS.eligibility.employmentSelect).selectOption('salaried');
    await page.getByTestId(TESTIDS.eligibility.submit).click();

    const ineligible = page.getByTestId(TESTIDS.eligibility.ineligible);
    await expect(ineligible).toBeVisible({ timeout: 15_000 });
    await expect(ineligible).toContainText(/minimum monthly income/i);
  });
});
