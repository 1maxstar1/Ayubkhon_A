/*
 * The single-file program (dist/smeta-taqqoslash.html) in a real browser, start to finish: estimates are
 * loaded, a price is typed the way a person types it, the three tabs draw, the document is downloaded — and
 * the downloaded document is read back and checked.
 *
 *   node test/browser.mjs [<file1.xlsx> <file2.xlsx>]
 *
 * Without files it runs on two invented estimates (test/synth.cjs), so it runs anywhere.
 *
 * This test used to look for one resource by its name — a name from one particular estimate — and timed out
 * on every other workbook; and where it did run it checked nothing: it printed what it saw and passed unless
 * the page threw. It now takes the first priced resource of whatever it is given, and every step is a check.
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const synth = require('./synth.cjs');
const S = load(load.PIPELINE);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'browser-'));
let inputs = process.argv.slice(2);
if (!inputs.length) inputs = [synth.write(S, join(dir, 'first.xlsx'), 1), synth.write(S, join(dir, 'second.xlsx'), 2)];

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));

/* loading */
const t0 = Date.now();
await page.setInputFiles('#pick', inputs);
await page.waitForFunction((n) => window.app && app.pending === 0 && app.projects.length === n && app.model && app.model.rows.length > 0, inputs.length,
  { timeout: 90 * 1000 });
const loadMs = Date.now() - t0;
const stats = await page.evaluate(() => ({
  projects: app.projects.length, objects: app.projects.map((p) => p.objects.length),
  rows: app.model.rows.length, items: app.model.rows.filter((r) => r.kind === 'item').length,
  resources: app.model.resources.length, buildMs: app._buildMs
}));
console.log('loaded in', loadMs, 'ms', JSON.stringify(stats));
check(stats.projects === inputs.length && stats.objects.every((n) => n > 0), `every file gave a project with sheets (${stats.objects.join(', ')})`);
check(stats.resources > 0 && stats.items >= stats.resources, `${stats.items} lines of ${stats.resources} resources`);
check(await page.evaluate(() => !document.getElementById('export').disabled), '«Скачать Excel» is offered');
check(await page.evaluate(() => app.model.resources.every((r) => r.market === r.price)), 'before anything is typed every resource stands at its estimate price');
await page.screenshot({ path: join(root, 'test/shot-prices.png') });
// prices on screen are without VAT, and the screen says so — in the price headings only (E10)
check(await page.evaluate(() => (document.getElementById('priceHead').textContent.match(/без НДС/g) || []).length) === 2,
  'the price list says «без НДС» under its two price headings');

/* a price, typed into the box of the first priced resource — whatever the estimate calls it */
const res = await page.evaluate(() => {
  const r = app.model.resources.find((x) => x.price > 0 && x.name.trim().length >= 4);
  return { key: r.key, name: r.name, price: r.price, lines: app.model.rows.filter((x) => x.kind === 'item' && x.key === r.key).length };
});
const typed = Math.round(res.price * 0.9 * 100) / 100;
await page.fill('#q', res.name.trim());
// the search waits a moment after the last key before it filters
await page.waitForFunction((a) => app.prices_ui.view.length < a.all && !!document.querySelector('#priceScroll .pin[data-key="' + CSS.escape(a.k) + '"]'),
  { k: res.key, all: stats.resources }, { timeout: 10 * 1000 }).catch(() => { /* said by the check */ });
