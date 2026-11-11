/*
 * A price as a person types it.
 *
 * The estimates are read through S.num, which is strict on purpose and is not changed here. The same function
 * was also behind the price field, where it met what people type and paste: «1,234.56», «1.234,56», a minus
 * that is not the keyboard's. To those it answered «not a number» — and the field then put the estimate's own
 * price back without a word: the expert typed, the field showed the old price, nothing said why.
 *
 * Held here: what is read and how (S.typed); S.num answers exactly as it did; text that is not a number changes
 * nothing, frames the field in red and is said on leaving it; an emptied field still means «the estimate's
 * price»; a number that reads two ways is taken as before, with the other reading one press away.
 *
 * The estimate is invented.
 *
 *   node test/typed-price.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchOpts } from './chromium.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const { book, xlsx } = require('./compare-books.cjs');
const S = load(load.PIPELINE);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/* ------------------------------------------------------------------ the reading */
console.log('-- what is read --');
const NO = null;
// text → [value, the other reading]
const TABLE = [
  ['120000', 120000], ['120 000', 120000], ['120 000', 120000], ['120 000', 120000], ["120'000", 120000],
  ['1234,56', 1234.56], ['1234.56', 1234.56], ['1 234,56', 1234.56], ['1 234.56', 1234.56],
  ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['12,345,678.9', 12345678.9], ['12.345.678,9', 12345678.9],
  ['1.234.567', 1234567], ['1,234,567', 1234567],
  ['0,5', 0.5], ['0.125', 0.125], ['0,125', 0.125], [',5', 0.5], ['.5', 0.5], ['12,', 12], ['12.', 12],
  ['-5', -5], ['−5', -5], ['–5,5', -5.5], ['+5', 5], ['1e3', 1000],
  ['12,500', 12.5, 12500], ['1.000', 1, 1000], ['1,234', 1.234, 1234], ['999.999', 999.999, 999999], ['-12,500', -12.5, -12500],
  ['1234,567', 1234.567], ['0,500', 0.5], ['12,50', 12.5], ['12,5000', 12.5],
  ['abc', NO], ['12abc', NO], ['-', NO], ['.', NO], [',', NO], ['1,23,4', NO], ['12.5.6', NO], ['1,2.3,4', NO], ['1.234,56,7', NO],
  ['12,34.56', NO], ['1 2 3 x', NO], ['--5', NO], ['5-', NO], ['1,,5', NO]
];
let wrong = [];
TABLE.forEach(([text, v, alt]) => {
  const r = S.typed(text);
  const ok = r.empty === false && (v === NO ? r.v === null : Math.abs(r.v - v) < 1e-9) && (alt === undefined ? r.alt === undefined : r.alt === alt);
  if (!ok) wrong.push(JSON.stringify(text) + ' → ' + JSON.stringify(r));
});
check(wrong.length === 0, `${TABLE.length} things a person types, each read as meant` + (wrong.length ? ': ' + wrong.join('; ') : ''));
check(['', ' ', ' ', null, undefined].every((t) => S.typed(t).empty && S.typed(t).v === null), 'nothing typed is «empty», not «not a number»');
check(S.typed('1,234.56').v === 1234.56 && S.typed('1.234,56').v === 1234.56, 'with two marks the last is the decimal one: «1,234.56» and «1.234,56» are the same number');
check(S.typed('12,500').v === 12.5 && S.typed('12,500').alt === 12500 && S.typed('0,500').alt === undefined && S.typed('1234,500').alt === undefined,
  '«12,500» is 12,5 as it always was — and can be 12 500; «0,500» and «1234,500» cannot');

// the file reader's function answers what it answered: these are its answers before this change
const WAS = [['12,500', 12.5], ['1,234', 1.234], ['1.000', 1], ['1 234,5', 1234.5], ['1,234.56', null], ['1.234,56', null], ['+5', null],
  ['−5', null], ['12,', null], ['', null], ['1e3', 1000], ['-5', -5], ['.5', 0.5], ['1,234,567', null], [7, 7], [null, null], ['abc', null]];
check(WAS.every(([t, v]) => S.num(t) === v), 'S.num — what the estimates are read through — answers exactly as before');

/* ------------------------------------------------------------------ the field */
console.log('-- the price field --');
const dir = mkdtempSync(join(tmpdir(), 'typed-'));
const EST = join(dir, 'first.xlsx');
writeFileSync(EST, xlsx(S, book(1)));

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
await page.setInputFiles('#pick', EST);
await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 10 && app.pending <= 0);

