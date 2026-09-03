/*
 * Server-mode workspace in a real browser: open an application, choose the
 * region, upload smeta files, change a price, reload, continue, export, close.
 * Needs node build.mjs --serve. Smeta files: args or the two dev uploads.
 *
 *   node test/e2e-workspace.mjs [a.xlsx b.xlsx]
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const UP = '/root/.claude/uploads/8af525ef-a19a-5966-9772-c57eec709e1c/';
const smetas = process.argv.slice(2).length ? process.argv.slice(2) :
  ['bb932e59-_______________07_07_2026__2___2025.xlsx', 'f668c710-_____________4______27_12_2024__4_2022_2________.xlsx'].map((f) => UP + f);
if (!smetas.every(existsSync)) { console.error('smeta files not found; pass two .xlsx paths'); process.exit(1); }
const PORT = 8096, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_test');

execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'ignore' });
execSync('node test/registry.cjs --json server/pb_data_test/rows.json', { cwd: root, stdio: 'ignore' });
const server = spawn('sh', ['server/run.sh'], {
  cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore'
});
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}), ...(opts.headers || {}) } });
  return r.json();
};
const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' }) })).token;
const rows = JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8'));
const imp = await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
console.log('registry imported:', imp.added, 'rows');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const count = async (coll, filter = '') => (await api(`/api/collections/${coll}/records?perPage=1&filter=${encodeURIComponent(filter)}`, {}, su)).totalItems;

await page.goto(BASE + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
await page.fill('#loginCode', code);
await page.click('#loginBtn');
await page.waitForSelector('#screen-list:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length >= 50);
check(true, 'application list shown after sign-in');
check((await page.textContent('#appCount')).includes('401'), 'count shows all applications: ' + await page.textContent('#appCount'));

await page.fill('#appQ', '67159');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
check((await page.textContent('#appTable tbody tr')).includes('Avtoyo'), 'search by number finds 67159');
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
check((await page.textContent('#regionTitle')).includes('67159'), 'region screen names the application');
check((await page.inputValue('#regionSel')) === 'respublika', 'region suggested from «Общереспубликанский»');
await page.selectOption('#regionSel', 'fargona');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
check((await page.textContent('#wsBox')).includes('Farg'), 'workspace header shows the region');
check(await page.isHidden('#screen-list'), 'list hidden while a workspace is open');
check((await count('workspaces')) === 1, 'workspace record created');

await page.setInputFiles('#pick', smetas);
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100, null, { timeout: 90000 });
await page.waitForFunction(() => S.Sync.ws.files && S.Sync.ws.files.length === 2, null, { timeout: 90000 });
check(true, 'two smeta files uploaded to the workspace');
const before = await page.evaluate(() => ({ projects: app.projects.length, rows: app.model.rows.length, res: app.model.resources.length }));

// change one price on the prices tab
const first = await page.evaluate(() => {
  const r = app.model.resources.find((x) => x.price > 1000);
  return { key: r.key, price: r.price };
});
await page.fill('#q', '');
const sel = `#priceScroll input.pin[data-key="${first.key.replace(/"/g, '\\"')}"]`;
await page.evaluate((k) => { const i = app.model.resources.findIndex((x) => x.key === k); app.prices_ui.list.scrollToRow(Math.max(0, i)); }, first.key);
await page.waitForSelector(sel, { timeout: 10000 });
await page.fill(sel, String(Math.round(first.price * 1.1)));
await page.dispatchEvent(sel, 'input');
await page.waitForFunction(() => document.getElementById('wsSave').textContent === '✓' && !S.Sync.dirty, null, { timeout: 15000 });
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === 1, 'one correction row saved');
const corr = (await api('/api/collections/corrections/records?perPage=1', {}, su)).items[0];
check(corr.region === 'fargona' && corr.market_price === Math.round(first.price * 1.1) && corr.res_key === first.key, 'correction carries region, key and market price');
const w1 = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(w1.changed === 1 && w1.state.projects.length === 2 && Object.keys(w1.state.files).length === 2, 'workspace state: 2 projects, 2 files, changed=1');

// reload -> list -> continue -> everything back
await page.reload();
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', '67159');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
check((await page.textContent('#appTable tbody tr')).includes('ishlanmoqda'), 'list shows the application as in progress');
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100 && !S.Sync.loading, null, { timeout: 120000 });
const after = await page.evaluate((k) => ({
  projects: app.projects.length, rows: app.model.rows.length, res: app.model.resources.length,
  price: app.prices[k], changed: app.model.resources.filter((r) => !S.near(r.price, r.market)).length
}), first.key);
check(after.projects === before.projects && after.rows === before.rows && after.res === before.res, `restored model matches (${after.rows} rows)`);
check(after.price === Math.round(first.price * 1.1) && after.changed === 1, 'changed price restored');
check((await count('corrections')) === 1, 'restore did not duplicate corrections');

// remove one project -> its file leaves the server too
await page.click('#projects .proj:last-child button[data-act=del]');
await page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 15000 });
await page.evaluate(() => S.Sync.q);
const w2 = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(w2.files.length === 1 && w2.state.projects.length === 1 && Object.keys(w2.state.files).length === 1, 'deleting a project removes its file from the workspace');
// add it back (same file name as before) -> two files again, no duplicate entry
await page.setInputFiles('#pick', [smetas[1]]);
await page.waitForFunction(() => app.projects.length === 2 && S.Sync.ws.files.length === 2 && !S.Sync.dirty, null, { timeout: 90000 });
await page.evaluate(() => S.Sync.q);
const w3 = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(w3.files.length === 2 && Object.keys(w3.state.files).length === 2, 're-adding the file uploads it again');

// export -> stored on the server
await page.click('#export');
await page.waitForFunction(() => document.getElementById('toast').textContent.includes('serverda saqlandi'), null, { timeout: 60000 });
check((await count('exports')) === 1, 'export stored in exports');

// reset the price -> correction removed
await page.evaluate((k) => { const r = app.model.resources.find((x) => x.key === k); app.setPrice(k, r.price); }, first.key);
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === 0, 'resetting the price removes the correction');

// finish and go back to the list
await page.click('#wsDone');
await page.waitForFunction(() => document.querySelector('#wsBox .done'));
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', '67159');
await page.waitForFunction(() => /yakunlangan/.test(document.querySelector('#appTable tbody').textContent));
check(true, 'list shows the application as finished');
await page.click('#appTable tbody tr button[data-act=card]');
await page.waitForSelector('#screen-card:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#cardExports li a').length === 1);
check((await page.textContent('#cardFields')).includes('67159') === false && (await page.textContent('#cardTitle')).includes('67159'), 'card opens for the application');
check((await page.$$eval('#cardFiles li a', (a) => a.length)) === 2, 'card lists the two uploaded smeta files');
check((await page.textContent('#cardWork')).includes('Yakunlangan'), 'card shows the work status');
await page.click('#cardClose');
await page.selectOption('#appRegion', 'fargona');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
await page.selectOption('#appRegion', 'andijon');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 0);
check(true, 'region filter works on the list');
await page.selectOption('#appRegion', '');
check(await page.evaluate(() => app.projects.length === 0 && !S.Sync.ws), 'app cleared after closing the workspace');

await page.screenshot({ path: join(root, 'test/shot-list.png') });
await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'e2e-workspace OK');
process.exit(fail ? 1 : 0);
