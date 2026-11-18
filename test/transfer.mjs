/*
 * «Перенос данных между компьютерами» in a real browser (server/pb_hooks/transfer.pb.js, src/ui/transfer-admin.js):
 * the work of one laptop brought to another — the owner's case of 2026-11-18, a Mac and a Windows laptop each with
 * work of its own.
 *
 * Two databases, one after the other on the same test port (a test server starts with an empty database):
 *   «Mac»     — three applications worked on: A1 priced and finished (its finished prices and journal), with an export;
 *               A2 and A3 priced; «Выгрузить для переноса» gives the .zip;
 *   «Windows» — A2 and A3 worked on too, and B1 of its own; the file says A3 was changed on the Mac after the
 *               Windows' work (the dates are the file's), A2 before it.
 * «Загрузить с другого компьютера» shows the plan (A1 added, A2 kept, A3 replaced), copies the database aside and
 * takes the applications in: the files with new names and the state pointing at them, the prices, the finished prices,
 * the journal, the export; A2 and B1 as they were; and A1 opens on the working page with the Mac's prices.
 *
 *   node test/transfer.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const fflate = load('fflate').__fflate;
const dir = mkdtempSync(join(tmpdir(), 'transfer-'));
const smeta = require('./synth.cjs').write(load(load.PIPELINE), join(dir, 'Тест_смета.xlsx'), 1);
const PORT = 8167, SEC = 1000;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
let pb = null, browser = null, page = null;
const errors = [];

async function signIn() {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(pb.base + '/');
  await page.fill('#loginEmail', 'test@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await page.fill('#loginCode', pb.lastCode('test@example.com'));
  await page.click('#loginBtn');
  await page.waitForSelector('#screen-list:not([hidden])');
}
async function openApp(number) {
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', number);
  await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length >= 1 && tr[0].textContent.includes(n); }, number);
  await page.click(`#appTable tbody tr:has-text("${number}") button[data-act=open]`);
  await page.waitForSelector('#screen-region:not([hidden])');
  await page.selectOption('#regionSel', 'fargona');
  await page.click('#regionForm button[type=submit]');
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.setInputFiles('#pick', smeta);
  await page.waitForFunction(() => window.app && S.Sync.ws && !S.Sync.loading && app.model && app.model.rows.length > 0 && app.pending === 0 &&
    S.Sync.ws.files.length === 1, null, { timeout: 60 * SEC });
}
/** The test user made an administrator: the admin page is theirs only then. */
async function makeAdmin() {
  const u = (await pb.api(`/api/collections/users/records?filter=${encodeURIComponent("email='test@example.com'")}`, {}, pb.su)).items[0];
  await pb.api('/api/collections/users/records/' + u.id, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }, pb.su);
  // the page keeps the record it signed in with: asked again, it carries the role
  await page.evaluate(() => S.pb.collection('users').authRefresh());
}
const saved = () => page.waitForFunction(() => !S.Sync.dirty && !Object.keys(S.Sync.pend).length && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * SEC });
/** Prices of the first `n` resources, at `k` × their smeta price; returns { key: price }. */
async function price(n, k) {
  const set = await page.evaluate(([n, k]) => {
    const o = {};
    app.model.resources.filter((r) => r.price > 100).slice(0, n).forEach((r) => { o[r.key] = Math.round(r.price * k); });
    app.setPrices(o);
    return o;
  }, [n, k]);
  await saved();
  return set;
}
async function finish() {
  await saved();
  await page.click('#wsDone');
  await page.waitForSelector('#finishBox:not([hidden])');
  await page.click('#finOk');
  await page.waitForFunction(() => document.querySelector('#wsBox .done'), null, { timeout: 30 * SEC });
}
async function closeApp() { await page.click('#wsList'); await page.waitForSelector('#screen-list:not([hidden])'); }
const list = async (coll, filter) => (await pb.api(`/api/collections/${coll}/records?perPage=500&filter=${encodeURIComponent(filter || '')}`, {}, pb.su)).items || [];
const wsOf = async (number) => {
  const a = (await list('applications', `number='${number}'`))[0];
  return a ? (await list('workspaces', `application='${a.id}'`))[0] : null;
};

