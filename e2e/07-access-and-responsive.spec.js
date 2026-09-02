/**
 * Security guards, empty states, form validation and responsive layout.
 *
 * The responsive checks confirm the Section 9.2 rule: the same logical element
 * keeps the same testid at every breakpoint, and the only paired ids are the
 * desktop sidebar vs. the mobile drawer.
 */
import { test, expect } from '@playwright/test';
import { API_URL } from '../playwright.config.js';
import {
  TESTIDS,
  DEMO,
  navId,
  newCustomer,
  login,
  logout,
  registerCustomer,
  isMobileLayout,
  navigateTo,
} from './helpers.js';

test.describe('Access control', () => {
  test('unauthenticated visitors are sent to sign in', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId(TESTIDS.login.root)).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByTestId(TESTIDS.login.root)).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.getByTestId(TESTIDS.login.root)).toBeVisible();
  });

  test('a customer cannot reach the operations portal', async ({ page }) => {
    const customer = newCustomer('guard');
    await registerCustomer(page, customer);

    await page.goto('/admin');
    await expect(page.getByTestId(TESTIDS.customerDashboard.root)).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.getByTestId(TESTIDS.customerDashboard.root)).toBeVisible();
  });

  test('staff landing on the customer portal are redirected to their own', async ({ page }) => {
    await login(page, DEMO.credit);
    await page.goto('/app');
    await expect(page.getByTestId(TESTIDS.adminDashboard.root)).toBeVisible();
  });

  test('a sub-role only sees the menu items it owns', async ({ page }) => {
    await login(page, DEMO.collections);

    const mobile = await isMobileLayout(page);
    if (mobile) {
      await page.getByTestId(TESTIDS.shell.mobileNavOpen).click();
      await expect(page.getByTestId(TESTIDS.shell.mobileNavDrawer)).toBeVisible();
    }

    // Collections sees collections and loans…
    await expect(page.getByTestId(navId('collections', mobile))).toBeVisible();
    await expect(page.getByTestId(navId('loans', mobile))).toBeVisible();

    // …but never the admin-only master data.
    await expect(page.getByTestId(navId('users', mobile))).toHaveCount(0);
    await expect(page.getByTestId(navId('banks', mobile))).toHaveCount(0);
    await expect(page.getByTestId(navId('settings', mobile))).toHaveCount(0);
  });

  test('the API refuses a customer token on staff endpoints', async ({ request }) => {
    const customer = newCustomer('apiguard');

    const registered = await request.post(`${API_URL}/api/auth/register`, { data: customer });
    expect(registered.ok()).toBeTruthy();
    const { data } = await registered.json();
    const headers = { Authorization: `Bearer ${data.token}` };

    // Server-side enforcement — the client guards are only an affordance.
    for (const path of [
      '/api/underwriting/queue',
      '/api/users',
      '/api/banks',
      '/api/config',
      '/api/collections/overview',
      '/api/audit',
      '/api/dashboard/admin',
    ]) {
      const response = await request.get(`${API_URL}${path}`, { headers });
      expect(response.status(), `${path} must be forbidden for a customer`).toBe(403);
    }

    // And with no token at all.
    const anonymous = await request.get(`${API_URL}/api/dashboard/admin`);
    expect(anonymous.status()).toBe(401);
  });
});

test.describe('Empty states', () => {
  test('a new customer sees friendly empty states, not blank screens', async ({ page }) => {
    const customer = newCustomer('empty');
    await registerCustomer(page, customer);

    await expect(page.getByTestId(TESTIDS.customerDashboard.empty)).toBeVisible();

    await navigateTo(page, 'applications');
    await expect(page.getByTestId(TESTIDS.customerApplications.empty)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.customerApplications.empty)).toContainText(
      /no applications yet/i
    );

    await navigateTo(page, 'loans');
    await expect(page.getByTestId(TESTIDS.customerLoans.empty)).toBeVisible();

    await navigateTo(page, 'payments');
    await expect(page.getByTestId(TESTIDS.customerPayments.empty)).toBeVisible();
  });
});

