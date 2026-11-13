/*
 * «Память» in a real browser (docs/ai-reja.md, phase 2): what finished applications left comes back for the same
 * resources in the same region. Server mode, invented estimates (test/synth.cjs); four applications of one region —
 * A and C of one contragent, B of another — and D in another region.
 *
 *   - A and B are finished: C shows «пам.» on the resource both priced — its own contragent's price first, then the
 *     other's, each with its application; nothing is set before «Применить»; the price applied is recorded as taken
 *     from the memory (mem:<row>), in the correction and in the journal;
 *   - a smeta price both A and B left alone is «ранее принято» in C; lower the accepted price and it is «выше
 *     принятого», with an amber cell; take B's row away and A's own price confirms nothing for C;
 *   - the switch «Память» hides all of it and is remembered; another region shows none of it.
 *
 *   node test/e2e-memory.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'memory-'));
const smeta = require('./synth.cjs').write(load(load.PIPELINE), join(dir, 'first.xlsx'), 1);

const pb = await startServer({ port: 8164, registry: true, build: true });
const { api, su } = pb;
const rows = pb.rows();
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const C = rows.find((r) => r.inn && rows.some((x) => x.inn === r.inn && x.number !== r.number));
const A = rows.find((r) => r.inn === C.inn && r.number !== C.number);
const B = rows.find((r) => r.inn && r.inn !== A.inn);
const D = rows.find((r) => r.inn && r.inn !== A.inn && r.inn !== B.inn);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const SEC = 1000;
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

async function openApp(number, region) {
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', number);
  await page.waitForFunction((n) => { const tr = document.querySelectorAll('#appTable tbody tr'); return tr.length >= 1 && tr[0].textContent.includes(n); }, number);
  await page.click(`#appTable tbody tr:has-text("${number}") button[data-act=open]`);
  await page.waitForSelector('#screen-region:not([hidden])');
  await page.selectOption('#regionSel', region || 'fargona');
  await page.click('#regionForm button[type=submit]');
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.setInputFiles('#pick', smeta);
  await page.waitForFunction(() => window.app && S.Sync.ws && !S.Sync.loading && app.model && app.model.rows.length > 0 && app.pending === 0 &&
    S.Sync.ws.files.length === 1, null, { timeout: 60 * SEC });
}
const saved = () => page.waitForFunction(() => !S.Sync.dirty && !Object.keys(S.Sync.pend).length && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * SEC });
async function finish() {
  await saved();
  await page.click('#wsDone');
  await page.waitForSelector('#finishBox:not([hidden])');
  await page.click('#finOk');
  await page.waitForFunction(() => document.querySelector('#wsBox .done'), null, { timeout: 30 * SEC });
}
async function closeApp() { await page.click('#wsList'); await page.waitForSelector('#screen-list:not([hidden])'); }
const memLoaded = () => page.waitForFunction(() => Object.keys(S.Memory.map).length > 0, null, { timeout: 20 * SEC });
const rowSel = (name) => `#priceScroll .vrow:has(.c[title="${name}"])`;
const only = async (name) => {
  await page.fill('#q', name);
  await page.waitForFunction((t) => { const r = document.querySelectorAll('#priceScroll .vrow'); return r.length >= 1 && [...r].every((x) => x.querySelector('.c[title="' + t + '"]')); }, name);
};
const mem = async (filter) => (await api(`/api/collections/price_memory/records?perPage=500&filter=${encodeURIComponent(filter)}`, {}, su)).items;

try {
  await page.goto(pb.base + '/');
  await page.fill('#loginEmail', 'test@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await page.fill('#loginCode', pb.lastCode('test@example.com'));
  await page.click('#loginBtn');

  /* A prices a resource and finishes */
  await openApp(A.number);
  const picked = await page.evaluate(() => {
    const one = (r) => app.model.resources.filter((x) => x.nk === r.nk).length === 1 && r.price > 100;
    const rs = app.model.resources.filter(one);
    return { priced: { key: rs[0].key, name: rs[0].name, price: rs[0].price }, left: { key: rs[1].key, name: rs[1].name, price: rs[1].price },
      own: { key: rs[2].key, name: rs[2].name, price: rs[2].price } };
  });
  const priceA = Math.round(picked.priced.price * 0.9), priceB = Math.round(picked.priced.price * 0.8);
  await page.evaluate((a) => app.setPrice(a.k, a.v), { k: picked.priced.key, v: priceA });
  check(!(await page.$('#priceScroll .tagp')) && !(await page.$('#priceScroll .mceil')), 'nothing is remembered yet: no tag, no mark');
  check(await page.isVisible('#memTog') && await page.isChecked('#memOn'), 'the switch «Память» is on the toolbar, on');
  await finish();
  const wsA = await page.evaluate(() => S.Sync.ws.id);
  await closeApp();

  /* B, another contragent, prices the same resource otherwise and finishes */
  await openApp(B.number);
  await page.evaluate((a) => app.setPrice(a.k, a.v), { k: picked.priced.key, v: priceB });
  await finish();
  const wsB = await page.evaluate(() => S.Sync.ws.id);
  await closeApp();

  /* C: the same contragent as A */
  await openApp(C.number);
  await memLoaded();
  await only(picked.priced.name);
  await page.waitForSelector(rowSel(picked.priced.name) + ' .tagp');
  check(await page.$eval(rowSel(picked.priced.name) + ' .tagp', (b) => b.classList.contains('own') && b.textContent === 'пам.'),
    'the resource both priced carries «пам.», marked as its own contragent\'s');
  check(await page.evaluate((k) => app.prices[k] == null, picked.priced.key), 'and nothing is set by that');
  await page.click(rowSel(picked.priced.name) + ' .tagp');
  await page.waitForSelector('#memPop:not([hidden])');
  const pop = await page.evaluate(() => ({ subs: [...document.querySelectorAll('#memPop .mp-sub')].map((x) => x.textContent),
    rows: [...document.querySelectorAll('#memPop .mp-row')].map((x) => x.textContent), head: document.querySelector('#memPop .mp-head').textContent }));
  const sp = (t) => t.replace(/[  ]/g, ' ');
  check(pop.subs[0] === 'Этот контрагент' && pop.subs[1] === 'Другие контрагенты' && pop.rows.length === 2 &&
    pop.rows[0].includes('№ ' + A.number) && pop.rows[1].includes('№ ' + B.number), 'its own contragent\'s price first, then the other\'s, each with its application');
  check(sp(pop.rows[0]).includes(sp(await page.evaluate((v) => S.price(v), priceA))) && /введена вручную/.test(pop.rows[0]) && /без НДС/.test(pop.head),
    'the price, where it came from, and that it is without VAT');
  check(await page.evaluate((k) => app.prices[k] == null, picked.priced.key), 'looking sets nothing');
  await page.click('#memPop .mp-row button[data-i="0"]');
  check(await page.evaluate((a) => app.prices[a.k] === a.v, { k: picked.priced.key, v: priceA }) && await page.isHidden('#memPop'), '«Применить» sets that price');
  await saved();
  const wsC = await page.evaluate(() => S.Sync.ws.id);
  const corr = (await api(`/api/collections/corrections/records?filter=${encodeURIComponent(`workspace='${wsC}'`)}`, {}, su)).items;
  const rowA = (await mem(`workspace='${wsA}'`)).find((r) => r.res_key === picked.priced.key);
  check(corr.length === 1 && corr[0].source === 'mem:' + rowA.id && corr[0].market_price === priceA, 'the correction records that it came from the memory (' + (corr[0] && corr[0].source) + ')');
  await only(picked.priced.name);
  check(await page.$eval(rowSel(picked.priced.name), (r) => !!r.querySelector('.upill.h') && /завершённой заявки/.test(r.querySelector('.upill.h').title)),
    'the cell carries the mark of an earlier application');
  await page.evaluate(() => S.Journal.commit());
  await page.waitForFunction(() => !S.Journal.busy && !S.Journal.q.length, null, { timeout: 15 * SEC });
  const ev = (await api(`/api/collections/suggest_events/records?filter=${encodeURIComponent(`workspace='${wsC}'`)}`, {}, su)).items;
  check(ev.length === 1 && ev[0].action === 'applied' && ev[0].source === 'mem:' + rowA.id && ev[0].lines[0].k === 'mem' && ev[0].chosen === 0 && ev[0].lines[0].same === true &&
    ev[0].lines[1].k === 'mem' && ev[0].lines[1].same === false, 'and the journal has it: applied, the memory line taken, the other one shown beside it');

  /* left alone by two independent applications: «ранее принято» */
  await only(picked.left.name);
  await page.waitForSelector(rowSel(picked.left.name) + ' .mceil.ok');
  check(/Ранее принято/.test(await page.getAttribute(rowSel(picked.left.name) + ' .mceil', 'title')) && !(await page.$(rowSel(picked.left.name) + ' .tagp')),
    'a smeta price A and B both left alone: «ранее принято» beside it, and no price is offered');
  await page.click(rowSel(picked.left.name) + ' .mceil');
  await page.waitForSelector('#memPop:not([hidden])');
  const cp = await page.textContent('#memPop');
  check(/Оставлено как в смете/.test(cp) && /2 независимых заявок/.test(cp) && cp.includes('№ ' + A.number) && cp.includes('№ ' + B.number) && !(await page.$('#memPop button[data-i]')),
    'its popover names the two applications, and has nothing to apply');
  await page.keyboard.press('Escape');
  check(/в памяти 1/.test(await page.textContent('#priceCount')), 'the status line counts the resources with a remembered price');

  /* the accepted price lowered: this smeta price is above it */
  const lower = Math.round(picked.left.price * 0.9);
  for (const w of [wsA, wsB]) {
    const r = (await mem(`workspace='${w}'`)).find((x) => x.res_key === picked.left.key);
    await api('/api/collections/price_memory/records/' + r.id, { method: 'PATCH', body: JSON.stringify({ final_price: lower, smeta_price: lower }) }, su);
  }
  // A's own untouched price, with B's taken away: it confirms nothing for C
  const rB = (await mem(`workspace='${wsB}'`)).find((x) => x.res_key === picked.own.key);
  await api('/api/collections/price_memory/records/' + rB.id, { method: 'DELETE' }, su);
  await page.reload();
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0 && !S.Sync.loading, null, { timeout: 60 * SEC });
  await memLoaded();
  await only(picked.left.name);
  await page.waitForSelector(rowSel(picked.left.name) + ' .mceil.over');
  check(await page.$eval(rowSel(picked.left.name), (r) => !!r.querySelector('.c.num.mover') && r.querySelector('.mceil').textContent === '▲') &&
    /выше принятого 1/.test(await page.textContent('#priceCount')), 'a smeta price above what was accepted: «▲», an amber cell, and counted');
  await only(picked.own.name);
  check(!(await page.$(rowSel(picked.own.name) + ' .mceil')), 'a contragent\'s own price left alone confirms nothing for its next application');

  /* the switch */
  await page.fill('#q', '');
  await page.waitForFunction(() => document.querySelectorAll('#priceScroll .vrow').length > 5);
  check(await page.$$eval('#priceScroll .tagp, #priceScroll .mceil', (x) => x.length) > 0, '(the marks are on screen)');
  await page.uncheck('#memOn');
  check(await page.$$eval('#priceScroll .tagp, #priceScroll .mceil', (x) => x.length) === 0 && !/в памяти|выше принятого/.test(await page.textContent('#priceCount')),
    'the switch off: no tag, no mark, no count');
  await page.reload();
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.waitForFunction(() => window.app && app.model && app.model.rows.length > 0 && !S.Sync.loading, null, { timeout: 60 * SEC });
  await new Promise((r) => setTimeout(r, 1500));
  check(!(await page.isChecked('#memOn')) && await page.$$eval('#priceScroll .tagp, #priceScroll .mceil', (x) => x.length) === 0, 'and it stays off after a reload');
  await page.check('#memOn');
  await page.waitForSelector('#priceScroll .mceil', { timeout: 20 * SEC });
  check(true, 'on again: the marks are back');
  await closeApp();

  /* another region */
  await openApp(D.number, 'andijon');
  await new Promise((r) => setTimeout(r, 2500));
  check(await page.$$eval('#priceScroll .tagp, #priceScroll .mceil', (x) => x.length) === 0 && await page.evaluate(() => Object.keys(S.Memory.map).length === 0),
    'another region reads none of it');

  check(!errors.length, errors.length ? 'page errors: ' + errors.slice(0, 4).join('; ') : 'no page errors');
} catch (e) {
  check(false, 'the run stopped: ' + String(e && e.message || e).split('\n')[0]);
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await browser.close();
  await pb.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `FAILED (${fail})` : 'e2e-memory OK');
process.exit(fail ? 1 : 0);
