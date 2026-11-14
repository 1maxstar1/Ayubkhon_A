/*
 * «Объёмы работ» in a real browser (dist/smeta-taqqoslash.html): the works of form 5 come with the smeta, a new
 * volume moves the quantities of its resources, a remark is kept, a resource's total is set by hand in «Проверка
 * цен», the document gets «Таблица №1 (объёмы)», and «Наш ответ (Excel)» brings the volumes back from the «объем»
 * sheet beside the prices. Everything is invented (test/compare-books.cjs).
 *
 *   node test/e2e-volumes.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { load } = require('./load.cjs');
const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'xlsx-write', 'smeta', 'assemble');
const { book, xlsx, bookWithWorks, volReplyBook } = require('./compare-books.cjs');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const near = (a, b) => a != null && Math.abs(a - b) < 1e-9;
const NOTE = 'Необходимо обосновать объем в проекте';

const dir = mkdtempSync(join(tmpdir(), 'vol-'));
const fw = join(dir, 'Тест_объёмы.xlsx'), fp = join(dir, 'Тест_без.xlsx'), fr = join(dir, 'Ответ.xlsx'), fv = join(dir, 'Ответ_объем.xlsx');
writeFileSync(fw, xlsx(S, bookWithWorks()));
writeFileSync(fp, xlsx(S, book(1)));
writeFileSync(fr, xlsx(S, volReplyBook()));
writeFileSync(fv, xlsx(S, volReplyBook(true)));

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const qty = (name) => page.evaluate((n) => {
  const r = app.model.resources.find((x) => x.name === n);
  return r ? { qty: r.qty, qty2: r.qty2 == null ? null : r.qty2, key: r.key } : null;
}, name);
const open = async (file) => {
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', file);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
};

try {
  // a smeta without form 5: the tab says why it is empty, and nothing moves
  await open(fp);
  await page.click('.tab[data-pane="volumes"]');
  check(/нет локальной ресурсной ведомости/.test(await page.textContent('#volBody')), 'without form 5 the tab says there is nothing to take the volumes from');
  const plain = await qty('ТЕСТОВЫЙ ЦЕМЕНТ');
  check(plain && plain.qty === 1 && plain.qty2 == null, 'and the quantities are the estimate\'s');

  // with form 5: the works, by section
  await open(fw);
  check(await page.evaluate(() => app.projects[0].works.length === 1 && app.projects[0].works[0].works.length === 2), 'the works of form 5 come with the smeta');
  await page.click('.tab[data-pane="volumes"]');
  const rows = await page.$$eval('#volBody tr[data-k]', (t) => t.map((r) => r.cells[1].textContent));
  check(rows.join('|') === 'ТЕСТОВАЯ КЛАДКА СТЕН|ТЕСТОВЫЙ МОНТАЖ АНКЕРОВ', 'the tab lists the two works (' + rows.join('|') + ')');
  check(await page.$$eval('#volBody tr.vsec', (t) => t.map((r) => r.textContent).join('|')) === 'РАЗДЕЛ 1. ТЕСТОВЫЕ РАБОТЫ', 'under their section');
  check(/2 работ/.test(await page.textContent('#volCount')), 'and counts them (' + await page.textContent('#volCount') + ')');

  // a new volume: 2 → 1,5 moves labour by 4 × (−0,5) and cement by 0,5 × (−0,5); the crane is not in that work
  await page.fill('#volBody tr[data-k]:nth-of-type(2) input[data-f="v"]', '1,5');
  await page.press('#volBody tr[data-k]:nth-of-type(2) input[data-f="v"]', 'Tab');
  await page.waitForFunction(() => Object.keys(app.vol).length === 1, null, { timeout: 5000 });
  const labour = await qty('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ'), cement = await qty('ТЕСТОВЫЙ ЦЕМЕНТ'), crane = await qty('ТЕСТОВЫЙ КРАН 10 Т');
  check(near(labour.qty2, 8) && near(cement.qty2, 0.75), 'a new volume moves the quantities of its resources (' + labour.qty2 + ', ' + cement.qty2 + ')');
  check(crane.qty2 == null, 'and not those of another work');
  check(await page.evaluate(() => document.activeElement && document.activeElement.dataset.f === 'just'), 'the table is not redrawn under the cursor: the focus moved on to the next field');
  // a remark alone
  await page.check('#volBody tr[data-k]:nth-of-type(3) input[data-f="just"]');
  const vol = await page.evaluate(() => app.vol);
  const ks = Object.keys(vol);
  check(ks.length === 2 && ks.some((k) => near(vol[k].v, 1.5) && vol[k].note === '') && ks.some((k) => vol[k].v == null && vol[k].note === NOTE),
    'the volume and the remark are kept (' + JSON.stringify(Object.values(vol)) + ')');
  check(/Объёмы работ · 2/.test(await page.textContent('.tab[data-pane="volumes"]')), 'the tab counts what was decided');
  // a bad number is refused, nothing changes
  await page.fill('#volBody tr[data-k]:nth-of-type(3) input[data-f="v"]', 'abc');
  await page.press('#volBody tr[data-k]:nth-of-type(3) input[data-f="v"]', 'Tab');
  check(await page.evaluate(() => document.querySelector('#volBody tr[data-k]:nth-of-type(3) input[data-f="v"]').classList.contains('bad') &&
    Object.values(app.vol).every((d) => d.v == null || Math.abs(d.v - 1.5) < 1e-9)), 'a volume that is not a number is refused');

  // «Проверка цен»: the changed quantities show both numbers; a total set by hand
  await page.click('.tab[data-pane="prices"]');
  await page.selectOption('#filter', 'qty');
  const shown = await page.$$eval('#priceScroll .vrow .qe.on', (b) => b.map((x) => x.textContent));
  check(shown.length === 2, '«Изменено количество» shows the two moved resources (' + shown.join(' | ') + ')');
  await page.selectOption('#filter', 'all');
  page.once('dialog', (d) => d.accept('3'));
  await page.click('#priceScroll .vrow:has-text("ТЕСТОВЫЙ КРАН 10 Т") .qe');
  await page.waitForFunction(() => Object.keys(app.qtys).length === 1, null, { timeout: 5000 });
  check(near((await qty('ТЕСТОВЫЙ КРАН 10 Т')).qty2, 3), 'a total set by hand (2 → 3)');
  check(/<s>/.test(await page.$eval('#priceScroll .vrow:has-text("ТЕСТОВЫЙ КРАН 10 Т") .qe', (b) => b.innerHTML)), 'the estimate\'s quantity is shown struck through beside it');
  // the prices are untouched by all of it: the saving is still by price only
  check(await page.evaluate(() => app.model.resources.every((r) => Math.abs(r.smetaSum - r.marketSum) < 1e-9)), 'no price moved');

  // the document: «Таблица №1 (объёмы)» with the two works and the resource set by hand
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const out = join(dir, 'out.xlsx');
  await dl.saveAs(out);
  const wb = S.readXlsx(new Uint8Array(readFileSync(out)));
  const t1 = wb.sheets.find((s) => s.name === 'Таблица №1 (объёмы)');
  check(!!t1, 'the document has «Таблица №1 (объёмы)» (' + wb.sheets.map((s) => s.name).join('|') + ')');
  const lines = t1 ? t1.rows.filter(Boolean).map((r) => [1, 2, 3, 4, 5, 6].map((c) => r[c] && r[c].v != null ? String(r[c].v) : '').join('¦')) : [];
  check(lines.some((l) => l === '1¦ТЕСТОВАЯ КЛАДКА СТЕН¦М3¦2¦1.5¦'), 'the masonry: the estimate\'s volume and the project\'s');
  check(lines.some((l) => l === '2¦ТЕСТОВЫЙ МОНТАЖ АНКЕРОВ¦100 ШТ¦0.04¦¦' + NOTE), 'the mounting: the remark');
  check(lines.some((l) => /¦Количество ресурсов¦/.test(l)) && lines.some((l) => l === '3¦ТЕСТОВЫЙ КРАН 10 Т¦МАШ.-Ч¦2¦3¦'), 'the crane under «Количество ресурсов»');
  check(lines.some((l) => /^СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №1/.test(l)), 'under its title');

  // nothing decided — no such sheet
  await open(fw);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const out2 = join(dir, 'out2.xlsx');
  await dl2.saveAs(out2);
  check(!S.readXlsx(new Uint8Array(readFileSync(out2))).sheets.some((s) => /Таблица №1/.test(s.name)), 'nothing decided — the document is as it always was');

  // «Наш ответ (Excel)» of two sheets: the prices from «цены», the volumes from «объем»
  await page.click('.tab[data-pane="compare"]');
  await page.setInputFiles('#cmpReplyFile', fr);
  await page.waitForFunction(() => app.compare_ui.reply, null, { timeout: 30 * 1000 });
  const after = await page.evaluate(() => ({ vol: app.vol, m8: app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8').market }));
  check(after.m8 === 16, 'the reply\'s prices are on the project (' + after.m8 + ')');
  const av = Object.values(after.vol);
  check(av.length === 2 && av.some((d) => near(d.v, 1.5)) && av.some((d) => d.v == null && d.note === NOTE), 'and its volumes on the works (' + JSON.stringify(av) + ')');
  check(near((await qty('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ')).qty2, 8), 'the quantities follow the volume of the reply');
  const done = await page.textContent('#cmpReplyDone').catch(() => '');
  check(/Лист «объем»: объёмов работ: строк 3, найдено 2, с объёмом по проекту 1, не найдено 1/.test(done) && /ТЕСТОВАЯ РАБОТА, КОТОРОЙ НЕТ/.test(done),
    'the tab says what of the volumes landed and what is not in the smeta (' + done.slice(done.indexOf('Лист'), done.indexOf('Лист') + 120) + ')');

  // a reply of volumes only
  await open(fw);
  await page.click('.tab[data-pane="compare"]');
  await page.setInputFiles('#cmpReplyFile', fv);
  await page.waitForFunction(() => Object.keys(app.vol).length === 2, null, { timeout: 30 * 1000 });
  check(await page.evaluate(() => !app.compare_ui.reply), 'a reply of volumes only sets the volumes and asks nothing of the comparison');

  check(!errors.length, 'no errors on the page' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
} catch (e) {
  check(false, 'the run: ' + (e && e.stack || e));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
