/**
 * Automated WCAG 2.1 AA Accessibility Test Suite (Axe-Core & Playwright).
 *
 * Exercises automated accessibility scanning across all portal routes and RBAC personas:
 * - Public routes: `/login`, `/403`
 * - Admin routes: `/`, `/admin`
 * - Analyst routes: `/analyst`
 * - Provider routes: `/provider`
 * - Subject consumer routes: `/subject/IND-8842-1994`, `/subject`
 *
 * Architecture:
 *   Frontend Test Suite (End-to-End Accessibility Automation).
 *   Executes AxeBuilder with tags: 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'.
 *   Asserts 0 violations on all scanned views.
 *
 * Legal / Regulatory:
 *   Disability Discrimination Act 1992 (Cth) and Australian Government Digital Service Standard,
 *   requiring Level AA compliance with W3C Web Content Accessibility Guidelines (WCAG 2.1).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generateTOTP, getTestAccounts } from './totp';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Helper function authenticating a Playwright browser context into a designated RBAC persona.
 *
 * Handles standard password entry and conditional RFC 6238 TOTP two-factor completion.
 *
 * @param page - Playwright Page instance.
 * @param roleKey - Target RBAC persona ('ADMIN', 'ANALYST', 'PROVIDER', 'SUBJECT').
 */
async function loginAs(page: any, roleKey: 'ADMIN' | 'ANALYST' | 'PROVIDER' | 'SUBJECT') {
  const accounts = getTestAccounts();
  const user = accounts[roleKey];
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"], input[id*="email"], #email');

  await page.fill('input[type="email"], input[id*="email"], #email', user.email);
  await page.fill('input[type="password"], input[id*="password"], #password', user.password);
  await page.click('button[type="submit"]');

  if (user.totpSecret) {
    // Wait for TOTP input
    await page.waitForSelector('#mfa-code, input[name="totp"], input[id*="totp"], input[placeholder*="6-digit"], input[maxlength="6"]', { timeout: 8000 });
    const code = generateTOTP(user.totpSecret);
    await page.fill('#mfa-code, input[name="totp"], input[id*="totp"], input[placeholder*="6-digit"], input[maxlength="6"]', code);
    await page.click('button[type="submit"]');
  }

  // Wait for navigation past login
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Accessibility (Axe-Core) Audits Across All Roles and Routes', () => {

  test('Route: /login (Public Unauthenticated)', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /login:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: /403 (Forbidden State)', async ({ page }) => {
    await page.goto(`${BASE_URL}/403`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /403:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: / (Bureau Landing Page as Admin)', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: /admin (Supervisory & Risk Analyst Console as Admin)', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /admin:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: /analyst (Risk Governance & Simulations as Analyst)', async ({ page }) => {
    await loginAs(page, 'ANALYST');
    await page.goto(`${BASE_URL}/analyst`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /analyst:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: /provider (Credit Provider Ingestion Portal as Provider)', async ({ page }) => {
    await loginAs(page, 'PROVIDER');
    await page.goto(`${BASE_URL}/provider`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /provider:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: /subject (Company Report with Director Network as Admin)', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto(`${BASE_URL}/subject`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /subject:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Route: /subject/IND-8842-1994 (Full Consumer File with Defaults, Hardship, Disputes as Subject)', async ({ page }) => {
    await loginAs(page, 'SUBJECT');
    await page.goto(`${BASE_URL}/subject/IND-8842-1994`);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Axe Violations on /subject/IND-8842-1994:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    expect(accessibilityScanResults.violations).toEqual([]);
  });

});
