/*
 * «Цены этого контрагента…» (F1): the earlier prices of the same contractor, in one list, set by one confirmation.
 *
 * Held here, in server mode, on an invented estimate given to three applications of one region: A and C of one
 * contractor, B of another.
 *
 *   - A priced three resources; in C the button lists them, with the price A gave;
 *   - a resource C already has its own price for is not listed, and is said to be skipped;
 *   - nothing is set before «Применить выбранные»; an unchecked line is not set;
 *   - the press sets the checked ones, marks where they came from, and «Отменить» takes the press back;
 *   - another contractor (B) is offered nothing;
 *   - and the region screen of C names the region of A, the contractor's earlier application (F2).
 *
 *   node test/contragent-prices.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const dir = mkdtempSync(join(tmpdir(), 'cprices-'));
const smeta = require('./synth.cjs').write(load(load.PIPELINE), join(dir, 'first.xlsx'), 1);

const pb = await startServer({ port: 8161, registry: true, build: true });
const { api, su } = pb;
const rows = pb.rows();
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const C = rows.find((r) => r.inn && rows.some((x) => x.inn === r.inn && x.number !== r.number));
const A = rows.find((r) => r.inn === C.inn && r.number !== C.number);
const B = rows.find((r) => r.inn && r.inn !== A.inn);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function openApp(number, atRegion) {
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', number);
  await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length >= 1 && tr[0].textContent.includes(n); }, number);
  await page.click(`#appTable tbody tr:has-text("${number}") button[data-act=open]`);
  await page.waitForSelector('#screen-region:not([hidden])');
  if (atRegion) await atRegion();
  await page.selectOption('#regionSel', 'fargona');
  await page.click('#regionForm button[type=submit]');
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.setInputFiles('#pick', smeta);
  await page.waitForFunction(() => window.app && S.Sync.ws && !S.Sync.loading && app.model && app.model.rows.length > 0 && app.pending === 0 &&
    S.Sync.ws.files.length === 1, null, { timeout: 60 * 1000 });
}
const saved = () => page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * 1000 });
async function closeApp() { await page.click('#wsList'); await page.waitForSelector('#screen-list:not([hidden])'); }

await page.goto(pb.base + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await page.fill('#loginCode', pb.lastCode('test@example.com'));
await page.click('#loginBtn');

/* A prices three resources */
await openApp(A.number);
const picked = await page.evaluate(() => {
  const seen = {};
  const rs = app.model.resources.filter((r) => r.price > 100 && !seen[r.nk] && (seen[r.nk] = 1) &&
    app.model.resources.filter((x) => x.nk === r.nk).length === 1).slice(0, 3);
  rs.forEach((r, i) => app.setPrice(r.key, Math.round(r.price * (0.9 - i * 0.1))));
  return rs.map((r, i) => ({ key: r.key, name: r.name, price: r.price, market: Math.round(r.price * (0.9 - i * 0.1)) }));
});
check(picked.length === 3, 'A prices three resources');
await saved();
check(await page.isHidden('#cpBtn') === false, 'the button is there for an application with a contractor');
await closeApp();

/* the region offered from the contractor's earlier applications (F2) */
const pr = await page.evaluate(() => {
  const R = S.Registry, h = [{ region: 'xorazm', number: '1' }, { region: 'xorazm', number: '2' }, { region: 'buxoro', number: '3' }];
  return {
    weak: R.pickRegion({ region: 'buxoro', confidence: 0.3 }, h), sure: R.pickRegion({ region: 'buxoro', confidence: 0.9 }, h),
    none: R.pickRegion({ region: '', confidence: 0 }, []), split: R.pickRegion({ region: '', confidence: 0 }, [{ region: 'xorazm' }, { region: 'buxoro' }])
  };
});
check(pr.weak.region === 'xorazm' && /2 из 3/.test(pr.weak.hint) && /по тексту заявки/.test(pr.weak.hint),
  'a weak guess from the text gives way to the region most of the earlier applications had, and both are said');
check(pr.sure.region === 'buxoro' && /прежних заявках/.test(pr.sure.hint), 'a sure guess stands, with the history said beside it');
check(pr.none.region === '' && pr.split.region === '', 'no history, or no majority: nothing is offered from it');

