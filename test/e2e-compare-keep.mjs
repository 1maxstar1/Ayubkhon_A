/*
 * «Сравнение версий» inside a workspace: the files chosen on the tab — the returned smeta, our
 * reply, a first version given as a file — come back after a reload (Cmd+R / F5), with the same
 * view and filter, and stay with their workspace. Books are the invented ones of
 * test/compare-books.cjs.
 *
 *   node test/e2e-compare-keep.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'xlsx-write', 'smeta', 'assemble');
const { book, xlsx, replyBook } = require('./compare-books.cjs');

const dir = mkdtempSync(join(tmpdir(), 'cmpk-'));
const f1 = join(dir, 'Тест_v1.xlsx'), f2 = join(dir, 'Тест_v2.xlsx'), f3 = join(dir, 'Наш_ответ.xlsx');
writeFileSync(f1, xlsx(S, book(1)));
writeFileSync(f2, xlsx(S, book(2)));
writeFileSync(f3, xlsx(S, replyBook()));

const pb = await startServer({ port: 8141, registry: true, build: true });
const { api, su } = pb;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

const T = { timeout: 30 * 1000 };
const openApp = async (number) => {
  await page.fill('#appQ', number);
  await page.waitForFunction((n) => {
    const tr = document.querySelectorAll('#appTable tbody tr');
    return tr.length === 1 && tr[0].textContent.includes(n);
  }, number);
  await page.click('#appTable tbody tr button[data-act=open]');
  await page.waitForSelector('#screen-region:not([hidden])');
  await page.selectOption('#regionSel', 'fargona');
  await page.click('#regionForm button[type=submit]');
  await page.waitForSelector('#wsBox:not([hidden])');
};
/** Everything written: the upload queue is empty and the state is saved. */
const saved = () => page.waitForFunction(() => S.Sync.q && !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, T)
  .then(() => page.evaluate(() => S.Sync.q));
const cards = () => page.$$eval('.cmp-card', (cs) => cs.map((c) => c.innerText.replace(/\s+/g, ' ')).join(' | '));
const reload = async () => {
  await page.reload();
  await page.waitForSelector('#wsBox:not([hidden])', T);
};

