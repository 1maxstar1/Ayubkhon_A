/*
 * The last price, and a tab that is closed.
 *
 * A price goes to the server twice — as a correction (the price memory) and inside the application's state (the
 * table) — one request after the other. On the computer the server runs on that is milliseconds. Over a network
 * it is long enough to close the tab in: the correction arrived, the state did not, and at the next open the
 * price was in neither the table nor the document, while other applications were offered it as a price an
 * expert had set.
 *
 * Held here, on a link made slow or cut on purpose:
 *   - closing the tab right after typing: the price is there at the next open, and on the server;
 *   - with no link at all when the tab closes: the browser kept it, puts it back and saves it;
 *   - on another computer (nothing kept in the browser): a correction newer than the saved state is put back
 *     into the table, with where it was applied from;
 *   - and none of this brings back a price that was deliberately returned to the estimate's own, or overrides
 *     something saved later from elsewhere.
 *
 * The estimate is invented.
 *
 *   node test/close-tab.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { createServer, request } from 'node:http';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const { book, xlsx } = require('./compare-books.cjs');
const S = load(load.PIPELINE);

const dir = mkdtempSync(join(tmpdir(), 'closetab-'));
const EST = join(dir, 'first.xlsx');
writeFileSync(EST, xlsx(S, book(1)));

const PORT = 8127;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const errors = [];

/*
 * The link between the page and the server: slow, or cut, for the two kinds of request a price becomes. It is a
 * real proxy in front of the server and not the browser's own request interception, because the requests that
 * matter here are the ones a browser sends while the page is going away — and those do not pass through
 * interception at all, and are dropped with the page if they are held there.
 */
const link = { delay: 0, cutState: false, cutBulk: false };
const proxy = createServer(async (req, res) => {
  const bulk = req.url.startsWith('/api/corrections/bulk');
  const state = req.method === 'PATCH' && /^\/api\/collections\/workspaces\/records\//.test(req.url) && /json/.test(req.headers['content-type'] || '');
  const chunks = [];
  try { for await (const c of req) chunks.push(c); } catch (e) { return; }
  if ((bulk && link.cutBulk) || (state && link.cutState)) { req.socket.destroy(); return; }
  if ((bulk || state) && link.delay) await sleep(link.delay);       // on its way: it arrives whether or not the tab still lives
  const up = request({ host: '127.0.0.1', port: PORT, method: req.method, path: req.url, headers: { ...req.headers, host: '127.0.0.1:' + PORT } }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => res.destroy());
  res.on('error', () => {});
  up.end(Buffer.concat(chunks));
});
await new Promise((r) => proxy.listen(PORT + 1, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + (PORT + 1);

/** A browser of its own (its own storage), signed in. */
async function computer() {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/ClientResponseError|\[object Object\]|Failed to fetch/.test(e.message)) errors.push('pageerror: ' + e.message); });
  await page.goto(BASE + '/');
  await page.fill('#loginEmail', 'test@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await sleep(700);
  await page.fill('#loginCode', pb.lastCode('test@example.com'));
  await page.click('#loginBtn');
  await page.waitForSelector('#screen-list:not([hidden])');
  return { ctx, page };
}
const ready = (page) => page.waitForFunction(() => window.app && window.S && S.Sync && S.Sync.ws && !S.Sync.loading && app.pending <= 0 && app.model && app.model.rows.length > 0,
  null, { timeout: 30 * 1000 });
/** The same browser, a new tab on the application (the address remembers which). */
async function tab(ctx, url) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/ClientResponseError|\[object Object\]|Failed to fetch/.test(e.message)) errors.push('pageerror: ' + e.message); });
  await page.goto(url);
  await ready(page);
  return page;
}
const market = (page, name) => page.evaluate((n) => { const r = app.model.resources.find((x) => x.name === n); return r ? r.market : null; }, name);
const type = (page, name, v) => page.evaluate(([n, val]) => { const r = app.model.resources.find((x) => x.name === n); app.setPrice(r.key, val == null ? r.price : val); }, [name, v]);
const settled = async (page) => {
  await page.evaluate(() => S.Sync.flush());
  await page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * 1000 });
  await page.evaluate(() => S.Sync.q);
};

