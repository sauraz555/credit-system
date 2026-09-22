/**
 * Playwright Test Automation Configuration.
 *
 * Configures timeouts, single-worker execution order, test reporters, and Chromium
 * device parameters for the CRMS frontend end-to-end and accessibility test suites.
 *
 * Architecture:
 *   Frontend Test Infrastructure (Playwright Test Runner).
 *   Used by `npm run test:e2e` and `npm run test:a11y`.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