test.describe('Form validation', () => {
  test('sign-up rejects a weak password and an invalid mobile', async ({ page }) => {
    await page.goto('/register');

    await page.getByTestId(TESTIDS.register.nameInput).fill('A');
    await page.getByTestId(TESTIDS.register.emailInput).fill('not-an-email');
    await page.getByTestId(TESTIDS.register.mobileInput).fill('123');
    await page.getByTestId(TESTIDS.register.passwordInput).fill('weak');
    await page.getByTestId(TESTIDS.register.submit).click();

    await expect(page.getByTestId('field-error-name')).toBeVisible();
    await expect(page.getByTestId('field-error-email')).toBeVisible();
    await expect(page.getByTestId('field-error-mobile')).toBeVisible();
    await expect(page.getByTestId('field-error-password')).toBeVisible();

    // Still on the sign-up screen — nothing was submitted.
    await expect(page.getByTestId(TESTIDS.register.root)).toBeVisible();
  });

  test('sign-in shows one message for a wrong email or password', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId(TESTIDS.login.emailInput).fill('nobody@sedbank.test');
    await page.getByTestId(TESTIDS.login.passwordInput).fill('Wrong@12345');
    await page.getByTestId(TESTIDS.login.submit).click();

    // Identical wording either way, so accounts cannot be enumerated.
    await expect(page.getByTestId(TESTIDS.login.error)).toContainText(/incorrect email or password/i, {
      timeout: 20_000,
    });
  });

  test('the application form rejects an amount outside the product limits', async ({ page }) => {
    const customer = newCustomer('validate');
    await registerCustomer(page, customer);

    await page.goto('/app/apply');
    await page.getByTestId(TESTIDS.apply.amountInput).fill('1000');
    await page.getByTestId(TESTIDS.apply.tenureInput).fill('24');
    await page.getByTestId(TESTIDS.apply.purposeSelect).selectOption('travel');
    await page.getByTestId(TESTIDS.apply.next).click();

    await expect(page.getByTestId('field-error-amountRequested')).toBeVisible();
  });

  test('KYC rejects a malformed PAN', async ({ page }) => {
    const customer = newCustomer('kycfail');
    await registerCustomer(page, customer);

    await page.goto('/app/apply');
    await page.getByTestId(TESTIDS.apply.amountInput).fill('200000');
    await page.getByTestId(TESTIDS.apply.tenureInput).fill('24');
    await page.getByTestId(TESTIDS.apply.purposeSelect).selectOption('medical');
    await page.getByTestId(TESTIDS.apply.next).click();
    await page.getByTestId(TESTIDS.apply.incomeInput).fill('60000');
    await page.getByTestId(TESTIDS.apply.next).click();
    await page.getByTestId(TESTIDS.apply.submit).click();

    await expect(page.getByTestId(TESTIDS.applicationDetail.kycSection)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId(TESTIDS.applicationDetail.panInput).fill('BADPAN');
    await page.getByTestId(TESTIDS.applicationDetail.aadhaarInput).fill('123412341234');
    await page.getByTestId(TESTIDS.applicationDetail.kycSubmit).click();

    await expect(page.getByTestId('field-error-pan')).toBeVisible();
  });
});

test.describe('Responsive layout and testid stability', () => {
  test('navigation uses the sidebar on desktop and the drawer on mobile', async ({ page }) => {
    await login(page, DEMO.admin);
    const mobile = await isMobileLayout(page);

    if (mobile) {
      // The desktop sidebar is present in the DOM but hidden below `lg`.
      await expect(page.getByTestId(TESTIDS.shell.sidebar)).toBeHidden();
      await expect(page.getByTestId(TESTIDS.shell.mobileNavOpen)).toBeVisible();

      await page.getByTestId(TESTIDS.shell.mobileNavOpen).click();
      const drawer = page.getByTestId(TESTIDS.shell.mobileNavDrawer);
      await expect(drawer).toBeVisible();

      // Drawer items use the `mobile-nav-*` half of the documented pair.
      await expect(page.getByTestId(navId('dashboard', true))).toBeVisible();
      await page.getByTestId(TESTIDS.shell.mobileNavClose).click();
      await expect(drawer).toBeHidden();
    } else {
      await expect(page.getByTestId(TESTIDS.shell.sidebar)).toBeVisible();
      await expect(page.getByTestId(TESTIDS.shell.mobileNavOpen)).toBeHidden();
      await expect(page.getByTestId(navId('dashboard', false))).toBeVisible();
    }
  });

  test('the same testids resolve on every screen at this breakpoint', async ({ page }) => {
    await login(page, DEMO.admin);

    // Shared shell elements — identical ids regardless of viewport.
    for (const id of [
      TESTIDS.shell.root,
      TESTIDS.shell.topbar,
      TESTIDS.shell.notificationBell,
      TESTIDS.shell.profileMenu,
      TESTIDS.shell.pageTitle,
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // Dashboard KPI tiles keep their ids at every size.
    await expect(page.getByTestId(TESTIDS.adminDashboard.root)).toBeVisible();
    for (const id of [
      TESTIDS.adminDashboard.kpiApplications,
      TESTIDS.adminDashboard.kpiPending,
      TESTIDS.adminDashboard.kpiDisbursed,
      TESTIDS.adminDashboard.kpiUsers,
      TESTIDS.adminDashboard.kpiBanks,
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // Admin master screens resolve their roots and primary actions.
    await navigateTo(page, 'users');
    await expect(page.getByTestId(TESTIDS.adminUsers.root)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.adminUsers.addUser)).toBeVisible();

    await navigateTo(page, 'banks');
    await expect(page.getByTestId(TESTIDS.adminBanks.root)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.adminBanks.addBank)).toBeVisible();

    await navigateTo(page, 'settings');
    await expect(page.getByTestId(TESTIDS.adminSettings.root)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.adminSettings.saveProduct)).toBeVisible();
  });

  test('no screen scrolls the page body horizontally', async ({ page }) => {
    await login(page, DEMO.admin);

    for (const path of ['/admin', '/admin/users', '/admin/banks', '/admin/settings', '/admin/loans']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      // Wide tables scroll inside their own container, never the page.
      expect(overflow, `${path} must not overflow horizontally`).toBeLessThanOrEqual(1);
    }
  });

  test('a signed-out session cannot reuse the app shell', async ({ page }) => {
    await login(page, DEMO.admin);
    await logout(page);

    await page.goto('/admin');
    await expect(page.getByTestId(TESTIDS.login.root)).toBeVisible();
  });
});
