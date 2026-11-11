/*
 * A file the page cannot get through.
 *
 * Estimates come from outside, and the page reads them in a worker — one file after another. Two things used to
 * follow from that. A file that never came back held up every file behind it, and the «Чтение файлов…» screen,
 * for as long as the tab lived. And in an application the file was sent to the server the moment it was dropped
 * in, before anybody had read it: whatever it was, it was stored first.
 *
 * Held here: a worker that does not answer is stopped and replaced, the file it was on is refused in words, the
 * files that were waiting behind it are still read; and only a file that was read as an estimate is stored.
 *
 * (That the reader itself finishes on a damaged workbook is test/xlsx-guard.cjs. This is the page around it.)
 *
 * The estimates are invented.
 *
 *   node test/read-guard.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const { book, xlsx } = require('./compare-books.cjs');
const S = load(load.PIPELINE);
const fflate = S.__fflate;

const dir = mkdtempSync(join(tmpdir(), 'readguard-'));
const put = (name, bytes) => { const p = join(dir, name); writeFileSync(p, bytes); return p; };
const GOOD1 = put('first.xlsx', xlsx(S, book(1)));
const GOOD2 = put('second.xlsx', xlsx(S, book(1)));
const GOOD3 = put('third.xlsx', xlsx(S, book(1)));
// a workbook, but not an estimate: one sheet with one word on it
const enc = new TextEncoder();
const NOT_SMETA = put('letter.xlsx', fflate.zipSync({
  'xl/workbook.xml': enc.encode('<workbook><sheets><sheet name="L" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': enc.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml': enc.encode('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>письмо</t></is></c></row></sheetData></worksheet>')
}));
const JUNK = put('broken.xlsx', new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]));
// three hundred megabytes of nothing in a file of three hundred kilobytes
const BOMB = put('bomb.xlsx', fflate.zipSync({
  'xl/workbook.xml': enc.encode('<workbook><sheets><sheet name="L" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': enc.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml': new Uint8Array(300 * 1024 * 1024)
}));

const PORT = 8123;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

// every file the page sends to the application, by name
const sent = [];
await page.route('**/api/collections/workspaces/records/*', (route) => {
  const rq = route.request();
  if (rq.method() === 'PATCH' && /multipart/.test(rq.headers()['content-type'] || '')) {
    const body = rq.postDataBuffer() ? rq.postDataBuffer().toString('latin1') : '';
    let m; const re = /filename="([^"]*)"/g;
    while ((m = re.exec(body))) sent.push(m[1]);
  }
  return route.continue();
});

await page.goto(pb.base + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await page.fill('#loginCode', pb.lastCode('test@example.com'));
await page.click('#loginBtn');
await page.waitForSelector('#screen-list:not([hidden])');
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
const wsId = await page.evaluate(() => S.Sync.ws.id);
const stored = async () => (await api('/api/collections/workspaces/records/' + wsId, {}, su));
const settled = async () => {
  await page.waitForFunction(() => app.pending <= 0 && !S.Sync.dirty && document.getElementById('wsSave').textContent !== '●', null, { timeout: 30 * 1000 });
  await page.evaluate(() => S.Sync.q);
};
const toasts = () => page.evaluate(() => document.getElementById('toast').textContent);
const busy = () => page.evaluate(() => document.getElementById('busy').classList.contains('on'));

/* 1 — only what was read as an estimate is stored */
console.log('-- files that are not estimates, beside one that is --');
await page.setInputFiles('#pick', [JUNK, NOT_SMETA, BOMB, GOOD1]);
await page.waitForFunction(() => app.pending <= 0 && app.projects.length === 1, null, { timeout: 60 * 1000 });
await settled();
let t = await toasts();
check(/broken\.xlsx: /.test(t), 'a file that is not a workbook is refused in a message');
check(/letter\.xlsx: листы ресурсов не найдены/.test(t), 'a workbook with no estimate in it is said to have none');
check(/bomb\.xlsx: файл слишком большой/.test(t), 'a small file that unpacks into a very large one is refused, in words');
check(await page.evaluate(() => app.projects[0].file === 'first.xlsx' && app.model.rows.length > 0), 'the estimate dropped in with them is read and on screen');
let w = await stored();
check(w.files.length === 1 && w.state.projects.length === 1 && w.state.projects[0].fileId === w.files[0],
  'the application holds one file — the estimate (' + w.files.length + ')');
