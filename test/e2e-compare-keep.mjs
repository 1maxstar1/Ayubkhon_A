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
const { book, xlsx, replyBook, bookWithWorks } = require('./compare-books.cjs');

const dir = mkdtempSync(join(tmpdir(), 'cmpk-'));
const f1 = join(dir, 'Тест_v1.xlsx'), f2 = join(dir, 'Тест_v2.xlsx'), f3 = join(dir, 'Наш_ответ.xlsx');
writeFileSync(f1, xlsx(S, book(1)));
writeFileSync(f2, xlsx(S, book(2)));
writeFileSync(f3, xlsx(S, replyBook()));
const f4 = join(dir, 'Тест_объёмы.xlsx');
writeFileSync(f4, xlsx(S, bookWithWorks()));
const f5 = join(dir, 'Тест_объёмы_испр.xlsx');           // the corrected file of f4, unchanged
writeFileSync(f5, xlsx(S, bookWithWorks()));

const pb = await startServer({ port: 8141, registry: true, build: true });
const { api, su } = pb;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const rows = pb.rows().slice(0, 4);
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
  // (the crane at the price the returned estimate has for it: «Исправлено» there, used further down)
  await page.evaluate(() => { const r = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ АНКЕР М8'), c = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ КРАН 10 Т');
    const p = {}; p[r.key] = 13; p[c.key] = 11; app.setPrices(p); });
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
  await page.waitForSelector('#finishBox:not([hidden])', T);
  await page.click('#finOk');
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
  // the corrected prices the returned estimate took are marked in what was remembered of the application (docs/ai-reja.md)
  await page.waitForFunction(() => S.Journal.acceptedSig, null, T);
  await new Promise((r) => setTimeout(r, 800));
  const fixedKeys = await page.evaluate(() => Object.keys(S.Journal.fixedKeys()));
  const wsId = await page.evaluate(() => S.Sync.ws.id);
  const memRows = (await api(`/api/collections/price_memory/records?perPage=500&filter=${encodeURIComponent(`workspace='${wsId}'`)}`, {}, su)).items;
  const acc = memRows.filter((r) => r.accepted).map((r) => r.res_key).sort();
  check(memRows.length > 0 && acc.length >= 1 && memRows.find((r) => r.accepted).name === 'ТЕСТОВЫЙ КРАН 10 Т' &&
    JSON.stringify(acc) === JSON.stringify(memRows.filter((r) => r.kind === 'corrected' && fixedKeys.includes(r.res_key)).map((r) => r.res_key).sort()),
    `«Исправлено» of the comparison marks the remembered corrected prices as accepted (${acc.length} of ${fixedKeys.length} fixed, ${memRows.length} remembered)`);
  // no comparison on screen (its file not back, another «Было») says nothing about what the contractor took: the marks stay
  await page.evaluate(() => { app.compare_ui.res = null; S.Journal.acceptedSig = ''; S.Journal.accepted(); });
  await new Promise((r) => setTimeout(r, 800));
  const acc2 = (await api(`/api/collections/price_memory/records?perPage=500&filter=${encodeURIComponent(`workspace='${wsId}'`)}`, {}, su)).items
    .filter((r) => r.accepted).map((r) => r.res_key).sort();
  check(JSON.stringify(acc2) === JSON.stringify(acc), 'no comparison on screen leaves the marks as they are');
  // a first version from outside (a file): its comparison says nothing about what the contractor took of our prices
  const posts = [];
  page.on('request', (rq) => { if (/\/api\/memory\/accepted/.test(rq.url())) posts.push(rq.url()); });
  await page.evaluate(() => { S.Journal.acceptedSig = ''; });
  await page.setInputFiles('#cmpOldFile', f1);
  await page.waitForFunction(() => app.compare_ui.oldFile && app.compare_ui.res, null, T);
  await new Promise((r) => setTimeout(r, 800));
  const acc3 = (await api(`/api/collections/price_memory/records?perPage=500&filter=${encodeURIComponent(`workspace='${wsId}'`)}`, {}, su)).items
    .filter((r) => r.accepted).map((r) => r.res_key).sort();
  check(posts.length === 0 && JSON.stringify(acc3) === JSON.stringify(acc), 'an outside file as «Было» posts nothing: the marks stay as they are (' + posts.length + ' posts)');

  // «Объёмы работ»: the volumes and the quantities set by hand are kept with the application (src/ui/volumes.js)
  await page.click('#wsList');
  await page.waitForSelector('#screen-list:not([hidden])');
  await openApp(rows[3].number);
  await page.setInputFiles('#pick', f4);
  await page.waitForFunction(() => app.model && app.model.rows.length > 0 && S.Sync.ws.files.length === 1 && !S.Sync.loading, null, T);
  await page.evaluate(() => {
    const w = S.Volumes.works().find((x) => x.name === 'ТЕСТОВАЯ КЛАДКА СТЕН'), c = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ КРАН 10 Т');
    app.vol[w.key] = { v: 1.5, note: 'по рабочему проекту' };
    app.qtys[c.key] = 3;
    app.rebuild();
  });
  await saved();
  await reload();
  await page.waitForFunction(() => app.model && app.model.rows.length > 0 && !S.Sync.loading, null, T);
  const q = await page.evaluate(() => {
    const by = (n) => app.model.resources.find((x) => x.name === n);
    return { vol: Object.values(app.vol), labour: by('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ').qty2, crane: by('ТЕСТОВЫЙ КРАН 10 Т').qty2, works: S.Volumes.works().length };
  });
  check(q.works === 2 && q.vol.length === 1 && q.vol[0].v === 1.5 && q.vol[0].note === 'по рабочему проекту',
    'after a reload the works are read again and the volume decided is back (' + JSON.stringify(q.vol) + ')');
  check(Math.abs(q.labour - 8) < 1e-9 && q.crane === 3, 'and the quantities follow it, with the one set by hand (' + q.labour + ', ' + q.crane + ')');

  // a total set by hand is saved so that the version before v2.16.1 reads it too: a bare number in `qtys`, the estimate's
  // total it was set against in `qtyBase` beside it — and read back whole
  const crane = await page.evaluate(() => { const c = app.model.resources.find((x) => x.name === 'ТЕСТОВЫЙ КРАН 10 Т'); app.qtys[c.key] = { v: 5, base: c.qty }; app.rebuild(); return { key: c.key, qty: c.qty }; });
  await page.evaluate(() => S.Sync.touch && S.Sync.touch());
  await saved();
  const st = (await api('/api/collections/workspaces/records/' + (await page.evaluate(() => S.Sync.ws.id)), {}, su)).state;
  check(st.qtys[crane.key] === 5 && st.qtyBase && st.qtyBase[crane.key] === crane.qty,
    'saved as the page before v2.16.1 reads it: a bare total in «qtys», the total it was set against in «qtyBase» (' + JSON.stringify([st.qtys[crane.key], st.qtyBase && st.qtyBase[crane.key]]) + ')');
  await reload();
  await page.waitForFunction(() => app.model && app.model.rows.length > 0 && !S.Sync.loading, null, T);
  const back = await page.evaluate((k) => app.qtys[k], crane.key);
  check(back && back.v === 5 && back.base === crane.qty, 'and read back whole (' + JSON.stringify(back) + ')');
  // set against another total of the estimate (an object left out, the file replaced): it waits — marked beside the quantity
  const wait = await page.evaluate((k) => {
    app.qtys[k] = { v: 5, base: 999 }; app.rebuild();
    const r = app.model.resources.find((x) => x.key === k);
    app.prices_ui && app.prices_ui.apply && app.prices_ui.apply(true);
    const cell = document.querySelector('button.qe[data-qe="' + CSS.escape(k) + '"]');
    return { qty2: r.qty2 == null ? null : r.qty2, wait: r.qtyWait, cell: cell ? cell.textContent : '', title: cell && cell.querySelector('.wait') ? cell.querySelector('.wait').title : '' };
  }, crane.key);
  check(wait.qty2 !== 5 && wait.wait && wait.wait.v === 5 && /⏸/.test(wait.cell) && /не применяется/.test(wait.title),
    'a total set against another estimate total waits: not applied, and marked beside the quantity (' + JSON.stringify(wait).slice(0, 200) + ')');
  // a total equal to the estimate's, with no volume moving it: no change to show — no «2 → 2» row in Table №1
  const same = await page.evaluate((c) => {
    app.qtys[c.key] = { v: c.qty, base: c.qty }; app.rebuild();
    const r = app.model.resources.find((x) => x.key === c.key);
    return { auto: r.qtyAuto, rows: S.Volumes.resRows().filter((x) => x.name === 'ТЕСТОВЫЙ КРАН 10 Т').length };
  }, crane);
  check(same.auto == null && same.rows === 0, 'a total equal to the estimate\'s, nothing moving it, is no row of Table №1 (' + JSON.stringify(same) + ')');

  // an application of two estimates: both corrected files chosen at once (in the other order), each compared with its
  // own estimate, and both back after a reload
  await page.setInputFiles('#pick', f1);
  await page.waitForFunction(() => app.projects.length === 2 && !S.Sync.loading, null, T);
  await page.click('.tab[data-pane="compare"]');
  await page.setInputFiles('#cmpNewFile', [f2, f5]);
  await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.newFile && app.compare_ui.newFile.parts.length === 2, null, T);
  const two = async () => page.evaluate(() => ({ name: document.getElementById('cmpNewName').textContent,
    objects: app.compare_ui.res.objects.map((o) => o.name + (o.only ? ' [' + o.only + ']' : '')), label: app.compare_ui.labels.oldLabel }));
  const t1 = await two();
  check(t1.name === 'Тест_v2.xlsx + Тест_объёмы_испр.xlsx' && t1.objects.length >= 3 && t1.objects.every((n) => !/\[/.test(n)) && /все сметы заявки \(2\)/.test(t1.label),
    'two corrected files at once: the first version is every estimate of the application, each sheet paired with its own (' + t1.objects.join(' | ') + ')');
  await saved();
  check(await page.evaluate(() => !!(S.Sync.cmp.new && S.Sync.cmp.new1)), 'the workspace keeps both corrected files');
  await reload();
  await page.waitForFunction(() => app.compare_ui.res && app.compare_ui.newFile && app.compare_ui.newFile.parts && app.compare_ui.newFile.parts.length === 2, null, T);
  const t2 = await two();
  check(JSON.stringify(t2) === JSON.stringify(t1), 'and after a reload both are back, compared the same way (' + t2.name + ')');
  // one file again: the second one is let go
  const nFiles = await page.evaluate(() => S.Sync.ws.files.length);
  await page.setInputFiles('#cmpNewFile', f2);
  await page.waitForFunction(() => app.compare_ui.newFile && app.compare_ui.newFile.parts.length === 1, null, T);
  await saved();
  check(await page.evaluate(() => !S.Sync.cmp.new1) && await page.evaluate(() => S.Sync.ws.files.length) === nFiles - 1,
    'choosing one corrected file again removes the second from the server');

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
