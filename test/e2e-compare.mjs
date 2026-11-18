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
// the same reply printed to PDF (test/pdf-make.cjs: as «Microsoft: Print To PDF» prints it)
const fPdf = join(dir, 'Наш_ответ.pdf');
writeFileSync(fPdf, require('./pdf-make.cjs').bookPdf(replyBook(), { perPage: 4 }));

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

  // A price box given something that is not a number. It used to put the estimate's price back without a word.
  await page.click('.tab[data-pane="prices"]');
  const pbox = page.locator('#priceScroll .pin').first();
  const boxState = () => page.evaluate(() => { const i = document.querySelector('#priceScroll .pin'); const r = app.model.resources.find((x) => x.key === i.dataset.key);
    return { market: r.market, price: r.price, bad: i.classList.contains('bad') }; });
  const boxStart = await boxState();
  await pbox.click();
  await pbox.fill('98 765 сум');
  let boxNow = await boxState();
  check(boxNow.market === boxStart.market && boxNow.bad, 'text that is not a number changes nothing, and the box is marked (' + boxNow.market + ')');
  await page.keyboard.press('Tab');
  check(/Цена не изменена: «98 765 сум» не читается как число/.test(await page.textContent('#toast')) && (await boxState()).market === boxStart.market && !(await boxState()).bad,
    'leaving the box says so; the price is what it was');
  await pbox.click();
  await pbox.fill('1,234.5');
  boxNow = await boxState();
  check(boxNow.market === 1234.5 && !boxNow.bad, 'a number with its thousands grouped is read (1,234.5 → ' + boxNow.market + ')');
  await pbox.fill('');
  check((await boxState()).market === boxStart.price, 'an emptied box is the estimate\'s price again');
  await page.evaluate((m) => { const i = document.querySelector('#priceScroll .pin'); app.setPrice(i.dataset.key, m); app.prices_ui.apply(); }, boxStart.market);
  await page.click('.tab[data-pane="report"]');

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
  // no corrected smeta yet (old work fed for learning has none): the tab says the reply landed and what did not
  const done = await page.textContent('#cmpReplyDone').catch(() => '');
  check(/Наш ответ применён/.test(done) && /строк 7, найдено в смете 6/.test(done) && /не найдено 1/.test(done) && /Исправленная смета не обязательна/.test(done) &&
    /Не найдено в смете: 1/.test(done), 'without a corrected smeta the tab says the reply was applied, what was not found, and that the corrected smeta is optional');
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

  // «Наш ответ (Excel/PDF)» given the PDF: the same prices on the project, the same remarks
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
  await page.click('.tab[data-pane="compare"]');
  check(/\.pdf/.test(await page.getAttribute('#cmpReplyFile', 'accept')) && /PDF/.test(await page.textContent('#cmpReplyBtn')),
    'the reply button takes a PDF and says so');
  await page.setInputFiles('#cmpReplyFile', fPdf);
  await page.waitForFunction(() => app.compare_ui.reply, null, { timeout: 30 * 1000 }).catch(() => {});
  const pdfPriced = await page.evaluate(() => {
    const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8');
    return r && r.market;
  });
  const pdfDone = await page.textContent('#cmpReplyDone').catch(() => '');
  check(pdfPriced === 16 && /Наш ответ применён/.test(pdfDone) && /Наш_ответ\.pdf/.test(pdfDone) && /строк 7, найдено в смете 6/.test(pdfDone),
    'the reply as a PDF puts the same prices on the project and says what landed (' + pdfPriced + ' · ' + pdfDone.slice(0, 120) + ')');
  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.res, null, { timeout: 30 * 1000 });
  check(/замечания из файла «Наш_ответ\.pdf»: 6 \(строк в файле 7\)/.test(await page.textContent('.cmp-files')),
    'the corrected smeta is judged against the PDF reply: 6 remarks of 7 lines');
  // … and through «Книга цен»
  await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
  await page.setInputFiles('#bookInput', fPdf);
  await page.waitForFunction(() => {
    const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8');
    return r && r.market === 16;
  }, null, { timeout: 30 * 1000 }).then(() => check(true, '«Книга цен» reads the PDF reply too'),
    () => check(false, '«Книга цен» reads the PDF reply too'));
  // a PDF given as a smeta: said what it is and where it goes, and it does not become a project
  {
    await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
    await page.setInputFiles('#pick', fPdf);
    await page.waitForFunction(() => /это PDF.*Наш ответ \(Excel\/PDF\)/.test(document.getElementById('toast').textContent), null, { timeout: 30 * 1000 })
      .then(() => check(true, 'a PDF given as a smeta is said to be a PDF, with where the PDF reply goes'),
        async () => check(false, 'a PDF given as a smeta is said to be a PDF (' + await page.textContent('#toast') + ')'));
    check(await page.evaluate(() => app.projects.length) === 0, 'the PDF does not become a project');
  }

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

  // The worker that reads a file stops answering. The page used to say «Чтение файлов…» for ever; now the file
  // it was on is given up after its time, the worker is replaced, and the file waiting behind it is read.
  const fStuck = join(dir, 'Зависший.xlsx'), fNext = join(dir, 'Следующий.xlsx');
  writeFileSync(fStuck, xlsx(S, book(1)));
  writeFileSync(fNext, xlsx(S, book(2)));
  const had = await page.evaluate(() => {
    app.readLimit = 700;
    const w = app.worker, send = w.postMessage.bind(w);
    let first = true;
    w.postMessage = (m, t) => { if (first) { first = false; return; } send(m, t); };   // the first file is never answered
    window.__oldWorker = w;
    return app.projects.length;
  });
  await page.setInputFiles('#pick', [fStuck, fNext]);
  await page.waitForFunction((n) => app.projects.length === n + 1 && app.pending === 0, had, { timeout: 30 * 1000 });
  // which of the two reaches the worker first is the browser's business: one is never answered, the other is read
  const gaveUp = /(Зависший|Следующий)\.xlsx: не прочитан за 1 секунд/.exec(await page.textContent('#toast'));
  check(!!gaveUp, 'a file the worker never answers for is reported as unreadable');
  const other = gaveUp && gaveUp[1] === 'Зависший' ? 'Следующий.xlsx' : 'Зависший.xlsx';
  check(await page.evaluate((f) => app.projects[app.projects.length - 1].file === f && app.worker !== window.__oldWorker && !document.getElementById('busy').classList.contains('on'), other),
    'the worker is replaced, the other file is read, and the page is not left «reading»');

  // an application of two estimates (a road and its lighting): our reply is one table for both, and «Было» is the
  // road — the line that only the lighting has is found there too, and priced
  {
    const { sheet } = require('./compare-books.cjs');
    const f4 = join(dir, 'Тест_освещение.xlsx');
    writeFileSync(f4, xlsx(S, { sheets: [sheet('Освещение', [['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВОЕ ОСВЕЩЕНИЕ'], [],
      ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'], [1, 2, 3, 4, 5, 6],
      ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], [1, 'ТЕСТОВЫЙ РЕСУРС, КОТОРОГО НЕТ', 'ШТ', 10, 3, 30], ['ИТОГО', null, 'СУМ', null, null, 30]])] }));
    await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
    await page.setInputFiles('#pick', [f1, f4]);
    await page.waitForFunction(() => window.app && app.projects.length === 2 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
    await page.click('.tab[data-pane="compare"]');
    check(await page.inputValue('#cmpOld') === 'p0', '(«Было» is the road)');
    await page.setInputFiles('#cmpReplyFile', f3);
    await page.waitForFunction(() => app.compare_ui.reply, null, { timeout: 30 * 1000 });
    const done2 = await page.textContent('#cmpReplyDone').catch(() => '');
    const lit = await page.evaluate(() => { const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ РЕСУРС, КОТОРОГО НЕТ'); return r && r.market; });
    check(/строк 7, найдено в смете 7/.test(done2) && !/не найдено/.test(done2) && lit === 2,
      'a reply for an application of two estimates finds its lines in both, and prices the lighting\'s line too (' + lit + ')');
  }

  // … and its corrected files, the road's and the lighting's, chosen together in the other order: each with its own
  {
    const f5 = join(dir, 'Тест_освещение_испр.xlsx');
    const { sheet } = require('./compare-books.cjs');
    writeFileSync(f5, xlsx(S, { sheets: [sheet('Освещение', [['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВОЕ ОСВЕЩЕНИЕ'], [],
      ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'], [1, 2, 3, 4, 5, 6],
      ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], [1, 'ТЕСТОВЫЙ РЕСУРС, КОТОРОГО НЕТ', 'ШТ', 10, 2, 20], ['ИТОГО', null, 'СУМ', null, null, 20]])] }));
    await page.setInputFiles('#cmpNewFile', [f5, f2]);
    await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.newFile && app.compare_ui.newFile.parts.length === 2, null, { timeout: 30 * 1000 });
    const r2 = await page.evaluate(() => {
      const res = app.compare_ui.res, rows = [].concat(...res.objects.map((o) => o.rows));
      const lit = rows.find((r) => r.nm === 'ТЕСТОВЫЙ РЕСУРС, КОТОРОГО НЕТ');
      return { name: document.getElementById('cmpNewName').textContent, only: res.objects.filter((o) => o.only).length,
        objects: res.objects.map((o) => o.name), lit: lit && [lit.p1, lit.p2, lit.object], added: rows.filter((r) => r.st === 'added' || r.st === 'removed').length };
    });
    check(r2.name === 'Тест_освещение_испр.xlsx + Тест_v2.xlsx' && r2.only === 0 && r2.lit && r2.lit[0] === 3 && r2.lit[1] === 2 && /^Тест_освещение\.xlsx · /.test(r2.lit[2]),
      'two corrected files chosen together: the lighting\'s price change is found on the lighting, every sheet has its pair (' + JSON.stringify(r2) + ')');
  }

  // a summary book loaded with the estimates («ОБЩИЙ ИТОГ»: one sheet copying both): switched off and said, so that no
  // resource is counted twice
  {
    const { sheet, estimate, line } = require('./compare-books.cjs');
    const fSum = join(dir, 'ОБЩИЙ_ИТОГ.xlsx');
    const roadLines = book(1).sheets[0].rows.slice(1).map((cs) => (cs || []).slice(1).map((c) => (c ? c.v : null)));
    const lamp = estimate('ТЕСТОВОЕ ОСВЕЩЕНИЕ', [[null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], line(1, 'ТЕСТОВЫЙ РЕСУРС, КОТОРОГО НЕТ', 'ШТ', 10, 3)], { no: 3, direct: 30 });
    writeFileSync(fSum, xlsx(S, { sheets: [sheet('свод', [['СВОДНЫЙ РАСЧЁТ'], ['ИТОГО', 1]]), sheet('Лист2', [...roadLines, ...lamp])] }));
    await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
    await page.setInputFiles('#pick', [f1, join(dir, 'Тест_освещение.xlsx'), fSum]);
    await page.waitForFunction(() => window.app && app.projects.length === 3 && app.model && app.pending <= 0, null, { timeout: 30 * 1000 });
    await page.waitForTimeout(500);
    const r3 = await page.evaluate(() => ({ on: app.projects.map((p) => p.file + ':' + (p.enabled !== false)), toast: document.getElementById('toast').textContent,
      crane: app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ КРАН 10 Т').qty,
      // nothing went wrong: the message is a notice with its «×», not an error
      kind: [...document.querySelectorAll('#toast .toast-item')].filter((e) => /повторяет строки смет/.test(e.textContent))
        .map((e) => (e.classList.contains('err') ? 'error' : 'notice') + (e.querySelector('.toast-x') ? '+x' : '')).join() }));
    check(r3.on.join(' ') === 'Тест_v1.xlsx:true Тест_освещение.xlsx:true ОБЩИЙ_ИТОГ.xlsx:false' && /ОБЩИЙ_ИТОГ\.xlsx» повторяет строки смет/.test(r3.toast) && r3.crane === 2 && r3.kind === 'notice+x',
      'a summary book copying the estimates is switched off and said: every resource counted once (' + JSON.stringify(r3).slice(0, 300) + ')');
  }

  // the corrected file the sender returned, loaded as one more estimate (64453): it is the same estimate — switched off and
  // said, where it goes instead; dropped on «Сравнение версий» it is the corrected file to compare, never one more estimate
  {
    const fx = book(1);
    fx.sheets[0].rows.forEach((cs) => {
      const k = (cs || []).findIndex((c) => c && c.v === 'ТЕСТОВЫЙ АНКЕР М8');
      if (k > 0) { cs[k + 3] = { v: 15 }; if (cs[k + 4]) cs[k + 4] = { v: 45 }; }
    });
    const fFix = join(dir, 'Тест_v1_испр.xlsx');
    writeFileSync(fFix, xlsx(S, fx));
    await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
    await page.setInputFiles('#pick', f1);
    await page.waitForFunction(() => window.app && app.projects.length === 1 && app.model && app.pending <= 0, null, { timeout: 30 * 1000 });
    await page.setInputFiles('#pick', fFix);
    await page.waitForFunction(() => app.projects.length === 2 && app.pending <= 0, null, { timeout: 30 * 1000 });
    await page.waitForTimeout(300);
    const v = await page.evaluate(() => ({ on: app.projects.map((p) => p.file + ':' + (p.enabled !== false)), toast: document.getElementById('toast').textContent,
      crane: app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ КРАН 10 Т').qty }));
    check(v.on.join(' ') === 'Тест_v1.xlsx:true Тест_v1_испр.xlsx:false' &&
      /«Тест_v1_испр\.xlsx» — другая версия сметы «Тест_v1\.xlsx» \(те же строки и количества, другая цена в 1 стр\.\)/.test(v.toast) &&
      /вкладке «Сравнение версий»/.test(v.toast) && v.crane === 2,
      'a corrected file loaded as an estimate is switched off and said where it goes: every resource counted once (' + JSON.stringify(v).slice(0, 260) + ')');
    // dropped on «Сравнение версий»: the PDF is our reply, the spreadsheet the corrected file — no estimate is added
    await page.click('.tab[data-pane="compare"]');
    const data = [fPdf, fFix].map((f) => ({ name: f.split('/').pop(), b64: readFileSync(f).toString('base64') }));
    await page.evaluate((files) => {
      const dt = new DataTransfer();
      files.forEach((d) => { const bin = atob(d.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], d.name)); });
      document.getElementById('cmpSummary').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, data);
    await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.reply && app.compare_ui.newFile, null, { timeout: 30 * 1000 });
    const d = await page.evaluate(() => ({ n: app.projects.length, name: document.getElementById('cmpNewName').textContent, reply: app.compare_ui.reply.name,
      fixed: [].concat(...app.compare_ui.res.objects.map((o) => o.rows)).filter((r) => r.nm === 'ТЕСТОВЫЙ АНКЕР М8').map((r) => r.p2).join() }));
    check(d.n === 2 && d.name === 'Тест_v1_испр.xlsx' && d.reply === 'Наш_ответ.pdf' && d.fixed === '15',
      'files dropped on «Сравнение версий» go to the comparison: the reply and the corrected file, no estimate added (' + JSON.stringify(d) + ')');

    // our own Таблица №2 loaded as an estimate: refused and said where it goes (its full sheet reads as an estimate)
    const [dlT] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
    const fOurs = join(dir, 'Наша_таблица.xlsx');
    await dlT.saveAs(fOurs);
    await page.setInputFiles('#pick', fOurs);
    await page.waitForFunction(() => /наша Таблица №2/.test(document.getElementById('toast').textContent), null, { timeout: 30 * 1000 });
    check(await page.evaluate(() => app.projects.length) === 2 && /Наш ответ \(Excel\/PDF\)/.test(await page.textContent('#toast')),
      'our own Таблица №2 loaded as an estimate is refused and said where it goes');
  }

  // the comparison checks itself: one corrected file compared with another estimate's is said over the cards; with the
  // files of both estimates the list says which was compared with which, and an estimate without a file stands unchanged
  {
    const fL = join(dir, 'Тест_освещение.xlsx'), fLx = join(dir, 'Тест_освещение_испр.xlsx');
    await page.goto('file://' + join(root, 'dist/smeta-taqqoslash.html'));
    await page.setInputFiles('#pick', [f1, fL]);
    await page.waitForFunction(() => window.app && app.projects.length === 2 && app.model && app.pending <= 0, null, { timeout: 30 * 1000 });
    await page.click('.tab[data-pane="compare"]');
    await page.selectOption('#cmpOld', 'p0');
    await page.setInputFiles('#cmpNewFile', fLx);
    await page.waitForFunction(() => app.compare_ui.res, null, { timeout: 30 * 1000 });
    const w = await page.evaluate(() => ({ doubts: app.compare_ui.doubts, box: (document.querySelector('#cmpSummary .cmp-doubt') || {}).textContent || '' }));
    check(w.doubts.some((t) => /больше похож на смету «Тест_освещение\.xlsx», а сравнивается с «Тест_v1\.xlsx»/.test(t)) && /Проверьте сравнение/.test(w.box),
      'a corrected file compared with another estimate\'s: said over the cards (' + w.doubts.join(' | ').slice(0, 200) + ')');
    await page.selectOption('#cmpOld', 'p1');
    await page.waitForFunction(() => app.compare_ui.doubts && !app.compare_ui.doubts.length, null, { timeout: 30 * 1000 });
    check(!(await page.$('#cmpSummary .cmp-doubt')), 'compared with its own estimate, nothing is doubted');
    await page.setInputFiles('#cmpNewFile', [fLx, f2]);
    await page.waitForFunction(() => app.compare_ui.newFile && app.compare_ui.newFile.parts.length === 2 && app.compare_ui.pairs && app.compare_ui.pairs.pairs.length === 2, null, { timeout: 30 * 1000 });
    const pb = (await page.textContent('#cmpSummary .cmp-pairs')).replace(/\s+/g, ' ');
    check(/Сопоставление файлов: пар 2/.test(pb) && /«Тест_освещение_испр\.xlsx» ↔ «Тест_освещение\.xlsx»/.test(pb) && /«Тест_v2\.xlsx» ↔ «Тест_v1\.xlsx»/.test(pb),
      'the list says which corrected file was compared with which estimate (' + pb.slice(0, 160) + ')');
  }

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? '\nFAILED: ' + fail : '\nall e2e-compare checks passed');
process.exit(fail ? 1 : 0);
