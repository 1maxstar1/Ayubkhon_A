/*
 * «Книга цен»: the prices of one project saved to a file and loaded into the next.
 *
 * It is how prices are carried from project to project by a person who does not use the server, and it had no
 * test at all: `savePriceBook`, `loadPriceBook` and the reading of a price list from a spreadsheet were
 * exercised only by hand. Held here, in the single-file program, on invented estimates:
 *
 *   - nothing changed: nothing to save, said in words, and no file;
 *   - the saved book has one line per changed resource, with the estimate price it belongs to;
 *   - loaded back, each line lands on exactly its own line of the estimate — and on nothing else;
 *   - a line without an estimate price (an older book, a hand-made list) prices every variant of the name;
 *   - a price list kept as a spreadsheet is read by its header (name, unit, price);
 *   - a book loaded before the estimates prices them when they arrive;
 *   - a file that is no book is refused in words and changes nothing.
 *
 *   node test/price-book.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchOpts } from './chromium.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const synth = require('./synth.cjs');
const { xlsx } = require('./compare-books.cjs');
const S = load(load.PIPELINE);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'pricebook-'));
const F1 = synth.write(S, join(dir, 'first.xlsx'), 1), F2 = synth.write(S, join(dir, 'second.xlsx'), 2);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const errors = [];

const browser = await chromium.launch(launchOpts);
const open = async () => {
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  return p;
};
const loaded = (p, n) => p.waitForFunction((k) => window.app && app.pending === 0 && app.projects.length === k && app.model && app.model.rows.length > 0, n, { timeout: 60 * 1000 });
const toast = async (p) => (await p.textContent('#toast')).replace(/\s+/g, ' ').trim();
const changed = (p) => p.evaluate(() => app.model.resources.filter((r) => !S.near(r.price, r.market)).map((r) => ({ name: r.name, unit: r.unit, price: r.price, market: r.market })));
const bookIn = async (p, file, said) => {
  await p.setInputFiles('#bookInput', file);
  await p.waitForFunction((re) => new RegExp(re).test(document.getElementById('toast').textContent), said, { timeout: 15 * 1000 }).catch(() => { /* said by the check */ });
};

const page = await open();
await page.setInputFiles('#pick', [F1, F2]);
await loaded(page, 2);

/* nothing changed: nothing to save */
let got = null;
page.on('download', (d) => { got = d; });
await page.click('#saveBook');
await page.waitForTimeout(500);
check(got === null && /Ни одна цена ещё не изменена/.test(await toast(page)), 'with no price changed there is nothing to save, and the page says so');

/* three prices — one of them a name the two estimates carry at two prices */
const pick = await page.evaluate(() => {
  const rs = app.model.resources;
  const byName = {};
  rs.forEach((r) => { (byName[r.nk] = byName[r.nk] || []).push(r); });
  const twin = Object.keys(byName).map((k) => byName[k]).find((a) => a.length === 2 && a[0].price > 1000);
  const single = rs.filter((r) => byName[r.nk].length === 1 && r.price > 1000).slice(0, 2);
  return { twin: twin.map((r) => ({ key: r.key, name: r.name, unit: r.unit, price: r.price })), single: single.map((r) => ({ key: r.key, name: r.name, unit: r.unit, price: r.price })) };
});
check(pick.twin.length === 2 && pick.single.length === 2, 'the estimates have a resource at two prices, and resources at one');
await page.evaluate((p) => {
  app.setPrice(p.single[0].key, p.single[0].price - 100);
  app.setPrice(p.single[1].key, p.single[1].price + 0.5);
  app.setPrice(p.twin[0].key, p.twin[0].price - 7);
}, pick);
const dl = page.waitForEvent('download', { timeout: 15 * 1000 });
await page.click('#saveBook');
const file = await dl;
const BOOK = join(dir, 'narx_kitobi.json');
await file.saveAs(BOOK);
const book = JSON.parse(readFileSync(BOOK, 'utf8'));
check(file.suggestedFilename() === 'narx_kitobi.json' && /Сохранено цен: 3/.test(await toast(page)), 'the book is saved as a file, and the page says how many prices');
check(Array.isArray(book) && book.length === 3 && book.every((e) => e.name && e.price > 0 && e.smeta > 0),
  'one line per changed resource, each with its price and the estimate price it belongs to');
const twinLine = book.find((e) => e.name === pick.twin[0].name);
check(twinLine && twinLine.smeta === pick.twin[0].price && twinLine.price === pick.twin[0].price - 7 && book.filter((e) => e.name === pick.twin[0].name).length === 1,
  'of the resource at two prices only the changed one is in it');

