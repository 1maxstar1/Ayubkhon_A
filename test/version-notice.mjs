/*
 * A page left open while the program on the server is updated (F6).
 *
 * The page now reads, now and then, the version the server serves — from the label the launchers read — and when it
 * is another one says so in a bar with «Обновить страницу»; it never reloads by itself. Held here, in server mode
 * (laptop, signed in by itself), on what the test server really serves and on a page it is made to serve:
 *
 *   - on the real server the version read is the page's own, and nothing is said;
 *   - another version served: the bar names it; «×» hides it for that version;
 *   - a server that does not answer says nothing here (that is the save mark's to say);
 *   - «Обновить страницу» saves the open application first: the price typed before it is there after the reload;
 *   - the admin page does the same.
 *
 *   node test/version-notice.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION = 'v' + JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const pb = await startServer({ port: 8163, build: true, dev: '1', laptop: '1', autologin: '1' });
const browser = await chromium.launch(launchOpts);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pb.base + '/');
await page.waitForSelector('#who', { timeout: 20 * 1000 });

/* the real server */
let r = await page.evaluate(() => S.Version.check());
check(r.own === VERSION && r.served === VERSION, `the version the server serves is read, and is the page's own (${r.served} / ${r.own})`);
check(!(await page.isVisible('#verBar')), 'and nothing is said');

/* another version served */
// the page itself, by its path: one function, so that unroute() takes off exactly what route() put on
const ROOT = (u) => new URL(u).pathname === '/';
const fake = (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
  body: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><b>x</b><i class="ver" title="">v99.0.0</i></body></html>' });
await page.route(ROOT, fake);
r = await page.evaluate(() => S.Version.check());
check(r.served === 'v99.0.0' && await page.isVisible('#verBar') && /v99\.0\.0/.test(await page.textContent('#verBar')) &&
  /Обновите страницу/.test(await page.textContent('#verBar')), 'another version served: a bar names it and says «Обновите страницу»');
await page.click('#verBar [data-x]');
await page.evaluate(() => S.Version.check());
check(!(await page.isVisible('#verBar')), '«×» hides it, and the same version does not bring it back');
await page.unroute(ROOT);

/* no answer */
await page.route(ROOT, (route) => route.abort('connectionrefused'));
r = await page.evaluate(() => S.Version.check());
check(r.served === null && !(await page.isVisible('#verBar')), 'a server that does not answer says nothing here');
await page.unroute(ROOT);

/* «Обновить страницу» saves the open application first, then reloads. (The saving itself is the workspace's, tested
   in e2e-workspace; here: that it is asked for, and before the reload.) */
await page.evaluate(() => {
  localStorage.removeItem('ver-test');
  const Sy = S.Sync;
  Sy.ws = Sy.ws || { id: 'ver-test', files: [], state: {} };
  Sy.frozen = false;
  const add = (w) => localStorage.setItem('ver-test', (localStorage.getItem('ver-test') ? localStorage.getItem('ver-test') + ',' : '') + w);
  Sy.flush = () => add('flushed');
  Sy.saveNow = () => { add('saved'); return new Promise((r) => setTimeout(r, 300)); };
});
// another version again (the one before was dismissed with «×»)
await page.route(ROOT, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
  body: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><i class="ver">v99.0.1</i></body></html>' }));
await page.evaluate(() => S.Version.check());
await page.unroute(ROOT);
page.on('dialog', (d) => d.accept());           // «leave the page?» — the test leaves it
const nav = page.waitForNavigation({ timeout: 20 * 1000 });
await page.click('#verBar [data-reload]');
await nav;
await page.waitForFunction(() => window.S && S.Version && S.pb && S.pb.authStore.isValid, null, { timeout: 20 * 1000 });
check(/^flushed,saved\b/.test(await page.evaluate(() => localStorage.getItem('ver-test')) || ''), '«Обновить страницу» saves the open application, and reloads only after');
check(!(await page.isVisible('#verBar')), 'and after the reload the bar is gone');

/* the admin page */
const me = (await pb.api(`/api/collections/users/records?filter=${encodeURIComponent("email='test@example.com'")}`, {}, pb.su)).items[0];
await pb.api(`/api/collections/users/records/${me.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }, pb.su);
await page.goto(pb.base + '/admin.html');
await page.waitForFunction(() => S.pb.authStore.isValid && window.S && S.Version, null, { timeout: 20 * 1000 });
r = await page.evaluate(() => S.Version.check());
check(r.served === VERSION && r.own === VERSION, `the admin page reads its own version too (${r.served})`);

await browser.close();
await pb.stop();
check(!errors.length, errors.length ? 'page errors: ' + errors.slice(0, 4).join('; ') : 'no page errors');
console.log(fail ? `FAILED (${fail})` : 'version-notice OK');
process.exit(fail ? 1 : 0);
