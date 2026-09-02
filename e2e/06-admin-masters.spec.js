/**
 * Admin toolkit: user management, bank management and product/credit-policy
 * configuration — plus the acceptance criterion that a newly-added record shows
 * up in its table immediately.
 */
import { test, expect } from '@playwright/test';
import { TESTIDS, DEMO, uniqueSuffix, login, navigateTo, expectToast } from './helpers.js';

test.describe('Admin configuration', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO.admin);
  });

  test('an admin can add a user and it appears in the table immediately', async ({ page }) => {
    await navigateTo(page, 'users');
    await expect(page.getByTestId(TESTIDS.adminUsers.root)).toBeVisible();

    const suffix = uniqueSuffix();
    const email = `qa.officer.${suffix}@sedbank.test`;
    const name = `QA Officer ${suffix}`;

    await page.getByTestId(TESTIDS.adminUsers.addUser).click();
    await expect(page.getByTestId(TESTIDS.adminUsers.modal)).toBeVisible();

    await page.getByTestId(TESTIDS.adminUsers.nameInput).fill(name);
    await page.getByTestId(TESTIDS.adminUsers.emailInput).fill(email);
    await page.getByTestId(TESTIDS.adminUsers.mobileInput).fill(`8${suffix}12`.slice(0, 10));
    await page.getByTestId(TESTIDS.adminUsers.roleSelect).selectOption('ops_officer');
    await page.getByTestId(TESTIDS.adminUsers.submit).click();

    // A generated temporary password is shown exactly once.
    await expect(page.getByTestId(TESTIDS.adminUsers.tempPassword)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByTestId(TESTIDS.adminUsers.table)).toContainText(name);
    await expect(page.getByTestId(TESTIDS.adminUsers.table)).toContainText(email);
  });

  test('validation blocks a duplicate email and an invalid mobile', async ({ page }) => {
    await navigateTo(page, 'users');

    await page.getByTestId(TESTIDS.adminUsers.addUser).click();
    await expect(page.getByTestId(TESTIDS.adminUsers.modal)).toBeVisible();

    // Invalid mobile is caught client-side, before any request is made.
    await page.getByTestId(TESTIDS.adminUsers.nameInput).fill('Bad Mobile');
    await page.getByTestId(TESTIDS.adminUsers.emailInput).fill(`dup.${uniqueSuffix()}@sedbank.test`);
    await page.getByTestId(TESTIDS.adminUsers.mobileInput).fill('12345');
    await page.getByTestId(TESTIDS.adminUsers.submit).click();
    await expect(page.getByTestId('field-error-mobile')).toBeVisible();

    // A duplicate email is caught server-side and surfaced on the form.
    await page.getByTestId(TESTIDS.adminUsers.mobileInput).fill(`7${uniqueSuffix()}12`.slice(0, 10));
    await page.getByTestId(TESTIDS.adminUsers.emailInput).fill(DEMO.customer.email);
    await page.getByTestId(TESTIDS.adminUsers.submit).click();
    await expect(page.getByTestId(TESTIDS.common.formError)).toContainText(/already exists/i, {
      timeout: 20_000,
    });
  });

  test('an admin can add a bank and it appears in the table immediately', async ({ page }) => {
    await navigateTo(page, 'banks');
    await expect(page.getByTestId(TESTIDS.adminBanks.root)).toBeVisible();

    const code = `QA${uniqueSuffix()}`;
    const name = `QA Partner Bank ${code}`;

    await page.getByTestId(TESTIDS.adminBanks.addBank).click();
    await expect(page.getByTestId(TESTIDS.adminBanks.modal)).toBeVisible();

    await page.getByTestId(TESTIDS.adminBanks.nameInput).fill(name);
    await page.getByTestId(TESTIDS.adminBanks.codeInput).fill(code);
    await page.getByTestId(TESTIDS.adminBanks.typeSelect).selectOption('partner');
    await page.getByTestId(TESTIDS.adminBanks.accountNumberInput).fill('987654321098');
    await page.getByTestId(TESTIDS.adminBanks.ifscInput).fill('ICIC0004321');
    await page.getByTestId(TESTIDS.adminBanks.branchInput).fill('Chennai — T Nagar');
    await page.getByTestId(TESTIDS.adminBanks.submit).click();

    await expect(page.getByTestId(TESTIDS.adminBanks.modal)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId(TESTIDS.adminBanks.table)).toContainText(name);

    // Account numbers are masked in every response, never shown in full.
    await expect(page.getByTestId(TESTIDS.adminBanks.table)).toContainText('XXXX1098');
    await expect(page.getByTestId(TESTIDS.adminBanks.table)).not.toContainText('987654321098');
  });

  test('an invalid IFSC is rejected on the bank form', async ({ page }) => {
    await navigateTo(page, 'banks');

    await page.getByTestId(TESTIDS.adminBanks.addBank).click();
    await page.getByTestId(TESTIDS.adminBanks.nameInput).fill('Bad IFSC Bank');
    await page.getByTestId(TESTIDS.adminBanks.codeInput).fill(`BAD${uniqueSuffix()}`);
    await page.getByTestId(TESTIDS.adminBanks.ifscInput).fill('NOTANIFSC');
    await page.getByTestId(TESTIDS.adminBanks.submit).click();

    await expect(page.getByTestId('field-error-ifsc')).toBeVisible();
  });

  test('underwriting thresholds are editable and validated', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page.getByTestId(TESTIDS.adminSettings.root)).toBeVisible();

    await page.getByTestId(TESTIDS.adminSettings.tabUnderwriting).click();

    // An inverted pair of thresholds must be refused.
    await page.getByTestId(TESTIDS.adminSettings.minScoreInput).fill('800');
    await page.getByTestId(TESTIDS.adminSettings.autoApproveScoreInput).fill('700');
    await page.getByTestId(TESTIDS.adminSettings.saveUnderwriting).click();
    await expect(page.getByTestId('field-error-minScore')).toBeVisible();

    // A valid change saves and persists.
    await page.getByTestId(TESTIDS.adminSettings.minScoreInput).fill('610');
    await page.getByTestId(TESTIDS.adminSettings.autoApproveScoreInput).fill('760');
    await page.getByTestId(TESTIDS.adminSettings.saveUnderwriting).click();
    await expectToast(page, /saved/i);

    await page.reload();
    await page.getByTestId(TESTIDS.adminSettings.tabUnderwriting).click();
    await expect(page.getByTestId(TESTIDS.adminSettings.minScoreInput)).toHaveValue('610');
    await expect(page.getByTestId(TESTIDS.adminSettings.autoApproveScoreInput)).toHaveValue('760');

    // Restore the defaults so later specs are unaffected.
    await page.getByTestId(TESTIDS.adminSettings.minScoreInput).fill('600');
    await page.getByTestId(TESTIDS.adminSettings.autoApproveScoreInput).fill('750');
    await page.getByTestId(TESTIDS.adminSettings.saveUnderwriting).click();
    await expectToast(page, /saved/i);
  });

  test('product limits are validated against each other', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.getByTestId(TESTIDS.adminSettings.tabProduct).click();

    await page.getByTestId(TESTIDS.adminSettings.minAmountInput).fill('900000');
    await page.getByTestId(TESTIDS.adminSettings.maxAmountInput).fill('100000');
    await page.getByTestId(TESTIDS.adminSettings.saveProduct).click();
    await expect(page.getByTestId('field-error-minAmount')).toBeVisible();

    // Put the defaults back.
    await page.getByTestId(TESTIDS.adminSettings.minAmountInput).fill('50000');
    await page.getByTestId(TESTIDS.adminSettings.maxAmountInput).fill('2000000');
    await page.getByTestId(TESTIDS.adminSettings.saveProduct).click();
    await expectToast(page, /saved/i);
  });

  test('the audit trail records administrative actions', async ({ page }) => {
    await navigateTo(page, 'audit');
    await expect(page.getByTestId(TESTIDS.adminAudit.root)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.adminAudit.table)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TESTIDS.adminAudit.table)).toContainText('config.updated');
  });
});
