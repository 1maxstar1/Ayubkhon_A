/*
 * Server-mode workspace in a real browser: open an application, choose the
 * region, upload smeta files, change a price, reload, continue, export, close.
 * Needs node build.mjs --serve. Smeta files: args or the two dev uploads.
 *
 *   node test/e2e-workspace.mjs [a.xlsx b.xlsx]
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const UP = '/root/.claude/uploads/8af525ef-a19a-5966-9772-c57eec709e1c/';
const smetas = process.argv.slice(2).length ? process.argv.slice(2) :
  ['bb932e59-_______________07_07_2026__2___2025.xlsx', 'f668c710-_____________4______27_12_2024__4_2022_2________.xlsx'].map((f) => UP + f);
if (!smetas.every(existsSync)) { console.error('smeta files not found; pass two .xlsx paths'); process.exit(1); }
const PORT = 8096, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_test');

execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'ignore' });
execSync('node test/registry.cjs --json server/pb_data_test/rows.json', { cwd: root, stdio: 'ignore' });
const server = spawn('sh', ['server/run.sh'], {
  cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore'
});
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}), ...(opts.headers || {}) } });
  return r.json();
};
const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' }) })).token;
const rows = JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8'));
const imp = await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
console.log('registry imported:', imp.added, 'rows');

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const count = async (coll, filter = '') => (await api(`/api/collections/${coll}/records?perPage=1&filter=${encodeURIComponent(filter)}`, {}, su)).totalItems;

await page.goto(BASE + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
await page.fill('#loginCode', code);
await page.click('#loginBtn');
await page.waitForSelector('#screen-list:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length >= 50);
check(true, 'application list shown after sign-in');
check(await page.isHidden('#appAdd') && !(await page.$('#appTable tbody .adm')), 'no admin buttons for an ekspert');
check((await page.textContent('#appCount')).includes('401'), 'count shows all applications: ' + await page.textContent('#appCount'));

await page.fill('#appQ', '67159');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
check((await page.textContent('#appTable tbody tr')).includes('Avtoyo'), 'search by number finds 67159');
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
check((await page.textContent('#regionTitle')).includes('67159'), 'region screen names the application');
check((await page.inputValue('#regionSel')) === 'respublika', 'region suggested from «Общереспубликанский»');
await page.selectOption('#regionSel', 'fargona');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
check((await page.textContent('#wsBox')).includes('Ферган'), 'workspace header shows the region');
check(await page.isHidden('#screen-list'), 'list hidden while a workspace is open');
check((await count('workspaces')) === 1, 'workspace record created');

await page.setInputFiles('#pick', smetas);
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100, null, { timeout: 90000 });
await page.waitForFunction(() => S.Sync.ws.files && S.Sync.ws.files.length === 2, null, { timeout: 90000 });
check(true, 'two smeta files uploaded to the workspace');
const before = await page.evaluate(() => ({ projects: app.projects.length, rows: app.model.rows.length, res: app.model.resources.length }));

// change one price on the prices tab
const first = await page.evaluate(() => {
  const r = app.model.resources.find((x) => x.price > 1000);
  return { key: r.key, price: r.price };
});
await page.fill('#q', '');
const sel = `#priceScroll input.pin[data-key="${first.key.replace(/"/g, '\\"')}"]`;
await page.evaluate((k) => { const i = app.model.resources.findIndex((x) => x.key === k); app.prices_ui.list.scrollToRow(Math.max(0, i)); }, first.key);
await page.waitForSelector(sel, { timeout: 10000 });
await page.fill(sel, String(Math.round(first.price * 1.1)));
await page.dispatchEvent(sel, 'input');
await page.waitForFunction(() => document.getElementById('wsSave').textContent === '✓' && !S.Sync.dirty, null, { timeout: 15000 });
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === 1, 'one correction row saved');
const corr = (await api('/api/collections/corrections/records?perPage=1', {}, su)).items[0];
check(corr.region === 'fargona' && corr.market_price === Math.round(first.price * 1.1) && corr.res_key === first.key, 'correction carries region, key and market price');
const w1 = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(w1.changed === 1 && w1.state.projects.length === 2 && Object.keys(w1.state.files).length === 2, 'workspace state: 2 projects, 2 files, changed=1');

// reload -> list -> continue -> everything back
await page.reload();
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', '67159');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
check((await page.textContent('#appTable tbody tr')).includes('в работе'), 'list shows the application as in progress');
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100 && !S.Sync.loading, null, { timeout: 120000 });
const after = await page.evaluate((k) => ({
  projects: app.projects.length, rows: app.model.rows.length, res: app.model.resources.length,
  price: app.prices[k], changed: app.model.resources.filter((r) => !S.near(r.price, r.market)).length
}), first.key);
check(after.projects === before.projects && after.rows === before.rows && after.res === before.res, `restored model matches (${after.rows} rows)`);
check(after.price === Math.round(first.price * 1.1) && after.changed === 1, 'changed price restored');
check((await count('corrections')) === 1, 'restore did not duplicate corrections');

/*
 * Two views that used to go stale when the model changed under them: the
 * sheet's search box kept its text while its filter was silently dropped, and
 * the report preview kept counting rows an unticked street had taken away.
 */