const first = await computer();
let page = first.page;
await page.fill('#appQ', number);
await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length === 1 && tr[0].textContent.includes(n); }, number);
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
await page.selectOption('#regionSel', 'fargona');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
await page.setInputFiles('#pick', EST);
await page.waitForFunction(() => app.projects.length === 1 && app.pending <= 0);
await settled(page);
const wsId = await page.evaluate(() => S.Sync.ws.id);
const url = page.url();
const stored = async () => (await api('/api/collections/workspaces/records/' + wsId, {}, su));
const inState = async (name) => { const st = (await stored()).state; const k = Object.keys(st.prices2 || {}).find((x) => x.indexOf(S.nameKey(name)) === 0); return k ? st.prices2[k] : null; };
const corrOf = async (name) => {
  const list = await api('/api/collections/corrections/records?perPage=200&filter=' + encodeURIComponent(`workspace="${wsId}"`), {}, su);
  return (list.items || []).find((c) => c.name === name) || null;
};
const journal = (p) => p.evaluate((id) => JSON.parse(localStorage.getItem('smeta.unsaved.' + id) || '{}'), wsId);

/* 1 — a slow link, and the tab closed a third of a second after the price */
console.log('-- a slow link: the tab is closed right after the price --');
link.delay = 600;
let lost = 0;
for (let i = 0; i < 4; i++) {
  await type(page, 'ТЕСТОВЫЙ КРАН 10 Т', 10 - i * 0.5);
  await sleep(300);
  await page.close({ runBeforeUnload: true });
  await sleep(1500);                                   // the browser finishes what it was asked to finish
  if (await inState('ТЕСТОВЫЙ КРАН 10 Т') !== 10 - i * 0.5) lost++;
  link.delay = 0;
  page = await tab(first.ctx, url);
  check(await market(page, 'ТЕСТОВЫЙ КРАН 10 Т') === 10 - i * 0.5, `attempt ${i + 1}: the price typed before closing is in the table at the next open`);
  await settled(page);
  link.delay = 600;
}
check(lost === 0, `the state reached the server before anybody opened the application again: ${4 - lost} of 4 times`);
check(await inState('ТЕСТОВЫЙ КРАН 10 Т') === 8.5 && (await corrOf('ТЕСТОВЫЙ КРАН 10 Т')).market_price === 8.5, 'the table and the price memory agree on the server');
check(Object.keys(await journal(page)).length === 0, 'and nothing is left waiting in the browser');
link.delay = 0;

/* 2 — no link at all when the tab is closed */
console.log('-- no link when the tab is closed --');
link.cutState = true; link.cutBulk = true;
await type(page, 'ТЕСТОВЫЙ АНКЕР М5', 15);
await type(page, 'ТЕСТОВЫЙ АНКЕР М8', 16);
await sleep(200);
check(Object.keys(await journal(page)).length === 2, 'two prices typed: the browser holds both until the server has them');
await page.close({ runBeforeUnload: true });
await sleep(500);
check(await inState('ТЕСТОВЫЙ АНКЕР М5') === null && await corrOf('ТЕСТОВЫЙ АНКЕР М5') === null, 'nothing of them reached the server');
link.cutState = false; link.cutBulk = false;
page = await tab(first.ctx, url);
check(await market(page, 'ТЕСТОВЫЙ АНКЕР М5') === 15 && await market(page, 'ТЕСТОВЫЙ АНКЕР М8') === 16, 'at the next open both are back in the table');
check(/Восстановлены цены, которые не успели сохраниться[^:]*: 2/.test(await page.textContent('#toast')), 'and the page says that it put them back');
await settled(page);
check(await inState('ТЕСТОВЫЙ АНКЕР М5') === 15 && (await corrOf('ТЕСТОВЫЙ АНКЕР М8')).market_price === 16, 'they are saved: the state and the price memory');
check(Object.keys(await journal(page)).length === 0, 'and no longer waited for');
check(await market(page, 'ТЕСТОВЫЙ АНКЕР М5') === 15 && await market(page, 'ТЕСТОВЫЙ КРАН 10 Т') === 8.5, 'the anchors are told apart, and the earlier price is untouched');

