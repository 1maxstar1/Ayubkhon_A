/*
 * What an application's saved state holds, and what happens when the server will not take it.
 *
 * The state used to carry every price that was ever touched — one typed and then taken back, every row of a
 * price book whether or not the application had such a resource — and carried it twice. A price book of thirty
 * thousand rows made a state larger than the server accepts; the page then sent the same six megabytes every
 * fifteen seconds for ever, nothing typed afterwards survived a reload, and the application could not be left.
 *
 * Held here: only prices that differ from the estimate's own are saved; a price taken back by hand stays taken
 * back; an unticked sheet keeps its prices; of a book's rows for resources the application does not have, a
 * limited number is kept and that is said; and a state the server refuses is not sent again and again, is
 * explained in words, and does not lock the application.
 *
 * The estimate and the book are invented.
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
const EST = join(dir, 'first.xlsx');
writeFileSync(EST, xlsx(S, book(1)));
// a price book of thirty thousand rows: three of them are this estimate's resources, one by name only
const rowsOfBook = [
  { name: 'ТЕСТОВЫЙ АНКЕР М5', unit: 'ШТ', smeta: 17, price: 15 },
  { name: 'ТЕСТОВЫЙ АНКЕР М8', unit: 'ШТ', smeta: 19, price: 16 },
  { name: 'ТЕСТОВЫЙ БОЛТ', unit: 'ШТ', smeta: 7, price: 7 },                    // its own price: nothing to keep
  { name: 'ТЕСТОВЫЙ ЦЕМЕНТ', unit: 'Т', price: 21 }                             // name only: every priced line of it
];
for (let i = 0; i < 30000; i++) rowsOfBook.push({ name: 'ПОСТОРОННИЙ РЕСУРС ИЗ ДРУГОГО ОБЪЕКТА НОМЕР ' + i, unit: 'ШТ', smeta: 1000 + i, price: 900 + i });
for (let i = 0; i < 5000; i++) rowsOfBook.push({ name: 'ПОСТОРОННИЙ РЕСУРС БЕЗ СМЕТНОЙ ЦЕНЫ НОМЕР ' + i, unit: 'КГ', price: 50 + i });
const BOOK = join(dir, 'book.json');
writeFileSync(BOOK, JSON.stringify(rowsOfBook));

const PORT = 8125;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => { if (!/^\[object Object\]$|ClientResponseError|состояние заявки/.test(e.message)) errors.push('pageerror: ' + e.message); });
page.on('dialog', (d) => d.accept());

// the saves of the state: counted, and — when told to — answered the way a server that will not take it answers
let saves = 0, refuse = false, biggest = 0;
await page.route('**/api/collections/workspaces/records/*', (route) => {
  const rq = route.request();
  const json = rq.method() === 'PATCH' && /json/.test(rq.headers()['content-type'] || '');
  if (json) { saves++; biggest = Math.max(biggest, (rq.postData() || '').length); }
  if (json && refuse) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ status: 400, message: 'Failed to update record.', data: { state: { code: 'validation_json_size_limit', message: 'Must be no more than 5242880 bytes.' } } }) });
  return route.continue();
});

await page.goto(pb.base + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
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
const wsId = await page.evaluate(() => S.Sync.ws.id);
const stored = async () => (await api('/api/collections/workspaces/records/' + wsId, {}, su));
const settled = async () => {
  await page.evaluate(() => S.Sync.flush());
  await page.waitForFunction(() => app.pending <= 0 && !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * 1000 });
  await page.evaluate(() => S.Sync.q);
};
const reopen = async () => {
  await page.reload();
  await page.waitForFunction(() => window.app && app.projects.length === 1 && app.pending <= 0 && app.model && app.model.rows.length > 0 && !S.Sync.loading, null, { timeout: 30 * 1000 });
};
const market = (name) => page.evaluate((n) => { const r = app.model.resources.find((x) => x.name === n); return r ? r.market : null; }, name);
const setPrice = (name, v) => page.evaluate(([n, val]) => { const r = app.model.resources.find((x) => x.name === n); app.setPrice(r.key, val == null ? r.price : val); }, [name, v]);
const keysOf = (map) => Object.keys(map || {});

await page.setInputFiles('#pick', EST);
await page.waitForFunction(() => app.projects.length === 1 && app.pending <= 0);
await settled();

/* 1 — only what differs from the estimate is kept */
console.log('-- typed, and taken back --');
await setPrice('ТЕСТОВЫЙ КРАН 10 Т', 11);
await setPrice('ТЕСТОВЫЙ ГВОЗДЬ', 4.5);
await setPrice('ТЕСТОВЫЙ ШУРУП', 2);
await setPrice('ТЕСТОВЫЙ ШУРУП', null);                 // Escape: back to the estimate's own price
await settled();
let st = (await stored()).state;
check(keysOf(st.prices2).length === 2, `three prices typed, one taken back: two are saved (${keysOf(st.prices2).length})`);
check(keysOf(st.prices).length === 2 && st.keys === 2, 'and the same two under the previous keying, for the way back to the previous version');
await reopen();
check(await market('ТЕСТОВЫЙ КРАН 10 Т') === 11 && await market('ТЕСТОВЫЙ ГВОЗДЬ') === 4.5 && await market('ТЕСТОВЫЙ ШУРУП') === 3,
  'after a reload: the two prices are there, the third is the estimate\'s own');

