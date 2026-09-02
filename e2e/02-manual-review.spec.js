/**
 * Manual-underwriting path: a mid-band score routes to a credit officer, who
 * sends the file back for more information and then approves it on revised terms.
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
  navigateTo,
} from './helpers.js';

test.describe('Manual review path', () => {
  test('a mid-band score routes to an officer, who requests info then approves', async ({ page }) => {
    const customer = newCustomer('review');

    await registerCustomer(page, customer);
    const { applicationNo, applicationId } = await submitApplication(page, {
      amount: 300000,
      tenure: 36,
      income: 70000,
      existingEmi: 4000,
    });

    await completeKyc(page);
    await uploadDocument(page, 'income_proof', 'payslip.pdf');

    // A "fair" score sits between the floor and the auto-approval threshold.
    await runCreditCheck(page, 'fair');
    await expect(page.getByTestId(TESTIDS.applicationDetail.status)).toContainText('In Review');

    await logout(page);

    // ---------- Officer sees it in the queue ----------
    await login(page, DEMO.credit);
    await navigateTo(page, 'applications');
    await expect(page.getByTestId(TESTIDS.adminApplications.table)).toContainText(applicationNo);

    // ---------- Send back for more information ----------
    await decideApplication(
      page,
      applicationId,
      'sent_back',
      'The uploaded payslip is not legible. Please upload the last three months of payslips.'
    );
    await expect(page.getByTestId(TESTIDS.adminReview.status)).toContainText('Sent Back');

    await logout(page);

    // ---------- Customer sees the request and responds ----------
    await login(page, { email: customer.email, password: customer.password });
    await page.goto(`/app/applications/${applicationId}`);
    await expect(page.getByTestId(TESTIDS.applicationDetail.status)).toContainText('Sent Back');

    // The remark from the officer must be visible to the applicant.
    await expect(page.getByTestId(TESTIDS.applicationDetail.remarks)).toContainText('not legible');

    // The documents panel is available again so they can supply what is missing.
    await expect(page.getByTestId(TESTIDS.applicationDetail.documentsSection)).toBeVisible();
    await uploadDocument(page, 'income_proof', 'payslips-3-months.pdf');

    await logout(page);

    // ---------- Officer approves on revised terms ----------
    await login(page, DEMO.credit);
    await page.goto(`/admin/applications/${applicationId}`);
    await expect(page.getByTestId(TESTIDS.adminReview.root)).toBeVisible();

    // FOIR must be computed and shown before the officer decides.
    await expect(page.getByTestId(TESTIDS.adminReview.foir)).toContainText('%');
    await expect(page.getByTestId(TESTIDS.adminReview.bureauScore)).toBeVisible();

    await page.getByTestId(TESTIDS.adminReview.approve).click();
    await expect(page.getByTestId(TESTIDS.adminReview.decisionModal)).toBeVisible();

    // Override the recommended amount to a lower sanction.
    await page.getByTestId(TESTIDS.adminReview.approvedAmountInput).fill('250000');
    await page.getByTestId(TESTIDS.adminReview.roiInput).fill('18');
    await page.getByTestId(TESTIDS.adminReview.tenureInput).fill('36');
    await page
      .getByTestId(TESTIDS.adminReview.remarksInput)
      .fill('Approved at a reduced sanction of 2.5L after reviewing the revised payslips.');
    await page.getByTestId(TESTIDS.adminReview.decisionConfirm).click();

    await expect(page.getByTestId(TESTIDS.adminReview.decisionModal)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId(TESTIDS.adminReview.status)).toContainText('Approved');

    // The decision is recorded against the officer in the history panel.
    await expect(page.getByTestId(TESTIDS.adminReview.decisionsPanel)).toContainText('reduced sanction');

    await logout(page);

    // ---------- Customer sees the revised offer ----------
    await login(page, { email: customer.email, password: customer.password });
    await page.goto(`/app/applications/${applicationId}`);

    await expect(page.getByTestId(TESTIDS.applicationDetail.offerSection)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.applicationDetail.offerAmount)).toContainText('2,50,000');
    await expect(page.getByTestId(TESTIDS.applicationDetail.offerRoi)).toContainText('18');
    await expect(page.getByTestId(TESTIDS.applicationDetail.offerTenure)).toContainText('36');
  });
});
