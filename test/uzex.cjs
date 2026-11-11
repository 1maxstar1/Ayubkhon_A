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

    /*
     * A page that is not what it should be. The reader used to find its cells with expressions like «<td …>…</td>»;
     * an opening tag that nothing closes makes such an expression read to the end of the page from every opening
     * tag in turn. Two hundred thousand of them are a page of a megabyte or two — and were minutes of a server that
     * answers nobody. Every search is one pass now; each line below is one of the places that was not.
     */
    const N = 200000;
    const timed = (fn) => { const t0 = Date.now(); let err = ''; try { fn(); } catch (e) { err = e.message; } return { ms: Date.now() - t0, err }; };
    const quick = (what, fn, re) => {
      const r = timed(fn);
      check(r.ms < 2000 && (!re || re.test(r.err)), `${N} unclosed ${what}: ${r.ms} ms${r.err ? ' — ' + r.err.slice(0, 50) : ''}`);
    };
    const tbody = (rowsHtml) => page.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody>' + rowsHtml + '</tbody>');
    const oneRow = '<tr><td>1</td><td>Тестовое имя</td><td>1,5</td><td>0,5</td><td>1,0%</td><td>10.03.2031</td><td>14.03.2031</td></tr>';
    quick('«<» in a cell', () => U.text('<'.repeat(N)));
    quick('lists of weeks', () => U.parseWeeks('<select id="ImportId">'.repeat(N)), /списка недель/);
    quick('lists cut off inside the tag', () => U.parseWeeks('<select '.repeat(N)), /списка недель/);
    quick('weeks in the list', () => U.parseWeeks('<select id="ImportId">' + '<option>'.repeat(N) + '</select>'), /список недель пуст/);
    quick('weeks cut off inside the tag', () => U.parseWeeks('<select id="ImportId">' + '<option '.repeat(N) + '</select>'), /список недель пуст/);
    quick('table headers', () => U.parseWeek(page.replace('</thead>', '').replace('<thead>', '<thead>'.repeat(N)), 204, 'internal'), /заголовок/);
    quick('header cells', () => U.parseWeek(page.replace('<thead>', '<thead>' + '<th>'.repeat(N)).replace(/<\/th>/g, ''), 204, 'internal'), /заголовок/);
    quick('table bodies', () => U.parseWeek(page.replace('</tbody>', '').replace('<tbody>', '<tbody>'.repeat(N)), 204, 'internal'), /без строк/);
    quick('rows cut off inside the tag', () => U.parseWeek(tbody('<tr '.repeat(N)), 204, 'internal'), /нет строк/);
    quick('cells', () => U.parseWeek(tbody('<tr>' + '<td>'.repeat(N) + '</tr>'), 204, 'internal'), /ячеек 0/);
    quick('cells cut off inside the tag', () => U.parseWeek(tbody('<tr>' + '<td '.repeat(N) + '</tr>'), 204, 'internal'), /ячеек 0/);
    check(U.parseWeek(page.replace(/<(\/?)(select|option|table|thead|tbody|tr|th|td)\b/g, (m, sl, name) => '<' + sl + name.toUpperCase()), 204, 'internal').length === 10,
      'tags in capitals are still tags');

    // what a page may hold
    const L = U.LIMITS;
    check(throws(() => U.parseWeeks(page + ' '.repeat(L.page)), /слишком большая/), `a page longer than ${L.page / 1048576} MB is refused before it is read`);
    check(throws(() => U.parseWeek(tbody(oneRow.replace('Тестовое имя', '<i></i>'.repeat(L.cell) + 'Тестовое имя')), 204, 'internal'), /ячейка длиннее/), 'a cell longer than ' + L.cell + ' characters refuses the week');
    check(throws(() => U.parseWeek(tbody('<tr>' + '<td>1</td>'.repeat(50000) + '</tr>'), 204, 'internal'), /ячеек больше 7/), 'a row of fifty thousand cells is refused at the eighth');
    const numbered = (n) => Array.from({ length: n }, (_, i) => oneRow.replace('<td>1</td>', '<td>' + (i + 1) + '</td>')).join('');
    check(U.parseWeek(tbody(numbered(L.rows)), 204, 'internal').length === L.rows, `a week of ${L.rows} rows — as many as are asked for — is read`);
    check(throws(() => U.parseWeek(tbody(numbered(L.rows + 1)), 204, 'internal'), /больше \d+ строк/), 'one row more refuses the week');
    const manyWeeks = (n) => '<select id="ImportId">' + Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${i ? '' : ' selected'}>10.03.2031 - 14.03.2031 (Внутренние)</option>`).join('') + '</select>';
    check(U.parseWeeks(manyWeeks(L.weeks)).weeks.length === L.weeks && throws(() => U.parseWeeks(manyWeeks(L.weeks + 1)), /больше \d+ недель/),
      `a list of ${L.weeks} weeks is read, one more is refused`);
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
