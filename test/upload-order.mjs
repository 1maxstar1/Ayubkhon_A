/*
 * Two estimates added one after the other, before the first has finished
 * uploading.
 *
 * The upload path has to remember which stored file belongs to which estimate,
 * and it used to work that out from how many files the workspace had *before*
 * the request — read at the moment the button was pressed rather than at the
 * moment the request actually ran. Two uploads started in the same breath
 * therefore both measured "before = 0", and the second one claimed the first
 * one's file: the workspace reopened with the same estimate twice and the
 * second estimate's content gone.
 *
 * The check here is the one that matters: after both uploads, the name the
 * page shows must lead to the bytes that were actually dropped in.
 *
 *   node test/upload-order.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

// PocketBase looks at the bytes, not at the name, so the two stand-ins have to
// be real (tiny) workbooks — a zip each, with one different file inside.
const { load } = createRequire(import.meta.url)('./load.cjs');
const fflate = load('fflate').__fflate;
const book = (letter) => Array.from(fflate.zipSync({ 'sheet.txt': new TextEncoder().encode(letter.repeat(64)) }));
const ONE = book('A'), TWO = book('B');

const PORT = 8113;
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
check(await page.evaluate(() => !!S.Sync.ws), 'a workspace is open');

/*
 * Two uploads started in the same tick — the second before the first has
 * answered. Nothing is parsed here: upload() only looks at the file name, and
 * what is under test is which stored file each name ends up pointing at.
 */
const got = await page.evaluate(async (books) => {
  const file = (name, bytes) =>
    new File([new Uint8Array(bytes)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  S.Sync.upload([file('one.xlsx', books[0])]);
  S.Sync.upload([file('two.xlsx', books[1])]);
  await S.Sync.q;
  return { map: Object.assign({}, S.Sync.files), ws: (S.Sync.ws.files || []).slice(), id: S.Sync.ws.id };
}, [ONE, TWO]);

check(got.ws.length === 2, `both files reached the server (${got.ws.length})`);
check(!!got.map['one.xlsx'] && !!got.map['two.xlsx'], 'both names were given an address');
check(got.map['one.xlsx'] !== got.map['two.xlsx'],
  `the two names lead to two different files (${got.map['one.xlsx']} / ${got.map['two.xlsx']})`);

// And the addresses are not merely different — each leads to its own bytes.
const ws = await api(`/api/collections/workspaces/records/${got.id}`, {}, su);
const token = (await api('/api/files/token', { method: 'POST' }, su)).token;
const bytes = async (name) => {
  const r = await fetch(`${pb.base}/api/files/${ws.collectionId}/${ws.id}/${name}?token=${token}`);
  if (!r.ok) return 'HTTP ' + r.status;
  return Buffer.from(await r.arrayBuffer()).toString('hex');
};
const a = await bytes(got.map['one.xlsx']);
const b = await bytes(got.map['two.xlsx']);
const hex = (arr) => Buffer.from(arr).toString('hex');
check(a === hex(ONE), '«one.xlsx» leads to the bytes dropped in as one.xlsx');
check(b === hex(TWO), '«two.xlsx» leads to the bytes dropped in as two.xlsx');

await browser.close();
pb.stop();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'upload-order OK');
process.exit(fail ? 1 : 0);