try {
  await page.goto(pb.base + '/');
  await page.fill('#loginEmail', 'test@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await page.fill('#loginCode', pb.lastCode('test@example.com'));
  await page.click('#loginBtn');
  await page.waitForSelector('#screen-list:not([hidden])');

  await openApp(rows[0].number);
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => app.model && app.model.rows.length > 0, null, T);
  await page.click('.tab[data-pane="compare"]');

  // our reply, then the returned smeta
  await page.setInputFiles('#cmpReplyFile', f3);
  await page.waitForFunction(() => app.compare_ui.reply, null, T);
  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.res, null, T);
  await page.selectOption('#cmpView', 'rows');
  await page.selectOption('#cmpFilter', 'unasked');
  const before = { cards: await cards(), files: await page.textContent('.cmp-files').then((t) => t.replace(/ · \d+ мс$/, '')),
                   rows: await page.$$eval('#cmpBody tr', (t) => t.map((r) => r.innerText).join('\n')),
                   prices: await page.evaluate(() => JSON.stringify(Object.keys(app.prices).sort().map((k) => [k, app.prices[k]]))) };
  check(/замечания из файла «Наш_ответ\.xlsx»/.test(before.files), 'compared against the reply file (' + before.files + ')');
  await saved();
  const kept = await page.evaluate(() => S.Sync.ws.state && JSON.stringify(S.Sync.cmp));
  check(/Тест_v2/.test(kept) && /Наш_ответ/.test(kept), 'the workspace knows both files (' + kept + ')');
  check(await page.evaluate(() => S.Sync.ws.files.length) === 3, 'three files are stored: the project, the returned smeta, the reply');

  // Cmd+R
  await reload();
  await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.reply, null, T);
  check(await page.evaluate(() => document.getElementById('pane-compare').classList.contains('on')), 'after a reload the compare tab is open');
  check(await page.textContent('#cmpNewName') === 'Тест_v2.xlsx', 'the returned smeta is back');
  check(await page.inputValue('#cmpView') === 'rows' && await page.inputValue('#cmpFilter') === 'unasked', 'the view and the filter are as they were');
  const after = { cards: await cards(), files: await page.textContent('.cmp-files').then((t) => t.replace(/ · \d+ мс$/, '')),
                  rows: await page.$$eval('#cmpBody tr', (t) => t.map((r) => r.innerText).join('\n')),
                  prices: await page.evaluate(() => JSON.stringify(Object.keys(app.prices).sort().map((k) => [k, app.prices[k]]))) };
  check(after.cards === before.cards, 'the cards say the same');
  check(after.files === before.files, 'the same files and the same remarks (' + after.files + ')');
  check(after.rows === before.rows && after.rows.length > 0, 'the table shows the same lines');
  check(after.prices === before.prices, 'the prices are as they were left: bringing the reply back sets none' +
    (after.prices === before.prices ? '' : '\n  ' + before.prices + '\n  ' + after.prices));
  check(await page.evaluate(() => app.projects.length) === 1, 'neither file became a project');
  await saved();
  check(await page.evaluate(() => S.Sync.ws.files.length) === 3, 'a reload stores nothing twice');

  // a price typed after the reply stays: the reply brought back must not put its own over it
  const typed = await page.evaluate(() => {
    const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8');
    const p = {}; p[r.key] = 11; app.setPrices(p);
    return r.key;
  });
  await saved();
  await reload();
  await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.reply, null, T);
  check(await page.evaluate((k) => app.prices[k], typed) === 11, 'a price typed after the reply survives the reload');

  // another returned file replaces the stored one
  await page.setInputFiles('#cmpNewFile', { name: 'Тест_v3.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsx(S, book(2))) });
  await page.waitForFunction(() => app.compare_ui.newFile && app.compare_ui.newFile.name === 'Тест_v3.xlsx', null, T);
  await saved();
  check(await page.evaluate(() => S.Sync.ws.files.length) === 3, 'the replaced file is removed from the server');

  // «Было» as a file of its own: the reply read against the project no longer applies
  await page.setInputFiles('#cmpOldFile', f1);
  await page.waitForFunction(() => app.compare_ui.oldFile, null, T);
  await saved();
  check(await page.evaluate(() => S.Sync.ws.files.length) === 3 && await page.evaluate(() => !S.Sync.cmp.reply),
    'a first version given as a file is stored, and the reply read against the project is dropped');
  check(await page.inputValue('#cmpOld') === 'file' && /Было: <b>Тест_v1\.xlsx/.test(await page.innerHTML('.cmp-files')),
    'the file stays chosen as «Было» though a project is loaded');
  await reload();
  await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.oldFile, null, T);
  check(await page.inputValue('#cmpOld') === 'file' && /Файл: Тест_v1\.xlsx/.test(await page.textContent('#cmpOld')), '«Было» as a file is back after a reload');
  check(await page.textContent('#cmpNewName') === 'Тест_v3.xlsx', 'with the newer returned file');

  // back to the project: the file is let go
  await page.selectOption('#cmpOld', 'p0');
  await saved();
  check(await page.evaluate(() => S.Sync.ws.files.length) === 2, 'choosing the project again removes the first-version file');

  // each workspace has its own comparison
  await page.click('#wsList');
  await page.waitForSelector('#screen-list:not([hidden])');
  await openApp(rows[1].number);
  await page.click('.tab[data-pane="compare"]');
  check(await page.textContent('#cmpNewName') === 'не выбран' && await page.evaluate(() => !app.compare_ui.res && !app.compare_ui.newFile),
    'another workspace starts with an empty comparison');
  await page.click('#wsList');
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', rows[0].number);
  await page.waitForFunction((n) => {
    const tr = document.querySelectorAll('#appTable tbody tr');
    return tr.length === 1 && tr[0].textContent.includes(n);
  }, rows[0].number);
  await page.click('#appTable tbody tr button[data-act=open]');
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.waitForFunction(() => app.compare_ui.res, null, T);
  check(await page.textContent('#cmpNewName') === 'Тест_v3.xlsx', 'and the first one, opened from the list, has its own back');

  // «Наш ответ (Excel)» from the exports this application keeps on the server (F3)
  await page.click('#wsList');
  await page.waitForSelector('#screen-list:not([hidden])');
  await openApp(rows[2].number);
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => app.model && app.model.rows.length > 0 && S.Sync.ws.files.length === 1 && !S.Sync.loading, null, T);
  await page.evaluate(() => { const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8'); const p = {}; p[r.key] = 13; app.setPrices(p); });
  // every resource on the sheet: «Только изменённые» would leave out a change under the threshold, and the sheet empty
  await page.selectOption('#reportMode', 'dedup');
  const dl = page.waitForEvent('download', T);
  await page.click('#export');
  await dl;
  await page.waitForFunction(() => S.Sync.exportsList && S.Sync.exportsList.length === 1, null, T);
  await page.click('.tab[data-pane="compare"]');
  await page.click('#cmpReplyBtn');
  await page.waitForSelector('#replyPop:not([hidden])', T);
  const pop = await page.$$eval('#replyPop button', (b) => b.map((x) => x.textContent));
  check(pop.length === 2 && /Файл с диска/.test(pop[1]), '«Наш ответ» offers the export kept for this application, and the disk after (' + pop.join(' | ') + ')');
  await page.click('#replyPop button[data-i="0"]');
  await page.waitForFunction(() => app.compare_ui.reply, null, T).catch(async (e) => { console.log('toast: ' + await page.textContent('#toast')); throw e; });
  check(await page.isHidden('#replyPop'), 'the export is read as our reply, without a file dialog');
  // the reply sets its prices on the project: the one typed before the export is the one it carries
  check(await page.evaluate(() => { const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8'); return app.prices[r.key]; }) === 13,
    'and its price is the one the export was made with');

  // «Сравнить версию» from the list for a finished application (F4): the returned smeta goes straight to the compare tab
  await saved();
  await page.click('.tab[data-pane="prices"]');
  await page.click('#wsDone');
  await page.waitForFunction(() => document.querySelector('#wsBox .done'), null, T);
  await page.click('#wsList');
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', rows[2].number);
  await page.waitForFunction(() => document.querySelector('#appTable tbody tr button[data-act=cmpv]'), null, T);
  const chooser = page.waitForEvent('filechooser', T);
  await page.click('#appTable tbody tr button[data-act=cmpv]');
  await (await chooser).setFiles(f2);
  await page.waitForSelector('#wsBox:not([hidden])', T);
  await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.newFile, null, T);
  check(await page.evaluate(() => document.getElementById('pane-compare').classList.contains('on')) && await page.textContent('#cmpNewName') === 'Тест_v2.xlsx',
    '«Сравнить версию» opens the application on the compare tab, with the returned smeta compared');
  check(await page.evaluate(() => app.projects.length) === 1, 'the returned smeta did not become a project');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
} catch (e) {
  check(false, 'the run stopped: ' + (e.message || e).split('\n')[0]);
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await browser.close();
  pb.stop();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? '\nFAILED: ' + fail : '\nall e2e-compare-keep checks passed');
process.exit(fail ? 1 : 0);
