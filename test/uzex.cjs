/*
 * UZEX weekly quotes without a browser or a server: reading the exchange's page (server/pb_hooks/lib/uzex.js — the
 * text half of it runs anywhere) and handing a week to the program's own suggester (src/lib/uzex.js).
 * Every name and price is invented; the page is the stand-in of test/uzex-site.mjs.
 *
 *   node test/uzex.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.cjs');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// the hook library is CommonJS for PocketBase's VM; this package is ESM, so it is read as text
const src = fs.readFileSync(path.join(__dirname, '../server/pb_hooks/lib/uzex.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const U = mod.exports;

/* ------------------------------------------------------------------ numbers, dates, text */
check(U.num('8 428 070,18') === 8428070.18 && U.num('-160 418,92') === -160418.92 && U.num('5,02%') === 5.02 && U.num('0,00') === 0,
  'numbers: spaces of any kind between thousands, a decimal comma, a minus, a percent sign');
check(isNaN(U.num('')) && isNaN(U.num('12 345,6,7')) && isNaN(U.num('н/д')), 'anything else is not a number');
check(U.isoDate('06.11.2026') === '2026-11-06' && U.isoDate('31.02.2026') === '' && U.isoDate('2026-11-06') === '', 'dates: dd.mm.yyyy only, and only real ones');
check(U.text(' <span>&#x410;&#x432; &amp; &#1057;&#xA0;&quot;x&quot;</span>\n ') === 'Ав & С "x"', 'cells: tags out, hex / decimal / named entities decoded, spaces folded');

/* ------------------------------------------------------------------ names */
const n = (s, m) => U.parseName(s, m || 'internal');
const eq = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);
check(eq(n('Тестовый битум ТБ 90/60'), { item: 'Тестовый битум ТБ 90/60', unit: 'т', unit_assumed: true, currency: 'UZS', is_forward: false, is_import: false, packing: '' }),
  'no bracket: per tonne, and assumed');
check(eq(n('Тестовое масло (литр)'), { item: 'Тестовое масло', unit: 'л', unit_assumed: false }) && n('X (декалитр)').unit === 'дал' && n('X (штука)').unit === 'шт' &&
  n('X (метр)').unit === 'м' && n('X (погонный метр)').unit === 'м' && n('X (кв.м)').unit === 'м2' && n('X (куб.метр)').unit === 'м3' && n('X (куб.м)').unit === 'м3' &&
  n('X (грамм)').unit === 'г' && n('X (кг)').unit === 'кг' && n('X (тонна)').unit === 'т' && n('X (тонна)').unit_assumed === false, 'the unit brackets');
check(eq(n('Тестовый цемент (в мешках)'), { item: 'Тестовый цемент', packing: 'в мешках', unit: 'т', unit_assumed: true }) && n('X (навал)').packing === 'навал', 'packing is not a unit');
check(n('X (Форвард)').is_forward && n('X (форвард)').is_forward && n('X (Фьючерс)').is_forward && !n('X').is_forward, 'forward and futures, in any case');
check(eq(n('Тестовый газ (импорт) (доллар США) (Форвард)'), { item: 'Тестовый газ', is_import: true, is_forward: true, currency: 'USD' }) &&
  n('X (рубль) (импорт)').currency === 'RUB', 'several brackets in any order: import, currency, forward');
check(eq(n('Лист ст.Т1 (ТЕСТ 321)'), { item: 'Лист ст.Т1 (ТЕСТ 321)', unit: 'т' }) && n('Раствор (водный раствор)').item === 'Раствор (водный раствор)' &&
  n('Газ в баллонах (6,2 куб м40л)').item === 'Газ в баллонах (6,2 куб м40л)', 'any other bracket stays in the name');
check(n('Тестовый кокс', 'export').currency === 'VAL' && n('X (доллар США)', 'export').currency === 'USD', 'export quotes are in foreign currency, named or not');

