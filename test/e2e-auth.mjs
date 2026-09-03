/*
 * Server-mode sign-in in a real browser: OTP request, code from the dev hook,
 * sign-in, idle lock. Runs test/pb-smoke.sh first (fresh DB + test user).
 *
 *   node build.mjs --serve && node test/e2e-auth.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8092, BASE = `http://127.0.0.1:${PORT}`;

execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'inherit' });
const server = spawn('sh', ['server/run.sh'], {
  cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore'
});
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

await page.goto(BASE + '/');
check(await page.isVisible('#screen-login'), 'login screen shown to a signed-out visitor');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 700));
const code = readFileSync(join(root, 'server/pb_data_test/dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
await page.fill('#loginCode', '00000000');
await page.click('#loginBtn');
await page.waitForSelector('#loginErr:not([hidden])');
check((await page.textContent('#loginErr')).includes('noto\'g\'ri'), 'wrong code is rejected with a message');
await page.fill('#loginCode', code);
await page.click('#loginBtn');
await page.waitForSelector('#who', { timeout: 10000 });
check(await page.isHidden('#screen-login'), 'login screen hidden after sign-in');
check((await page.textContent('#who')) === 'Test Ekspert', 'header shows the user name');
check(!(await page.isVisible('#userBox a.link')), 'no admin link for an ekspert');

await page.reload();
await page.waitForSelector('#who', { timeout: 10000 });
check(await page.isHidden('#screen-login'), 'session survives a reload');

// simulate four hours of inactivity
await page.evaluate(() => { S.Auth.last = Date.now() - 5 * 3600 * 1000; S.Auth.tick(); });
await page.waitForSelector('#screen-login:not([hidden])');
check((await page.textContent('#loginMsg')).includes('4 soat'), 'idle lock shows the four-hour message');
check(await page.evaluate(() => !S.pb.authStore.isValid), 'token cleared on lock');
await page.reload();
check(await page.isVisible('#screen-login'), 'locked session stays locked after reload');

await page.screenshot({ path: join(root, 'test/shot-login.png') });
await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'e2e-auth OK');
process.exit(fail ? 1 : 0);