try {
  /* ------------------------------------------------------------------ «Mac» */
  pb = await startServer({ port: PORT, registry: true, build: true });
  const rows = pb.rows().filter((r) => r.inn);
  await pb.api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, pb.su);
  const [A1, A2, A3, B1] = rows.slice(0, 4).map((r) => r.number);
  browser = await chromium.launch(launchOpts);
  await signIn();

  await openApp(A1);
  const pricesA1 = await price(3, 0.8);
  await finish();
  await closeApp();
  await openApp(A2);
  await price(2, 0.7);
  await closeApp();
  await openApp(A3);
  const pricesA3 = await price(2, 0.6);
  await closeApp();
  // an export of A1, kept with the application
  const wsA1 = await wsOf(A1);
  {
    const fd = new FormData();
    fd.append('workspace', wsA1.id); fd.append('application', wsA1.application); fd.append('mode', 'changed');
    fd.append('file', new Blob([readFileSync(smeta)]), 'A1_taqqoslash.xlsx');
    await fetch(pb.base + '/api/collections/exports/records', { method: 'POST', headers: { Authorization: pb.su }, body: fd });
  }
  const mac = {
    a1: { files: wsA1.files.length, corrections: (await list('corrections', `workspace='${wsA1.id}'`)).length,
      memory: (await list('price_memory', `workspace='${wsA1.id}'`)).length, events: (await list('suggest_events', `workspace='${wsA1.id}'`)).length },
    formats: (await list('smeta_files')).length
  };
  check(mac.a1.files === 1 && mac.a1.corrections === 3 && mac.a1.memory > 3 && mac.formats >= 1, '(the Mac has its work: ' + JSON.stringify(mac) + ')');

  await makeAdmin();
  await page.goto(pb.base + '/admin.html');
  await page.waitForSelector('#trExport');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60 * SEC }), page.click('#trExport')]);
  const zipPath = join(dir, dl.suggestedFilename());
  await dl.saveAs(zipPath);
  check(/^perenos-.*\.zip$/.test(dl.suggestedFilename()) && /Готово: заявок 3/.test(await page.textContent('#trState')),
    '«Выгрузить для переноса» gives one .zip with the three applications (' + await page.textContent('#trState') + ')');
  const z = fflate.unzipSync(new Uint8Array(readFileSync(zipPath)));
  const doc = JSON.parse(fflate.strFromU8(z['transfer.json']));
  check(doc.format === 'smeta-transfer' && doc.workspaces.length === 3 && doc.exports.length === 1 && Object.keys(z).filter((k) => k.startsWith('files/')).length >= 4 &&
    !doc.missing.length, 'it holds the records and every file: workspaces, export, kept smeta files (' + Object.keys(z).length + ' entries)');
  // the dates are the file's: A3 changed on the Mac after anything the Windows will do, A2 long before
  const appNo = {};
  doc.applications.forEach((a) => { appNo[a.id] = a.number; });
  doc.workspaces.forEach((w) => {
    if (appNo[w.application] === A3) w.updated = '2099-01-01 00:00:00.000Z';
    if (appNo[w.application] === A2) w.updated = '2001-01-01 00:00:00.000Z';
  });
  z['transfer.json'] = fflate.strToU8(JSON.stringify(doc));
  writeFileSync(zipPath, fflate.zipSync(z));
  await page.close();
  await pb.stop();

  /* -------------------------------------------------------------- «Windows» */
  pb = await startServer({ port: PORT, registry: true, build: false });
  await pb.api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, pb.su);
  await signIn();
  await openApp(A2);
  const pricesA2win = await price(1, 0.5);
  await closeApp();
  await openApp(A3);
  await price(1, 0.5);
  await closeApp();
  await openApp(B1);
  await price(1, 0.9);
  await closeApp();
  const before = { a2: await wsOf(A2), b1: await wsOf(B1) };
  // A1 is not in this computer's registry (an application added by hand on the Mac): the file brings it
  const a1here = (await list('applications', `number='${A1}'`))[0];
  await pb.api('/api/collections/applications/records/' + a1here.id, { method: 'DELETE' }, pb.su);
  const a1mac = doc.applications.find((a) => a.number === A1);
  const ctBefore = (await list('contragents')).length;

  await makeAdmin();
  await page.goto(pb.base + '/admin.html');
  await page.waitForSelector('#trExport');
  await page.setInputFiles('#trFile', zipPath);
  await page.waitForSelector('#trTable', { timeout: 60 * SEC });
  const plan = await page.$$eval('#trTable tbody tr', (trs) => trs.map((t) => t.dataset.n + ':' + t.className));
  check(plan.sort().join() === [A1 + ':tr-add', A2 + ':tr-keep', A3 + ':tr-replace'].sort().join(),
    'the plan first: A1 added, A2 kept (changed later here), A3 replaced (changed later there) (' + plan.join(' ') + ')');
  check(/резервную копию/.test(await page.textContent('#trPlan')), '… and it says the database is copied aside first');
  await page.click('#trGo');
  await page.waitForFunction(() => /Готово|Остановлено|Ничего не загружено/.test(document.getElementById('trState').textContent), null, { timeout: 120 * SEC });
  const doneText = await page.textContent('#trState');
  if (/не загружено/.test(doneText)) {
    console.log('  (rows: ' + (await page.$$eval('#trTable tbody tr', (trs) => trs.map((t) => t.dataset.n + ' ' + t.querySelector('.tr-what').textContent).join(' | '))) + ')');
  }
  check(/добавлено 1, заменено 1, оставлено как здесь 1/.test(doneText) && /before-transfer-\d{8}-\d{6}\.zip/.test(doneText),
    'taken in: one added, one replaced, one kept — and the backup named (' + doneText + ')');
  const backups = await pb.api('/api/backups', {}, pb.su);
  check(Array.isArray(backups) && backups.some((b) => /^before-transfer-/.test(b.key)), 'the database was copied aside before anything was taken in');

  // A1: everything the Mac had, its files under new names and the state pointing at them
  const w1 = await wsOf(A1);
  const st1 = w1 && w1.state, refs1 = st1 ? Object.values(st1.files || {}) : [];
  check(w1 && w1.files.length === mac.a1.files && refs1.length === w1.files.length && refs1.every((n) => w1.files.includes(n)) && w1.status === 'done',
    'A1 is here, finished, with its estimate file — the state points at the file\'s new name (' + JSON.stringify(refs1) + ' in ' + JSON.stringify(w1 && w1.files) + ')');
  const c1 = await list('corrections', `workspace='${w1.id}'`), m1 = await list('price_memory', `workspace='${w1.id}'`), e1 = await list('suggest_events', `workspace='${w1.id}'`);
  check(c1.length === mac.a1.corrections && m1.length === mac.a1.memory && e1.length === mac.a1.events,
    'its price corrections, finished prices and journal came with it (' + [c1.length, m1.length, e1.length].join('/') + ')');
  check(c1.every((c) => pricesA1[c.res_key] === c.market_price), 'the corrections carry the Mac\'s prices');
  const a1new = (await list('applications', `number='${A1}'`))[0];
  const a1ct = a1new && a1new.contragent ? (await pb.api('/api/collections/contragents/records/' + a1new.contragent, {}, pb.su)) : null;
  check(a1new && a1new.org_name === a1mac.org_name && a1new.registered_at === a1mac.registered_at && a1ct && a1ct.inn === a1mac.inn,
    'an application not in this registry is made from the file: its fields, its date, its contragent by INN');
  const x1 = await list('exports', `workspace='${w1.id}'`);
  let exportOk = false;
  if (x1.length === 1) {
    const tok = (await pb.api('/api/files/token', { method: 'POST' }, pb.su)).token;
    const r = await fetch(`${pb.base}/api/files/exports/${x1[0].id}/${x1[0].file}?token=${tok}`);
    exportOk = r.ok && (await r.arrayBuffer()).byteLength === readFileSync(smeta).length;
  }
  check(exportOk, 'its export came with its file, byte for byte');

  // A2 kept as the Windows had it, A3 replaced by the Mac's, B1 untouched
  const w2 = await wsOf(A2), w3 = await wsOf(A3), wb = await wsOf(B1);
  check(w2.id === before.a2.id && w2.updated === before.a2.updated && JSON.stringify(w2.state.prices2 || w2.state.prices) === JSON.stringify(before.a2.state.prices2 || before.a2.state.prices),
    'A2, changed later here, is as it was');
  const c3 = await list('corrections', `workspace='${w3.id}'`);
  check(c3.length === 2 && c3.every((c) => pricesA3[c.res_key] === c.market_price), 'A3, changed later on the Mac, now has the Mac\'s prices (' + c3.length + ')');
  check(wb.id === before.b1.id && wb.updated === before.b1.updated, 'B1, of this computer only, is untouched');
  check((await list('contragents')).length >= ctBefore && (await list('smeta_files')).length >= mac.formats, 'the contragents are matched by INN, the format samples taken in');

  // A1 opens on the working page with the Mac's prices
  await page.goto(pb.base + '/');
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', A1);
  await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length >= 1 && tr[0].textContent.includes(n); }, A1);
  await page.click(`#appTable tbody tr:has-text("${A1}") button[data-act=open]`);
  await page.waitForFunction(() => window.app && S.Sync.ws && !S.Sync.loading && app.model && app.model.rows.length > 0 && app.pending === 0, null, { timeout: 60 * SEC });
  const shown = await page.evaluate((keys) => keys.map((k) => { const r = app.model.resources.find((x) => x.key === k); return r ? r.market : null; }), Object.keys(pricesA1));
  check(shown.every((v, i) => v === Object.values(pricesA1)[i]) && await page.evaluate(() => app.projects.length === 1 && !Object.keys(S.Sync.away || {}).length),
    'A1 opens on the working page: its estimate is read from the file taken in, its prices are the Mac\'s (' + shown.join(', ') + ')');
  void pricesA2win;

  check(!errors.length, errors.length ? 'page errors: ' + errors.slice(0, 4).join('; ') : 'no page errors');
} catch (e) {
  check(false, 'the run stopped: ' + String(e && e.message || e).split('\n')[0]);
  if (errors.length) console.log(errors.join('\n'));
  if (page) console.log('  (page: ' + page.url() + ' — ' + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)).catch(() => '')) + ')');
} finally {
  if (browser) await browser.close();
  if (pb) await pb.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `FAILED (${fail})` : 'transfer OK');
process.exit(fail ? 1 : 0);