/* ------------------------------------------------------------------ the page */
(async () => {
  const { startSite } = await import('./uzex-site.mjs');
  const site = await startSite(8153);
  const get = async (q) => (await fetch(site.base + '/WeeklyQuotes?' + q)).text();
  const RU = 'culture=ru&ui-culture=ru', WEEK = 'importId=204&page=1&length=5000&' + RU;
  try {
    const list = U.parseWeeks(await get(RU));
    check(list.weeks.length === 4 && list.selected === 204 && eq(list.weeks[0], { id: 204, from: '2031-03-10', to: '2031-03-14', market: 'internal' }) &&
      list.weeks[1].market === 'export' && /Внутренние/.test(list.weeks[0].label), 'the list of weeks: id, period, market, and which one is shown');
    const page = await get(WEEK);
    const rows = U.parseWeek(page, 204, 'internal');
    check(rows.length === 10 && rows[0].row_no === 1 && rows[0].price === 1234.5 && rows[0].change === -65.5 && rows[0].change_pct < 0 &&
      rows[2].date_from === '2031-03-03' && rows[3].change_pct > 0, 'a week: every row, its numbers, its own dates, the sign of the change on the percent');
    check(throws(() => U.parseWeek('<html></html>', 204, 'internal'), /списка недель/), 'a page without the week list is refused');
    const uz = await get('importId=204&length=5000&culture=uz&ui-culture=uz');
    check(throws(() => U.parseWeeks(uz), /русском/) && throws(() => U.parseWeek(uz, 204, 'internal'), /русском/), 'another language is refused');
    check(throws(() => U.parseWeek(rowsHtml(page, 'Наименование товара', 'Товар'), 204, 'internal'), /заголовок/), 'a changed column title is refused');
    site.mode = 'stuck';
    const stuck = await get('importId=200&page=1&length=5000&' + RU);
    check(throws(() => U.parseWeek(stuck, 200, 'internal'), /вместо/), 'a page that shows another week than asked is refused');
    site.mode = 'broken';
    const broken = await get(WEEK);
    check(throws(() => U.parseWeek(broken, 204, 'internal'), /ячеек/), 'a row with a missing cell refuses the whole week');
    site.mode = 'ok';
    site.weeks[0].rows.push(['', 5, 0]);
    const nameless = await get(WEEK);
    check(throws(() => U.parseWeek(nameless, 204, 'internal'), /пустое название/), 'so does a row without a name');

    /*
     * A page that is not what the site should send — the site on a bad day, or something between this machine
     * and it. The reader used expressions that, on a tag never closed, read to the end and started over at the
     * next one: 79 kB kept the server busy for a minute, with nothing to cancel it. Each of these is refused,
     * and quickly; the same sync runs by itself half a minute after every start.
     */
    site.weeks[0].rows.pop();
    const good = await get(WEEK);
    const N = 200 * 1000;
    const quick = (what, html, re, fn) => {
      const t0 = Date.now();
      const run = fn || ((h) => U.parseWeek(h, 204, 'internal'));
      // `re` null: whatever it decides about the page, it must decide at once
      let refused = true;
      if (re) refused = throws(() => run(html), re); else { try { run(html); } catch (e) { /* either way */ } }
      const ms = Date.now() - t0;
      check(refused && ms < 2000, what + ' (' + ms + ' ms, ' + Math.round(html.length / 1024) + ' kB)');
    };
    check(U.parseWeek(good, 204, 'internal').length === 10, 'the good page reads');
    quick('a cell of ' + N + ' «<» is refused', good.replace('<td>1</td>', '<td>' + '<'.repeat(N) + '</td>'), /слишком длинная/);
    quick('a row of ' + N + ' cells never closed is refused', good.replace('<td>1</td>', '<td>'.repeat(N) + '<td>1</td>'), /слишком длинная/);
    quick('a short row with a cell never closed is refused', good.replace('<td>1</td>', '<td>1'), /не закрыта|ячеек/);
    quick(N + ' <thead> tags never closed do not slow it', good.replace('<thead', '<thead>'.repeat(N) + '<thead'), null);
    quick(N + ' <tbody> tags never closed do not slow it', good.replace('<tbody', '<tbody>'.repeat(N) + '<tbody'), null);
    quick(N + ' <select> tags never closed do not slow it', '<select>'.repeat(N) + good, null);
    quick(N + ' <option> tags never closed do not slow it', good.replace('<option', '<option>'.repeat(N) + '<option'), null);
    const oneRow = /<tr>\s*<td>1<\/td>[\s\S]*?<\/tr>/.exec(good)[0];
    quick((U.LIMITS.rows + 1) + ' rows — more than the request asks for', good.replace(oneRow, Array.from({ length: U.LIMITS.rows + 1 }, () => oneRow).join('')), /больше, чем запрошено/);
    const oneOpt = /<option value="204"[^>]*>[\s\S]*?<\/option>/.exec(good)[0];
    quick((U.LIMITS.listed + 5) + ' weeks in the list', good.replace(oneOpt, Array.from({ length: U.LIMITS.listed + 5 }, (_, i) => oneOpt.replace('value="204"', 'value="' + (3000 + i) + '"').replace(' selected="selected"', '')).join('') + oneOpt),
      /больше 60/, (h) => U.parseWeeks(h));
    quick('a page of ' + Math.round(U.LIMITS.page / 1024 / 1024 + 1) + ' MB', good + ' '.repeat(U.LIMITS.page), /слишком велика/, (h) => U.parseWeeks(h));
    check(U.text('a<b>c</b>d < e > f <') === 'a c d f <' && U.text('<'.repeat(N)).length === N, 'tags come out of a cell in one pass; a «<» that opens nothing stays');
  } catch (e) {
    check(false, 'the page part stopped: ' + (e.stack || e));
  }
  site.stop();
  finish();
})();

