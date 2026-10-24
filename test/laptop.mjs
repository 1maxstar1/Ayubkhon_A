/*
 * One person on their own laptop.
 *
 * The owner's decision (2026-10): the computer is theirs alone, so there is no
 * sign-in at all — open the page and you are in. That is three switches, and
 * each is checked here at the level a person would notice it:
 *
 *   laptop + autologin   no login screen, no «Выйти», no four-hour lock, and
 *                        a session that runs out is quietly replaced — but
 *                        only for this program's own page, not for any other
 *                        site open in the same browser;
 *   laptop alone         the login is back, and the code fills itself in
 *                        (what PB_AUTOLOGIN=0 gives on the laptop);
 *   neither              a server: the code goes by mail, the page waits.
 *
 *   node test/laptop.mjs
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const browser = await chromium.launch(launchOpts);
const errors = [];
const newPage = async () => {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return p;
};
const post = (url, headers = {}) => fetch(url, { method: 'POST', headers });
const curl = (args) => execSync(`curl -s -o /dev/null -w '%{http_code}' ${args}`).toString();

/* --------------------------------------------- laptop, no sign-in at all */
console.log('-- a laptop only its owner uses --');
let pb = await startServer({ port: 8132, build: true, dev: '1', laptop: '1', autologin: '1' });
let page = await newPage();
await page.goto(pb.base + '/');
await page.waitForSelector('#who', { timeout: 15000 });
check(await page.isHidden('#screen-login'), 'opening the page is the whole sign-in');
check((await page.textContent('#who')) === 'Test Ekspert', 'as the one person the laptop belongs to');
check(!(await page.isVisible('#signOut')), 'with no «Выйти» to press');

await page.evaluate(() => { S.Auth.last = Date.now() - 5 * 3600 * 1000; S.Auth.tick(); });
await new Promise((r) => setTimeout(r, 500));
check(await page.isHidden('#screen-login'), 'five idle hours lock nothing');

await page.evaluate(() => { S.pb.authStore.clear(); S.Auth.tick(); });
await page.waitForFunction(() => S.pb.authStore.isValid, null, { timeout: 10000 });
check(await page.isHidden('#screen-login'), 'a session that ran out — a night asleep — is quietly replaced');

// The laptop's one account is an administrator (laptop.sh makes it so), so
// the registry can be loaded without anybody signing in to anything.
const me = (await pb.api(`/api/collections/users/records?filter=${encodeURIComponent("email='test@example.com'")}`, {}, pb.su)).items[0];
await pb.api(`/api/collections/users/records/${me.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }, pb.su);
await page.goto(pb.base + '/admin.html');
await page.waitForFunction(() => S.pb.authStore.isValid && !document.getElementById('adminMain').hidden, null, { timeout: 15000 });
check(await page.isHidden('#screen-login'), 'the admin page opens the same way, with no sign-in');
await pb.api(`/api/collections/users/records/${me.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'ekspert' }) }, pb.su);

// Any other site open in the same browser can send a request to 127.0.0.1.
check((await post(pb.base + '/api/laptop/signin', { Origin: 'http://evil.example' })).status === 404,
  'a request from another site gets nothing');
check(curl(`-X POST -H 'Host: evil.example:8132' ${pb.base}/api/laptop/signin`) === '404',
  'nor does one addressed to another name pointed at this machine');
check((await post(pb.base + '/api/laptop/signin', { Origin: pb.base })).status === 200,
  'while the program\'s own page is let in');
const other = await newPage();
await other.goto(pb.base.replace('127.0.0.1', 'localhost') + '/');
await other.waitForSelector('#who', { timeout: 15000 });
const cross = await other.evaluate((u) => fetch(u + '/api/laptop/signin', { method: 'POST' })
  .then((r) => r.status).catch(() => 'blocked'), pb.base);
check(cross === 404 || cross === 'blocked', `a page on another origin, in a real browser, is refused (${cross})`);
check(errors.length === 0, 'and no page reported an error' + (errors.length ? ': ' + errors[0] : ''));
pb.stop();
await new Promise((r) => setTimeout(r, 700));

/* ---------------------------------- laptop where the auto sign-in failed */
console.log('-- a laptop where the auto sign-in did not work --');
pb = await startServer({ port: 8138, dev: '1', laptop: '1', autologin: '1', as: 'nobody@example.com' });
page = await newPage();
await page.goto(pb.base + '/');
await page.waitForSelector('#loginErr:not([hidden])', { timeout: 10000 });
const said = await page.textContent('#loginErr');
check(said.includes('учётная запись не найдена'), `the login screen says why, in the program's language (${said})`);
check(said.includes('laptop.cmd doctor'), 'and what to run to find out more');
pb.stop();
await new Promise((r) => setTimeout(r, 700));

/* ----------------------------------- laptop with the login switched back on */
console.log('-- the login switched back on (PB_AUTOLOGIN=0) --');
pb = await startServer({ port: 8133, dev: '1', laptop: '1' });
check((await post(pb.base + '/api/laptop/signin')).status === 404, 'nobody is signed in by themselves');
page = await newPage();
await page.goto(pb.base + '/');
await page.waitForSelector('#screen-login:not([hidden])');
await new Promise((r) => setTimeout(r, 500));
check(await page.isHidden('#loginErr'), 'and, since that was chosen, the login screen does not call it a failure');
const otp = await fetch(pb.base + '/api/collections/users/request-otp', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
}).then((r) => r.json());
await new Promise((r) => setTimeout(r, 600));
const got = await fetch(`${pb.base}/api/laptop/otp?id=${otp.otpId}`).then((r) => r.json());
check(/^\d{6,10}$/.test(String(got.code || '')), `the code of that request comes back (${got.code})`);
check((await fetch(`${pb.base}/api/laptop/otp?id=someoneelse`)).status === 404, 'another request id gets nothing');
check((await fetch(`${pb.base}/api/laptop/otp?id=${otp.otpId}`, { headers: { Origin: 'http://evil.example' } })).status === 404,
  'nor does another site asking for the right one');
page = await newPage();
await page.goto(pb.base + '/');
await page.waitForSelector('#screen-login:not([hidden])');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#who', { timeout: 15000 });
check(await page.isHidden('#screen-login'), 'pressing «Отправить код» signs in, the code filling itself in');
check(await page.isVisible('#signOut'), 'and «Выйти» is back');
pb.stop();
await new Promise((r) => setTimeout(r, 700));

/* ------------------------------------------------------------- a server */
console.log('-- a server --');
pb = await startServer({ port: 8135, dev: '1' });
check((await post(pb.base + '/api/laptop/signin')).status === 404, 'there is no sign-in route at all');
page = await newPage();
await page.goto(pb.base + '/');
await page.waitForSelector('#loginErr:not([hidden])', { timeout: 10000 });
check((await page.textContent('#loginErr')).includes('не через laptop.cmd'),
  'opened on this computer, it says the server was not started by the launcher — the Windows symptom');
check((await fetch(`${pb.base}/api/laptop/otp?id=${otp.otpId}`)).status === 404, 'nor a code route');
page = await newPage();
await page.goto(pb.base + '/');
await page.waitForSelector('#screen-login:not([hidden])');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500));
check((await page.inputValue('#loginCode')) === '', 'so the code box stays empty, waiting for the letter');
check(await page.isVisible('#screen-login'), 'and nobody is signed in by it');
check((await page.textContent('#codeHint')).includes('30 минут'), 'with the hint the letter needs');

pb.stop();
await browser.close();
console.log(fail ? `FAILED (${fail})` : 'laptop OK');
process.exit(fail ? 1 : 0);