await page.click('.tab[data-pane="sheet"]');
await page.fill('#q2', 'БЕТОН');
await page.waitForFunction(() => app.sheetView.length !== app.sheetRows.length, null, { timeout: 10000 });
const before2 = await page.evaluate(() => ({ rows: app.sheetView.length, all: app.sheetRows.length }));
check(before2.rows > 0 && before2.rows < before2.all,
  `the sheet search narrows the table (${before2.rows} of ${before2.all})`);
await page.click('.tab[data-pane="report"]');
// «Только изменённые цены» is one resource here, so its length says nothing
// about which streets are in; the full copy is the mode that does.
await page.selectOption('#reportMode', 'full');
const lineCount = (t) => +String(t).split(' ')[0];
const rep1 = lineCount(await page.textContent('#reportCount'));
const proj1 = await page.evaluate(() => document.getElementById('reportProject').selectedOptions[0].textContent);

await page.click('#projects .proj:first-child li input[data-act=obj-on]');     // one street off
await page.waitForFunction((n) => app.sheetRows.length !== n, before2.all, { timeout: 15000 });
const kept = await page.evaluate(() => ({
  q: document.getElementById('q2').value, rows: app.sheetView.length, all: app.sheetRows.length
}));
check(kept.q === 'БЕТОН' && kept.rows < kept.all,
  `the search box still means what it says (${kept.rows} of ${kept.all})`);
check(kept.rows === before2.rows || kept.rows < before2.rows,
  'and it did not quietly widen back to everything');
const rep2 = lineCount(await page.textContent('#reportCount'));
check(rep2 < rep1, `the report preview follows the model (${rep1} -> ${rep2} строк)`);

// The selector names a project, not a position: reordering must not swap what
// it points at while the rows on screen stay where they were.
await page.selectOption('#reportProject', { index: 1 });
const picked = await page.evaluate(() => document.getElementById('reportProject').selectedOptions[0].textContent);
check(picked !== proj1, `a second project can be chosen (${picked})`);
await page.click('#projects .proj:first-child button[data-act=pdown]');
await page.waitForFunction(() => true);
const still = await page.evaluate(() => document.getElementById('reportProject').selectedOptions[0].textContent);
check(still === picked, `and it still names it after a reorder (${still})`);
await page.click('#projects .proj:last-child button[data-act=pup]');          // order back

await page.selectOption('#reportMode', 'changed');                           // as it was
await page.click('#projects .proj:first-child li input[data-act=obj-on]');    // street back on
await page.click('.tab[data-pane="sheet"]');
await page.fill('#q2', '');
await page.click('.tab[data-pane="prices"]');
await page.waitForFunction((n) => app.sheetRows.length === n, before2.all, { timeout: 15000 });
await page.waitForFunction(() => document.getElementById('wsSave').textContent === '✓' && !S.Sync.dirty, null, { timeout: 20000 });

// remove one project -> its file leaves the server too
await page.click('#projects .proj:last-child button[data-act=del]');
await page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 15000 });
await page.evaluate(() => S.Sync.q);
const w2 = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(w2.files.length === 1 && w2.state.projects.length === 1 && Object.keys(w2.state.files).length === 1, 'deleting a project removes its file from the workspace');
// add it back (same file name as before) -> two files again, no duplicate entry
await page.setInputFiles('#pick', [smetas[1]]);
await page.waitForFunction(() => app.projects.length === 2 && S.Sync.ws.files.length === 2 && !S.Sync.dirty, null, { timeout: 90000 });
await page.evaluate(() => S.Sync.q);
const w3 = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(w3.files.length === 2 && Object.keys(w3.state.files).length === 2, 're-adding the file uploads it again');

// export -> stored on the server
await page.click('#export');
await page.waitForFunction(() => document.getElementById('toast').textContent.includes('сохранён на сервере'), null, { timeout: 60000 });
check((await count('exports')) === 1, 'export stored in exports');

// Typing a price fires on every keystroke, and each one used to be its own
// write — «120000» meant five, four of them recording a number nobody meant.
// They are gathered and written once the typing stops, in one request.
let corrWrites = 0;
page.on('request', (r) => {
  if (/\/api\/corrections\/bulk/.test(r.url())) corrWrites++;
});
await page.evaluate((k) => {
  const r = app.model.resources.find((x) => x.key === k);
  const target = Math.round(r.price * 1.2);
  // one digit at a time, the way a person types
  const digits = String(target).split('');
  let typed = '';
  for (const d of digits) { typed += d; app.setPrice(k, Number(typed)); }
}, first.key);
check(corrWrites === 0, `nothing is written while the digits are still arriving (${corrWrites})`);
await page.evaluate(() => S.Sync.flush());
await page.evaluate(() => S.Sync.q);
check(corrWrites === 1, `and one write when the typing stops (${corrWrites})`);

