/**
 * Happy path: apply → auto-approve → e-sign → disburse → repay → close → NOC.
 *
 * Runs on every configured device project, so the whole journey is proven on
 * desktop, tablet and phone viewports with the same testids.
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
  navigateTo,
} from './helpers.js';

test.describe('Happy path — full loan lifecycle', () => {
  test('a customer applies, is auto-approved, is disbursed, repays and closes the loan', async ({
    page,
    request,
  }) => {
    const customer = newCustomer('happy');

    // ---------- Admin sets up a disbursement account ----------
    await login(page, DEMO.admin);
    await navigateTo(page, 'banks');
    await expect(page.getByTestId(TESTIDS.adminBanks.root)).toBeVisible();

    const bankCode = `PAY${Date.now().toString().slice(-6)}`;
    await page.getByTestId(TESTIDS.adminBanks.addBank).click();
    await expect(page.getByTestId(TESTIDS.adminBanks.modal)).toBeVisible();
    await page.getByTestId(TESTIDS.adminBanks.nameInput).fill('SedBank Payout Account');
    await page.getByTestId(TESTIDS.adminBanks.codeInput).fill(bankCode);
    await page.getByTestId(TESTIDS.adminBanks.typeSelect).selectOption('disbursement');
    await page.getByTestId(TESTIDS.adminBanks.accountNumberInput).fill('123456789012');
    await page.getByTestId(TESTIDS.adminBanks.ifscInput).fill('HDFC0001234');
    await page.getByTestId(TESTIDS.adminBanks.submit).click();

    // The new bank must appear in the table immediately.
    await expect(page.getByTestId(TESTIDS.adminBanks.modal)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId(TESTIDS.adminBanks.table)).toContainText(bankCode);

    await logout(page);

    // ---------- Customer journey ----------
    await registerCustomer(page, customer);

    // A brand-new account shows the empty state, not fabricated zeros.
    await expect(page.getByTestId(TESTIDS.customerDashboard.empty)).toBeVisible();

    const { applicationNo, applicationId } = await submitApplication(page, {
      amount: 400000,
      tenure: 24,
      income: 90000,
      existingEmi: 5000,
    });
    expect(applicationNo).toMatch(/^SB-APP-\d+$/);

    await completeKyc(page);
    await uploadDocument(page, 'income_proof', 'payslip.pdf');
    await uploadDocument(page, 'address_proof', 'address.pdf');

    // Excellent score → straight-through approval.
    await runCreditCheck(page, 'excellent');
    await expect(page.getByTestId(TESTIDS.applicationDetail.status)).toContainText('Approved');

    const offerAmount = await page.getByTestId(TESTIDS.applicationDetail.offerAmount).innerText();
    expect(offerAmount).toContain('₹');

    await acceptOfferAndSign(page);
    await addPayoutAccount(page);

    await logout(page);

    // ---------- Ops verifies documents and disburses ----------
    await login(page, DEMO.ops);
    const { loanNo, loanId } = await verifyDocumentsAndDisburse(page, applicationId);
    expect(loanNo).toMatch(/^SB-LN-\d+$/);

    // The schedule must be generated with one row per month of tenure.
    await expect(page.getByTestId(TESTIDS.adminLoanDetail.scheduleTable)).toBeVisible();
    const rows = page.getByTestId(TESTIDS.adminLoanDetail.scheduleTable).locator('tbody tr');
    await expect(rows).toHaveCount(24);

    await logout(page);

    // ---------- Customer sees the disbursed loan ----------
    await login(page, { email: customer.email, password: customer.password });
    await navigateTo(page, 'loans');
    await expect(page.getByTestId(TESTIDS.customerLoans.table)).toContainText(loanNo);

    await page.goto(`/app/loans/${loanId}`);
    await expect(page.getByTestId(TESTIDS.loanDetail.root)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.loanDetail.status)).toContainText('Active');

    // ---------- Pay one EMI through the mocked gateway ----------
    await page.getByTestId(TESTIDS.loanDetail.payNow).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.payModal)).toBeVisible();
    await page.getByTestId(TESTIDS.loanDetail.payConfirm).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.payModal)).toBeHidden({ timeout: 25_000 });

    // The ledger must show the receipt straight away.
    await page.getByTestId(TESTIDS.loanDetail.tabPayments).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.paymentsTable)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId(TESTIDS.loanDetail.paymentsTable).locator('tbody tr')
    ).toHaveCount(1);

    // At least one installment is now settled.
    await page.getByTestId(TESTIDS.loanDetail.tabSchedule).click();
    await expect(
      page.getByTestId(TESTIDS.loanDetail.scheduleTable).locator('tbody tr').first()
    ).toContainText('Paid');

    // ---------- Foreclose to close the loan ----------
    await page.getByTestId(TESTIDS.loanDetail.foreclose).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.foreclosureModal)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.loanDetail.foreclosureTotal)).toContainText('₹', {
      timeout: 20_000,
    });
    await page.getByTestId(TESTIDS.loanDetail.foreclosureConfirm).click();
    await expect(page.getByTestId(TESTIDS.loanDetail.foreclosureModal)).toBeHidden({
      timeout: 30_000,
    });

    await expect(page.getByTestId(TESTIDS.loanDetail.status)).toContainText('Foreclosed', {
      timeout: 20_000,
    });

    // ---------- The No-Dues Certificate becomes available ----------
    const nocButton = page.getByTestId(TESTIDS.loanDetail.downloadNoc);
    await expect(nocButton).toBeVisible();

    // Verified through the API: a browser download is unreliable to assert on mobile.
    const nocResponse = await request.get(`${API_URL}/api/loans/${loanId}/noc.pdf`, {
      headers: {
        Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('sedbank.token'))}`,
      },
    });
    expect(nocResponse.ok()).toBeTruthy();
    expect(nocResponse.headers()['content-type']).toContain('application/pdf');
    expect((await nocResponse.body()).subarray(0, 4).toString()).toBe('%PDF');
  });
});
