import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const mode = process.argv[2] || 'before';
const baseUrl = process.env.BASE_URL || 'https://frontend-alpha-neon-82.vercel.app';
const outputDir = path.resolve(
  'C:/Users/Saurav(Interlace)/.gemini/antigravity-ide/brain/40d8ee16-69ad-47b7-822b-19e2b47ddd8b/screenshots',
  mode
);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const routes = [
  { name: 'home', path: '/' },
  { name: 'consumer', path: '/subject/IND-8842-1994' },
  { name: 'commercial', path: '/subject' },
  { name: 'ingestion', path: '/provider' },
  { name: 'analyst', path: '/analyst' },
  { name: 'governance', path: '/admin' },
  { name: 'login', path: '/login' },
];

async function run() {
  console.log(`Starting capture [${mode}] for ${baseUrl}...`);
  const browser = await chromium.launch({ headless: true });

  // 1. Logged out captures
  const contextLoggedOut = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pageLoggedOut = await contextLoggedOut.newPage();

  for (const r of routes) {
    const url = `${baseUrl}${r.path}`;
    console.log(`[Logged Out] Capturing ${r.name} from ${url}...`);
    try {
      await pageLoggedOut.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await pageLoggedOut.waitForTimeout(1000);
      const filePath = path.join(outputDir, `${r.name}_logged_out.png`);
      await pageLoggedOut.screenshot({ path: filePath, fullPage: false });
      console.log(`  Saved: ${filePath}`);
    } catch (err) {
      console.error(`  Error capturing ${r.name}:`, err.message);
    }
  }
  await contextLoggedOut.close();

  // 2. Logged in captures (as ADMIN role)
  const contextLoggedIn = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // Set auth cookies and localStorage for ADMIN session
  await contextLoggedIn.addCookies([
    {
      name: 'auth_token',
      value: 'mock-admin-token-2026',
      domain: new URL(baseUrl).hostname,
      path: '/',
    },
    {
      name: 'auth_role',
      value: 'ADMIN',
      domain: new URL(baseUrl).hostname,
      path: '/',
    },
  ]);

  const pageLoggedIn = await contextLoggedIn.newPage();

  // Pre-seed localStorage
  await pageLoggedIn.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await pageLoggedIn.evaluate(() => {
    localStorage.setItem('access_token', 'mock-admin-token-2026');
    localStorage.setItem('user_role', 'ADMIN');
    localStorage.setItem('user_email', 'admin@example.com');
  });

  for (const r of routes) {
    if (r.name === 'login') continue; // Only content routes for logged in
    const url = `${baseUrl}${r.path}`;
    console.log(`[Logged In] Capturing ${r.name} from ${url}...`);
    try {
      await pageLoggedIn.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await pageLoggedIn.waitForTimeout(1000);
      const filePath = path.join(outputDir, `${r.name}_logged_in.png`);
      await pageLoggedIn.screenshot({ path: filePath, fullPage: false });
      console.log(`  Saved: ${filePath}`);
    } catch (err) {
      console.error(`  Error capturing ${r.name}:`, err.message);
    }
  }

  await contextLoggedIn.close();
  await browser.close();
  console.log(`Finished capture [${mode}].`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
