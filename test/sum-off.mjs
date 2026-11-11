/*
 * An estimate row that does not add up.
 *
 * The document always computes a row's sum — quantity × price, as a live formula. An estimate sometimes prints
 * another number there: a sum typed over, a price changed after the sum was written. The document then differs
 * from the paper on that row and in the totals above it, and nothing used to say so.
 *
 * Held here: such rows are counted when the estimate is read, shown beside the totals with how much they are
 * off by, and a click walks through them in «Сводная таблица»; nothing about the calculation changes; a sum that
 * is off only by rounding is not counted.
 *
 * The estimate is invented.
 *
 *   node test/sum-off.mjs
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

/** The invented estimate, with the printed sum of some rows changed: { 'NAME': printed }. */
function estimate(printed) {
  const wb = book(1);
  wb.sheets[0].rows.forEach((cells) => {
    const nm = cells && cells[3] && cells[3].v;
    if (nm in printed) cells[7] = { v: printed[nm] };
  });
  return wb;
}
const model = (wb, prices) => S.assemble([{ id: 'p1', file: 'a.xlsx', name: 'A', title: 'T', objects: S.smeta.parseWorkbook(wb, 'a.xlsx'), enabled: true }], prices || {});

/* ------------------------------------------------------------------ the model */
console.log('-- reading --');
const clean = model(book(1));
check(clean.sumOff && clean.sumOff.rows.length === 0 && clean.sumOff.diff === 0, 'an estimate that adds up has no such rows');

// ТЕСТОВЫЙ БОЛТ: 2 × 7 = 14, printed 20 · ТЕСТОВЫЙ ЦЕМЕНТ: 1 × 23 = 23, printed 18 · ТЕСТОВЫЙ ГВОЗДЬ: 1 × 5, printed 5.4 (rounding)
const wb = estimate({ 'ТЕСТОВЫЙ БОЛТ': 20, 'ТЕСТОВЫЙ ЦЕМЕНТ': 18, 'ТЕСТОВЫЙ ГВОЗДЬ': 5.4 });
const m = model(wb);
const marked = m.rows.filter((r) => r.printed != null);
check(m.sumOff.rows.length === 2, `two rows are counted (${m.sumOff.rows.length})`);
check(m.sumOff.diff === (20 - 14) + (18 - 23), `and by how much they are off in all: printed minus computed (${m.sumOff.diff})`);
check(marked.length === 2 && marked[0].nm === 'ТЕСТОВЫЙ БОЛТ' && marked[0].printed === 20 && marked[1].nm === 'ТЕСТОВЫЙ ЦЕМЕНТ' && marked[1].printed === 18,
  'the rows themselves are marked with what the estimate printed');
check(m.sumOff.rows.join() === marked.map((r) => r.r).join(), 'and listed by their number in column A');
check(!m.rows.some((r) => r.nm === 'ТЕСТОВЫЙ ГВОЗДЬ' && r.printed != null), 'a sum that is off by less than one sum — rounding — is not counted');
const strip = (mm) => JSON.stringify(mm.rows.map((r) => r.cells));
check(strip(m) === strip(model(estimate({}))), 'no cell of the document differs from the one built from the estimate that adds up');
const bytes = (mm) => Buffer.from(S.buildWorkbook(mm, { mode: 'full' })).toString('base64');
check(bytes(m) === bytes(model(book(1))), 'and the exported workbook is the same, byte for byte');
const priced = model(wb, { [S.resKey('ТЕСТОВЫЙ БОЛТ', 'ШТ', 7)]: 6 });
check(priced.sumOff.rows.length === 2 && priced.sumOff.diff === 1, 'a market price does not change the count: it is about the estimate');

/* ------------------------------------------------------------------ the page */
console.log('-- the page --');
const dir = mkdtempSync(join(tmpdir(), 'sumoff-'));
const OFF = join(dir, 'off.xlsx'), FINE = join(dir, 'fine.xlsx');
writeFileSync(OFF, xlsx(S, wb));
writeFileSync(FINE, xlsx(S, book(1)));

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));

await page.setInputFiles('#pick', FINE);
await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 10 && app.pending <= 0);
check(await page.evaluate(() => !document.getElementById('sumOff')), 'an estimate that adds up: nothing is shown beside the totals');

await page.setInputFiles('#pick', OFF);
await page.waitForFunction(() => app.projects.length === 2 && app.pending <= 0 && !!document.getElementById('sumOff'));
const label = (await page.textContent('#sumOff')).replace(/\s+/g, ' ').trim();
check(/^2 строки · 1 сум$/.test(label), `the second estimate: «${label}» beside the totals`);
check(/напечатанная сумма не равна/.test(await page.getAttribute('#sumOff', 'title')), 'with what it means in its title');

await page.click('#sumOff');
await page.waitForFunction(() => document.querySelector('.tab[data-pane="sheet"]').classList.contains('on'));
const shown = () => page.evaluate(() => {
  const c = document.querySelector('#sheetScroll .vrow .c.off');
  const t = document.getElementById('toast').textContent;
  return { cell: c ? c.closest('.vrow').textContent : '', title: c ? c.title : '', toast: t };
});
await page.waitForFunction(() => !!document.querySelector('#sheetScroll .vrow .c.off'));
let s = await shown();
check(/ТЕСТОВЫЙ БОЛТ/.test(s.cell) && /напечатано 20/.test(s.title), 'a click opens «Сводная таблица» at the first such row, its sum underlined');
check(/1 из 2/.test(s.toast) && /напечатано 20, кол-во × цена = 14/.test(s.toast), 'and says what is printed and what is computed');
await page.click('#sumOff');
await page.waitForFunction(() => /2 из 2/.test(document.getElementById('toast').textContent));
s = await shown();
check(/напечатано 18, кол-во × цена = 23/.test(s.toast), 'the next click goes to the next one');

check(errors.length === 0, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'sum-off OK');
process.exit(fail ? 1 : 0);
