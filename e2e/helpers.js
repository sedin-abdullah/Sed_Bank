/**
 * Shared E2E helpers.
 *
 * All element lookups go through the shared testid catalogue
 * (`shared/testIds.js`) — the same module the components import — so no testid
 * string is ever duplicated between the app and the tests.
 */
import { expect } from '@playwright/test';
import { TESTIDS, rowId, navId } from '../shared/testIds.js';

export { TESTIDS, rowId, navId };

export const DEMO = {
  admin: { email: 'admin@sedbank.test', password: 'Admin@12345' },
  credit: { email: 'credit@sedbank.test', password: 'Staff@12345' },
  ops: { email: 'ops@sedbank.test', password: 'Staff@12345' },
  collections: { email: 'collections@sedbank.test', password: 'Staff@12345' },
  customer: { email: 'customer@sedbank.test', password: 'Customer@12345' },
};

/** Unique-enough suffix so parallel-ish runs never clash on email/mobile. */
export const uniqueSuffix = () => String(Date.now()).slice(-7);

export const newCustomer = (label = 'qa') => {
  const suffix = uniqueSuffix();
  return {
    name: `QA ${label} ${suffix}`,
    email: `qa.${label}.${suffix}@sedbank.test`,
    // 9 + 7 digits + 2 = 10 digits, always starting with a valid prefix.
    mobile: `9${suffix}${String(Math.floor(Math.random() * 90) + 10)}`.slice(0, 10),
    password: 'Passw0rd!23',
  };
};

/** True when the viewport is narrow enough that the sidebar collapses to a drawer. */
export async function isMobileLayout(page) {
  const size = page.viewportSize();
  return !size || size.width < 1024;
}

/**
 * Navigates via the sidebar on desktop, or via the hamburger drawer on mobile.
 * This is the one place the desktop/mobile testid pair is resolved.
 */
export async function navigateTo(page, key) {
  if (await isMobileLayout(page)) {
    await page.getByTestId(TESTIDS.shell.mobileNavOpen).click();
    await expect(page.getByTestId(TESTIDS.shell.mobileNavDrawer)).toBeVisible();
    await page.getByTestId(navId(key, true)).click();
    await expect(page.getByTestId(TESTIDS.shell.mobileNavDrawer)).toBeHidden();
  } else {
    await page.getByTestId(navId(key, false)).click();
  }
  await page.waitForLoadState('networkidle');
}

/** Signs in with email + password and waits for the portal shell to render. */
export async function login(page, { email, password }) {
  await page.goto('/login');
  await page.getByTestId(TESTIDS.login.emailInput).fill(email);
  await page.getByTestId(TESTIDS.login.passwordInput).fill(password);
  await page.getByTestId(TESTIDS.login.submit).click();
  await expect(page.getByTestId(TESTIDS.shell.root)).toBeVisible({ timeout: 20_000 });
}

export async function logout(page) {
  await page.getByTestId(TESTIDS.shell.profileMenu).click();
  await page.getByTestId(TESTIDS.shell.logout).click();
  await expect(page.getByTestId(TESTIDS.login.root)).toBeVisible();
}

/** Registers a brand-new customer through the UI and lands on their dashboard. */
export async function registerCustomer(page, customer) {
  await page.goto('/register');
  await page.getByTestId(TESTIDS.register.nameInput).fill(customer.name);
  await page.getByTestId(TESTIDS.register.emailInput).fill(customer.email);
  await page.getByTestId(TESTIDS.register.mobileInput).fill(customer.mobile);
  await page.getByTestId(TESTIDS.register.passwordInput).fill(customer.password);
  await page.getByTestId(TESTIDS.register.submit).click();
  await expect(page.getByTestId(TESTIDS.customerDashboard.root)).toBeVisible({ timeout: 20_000 });
}

