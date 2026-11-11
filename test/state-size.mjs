/*
 * The saved state of an application stays a size the server takes.
 *
 * The server takes a state of 5 MB and no more. One estimate is a fiftieth of that; a price book is not: every
 * line of a loaded book went into the state — twice, under the new key and the old — whether or not the
 * estimates had such a resource. A book of thirty thousand lines made a state the server refused, the page
 * sent the same request again every fifteen seconds for good, every price typed afterwards was gone on the
 * next reload, and the application could not even be left. «Сбросить» made nothing smaller: a price put back
 * to the estimate's own stayed in the state.
 *
 * Held here:
 *   - only a price that differs from the estimate's own is saved; put back, it leaves the state;
 *   - the price of a sheet unticked for a while stays;
 *   - a book of thirty thousand lines is saved: the lines the estimates use as prices, the rest apart and as
 *     many as fit, and the page says how many did not; in this sitting the whole book goes on working;
 *   - a state the server refuses is not sent again and again, the page says why in words, the next change
 *     tries again, and the application can be left.
 *
 * The estimates and the book are invented.
 *
 *   node test/state-size.mjs
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

const dir = mkdtempSync(join(tmpdir(), 'statesize-'));
const F1 = join(dir, 'first.xlsx'), F2 = join(dir, 'second.xlsx');
writeFileSync(F1, xlsx(S, book(1)));
writeFileSync(F2, xlsx(S, book(2)));

// the book: three lines for resources of the first estimate, two for resources only the second has (one given
// for its estimate price, one by name alone), and thirty thousand for resources nobody has
const LINES = 30 * 1000;
const entries = [
  { name: 'ТЕСТОВЫЙ АНКЕР М8', unit: 'ШТ', smeta: 19, price: 16 },
  { name: 'ТЕСТОВЫЙ БОЛТ', unit: 'ШТ', smeta: 7, price: 6 },
  { name: 'ТЕСТОВЫЙ ЦЕМЕНТ', unit: 'Т', price: 21 },
  { name: 'ТЕСТОВЫЙ КЛЕЙ', unit: 'КГ', smeta: 9, price: 12 },
  { name: 'ТЕСТОВАЯ ПЛЁНКА 0,2 ММ', unit: 'М2', price: 5 }
];
for (let i = 0; i < LINES; i++) {
  const e = { name: 'КНИЖНАЯ ПОЗИЦИЯ, КОТОРОЙ НЕТ НИ В ОДНОЙ СМЕТЕ, С ДЛИННЫМ НАЗВАНИЕМ И МАРКОЙ № ' + i, unit: 'ШТ', price: 100 + i };
  if (i % 2) e.smeta = 90 + i;
  entries.push(e);
}
const BOOK = join(dir, 'book.json');
writeFileSync(BOOK, JSON.stringify(entries));

const PORT = 8153;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

// state saves are counted, with what the server said; and the server can be made to refuse them
let saves = [], refuse = false;
await page.route('**/api/collections/workspaces/records/*', async (route) => {
  const rq = route.request();
  if (rq.method() !== 'PATCH' || !/json/.test(rq.headers()['content-type'] || '')) return route.continue();
  if (refuse) {
    saves.push(400);
    return route.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ status: 400, message: 'Failed to update record.', data: { state: { code: 'validation_json_size_limit', message: 'too large' } } }) });
  }
  const r = await route.fetch();
  saves.push(r.status());
  return route.fulfill({ response: r });
});

await page.goto(pb.base + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await wait(700);
await page.fill('#loginCode', pb.lastCode('test@example.com'));
await page.click('#loginBtn');
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
await page.waitForFunction(() => app.projects.length === 1 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
const wsId = await page.evaluate(() => S.Sync.ws.id);
const stored = () => api('/api/collections/workspaces/records/' + wsId, {}, su);
const saved = () => page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * 1000 }).then(() => page.evaluate(() => S.Sync.q));
const mark = () => page.textContent('#wsSave');
const toast = async () => (await page.textContent('#toast')).replace(/\s+/g, ' ');
await saved();

/* only a price that differs from the estimate's own is saved */
const two = await page.evaluate(() => app.model.resources.filter((r) => r.price > 4).slice(0, 3).map((r) => ({ key: r.key, price: r.price })));
await page.evaluate((k) => {
  app.setPrice(k[0].key, k[0].price - 1); app.setPrice(k[2].key, k[2].price - 1);
  app.setPrice(k[1].key, k[1].price - 1); app.setPrice(k[1].key, k[1].price);
}, two);
await saved();
let st = (await stored()).state;
check(st.prices2[two[0].key] === two[0].price - 1, 'a changed price is in the saved state');
check(!(two[1].key in st.prices2), 'a price put back to the estimate\'s own is not');
check(Object.keys(st.prices).length === Object.keys(st.prices2).length, 'the copy under the old keys carries the same prices (' + Object.keys(st.prices).length + ')');
page.once('dialog', (d) => d.accept());
await page.click('#resetBtn');
await saved();
st = (await stored()).state;
check(Object.keys(st.prices2).length === 0 && Object.keys(st.prices).length === 0, '«Сбросить» leaves the saved state without prices (' + Object.keys(st.prices2).length + ')');

