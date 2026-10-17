/*
 * Signing in on one person's own laptop.
 *
 * There is no mail server on a laptop and no reason to run one, so the code is
 * not emailed: it is written beside the database and handed back to the page
 * that asked for it, over a route that only answers this machine and only in
 * laptop mode. What that has to add up to is one thing — press «Отправить код»
 * and you are in, with nothing to read out of a terminal window.
 *
 * The second half is the part that matters for the server: with PB_LAPTOP
 * unset the route is not there at all, and the page waits for the letter as
 * it always did.
 *
 *   node test/laptop.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

/* ------------------------------------------------------------- the laptop */
let pb = await startServer({ port: 8132, build: true, dev: '1', laptop: '1' });

const otp = await fetch(pb.base + '/api/collections/users/request-otp', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
}).then((r) => r.json());
await new Promise((r) => setTimeout(r, 600));
const got = await fetch(`${pb.base}/api/laptop/otp?id=${otp.otpId}`).then((r) => r.json());
check(/^\d{6,10}$/.test(String(got.code || '')), `the code of that request comes back (${got.code})`);
const other = await fetch(`${pb.base}/api/laptop/otp?id=someoneelse`);
check(other.status === 404, 'another request id gets nothing');
check((await fetch(`${pb.base}/api/laptop/otp`)).status === 404, 'and neither does asking without one');

await page.goto(pb.base + '/');
await page.waitForSelector('#screen-login:not([hidden])');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
// Nothing is typed in: pressing the button is the whole sign-in.
await page.waitForSelector('#who', { timeout: 15000 });
check(await page.isHidden('#screen-login'), 'pressing «Отправить код» signs the one person in');
check((await page.textContent('#who')) === 'Test Ekspert', 'as themselves');
check(errors.length === 0, 'and the page reported no errors' + (errors.length ? ': ' + errors[0] : ''));

pb.stop();
await new Promise((r) => setTimeout(r, 700));

/* ------------------------------------------------------------- the server */
pb = await startServer({ port: 8133, dev: '1' });          // PB_LAPTOP unset
check((await fetch(`${pb.base}/api/laptop/otp?id=${otp.otpId}`)).status === 404,
  'without laptop mode the route is not there at all');

const page2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page2.goto(pb.base + '/');
await page2.waitForSelector('#screen-login:not([hidden])');
await page2.fill('#loginEmail', 'test@example.com');
await page2.click('#loginBtn');
await page2.waitForSelector('#codeBox:not([hidden])', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500));
check((await page2.inputValue('#loginCode')) === '', 'so the code box stays empty, waiting for the letter');
check(await page2.isVisible('#screen-login'), 'and nobody is signed in by it');
check((await page2.textContent('#codeHint')).includes('30 минут'), 'with the hint the letter needs');

pb.stop();
await browser.close();
console.log(fail ? `FAILED (${fail})` : 'laptop OK');
process.exit(fail ? 1 : 0);