/* C: the same contractor */
await openApp(C.number, async () => {
  await page.waitForFunction(() => /прежних заявках/.test(document.getElementById('regionHint').textContent) || document.getElementById('regionSel').value === 'fargona',
    null, { timeout: 10 * 1000 }).catch(() => null);
  const hint = await page.textContent('#regionHint'), sel = await page.inputValue('#regionSel');
  check(/прежних заявках/.test(hint) || sel === 'fargona', `the region screen of C names the region of A (${sel}: ${hint})`);
});
const own = picked[2];
await page.evaluate((p) => app.setPrice(p.key, p.price + 7), own);
await page.click('#cpBtn');
await page.waitForSelector('#cpBox:not([hidden])');
const listed = await page.$$eval('#cpBox tbody tr', (trs) => trs.map((t) => t.children[1].textContent));
check(listed.length === 2 && picked.slice(0, 2).every((p) => listed.some((l) => l.startsWith(p.name))),
  `the two resources A priced are listed (${listed.length})`);
check(!listed.some((l) => l.startsWith(own.name)), 'the one C already has its own price for is not');
check(/с вашей ценой — 1/.test(await page.textContent('#cpBox .cp-f')), 'and it is said to be skipped');
check(new RegExp('№ ' + A.number).test(await page.textContent('#cpBox tbody')), 'each line names the application it comes from');
check(await page.evaluate((ps) => ps.every((p) => app.prices[p.key] == null || app.prices[p.key] === p.price), picked.slice(0, 2)),
  'nothing is set before «Применить выбранные»');

// the second line unchecked: only the first is set
await page.click('#cpBox tbody tr:nth-child(2) input[type=checkbox]');
check(/\(1\)/.test(await page.textContent('#cpBox [data-apply]')), 'the button counts the checked lines');
const second = await page.$eval('#cpBox tbody tr:nth-child(2) td:nth-child(2)', (t) => t.textContent);
const one = picked.find((p) => listed[0].startsWith(p.name));
const other = picked.find((p) => second.startsWith(p.name));
await page.click('#cpBox [data-apply]');
check(await page.isHidden('#cpBox'), 'the list closes');
check(await page.evaluate((p) => app.prices[p.key] === p.market, one), `the checked one is set at A's price (${one.market})`);
check(await page.evaluate((p) => app.prices[p.key] == null || app.prices[p.key] === p.price, other), 'the unchecked one is not');
check(await page.evaluate((p) => app.prices[p.key] === p.price + 7, own), 'the price C typed is untouched');
check(await page.evaluate((p) => /^hint:/.test(S.sourceOfPrice(p.key, p.market)), one), 'the price set is marked as taken from the earlier application');
await saved();
const corr = await api(`/api/collections/corrections/records?filter=${encodeURIComponent(`res_key='${one.key}' && market_price=${one.market} && workspace='${await page.evaluate(() => S.Sync.ws.id)}'`)}`, {}, su);
check(corr.items.length === 1 && /^hint:/.test(corr.items[0].source), 'and the server records where it came from');

await page.evaluate(() => [...document.querySelectorAll('#toast .toast-act')].filter((b) => b.textContent === 'Отменить').pop().click());
check(await page.evaluate((p) => app.prices[p.key] == null || app.prices[p.key] === p.price, one), '«Отменить» takes the press back');
check(await page.evaluate((p) => app.prices[p.key] === p.price + 7, own), 'and still leaves the typed price');
await saved();
await closeApp();

/* B: another contractor */
await openApp(B.number);
await page.click('#cpBtn');
await page.waitForFunction(() => /Нечего предложить/.test(document.getElementById('toast').textContent), null, { timeout: 10 * 1000 }).catch(() => null);
check(/Нечего предложить/.test(await page.textContent('#toast')) && await page.isHidden('#cpBox'), 'another contractor is offered nothing, in words');

await browser.close();
await pb.stop();
rmSync(dir, { recursive: true, force: true });
check(!errors.length, errors.length ? 'page errors: ' + errors.slice(0, 4).join('; ') : 'no page errors');
console.log(fail ? `FAILED (${fail})` : 'contragent-prices OK');
process.exit(fail ? 1 : 0);
