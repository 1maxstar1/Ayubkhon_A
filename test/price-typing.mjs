/*
 * Typing a market price, digit by digit, in a real browser (dist/smeta-taqqoslash.html).
 *
 * Every digit typed sets the price, and the list is drawn anew a moment later. Drawn anew from the price, the box was
 * rewritten with grouped digits («2071» → «2 071») and the caret put back at the same index — one place off — so the
 * next digits landed in the wrong place: «207187» typed at an ordinary pace came out «207 871» (2026-11-18). Here the
 * digits are typed slower than the list redraws, in «Проверка цен» and in «Сводная таблица», and the box must hold
 * exactly what was typed — also a digit put in the middle, an emptied box — while Esc still puts the estimate's price
 * back. The estimate is the invented one of test/compare-books.cjs.
 *
 *   node test/price-typing.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { load } = require('./load.cjs');
const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'xlsx-write', 'smeta', 'assemble');
const { book, xlsx } = require('./compare-books.cjs');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const dir = mkdtempSync(join(tmpdir(), 'typing-'));
const f1 = join(dir, 'Тест_v1.xlsx');
writeFileSync(f1, xlsx(S, book(1)));

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const SLOW = 400;     // slower than the list redraws after a price is set
const marketOf = (name) => page.evaluate((n) => { const r = app.model.resources.find((x) => x.name === n); return r && r.market; }, name);
const smetaOf = (name) => page.evaluate((n) => { const r = app.model.resources.find((x) => x.name === n); return r && r.price; }, name);
const value = () => page.evaluate(() => document.activeElement && document.activeElement.value);

try {
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });

  /** The price box of a resource in «Проверка цен». */
  const box = async (name) => {
    const key = await page.evaluate((n) => app.model.resources.find((x) => x.name === n).key, name);
    return page.locator('#priceScroll input.pin[data-key="' + key.replace(/"/g, '\\"') + '"]');
  };

  // «Проверка цен»: six digits, one by one
  const crane = 'ТЕСТОВЫЙ КРАН 10 Т';
  await (await box(crane)).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('207187', { delay: SLOW });
  await page.waitForTimeout(SLOW);
  check(await value() === '207187', 'the box holds what was typed, digit by digit (' + await value() + ')');
  check(await marketOf(crane) === 207187, 'and the price is what was typed (' + await marketOf(crane) + ')');

  // a digit put in the middle stays where the caret was
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(SLOW);
  await page.keyboard.type('5', { delay: SLOW });
  await page.waitForTimeout(SLOW);
  check(await value() === '2071587' && await marketOf(crane) === 2071587, 'a digit typed in the middle lands where the caret is (' + await value() + ')');

  // leaving the box shows the price with grouped digits again
  await page.keyboard.press('Tab');
  await page.waitForTimeout(SLOW);
  check(await (await box(crane)).inputValue() === S.price(2071587), 'left, the box shows the price grouped (' + await (await box(crane)).inputValue() + ')');

  // an emptied box stays empty while the caret is in it (the price is the estimate's), and takes the next digits
  const bolt = 'ТЕСТОВЫЙ БОЛТ';
  await (await box(bolt)).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(SLOW * 2);
  check(await value() === '' && await marketOf(bolt) === await smetaOf(bolt), 'an emptied box stays empty, the price is the estimate\'s (' + JSON.stringify(await value()) + ')');
  await page.keyboard.type('6543', { delay: SLOW });
  await page.waitForTimeout(SLOW);
  check(await value() === '6543' && await marketOf(bolt) === 6543, '… and takes the digits typed next (' + await value() + ')');

  // Esc puts the estimate's price back, in the box too
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SLOW);
  const smeta = await smetaOf(bolt);
  check(await marketOf(bolt) === smeta && S.num(await value()) === smeta, 'Esc puts the estimate\'s price back, and the box shows it (' + await value() + ')');
  await page.keyboard.press('Tab');

  // «Сводная таблица»: the same boxes on the sheet
  await page.click('.tab[data-pane="sheet"]');
  await page.waitForFunction(() => document.querySelectorAll('#sheetScroll input.pin').length > 0);
  const nail = 'ТЕСТОВЫЙ ГВОЗДЬ';
  const nailKey = await page.evaluate((n) => app.model.resources.find((x) => x.name === n).key, nail);
  await page.locator('#sheetScroll input.pin[data-key="' + nailKey.replace(/"/g, '\\"') + '"]').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('4321', { delay: SLOW });
  await page.waitForTimeout(SLOW);
  check(await value() === '4321' && await marketOf(nail) === 4321, '«Сводная таблица»: the box holds what was typed (' + await value() + ')');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
} catch (e) {
  check(false, 'the run stopped: ' + (e.message || e).split('\n')[0]);
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? '\nFAILED: ' + fail : '\nall price-typing checks passed');
process.exit(fail ? 1 : 0);
