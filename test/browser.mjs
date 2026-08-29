/*
 * End-to-end smoke test of dist/smeta-taqqoslash.html in a real browser:
 * load two smeta workbooks, adjust a price, export, and check the result.
 *
 *   node test/browser.mjs <file1.xlsx> <file2.xlsx>
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inputs = process.argv.slice(2);
if (inputs.length === 0) { console.error('usage: node test/browser.mjs <file.xlsx>…'); process.exit(1); }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));

const t0 = Date.now();
await page.setInputFiles('#pick', inputs);
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100, null,
  { timeout: 60000 });
const loadMs = Date.now() - t0;

const stats = await page.evaluate(() => ({
  projects: app.projects.length,
  objects: app.projects.map((p) => p.objects.length),
  rows: app.model.rows.length,
  resources: app.model.resources.length,
  spans: app.model.spans.length,
  buildMs: app._buildMs,
}));
console.log('loaded in', loadMs, 'ms', stats);

await page.screenshot({ path: join(root, 'test/shot-prices.png') });

// Edit one price through the UI exactly as a user would.
await page.fill('#q', 'DUB');
await page.waitForTimeout(250);
const before = await page.evaluate(() => app.prices_ui.view.length);
const firstInput = page.locator('#priceScroll .pin').first();
await firstInput.click();
await firstInput.fill('80000');
await page.waitForTimeout(300);
const after = await page.evaluate(() => {
  const r = app.model.resources.find((x) => x.name.trim().toUpperCase() === 'DUB');
  const rows = app.model.rows.filter((x) => x.kind === 'item' && x.key === (r && r.key));
  return { found: !!r, market: r && r.market, rowCount: rows.length, allApplied: rows.every((x) => x.market === 80000) };
});
console.log('price edit:', { matched: before, ...after });

await page.selectOption('#filter', 'changed');
await page.waitForTimeout(200);
await page.fill('#q', '');
await page.waitForTimeout(250);
await page.screenshot({ path: join(root, 'test/shot-changed.png') });

// Sheet + report tabs render.
await page.click('.tab[data-pane="sheet"]');
await page.waitForTimeout(300);
const sheetRows = await page.locator('#priceScroll,#sheetScroll .vrow').count();
await page.screenshot({ path: join(root, 'test/shot-sheet.png') });
await page.click('.tab[data-pane="report"]');
await page.waitForTimeout(400);
await page.screenshot({ path: join(root, 'test/shot-report.png') });
const reportInfo = await page.textContent('#reportCount');
console.log('sheet rows rendered:', sheetRows, '| report:', reportInfo);

// Scroll performance of the assembled sheet.
await page.click('.tab[data-pane="sheet"]');
const scrollMs = await page.evaluate(async () => {
  const el = document.getElementById('sheetScroll');
  const t = performance.now();
  for (let i = 0; i < 60; i++) {
    el.scrollTop += 900;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return Math.round(performance.now() - t);
});
console.log('60 scroll frames over the assembled sheet:', scrollMs, 'ms');

// Export.
const dl = page.waitForEvent('download', { timeout: 120000 });
await page.click('#export');
const download = await dl;
const out = join(root, 'test/export-browser.xlsx');
await download.saveAs(out);
console.log('exported ->', out, existsSync(out) ? (readFileSync(out).length / 1024).toFixed(0) + ' KB' : 'MISSING');

writeFileSync(join(root, 'test/browser-errors.txt'), errors.join('\n'));
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 12).join('\n') : 'no page errors');

await browser.close();
process.exit(errors.length ? 1 : 0);
