/*
 * Load test with the real registry export: upload Report_1.xls (~28 000 rows)
 * through the admin page, then use the list with that many applications.
 *
 *   node test/e2e-fullregistry.mjs /path/to/Report_1.xls
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = process.argv[2];
if (!file || !existsSync(file)) { console.error('usage: node test/e2e-fullregistry.mjs Report_1.xls'); process.exit(1); }
const PORT = 8099, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_test');

execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'ignore' });
const server = spawn('sh', ['server/run.sh'], {
  cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore'
});
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (path, opts = {}, token) => (await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) } })).json();
const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' }) })).token;
await api('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true }) }, su);

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
async function signIn(email) {
  await page.fill('#loginEmail', email);
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
  await page.fill('#loginCode', code);
  await page.click('#loginBtn');
  await page.waitForSelector('#who');
}

await page.goto(BASE + '/admin.html');
await signIn('boss@example.com');
let t0 = Date.now();
await page.setInputFiles('#regFile', file);
await page.waitForFunction(() => document.getElementById('regStat').textContent.includes('строк') || !document.getElementById('regErr').hidden, null, { timeout: 15 * 60000 });
const stat = await page.textContent('#regStat');
const err = await page.textContent('#regErr');
console.log(`first upload: ${Math.round((Date.now() - t0) / 1000)} s — ${stat}${err ? ' ERR ' + err : ''}`);
check(/новых заявок 2\d\d\d\d/.test(stat), 'tens of thousands of rows added');
const n1 = (await api('/api/collections/applications/records?perPage=1', {}, su)).totalItems;

t0 = Date.now();
await page.setInputFiles('#regFile', file);
await page.waitForFunction((prev) => document.getElementById('regStat').textContent !== prev && document.getElementById('regStat').textContent.includes('строк'), stat, { timeout: 15 * 60000 });
const stat2 = await page.textContent('#regStat');
console.log(`second upload: ${Math.round((Date.now() - t0) / 1000)} s — ${stat2}`);
check(/новых заявок 0 · уже были в базе, обновлено 2\d\d\d\d/.test(stat2), 'the weekly re-upload adds nothing and updates everything');
const n2 = (await api('/api/collections/applications/records?perPage=1', {}, su)).totalItems;
check(n1 === n2, `application count stable: ${n1}`);

// the list with a big registry
await page.goto(BASE + '/');
await page.waitForSelector('#screen-list:not([hidden])');
t0 = Date.now();
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length >= 50);
console.log(`list first page: ${Date.now() - t0} ms`);
t0 = Date.now();
const total = await page.textContent('#appCount');
await page.fill('#appQ', 'Buxoro');
await page.waitForFunction((prev) => { const t = document.getElementById('appCount').textContent; return t !== prev && !t.includes('yuklan'); }, total);
check(!(await page.textContent('#appCount')).includes('28338'), 'search narrows the count');
console.log(`search "Buxoro": ${Date.now() - t0} ms — ${await page.textContent('#appCount')}`);
await page.selectOption('#appYear', '2025');
await page.waitForFunction(() => !document.getElementById('appCount').textContent.includes('yuklan'));
console.log(`year 2025 filter — ${await page.textContent('#appCount')}`);
check(true, 'list usable with the full registry');

await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'e2e-fullregistry OK');
process.exit(fail ? 1 : 0);
