/*
 * The price workspace on a laptop screen, 1366 × 768, with a real scrollbar (E5).
 *
 * Measured before: on «Проверка цен» the headings from «Ед. изм.» on stood 10–25 px off their columns (the header
 * sits beside the scroller and knew nothing of its scrollbar); «Сводная таблица» needed 1116 px of 1063 and its
 * header did not follow the sideways scroll; 19 price rows were on screen and the name column was 315 px; a
 * fifteen-character price did not fit its box. Held here, in the single-file program, on invented estimates:
 *
 *   - every heading stands over its column, on all three tables, also with the sheet scrolled sideways;
 *   - compact mode (on by itself at this size): at least 24 price rows, a name column of at least 470 px, and the
 *     sheet fits without sideways scrolling;
 *   - switching it keeps the row the list was at;
 *   - a long price fits its cell and its box, in both modes;
 *   - a price typed in compact mode lands.
 *
 *   node test/layout-1366.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const synth = require('./synth.cjs');
const S = load(load.PIPELINE);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'layout-'));
const inputs = [synth.write(S, join(dir, 'first.xlsx'), 1), synth.write(S, join(dir, 'second.xlsx'), 2)];

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const errors = [];

// a real scrollbar, as on Windows: headless Chromium hides them unless told not to
const browser = await chromium.launch({ ...launchOpts, ignoreDefaultArgs: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
await page.setInputFiles('#pick', inputs);
await page.waitForFunction((n) => window.app && app.pending === 0 && app.projects.length === n && app.model && app.model.rows.length > 0, inputs.length,
  { timeout: 90 * 1000 });
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const tab = async (name) => { await page.click('.tab[data-pane="' + name + '"]'); await frames(); };

/** Every heading cell's edges against the first row's cells: the list of those more than 1 px off. */
const offHeads = (head, scroll) => page.evaluate(([h, s]) => {
  const hc = [...document.querySelectorAll('#' + h + ' > .c')];
  // a line of the table, not a band or a title across it
  const row = [...document.querySelectorAll('#' + s + ' .vrow')].find((r) => r.querySelectorAll(':scope > .c').length === hc.length);
  if (!row) return ['no line with ' + hc.length + ' cells drawn'];
  const rc = [...row.querySelectorAll(':scope > .c')];
  if (rc.length !== hc.length) return ['cells: ' + hc.length + ' headings, ' + rc.length + ' in the row'];
  const box = document.getElementById(s).getBoundingClientRect();
  const out = [];
  hc.forEach((c, i) => {
    const a = c.getBoundingClientRect(), b = rc[i].getBoundingClientRect();
    // only what is on screen can be compared: a column scrolled out of view is clipped differently by each box
    if (b.right <= box.left + 1 || b.left >= box.right - 1) return;
    if (Math.abs(a.left - b.left) > 1 || Math.abs(a.right - b.right) > 1) {
      out.push((c.textContent || '?').slice(0, 14) + ' ' + Math.round(a.left) + '–' + Math.round(a.right) + ' over ' + Math.round(b.left) + '–' + Math.round(b.right));
    }
  });
  return out;
}, [head, scroll]);

/** Numbers that do not fit: the text of a numeric cell outside its padding box, or a price box that scrolls. */
const clipped = () => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.pane.on .vrow .c.num').forEach((cell) => {
    const inp = cell.querySelector('input');
    if (inp) { if (inp.scrollWidth > inp.clientWidth) out.push('box «' + inp.value + '» ' + inp.scrollWidth + ' > ' + inp.clientWidth); return; }
    // the percentage of a price made a hundred thousand times larger is not a number a table is laid out for
    if (!cell.textContent.trim() || /%$/.test(cell.textContent.trim())) return;
    const cs = getComputedStyle(cell), c = cell.getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(cell); const t = r.getBoundingClientRect();
    if (t.left < c.left + parseFloat(cs.paddingLeft) - 1 || t.right > c.right - parseFloat(cs.paddingRight) + 1) out.push('«' + cell.textContent.trim() + '»');
  });
  return out;
});

/* ---------------------------------------------------------------- normal mode first: the headings over their columns */
await page.evaluate(() => S.compact.set(false));
await tab('prices');
let off = await offHeads('priceHead', 'priceScroll');
check(!off.length, '«Проверка цен»: every heading over its column, with a real scrollbar' + (off.length ? ' — ' + off.join('; ') : ''));
// every material a tenth lower: the preview shows one project's document, of its changed materials and equipment
await page.evaluate(() => { const m = {}; app.model.resources.forEach((x) => { if (x.price > 0 && x.section === 'materials') m[x.key] = Math.round(x.price * 90) / 100; });
  app.setPrices(m); });