/** Fills and submits the three-section loan application form. */
export async function submitApplication(
  page,
  { amount = 400000, tenure = 24, purpose = 'home_renovation', income = 90000, existingEmi = 5000 } = {}
) {
  await page.goto('/app/apply');
  await expect(page.getByTestId(TESTIDS.apply.root)).toBeVisible();

  // Section 1 — loan details
  await page.getByTestId(TESTIDS.apply.amountInput).fill(String(amount));
  await page.getByTestId(TESTIDS.apply.tenureInput).fill(String(tenure));
  await page.getByTestId(TESTIDS.apply.purposeSelect).selectOption(purpose);
  await page.getByTestId(TESTIDS.apply.next).click();

  // Section 2 — employment
  await page.getByTestId(TESTIDS.apply.employmentTypeSelect).selectOption('salaried');
  await page.getByTestId(TESTIDS.apply.employerInput).fill('Sedin Technologies');
  await page.getByTestId(TESTIDS.apply.incomeInput).fill(String(income));
  await page.getByTestId(TESTIDS.apply.existingEmiInput).fill(String(existingEmi));
  await page.getByTestId(TESTIDS.apply.next).click();

  // Section 3 — personal
  await page.getByTestId(TESTIDS.apply.cityInput).fill('Chennai');
  await page.getByTestId(TESTIDS.apply.stateInput).fill('Tamil Nadu');
  await page.getByTestId(TESTIDS.apply.pincodeInput).fill('600001');
  await page.getByTestId(TESTIDS.apply.submit).click();

  // Lands on the application detail page.
  await expect(page.getByTestId(TESTIDS.applicationDetail.root)).toBeVisible({ timeout: 20_000 });
  const applicationNo = (await page.getByTestId(TESTIDS.applicationDetail.number).innerText()).trim();
  const applicationId = page.url().split('/applications/')[1];

  return { applicationNo, applicationId };
}

export async function completeKyc(page, { pan = 'ABCDE1234F', aadhaar = '123412341234' } = {}) {
  await expect(page.getByTestId(TESTIDS.applicationDetail.kycSection)).toBeVisible();
  await page.getByTestId(TESTIDS.applicationDetail.panInput).fill(pan);
  await page.getByTestId(TESTIDS.applicationDetail.aadhaarInput).fill(aadhaar);
  await page.getByTestId(TESTIDS.applicationDetail.kycSubmit).click();
  await expect(page.getByTestId(TESTIDS.applicationDetail.documentsSection)).toBeVisible({
    timeout: 20_000,
  });
}

