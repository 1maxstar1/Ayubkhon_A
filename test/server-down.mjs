/*
 * The server stops answering while an application is open (E20).
 *
 * It used to show «!» and a toast for every failed save, every few seconds, and nothing about what to do. Now: one bar
 * that stays, which on the laptop says how to start the server again; the save mark says «⚠», never «✓»; the prices
 * typed meanwhile are kept in this browser; and when the server answers again everything waiting is saved, the bar
 * goes and the mark is «✓». Server mode, on invented estimates; the server is not stopped (that would leave a process
 * behind) — its answers are cut off at the page.
 *
 *   node test/server-down.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const { book, xlsx } = require('./compare-books.cjs');
const S = load(load.PIPELINE);

const dir = mkdtempSync(join(tmpdir(), 'srvdown-'));
const F1 = join(dir, 'first.xlsx');
writeFileSync(F1, xlsx(S, book(1)));

const pb = await startServer({ port: 8165, registry: true, build: true });
const { api, su } = pb;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = pb.rows().slice(0, 2);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pb.base + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await wait(700);
await page.fill('#loginCode', pb.lastCode('test@example.com'));
await page.click('#loginBtn');
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', number);
await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length === 1 && tr[0].textContent.includes(n); }, number);
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
await page.selectOption('#regionSel', 'fargona');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
await page.setInputFiles('#pick', F1);
await page.waitForFunction(() => window.app && S.Sync.ws && !S.Sync.loading && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
const saved = () => page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * 1000 });
await saved();
const wsId = await page.evaluate(() => S.Sync.ws.id);
const keys = await page.evaluate(() => app.model.resources.filter((r) => r.price > 4).slice(0, 2).map((r) => ({ key: r.key, price: r.price })));

/* the server stops answering */
let toasts = 0;
await page.exposeFunction('__toastSeen', () => { toasts++; });
await page.evaluate(() => { const t = app.toast; app.toast = function (m, err) { if (err && /Не сохранено|Правки не сохранены/.test(m)) window.__toastSeen(); return t.apply(this, arguments); }; });
const API = (u) => new URL(u).pathname.startsWith('/api/');
await page.route(API, (r) => r.abort('connectionrefused'));
await page.evaluate((k) => app.setPrice(k.key, k.price - 1), keys[0]);
await page.evaluate(() => S.Sync.touch());
await page.waitForSelector('#srvDown:not([hidden])', { timeout: 30 * 1000 }).catch(() => null);
check(await page.isVisible('#srvDown'), 'a server that does not answer is said in a bar that stays');
check(await page.evaluate(() => document.getElementById('wsSave').textContent) === '⚠', 'the save mark says «⚠», not «✓»');
await page.evaluate((k) => app.setPrice(k.key, k.price - 1), keys[1]);
await page.evaluate(() => S.Sync.touch());
await wait(20 * 1000);
check(toasts <= 1, `twenty seconds of failed saves: at most one message (${toasts}), not one per attempt`);
check(await page.evaluate((id) => { try { return Object.keys(JSON.parse(localStorage.getItem('smeta.wal.' + id) || '{}')).length; } catch (e) { return 0; } }, wsId) > 0,
  'the prices typed meanwhile are kept in this browser');
check(/проверьте сеть|не отвечает/.test(await page.textContent('#srvDown')), 'the bar says what to do');

/* it answers again */
await page.unroute(API);
await page.waitForSelector('#srvDown', { state: 'hidden', timeout: 30 * 1000 }).catch(() => null);
check(!(await page.isVisible('#srvDown')), 'when the server answers again the bar goes by itself');
await saved().catch(() => null);
check(await page.evaluate(() => document.getElementById('wsSave').textContent) === '✓', 'and everything waiting is saved: «✓»');
const w = await api('/api/collections/workspaces/records/' + wsId, {}, su);
check(keys.every((k) => w.state.prices2 && Math.abs(w.state.prices2[k.key] - (k.price - 1)) < 1e-6), 'both prices typed while it was down are on the server');

/* the laptop wording */
const laptopText = await page.evaluate(() => { S.Sync.offline = false; S.Auth = S.Auth || {}; const was = S.Auth.laptop; S.Auth.laptop = true;
  S.Sync.down(); const t = document.getElementById('srvDown').textContent; clearInterval(S.Sync.probe); S.Sync.probe = null; S.Sync.offline = false;
  document.getElementById('srvDown').hidden = true; S.Auth.laptop = was; return t; });
check(/laptop\.cmd/.test(laptopText) && /laptop\.sh/.test(laptopText), 'on the laptop it says how to start the server again');

await browser.close();
await pb.stop();
rmSync(dir, { recursive: true, force: true });
check(!errors.length, errors.length ? 'page errors: ' + errors.slice(0, 4).join('; ') : 'no page errors');
console.log(fail ? `FAILED (${fail})` : 'server-down OK');
process.exit(fail ? 1 : 0);
