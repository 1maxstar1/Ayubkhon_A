/*
 * Every smeta uploaded as a project leaves a record of its format (docs/format-reja.md) — in a real browser, against
 * a real server. All files are invented (test/compare-books.cjs).
 *
 *   - a file the rules read: its record has the sample with the labels, no file kept, the uploader's name on it;
 *   - a file with no resource sheet, and one that cannot be opened: recorded as not read, kept whole;
 *   - a file read with sums that do not agree: read, and kept to be looked at;
 *   - no letter of an estimate is in any sample;
 *   - the same file again — after a reload, from a browser that forgot — is not recorded twice, and a reload asks the
 *     server nothing about the files it already sent;
 *   - the counts are the admin's; a record's owner and hash cannot be rewritten;
 *   - the admin page: the counts, «До обучения модели: N из 100», the files to look at with «Скачать», «Проверить
 *     снова» (a file that reads now gets its sample), «Убрать»;
 *   - the admin's «Стереть» takes the records too, and a browser that remembers sending them sends them again.
 *
 *   node test/e2e-formats.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'xlsx-write', 'smeta', 'assemble');
const { book, xlsx, sheet } = require('./compare-books.cjs');

const sha = (x) => createHash('sha256').update(x).digest('hex');
const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
const put = (name, bytes) => { const p = join(dir, name); writeFileSync(p, bytes); return { path: p, name, bytes: Buffer.from(bytes), hash: sha(Buffer.from(bytes)) }; };

const fRead = put('Тест_читается.xlsx', xlsx(S, book(1)));
const fNone = put('Тест_не_смета.xlsx', xlsx(S, { sheets: [sheet('Лист1', [['Какая-то таблица'], ['Позиция', 'Описание', 'Стоимость'], ['А', 'нечто', 5], ['Б', 'иное', 7]])] }));
const fDoubt = put('Тест_суммы.xlsx', xlsx(S, { sheets: [sheet('РЕСУРС', [
  ['Ведомость ресурсов'],
  ['№ п/п', 'Наименование', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Сумма (сум)'],
  [null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ТЕСТОВЫЙ КИРПИЧ', 'ШТ', 3, 5, 15],
  [2, 'ТЕСТОВАЯ ПЛИТА', 'М3', 2, 7, 99],           // typed over
  [3, 'ТЕСТОВЫЙ РАСТВОР', 'Т', 4, 6, 77]           // typed over
])] }));
const fJunk = put('Тест_сломан.xlsx', Buffer.from([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
const fLater = put('Тест_потом.xlsx', xlsx(S, book(2)));       // «a file the rules were taught to read since»

const pb = await startServer({ port: 8168, registry: true, build: true });
const { api, su } = pb;
const boss = await api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
}, su);
const rows = pb.rows().slice(0, 2);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const T = { timeout: 30 * 1000 };
const records = async () => (await api('/api/collections/smeta_files/records?perPage=200&sort=created', {}, su)).items || [];
const byHash = async (f) => (await records()).find((r) => r.hash === f.hash) || null;
const until = async (fn, ms = 2e4) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
};
watch(page);
const calls = [];
page.on('request', (r) => { if (/\/collections\/smeta_files\//.test(r.url())) calls.push(r.method()); });

const signIn = async (p, email, done) => {
  await p.fill('#loginEmail', email);
  await p.click('#loginBtn');
  await p.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await p.fill('#loginCode', pb.lastCode(email));
  await p.click('#loginBtn');
  await p.waitForSelector(done);
};
const idle = () => page.evaluate(() => S.Formats.idle());

try {
  await page.goto(pb.base + '/');
  await signIn(page, 'test@example.com', '#screen-list:not([hidden])');
  const me = await page.evaluate(() => S.me().id);
  await page.fill('#appQ', rows[0].number);
  await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length === 1 && tr[0].textContent.includes(n); }, rows[0].number);
  await page.click('#appTable tbody tr button[data-act=open]');
  await page.waitForSelector('#screen-region:not([hidden])');
  await page.selectOption('#regionSel', 'fargona');
  await page.click('#regionForm button[type=submit]');
  await page.waitForSelector('#wsBox:not([hidden])');
  const ws = await page.evaluate(() => S.Sync.ws.id);

  /* a file the rules read */
  await page.setInputFiles('#pick', fRead.path);
  await page.waitForFunction(() => app.model && app.model.rows.length > 0, null, T);
  check(await until(async () => !!(await byHash(fRead))), 'a read file leaves a record');
  await idle();
  let r = await byHash(fRead);
  check(r && r.is_read === true && r.name === fRead.name && r.size === fRead.bytes.length && r.objects === 2 && r.items === 13 && r.checked === 13 && r.score === 1,
    'it says how the file was read: 2 estimates, 13 lines, every sum agreeing');
  check(r && r.by === me && r.ws === ws && r.file === '' && /^v\d/.test(r.app_version) && r.version === 1 && /^[0-9a-f]{16}$/.test(r.signature),
    'whose it is, in which application, by which version — and the file itself is not kept');
  check(r && r.sample && r.sample.sheets.length === 1 && r.sample.sheets[0].b.length === 2 && r.sample.sheets[0].b[0].L.name === 3 && /i/.test(r.sample.sheets[0].k),
    'its sample carries what the rules read: the blocks, their columns, the kind of every row');

  /* no resource sheet; cannot be opened; sums that do not agree */
  await page.setInputFiles('#pick', fNone.path);
  check(await until(async () => !!(await byHash(fNone))), 'a file with no resource sheet leaves a record too');
  r = await byHash(fNone);
  check(r && r.is_read === false && r.reason === 'no-sheets' && r.file !== '' && r.sample && r.sample.sheets.length === 1 && !r.sample.sheets[0].b,
    'not read, kept whole, its sample without labels');
  await page.setInputFiles('#pick', fJunk.path);
  check(await until(async () => !!(await byHash(fJunk))), 'a file that cannot be opened leaves a record');
  r = await byHash(fJunk);
  check(r && r.is_read === false && /^error: /.test(r.reason) && r.file !== '' && !r.sample, 'not read, with the reader\'s error, kept whole');
  await page.setInputFiles('#pick', fDoubt.path);
  await page.waitForFunction(() => app.projects.length === 2, null, T);
  check(await until(async () => !!(await byHash(fDoubt))), 'a file read with sums that do not agree leaves a record');
  r = await byHash(fDoubt);
  check(r && r.is_read === true && r.items === 3 && r.checked === 3 && Math.abs(r.score - 0.3333) < 1e-9 && r.file !== '', 'read, one sum of three agreeing — and kept to be looked at');
  await idle();
  const all = await records();
  check(all.length === 4 && !/[Ѐ-ӿ]/.test(JSON.stringify(all.map((x) => x.sample))), 'four records; no letter of an estimate in any sample');
  check(!errors.length, 'recording raised nothing on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));

  /* the same files again */
  await page.waitForFunction(() => S.Sync.q && !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, T);
  calls.length = 0;
  await page.reload();
  await page.waitForSelector('#wsBox:not([hidden])', T);
  await page.waitForFunction(() => app.projects.length === 2 && !S.Sync.loading, null, T);
  await idle();
  check((await records()).length === 4 && calls.length === 0, 'after a reload the stored files are read again and nothing is asked of the server about them (' + calls.join(',') + ')');
  await page.evaluate(() => { localStorage.removeItem('taq-formats-sent'); });
  await page.reload();
  await page.waitForSelector('#wsBox:not([hidden])', T);
  await page.waitForFunction(() => app.projects.length === 2 && !S.Sync.loading, null, T);
  await page.waitForFunction(() => Object.keys(S.Formats.sent).length === 2, null, T);
  await idle();
  check((await records()).length === 4 && calls.length === 2 && calls.every((m) => m === 'GET'),
    'a browser that forgot asks whether each file is known, and records nothing twice (' + calls.join(',') + ')');

  /* whose the counts and the records are */
  const mine = await page.evaluate(() => S.pb.authStore.token);
  const denied = await fetch(pb.base + '/api/formats/stats', { headers: { Authorization: mine } });
  check(denied.status === 403, 'the counts are the admin\'s (an expert is refused: ' + denied.status + ')');
  const one = await byHash(fRead);
  await api('/api/collections/smeta_files/records/' + one.id, { method: 'PATCH', body: JSON.stringify({ by: boss.id, hash: 'f'.repeat(64), items: 14 }) }, mine);
  r = await byHash(fRead);
  check(r && r.by === me && r.items === 14, 'a later reading may change what was read, never whose file it is or which file');
  await api('/api/collections/smeta_files/records/' + one.id, { method: 'PATCH', body: JSON.stringify({ items: 13 }) }, su);
  const del = await fetch(pb.base + '/api/collections/smeta_files/records/' + one.id, { method: 'DELETE', headers: { Authorization: mine } });
  check(del.status >= 400 && (await records()).length === 4, 'and an expert cannot remove a record');

  /* «a file the rules were taught to read since»: recorded as not read, with its file */
  const fd = new FormData();
  const stale = { hash: fLater.hash, name: fLater.name, size: String(fLater.bytes.length), by: boss.id, is_read: 'false', reason: 'no-sheets', version: '1' };
  for (const k of Object.keys(stale)) fd.append(k, stale[k]);
  fd.append('file', new Blob([fLater.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fLater.name);
  const made = await fetch(pb.base + '/api/collections/smeta_files/records', { method: 'POST', headers: { Authorization: su }, body: fd });
  check(made.status === 200, 'a record of an unread file, as an older version would have left it');

  /* the admin page */
  const admin = await ctx.newPage();
  watch(admin);
  admin.on('dialog', (d) => d.accept());
  await admin.goto(pb.base + '/admin.html');
  await admin.evaluate(() => { try { S.pb.authStore.clear(); } catch (e) { /* not signed in */ } });
  await admin.reload();
  await signIn(admin, 'boss@example.com', '#adminMain:not([hidden])');
  await admin.waitForFunction(() => !document.getElementById('fmtTable').hidden && !document.getElementById('fmtList').hidden, null, T);
  const cell = (k) => admin.evaluate((key) => { const tr = document.querySelector('#fmtTable tr[data-k="' + key + '"]'); return tr ? tr.lastElementChild.textContent : null; }, k);
  const want = { files: '5', read: '2', doubt: '1', unread: '3', formats: '2', lines: '16', kept: '4' };
  const got = {};
  for (const k of Object.keys(want)) got[k] = await cell(k);
  check(JSON.stringify(got) === JSON.stringify(want), 'the admin page counts them (' + JSON.stringify(got) + ')');
  check(/До обучения модели: 2 из 100 файлов/.test(await admin.textContent('#fmtGoal')), 'and says how far the first training is');
  const listed = await admin.$$eval('#fmtList tbody tr', (t) => t.map((x) => x.cells[0].textContent + ' → ' + x.cells[2].textContent));
  check(listed.length === 4 && listed.some((l) => /Тест_не_смета\.xlsx → Не прочитан: листы ресурсов не найдены/.test(l)) &&
    listed.some((l) => /Тест_сломан\.xlsx → Не прочитан: /.test(l)) && listed.some((l) => /Тест_суммы\.xlsx → Прочитан, но кол-во × цена = сумма только в 33 % строк/.test(l)) &&
    !listed.some((l) => /Тест_читается/.test(l)), 'the files to look at are listed, each with what is wrong; a file read cleanly is not');
  const row = (name) => '#fmtList tbody tr:has-text("' + name + '")';
  const [dl] = await Promise.all([admin.waitForEvent('download', T), admin.click(row(fNone.name) + ' button[data-act=get]')]);
  const saved = join(dir, 'got.xlsx');
  await dl.saveAs(saved);
  check(dl.suggestedFilename() === fNone.name && sha(readFileSync(saved)) === fNone.hash, '«Скачать» gives the file back, byte for byte, under its own name');
  await admin.click(row(fNone.name) + ' button[data-act=again]');
  await admin.waitForFunction(() => /по-прежнему не читается/.test(document.getElementById('fmtStat').textContent), null, T);
  check((await byHash(fNone)).is_read === false, '«Проверить снова» on a file that still has no resource sheet: said, nothing changed');
  await admin.click(row(fLater.name) + ' button[data-act=again]');
  await admin.waitForFunction(() => /теперь читается/.test(document.getElementById('fmtStat').textContent), null, T);
  r = await byHash(fLater);
  check(r && r.is_read === true && r.reason === '' && r.items === 13 && r.score === 1 && r.sample && r.sample.sheets[0].b.length === 2 && r.by === boss.id && r.file !== '',
    'a file the rules read now gets its counts and its sample; whose it is stays');
  check(r.signature === (await byHash(fRead)).signature, 'and it is the format of the other file of that form');
  await admin.waitForFunction(() => /До обучения модели: 3 из 100 файлов/.test(document.getElementById('fmtGoal').textContent), null, T);
  check(await cell('read') === '3' && await cell('unread') === '2', 'the counts and the distance to the training follow at once');
  check(/Теперь читается \(строк ресурсов: 13\)/.test(await admin.textContent(row(fLater.name) + ' .st')), 'the list says to upload it to the application again');
  await admin.click(row(fLater.name) + ' button[data-act=drop]');
  check(await until(async () => { const x = await byHash(fLater); return x && x.file === ''; }), '«Убрать» on a read file removes the kept file');
  r = await byHash(fLater);
  check(r && r.is_read && r.sample && r.sample.sheets.length === 1, 'its record and its sample stay, to learn from');
  await admin.waitForFunction((n) => !document.querySelector('#fmtList tbody').textContent.includes(n), fLater.name, T);
  await admin.click(row(fJunk.name) + ' button[data-act=drop]');
  check(await until(async () => !(await byHash(fJunk))), '«Убрать» on an unread file removes its record');
  await admin.waitForFunction(() => document.querySelectorAll('#fmtList tbody tr').length === 2, null, T)
    .catch(async (e) => { console.log('list: ' + await admin.$$eval('#fmtList tbody tr', (t) => t.map((x) => x.cells[0].textContent + ' → ' + x.cells[2].textContent).join(' | ')) + ' · stat: ' + await admin.textContent('#fmtStat')); throw e; });
  await admin.click('#fmtRecheckAll');
  await admin.waitForFunction(() => /Проверено файлов: 2 · теперь читаются: 0\./.test(document.getElementById('fmtStat').textContent), null, T);
  check(await cell('files') === '4' && await cell('read') === '3' && await cell('unread') === '1' && await cell('kept') === '2',
    '«Проверить все снова» goes through the kept files; the counts follow (' + await cell('files') + ' / ' + await cell('read') + ' / ' + await cell('unread') + ')');
  check(/formats\.files = 4/.test(await admin.evaluate(() => S.FormatsAdmin.text())) && !/[Ѐ-ӿ]/.test(await admin.evaluate(() => S.FormatsAdmin.text())),
    '«Скопировать числа» gives the counts and nothing else');

  /* «Стереть» */
  const wiped = await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: 'СТЕРЕТЬ' }) }, su);
  check(wiped.cleared && wiped.cleared.smeta_files === 4 && (await records()).length === 0, 'the admin\'s «Стереть» removes the records and the kept files');
  await page.evaluate(() => { S.Formats.checked = false; return S.Formats.verify(); });
  check(await page.evaluate(() => Object.keys(S.Formats.sent).length) === 0, 'and a browser that remembers sending them will send them again');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
} catch (e) {
  check(false, 'the run stopped: ' + (e.message || e).split('\n')[0]);
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await browser.close();
  pb.stop();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? '\nFAILED: ' + fail : '\nall e2e-formats checks passed');
process.exit(fail ? 1 : 0);
