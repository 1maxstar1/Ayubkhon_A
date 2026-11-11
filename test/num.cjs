/*
 * Numbers as they are written, and the lines of an estimate whose own arithmetic does not hold.
 *
 * S.num reads every quantity, price and sum of an estimate and every price typed into the page. A number with
 * its thousands grouped by commas or points was not a number to it — and a price box given one quietly put the
 * estimate's price back. And a line whose printed sum is not its quantity × price went into the document
 * recomputed, with nothing said.
 *
 *   node test/num.cjs
 */
'use strict';
const { load } = require('./load.cjs');
const S = load(load.PIPELINE);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const all = (pairs) => pairs.filter(([s, want]) => S.num(s) !== want).map(([s, want]) => JSON.stringify(s) + ' → ' + S.num(s) + ', want ' + want);
const say = (what, pairs) => { const bad = all(pairs); check(!bad.length, what + (bad.length ? ' — ' + bad.join('; ') : '')); };

say('one comma or one point is the decimal mark, as it always was', [
  ['12,5', 12.5], ['12.5', 12.5], ['12,500', 12.5], ['1,000', 1], ['1.000', 1], ['0,75', 0.75], ['.5', 0.5], ['-5', -5], ['1e3', 1000], ['1,5e3', 1500]]);
say('spaces of any kind between thousands', [['1 234 567,89', 1234567.89], ['1 234 567', 1234567], ['1 000', 1000], [' 42 ', 42]]);
say('thousands grouped by commas or points, with or without a decimal part', [
  ['1,234,567.89', 1234567.89], ['1.234.567,89', 1234567.89], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['1,234,567', 1234567], ['1.234.567', 1234567],
  ['-1,234.5', -1234.5], ['12,345,678', 12345678]]);
say('a leading plus and the typographic minus', [['+5', 5], ['−5', -5], ['+1 000,5', 1000.5]]);
say('what is not a number stays not a number', [
  ['', null], ['abc', null], ['98 765 сум', null], ['4.1.1', null], ['12.11.2026', null], ['1,23,456', null], ['1,234,56', null], ['1.2,3.4', null],
  ['12,', null], ['5.', null], ['--5', null], ['1,2345.6', null], ['1..5', null], ['٣', null]]);
check(S.num(7) === 7 && S.num(NaN) === null && S.num(Infinity) === null && S.num(null) === null && S.num(undefined) === null && S.num(true) === null,
  'numbers pass through; NaN, infinity and everything that is not text or a number are not numbers');

/* a line whose printed sum is not quantity × price */
const sh = (rows) => { const out = []; rows.forEach((line, i) => { const cells = []; line.forEach((v, c) => { if (v != null) cells[c + 1] = { v }; }); out[i + 1] = cells; }); return { name: 'УЛ1', rows: out }; };
const book = { sheets: [sh([
  ['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВАЯ УЛИЦА'], [],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  [2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, 75],            // 3 × 19 = 57, the estimate says 75
  [3, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2.5, 7.3, 18],            // 18.25: the estimate printed a whole sum — its rounding
  [4, 'ВОДА ТЕСТОВАЯ', 'М3', 7, 0.75, 5.25]
])] };
const model = S.assemble([{ id: 'p', name: 'Тест', title: 'ТЕСТ', objects: S.smeta.parseWorkbook(book, 'a.xlsx') }], {});
const od = model.oddSums;
check(od.count === 1 && od.rows.length === 1 && od.rows[0].nm === 'АНКЕР ТЕСТОВЫЙ М8' && od.rows[0].sum === 75 && od.rows[0].calc === 57,
  'the line whose sum is not quantity × price is counted and named, with both numbers (' + JSON.stringify(od.rows[0]) + ')');
check(model.rows[od.rows[0].r - 1].nm === 'АНКЕР ТЕСТОВЫЙ М8', 'by its row on Лист1');
check(od.count === 1, 'a sum the estimate rounded to a whole number is not a disagreement');
const calm = S.assemble([{ id: 'p', name: 'Тест', title: 'ТЕСТ', objects: S.smeta.parseWorkbook({ sheets: [sh([
  ['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВАЯ УЛИЦА'], [], ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68], [2, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2, 7, 14]])] }, 'b.xlsx') }], {});
check(calm.oddSums.count === 0, 'an estimate whose arithmetic holds has none');

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