// reset the price -> correction removed
await page.evaluate((k) => { const r = app.model.resources.find((x) => x.key === k); app.setPrice(k, r.price); }, first.key);
await page.evaluate(() => S.Sync.flush());
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === 0, 'resetting the price removes the correction');

// «Применить процент» changes every visible resource in one gesture. That used
// to be one HTTP create per resource — on the deployed server, forty written
// and the rest refused with 429 and dropped. It is one request now, and the
// count below is the whole estimate, not forty of it.
// A resource priced at zero in the estimate stays at zero — ten per cent off
// nothing is nothing — so it is not a change and gets no correction.
const all = await page.evaluate(() =>
  app.model.resources.filter((r) => !S.near(r.price, Math.round(r.price * 0.9))).length);
corrWrites = 0;
page.once('dialog', (d) => d.accept('-10'));
await page.click('#pctBtn');
await page.evaluate(() => S.Sync.flush());
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === all, `every resource the percentage moved is recorded (${await count('corrections')} of ${all})`);
check(corrWrites === Math.ceil(all / 1000), `in ${corrWrites} request(s), not ${all}`);
const pct = (await api(`/api/collections/corrections/records?perPage=1&filter=${encodeURIComponent(`res_key='${first.key}'`)}`, {}, su)).items[0];
check(pct && Math.abs(pct.market_price - Math.round(first.price * 0.9)) <= 1, 'and the price stored is the one applied');

// «Сбросить» puts every resource back on its own estimate price, which means
// removing every correction — also one request.
corrWrites = 0;
await page.click('#resetBtn');
await page.evaluate(() => S.Sync.flush());
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === 0, 'resetting them all removes every correction');
check(corrWrites === 1, `in one request (${corrWrites})`);

// A price book is how prices are carried from one project to the next. It used
// to be written straight into the model, around the one method the server
// build watches: the sheet updated, the save tick stayed green, and the whole
// book was gone the moment the expert left the application.
const bookRows = await page.evaluate(() => app.model.resources
  .filter((r) => r.price > 1000).slice(0, 25)
  .map((r) => ({ name: r.name, unit: r.unit, price: Math.round(r.price * 1.25), smeta: r.price })));
const bookPath = join(root, 'test/.book.json');
writeFileSync(bookPath, JSON.stringify(bookRows, null, 1));
corrWrites = 0;
await page.setInputFiles('#bookInput', bookPath);
await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Загружено цен: 25'), null, { timeout: 20000 });
check(await page.evaluate(() => S.Sync.dirty || document.getElementById('wsSave').textContent === '●'),
  'loading a book marks the workspace as changed');
await page.waitForFunction(() => document.getElementById('wsSave').textContent === '✓' && !S.Sync.dirty, null, { timeout: 20000 });
await page.evaluate(() => S.Sync.flush());
await page.evaluate(() => S.Sync.q);
check((await count('corrections')) === bookRows.length,
  `the book's prices become corrections others can be shown (${await count('corrections')} of ${bookRows.length})`);
check(corrWrites === 1, `written in one request (${corrWrites})`);
const wBook = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(wBook.changed === bookRows.length, `and the workspace records them as changed (${wBook.changed})`);
check(Object.keys(wBook.state.prices2 || {}).length >= bookRows.length,
  'the saved state carries the loaded prices');
// Put the project back the way the later checks expect it.
corrWrites = 0;
await page.click('#resetBtn');
await page.evaluate(() => S.Sync.flush());
await page.evaluate(() => S.Sync.q);
await page.waitForFunction(() => document.getElementById('wsSave').textContent === '✓' && !S.Sync.dirty, null, { timeout: 20000 });
check((await count('corrections')) === 0, 'and clearing them afterwards leaves none');

// finish and go back to the list
await page.click('#wsDone');
await page.waitForFunction(() => document.querySelector('#wsBox .done'));
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', '67159');
await page.waitForFunction(() => /завершена/.test(document.querySelector('#appTable tbody').textContent));
check(true, 'list shows the application as finished');
await page.click('#appTable tbody tr button[data-act=card]');
await page.waitForSelector('#screen-card:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#cardExports li a').length === 1);
check((await page.textContent('#cardFields')).includes('67159') === false && (await page.textContent('#cardTitle')).includes('67159'), 'card opens for the application');
check((await page.$$eval('#cardFiles li a', (a) => a.length)) === 2, 'card lists the two uploaded smeta files');