/* loaded back into a fresh page */
const p2 = await open();
await p2.setInputFiles('#pick', [F1, F2]);
await loaded(p2, 2);
await bookIn(p2, BOOK, 'Загружено цен: 3');
let now = await changed(p2);
check(/Загружено цен: 3/.test(await toast(p2)) && now.length === 3, `loaded back: three prices, three resources changed (${now.length})`);
check(now.some((r) => r.name === pick.single[1].name && Math.abs(r.market - (pick.single[1].price + 0.5)) < 1e-9), 'a price with a fraction comes back as it was');
check(now.some((r) => r.name === pick.twin[0].name && r.price === pick.twin[0].price && r.market === pick.twin[0].price - 7) &&
  !now.some((r) => r.name === pick.twin[1].name && r.price === pick.twin[1].price),
  'the line of the resource at two prices lands on its own estimate price, and not on the other');

/* a line without an estimate price prices every variant of the name */
const OLD = join(dir, 'old-book.json');
writeFileSync(OLD, JSON.stringify([{ name: pick.twin[0].name, unit: pick.twin[0].unit, price: 999 }]));
const p3 = await open();
await p3.setInputFiles('#pick', [F1, F2]);
await loaded(p3, 2);
await bookIn(p3, OLD, 'Загружено цен: 1');
now = await changed(p3);
check(now.length === 2 && now.every((r) => r.name === pick.twin[0].name && r.market === 999), 'a line with no estimate price is put on both variants of the name');

/* a price list kept as a spreadsheet */
const LIST = join(dir, 'list.xlsx');
writeFileSync(LIST, xlsx(S, { sheets: [{ name: 'Цены', rows: [undefined,
  [undefined, { v: 'Прайс-лист тестового поставщика' }],
  [],
  [undefined, { v: '№' }, { v: 'Наименование' }, { v: 'Ед. изм.' }, { v: 'Цена' }],
  [undefined, { v: 1 }, { v: pick.single[0].name }, { v: pick.single[0].unit }, { v: 777 }],
  [undefined, { v: 2 }, { v: pick.single[1].name }, { v: pick.single[1].unit }, { v: '1 234,5' }],
  [undefined, { v: 3 }, { v: 'ПОЗИЦИЯ БЕЗ ЦЕНЫ' }, { v: 'ШТ' }],
  [undefined, { v: '' }, { v: 'Итого' }, { v: '' }, { v: 'договорная' }]
] }] }));
const p4 = await open();
await p4.setInputFiles('#pick', [F1]);
await loaded(p4, 1);
await bookIn(p4, LIST, 'Загружено цен: 2');
now = await changed(p4);
check(/Загружено цен: 2/.test(await toast(p4)), 'a spreadsheet price list is read by its header; lines without a number are left out');
check(now.length === 2 && now.some((r) => r.name === pick.single[0].name && r.market === 777) &&
  now.some((r) => r.name === pick.single[1].name && Math.abs(r.market - 1234.5) < 1e-9),
  'its prices are on the resources, a price typed as «1 234,5» among them');

/* a file that is no book */
const NOLIST = join(dir, 'no-list.xlsx');
writeFileSync(NOLIST, xlsx(S, { sheets: [{ name: 'Лист1', rows: [undefined, [undefined, { v: 'Заметки' }], [undefined, { v: 'ничего похожего на цены' }]] }] }));
const before = JSON.stringify(await changed(p4));
await bookIn(p4, NOLIST, 'Не удалось прочитать книгу цен');
check(/Не удалось прочитать книгу цен: .*столбцы цен не найдены/.test(await toast(p4)) && JSON.stringify(await changed(p4)) === before,
  'a spreadsheet with no price columns is refused in words and changes nothing');
const NOTLIST = join(dir, 'not-a-list.json');
writeFileSync(NOTLIST, JSON.stringify({ name: 'x', price: 1 }));
await bookIn(p4, NOTLIST, 'Книга цен должна быть списком');
check(/Книга цен должна быть списком/.test(await toast(p4)) && JSON.stringify(await changed(p4)) === before, 'so is a file that is not a list');

/* the book first, the estimates after */
const p5 = await open();
await bookIn(p5, BOOK, 'Загружено цен: 3');
check(/Загружено цен: 3/.test(await toast(p5)), 'a book can be loaded before any estimate');
await p5.setInputFiles('#pick', [F1, F2]);
await loaded(p5, 2);
now = await changed(p5);
check(now.length === 3 && now.some((r) => r.name === pick.twin[0].name && r.price === pick.twin[0].price && r.market === pick.twin[0].price - 7),
  `and the estimates are priced from it when they arrive (${now.length} resources)`);

await browser.close();
rmSync(dir, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'price-book OK');
process.exit(fail ? 1 : 0);
