/*
 * «Сравнение версий» in a real browser (dist/smeta-taqqoslash.html): load the first version as a
 * project, price it, then read the returned version on the compare tab — statuses, filters, the
 * click from a resource to its lines, the export — and make sure the returned file never becomes
 * a project. Both versions are the invented ones of test/compare-books.cjs.
 *
 *   node test/e2e-compare.mjs
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
const { book, prices, xlsx, replyBook } = require('./compare-books.cjs');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
const f1 = join(dir, 'Тест_v1.xlsx'), f2 = join(dir, 'Тест_v2.xlsx');
writeFileSync(f1, xlsx(S, book(1)));
writeFileSync(f2, xlsx(S, book(2)));
const f3 = join(dir, 'Наш_ответ.xlsx');
writeFileSync(f3, xlsx(S, replyBook()));

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

try {
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
  // our table: the prices, and a threshold that fits invented prices of a few sum
  await page.evaluate((p) => { app.opts.minDiff = 1; app.opts.equipLimit = 20; app.setPrices(p); }, prices(S));

  // «Вид отчёта» says what the difference threshold kept off the sheet: one re-priced resource here (1 × 0.5),
  // and everything once the threshold is above every difference — an empty sheet is never left unexplained
  await page.click('.tab[data-pane="report"]');
  const note = () => page.evaluate(() => { const n = document.getElementById('reportNote'); return { shown: !n.hidden, all: n.classList.contains('all'), text: n.textContent.replace(/\s+/g, ' ').trim() }; });
  let n = await note();
  check(n.shown && !n.all && /Изменённых цен вне отчёта: 1 /.test(n.text), 'the report says one re-priced resource is under the threshold (' + n.text.slice(0, 60) + ')');
  await page.evaluate(() => { app.opts.minDiff = 1000; app.opts.equipLimit = 1e9; app.buildReportPreview(); });
  n = await note();
  check(n.shown && n.all && /В отчёте пусто: все изменённые цены \(6\)/.test(n.text) && /1 000 сум/.test(n.text), 'an emptied report says why, with the count and the threshold (' + n.text.slice(0, 70) + ')');
  await page.click('#reportNoteBtn');
  check(await page.isVisible('#pane-settings') && await page.evaluate(() => document.activeElement.id) === 'optMinDiff', 'its button leads to the threshold in the settings');
  await page.evaluate(() => { app.opts.minDiff = 0; app.opts.equipLimit = 20; app.buildReportPreview(); });
  check(!(await note()).shown, 'without a threshold there is nothing to say');
  await page.evaluate(() => { app.opts.minDiff = 1; app.buildReportPreview(); });

  // the list of projects folds to a strip that keeps its button, and comes back (folded to nothing, the whole
  // page went blank and only a reload brought it back)
  const widths = () => page.evaluate(() => ({ side: Math.round(document.getElementById('side').getBoundingClientRect().width),
    work: Math.round(document.getElementById('work').getBoundingClientRect().width), btn: document.getElementById('collapseAll').textContent,
    seen: !!document.getElementById('collapseAll').offsetParent, pane: !!document.querySelector('.pane.on, .pane:not([hidden])') }));
  await page.click('#collapseAll');
  let wd = await widths();
  check(wd.side > 0 && wd.side <= 40 && wd.work > 1300 && wd.btn === '+' && wd.seen, 'folding the list leaves a strip with «+» on it and gives the work area the room (' + JSON.stringify(wd) + ')');
  await page.click('#collapseAll');
  wd = await widths();
  check(wd.side > 250 && wd.btn === '–', 'and «+» brings the list back (' + wd.side + ' px)');

  await page.click('.tab[data-pane="compare"]');
  check(await page.isVisible('#pane-compare'), 'the compare tab opens');
  check(/исправленную смету/.test(await page.textContent('#cmpSummary')), 'before a file is chosen, the pane says what to do');
  check(await page.inputValue('#cmpOld') === 'p0', '«Было» is the loaded project');

  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.res, null, { timeout: 30 * 1000 });
  check(await page.evaluate(() => app.projects.length) === 1, 'the returned file is compared, not added as a project');

  const cards = await page.$$eval('.cmp-card', (cs) => cs.map((c) => c.innerText.replace(/\s+/g, ' ')));
  check(cards.some((c) => /ИСПРАВЛЕНО ПОЛНОСТЬЮ 1 ресурс/i.test(c)), 'fully fixed: the crane (' + cards[2] + ')');
  check(cards.some((c) => /ОСТАЛОСЬ ИСПРАВИТЬ 3 ресурса/i.test(c)), 'left to fix: М5, М8 and the bolt (' + cards[3] + ')');
  check(await page.textContent('#cmpNewName') === 'Тест_v2.xlsx', 'the returned file is named in the toolbar');

  const tones = await page.$$eval('#cmpBody tr[data-k]', (trs) => trs.map((t) => t.className + ':' + t.cells[0].textContent));
  check(tones[0].startsWith('t-bad:ТЕСТОВЫЙ БОЛТ'), 'the worst resource is first and red (' + tones[0] + ')');
  check(tones.some((t) => t === 't-part:ТЕСТОВЫЙ АНКЕР М5') && tones.some((t) => t === 't-good:ТЕСТОВЫЙ КРАН 10 Т'),
    'partial is amber, fixed is green');
  check(!tones.some((t) => /ЦЕМЕНТ/.test(t)), 'an unchanged resource is not in «Все изменения»');

  await page.selectOption('#cmpView', 'rows');
  await page.selectOption('#cmpFilter', 'problems');
  const probs = await page.$$eval('#cmpBody tr', (trs) => trs.map((t) => t.cells[2].textContent));
  check(probs.length === 8, 'lines that need attention: М5 left, М8, bolt, screw, plank, glue, dowel, renamed film (' + probs.length + ')');

  // the card of changes nobody asked about opens exactly those lines, before → after with the amount
  await page.click('.cmp-card[data-go="unasked"]');
  check(await page.inputValue('#cmpFilter') === 'unasked' && await page.inputValue('#cmpView') === 'rows', 'the card switches to «Без нашего замечания»');
  const un = await page.$$eval('#cmpBody tr', (trs) => trs.map((t) => t.cells[2].innerText.replace(/\s+/g, ' ') + ' ' + t.cells[10].textContent));
  check(un.length === 5, 'five lines changed without our remark (' + un.length + ')');
  check(un.some((s) => /ТЕСТОВАЯ ПЛЁНКА ТЕСТОВАЯ ПЛЁНКА 0,2 ММ/.test(s)), 'the renamed line shows the old name struck and the new one');
  check(un.some((s) => /ТЕСТОВЫЙ КЛЕЙ \+9/.test(s)), 'the new line shows its amount (+9)');

  // the sheet totals: the changed percentage and the typed total are red
  await page.click('.cmp-card[data-go="sheets"]');
  const amt = await page.$$eval('#cmpBody tr', (trs) => trs.map((t) => t.className + ':' + t.cells[1].innerText.replace(/\s+/g, ' ')));
  check(amt.some((s) => /^t-bad:ТРАНСПОРТНЫЕ УСЛУГИ=5% ТРАНСПОРТНЫЕ УСЛУГИ=7%/.test(s)), 'the overhead whose percentage changed is red with both texts');
  check(amt.some((s) => /^t-bad:ИТОГО СТРОИТЕЛЬНЫЕ/.test(s)), 'the band total typed over is red');
  check(amt.some((s) => /^t-head:Строки ресурсов/.test(s)), 'each sheet starts with the sum of its resource lines');

  await page.selectOption('#cmpView', 'res');
  await page.selectOption('#cmpFilter', 'changed');
  await page.click('#cmpBody tr[data-k]:has-text("ТЕСТОВЫЙ АНКЕР М5")');
  const m5 = await page.$$eval('#cmpBody tr', (trs) => trs.map((t) => t.className + ':' + t.cells[0].textContent));
  check(m5.length === 2 && /^t-good:№ 1 — ОБЩЕСТРОИТЕЛЬНЫЕ/.test(m5[0]) && /^t-bad:ТЕСТОВОЕ ОБОРУДОВАНИЕ/.test(m5[1]),
    'a click on a resource lists its lines: fixed in one estimate, left in the other (' + m5.join(' | ') + ')');
  check(await page.isVisible('[data-back]') && /АНКЕР М5/.test(await page.textContent('#cmpHead')), 'a back button names the resource');
  await page.click('[data-back]');
  check(await page.inputValue('#cmpView') === 'res' && (await page.$$('#cmpBody tr[data-k]')).length > 2, 'the back button returns to the resource list');
  await page.click('#cmpBody tr[data-k]:has-text("ТЕСТОВЫЙ АНКЕР М5")');
  await page.keyboard.press('Escape');
  check((await page.$$('#cmpBody tr[data-k]')).length > 2, 'Esc returns too');

  // the pane scrolls to its last line in a small window; the page itself does not grow
  await page.setViewportSize({ width: 1000, height: 560 });
  const box = await page.evaluate(() => {
    const p = document.getElementById('pane-compare');
    p.scrollTop = p.scrollHeight;
    const rows = document.querySelectorAll('#cmpBody tr');
    return { scrolls: p.scrollHeight > p.clientHeight, last: rows[rows.length - 1].getBoundingClientRect().bottom, h: innerHeight,
             doc: document.documentElement.scrollHeight };
  });
  check(box.scrolls && box.last <= box.h + 1 && box.doc <= box.h + 1, 'the table scrolls inside its pane down to the last line (' + JSON.stringify(box) + ')');
  await page.setViewportSize({ width: 1500, height: 950 });

  // a price edited after the file was read changes what was asked: the tab reads the table again
  await page.click('.tab[data-pane="prices"]');
  await page.evaluate(() => {
    const k = app.model.resources.find((r) => r.name === 'ТЕСТОВЫЙ ШУРУП').key;
    const p = {}; p[k] = 6; app.setPrices(p);   // asked up to 6 (1 × 3 is over the threshold); the sender wrote 4
  });
  await page.click('.tab[data-pane="compare"]');
  await page.selectOption('#cmpView', 'res');
  await page.selectOption('#cmpFilter', 'changed');
  const screw = await page.$eval('#cmpBody tr[data-k]:has-text("ТЕСТОВЫЙ ШУРУП")', (t) => t.className + ':' + t.cells[9].textContent);
  check(/^t-good:Исправлено/.test(screw), 'the screw, raised towards a price set since, is judged against it (' + screw + ')');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cmpExport')]);
  const out = join(dir, 'out.xlsx');
  await dl.saveAs(out);
  check(dl.suggestedFilename() === 'Тест_v2_sravnenie.xlsx', 'the export is named after the returned file (' + dl.suggestedFilename() + ')');
  const back = S.readXlsx(new Uint8Array(readFileSync(out)));
  check(back.sheets.map((s) => s.name).join('|') === 'По ресурсам|По строкам|Итоги листов', 'the export has its three sheets');

  // «Наш ответ (Excel)»: a fresh page, the first version without any price typed; the reply file
  // puts its prices on the project and becomes what is judged
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
  await page.click('.tab[data-pane="compare"]');
  await page.setInputFiles('#cmpReplyFile', f3);
  await page.waitForFunction(() => app.compare_ui.reply, null, { timeout: 30 * 1000 });
  const priced = await page.evaluate(() => {
    const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8');
    return r && r.market;
  });
  check(priced === 16, 'the reply\'s price is now the project\'s market price (' + priced + ')');
  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.res, null, { timeout: 30 * 1000 });
  const files = await page.textContent('.cmp-files');
  check(/замечания из файла «Наш_ответ\.xlsx»: 6 \(строк в файле 7\)/.test(files), 'the summary says the remarks come from the file (' + files + ')');
  check(/Не найдено в смете: 1/.test(await page.textContent('#cmpSummary')), 'the line the smeta does not have is listed');
  await page.selectOption('#cmpView', 'res');
  await page.selectOption('#cmpFilter', 'changed');
  const rtones = await page.$$eval('#cmpBody tr[data-k]', (trs) => trs.map((t) => t.className + ':' + t.cells[0].textContent));
  check(rtones.includes('t-good:ТЕСТОВЫЙ КРАН 10 Т') && rtones.includes('t-part:ТЕСТОВЫЙ АНКЕР М5'), 'judged against the reply: crane fixed, М5 partial');

  // the same file through «Книга цен» puts the same prices on the project
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
  await page.setInputFiles('#bookInput', f3);
  await page.waitForFunction(() => {
    const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8');
    return r && r.market === 16;
  }, null, { timeout: 30 * 1000 }).then(() => check(true, '«Книга цен» reads the reply by smeta price too'),
    () => check(false, '«Книга цен» reads the reply by smeta price too'));
  const m5book = await page.evaluate(() => app.model.resources.filter((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М5').map((x) => x.price + '→' + x.market).join(' '));
  check(m5book === '17→15', 'only the line of the smeta price the reply names is priced (' + m5book + ')');

  // the tab open before the project is there (a reload on «Сравнение версий»: the workspace brings its
  // projects back after the tab is shown) — «Было» must follow, and the returned file must still compare
  await page.goto('about:blank');
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html') + '#tab=compare');
  await page.waitForFunction(() => window.app && document.getElementById('pane-compare').classList.contains('on'));
  check(await page.inputValue('#cmpOld') === 'file', 'with no project yet, «Было» can only be a file');
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
  check(await page.inputValue('#cmpOld') === 'p0', '«Было» turns to the project once it arrives');
  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.res, null, { timeout: 30 * 1000 });
  check(true, 'and the returned file compares');
  await page.evaluate(() => { app.compare_ui.res = null; });
  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.res, null, { timeout: 30 * 1000 })
    .then(() => check(true, 'the same file can be chosen again'), () => check(false, 'the same file can be chosen again'));

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? '\nFAILED: ' + fail : '\nall e2e-compare checks passed');
process.exit(fail ? 1 : 0);
