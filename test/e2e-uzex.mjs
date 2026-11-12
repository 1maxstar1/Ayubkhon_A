/*
 * The UZEX source in a real browser, against the stand-in site (test/uzex-site.mjs), with the synthetic reference
 * package and smeta of test/refs-fixture.cjs beside it. Every quote and price here is invented.
 *
 * Admin page: «Недельные котировки UZEX» (in Russian, like the rest) — the button stores the listed weeks, a second press adds nothing, a site that
 * is down leaves an error and the stored weeks, the switch reaches the server, a week can be deleted; the reference
 * packages are the same before and after.
 * Expert: out of the box only «Наш справочник» is on and the page is what it was; UZEX on — violet tags beside
 * «справ.», prices without VAT (the exchange quotes with it), the popover with the quote as printed; forward, dated-earlier and dollar quotes behave as their
 * checkboxes say; another unit of the same measure is converted with a warning and a question, one that needs the
 * item's data cannot be applied; the last source cannot be unchecked; no checkmark ever changes a price; an applied
 * price keeps its violet «U» after a reload and loses it when typed over; the week and the market can be changed.
 *
 *   node test/e2e-uzex.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchOpts } from './chromium.mjs';
import { startServer, ROOT } from './server.mjs';
import { startSite, week } from './uzex-site.mjs';

const require = createRequire(import.meta.url);
const F = require('./refs-fixture.cjs');
const { load } = require('./load.cjs');
const S = load('util', 'refs-package');

const PIPE = 'Труба стальная электросварная 57х3,5', CONCRETE = 'Бетон тяжёлый В15', ANCHOR = 'Анкер М8';
const CABLE = 'Кабель ВВГ 3х2,5', CABLE4 = 'Кабель ВВГ 3х4', PAINT = 'Краска масляная белая МА-15';
// the same pipe once more, by the metre: a quote per tonne reaches it only through the pipe's own mass
F.SMETA.materials.push([PIPE, 'м', 30, 4321.5]);

const Q = { pipe: 7654321.5, pipeOld: 7711223.25, concrete: 654321, anchor: 1357.9, cable: 2468.1, paint: 3141592.6 };
const site = await startSite(8151);
site.weeks = [
  week(304, '2031-03-10', '2031-03-14', 'internal', [
    [PIPE, Q.pipe, -43210.5],
    [CONCRETE + ' (куб.метр)', Q.concrete, 0],
    [ANCHOR + ' (штука)', Q.anchor, 0, '2031-03-03', '2031-03-07'],       // did not trade this week: last week's quote
    [CABLE + ' (метр) (Форвард)', Q.cable, 12.5],
    [PAINT, Q.paint, 0],                                                 // per tonne; the smeta has it in kg
    [CABLE4 + ' (метр) (доллар США)', 12.5, 0]
  ]),
  week(305, '2031-03-10', '2031-03-14', 'export', [['Кокс тестовый', 190.03, 0.03]]),
  week(300, '2031-03-03', '2031-03-07', 'internal', [[PIPE, Q.pipeOld, 0], [ANCHOR + ' (штука)', Q.anchor, 0]])
];

const pb = await startServer({ port: 8149, registry: true, build: true, env: { UZEX_BASE: site.base, UZEX_AUTO: '0' } });
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const SEC = 1000, T = { timeout: 60 * SEC };
/** Every kind of space the number formats use, as a plain one. */
const sp = (t) => String(t).replace(/[\u00A0\u202F\u2009]/g, ' ');
const dir = mkdtempSync(join(tmpdir(), 'uzex-'));
const browser = await chromium.launch(launchOpts);
const errors = [];