/* the price of a sheet unticked for a while stays */
const only2 = await page.evaluate(() => {
  const all = new Set(app.model.resources.map((r) => r.key));
  app.projects[0].objects[1].enabled = false; app.rebuild();
  const left = new Set(app.model.resources.map((r) => r.key));
  app.projects[0].objects[1].enabled = true; app.rebuild();
  const r = app.model.resources.find((x) => all.has(x.key) && !left.has(x.key));
  return { key: r.key, price: r.price };
});
await page.evaluate((k) => app.setPrice(k.key, k.price - 2), only2);
await saved();
await page.click('#projects .proj input[data-act=obj-on] >> nth=1');
await page.waitForFunction((k) => !app.model.resources.some((r) => r.key === k.key), only2);
await saved();
st = (await stored()).state;
check(st.prices2[only2.key] === only2.price - 2, 'a sheet is unticked: the price of its resource stays in the saved state');
await page.click('#projects .proj input[data-act=obj-on] >> nth=1');
await page.waitForFunction((k) => app.model.resources.some((r) => r.key === k.key && Math.abs(r.market - (k.price - 2)) < 1e-6), only2);
check(true, 'ticked again, the resource has its price');
await saved();

/* a book of thirty thousand lines */
saves = [];
await page.setInputFiles('#bookInput', BOOK);
await page.waitForFunction((n) => document.getElementById('toast').textContent.includes('Загружено цен: ' + n), entries.length, { timeout: 60 * 1000 });
await saved().catch(() => { /* said by the checks */ });
check(await mark() === '✓' && saves.length > 0 && saves.every((s) => s === 200), 'the application is saved with the book loaded (' + saves.join(',') + ', mark ' + await mark() + ')');
const w = await stored();
st = w.state;
const bytes = Buffer.byteLength(JSON.stringify(st));
check(bytes < 5 * 1024 * 1024, 'its state is ' + (bytes / 1024 / 1024).toFixed(2) + ' MB — under what the server takes');
const priced = await page.evaluate(() => app.model.resources.filter((r) => !S.near(r.price, r.market)).map((r) => r.name + '=' + r.market).sort().join('; '));
check(/АНКЕР М8=16/.test(priced) && /БОЛТ=6/.test(priced) && /ЦЕМЕНТ=21/.test(priced), 'the book\'s lines for resources of the estimate are prices (' + priced + ')');
check(Object.keys(st.prices2).length <= 6, 'the saved prices are the estimate\'s own — ' + Object.keys(st.prices2).length + ', not the book\'s ' + entries.length);
const keptLines = Object.keys(st.book || {}).length + Object.keys(st.looseBook || {}).length;
check(keptLines > 1000 && keptLines < entries.length, 'the lines that answer to nothing are saved apart, as many as fit (' + keptLines + ' of ' + (entries.length - 3) + ')');
const said = await toast();
const m = /Книга цен велика для заявки: (\d+) её строк/.exec(said);
check(!!m && +m[1] + keptLines === entries.length - 3 + 1, 'and the page says how many were not saved (' + (m ? m[1] : said.slice(-120)) + ')');
// in this sitting the whole book works: an estimate added now is priced from it
await page.setInputFiles('#pick', F2);
await page.waitForFunction(() => app.projects.length === 2 && app.pending === 0 && app.model, null, { timeout: 30 * 1000 });
const later = await page.evaluate(() => app.model.resources.filter((r) => /КЛЕЙ|ПЛЁНКА 0,2/.test(r.name)).map((r) => r.name + '=' + r.market).sort().join('; '));
check(/КЛЕЙ=12/.test(later) && /ПЛЁНКА 0,2 ММ=5/.test(later), 'an estimate added afterwards is priced from the book (' + later + ')');
await saved();
// and after a reload the prices and the first lines of the book are there
await page.reload();
await page.waitForFunction(() => window.app && app.projects.length === 2 && app.model && !S.Sync.loading, null, { timeout: 30 * 1000 });
const again = await page.evaluate(() => app.model.resources.filter((r) => !S.near(r.price, r.market)).map((r) => r.name + '=' + r.market).sort().join('; '));
check(/АНКЕР М8=16/.test(again) && /КЛЕЙ=12/.test(again) && /ПЛЁНКА 0,2 ММ=5/.test(again), 'after a reload the prices are as they were');
await saved();