/* 2 — a price book far larger than the application */
console.log('-- a price book of thirty-five thousand rows --');
saves = 0; biggest = 0;
await page.setInputFiles('#bookInput', BOOK);
await page.waitForFunction(() => /Загружено цен: 35004/.test(document.getElementById('toast').textContent), null, { timeout: 30 * 1000 });
let t = await page.textContent('#toast');
check(/подошло к ресурсам загруженных смет: 4\b/.test(t), 'loading says how many of its rows found a resource here — four of thirty-five thousand');
await settled();
check(await market('ТЕСТОВЫЙ АНКЕР М5') === 15 && await market('ТЕСТОВЫЙ АНКЕР М8') === 16 && await market('ТЕСТОВЫЙ ЦЕМЕНТ') === 21, 'the rows that are this estimate\'s are applied');
const w = await stored();
st = w.state;
const size = JSON.stringify(st).length;
check(size < 1024 * 1024, `the saved state is ${(size / 1024).toFixed(0)} KB — not megabytes (the largest request: ${(biggest / 1024).toFixed(0)} KB)`);
const mine = keysOf(st.prices2).filter((k) => !/ПОСТОРОНН/.test(k)).length, spare = keysOf(st.prices2).filter((k) => /ПОСТОРОНН/.test(k)).length;
check(mine === 5, `it holds the application's own changed prices — five (${mine})`);
check(spare === 2000, `and two thousand of the book's rows for resources that are not here, not thirty thousand (${spare})`);
check(keysOf(st.looseBook).length === 2001 && keysOf(st.looseBook).some((k) => /ЦЕМЕНТ/.test(k)), `of the name-only rows: the one that is here and two thousand others (${keysOf(st.looseBook).length})`);
check(/сохраняются не все цены из книги цен: 31000 /.test(await page.textContent('#toast')), 'that some were not kept is said, with the number');
check(await page.textContent('#wsSave') === '✓', 'and the application is saved');
await reopen();
check(await market('ТЕСТОВЫЙ АНКЕР М5') === 15 && await market('ТЕСТОВЫЙ ЦЕМЕНТ') === 21 && await market('ТЕСТОВЫЙ КРАН 10 Т') === 11, 'after a reload every price is there');

/* 3 — taken back by hand stays taken back, even where a book names the resource */
console.log('-- a book price taken back --');
await setPrice('ТЕСТОВЫЙ ЦЕМЕНТ', null);
await settled();
await reopen();
check(await market('ТЕСТОВЫЙ ЦЕМЕНТ') === 23, 'the name-only book row does not come back over a price returned to the estimate\'s own');

/* 4 — an unticked sheet keeps its prices */
console.log('-- a sheet that is unticked --');
await setPrice('ТЕСТОВЫЙ ЩИТ', 25);
await settled();
await page.click('#projects li[data-o="1"] input[data-act=obj-on]');
await page.waitForFunction(() => !app.model.resources.some((r) => r.name === 'ТЕСТОВЫЙ ЩИТ'));
await setPrice('ТЕСТОВЫЙ БОЛТ', 6);                      // any change, so that the state is saved without that sheet on screen
await settled();
await reopen();
check(await market('ТЕСТОВЫЙ ЩИТ') === null, 'the sheet is still unticked after a reload');
await page.click('#projects li[data-o="1"] input[data-act=obj-on]');
await page.waitForFunction(() => app.model.resources.some((r) => r.name === 'ТЕСТОВЫЙ ЩИТ'));
check(await market('ТЕСТОВЫЙ ЩИТ') === 25, 'ticked again, its price is the one that was set');
await settled();

/* 5 — a state the server will not take */
console.log('-- the server refuses the state --');
refuse = true; saves = 0;
await setPrice('ТЕСТОВЫЙ ДЮБЕЛЬ', 0.5);
await page.waitForFunction(() => /сервер не принял состояние заявки/.test(document.getElementById('toast').textContent), null, { timeout: 15 * 1000 });
t = await page.textContent('#toast');
check(/Must be no more than|state/.test(t) && /при следующем изменении/.test(t), 'it is said in words, with the server\'s reason, and when it will be tried again');
check(await page.textContent('#wsSave') === '!', 'the mark does not say «saved»');
const after = saves;
await new Promise((r) => setTimeout(r, 17 * 1000));
check(saves === after, `the same request is not sent again by itself (${saves - after} more in 17 s)`);
await setPrice('ТЕСТОВАЯ ДОСКА', 1.5);
await new Promise((r) => setTimeout(r, 2500));
check(saves === after + 1, 'the next change tries once more');
// leaving asks, and lets go
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])', { timeout: 15 * 1000 });
check(await page.evaluate(() => !S.Sync.ws), 'the application can be left: the page asks, and closes it');
refuse = false;

/* 6 — a state that is too large is not sent at all */
console.log('-- a state larger than the server takes --');
await page.fill('#appQ', number);
await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length === 1 && tr[0].textContent.includes(n); }, number);
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForFunction(() => window.app && app.projects.length === 1 && app.pending <= 0 && S.Sync.ws && !S.Sync.loading, null, { timeout: 30 * 1000 });
saves = 0;
await page.evaluate(() => { app.opts.noteText = 'ж'.repeat(3 * 1024 * 1024); app.saveOpts(); });       // six megabytes as the server counts them
await page.waitForFunction(() => /состояние заявки занимает \d+[.,]\d МБ, сервер принимает до 5 МБ/.test(document.getElementById('toast').textContent), null, { timeout: 15 * 1000 });
await new Promise((r) => setTimeout(r, 2500));
check(saves === 0, 'the page says how large it is and what the server takes, and sends nothing');
await page.evaluate(() => { app.opts.noteText = 'Пересмотреть'; app.saveOpts(); });
await settled();
check((await stored()).state.opts.noteText === 'Пересмотреть', 'made smaller, it is saved');

check(errors.length === 0, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
await pb.stop();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'state-size OK');
process.exit(fail ? 1 : 0);
