/**
 * Cross-role real-time sync (Socket.IO).
 *
 * Two browser contexts are open at once — an officer and a customer — to prove
 * that an action in one portal reaches the other WITHOUT a page reload:
 *   - a submitted application appears in the officer's worklist
 *   - an approval reaches the customer as a live status change plus notification
 */
import { test, expect } from '@playwright/test';
import {
  TESTIDS,
  DEMO,
  newCustomer,
  login,
  registerCustomer,
  submitApplication,
  completeKyc,
  uploadDocument,
  runCreditCheck,
  navigateTo,
  expectToast,
} from './helpers.js';

test.describe('Real-time cross-portal sync', () => {
  test('a submitted application reaches the officer worklist without a refresh', async ({
    browser,
  }) => {
    const customer = newCustomer('realtime');

    const officerContext = await browser.newContext();
    const customerContext = await browser.newContext();
    const officerPage = await officerContext.newPage();
    const customerPage = await customerContext.newPage();

    try {
      // ---------- Officer parks on the worklist ----------
      await login(officerPage, DEMO.credit);
      await navigateTo(officerPage, 'applications');
      await expect(officerPage.getByTestId(TESTIDS.adminApplications.root)).toBeVisible();

      // The live badge confirms the socket handshake succeeded.
      await expect(officerPage.getByTestId(TESTIDS.adminApplications.liveBadge)).toHaveAttribute(
        'data-connected',
        'true',
        { timeout: 20_000 }
      );

      // ---------- Customer submits an application ----------
      await registerCustomer(customerPage, customer);
      const { applicationNo } = await submitApplication(customerPage, {
        amount: 250000,
        tenure: 24,
        income: 75000,
      });

      // ---------- It must appear with no interaction on the officer's page ----------
      await expect(officerPage.getByTestId(TESTIDS.adminApplications.table)).toContainText(
        applicationNo,
        { timeout: 25_000 }
      );

      // ---------- Customer runs the credit check; officer's row updates live ----------
      await completeKyc(customerPage);
      await uploadDocument(customerPage, 'income_proof', 'payslip.pdf');
      await runCreditCheck(customerPage, 'excellent');

      // Approved applications leave the "needs review" queue automatically.
      await officerPage.getByTestId(TESTIDS.adminApplications.statusFilter).selectOption('approved');
      await expect(officerPage.getByTestId(TESTIDS.adminApplications.table)).toContainText(
        applicationNo,
        { timeout: 25_000 }
      );
    } finally {
      await officerContext.close();
      await customerContext.close();
    }
  });

  test('an officer decision reaches the customer live, with a notification', async ({ browser }) => {
    const customer = newCustomer('livedecision');

    const customerContext = await browser.newContext();
    const officerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    const officerPage = await officerContext.newPage();

    try {
      // Customer takes an application to the manual-review queue, then waits.
      await registerCustomer(customerPage, customer);
      const { applicationId } = await submitApplication(customerPage, {
        amount: 200000,
        tenure: 24,
        income: 70000,
        existingEmi: 3000,
      });
      await completeKyc(customerPage);
      await uploadDocument(customerPage, 'income_proof', 'payslip.pdf');
      await runCreditCheck(customerPage, 'fair');
      await expect(customerPage.getByTestId(TESTIDS.applicationDetail.status)).toContainText(
        'In Review'
      );

      // The customer's realtime channel must be up before we assert on a push.
      await expect(customerPage.getByTestId(TESTIDS.shell.connectionStatus)).toHaveAttribute(
        'data-connected',
        'true',
        { timeout: 20_000 }
      );

      // ---------- Officer approves in the other context ----------
      await login(officerPage, DEMO.credit);
      await officerPage.goto(`/admin/applications/${applicationId}`);
      await officerPage.getByTestId(TESTIDS.adminReview.approve).click();
      await expect(officerPage.getByTestId(TESTIDS.adminReview.decisionModal)).toBeVisible();
      await officerPage
        .getByTestId(TESTIDS.adminReview.remarksInput)
        .fill('Approved after manual review of income documents.');
      await officerPage.getByTestId(TESTIDS.adminReview.decisionConfirm).click();
      await expect(officerPage.getByTestId(TESTIDS.adminReview.status)).toContainText('Approved', {
        timeout: 20_000,
      });

      // ---------- The customer's page updates itself ----------
      // A live toast is pushed for the notification…
      await expectToast(customerPage, /approved/i, 25_000);

      // …the status badge changes…
      await expect(customerPage.getByTestId(TESTIDS.applicationDetail.status)).toContainText(
        'Approved',
        { timeout: 25_000 }
      );

      // …the offer panel appears…
      await expect(customerPage.getByTestId(TESTIDS.applicationDetail.offerSection)).toBeVisible({
        timeout: 25_000,
      });

      // …and the notification bell carries an unread badge.
      await expect(customerPage.getByTestId(TESTIDS.shell.notificationBadge)).toBeVisible({
        timeout: 25_000,
      });
    } finally {
      await customerContext.close();
      await officerContext.close();
    }
  });
});