/*
 * A file token lives three minutes; a card stays open for as long as somebody
 * is reading it. So the address is signed again when the link is pressed,
 * rather than followed as it was baked in when the card was drawn. Proved by
 * poisoning the address that is there and watching what is actually requested.
 */
const asked = [];
page.on('request', (r) => { if (/\/api\/files\//.test(r.url())) asked.push(r.url()); });
await page.$eval('#cardFiles li a', (a) => { a.href = a.href.replace(/token=[^&]*/, 'token=dead'); });
await page.click('#cardFiles li a');
await page.waitForFunction(() => true);
await new Promise((r) => setTimeout(r, 1500));
check(asked.length > 0, `pressing the link asks the server for the file (${asked.length})`);
check(asked.every((u) => !/token=dead/.test(u)),
  'and not with the address that was put there when the card was drawn');
check((await page.textContent('#cardWork')).includes('Завершена'), 'card shows the work status');
await page.click('#cardClose');
await page.selectOption('#appRegion', 'fargona');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
await page.selectOption('#appRegion', 'andijon');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 0);
check(true, 'region filter works on the list');
await page.selectOption('#appRegion', '');
check(await page.evaluate(() => app.projects.length === 0 && !S.Sync.ws), 'app cleared after closing the workspace');

/* ------------------------------------------------- files are not public ---- */
// The uploaded estimates hang on a record id that every signed-in expert can
// see in the list. Without a token that would be enough to download somebody
// else's file from anywhere.
const wsRec = (await api('/api/collections/workspaces/records?perPage=1', {}, su)).items[0];
check(!!(wsRec && wsRec.files && wsRec.files.length), 'the workspace has its uploaded files');
const bareUrl = `${BASE}/api/files/${wsRec.collectionId}/${wsRec.id}/${wsRec.files[0]}`;
const bare = await fetch(bareUrl);
check(bare.status === 403 || bare.status === 404, `the file URL alone is refused (${bare.status})`);
const fileTok = (await api('/api/files/token', { method: 'POST' }, su)).token;
const signed = await fetch(`${bareUrl}?token=${fileTok}`);
check(signed.ok, `and works with a token (${signed.status})`);

/* ---------------------------------------------- signing out leaves the work */
// A workspace belongs to whoever opened it, and this program is used on shared
// office computers. Open one, sign out, sign in as somebody else: the second
// person must arrive at the registry, not inside the first one's application.
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#wsBox:not([hidden])');
check(await page.evaluate(() => !!S.Sync.ws), 'a workspace is open again');
const openedId = await page.evaluate(() => S.Sync.ws.id);

await page.click('#signOut');
await page.waitForSelector('#screen-login:not([hidden])');
await page.waitForFunction(() => !S.Sync.ws, null, { timeout: 15000 });
check(true, 'signing out closes the workspace');
check(await page.evaluate(() => app.projects.length === 0 && Object.keys(app.prices).length === 0),
  'and empties the files and prices it held');

// Whatever was typed before signing out must still be on the server.
const savedAfterSignOut = await api(`/api/collections/workspaces/records/${openedId}`, {}, su);
check(!!savedAfterSignOut.id, 'the workspace itself is still on the server');

await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
const code2 = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
await page.fill('#loginCode', code2);
await page.click('#loginBtn');
await page.waitForSelector('#screen-list:not([hidden])', { timeout: 15000 });
check(await page.evaluate(() => !S.Sync.ws), 'the next person to sign in lands on the registry, not in that workspace');

/* ------------------------------------------- opening two in a row ---------- */
// The registry is a list of buttons and the files behind one take a moment to
// arrive, so a person can start a second application before the first has
// finished. Every open takes a number and a late answer checks it before
// touching anything; leaving bumps it too, so nothing lands in an empty screen.
const seq = await page.evaluate(() => {
  const start = S.Sync.seq;
  const ws = { id: 'zzzz', region: 'fargona', state: {}, files: [] };
  S.Sync.open(ws, { id: 'aaaa', number: '1' });
  const afterFirst = S.Sync.seq;
  S.Sync.open(ws, { id: 'bbbb', number: '2' });
  const afterSecond = S.Sync.seq;
  S.Sync.close();
  return { start, afterFirst, afterSecond, afterClose: S.Sync.seq };
});
check(seq.afterFirst === seq.start + 1 && seq.afterSecond === seq.start + 2,
  `each open takes its own number (${seq.start} -> ${seq.afterFirst} -> ${seq.afterSecond})`);
check(seq.afterClose === seq.afterSecond + 1,
  'and leaving takes one too, so nothing still arriving can land');

await page.screenshot({ path: join(root, 'test/shot-list.png') });
await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'e2e-workspace OK');
process.exit(fail ? 1 : 0);