await tab('settings');
await page.fill('#optMinDiff', '0');
await page.locator('#optMinDiff').press('Tab');
await page.waitForTimeout(500);
await tab('report');
// the document begins with its stamp and titles: the lines of the table come after them. (Built again here: the
// change of the threshold rebuilds the estimates a moment later, and this test is about the layout, not that moment.)
await page.evaluate(() => app.buildReportPreview());
await page.evaluate(() => app.reportList.scrollToRow(Math.max(0, app.reportRows.findIndex((r) => r.kind === 'item'))));
await frames();
off = await offHeads('reportHead', 'reportScroll');
check(!off.length, '«Вид отчёта»: every heading over its column' + (off.length ? ' — ' + off.join('; ') : ''));
await tab('sheet');
const side = await page.evaluate(() => { const s = document.getElementById('sheetScroll'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
if (side.sw > side.cw) {
  await page.evaluate(() => { document.getElementById('sheetScroll').scrollLeft = 1e6; });
  await frames();
  const at = await page.evaluate(() => ({ s: document.getElementById('sheetScroll').scrollLeft, h: document.getElementById('sheetHead').scrollLeft }));
  check(at.s > 0 && at.h === at.s, `«Сводная таблица» scrolled sideways: the headings follow (${at.h} of ${at.s})`);
  off = await offHeads('sheetHead', 'sheetScroll');
  check(!off.length, 'and stand over their columns there' + (off.length ? ' — ' + off.join('; ') : ''));
  await page.evaluate(() => { document.getElementById('sheetScroll').scrollLeft = 0; });
} else check(true, '«Сводная таблица» fits without sideways scrolling in normal mode here');
await page.evaluate(() => app.sheetList.scrollToRow(Math.max(0, app.sheetView.findIndex((r) => r.kind === 'item'))));
await frames();
off = await offHeads('sheetHead', 'sheetScroll');
check(!off.length, '«Сводная таблица»: every heading over its column' + (off.length ? ' — ' + off.join('; ') : ''));

/* a long price, in normal mode */
const first = await page.evaluate(() => { const r = app.model.resources.find((x) => x.price > 0); app.setPrice(r.key, 123456789.125); return r.key; });
await tab('prices');
await page.evaluate((k) => { document.getElementById('q').value = ''; app.prices_ui.apply(); const i = app.prices_ui.view.findIndex((r) => r.key === k); app.prices_ui.list.scrollToRow(i); }, first);
await frames();
let cl = await clipped();
check(!cl.length, 'normal mode: a fifteen-character price fits its cell and its box' + (cl.length ? ' — ' + cl.slice(0, 4).join('; ') : ''));

/* ---------------------------------------------------------------- compact mode, on by itself at this size */
await page.evaluate(() => S.compact.mode('auto'));
await frames();
check(await page.evaluate(() => document.body.classList.contains('compact') && S.compact.on), 'at 1366 × 768 the compact mode is on by itself');
await page.screenshot({ path: join(root, 'test/shot-1366-prices.png') });
const fit = await page.evaluate(() => {
  const sc = document.getElementById('priceScroll'), nm = document.querySelector('#priceScroll .vrow .c:nth-child(2)');
  return { rows: Math.floor(sc.clientHeight / app.prices_ui.list.rowHeight), name: nm ? Math.round(nm.getBoundingClientRect().width) : 0 };
});
check(fit.rows >= 24, `«Проверка цен» shows ${fit.rows} rows (24 at least; 19 before)`);
check(fit.name >= 470, `and a name column of ${fit.name} px (470 at least; 315 before)`);
off = await offHeads('priceHead', 'priceScroll');
check(!off.length, 'every heading over its column in compact mode too' + (off.length ? ' — ' + off.join('; ') : ''));
cl = await clipped();
check(!cl.length, 'compact mode: the long price fits its cell and its box' + (cl.length ? ' — ' + cl.slice(0, 4).join('; ') : ''));
await tab('sheet');
const sheetFit = await page.evaluate(() => { const s = document.getElementById('sheetScroll'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
check(sheetFit.sw <= sheetFit.cw, `«Сводная таблица» fits without sideways scrolling (${sheetFit.sw} of ${sheetFit.cw})`);
off = await offHeads('sheetHead', 'sheetScroll');
check(!off.length, 'and its headings stand over their columns' + (off.length ? ' — ' + off.join('; ') : ''));
await page.screenshot({ path: join(root, 'test/shot-1366-sheet.png') });

/* switching keeps the row */
await tab('prices');
await page.evaluate(() => { app.prices_ui.list.el.scrollTop = 30 * app.prices_ui.list.rowHeight; });
await frames();
await page.evaluate(() => S.compact.set(false));
await frames();
const row30 = await page.evaluate(() => Math.round(app.prices_ui.list.el.scrollTop / app.prices_ui.list.rowHeight));
check(row30 === 30, `switching the compact mode keeps the row the list was at (${row30})`);
await page.evaluate(() => S.compact.set(true));
await frames();

/* typing in compact mode */
const res = await page.evaluate(() => { const r = app.model.resources.find((x) => x.price > 0 && x.key !== app.model.resources.find((y) => y.price > 0).key); return { key: r.key, price: r.price }; });
await page.evaluate((k) => { const i = app.prices_ui.view.findIndex((r) => r.key === k); app.prices_ui.list.scrollToRow(i); }, res.key);
await frames();
const box = page.locator('#priceScroll .pin[data-key="' + res.key.replace(/(["\\])/g, '\\$1') + '"]');
await box.click();
await box.fill('777,5');
await box.press('Tab');
await frames();
check(await page.evaluate((k) => app.prices[k] === 777.5, res.key), 'a price typed in compact mode lands');

const names = await page.evaluate(() => { const a = [...document.querySelectorAll('#priceScroll .nmt')]; return [a.filter((n) => n.scrollWidth > n.clientWidth).length, a.length]; });
console.log(`(information: ${names[0]} of ${names[1]} names on screen are cut)`);

await browser.close();
rmSync(dir, { recursive: true, force: true });
check(!errors.length, errors.length ? 'page errors: ' + errors.slice(0, 5).join('; ') : 'no page errors');
console.log(fail ? `FAILED (${fail})` : 'layout-1366 OK');
process.exit(fail ? 1 : 0);