/** Uploads one document using an in-memory buffer (no fixture files needed). */
export async function uploadDocument(page, type = 'income_proof', filename = 'payslip.pdf') {
  await page.getByTestId(TESTIDS.applicationDetail.documentTypeSelect).selectOption(type);
  await page.getByTestId(TESTIDS.applicationDetail.documentFileInput).setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% simulated ${type} for automated testing\n`),
  });
  await page.getByTestId(TESTIDS.applicationDetail.documentUpload).click();
  await expect(page.getByTestId(TESTIDS.applicationDetail.documentsTable)).toContainText(
    filename,
    { timeout: 20_000 }
  );
}

/**
 * Runs the credit check with a forced score band.
 * @param {'excellent'|'very_good'|'good'|'fair'|'poor'|'bad'|'random'} band
 */
export async function runCreditCheck(page, band = 'excellent') {
  await expect(page.getByTestId(TESTIDS.applicationDetail.bureauSection)).toBeVisible();
  await page.getByTestId(TESTIDS.applicationDetail.bureauSimulate).selectOption(band);
  await page.getByTestId(TESTIDS.applicationDetail.bureauRun).click();
  // The score panel renders on every branch (approved, review or rejected).
  await expect(page.getByTestId(TESTIDS.applicationDetail.bureauScore)).toBeVisible({
    timeout: 25_000,
  });
}

export async function acceptOfferAndSign(page) {
  await expect(page.getByTestId(TESTIDS.applicationDetail.offerSection)).toBeVisible();
  await page.getByTestId(TESTIDS.applicationDetail.offerAccept).click();

  await expect(page.getByTestId(TESTIDS.applicationDetail.esignSection)).toBeVisible({
    timeout: 20_000,
  });
  await page.getByTestId(TESTIDS.applicationDetail.esignConsent).check();
  await page.getByTestId(TESTIDS.applicationDetail.esignRequestOtp).click();

  // The mocked OTP is exposed on the hint element's data attribute.
  const hint = page.getByTestId(TESTIDS.applicationDetail.esignHint);
  await expect(hint).toBeVisible({ timeout: 20_000 });
  const code = await hint.getAttribute('data-otp');
  expect(code).toMatch(/^\d{6}$/);

  await page.getByTestId(TESTIDS.applicationDetail.esignOtpInput).fill(code);
  await page.getByTestId(TESTIDS.applicationDetail.esignSubmit).click();

  await expect(page.getByTestId(TESTIDS.applicationDetail.bankSection)).toBeVisible({
    timeout: 20_000,
  });
}

export async function addPayoutAccount(
  page,
  { holder = 'QA Borrower', account = '111122223333', ifsc = 'ICIC0001111' } = {}
) {
  await page.getByTestId(TESTIDS.applicationDetail.bankHolderInput).fill(holder);
  await page.getByTestId(TESTIDS.applicationDetail.bankAccountInput).fill(account);
  await page.getByTestId(TESTIDS.applicationDetail.bankIfscInput).fill(ifsc);
  await page.getByTestId(TESTIDS.applicationDetail.bankSubmit).click();
  await expect(page.getByTestId(TESTIDS.applicationDetail.awaitingDisbursement)).toBeVisible({
    timeout: 20_000,
  });
}

/** Ops: verifies every pending document on an application, then disburses. */
export async function verifyDocumentsAndDisburse(page, applicationId) {
  await page.goto(`/admin/applications/${applicationId}`);
  await expect(page.getByTestId(TESTIDS.adminReview.root)).toBeVisible();

  // Verify buttons only render for documents that are not yet verified.
  const verifyButtons = page.getByTestId(TESTIDS.adminReview.documentVerify);
  let remaining = await verifyButtons.count();
  while (remaining > 0) {
    await verifyButtons.first().click();
    await expect(verifyButtons).toHaveCount(remaining - 1, { timeout: 20_000 });
    remaining -= 1;
  }

  await page.getByTestId(TESTIDS.adminReview.disburse).click();
  await expect(page.getByTestId(TESTIDS.adminReview.disburseModal)).toBeVisible();

  const confirm = page.getByTestId(TESTIDS.adminReview.disburseConfirm);
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();

  // Disbursement redirects to the new loan account.
  await expect(page.getByTestId(TESTIDS.adminLoanDetail.root)).toBeVisible({ timeout: 25_000 });
  const loanNo = (await page.getByTestId(TESTIDS.adminLoanDetail.number).innerText()).trim();
  const loanId = page.url().split('/loans/')[1];

  return { loanNo, loanId };
}

/** Officer decision from the review screen. */
export async function decideApplication(page, applicationId, decision, remarks) {
  await page.goto(`/admin/applications/${applicationId}`);
  await expect(page.getByTestId(TESTIDS.adminReview.root)).toBeVisible();

  const buttons = {
    approved: TESTIDS.adminReview.approve,
    rejected: TESTIDS.adminReview.reject,
    sent_back: TESTIDS.adminReview.sendBack,
  };

  await page.getByTestId(buttons[decision]).click();
  await expect(page.getByTestId(TESTIDS.adminReview.decisionModal)).toBeVisible();
  await page.getByTestId(TESTIDS.adminReview.remarksInput).fill(remarks);
  await page.getByTestId(TESTIDS.adminReview.decisionConfirm).click();
  await expect(page.getByTestId(TESTIDS.adminReview.decisionModal)).toBeHidden({ timeout: 20_000 });
}

/**
 * Calls a test-hook endpoint directly with the admin token.
 * Used to age a loan so the delinquency path can be tested in seconds.
 */
export async function backdateLoan(request, apiUrl, loanId, days) {
  const auth = await request.post(`${apiUrl}/api/auth/login`, { data: DEMO.admin });
  expect(auth.ok()).toBeTruthy();
  const { data } = await auth.json();

  const response = await request.post(`${apiUrl}/api/testing/backdate-loan`, {
    headers: { Authorization: `Bearer ${data.token}` },
    data: { loanId, days },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}

/**
 * Waits for a toast whose text matches `pattern`.
 *
 * Toasts stack, and every one of them carries the same testid, so a bare
 * `getByTestId(toast)` is a strict-mode violation whenever a second toast is
 * still on screen — the sign-in greeting easily outlives a quick save. The
 * assertion is therefore scoped to the toast actually under test.
 */
export async function expectToast(page, pattern, timeout = 20_000) {
  await expect(
    page.getByTestId(TESTIDS.common.toast).filter({ hasText: pattern }).first()
  ).toBeVisible({ timeout });
}

/** Reads a numeric value out of a KPI tile, stripping currency formatting. */
export async function readStat(page, testId) {
  const text = await page.getByTestId(testId).innerText();
  const match = text.replace(/[₹,\s]/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}