function rowsHtml(html, a, b) {
  // the page writes Cyrillic as numeric entities: replace the title in that spelling
  const ent = (s) => s.replace(/[^\x20-\x7E]/g, (c) => '&#x' + c.codePointAt(0).toString(16).toUpperCase() + ';');
  return html.replace(ent(a), ent(b));
}

function finish() {
  /* ------------------------------------------------------------------ a week for the engine */
  const S = load('normalize', 'match', 'sections', 'regions', 'util', 'refs-package', 'refs-units', 'refs-machines', 'refs-cable',
    'refs-steel', 'refs-mineral', 'refs-electro', 'refs', 'refs-view', 'refs-query', 'refs-pool', 'refs-retrieve', 'refs-suggest', 'refs-cache', 'uzex');
  const R = S.refs;
  const imp = { import_id: 204, period_from: '2031-03-10', period_to: '2031-03-14' };
  const q = (no, name, unit, price, o) => Object.assign({ row_no: no, name, item: U.parseName(name, 'internal').item, unit, unit_assumed: unit === 'т', packing: '',
    is_forward: /форвард/i.test(name), is_import: false, currency: /доллар/.test(name) ? 'USD' : 'UZS', price, change: 0, change_pct: 0,
    date_from: '2031-03-10', date_to: '2031-03-14' }, o || {});
  const quotes = [
    q(1, 'Труба стальная электросварная 57х3,5', 'т', 7654321.5),
    q(2, 'Бетон тяжёлый В15 (куб.метр)', 'м3', 654321),
    q(3, 'Анкер М8 (штука)', 'шт', 1357.9, { date_from: '2031-03-03', date_to: '2031-03-07' }),
    q(4, 'Кабель ВВГ 3х2,5 (метр) (Форвард)', 'м', 2468.1),
    q(5, 'Кабель ВВГ 3х4 (метр) (доллар США)', 'м', 12.5),
    q(6, 'Краска масляная белая МА-15', 'т', 0)
  ];
  const p = S.uzex.packageOf(imp, quotes, {});
  check(p.used === 3 && p.left.forward === 1 && p.left.currency === 1 && p.left.empty === 1, 'a week as a package: spot quotes in sums only; forward, currency and empty rows are counted');
  const v = R.pkg.validate(p.pkg, { bytes: 1 });
  check(v.ok && !v.errors.length && p.pkg.sources.length === 1 && p.pkg.sources[0].doc_type === 'exchange-quotes' && p.pkg.package_id === 'uzex-204',
    'the package passes the program\'s own validator');
  check(S.uzex.packageOf(imp, quotes, { forward: true }).used === 4 && S.uzex.packageOf(imp, quotes, { onlyWeek: true }).used === 2 &&
    S.uzex.packageOf(imp, quotes, { onlyWeek: true }).left.old === 1, '«форвард» adds the forward quote; «только этой недели» drops the one dated earlier');
  check(S.uzex.packageOf(imp, [q(1, 'Газ (доллар США)', 'т', 820)], { forward: true }).pkg === null, 'a week with nothing in sums gives no package at all');

  const sug = R.create({ policy: 'p3' });
  sug.init({ handle: R.open(R.derive(p.pkg, {})), sources: p.pkg.sources });
  const ask = (name, unit) => sug.suggest(R.queryOf({ name, unit, section: 'materials' }, { region: 'xorazm', asof: '2031-03-14' }));
  const pipe = ask('Труба стальная электросварная 57х3,5', 'т');
  check(S.uzex.vatRate('2031-03-14') === 0.12 && S.uzex.vatRate('2022-06-01') === 0.15 && S.uzex.vatRate('2019-09-30') === 0.20 && S.uzex.vatRate('') === 0.12,
    'the VAT rate of the quote\'s date: 12 % since 2023, 15 % before, 20 % before October 2019');
  check(S.uzex.net(1120, '2031-03-14') === 1000 && S.uzex.net(7654321.5, '2031-03-14') === 6834215.63 && S.uzex.net(1150, '2022-06-01') === 1000,
    'a quote less its VAT, to the tiyin');
  check(p.pkg.rows[0][6] === 6834215.63 && quotes[0].price === 7654321.5 && p.pkg.sources[0].vat_default === true,
    'the package carries the price without VAT; the stored quote stays as printed');
  check(pipe.length === 1 && pipe[0].tier === 'document' && pipe[0].price === 6834215.63 && pipe[0].rid === 1, 'the engine finds the quote of the same name: «Документ», its price without VAT, its row');
  const kg = ask('Труба стальная электросварная 57х3,5', 'кг');
  check(kg.length === 1 && Math.abs(kg[0].price - 6834.21563) < 1e-6 && Math.abs(kg[0].raw.factor - 0.001) < 1e-12, 'a tonne price for a resource in kg is converted (÷ 1000)');
  const m = ask('Труба стальная электросварная 57х3,5', 'м');
  check(m.length === 1 && (m[0].tier === 'estimate' || (m[0].flags || []).indexOf('derived-unit') >= 0), 'for a resource by the metre it is an estimate that needs the pipe\'s own mass');
  check(ask('Анкер М8', 'шт').length === 1 && ask('Анкер М5', 'шт').length === 0, 'М8 is found, М5 is not: numbers are never lost');
  check(ask('Кабель ВВГ 3х2,5', 'м').length === 0 && ask('Кабель ВВГ 3х4', 'м').length === 0, 'the forward and the dollar quote are not in the package, so never offered');

  check(S.uzex.sourceOf(204, { rid: 3 }) === 'uzex:204:3' && S.uzex.sourceOf(204, { rids: [3, 5] }) === 'uzex:204:median:3,5' &&
    S.uzex.sourceOf(204, { components: [{ rids: [7] }, { rids: [9] }] }) === 'uzex:204:median:7,9', 'the source of an applied price: one row, or the rows of a median');
  const long = S.uzex.sourceOf(204, { rids: Array.from({ length: 80 }, (_, i) => 1000 + i) });
  check(long.length <= 190 && /…$/.test(long) && S.uzex.parseSource(long).import_id === 204, 'a long median is cut at a whole row number');
  const ps = S.uzex.parseSource('uzex:204:median:3,5');
  check(ps.import_id === 204 && ps.rows.join() === '3,5' && S.uzex.parseSource('uzex:204:3').rows.join() === '3' &&
    S.uzex.parseSource('ref:fake-1:3') === null && S.uzex.parseSource('uzex:x:1') === null, 'and reads back; anything else is not a UZEX source');
  check(S.uzex.period('2031-03-10', '2031-03-14') === '10.03–14.03.2031' && S.uzex.period('2030-12-29', '2031-01-02') === '29.12.2030–02.01.2031', 'periods in words');

  console.log(fail ? `FAILED (${fail})` : 'uzex OK');
  process.exit(fail ? 1 : 0);
}
