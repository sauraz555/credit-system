import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const baseUrl = process.env.BASE_URL || 'https://frontend-alpha-neon-82.vercel.app';
const outputDir = path.resolve(
  'C:/Users/Saurav(Interlace)/.gemini/antigravity-ide/brain/40d8ee16-69ad-47b7-822b-19e2b47ddd8b/screenshots/nepal'
);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const routes = [
  { name: 'home', path: '/' },
  { name: 'consumer_ram', path: '/subject/CIT-27-01-78-04821' },
  { name: 'commercial_apex', path: '/subject' },
  { name: 'provider_ingest', path: '/provider' },
  { name: 'analyst_workspace', path: '/analyst' },
  { name: 'admin_governance', path: '/admin' },
  { name: 'login', path: '/login' },
  { name: 'forbidden_403', path: '/403' },
];

const roles = [
  {
    role: 'LOGGED_OUT',
    token: null,
    email: null,
    entityId: null,
    allowedRoutes: ['home', 'login', 'forbidden_403'],
  },
  {
    role: 'SUBJECT',
    token: 'token-subject-ram-2026',
    email: 'subject@example.com',
    entityId: 'CIT-27-01-78-04821',
    allowedRoutes: ['home', 'consumer_ram', 'commercial_apex', 'login'],
  },
  {
    role: 'PROVIDER',
    token: 'token-provider-nabil-2026',
    email: 'provider@example.com',
    tenantId: 'PRV-NABIL-001',
    allowedRoutes: ['home', 'provider_ingest', 'consumer_ram', 'commercial_apex'],
  },
  {
    role: 'ANALYST',
    token: 'token-analyst-bureau-2026',
    email: 'analyst@example.com',
    allowedRoutes: ['home', 'analyst_workspace', 'consumer_ram', 'commercial_apex'],
  },
  {
    role: 'ADMIN',
    token: 'token-admin-super-2026',
    email: 'admin@example.com',
    allowedRoutes: ['home', 'admin_governance', 'analyst_workspace', 'provider_ingest', 'consumer_ram', 'commercial_apex'],
  },
];

async function capture() {
  console.log(`Starting Nepal Localisation Playwright capture against ${baseUrl}...`);
  const browser = await chromium.launch({ headless: true });

  for (const locale of ['ne', 'en']) {
    console.log(`\n========================================`);
    console.log(`CAPTURING LOCALE: [${locale.toUpperCase()}]`);
    console.log(`========================================`);

    for (const rConfig of roles) {
      console.log(`\n--- Role: ${rConfig.role} (${locale}) ---`);
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });

      const cookies = [
        {
          name: 'NEXT_LOCALE',
          value: locale,
          domain: new URL(baseUrl).hostname,
          path: '/',
        },
      ];

      if (rConfig.token) {
        cookies.push(
          {
            name: 'auth_token',
            value: rConfig.token,
            domain: new URL(baseUrl).hostname,
            path: '/',
          },
          {
            name: 'auth_role',
            value: rConfig.role,
            domain: new URL(baseUrl).hostname,
            path: '/',
          }
        );
      }

      await context.addCookies(cookies);
      const page = await context.newPage();

      // Pre-seed localStorage if logged in
      if (rConfig.token) {
        await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(({ token, role, email, entityId, locale }) => {
          localStorage.setItem('access_token', token);
          localStorage.setItem('user_role', role);
          localStorage.setItem('user_email', email || '');
          localStorage.setItem('user_entity_id', entityId || '');
          localStorage.setItem('app_locale', locale);
        }, { ...rConfig, locale });
      }

      // Capture routes
      for (const route of routes) {
        if (!rConfig.allowedRoutes.includes(route.name) && rConfig.role !== 'ADMIN') {
          continue;
        }

        const url = `${baseUrl}${route.path}`;
        const filename = `${locale}_${rConfig.role.toLowerCase()}_${route.name}.png`;
        const filePath = path.join(outputDir, filename);

        console.log(`Capturing ${filename} from ${url}...`);
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 35000 });
          
          // Switch language button if not already active
          const targetBtnText = locale === 'ne' ? 'नेपाली' : 'EN';
          try {
            const langBtn = page.locator('button', { hasText: targetBtnText }).first();
            if (await langBtn.isVisible()) {
              const className = await langBtn.getAttribute('class');
              if (!className || !className.includes('bg-[#0f62fe]')) {
                await langBtn.click();
                await page.waitForTimeout(600);
              }
            }
          } catch {}

          await page.waitForTimeout(1000);
          await page.screenshot({ path: filePath, fullPage: false });
          console.log(`  Saved: ${filename}`);
        } catch (err) {
          console.error(`  Error capturing ${filename}:`, err.message);
        }
      }

      await context.close();
    }
  }

  await browser.close();
  console.log(`\nPlaywright capture completed successfully. Output saved to: ${outputDir}`);
}

capture().catch((err) => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