const box = page.locator('#priceScroll .pin[data-key="' + res.key.replace(/(["\\])/g, '\\$1') + '"]');
const shownOf = await page.evaluate(() => app.prices_ui.view.length);
check(shownOf >= 1 && shownOf < stats.resources, `the search narrows the list to the resource (${shownOf} of ${stats.resources})`);
// a price typed as the estimate's × 1,12 is most likely one with VAT: said, with «÷ 1,12» to put the estimate's back (E11)
const vatToast = () => page.evaluate(() => [...document.querySelectorAll('#toast .toast-item')].filter((t) => /с НДС/.test(t.textContent))
  .map((t) => ({ text: t.textContent, act: (t.querySelector('.toast-act') || {}).textContent || '' })));
await box.click();
await box.fill(String(Math.round(res.price * 1.12 * 100) / 100).replace('.', ','));
await box.press('Tab');
await page.waitForTimeout(300);
const said = await vatToast();
check(said.length === 1 && said[0].act === '÷ 1,12', `a price of the estimate's × 1,12 is said to look like one with VAT, with «÷ 1,12» (${(said[0] || {}).text || 'nothing said'})`);
await page.click('#toast .toast-item .toast-act');
await page.waitForTimeout(200);
check(await page.evaluate((k) => { const r = app.model.resources.find((x) => x.key === k);
  return r.market === r.price && app.model.rows.filter((x) => x.kind === 'item' && x.key === k).every((x) => x.market === r.price) &&
    app.model.resources.every((x) => x.market === x.price); }, res.key), '«÷ 1,12» puts the estimate\'s own price back on every line, and nothing else changes');
await page.evaluate(() => document.querySelectorAll('#toast .toast-item .toast-x, #toast .toast-item .x').forEach((b) => b.click()));
await box.click();
await box.press('Tab');
await page.waitForTimeout(200);
check((await vatToast()).length === 0, 'entering and leaving the box without typing says nothing');
await box.click();
await box.fill(String(typed).replace('.', ','));
await box.press('Tab');
await page.waitForTimeout(300);
const after = await page.evaluate((k) => {
  const r = app.model.resources.find((x) => x.key === k);
  const rows = app.model.rows.filter((x) => x.kind === 'item' && x.key === k);
  const others = app.model.resources.filter((x) => x.key !== k && x.market !== x.price).length;
  return { market: r.market, rows: rows.length, applied: rows.filter((x) => x.market === r.market).length, others };
}, res.key);
check(Math.abs(after.market - typed) < 1e-9, `the typed price is the resource's market price (${after.market})`);
check(after.rows === res.lines && after.applied === after.rows, `and it is on every one of its ${after.rows} lines`);
check(after.others === 0, 'no other resource is touched');

await page.fill('#q', '');
await page.selectOption('#filter', 'changed');
await page.waitForTimeout(300);
check(await page.evaluate(() => app.prices_ui.view.length) === 1, 'the filter «изменённые» shows exactly that one');
await page.screenshot({ path: join(root, 'test/shot-changed.png') });

/* the document lists a change only above a threshold (five million by default): here every change counts */
await page.click('.tab[data-pane="settings"]');
await page.fill('#optMinDiff', '0');
await page.locator('#optMinDiff').press('Tab');

/* the other two tabs */
await page.click('.tab[data-pane="sheet"]');
await page.waitForTimeout(300);
const drawn = await page.locator('#sheetScroll .vrow').count();
check(drawn > 0 && await page.evaluate((n) => app.sheetView.length === n, stats.rows), `the assembled sheet draws its rows (${drawn} on screen of ${stats.rows})`);
await page.screenshot({ path: join(root, 'test/shot-sheet.png') });
await page.click('.tab[data-pane="report"]');
await page.waitForTimeout(400);
const reportInfo = (await page.textContent('#reportCount')).trim();
const inPreview = await page.evaluate((k) => app.reportRows.filter((x) => x.kind === 'item' && x.key === k).length, res.key);
check(inPreview >= 1, `the document preview has the changed resource (${reportInfo})`);
await page.screenshot({ path: join(root, 'test/shot-report.png') });

// the assembled sheet scrolls: sixty frames, however long the estimate
await page.click('.tab[data-pane="sheet"]');
const scrollMs = await page.evaluate(async () => {
  const el = document.getElementById('sheetScroll');
  const t = performance.now();
  for (let i = 0; i < 60; i++) { el.scrollTop += 900; await new Promise((r) => requestAnimationFrame(r)); }
  return Math.round(performance.now() - t);
});
check(scrollMs < 5000, `sixty frames of scrolling take ${scrollMs} ms`);

/* the document: downloaded, read back, and the typed price is in it */
const dl = page.waitForEvent('download', { timeout: 120 * 1000 });
await page.click('#export');
const download = await dl;
const out = join(dir, 'export.xlsx');
await download.saveAs(out);
const bytes = readFileSync(out);
check(bytes.length > 2000, `the document is downloaded (${(bytes.length / 1024).toFixed(0)} KB)`);
const wb = S.readXlsx(new Uint8Array(bytes));
const cells = [];
wb.sheets.forEach((sh) => sh.rows.forEach((row) => (row || []).forEach((c) => { if (c) cells.push(c); })));
const nameCell = S.nameKey(res.name);
const hasName = wb.sheets.some((sh) => sh.rows.some((row) => (row || []).some((c) => c && typeof c.v === 'string' && S.nameKey(c.v) === nameCell)));
const hasPrice = wb.sheets.some((sh) => sh.rows.some((row) => {
  const cs = (row || []).filter(Boolean);
  return cs.some((c) => typeof c.v === 'string' && S.nameKey(c.v) === nameCell) && cs.some((c) => typeof c.v === 'number' && Math.abs(c.v - typed) < 1e-6);
}));
check(wb.sheets.length >= 1 && cells.length > 20, `it opens: ${wb.sheets.length} sheet(s), ${cells.length} cells`);
check(hasName && hasPrice, 'the changed resource is in it, with the price that was typed');
// ... and on the comparison table itself, not only on the copy of the estimate that goes with it
const big = wb.sheets.reduce((m, sh) => Math.max(m, sh.rows.length), 0);
const table = wb.sheets.find((sh) => sh.rows.length < big) || wb.sheets[0];
const onTable = table.rows.some((row) => {
  const cs = (row || []).filter(Boolean);
  return cs.some((c) => typeof c.v === 'string' && S.nameKey(c.v) === nameCell) && cs.some((c) => typeof c.v === 'number' && Math.abs(c.v - typed) < 1e-6);
});
check(wb.sheets.length < 2 || onTable, `the comparison table («${table.name}», ${table.rows.length} rows) has that line`);
check(cells.some((c) => c.f && /^\+?[A-Z]+\d+[*-]/.test(String(c.f).replace(/^=/, ''))) && cells.some((c) => c.f && /SUM\(/i.test(c.f)),
  'and its sums are formulas, not numbers');

/* «Применить %» (A7): every price shown moves to the estimate's ± the percentage, to the tiyin — but never one the expert set */
await page.click('.tab[data-pane="prices"]');
await page.fill('#q', '');
await page.selectOption('#filter', 'all');
await page.waitForFunction((n) => app.prices_ui.view.length === n, stats.resources, { timeout: 10 * 1000 }).catch(() => { /* said by the check */ });
const pctPress = async (val) => { page.once('dialog', (d) => d.accept(val)); await page.click('#pctBtn'); await page.waitForTimeout(300); };
const lastToast = async () => page.evaluate(() => { const t = [...document.querySelectorAll('#toast .toast-item')].pop(); return t ? t.textContent : ''; });
await pctPress('-10');
const pctState = (p) => page.evaluate(([k, p]) => {
  const off = app.model.resources.filter((r) => r.key !== k && r.price > 0 && Math.abs(r.market - Math.round(r.price * (100 + p)) / 100) > 1e-9);
  const typedR = app.model.resources.find((r) => r.key === k);
  return { typed: typedR.market, off: off.length, first: off.slice(0, 2).map((r) => r.name + ' ' + r.price + ' → ' + r.market) };
}, [res.key, p]);
let ps = await pctState(-10);
check(Math.abs(ps.typed - typed) < 1e-9, `«Применить %» leaves the typed price alone (${ps.typed})`);
check(ps.off === 0, 'every other price is the estimate\'s less 10 %, to the tiyin' + (ps.off ? ' — not ' + ps.first.join('; ') : ''));
check(/пропущено изменённых вручную: 1/.test(await lastToast()), 'and the message says one typed price was skipped');
await pctPress('-100');
check(/цена стала бы 0/.test(await lastToast()) && (await pctState(-10)).off === 0, 'a percentage that would make prices 0 changes none of them, and says so');
page.once('dialog', (d) => d.accept());
await page.click('#resetBtn');
await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll('#toast .toast-act')].pop(); if (b) b.click(); });
await page.waitForTimeout(300);
await pctPress('-20');
ps = await pctState(-20);
check(Math.abs(ps.typed - typed) < 1e-9 && ps.off === 0, 'after «Сбросить» and «Отменить» the percentage prices are free for the next percentage, the typed one still is not');

writeFileSync(join(root, 'test/browser-errors.txt'), errors.join('\n'));
check(errors.length === 0, errors.length ? 'page errors:\n' + errors.slice(0, 12).join('\n') : 'no page errors');

await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'browser OK');
process.exit(fail ? 1 : 0);