/* a state the server refuses */
await page.evaluate(() => { S.Sync.saveRetry = 1500; });
refuse = true; saves = [];
await page.evaluate((k) => app.setPrice(k.key, k.price - 3), two[0]);
await page.waitForFunction(() => document.getElementById('wsSave').textContent === '!', null, { timeout: 15 * 1000 });
await wait(4000);
check(saves.length === 1, 'refused by the server, the same state is not sent again and again (' + saves.length + ' in four seconds, with the retry at 1.5)');
const why = await toast();
check(/Заявка не сохранена: сервер не принимает её данные \(объём данных заявки больше допустимого\)/.test(why), 'the page says why, in words');
await page.evaluate((k) => app.setPrice(k.key, k.price - 4), two[0]);
await page.waitForFunction(() => S.Sync.q.then(() => true));
for (let i = 0; i < 30 && saves.length < 2; i++) await wait(200);
check(saves.length === 2, 'the next change is the next attempt');
let asked = '';
page.once('dialog', (d) => { asked = d.message(); d.accept(); });
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])', { timeout: 15 * 1000 }).catch(() => { /* said by the check */ });
check(/Заявка не сохраняется/.test(asked) && await page.evaluate(() => !S.Sync.ws), 'and the application can be left: the page asks, and goes');
// what was typed is not lost with it: opened again, with the server taking states, the price comes back
refuse = false;
await page.fill('#appQ', number);
await page.waitForFunction((n) => {
  const tr = document.querySelectorAll('#appTable tbody tr');
  return tr.length === 1 && tr[0].textContent.includes(n);
}, number);
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForFunction(() => window.app && S.Sync.ws && !S.Sync.loading && app.projects.length === 2 && app.model, null, { timeout: 30 * 1000 });
await page.waitForFunction((k) => { const r = app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 4)) < 1e-6; }, two[0], { timeout: 15 * 1000 })
  .catch(() => { /* said by the check */ });
check(await page.evaluate((k) => { const r = app.model.resources.find((x) => x.key === k.key); return !!r && Math.abs(r.market - (k.price - 4)) < 1e-6; }, two[0]),
  'opened again, the price the server would not take inside the state is back in the table');
await saved();
check((await stored()).state.prices2[two[0].key] === two[0].price - 4, 'and saved');

await browser.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'state-size OK');
process.exit(fail ? 1 : 0);
