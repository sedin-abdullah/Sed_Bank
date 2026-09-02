/**
 * Playwright configuration.
 *
 * Runs the same suite across three of Playwright's built-in device presets —
 * desktop Chrome, iPad Mini and iPhone 13 — using free, built-in emulation. No
 * external device lab is involved.
 *
 * Both servers are started automatically. The API is booted with test hooks
 * enabled (loan back-dating, bureau simulation) so the delinquency and
 * rejection paths are deterministic.
 */
import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.E2E_API_PORT || '5100';
const WEB_PORT = process.env.E2E_WEB_PORT || '4180';

export const API_URL = process.env.E2E_API_URL || `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = process.env.E2E_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;

/** Set E2E_NO_SERVER=1 to test an already-running stack (e.g. a deployment). */
const manageServers = process.env.E2E_NO_SERVER !== '1';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false, // the suite shares one database
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['github']]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Playwright's default is 'data-testid', declared explicitly for clarity.
    testIdAttribute: 'data-testid',
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Tablet: the sidebar is still hidden below `lg`, so the drawer is used.
      name: 'ipad-mini',
      use: { ...devices['iPad Mini'] },
    },
    {
      name: 'iphone-13',
      use: { ...devices['iPhone 13'] },
    },
  ],

  webServer: manageServers
    ? [
        {
          command: 'npm --prefix backend run start',
          url: `${API_URL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            NODE_ENV: 'test',
            PORT: API_PORT,
            // Ephemeral in-memory database: every run starts from a clean slate
            // with only the demo login accounts seeded.
            USE_MEMORY_DB: 'true',
            MONGO_URI: '',
            JWT_SECRET: 'e2e-test-secret-not-for-production',
            ENABLE_TEST_HOOKS: 'true',
            EXPOSE_OTP: 'true',
            CORS_ORIGINS: `${WEB_URL},http://localhost:${WEB_PORT}`,
            DELINQUENCY_SWEEP_MINUTES: '0',
            LOG_LEVEL: 'info',
          },
        },
        {
          command: `npm --prefix frontend run build && npm --prefix frontend run preview -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
          url: WEB_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            VITE_API_URL: API_URL,
            VITE_SOCKET_URL: API_URL,
            VITE_SHOW_DEMO_LOGINS: 'true',
          },
        },
      ]
    : undefined,
});