/* 3 — the correction arrived, the state did not; the application is opened on another computer */
console.log('-- the correction arrived, the state did not: another computer --');
link.cutState = true;
const SRC = 'hint:' + (await corrOf('ТЕСТОВЫЙ КРАН 10 Т')).id;       // applied from a suggestion (a correction that exists), not typed
await page.evaluate((src) => {
  const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ БОЛТ');
  S.markSource(r.key, 6, src);
  app.setPrice(r.key, 6);
}, SRC);
await page.evaluate(() => S.Sync.flush());
for (let n = 0; n < 40 && !(await corrOf('ТЕСТОВЫЙ БОЛТ')); n++) await sleep(250);
check((await corrOf('ТЕСТОВЫЙ БОЛТ') || {}).market_price === 6 && (await corrOf('ТЕСТОВЫЙ БОЛТ')).source === SRC, 'the price memory has the price, and where it was applied from');
await page.close({ runBeforeUnload: true });             // the tab goes with the state unsent
await sleep(500);
check(await inState('ТЕСТОВЫЙ БОЛТ') === null, 'the saved application does not have it');
link.cutState = false;
const second = await computer();
let other = await tab(second.ctx, url);
await other.waitForFunction(() => S.Sync.corrReady && S.Sync.merged, null, { timeout: 15 * 1000 });
check(await market(other, 'ТЕСТОВЫЙ БОЛТ') === 6, 'on a computer that kept nothing, the price is in the table');
check(/записаны на сервер, но не попали в сохранённую заявку: 1/.test(await other.textContent('#toast')), 'and the page says where it came from');
await settled(other);
check(await inState('ТЕСТОВЫЙ БОЛТ') === 6, 'it is saved with the application now');
check((await corrOf('ТЕСТОВЫЙ БОЛТ')).source === SRC, 'and is still a price applied from a suggestion, not a typed one');
check(await market(other, 'ТЕСТОВЫЙ АНКЕР М5') === 15 && await market(other, 'ТЕСТОВЫЙ ШУРУП') === 3, 'nothing else in the table moved');

/* 4 — what must not come back */
console.log('-- what must not come back --');
// a price returned to the estimate's own while the price memory could not be told: the state is the newer word
link.cutBulk = true;
await type(other, 'ТЕСТОВЫЙ БОЛТ', null);
await other.evaluate(() => S.Sync.flush());
await other.waitForFunction(() => !S.Sync.dirty, null, { timeout: 15 * 1000 });
await other.evaluate(() => S.Sync.q);
check(await inState('ТЕСТОВЫЙ БОЛТ') === null && (await corrOf('ТЕСТОВЫЙ БОЛТ') || {}).market_price === 6, 'the application says «the estimate\'s own price»; the price memory still holds the old one');
await other.close();
link.cutBulk = false;
const third = await computer();
let late = await tab(third.ctx, url);
await late.waitForFunction(() => S.Sync.corrReady && S.Sync.merged, null, { timeout: 15 * 1000 });
check(await market(late, 'ТЕСТОВЫЙ БОЛТ') === 7, 'an older correction does not bring back a price that was taken back after it');
// something this browser held, and a later save from elsewhere
await late.close();
page = await tab(first.ctx, url);
link.cutState = true; link.cutBulk = true;
await type(page, 'ТЕСТОВЫЙ ЦЕМЕНТ', 20);
await sleep(200);
await page.close({ runBeforeUnload: true });
link.cutState = false; link.cutBulk = false;
await sleep(1100);
late = await tab(third.ctx, url);
await type(late, 'ТЕСТОВЫЙ ЦЕМЕНТ', 22);                  // saved from another computer, later
await settled(late);
await late.close();
page = await tab(first.ctx, url);
check(await market(page, 'ТЕСТОВЫЙ ЦЕМЕНТ') === 22, 'a price this browser held does not override one saved later from another computer');
check(Object.keys(await journal(page)).length === 0, 'and is dropped');

check(errors.length === 0, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
proxy.close();
if (proxy.closeAllConnections) proxy.closeAllConnections();
await pb.stop();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'close-tab OK');
process.exit(fail ? 1 : 0);
