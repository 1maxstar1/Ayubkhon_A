/*
 * Reference prices in a real browser — the admin part: an administrator checks and uploads a package on admin.html
 * with crypto.subtle REMOVED (as on a plain-HTTP office network or a server reached by its IP, where it does not
 * exist), the stored hash is the file's, the same file again is recognised, a broken package is refused with a row
 * and a field, a second package is made active from the table, and the documents of a package are listed.
 * Synthetic package only (test/refs-fixture.cjs).
 *
 *   node test/e2e-refs.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const F = require('./refs-fixture.cjs');

const PORT = 8123;
const pb = await startServer({ port: PORT, build: true });
await pb.api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
}, pb.su);

const dir = mkdtempSync(join(tmpdir(), 'e2e-refs-'));
const p1 = F.makePackage(), g1 = F.gzip(p1);
const f1 = join(dir, 'fake-20260101-1.json.gz'); writeFileSync(f1, g1);
const p2 = F.makePackage({ id: 'fake-20260101-2' });
const f2 = join(dir, 'fake-20260101-2.json.gz'); writeFileSync(f2, F.gzip(p2));
const bad = F.makePackage({ id: 'fake-20260101-9' });
bad.rows[3][6] = -1; bad.rows[5][7] = 'вчера';
const f3 = join(dir, 'broken.json.gz'); writeFileSync(f3, F.gzip(bad));
const f4 = join(dir, 'not-a-package.json.gz'); writeFileSync(f4, Buffer.from('просто текст'));

const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
// stands in for a page served over plain HTTP from a LAN address, where crypto.subtle is undefined
await context.addInitScript(() => { try { Object.defineProperty(self.crypto, 'subtle', { get: () => undefined }); } catch (e) { /* ignore */ } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

await page.goto(pb.base + '/admin.html');
await page.fill('#loginEmail', 'boss@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await page.fill('#loginCode', pb.lastCode('boss@example.com'));
await page.click('#loginBtn');
await page.waitForSelector('#refsPanel');
await page.waitForSelector('#adminMain:not([hidden])');
check(await page.evaluate(() => typeof crypto.subtle === 'undefined'), 'crypto.subtle is absent on this page (plain-HTTP stand-in)');
check(await page.isVisible('#refsPanel'), 'the admin page has the reference-price section');

/* ------------------------------------------------------------- a package */
await page.setInputFiles('#refsFile', f1);
await page.waitForFunction(() => /Пакет fake-20260101-1/.test(document.getElementById('refsStat').textContent) && !document.getElementById('refsReady').hidden);
const stat = await page.textContent('#refsStat');
check(/записей 16 · документов 6 · цены 14\.03\.2025 … 27\.02\.2026/.test(stat), 'the checked package is summarised: records, documents, date range');
await page.click('#refsUpload');
await page.waitForFunction(() => /fake-20260101-1/.test(document.querySelector('#refsTable tbody').textContent));
const stored = (await pb.api('/api/collections/ref_packages/records', {}, pb.su)).items;
const sha1 = createHash('sha256').update(g1).digest('hex');
check(stored.length === 1 && stored[0].sha256 === sha1, 'the stored sha256 (computed in pure JS) is the hash of the file');
check(stored[0].active === true && /активен/.test(await page.textContent('#refsTable tbody')), 'the first package is active');

await page.setInputFiles('#refsFile', f1);
await page.waitForFunction(() => /уже загружен/.test(document.getElementById('refsStat').textContent));
check(await page.isHidden('#refsUpload'), 'the same file again: «уже загружен», nothing to upload');
await page.click('#refsCancel');

/* ------------------------------------------------------------- broken files */
await page.setInputFiles('#refsFile', f3);
await page.waitForFunction(() => !document.getElementById('refsErr').hidden);
const err = await page.textContent('#refsErr');
check(/Пакет не принят: 2 ошибки/.test(err) && /строка 4, поле price/.test(err) && /строка 6, поле price_date/.test(err),
  'a broken package is refused: how many errors, row and field of each');
check(err.indexOf('-1') < 0 && err.indexOf('вчера') < 0, 'and no value of the package is shown');
await page.setInputFiles('#refsFile', f4);
await page.waitForFunction(() => /не файл \.json\.gz|повреждён/.test(document.getElementById('refsErr').textContent));
check(true, 'a file that is not a gzip is refused');

/* ------------------------------------------------------------- a second package, activated from the table */
await page.setInputFiles('#refsFile', f2);
await page.waitForFunction(() => /Пакет fake-20260101-2/.test(document.getElementById('refsStat').textContent) && !document.getElementById('refsReady').hidden);
await page.click('#refsUpload');
await page.waitForFunction(() => /fake-20260101-2/.test(document.querySelector('#refsTable tbody').textContent));
check((await pb.api('/api/collections/ref_packages/records?filter=' + encodeURIComponent("package_id='fake-20260101-2'"), {}, pb.su)).items[0].active === false,
  'a second package waits inactive');
await page.click('#refsTable tr:has-text("fake-20260101-2") button[data-act=activate]');
await page.waitForFunction(() => { const tr = [...document.querySelectorAll('#refsTable tbody tr')].find((t) => /fake-20260101-2/.test(t.textContent)); return tr && /активен/.test(tr.textContent); });
const act = (await pb.api('/api/collections/ref_packages/records?filter=' + encodeURIComponent('active=true'), {}, pb.su)).items;
check(act.length === 1 && act[0].package_id === 'fake-20260101-2', '«Сделать активным» leaves exactly the second package active');
await page.click('#refsTable tr:has-text("fake-20260101-2") button[data-act=docs]');
await page.waitForSelector('#refsDocs:not([hidden])');
const docs = await page.textContent('#refsDocs');
check(/ООО «Тест-Поставщик-1»/.test(docs) && /предложение поставщика/.test(docs) && /Хорезмская область/.test(docs) && docs.indexOf('fake-src-') < 0,
  'the documents of a package: type and region in Russian, never a document id');

check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'e2e-refs OK');
process.exit(fail ? 1 : 0);