check(sent.length === 1 && sent[0] === 'first.xlsx', 'and nothing else was ever sent to the server (' + sent.join(', ') + ')');
check(!(await busy()), 'the «Чтение файлов» screen is gone');

/* 2 — a worker that never answers */
console.log('-- a worker that stops answering --');
await page.evaluate(() => {
  S.READ_LIMIT_MS = 1500;
  // The worker takes the files in turn. From here on it is given nothing: it never answers, which is what a
  // file that keeps it busy for ever looks like from the page.
  window.__old = app.worker;
  app.worker.postMessage = function () {};
});
sent.length = 0;
const t0 = Date.now();
await page.setInputFiles('#pick', [GOOD2, GOOD3]);
await page.waitForFunction(() => app.pending <= 0, null, { timeout: 30 * 1000 });
const took = Date.now() - t0;
await settled();
t = await toasts();
const names = await page.evaluate(() => app.projects.map((p) => p.file));
check(took < 15 * 1000, 'the page does not wait for ever: it gave up after ' + (took / 1000).toFixed(1) + ' s');
check(/не прочитан за \d+ секунд/.test(t), 'the file the worker was on is refused, with the reason');
check(await page.evaluate(() => app.worker !== window.__old), 'the worker was replaced');
check(names.length === 2 && names[0] === 'first.xlsx', 'one of the two files was refused, the other read by the new worker (' + names.join(', ') + ')');
check(!(await busy()), 'the «Чтение файлов» screen is gone');
w = await stored();
check(w.files.length === 2 && sent.length === 1 && sent[0] === names[1], 'only the file that was read was stored (' + sent.join(', ') + ')');

/* 3 — and the new worker goes on working */
console.log('-- afterwards --');
const refused = names[1] === 'second.xlsx' ? GOOD3 : GOOD2;
await page.evaluate(() => { delete S.READ_LIMIT_MS; });
await page.setInputFiles('#pick', refused);
await page.waitForFunction(() => app.pending <= 0 && app.projects.length === 3, null, { timeout: 30 * 1000 });
await settled();
check((await stored()).files.length === 3, 'the refused file, dropped in again, is read and stored');
await page.reload();
await page.waitForFunction(() => window.app && app.projects.length === 3 && app.pending <= 0 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
check(true, 'after a reload the application opens with its three estimates');

/* 4 — the comparison tab reads through the same worker */
console.log('-- «Сравнение версий» --');
await page.evaluate(() => {
  S.READ_LIMIT_MS = 1500;
  app.worker.postMessage = function () {};
});
await page.click('.tab[data-pane="compare"]');
await page.setInputFiles('#cmpNewFile', GOOD1);
await page.waitForFunction(() => /не прочитан за \d+ секунд/.test(document.getElementById('toast').textContent), null, { timeout: 15 * 1000 });
check(!(await busy()), 'a file that never comes back there is refused too, and the screen is given back');
await page.evaluate(() => { delete S.READ_LIMIT_MS; });
await page.setInputFiles('#cmpNewFile', GOOD1);
await page.waitForFunction(() => app.compare_ui.newFile && app.compare_ui.newFile.name === 'first.xlsx', null, { timeout: 15 * 1000 });
check(true, 'and the next file is read');

check(errors.length === 0, 'no errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
await pb.stop();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'read-guard OK');
process.exit(fail ? 1 : 0);
