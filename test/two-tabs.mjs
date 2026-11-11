/*
 * One application open in two tabs of one browser.
 *
 * Every save writes the whole state of the workspace, so the tab that saved last won: a price set in one tab
 * was wiped by the next save of the other, both showed a green «✓», and nothing said so until a reload. It
 * takes nobody's mistake — the launcher opens a new tab at every start.
 *
 * Held here: the newest tab is the one that works; the older one saves what it had not saved yet, stops, and
 * is covered by a notice with a way back; nothing typed in either is lost on the way; and the older tab can
 * take the application back with one press.
 *
 * The estimate is invented.
 *
 *   node test/two-tabs.mjs
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

const dir = mkdtempSync(join(tmpdir(), 'tabs-'));
const F1 = join(dir, 'first.xlsx');
writeFileSync(F1, xlsx(S, book(1)));

const PORT = 8125;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });     // one browser: the tabs share it
const errors = [];
const tab = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); return p; };

const A = await tab();
await A.goto(pb.base + '/');
await A.fill('#loginEmail', 'test@example.com');
await A.click('#loginBtn');
await A.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await A.fill('#loginCode', pb.lastCode('test@example.com'));
await A.click('#loginBtn');
await A.waitForSelector('#screen-list:not([hidden])');
await A.fill('#appQ', number);
await A.waitForFunction((n) => {
  const tr = document.querySelectorAll('#appTable tbody tr');
  return tr.length === 1 && tr[0].textContent.includes(n);
}, number);
await A.click('#appTable tbody tr button[data-act=open]');
await A.waitForSelector('#screen-region:not([hidden])');
await A.selectOption('#regionSel', 'fargona');
await A.click('#regionForm button[type=submit]');
await A.waitForSelector('#wsBox:not([hidden])');
await A.setInputFiles('#pick', F1);
await A.waitForFunction(() => app.projects.length === 1 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });

const wsId = await A.evaluate(() => S.Sync.ws.id);
const url = A.url();
const saved = (p) => p.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 20 * 1000 }).then(() => p.evaluate(() => S.Sync.q));
const keys = await A.evaluate(() => app.model.resources.filter((r) => r.price > 3).slice(0, 4).map((r) => ({ key: r.key, price: r.price })));
const setPrice = (p, i) => p.evaluate((k) => app.setPrice(k.key, k.price - 1), keys[i]);
const has = (p, i) => p.evaluate((k) => { const r = app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 1)) < 1e-6; }, keys[i]);
const onServer = async () => { const w = await api('/api/collections/workspaces/records/' + wsId, {}, su); return keys.map((k) => w.state.prices2 && w.state.prices2[k.key] === k.price - 1); };
const ready = (p) => p.waitForFunction(() => window.app && S.Sync.ws && app.projects.length === 1 && app.model && app.model.rows.length > 0 && !S.Sync.loading, null, { timeout: 30 * 1000 });
const covered = (p) => p.evaluate(() => { const f = document.getElementById('wsFrozen'); if (f.hidden) return false;
  const el = document.elementFromPoint(innerWidth / 2, 300); return f.contains(el) || !!el.closest('#wsFrozen'); });

await saved(A);
await setPrice(A, 0);
await saved(A);
check((await onServer())[0], 'tab A: a price is set and saved');

/* the same application is opened in a second tab */
const B = await tab();
await B.goto(url);
await ready(B);
await A.waitForFunction(() => S.Sync.frozen, null, { timeout: 10 * 1000 });
check(await covered(A), 'tab A is covered by a notice once the application is open in tab B');
check(/открыта в другой вкладке/.test(await A.textContent('#wsFrozen')), 'which says why');
check(await B.evaluate(() => !S.Sync.frozen) && await has(B, 0), 'tab B works, and has the price set in A');

/* the older tab can no longer wipe anything */
await setPrice(A, 1);                      // by script: the notice keeps a hand off the page, a script it cannot stop
await A.evaluate(() => { S.Sync.flush(); return S.Sync.saveNow(); });
await setPrice(B, 2);
await saved(B);
let srv = await onServer();
check(srv[0] && srv[2], 'tab B saves its price and keeps the one from A (' + JSON.stringify(srv) + ')');
check(!srv[1], 'nothing is written from the covered tab');

/* what the older tab had not saved yet when it was superseded is saved first, and the new tab gets it */
await setPrice(B, 3);                      // not waited for: still on its way when the third tab opens
const C = await tab();
await C.goto(url);
await ready(C);
await B.waitForFunction(() => S.Sync.frozen, null, { timeout: 10 * 1000 });
await C.waitForFunction((k) => { const r = window.app && app.model && app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 1)) < 1e-6; },
  keys[3], { timeout: 30 * 1000 });
srv = await onServer();
check(srv[3] && srv[2] && srv[0], 'a price typed in tab B a moment before tab C opened is on the server (' + JSON.stringify(srv) + ')');
check(await has(C, 3) && await has(C, 2) && await has(C, 0) && await C.evaluate(() => !S.Sync.frozen), 'and in tab C, which is the one that works now');

/* the older tab takes the application back with one press */
await A.click('#wsFrozenHere');
await ready(A);
await C.waitForFunction(() => S.Sync.frozen, null, { timeout: 10 * 1000 });
check(await A.evaluate(() => !S.Sync.frozen && document.getElementById('wsFrozen').hidden) && await has(A, 3) && await has(A, 2),
  '«Обновить и работать здесь» makes tab A the working one, with everything the others saved');
check(await covered(C), 'and tab C is the covered one now');
// a covered tab can go back to the list, without writing anything on the way
await C.click('#wsFrozenList');
await C.waitForSelector('#screen-list:not([hidden])');
check(await C.evaluate(() => !S.Sync.ws && document.getElementById('wsFrozen').hidden) && (await onServer()).filter(Boolean).length === 3,
  '«К списку заявок» leaves the covered tab and changes nothing on the server');

await browser.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'two-tabs OK');
process.exit(fail ? 1 : 0);
