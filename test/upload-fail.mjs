/*
 * An estimate whose file did not reach the server.
 *
 * It is on screen the moment it is read, and in the workspace only when its file is stored. When the upload
 * failed — the link dropping for a second, the thirty-first file — the page said so once, in a message the
 * next message replaced, and went on showing a green «✓»: the estimate could be priced, and after a reload it
 * was not there.
 *
 * Held here: the page does not say «saved» while an estimate has no file on the server; a line over the list
 * names the file and why; «Повторить» stores it; the limit is said in words before the server is asked;
 * taking the project off the list ends the matter; and leaving the application asks first.
 *
 * The estimates are invented.
 *
 *   node test/upload-fail.mjs
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
const { book, xlsx, replyBook } = require('./compare-books.cjs');
const S = load(load.PIPELINE);
const fflate = S.__fflate;

const dir = mkdtempSync(join(tmpdir(), 'upfail-'));
const file = (name) => { const p = join(dir, name); writeFileSync(p, xlsx(S, book(1))); return p; };
const F1 = file('first.xlsx'), F2 = file('second.xlsx'), F3 = file('third.xlsx');
const NOT = join(dir, 'not-an-estimate.xlsx');
writeFileSync(NOT, xlsx(S, replyBook()));       // a workbook, but no resource sheet in it

const PORT = 8119;
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

// one upload can be cut, and every upload is counted
let cut = 0, uploads = 0;
await page.route('**/api/collections/workspaces/records/*', (route) => {
  const rq = route.request();
  const multipart = rq.method() === 'PATCH' && /multipart/.test(rq.headers()['content-type'] || '');
  if (multipart) uploads++;
  if (multipart && cut > 0) { cut--; return route.abort('connectionreset'); }
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
const settled = () => page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent !== '●', null, { timeout: 20 * 1000 });
const line = () => page.evaluate(() => { const b = document.getElementById('wsUnsaved'); return b.hidden ? '' : b.textContent.replace(/\s+/g, ' ').trim(); });
const mark = () => page.textContent('#wsSave');

/* 1 — the link drops while the file is on its way */
cut = 1;
await page.setInputFiles('#pick', F1);
await page.waitForFunction(() => app.projects.length === 1 && S.Sync.hasUnsaved(), null, { timeout: 30 * 1000 });
await page.evaluate(() => S.Sync.q);
await settled();
check(await page.evaluate(() => app.model.rows.length > 0), 'the estimate is read and on screen');
check((await stored()).files.length === 0, 'its file is not on the server');
check(await mark() === '!', 'the mark does not say «saved» (' + await mark() + ')');
let l = await line();
check(/first\.xlsx — не сохранён на сервере/.test(l) && /Повторить/.test(l), 'a line over the list names the file and offers to try again (' + l.slice(0, 70) + '…)');
check(/Не сохранено на сервере: first\.xlsx/.test(await page.textContent('#toast')), 'and the message is still there after the others have come');
// a price typed meanwhile is saved, and the mark still does not say «saved»
await page.evaluate(() => { const r = app.model.resources.find((x) => x.price > 2); app.setPrice(r.key, r.price - 1); });
await page.evaluate(() => S.Sync.flush());
await settled();
check(await mark() === '!', 'typing a price does not turn the mark green while the file is missing');

await page.click('#wsUnsaved button');
await page.waitForFunction(() => !S.Sync.hasUnsaved(), null, { timeout: 20 * 1000 });
await settled();
await page.evaluate(() => S.Sync.q);
let w = await stored();
check(w.files.length === 1 && w.state.projects[0].fileId === w.files[0], '«Повторить» stores the file and ties the estimate to it');
check(await line() === '' && await mark() === '✓', 'the line goes and the mark is green');
await page.reload();
await page.waitForFunction(() => window.app && app.projects.length === 1 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });
check(await page.evaluate(() => app.model.resources.some((r) => !S.near(r.price, r.market))), 'after a reload the estimate and its price are there');

/* a file that is read and is no estimate is not put on the server at all (it used to go up, and come off again) */
uploads = 0;
await page.setInputFiles('#pick', NOT);
await page.waitForFunction(() => /листы ресурсов не найдены/.test(document.getElementById('toast').textContent) && app.pending === 0, null, { timeout: 30 * 1000 });
await page.evaluate(() => S.Sync.q);
await settled();
check(uploads === 0 && (await stored()).files.length === 1 && await page.evaluate(() => app.projects.length === 1 && !S.Sync.hasUnsaved()),
  'a workbook that is no estimate is refused in words and never sent to the server (' + uploads + ' uploads)');

/* 2 — the server refuses: the workspace is full (filled behind the page's back, so the page has to be told) */
const fd = new FormData();
for (let i = 0; i < 29; i++) {
  const bytes = fflate.zipSync({ 'sheet.txt': new TextEncoder().encode(String(i).repeat(40)) });
  fd.append('files+', new Blob([bytes], { type: 'application/zip' }), 'fill' + i + '.xlsx');
}
const filled = await fetch(pb.base + '/api/collections/workspaces/records/' + wsId, { method: 'PATCH', headers: { Authorization: su }, body: fd });
check(filled.ok && (await stored()).files.length === 30, 'the workspace holds thirty files');
await page.setInputFiles('#pick', F2);
await page.waitForFunction(() => app.projects.length === 2 && S.Sync.hasUnsaved(), null, { timeout: 30 * 1000 });
await page.evaluate(() => S.Sync.q);
await settled();
l = await line();
check(/second\.xlsx — не сохранён на сервере/.test(l) && await mark() === '!' && (await stored()).files.length === 30,
  'a file the server refuses is held the same way (' + l.slice(0, 90) + '…)');
// taking the project off the list ends the matter
page.once('dialog', (d) => d.accept());
await page.click('#projects .proj:last-child button[data-act=del]');
await settled();
check(await line() === '' && await mark() === '✓' && await page.evaluate(() => !S.Sync.hasUnsaved()), 'removing that project clears the line and the mark');

/* 3 — the same limit, known beforehand: said in words, and the server is not asked */
await page.reload();
await page.waitForFunction(() => window.app && app.projects.length === 1 && S.Sync.ws && (S.Sync.ws.files || []).length === 30, null, { timeout: 30 * 1000 });
uploads = 0;
await page.setInputFiles('#pick', F3);
await page.waitForFunction(() => app.projects.length === 2 && S.Sync.hasUnsaved(), null, { timeout: 30 * 1000 });
await page.evaluate(() => S.Sync.q);
await settled();
l = await line();
check(/third\.xlsx — не сохранён на сервере: в заявке уже 30 файлов — это предел/.test(l), 'the thirty-first file: the limit is said in words (' + l.slice(0, 80) + '…)');
check(uploads === 0, 'without asking the server for a refusal (' + uploads + ' uploads sent)');

/* 4 — leaving the application asks */
let asked = '';
page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
await page.click('#wsList');
await new Promise((r) => setTimeout(r, 500));
check(/Не сохранены на сервере: third\.xlsx/.test(asked) && await page.evaluate(() => !!S.Sync.ws), '«‹ Заявки» names the unsaved estimate and asks; «нет» stays in the application');
page.once('dialog', (d) => d.accept());
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])');
check(await page.evaluate(() => !S.Sync.ws && !S.Sync.hasUnsaved() && document.getElementById('wsUnsaved').hidden), '«да» leaves, and nothing of it is carried along');

await browser.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'upload-fail OK');
process.exit(fail ? 1 : 0);
