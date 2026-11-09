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
const { book, prices, xlsx } = require('./compare-books.cjs');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
const f1 = join(dir, 'Тест_v1.xlsx'), f2 = join(dir, 'Тест_v2.xlsx');
writeFileSync(f1, xlsx(S, book(1)));
writeFileSync(f2, xlsx(S, book(2)));

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

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? '\nFAILED: ' + fail : '\nall e2e-compare checks passed');
process.exit(fail ? 1 : 0);
