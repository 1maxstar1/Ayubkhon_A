/*
 * The last price typed, and a tab that is closed straight after.
 *
 * A price goes to the server twice: as a correction (the memory other projects are offered prices from) and
 * inside the application's saved state (what the table and the document are built from). The two requests
 * used to go one after the other, the second only when the first had been answered. On this machine the
 * answer takes a few milliseconds and nothing was ever lost; over a slow link a tab closed a third of a
 * second after the price was typed sent the correction and never the state: after reopening, the price was
 * in neither the table nor the document, and was still offered to other projects as «an expert's price».
 *
 * Held here, each by itself:
 *   1. on leaving, both requests go at once — the state arrives although nothing has answered yet;
 *   2. a correction this application wrote after its state was last saved is put back into the table;
 *   3. a price neither request carried is kept in this browser and put back the next time the application
 *      is opened here — and a kept price that the server's state is already newer than is not.
 *
 * The link is made slow, and cut, by a small relay in front of the test server: a page that is gone cannot
 * hold its own requests back. The estimate is invented.
 *
 *   node test/close-tab.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const { book, xlsx } = require('./compare-books.cjs');
const S = load(load.PIPELINE);

const dir = mkdtempSync(join(tmpdir(), 'closetab-'));
const F1 = join(dir, 'first.xlsx');
writeFileSync(F1, xlsx(S, book(1)));

const PORT = 8151, RELAY = 8152;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

/* the relay: answers to writes can be held back, and either kind of write refused before it reaches the server */
const link = { delay: 0, noState: false, noCorr: false };
const relay = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const write = req.method !== 'GET' && req.method !== 'HEAD';
    const state = req.method === 'PATCH' && /\/api\/collections\/workspaces\/records\//.test(req.url) && /json/.test(req.headers['content-type'] || '');
    const corr = req.method === 'POST' && req.url.startsWith('/api/corrections/bulk');
    if ((state && link.noState) || (corr && link.noCorr)) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{"message":"the link is down"}');
      return;
    }
    const up = http.request({ host: '127.0.0.1', port: PORT, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:' + PORT } }, (ur) => {
      const send = () => { try { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); } catch (e) { /* the page has gone */ } };
      if (write && link.delay) setTimeout(send, link.delay); else send();
    });
    up.on('error', () => { try { res.writeHead(502); res.end(); } catch (e) { /* gone */ } });
    res.on('close', () => up.destroy());
    up.end(Buffer.concat(chunks));
  });
});
await new Promise((r) => relay.listen(RELAY, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + RELAY;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const errors = [];
const context = () => browser.newContext({ viewport: { width: 1300, height: 850 } });
const tab = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); return p; };
const signIn = async (p, to) => {
  await p.goto(to || base + '/');
  await p.fill('#loginEmail', 'test@example.com');
  await p.click('#loginBtn');
  await p.waitForSelector('#codeBox:not([hidden])');
  await wait(700);
  await p.fill('#loginCode', pb.lastCode('test@example.com'));
  await p.click('#loginBtn');
};
const ready = (p) => p.waitForFunction(() => window.app && window.S && S.Sync.ws && !S.Sync.loading && app.projects.length === 1 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
const saved = (p) => p.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 20 * 1000 }).then(() => p.evaluate(() => S.Sync.q));

const ctx = await context();
let page = await tab(ctx);
await signIn(page);
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', number);
await page.waitForFunction((n) => {
  const tr = document.querySelectorAll('#appTable tbody tr');
  return tr.length === 1 && tr[0].textContent.includes(n);
}, number);
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
await page.selectOption('#regionSel', 'fargona');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
await page.setInputFiles('#pick', F1);
await ready(page);
await saved(page);
const wsId = await page.evaluate(() => S.Sync.ws.id);
const url = page.url();
const keys = await page.evaluate(() => app.model.resources.filter((r) => r.price > 4).slice(0, 4).map((r) => ({ key: r.key, price: r.price })));
const stored = () => api('/api/collections/workspaces/records/' + wsId, {}, su);
const inState = async (i) => { const w = await stored(); const v = w.state.prices2 && w.state.prices2[keys[i].key]; return v != null && Math.abs(v - (keys[i].price - 1)) < 1e-6; };
const corrections = () => pb.count('corrections', `workspace='${wsId}'`);
const typed = (p, i) => p.evaluate((k) => app.setPrice(k.key, k.price - 1), keys[i]);
const shown = (p, i) => p.evaluate((k) => { const r = app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 1)) < 1e-6; }, keys[i]);
const kept = (p) => p.evaluate((id) => { try { return Object.keys(JSON.parse(localStorage.getItem('smeta.wal.' + id) || '{}')).length; } catch (e) { return -1; } }, wsId);

