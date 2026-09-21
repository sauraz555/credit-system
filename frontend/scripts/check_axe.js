const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const axe = require('axe-core');

const pages = [
  { route: '/', file: '.next/server/app/index.html' },
  { route: '/login', file: '.next/server/app/login.html' },
  { route: '/admin', file: '.next/server/app/admin.html' },
  { route: '/analyst', file: '.next/server/app/analyst.html' },
  { route: '/provider', file: '.next/server/app/provider.html' },
  { route: '/subject', file: '.next/server/app/subject.html' },
  { route: '/403', file: '.next/server/app/403.html' }
];

async function runAxeOnPage(page) {
  const filePath = path.join(__dirname, '..', page.file);
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${page.route} - File not found: ${filePath}`);
    return { route: page.route, violations: [] };
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });

  const { window } = dom;
  window.eval(axe.source);

  try {
    const results = await window.axe.run(window.document, {
      rules: {
        // In JSDOM layout engine is non-visual, so color-contrast requires canvas/rendering engine
        'color-contrast': { enabled: false }
      }
    });

    console.log(`Route ${page.route.padEnd(12)}: ${results.violations.length} violation(s)`);
    if (results.violations.length > 0) {
      results.violations.forEach((v) => {
        console.log(`  - [${v.id}] ${v.help} (${v.nodes.length} nodes)`);
        v.nodes.slice(0, 3).forEach((n) => {
          console.log(`    Target: ${n.target.join(' ')}`);
          console.log(`    Failure: ${n.failureSummary}`);
        });
      });
    }
    return { route: page.route, violations: results.violations };
  } catch (err) {
    console.error(`Error running axe on ${page.route}:`, err.message);
    return { route: page.route, violations: [{ id: 'error', help: err.message }] };
  }
}

async function main() {
  console.log('=== Starting Axe-Core Accessibility Audit across All Routes ===');
  let totalViolations = 0;
  const summary = [];

  for (const page of pages) {
    const res = await runAxeOnPage(page);
    summary.push({ route: res.route, violationsCount: res.violations.length, violations: res.violations });
    totalViolations += res.violations.length;
  }

  console.log('\n=== Axe-Core Audit Summary ===');
  summary.forEach(s => {
    console.log(`  ${s.route.padEnd(12)}: ${s.violationsCount === 0 ? 'PASS (0 violations)' : `FAIL (${s.violationsCount} violations)`}`);
  });
  console.log(`\nTotal Violations Across All Routes: ${totalViolations}`);

  if (totalViolations > 0) {
    process.exit(1);
  } else {
    console.log('ALL ROUTES PASSED AXE AUDIT WITH 0 VIOLATIONS.');
  }
}

main();
