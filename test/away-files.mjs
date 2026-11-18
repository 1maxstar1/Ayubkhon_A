/*
 * An estimate of the application that is not on screen.
 *
 * Opening an application fetches its stored files and reads them. A file may not come (the link, a stored file
 * the server no longer has), or come and not be read (the time limit on a slow machine, a reader's rule that
 * finds no sheet in it any more). Such an estimate used to be handled five wrong ways:
 *
 *   - one file that did not come kept every estimate of the application off the screen, at every opening, and
 *     nothing on the page could take it out;
 *   - a file that came and was not read was removed from the server by the next save, with its project;
 *   - it was said once, in a message that went away, under a green «✓»: the document and «✓ Завершить» went on
 *     without the estimate (the price memory of the application was replaced by what was on screen);
 *   - a save made meanwhile moved the estimates that were away behind the others, for good;
 *   - a file added again under the name of one that was away left the stored file it replaced on the server,
 *     with nothing pointing to it.
 *
 * And a page asked to leave while its files came — a reload that was stopped, a link the server answered with
 * «no content» — gave the opening up, and stayed under «Получение файлов с сервера…» with every save refused.
 *
 * Held here: every estimate whose file is the workspace's and which is not on screen is kept — its file, its
 * project, its place — and named in a line over the list for as long as it is so; the mark does not say «saved»;
 * the document and «✓ Завершить» ask first; the line takes out an estimate that will never come; a file added
 * again replaces the stored one; and a page that stays after being asked to leave opens the application.
 *
 * The estimates are invented.
 *
 *   node test/away-files.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer, DATA } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const { bookOf, xlsx, line } = require('./compare-books.cjs');
const S = load(load.PIPELINE);

// four small estimates, each with resources of its own
const book = (n) => bookOf([{ works: 'ТЕСТОВЫЕ РАБОТЫ ' + n, direct: 4 * (16 + n) + 2 * (6 + n), rows: [
  [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  line(1, 'ТЕСТОВЫЙ АНКЕР М' + (4 + n), 'ШТ', 4, 16 + n),
  line(2, 'ТЕСТОВЫЙ БОЛТ ' + (10 * n) + ' ММ', 'ШТ', 2, 6 + n)
] }]);
const dir = mkdtempSync(join(tmpdir(), 'away-'));
const file = (name, n) => { const p = join(dir, name); writeFileSync(p, xlsx(S, book(n))); return p; };
const F1 = file('first.xlsx', 1), F2 = file('second.xlsx', 2), F3 = file('third.xlsx', 3), F4 = file('fourth.xlsx', 4);

const PORT = 8127;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, su } = pb;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const number = rows[0].number;

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let downloads = 0, patches = 0;
page.on('download', () => { downloads++; });
// a link the server answers with «no content» (part 3). Set here, because a page with a route keeps nothing in the
// browser's cache: every stored file is asked of the server at every opening, also the one part 4 removes from it
await page.route('**/no-content', (r) => r.fulfill({ status: 204 }));
page.on('request', (rq) => { if (rq.method() === 'PATCH' && /\/api\/collections\/workspaces\/records\//.test(rq.url())) patches++; });

await page.goto(pb.base + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await wait(700);
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
await page.setInputFiles('#pick', [F1, F2, F3]);
await page.waitForFunction(() => app.projects.length === 3 && app.model && app.model.rows.length > 0, null, { timeout: 30 * 1000 });

const wsId = await page.evaluate(() => S.Sync.ws.id);
const stored = () => api('/api/collections/workspaces/records/' + wsId, {}, su);
const count = async (coll) => (await api(`/api/collections/${coll}/records?perPage=1`, {}, su)).totalItems;
// nothing waiting to be saved and nothing on its way (the mark is not «✓» while an estimate is away)
const settled = async () => {
  await page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent !== '●', null, { timeout: 20 * 1000 });
  await page.evaluate(() => S.Sync.q);
};
const opened = () => page.waitForFunction(() => window.app && window.S && S.Sync && S.Sync.ws && !S.Sync.loading, null, { timeout: 30 * 1000 });
const onScreen = () => page.evaluate(() => app.projects.map((p) => p.file));
const line1 = () => page.evaluate(() => { const b = document.getElementById('wsAway'); return !b || b.hidden ? '' : b.textContent.replace(/\s+/g, ' ').trim(); });
const mark = () => page.textContent('#wsSave');
const order = (w) => (w.state.projects || []).map((p) => p.file);
const orphans = (w) => { const ref = Object.values(w.state.files || {}); return w.files.filter((f) => !ref.includes(f)); };
const setPrice = () => page.evaluate(() => { const r = app.model.resources.find((x) => x.price > 3); app.setPrice(r.key, (r.market || r.price) - 1); S.Sync.flush(); });
const fileGet = (u) => /^\/api\/files\/[^/]+\/[^/]+\/[^/]+$/.test(u.pathname);     // a stored file, not /api/files/token
const idOf = async (name) => (await stored()).state.files[name];
const toasts = () => page.evaluate(() => document.getElementById('toast').textContent);

await settled();
let w = await stored();
check(w.files.length === 3 && order(w).join() === 'first.xlsx,second.xlsx,third.xlsx', 'three estimates are stored, in the order they were added');

/* 1 — the link is down as the application opens: no file comes */
await page.route(fileGet, (r) => r.abort());
await page.reload();
await opened();
check((await onScreen()).length === 0, 'no file comes, and nothing is on screen');
let l = await line1();
check(/first\.xlsx — нет на экране/.test(l) && /second\.xlsx — нет на экране/.test(l) && /third\.xlsx — нет на экране: не получен с сервера/.test(l),
  'a line over the list names every estimate that is not on screen, and why (' + l.slice(0, 80) + '…)');
check(await mark() === '!', 'the mark does not say «saved» while estimates are away (' + await mark() + ')');
check(/обновите страницу/.test(await toasts()), 'a link lost on the way: the message says to fetch them again');
await wait(300);
check(/Обновить страницу/.test(l) && await page.evaluate(() => document.getElementById('export').disabled), 'the line offers to fetch them again; with nothing on screen there is no document to make');

// an estimate added meanwhile goes after the ones that are away, as it would have with them on screen
await page.setInputFiles('#pick', F4);
await page.waitForFunction(() => app.projects.length === 1 && Object.keys(S.Sync.files).length === 4, null, { timeout: 30 * 1000 });
await settled();
w = await stored();
check(w.files.length === 4 && order(w).join() === 'first.xlsx,second.xlsx,third.xlsx,fourth.xlsx',
  'a save made while estimates are away keeps them, and keeps their place (' + order(w).join(', ') + ')');

// the expert drags the second estimate in again: it takes the place of the stored one
const oldSecond = w.state.files['second.xlsx'];
const upload = page.waitForResponse((r) => r.request().method() === 'PATCH' && /multipart/.test(r.request().headers()['content-type'] || ''), { timeout: 30 * 1000 });
await page.setInputFiles('#pick', F2);
await upload;
w = await stored();
check(w.files.includes(oldSecond) && w.state.files['second.xlsx'] === oldSecond,
  'the stored file it replaces is not removed by the upload: until a state points to the new one, the old one is what opens');
await page.waitForFunction((old) => app.projects.length === 2 && S.Sync.files['second.xlsx'] !== old && !S.Sync.hasUnsaved(), oldSecond, { timeout: 30 * 1000 });
await settled();
w = await stored();
check(w.files.length === 4 && !w.files.includes(oldSecond) && orphans(w).length === 0,
  'a file added again under the name of one that is away replaces it: no stored file is left that nothing points to (' + w.files.length + ' stored, ' + orphans(w).length + ' unreferenced)');
check(order(w).filter((n) => n !== 'fourth.xlsx').join() === 'first.xlsx,second.xlsx,third.xlsx', 'and the three are still in their order (' + order(w).join(', ') + ')');
l = await line1();
check(/first\.xlsx/.test(l) && /third\.xlsx/.test(l) && !/second\.xlsx/.test(l), 'the line no longer names the estimate that is back');

// the link is back
await page.unroute(fileGet);
await page.reload();
await opened();
check((await onScreen()).join() === order(w).join() && (await onScreen()).length === 4 && await line1() === '' && await mark() === '✓',
  'opened again with the link back, every estimate is on screen in the saved order, the line is gone and the mark is green');

/* 2 — a stored file that comes and is not read */
const unread = await idOf('first.xlsx');
const notABook = (r) => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('ТЕСТОВЫЙ ФАЙЛ, не книга') });
const isUnread = (u) => fileGet(u) && u.pathname.endsWith('/' + unread);
await page.route(isUnread, notABook);
await page.reload();
await opened();
check((await onScreen()).length === 3 && !(await onScreen()).includes('first.xlsx'), 'a file that comes and is not read: the other estimates are on screen (' + (await onScreen()).join(', ') + ')');
l = await line1();
check(/first\.xlsx — нет на экране: /.test(l) && /не книга Excel/.test(l) && await mark() === '!', 'the line names it, with what the reader said (' + l.slice(0, 90) + '…)');
const saved = order(await stored()).join();
await setPrice();
await settled();
w = await stored();
check(w.files.length === 4 && w.files.includes(unread) && order(w).join() === saved,
  'the next save removes neither its file nor its project, and keeps its place (' + order(w).join(', ') + ')');
await page.unroute(isUnread);
await page.reload();
await opened();
check((await onScreen()).join() === saved && await line1() === '' && await mark() === '✓', 'read again, it is back in its place');

/* 3 — the page is asked to leave while the files come, and stays */
const all = (await onScreen()).length;
// the files are kept on their way until the test lets them go: `cut` — the browser cuts them off instead
let gate = [], hold = false, cut = false;
const held = async (r) => {
  if (!hold) return r.continue();
  await new Promise((ok) => gate.push(ok));
  return cut ? r.abort() : r.continue();
};
const release = () => { hold = false; gate.forEach((ok) => ok()); gate = []; };
// the application is being opened, and every one of its files has been asked for
const coming = async () => {
  await page.waitForFunction(() => window.S && S.Sync && S.Sync.ws && S.Sync.loading, null, { timeout: 30 * 1000 });
  for (let i = 0; i < 300 && gate.length < all; i++) await wait(50);
};
const here = () => page.waitForFunction((n) => !S.Sync.loading && app.projects.length === n && !document.getElementById('busy').classList.contains('on'), all, { timeout: 15 * 1000 })
  .then(() => true, () => false);
// a link the server answers with «no content»: the browser asks the page to leave, and the page stays
await page.route(fileGet, held);
hold = true;
await page.reload();
await coming();
await page.evaluate(() => { location.href = '/no-content'; });
await wait(400);
check(gate.length === all && await page.evaluate(() => S.Sync.loading), 'a navigation that leads nowhere: the page stays, its files still on their way');
release();
check(await here(), 'and the application opens all the same');
check(await page.evaluate(() => !S.Sync.loading) && await line1() === '' && await mark() === '✓', 'with every estimate on screen');

// asked to leave, and the browser cuts the files off (as it does when a reload starts) — and then the page stays
hold = true; cut = true;
await page.reload();
await coming();
patches = 0;
await page.evaluate(() => { window.dispatchEvent(new Event('beforeunload')); });
release();
await wait(900);
check(await page.evaluate(() => S.Sync.loading && app.projects.length === 0 && !S.Sync.dirty) && patches === 0,
  'files cut off after the page was asked to leave are no failure to go on from: nothing is restored, nothing is saved');
check(await here(), 'the page is still here a moment later: the files are fetched again and the application opens');
check(await page.evaluate(() => !S.Sync.loading) && await line1() === '' && await mark() === '✓' && order(await stored()).join() === saved, 'whole, and as it was saved');
await page.unroute(fileGet, held);

/* 4 — one stored file the server no longer has */
w = await stored();
const lostId = w.state.files['third.xlsx'];
const blob = join(DATA, 'storage', w.collectionId, wsId, lostId);
check(existsSync(blob), 'the stored file of the third estimate is on the server\'s disk');
rmSync(blob);
await page.reload();
await opened();
check((await onScreen()).length === 3 && !(await onScreen()).includes('third.xlsx'), 'one file the server cannot give: the other estimates are on screen (' + (await onScreen()).join(', ') + ')');
l = await line1();
check(/third\.xlsx — нет на экране: не получен с сервера \(ответ 404\)/.test(l) && await mark() === '!', 'the line names it, with the server\'s answer');
check(/third\.xlsx.*сервер их не отдаёт: загрузите их снова или уберите из заявки/.test(await toasts()) && !/обновите страницу/.test(await toasts()),
  'and the message does not say to reload: a file the server will not give is not given at the next opening either');
await page.reload();
await opened();
check((await onScreen()).length === 3 && /third\.xlsx/.test(await line1()), 'and so at the next opening');

// the document and «✓ Завершить» ask first
const exportsBefore = await count('exports');
let asked = '';
page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
await page.click('#export');
await wait(600);
check(/нет на экране: third\.xlsx/.test(asked) && /Документ будет собран без них/.test(asked) && downloads === 0 && await count('exports') === exportsBefore,
  '«Скачать Excel» names the missing estimate and asks; «нет» makes no document');
asked = '';
page.once('dialog', (d) => { asked = d.message(); d.accept(); });
await page.click('#export');
await page.waitForFunction(() => document.getElementById('toast').textContent.includes('сохранён на сервере'), null, { timeout: 60 * 1000 });
check(/third\.xlsx/.test(asked) && downloads === 1 && await count('exports') === exportsBefore + 1, '«да» makes it');
asked = '';
page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
await page.click('#wsDone');
await wait(600);
check(/нет на экране: third\.xlsx/.test(asked) && /Завершить\?/.test(asked) && (await stored()).status !== 'done' &&
  await page.evaluate(() => { const b = document.getElementById('finishBox'); return !b || b.hidden; }),
  '«✓ Завершить» names it and asks; «нет» finishes nothing');

// a save keeps what is away; the line takes it out of the application, by the person's own decision
await setPrice();
await settled();
w = await stored();
check(w.files.includes(lostId) && order(w).join() === saved && w.state.files['third.xlsx'] === lostId, 'a price typed meanwhile is saved without removing the estimate that is away');
const away = '#wsAway button[data-i]';
page.once('dialog', (d) => d.dismiss());
await page.click(away);
await wait(300);
check(/third\.xlsx/.test(await line1()), '«Убрать из заявки» asks; «нет» leaves the estimate in the application');
page.once('dialog', (d) => d.accept());
await page.click(away);
await page.waitForFunction(() => document.getElementById('wsAway').hidden, null, { timeout: 10 * 1000 });
await settled();
w = await stored();
check(w.files.length === 3 && !w.files.includes(lostId) && !order(w).includes('third.xlsx') && !w.state.files['third.xlsx'] && await mark() === '✓',
  '«да» takes it out: its file and its project leave the application, and the mark is green (' + order(w).join(', ') + ')');
await page.reload();
await opened();
check((await onScreen()).join() === order(w).join() && await line1() === '', 'and the application opens without it, with nothing missing');

await browser.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'away-files OK');
process.exit(fail ? 1 : 0);