try {
  await pb.api('/api/collections/users/records', {
    method: 'POST',
    body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
  }, pb.su);
  const boss = await pb.signIn('boss@example.com');
  // the reference package of the fixture, uploaded the way the admin page does it
  const pkg = F.makePackage(), gz = F.gzip(pkg), fd = new FormData();
  const fields = { package_id: pkg.package_id, sha256: createHash('sha256').update(gz).digest('hex'), manifest: JSON.stringify(S.refs.pkg.manifest(pkg)),
    records: String(pkg.counts.records), sources: String(pkg.counts.sources), date_min: pkg.date_min, date_max: pkg.date_max };
  for (const k of Object.keys(fields)) fd.append(k, fields[k]);
  fd.append('file', new Blob([gz], { type: 'application/gzip' }), pkg.package_id + '.json.gz');
  const up = await fetch(pb.base + '/api/collections/ref_packages/records', { method: 'POST', headers: { Authorization: boss }, body: fd });
  check(up.status === 200, 'the reference package is in place (' + up.status + ')');
  const refsBefore = JSON.stringify((await pb.api('/api/collections/ref_packages/records', {}, pb.su)).items.map((x) => [x.id, x.sha256, x.active, x.updated]));

  /* ================================================================== the administrator */
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(pb.base + '/admin.html');
  await page.fill('#loginEmail', 'boss@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await page.fill('#loginCode', pb.lastCode('boss@example.com'));
  await page.click('#loginBtn');
  await page.waitForSelector('#adminMain:not([hidden])');
  check(await page.isVisible('#uzexPanel') && /Недельные котировки UZEX/.test(await page.textContent('#uzexPanel h2')), 'the admin page has «Недельные котировки UZEX», a section of its own');
  check(!/[A-Za-z][oOgG]['ʻ’][a-z]|\b(?:va|Ichki|Eksport)\b|yangila|hafta|saqla/.test(await page.textContent('#uzexPanel')), 'and it speaks Russian: no Uzbek left in it (E9)');
  check(await page.evaluate(() => document.getElementById('refsPanel').compareDocumentPosition(document.getElementById('uzexPanel')) & 4) > 0 &&
    !(await page.$('#refsPanel #uzexSync')), 'placed apart from «Справочник цен (документы)»');
  await page.waitForFunction(() => /Пока ничего не получено/.test(document.querySelector('#uzexTable tbody').textContent));
  check(await page.isChecked('#uzexAuto') && /Ещё не обновлялось/.test(await page.textContent('#uzexStat')), 'nothing fetched yet; «Обновлять автоматически» is on by default');

  await page.click('#uzexSync');
  await page.waitForFunction(() => document.querySelectorAll('#uzexTable tbody tr').length === 3, null, T);
  const table = await page.textContent('#uzexTable tbody');
  check(/10\.03\.2031 – 14\.03\.2031/.test(table) && /Внутренний рынок/.test(table) && /Экспортный рынок/.test(table), 'the three listed weeks are stored and shown: period and market');
  await page.waitForFunction(() => /Последнее обновление: .+, новых недель: 3/.test(document.getElementById('uzexStat').textContent));
  check(true, 'the status says when and how many weeks were new (' + await page.textContent('#uzexStat') + ')');
  await page.click('#uzexSync');
  await page.waitForFunction(() => /новых недель: 0/.test(document.getElementById('uzexStat').textContent), null, T);
  check(await pb.count('uzex_imports') === 3 && await pb.count('uzex_quotes') === 9, 'a second press adds nothing');

  site.mode = 'down';
  await page.click('#uzexSync');
  await page.waitForFunction(() => !document.getElementById('uzexErr').hidden, null, T);
  const down = await page.textContent('#uzexErr');
  check(/не ответил/.test(down) && /HTTP 503/.test(down) && /сохранённые недели на месте/.test(down) && await pb.count('uzex_quotes') === 9 &&
    (await page.$$('#uzexTable tbody tr')).length === 3, 'the site is down: the error is shown, in Russian, and the stored weeks stay (' + down + ')');
  site.mode = 'ok';

  await page.uncheck('#uzexAuto');
  await page.waitForFunction(async () => (await S.pb.send('/api/uzex/status', {})).auto === false);
  await page.check('#uzexAuto');
  await page.waitForFunction(async () => (await S.pb.send('/api/uzex/status', {})).auto === true);
  check(true, 'the switch reaches the server, off and on again');

  await page.click('#uzexTable tbody tr:has-text("Экспортный рынок") button[data-del]');
  await page.waitForFunction(() => document.querySelectorAll('#uzexTable tbody tr').length === 2, null, T);
  check(await pb.count('uzex_imports') === 2 && await pb.count('uzex_quotes') === 8, 'a week is deleted with its quotes');
  await page.click('#uzexSync');
  await page.waitForFunction(() => document.querySelectorAll('#uzexTable tbody tr').length === 3, null, T);
  check(true, 'and comes back with the next update while the site still lists it');
  const refsAfter = JSON.stringify((await pb.api('/api/collections/ref_packages/records', {}, pb.su)).items.map((x) => [x.id, x.sha256, x.active, x.updated]));
  check(refsAfter === refsBefore && /fake-20260101-1/.test(await page.textContent('#refsTable tbody')), 'the reference packages are exactly as they were');
  check(!errors.length, 'no page errors on the admin page' + (errors.length ? ': ' + errors.join(' | ') : ''));
  errors.length = 0;
  await page.close();

  /* ================================================================== the expert */
  const rows = pb.rows().slice(0, 2);
  await pb.api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, pb.su);
  const smetaFile = join(dir, 'smeta-test.xlsx');
  writeFileSync(smetaFile, F.makeSmeta());
  const ep = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  ep.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  ep.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const dialogs = [];
  let answer = true;
  ep.on('dialog', (d) => { dialogs.push(d.message()); if (answer) d.accept(); else d.dismiss(); });

  const row = (name, unit) => `#priceScroll .vrow:has(.c[title="${name}"])` + (unit ? `:has(.c.mid:text-is("${unit}"))` : '');
  const show = async (name) => {
    await ep.fill('#q', name);
    await ep.waitForFunction((t) => { const r = [...document.querySelectorAll('#priceScroll .vrow')]; return r.length >= 1 && r.length <= 2 && r.every((x) => x.querySelector('.c[title="' + t + '"]')); }, name);
  };
  const uzReady = () => ep.waitForFunction(() => S.Uzex.state === 'ready' && !Object.keys(S.Uzex.batches).length && !Object.keys(S.Uzex.asked).length, null, T);
  const settle = () => new Promise((r) => setTimeout(r, 500));
  const prices = () => ep.evaluate(() => JSON.stringify(Object.keys(app.prices).sort().map((k) => [k, app.prices[k]])));
  const market = (name, unit) => ep.evaluate(([n, u]) => { const r = app.model.resources.find((x) => x.name === n && (!u || x.unit === u)); return r && r.market; }, [name, unit || '']);
  const saved = () => ep.waitForFunction(() => !S.Sync.dirty && !Object.keys(S.Sync.pend).length && document.getElementById('wsSave').textContent === '✓', null, T)
    .then(() => ep.evaluate(() => S.Sync.q));
  const popover = async (name, unit) => {
    await show(name);
    await ep.click(row(name, unit) + ' .tagu');
    await ep.waitForSelector('#uzexPop:not([hidden])');
    return ep.evaluate(() => {
      const pop = document.getElementById('uzexPop');
      return { text: pop.textContent, lines: [...pop.querySelectorAll('.up-line')].map((l) => ({
        text: l.textContent, badge: l.querySelector('.rp-badge').textContent, name: l.querySelector('.rp-name').textContent,
        title: l.querySelector('.up-price').title, pill: !!l.querySelector('.upill'), warn: !!l.querySelector('.up-warn'),
        apply: !!l.querySelector('button[data-i]'), color: getComputedStyle(l.querySelector('.up-price')).color,
        weight: getComputedStyle(l.querySelector('.up-price')).fontWeight, border: getComputedStyle(l).borderLeftColor
      })) };
    });
  };

  await ep.goto(pb.base + '/');
  await ep.fill('#loginEmail', 'test@example.com');
  await ep.click('#loginBtn');
  await ep.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await ep.fill('#loginCode', pb.lastCode('test@example.com'));
  await ep.click('#loginBtn');
  await ep.waitForSelector('#screen-list:not([hidden])');
  check(await ep.isHidden('#srcBar'), 'no source cards on the list of applications');
  await ep.fill('#appQ', rows[0].number);
  await ep.waitForFunction((n) => [...document.querySelectorAll('#appTable tbody tr')].some((t) => t.textContent.includes(n)), rows[0].number);
  await ep.click(`#appTable tbody tr:has-text("${rows[0].number}") button[data-act=open]`);
  await ep.waitForSelector('#screen-region:not([hidden])');
  await ep.selectOption('#regionSel', 'xorazm');
  await ep.click('#regionForm button[type=submit]');
  await ep.waitForSelector('#wsBox:not([hidden])');
  await ep.setInputFiles('#pick', [smetaFile]);
  await ep.waitForFunction(() => window.app && app.model && app.model.resources.length > 60 && S.Sync.ws.files.length === 1 && !S.Sync.loading, null, T);
  await ep.waitForFunction(() => S.Refs.state === 'ready' && !Object.keys(S.Refs.batches).length && /справочных \d+/.test(document.getElementById('priceCount').textContent), null, T);

  /* ------------------------------------------------------------- out of the box */
  const cards = () => ep.$$eval('#srcBar .srccard', (cs) => cs.map((c) => c.dataset.src + ':' + c.classList.contains('on') + ':' + c.getAttribute('aria-checked') + ':' + c.querySelector('small').textContent));
  const c0 = await cards();
  check(await ep.isVisible('#srcBar') && /^refs:true:true:пакет fake-20260101-1$/.test(c0[0]) && /^uzex:false:false:10\.03–14\.03\.2031$/.test(c0[1]),
    'two source cards: ours checked with its package, UZEX unchecked with its newest week (' + c0.join(' | ') + ')');
  check(/справ\./.test(await ep.textContent('.srclegend')) && /UZEX/.test(await ep.textContent('.srclegend')), 'a legend says which mark is which');
  await show(PIPE);
  check(await ep.isVisible(row(PIPE, 'т') + ' .tagr') && !(await ep.$('#priceScroll .tagu')) && await ep.isHidden('.srcopts'),
    'with only ours checked the page is what it was: «справ.» tags, nothing of UZEX');
  check(await ep.evaluate(() => !S.Uzex.worker), 'and nothing of UZEX is loaded');
  const p0 = await prices();

  /* ------------------------------------------------------------- both sources */
  await ep.click('.srccard[data-src="uzex"]');
  await uzReady();
  await ep.waitForSelector(row(PIPE, 'т') + ' .tagu');
  check(await ep.isVisible(row(PIPE, 'т') + ' .tagr') && await ep.isVisible(row(PIPE, 'т') + ' .tagu'), 'with both checked a row carries both tags');
  const tag = await ep.$eval(row(PIPE, 'т') + ' .tagu', (b) => ({ text: b.textContent, color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor,
    border: getComputedStyle(b).borderLeftColor, weight: getComputedStyle(b).fontWeight }));
  check(/^UZEX 6 834 216$/.test(sp(tag.text)), 'the tag reads «UZEX» and the price without VAT: 7 654 321,5 ÷ 1,12 (' + tag.text + ')');
  check(tag.color === 'rgb(60, 52, 137)' && tag.bg === 'rgb(238, 237, 254)' && tag.border === 'rgb(83, 74, 183)' && +tag.weight >= 600,
    `violet, semi-bold, with its left border — not green, red or our own colours (${tag.color} on ${tag.bg}, ${tag.border})`);
  check(await prices() === p0, 'checking a source sets no price');
  check(await ep.isVisible('.srcopts') && await ep.inputValue('#uzWeek') === '304' && await ep.inputValue('#uzMarket') === 'internal' &&
    /Внутренний рынок/.test(await ep.textContent('#uzMarket')) && /Экспортный рынок/.test(await ep.textContent('#uzMarket')), 'the week and the market are shown: the newest internal week');
  check(/котировок: 4 из 6/.test(await ep.textContent('#uzInfo')) && /в валюте 1/.test(await ep.textContent('#uzInfo')) && /цены биржи с НДС — показаны без НДС/.test(await ep.textContent('#uzInfo')),
    'how many quotes are in use, and that the prices are shown without VAT (' + await ep.textContent('#uzInfo') + ')');
  check(/ · UZEX \d+/.test(await ep.textContent('#priceCount')), 'the status line counts the resources with a quote');

  const pipe = await popover(PIPE, 'т');
  const pl = pipe.lines[0];
  check(pipe.lines.length === 1 && pl.pill && pl.badge === 'Документ' && pl.apply && !pl.warn, 'the popover: one line, the «UZEX» pill, «Документ», «Применить»');
  check(pl.color === 'rgb(83, 74, 183)' && +pl.weight >= 600 && pl.border === 'rgb(83, 74, 183)', 'its price is violet and semi-bold, with the thin left border');
  check(pl.title.includes(PIPE) && /Цена биржи \(с НДС\): 7 654 321,5 сум за т \(предп\.\)/.test(sp(pl.title)) && /Без НДС: 6 834 215,63/.test(sp(pl.title)) && /Период котировки: 10\.03–14\.03\.2031/.test(pl.title) &&
    /Изменение: −0,56 %/.test(pl.title), 'the title of the price gives the quote as printed: name, price with VAT and without, «т (предп.)», its period, the change');
  check(/неделя 10\.03–14\.03\.2031/.test(pipe.text) && /показана без НДС \(÷ 1,12\)/.test(pipe.text) && /на бирже 7 654 321,5 с НДС за т/.test(sp(pipe.text)) && !/uzex-w|\|/.test(pipe.text), 'the head names the week and says the price is without VAT; the line gives the quote with it; no internal key is shown');
  await ep.evaluate(() => S.Uzex.hide());

  /* ------------------------------------------------------------- what the checkboxes do */
  await show(ANCHOR);
  check(await ep.isVisible(row(ANCHOR) + ' .tagu'), 'a quote dated the week before is offered');
  await ep.check('#uzOnlyWeek');
  await uzReady(); await settle();
  await show(ANCHOR);
  check(!(await ep.$(row(ANCHOR) + ' .tagu')), '«только котировки этой недели» hides it');
  await show(PIPE);
  check(await ep.isVisible(row(PIPE, 'т') + ' .tagu'), 'and keeps the quotes of the week itself');
  await ep.uncheck('#uzOnlyWeek');
  await uzReady(); await settle();

  await show(CABLE);
  check(!(await ep.$(row(CABLE) + ' .tagu')), 'a forward contract is not offered by default');
  await ep.check('#uzForward');
  await uzReady();
  await ep.waitForSelector(row(CABLE) + ' .tagu');
  const cab = await popover(CABLE);
  check(/форвард/.test(cab.lines[0].text) && /Форвард/.test(cab.lines[0].name), 'with «форвард» checked it is, and says so');
  await ep.evaluate(() => S.Uzex.hide());
  await show(CABLE4);
  check(!(await ep.$(row(CABLE4) + ' .tagu')), 'a quote in dollars is never offered as a price in sums');
  await ep.uncheck('#uzForward');
  await uzReady(); await settle();
  check(await prices() === p0, 'none of this changed a price');

  /* ------------------------------------------------------------- units */
  const paint = await popover(PAINT);
  check(paint.lines[0].warn && paint.lines[0].apply && /Единица другая, цена пересчитана: 2 804 993 за 1 т → 2 804,99 за 1 кг/.test(sp(paint.lines[0].text)) &&
    /принята тонна/.test(paint.lines[0].text), 'tonnes for a resource in kg: converted, with ⚠ and the arithmetic (' + sp(paint.lines[0].text).replace(/\s+/g, ' ').slice(120, 400) + ')');
  check(await ep.$eval(row(PAINT) + ' .tagu', (b) => b.classList.contains('near') && /≈/.test(b.textContent)), 'its tag is dashed with «≈»');
  answer = false; dialogs.length = 0;
  await ep.click('#uzexPop .up-line button[data-i]');
  await settle();
  check(dialogs.length === 1 && /Единица другая/.test(dialogs[0]) && /Применить 2 804,99 за кг/.test(sp(dialogs[0])) && await prices() === p0,
    'a converted price asks first, and «Отмена» applies nothing');
  answer = true; dialogs.length = 0;
  await ep.click('#uzexPop .up-line button[data-i]');
  await ep.waitForFunction((n) => { const r = app.model.resources.find((x) => x.name === n); return r && Math.abs(r.market - 2804.99) < 0.005; }, PAINT);
  check(dialogs.length === 1, 'confirmed, it is applied converted and without VAT: 2 804,99 per kg');

  const metre = await popover(PIPE, 'м');
  check(metre.lines.length >= 1 && metre.lines[0].warn && !metre.lines[0].apply && /≈/.test(metre.lines[0].text) && /введите цену вручную/.test(metre.lines[0].text),
    'tonnes for a resource by the metre: shown with ⚠, and there is no «Применить»');
  await ep.evaluate(() => S.Uzex.hide());

  /* ------------------------------------------------------------- apply, and the mark in the cell */
  await popover(PIPE, 'т');
  await ep.click('#uzexPop .up-line button[data-i]');
  await ep.waitForFunction((n) => { const r = app.model.resources.find((x) => x.name === n && x.unit === 'т'); return r && r.market === 6834215.63; }, PIPE);
  await show(PIPE);
  const cell = () => ep.$eval(row(PIPE, 'т'), (r) => {
    const pin = r.querySelector('.pin'), pill = r.querySelector('.upill.u');
    return { uz: pin.classList.contains('uz'), color: getComputedStyle(pin).color, pill: pill ? pill.textContent : '', title: pill ? pill.title : '' };
  });
  let c = await cell();
  check(c.uz && c.color === 'rgb(83, 74, 183)' && c.pill === 'U' && /неделя 10\.03–14\.03\.2031/.test(c.title), 'the applied price is violet in its cell, with the «U» pill naming the week');
  check(!(await ep.$(row(PIPE, 'м') + ' .upill.u')), 'the same pipe by the metre, not applied, has none');
  await saved();
  const corr = async (name, unit) => {
    const ws = await ep.evaluate(() => S.Sync.ws.id);
    const list = (await pb.api(`/api/collections/corrections/records?perPage=200&filter=${encodeURIComponent(`workspace = "${ws}"`)}`, {}, pb.su)).items;
    return list.find((x) => x.name === name && (!unit || x.unit === unit)) || {};
  };
  check((await corr(PIPE, 'т')).source === 'uzex:304:1' && (await corr(PAINT)).source === 'uzex:304:5', 'the server keeps where both prices came from: uzex:<week>:<row>');

  /* ------------------------------------------------------------- one source, the other, never none */
  const p1 = await prices();
  await ep.click('.srccard[data-src="refs"]');
  await settle();
  await show(PIPE);
  check(!(await ep.$('#priceScroll .tagr')) && await ep.isVisible(row(PIPE, 'т') + ' .tagu') && await ep.isHidden('#refAsof') &&
    !/справочных/.test(await ep.textContent('#priceCount')), 'only UZEX: no «справ.» tag, date bar or count');
  await ep.click('.srccard[data-src="uzex"]');
  await settle();
  check((await cards())[1].startsWith('uzex:true') && await ep.isVisible('#srcHint'), 'the last source cannot be unchecked; a hint says why');
  await ep.click('.srccard[data-src="refs"]');
  await ep.click('.srccard[data-src="uzex"]');
  await settle();
  await show(PIPE);
  check(await ep.isVisible(row(PIPE, 'т') + ' .tagr') && !(await ep.$('#priceScroll .tagu')) && await ep.isVisible('#refAsof'), 'only ours again: «справ.» is back, UZEX tags are gone');
  check(await prices() === p1, 'and no checkmark changed a price');
  c = await cell();
  check(c.uz && c.pill === 'U', 'the price applied from UZEX keeps its mark while the source is unchecked');

  /* ------------------------------------------------------------- after a reload */
  await ep.reload();
  await ep.waitForSelector('#wsBox:not([hidden])', T);
  await ep.waitForFunction(() => window.app && app.model && app.model.resources.length > 60 && !S.Sync.loading, null, T);
  check((await cards()).map((x) => x.split(':').slice(0, 2).join(':')).join(' ') === 'refs:true uzex:false', 'the choice of sources is remembered');
  await show(PIPE);
  c = await cell();
  check(c && c.uz && c.color === 'rgb(83, 74, 183)' && c.pill === 'U', 'after a reload the cell is still violet with its «U»');
  await show(PAINT);
  check(await ep.$eval(row(PAINT), (r) => !!r.querySelector('.pin.uz') && !!r.querySelector('.upill.u')), 'so is the converted one');

  // typed over: the expert's own price again
  await show(PIPE);
  await ep.click(row(PIPE, 'т') + ' .pin');
  await ep.keyboard.type('7123457');
  check(await ep.$eval(row(PIPE, 'т'), (r) => !r.querySelector('.pin.uz') && !r.querySelector('.upill.u')), 'typing over it removes the mark at once');
  await ep.keyboard.press('Tab');
  await saved();
  check((await corr(PIPE, 'т')).source === 'typed' && await market(PIPE, 'т') === 7123457, 'and the server records a typed price');
  await ep.reload();
  await ep.waitForSelector('#wsBox:not([hidden])', T);
  await ep.waitForFunction(() => window.app && app.model && app.model.resources.length > 60 && !S.Sync.loading, null, T);
  await show(PIPE);
  check(await ep.$eval(row(PIPE, 'т'), (r) => !r.querySelector('.pin.uz') && !r.querySelector('.upill.u')), 'the mark stays away after a reload');

  /* ------------------------------------------------------------- another week, the export table */
  await ep.click('.srccard[data-src="uzex"]');
  await uzReady();
  await ep.selectOption('#uzWeek', '300');
  await uzReady();
  await show(PIPE);
  await ep.waitForSelector(row(PIPE, 'т') + ' .tagu');
  check(/6 885 021/.test(sp((await ep.textContent(row(PIPE, 'т') + ' .tagu')))) && /03\.03–07\.03\.2031/.test((await cards())[1]),
    'another week can be chosen: its quote, and the card names it');
  await ep.selectOption('#uzMarket', 'export');
  await ep.waitForFunction(() => S.Uzex.state === 'empty');
  check(!(await ep.$('#priceScroll .tagu')) && /в валюте/.test(await ep.textContent('#uzInfo')), 'the export table is in foreign currency: nothing is offered, and the bar says so');
  await ep.selectOption('#uzMarket', 'internal');
  await uzReady();
  check(await ep.inputValue('#uzWeek') === '304', 'back on the internal market, the newest week again');

  /* ------------------------------------------------------------- the week of the application's date (F5) */
  const reg0 = await ep.evaluate(() => S.Sync.app.registered_at || '');
  await ep.evaluate(() => { S.Sync.app.registered_at = '2031-03-05 00:00:00.000Z'; S.Uzex.weekId = null; S.Uzex.prepare(); });
  await uzReady();
  check(await ep.inputValue('#uzWeek') === '300' && /по дате заявки 05\.03\.2031/.test(await ep.textContent('#uzHow')),
    'an application registered on 05.03.2031 is given the week of that date, and the page says so');
  await ep.selectOption('#uzWeek', '304');
  await uzReady();
  check(await ep.evaluate(() => S.Uzex.weekId === 304 && S.Sync.state().uzex && S.Sync.state().uzex.week === 304) && /выбрана вручную/.test(await ep.textContent('#uzHow')),
    'a week picked by hand is said so, and kept with the application');
  await ep.click('#uzHow [data-uz-reset]');
  await uzReady();
  check(await ep.inputValue('#uzWeek') === '300' && await ep.evaluate(() => S.Uzex.weekId === null), '«по дате заявки» goes back to the week of the date');
  await ep.evaluate((r) => { S.Sync.app.registered_at = r; S.Uzex.prepare(); }, reg0);
  await uzReady();
  check(await ep.inputValue('#uzWeek') === '304' && /недели нет|самая новая/.test(await ep.textContent('#uzHow')),
    'a date before every week: the newest, and the page says why');

  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

  /* ------------------------------------------------------------- the single-file page has none of it */
  const single = readFileSync(join(ROOT, 'dist/smeta-taqqoslash.html'), 'utf8');
  check(single.indexOf('__UZEX_WORKER_SRC__') < 0 && single.indexOf('S.Uzex = ') < 0, 'the single-file page carries no UZEX code');
} catch (err) {
  check(false, 'the run stopped: ' + String(err && err.stack || err).split('\n').slice(0, 4).join(' / '));
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await browser.close();
  pb.stop();
  site.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `FAILED (${fail})` : 'e2e-uzex OK');
process.exit(fail ? 1 : 0);
