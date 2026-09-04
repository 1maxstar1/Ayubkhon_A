/*
 * Admin page in a real browser: registry upload through the UI, history,
 * user management, access denied for an ekspert. Needs test/pb-smoke.sh first
 * (fresh DB + ekspert user) and node build.mjs --serve.
 *
 *   node test/e2e-admin.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8095, BASE = `http://127.0.0.1:${PORT}`;
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
const su = (await (await fetch(BASE + '/api/collections/_superusers/auth-with-password', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' })
})).json()).token;
await fetch(BASE + '/api/collections/users/records', {
  method: 'POST', headers: { 'content-type': 'application/json', Authorization: su },
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
});

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
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
await signIn('test@example.com');
check(await page.isVisible('#denied'), 'ekspert sees the access-denied note');
check(await page.isHidden('#adminMain'), 'ekspert does not see the admin panels');
await page.click('#signOut');

await signIn('boss@example.com');
check(await page.isVisible('#adminMain'), 'admin sees the panels');
await page.setInputFiles('#regFile', join(root, 'test/fixtures/registry-sample.xls'));
await page.waitForFunction(() => document.getElementById('regStat').textContent.includes('qator'), null, { timeout: 60000 });
const stat = await page.textContent('#regStat');
check(/400 qator .* 400 .* 0 /.test(stat), 'upload stats: ' + stat);
await page.waitForFunction(() => document.querySelectorAll('#regHistory tbody tr[data-id], #regHistory tbody tr').length >= 1);
const hist = await page.textContent('#regHistory tbody tr');
check(hist.includes('Boss') && /400400\s*0/.test(hist.replace(/\s+/g, '')), 'history row: ' + hist.replace(/\s+/g, ' ').trim());
check(hist.includes('registry'), 'history links the uploaded file');

await page.fill('#uEmail', 'new@example.com');
await page.fill('#uName', 'Yangi Xodim');
await page.click('#userForm button[type=submit]');
await page.waitForFunction(() => document.body.textContent.includes('new@example.com'));
const rows = await page.$$eval('#userTable tbody tr', (trs) => trs.map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
check(rows.some((r) => r.includes('new@example.com') && r.includes('faol')), 'new user listed as active');
await page.click('#userTable tbody tr:has-text("new@example.com") button');
await page.waitForFunction(() => /new@example\.com.*o'chirilgan/.test(document.querySelector('#userTable').textContent));
check(true, 'user can be deactivated');
const n = (await (await fetch(BASE + '/api/collections/applications/records?perPage=1', { headers: { Authorization: su } })).json()).totalItems;
check(n === 401, 'applications in the database (400 + smoke probe): ' + n);

// manual application: add through the form, find it, then delete it
await page.fill('#aNumber', '900123');
await page.fill('#aOrg', 'Qo\'lda MChJ');
await page.fill('#aInn', '301234567');
await page.fill('#aTitle', 'Sinov loyihasi');
await page.fill('#aCost', '5000000');
await page.click('#appForm button[type=submit]');
await page.waitForFunction(() => document.getElementById('appStat').textContent.includes('900123'));
check((await page.textContent('#appStat')).includes('qo\'shildi'), 'manual application added: ' + await page.textContent('#appStat'));
await page.waitForFunction(() => document.querySelectorAll('#findTable tbody tr[data-id]').length === 1);
const found = await page.textContent('#findTable tbody tr');
check(found.includes('900123') && found.includes('STIR 301234567'), 'find shows the new application with INN');
const rec = (await (await fetch(BASE + '/api/collections/applications/records?perPage=1&filter=' + encodeURIComponent("number='900123'"), { headers: { Authorization: su } })).json()).items[0];
check(rec && rec.cost_vat === 5000000 && rec.contragent, 'record carries the cost and a contragent');
// adding the same number again updates instead of duplicating
await page.fill('#aNumber', '900123');
await page.fill('#aTitle', 'Sinov loyihasi (yangilangan)');
await page.click('#appForm button[type=submit]');
await page.waitForFunction(() => document.getElementById('appStat').textContent.includes('yangilandi'));
const rec2 = (await (await fetch(BASE + '/api/collections/applications/records/' + rec.id, { headers: { Authorization: su } })).json());
check(rec2.org_name === 'Qo\'lda MChJ' && rec2.inn === '301234567' && rec2.project_title.includes('yangilangan') && rec2.contragent === rec.contragent, 'update keeps the fields that were left empty');

// a workspace for it (as the ekspert) shows up in the workspaces panel
const tok = (await (await fetch(BASE + '/api/collections/users/records?perPage=1&filter=' + encodeURIComponent("email='test@example.com'"), { headers: { Authorization: su } })).json()).items[0].id;
await fetch(BASE + '/api/collections/workspaces/records', {
  method: 'POST', headers: { 'content-type': 'application/json', Authorization: su },
  body: JSON.stringify({ application: rec.id, region: 'fargona', status: 'done', changed: 3, opened_by: tok, updated_by: tok, state: { prices: { a: 1 } } })
});
await page.reload();
await page.waitForSelector('#adminMain:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#wsTable tbody tr[data-id]').length === 1);
const wsRow = await page.textContent('#wsTable tbody tr');
check(wsRow.includes('900123') && wsRow.includes('Farg') && wsRow.includes('yakunlangan'), 'workspaces panel lists the workspace: ' + wsRow.replace(/\s+/g, ' ').trim());
page.once('dialog', (d) => d.accept());
await page.click('#wsTable tbody tr button[data-act=clear]');
await page.waitForFunction(() => /ishlanmoqda/.test(document.querySelector('#wsTable tbody').textContent));
check(true, 'clear resets the workspace to in progress');
page.once('dialog', (d) => d.accept());
await page.click('#wsTable tbody tr button[data-act=delete]');
await page.waitForFunction(() => document.querySelectorAll('#wsTable tbody tr[data-id]').length === 0);
check(true, 'delete removes the workspace');
await page.fill('#findQ', '900123');
await page.click('#findForm button[type=submit]');
await page.waitForFunction(() => document.querySelectorAll('#findTable tbody tr[data-id]').length === 1);
page.once('dialog', (d) => d.accept());
await page.click('#findTable tbody tr button[data-act=delapp]');
await page.waitForFunction(() => /Topilmadi/.test(document.querySelector('#findTable tbody').textContent));
const n2 = (await (await fetch(BASE + '/api/collections/applications/records?perPage=1', { headers: { Authorization: su } })).json()).totalItems;
check(n2 === 401, 'manual application deleted: ' + n2);

await page.screenshot({ path: join(root, 'test/shot-admin.png'), fullPage: true });
await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'e2e-admin OK');
process.exit(fail ? 1 : 0);