/* 1 — a slow link, and the tab is closed a third of a second after the price is typed */
link.delay = 1500;
await typed(page, 0);
await wait(300);
await page.close({ runBeforeUnload: true });
await wait(2500);
link.delay = 0;
check(await corrections() === 1, 'the correction reached the server (' + await corrections() + ')');
check(await inState(0), 'and so did the state: both were sent at once, not the second after the first was answered');

/* 2 — the state never arrives; the correction does. Opened in another browser, the price is in the table */
page = await tab(ctx);
await page.goto(url);
await ready(page);
check(await shown(page, 0), 'reopened: the price typed before the tab was closed is in the table');
await saved(page);
link.noState = true;
await typed(page, 1);
await page.evaluate(() => S.Sync.flush());
await page.waitForFunction(() => S.Sync.q.then(() => true));
for (let i = 0; i < 20 && await corrections() < 2; i++) await wait(200);
check(await corrections() === 2 && !(await inState(1)), 'the link takes corrections and not the state: the price is a correction, and not in the saved state');
await page.close();
link.noState = false;
const other = await context();                 // nothing of this browser's own is there
let p2 = await tab(other);
await signIn(p2, url);
await ready(p2);
await p2.waitForFunction((k) => { const r = app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 1)) < 1e-6; }, keys[1], { timeout: 15 * 1000 })
  .catch(() => { /* said by the check */ });
check(await shown(p2, 1), 'in another browser the price is put back from the application\'s own correction');
check(/Восстановлен/.test(await p2.textContent('#toast')), 'and the page says so (' + (await p2.textContent('#toast')).replace(/\s+/g, ' ').trim().slice(0, 80) + '…)');
await saved(p2);
check(await inState(1), 'the state is saved with it');
check(await shown(p2, 0) && await p2.evaluate((ks) => ks.slice(2).every((k) => { const r = app.model.resources.find((x) => x.key === k.key); return r && Math.abs(r.market - k.price) < 1e-6; }), keys),
  'no other price is touched');
await p2.close();
await other.close();

/* 3 — neither request arrives, and the tab goes without a word: the price is kept in this browser */
page = await tab(ctx);
await page.goto(url);
await ready(page);
await saved(page);
check(await kept(page) === 0, 'with everything saved, nothing is held back in the browser');
link.noState = link.noCorr = true;
await typed(page, 2);
await wait(200);
check(await kept(page) === 1, 'a price is kept in the browser the moment it is set');
await page.close();
check(!(await inState(2)) && await corrections() === 2, 'nothing of it reached the server');
link.noState = link.noCorr = false;
page = await tab(ctx);
await page.goto(url);
await ready(page);
await page.waitForFunction((k) => { const r = app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 1)) < 1e-6; }, keys[2], { timeout: 15 * 1000 })
  .catch(() => { /* said by the check */ });
check(await shown(page, 2), 'opened here again: the price is back in the table');
check(/Восстановлен/.test(await page.textContent('#toast')), 'and the page says so');
await saved(page);
for (let i = 0; i < 20 && await corrections() < 3; i++) await wait(200);
check(await inState(2) && await corrections() === 3, 'it is saved: in the state and as a correction');
check(await kept(page) === 0, 'and what was kept is let go once the server has it');

/* a kept price older than what the server holds is not put over it */
await page.evaluate(({ id, k }) => {
  const old = {}; old[k.key] = { v: k.price + 5, t: Date.now() - 3600 * 1000, n: 1 };
  localStorage.setItem('smeta.wal.' + id, JSON.stringify(old));
}, { id: wsId, k: keys[0] });
await page.reload();
await ready(page);
await wait(600);
check(await shown(page, 0) && await kept(page) === 0, 'a kept price the saved state is newer than is dropped, not applied');

await browser.close();
relay.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'close-tab OK');
process.exit(fail ? 1 : 0);