const NAME = 'ТЕСТОВЫЙ ЦЕМЕНТ';       // 1 т at 23
const market = () => page.evaluate((n) => app.model.resources.find((r) => r.name === n).market, NAME);
const field = (scroll) => page.locator(`${scroll} .vrow`, { hasText: NAME }).locator('input.pin').first();
const toasts = () => page.evaluate(() => document.getElementById('toast').textContent);
const elsewhere = () => page.click('#ledger');
async function typeIn(scroll, text) {
  const f = field(scroll);
  await f.click();
  await f.fill(text);
  return f;
}

let f = await typeIn('#priceScroll', '1 234,56');
check(await market() === 1234.56, '«1 234,56» typed: the price is 1 234,56');
f = await typeIn('#priceScroll', '1,234.56');
check(await market() === 1234.56, '«1,234.56» pasted from another table: the same');
f = await typeIn('#priceScroll', '1.234,56');
check(await market() === 1234.56, '«1.234,56»: the same');
f = await typeIn('#priceScroll', '−21');
check(await market() === -21, 'a minus that is not the keyboard\'s is a minus');
f = await typeIn('#priceScroll', '21');
check(await market() === 21, 'a plain number, as ever');

// not a number: nothing changes
f = await typeIn('#priceScroll', '21 сум');
check(await market() === 21, 'text that is not a number does not change the price — and does not put the estimate\'s back (' + await market() + ')');
check(await f.evaluate((el) => el.classList.contains('bad')), 'the field is framed in red while the text stands');
await elsewhere();
await page.waitForFunction(() => /не число/.test(document.getElementById('toast').textContent));
check(/«21 сум» — не число: цена не изменена, осталась 21/.test(await toasts()), 'leaving the field says so, with the price that stayed');
check(await field('#priceScroll').inputValue() === '21' && !(await field('#priceScroll').evaluate((el) => el.classList.contains('bad'))), 'and the field shows that price again, unframed');

// half-way through a number
f = await typeIn('#priceScroll', '20,');
check(await market() === 20, '«20,» on the way to «20,5» is twenty, not the estimate\'s price');
await f.fill('20,5');
check(await market() === 20.5, 'and then 20,5');

// emptied: the estimate's own price, as before
f = await typeIn('#priceScroll', '');
check(await market() === 23, 'an emptied field still means the estimate\'s own price');
check(!(await f.evaluate((el) => el.classList.contains('bad'))), 'and is not an error');
await elsewhere();

// two readings
f = await typeIn('#priceScroll', '12,500');
check(await market() === 12.5, '«12,500» is taken as 12,5, as it always was');
await elsewhere();
await page.waitForSelector('#toast .toast-act');
check(/«12,500» прочитано как 12,5\. Если это 12 500/.test((await toasts()).replace(/ /g, ' ')), 'leaving the field says how it was read and offers the other reading');
await page.click('#toast .toast-act');
check(await market() === 12500, 'one press makes it 12 500');
check((await field('#priceScroll').inputValue()).replace(/\s/g, '') === '12500', 'and the field shows it');

// passing through a field without typing offers nothing
await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
await page.evaluate((n) => { const r = app.model.resources.find((x) => x.name === n); app.setPrice(r.key, 1.234); app.prices_ui.list.refresh(); }, NAME);
await field('#priceScroll').click();
await elsewhere();
await page.waitForTimeout(300);
check(await market() === 1.234 && !/прочитано как/.test(await toasts()), 'a field that was only passed through is not asked about');

// the same field on «Сводная таблица»
console.log('-- the same on «Сводная таблица» --');
await page.click('.tab[data-pane="sheet"]');
f = await typeIn('#sheetScroll', '1.234,5');
check(await market() === 1234.5, '«1.234,5» typed there: 1 234,5');
f = await typeIn('#sheetScroll', 'нет');
check(await market() === 1234.5 && await f.evaluate((el) => el.classList.contains('bad')), 'not a number: the price stays, the field is framed');
await page.click('#sheetCount');
await page.waitForFunction(() => /«нет» — не число/.test(document.getElementById('toast').textContent));
check(true, 'and leaving it says so');

check(errors.length === 0, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'typed-price OK');
process.exit(fail ? 1 : 0);
