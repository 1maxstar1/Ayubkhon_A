/*
 * An ordinary resource sheet and its header row.
 *
 * The header — N п/п · НАИМЕНОВАНИЕ · ЕД. ИЗМ. · КОЛ-ВО · ЦЕНА ЗА ЕД. · СУММА (сум) — was looked for after the
 * name key had folded «КОЛ-ВО» to «КОЛ ВО», so it was never found, and every ordinary sheet has been read by
 * the shape of its lines instead. That works while the bands stand in the first column. A sheet whose bands
 * are written in the name column, or that has no bands, or that has one more column among the six, was refused
 * with «листы ресурсов не найдены» — under which the program advises adding the header the sheet already had.
 *
 * Two things are held here:
 *   - a sheet that reads by its shape is read exactly as before, header or no header: every document made so
 *     far was built from that reading;
 *   - a sheet that does not, but names its columns, is read by them.
 *
 * Names and numbers are invented.
 *
 *   node test/smeta-header.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load('normalize', 'match', 'sections', 'util', 'formula', 'smeta', 'assemble', 'report');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/** rows[r][c] = {v} or {f}; r and c from 1, as the reader returns them. */
function sheet(name, lines) {
  const rows = [];
  lines.forEach((line, i) => {
    const cells = [];
    line.forEach((v, c) => {
      if (v == null) return;
      cells[c + 1] = typeof v === 'string' && v[0] === '=' ? { f: v } : { v };
    });
    rows[i + 1] = cells;
  });
  return { name, rows };
}

const HEAD = ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА\n ЗА ЕД.', 'СУММА \n(сум)'];
const TOP = [['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВАЯ УЛИЦА'], []];
const one = (wb) => S.smeta.parseWorkbook(wb, 'a.xlsx');
const shape = (o) => o.rows.map((r) => [r.kind, r.section, r.nm, r.unit, r.qty, r.price, r.sum]);
const items = (o) => o.rows.filter((r) => r.kind === 'item').map((r) => r.nm);

/* 1 — the ordinary sheet: bands in the first column */
const body = [
  ['ЗАТРАТЫ ТРУДА'],
  [1, 'ЗАТРАТЫ ТРУДА ТЕСТОВЫХ РАБОЧИХ', 'ЧЕЛ.-Ч', 10, 11, '=D7*E7'],
  ['ИТОГО', null, 'СУМ', null, null, '=SUM(F7:F7)'],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, '=D10*E10'],
  [2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, '=D11*E11'],
  ['ИТОГО', null, 'СУМ', null, null, '=SUM(F10:F11)']
];
const withHead = one({ sheets: [sheet('УЛ1', [...TOP, HEAD, [1, 2, 3, 4, 5, 6], ...body])] });
check(withHead.length === 1 && withHead[0].items === 3 && withHead[0].sections === 2,
  'an ordinary sheet is read: 3 resources in 2 bands');
check(withHead.length === 1 && withHead[0].layout.guessed === true && !withHead[0].rows.some((r) => r.kind === 'header'),
  '… by the shape of its lines, as every document so far was built — its header row stays out of the table');
check(withHead.length === 1 && withHead[0].title === 'ТЕСТОВАЯ СТРОЙКА' && withHead[0].subtitle === 'ТЕСТОВАЯ УЛИЦА',
  '… under its two title lines');

/* 2 — the same lines with the bands written in the name column: refused until now */
const inName = (line) => (line.length === 1 ? [null, line[0]] : line);
const moved = one({ sheets: [sheet('УЛ2', [...TOP, HEAD, [1, 2, 3, 4, 5, 6], ...body.map(inName)])] });
check(moved.length === 1 && moved[0].items === 3, 'a sheet with its bands in the name column is read by its header (was «листы ресурсов не найдены»)');
check(moved.length === 1 && JSON.stringify(items(moved[0])) === JSON.stringify(items(withHead[0])), '… the same three resources');
check(moved.length === 1 && !moved[0].layout.guessed && moved[0].layout.name === 2 && moved[0].layout.qty === 4 &&
  moved[0].layout.price === 5 && moved[0].layout.sum === 6, '… in the columns the header names');
check(moved.length === 1 && !moved[0].rows.some((r) => r.kind === 'header' || r.kind === 'numbering') && moved[0].rows[0].nm === '2',
  '… and laid out like every other ordinary sheet: the table starts at its «1 2 3 4 5 6» line, no header row in it');
check(moved.length === 1 && moved[0].title === 'ТЕСТОВАЯ СТРОЙКА' && moved[0].subtitle === 'ТЕСТОВАЯ УЛИЦА', '… under the same two title lines');

/* 3 — a header and no bands at all */
const flat = one({ sheets: [sheet('УЛ3', [...TOP, HEAD, [1, 2, 3, 4, 5, 6],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68], [2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, 57], ['ИТОГО', null, 'СУМ', null, null, 125]])] });
check(flat.length === 1 && flat[0].items === 2 && flat[0].sections === 0, 'a sheet with a header and no bands is read: 2 resources');

/* 4 — one more column among the six (a code), which the shape reading cannot place */
const coded = one({ sheets: [sheet('УЛ4', [...TOP,
  ['N п/п', 'КОД', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА\n ЗА ЕД.', 'СУММА \n(сум)'],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'Т-01', 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  [2, 'Т-02', 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, 57]])] });
check(coded.length === 1 && coded[0].items === 2 && coded[0].layout.name === 3 && coded[0].layout.qty === 5 && coded[0].layout.sum === 7,
  'a sheet with a column the shape reading cannot place is read by its header');
check(coded.length === 1 && coded[0].rows.filter((r) => r.kind === 'item').every((r) => r.price > 0 && r.qty > 0 && r.unit),
  '… with quantity, unit and price from the right columns');

/* 5 — what must stay out: a summary without a header of its own, and a sheet that only has the header */
const svod = one({ sheets: [sheet('СВОД', [['СВОДНАЯ ВЕДОМОСТЬ'], [],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68], [2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, 57]])] });
check(svod.length === 0, 'a summary sheet with no header and no bands is still left out');
const empty = one({ sheets: [sheet('ПУСТО', [...TOP, HEAD, [1, 2, 3, 4, 5, 6]])] });
check(empty.length === 0, 'a header with no resources under it is not an object');

// a report about an estimate is not an estimate: two quantities, two prices, two sums in its header
const report = one({ sheets: [sheet('По строкам', [['Сравнение версий'], [],
  ['Лист', '№', 'Наименование', 'Ед. изм.', 'Кол-во было', 'Кол-во стало', 'Цена было', 'Цена стало', 'Сумма было', 'Сумма стало'],
  ['УЛ1', 1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 4, 17, 15, 68, 60], ['УЛ1', 2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 3, 19, 16, 57, 48]])] });
check(report.length === 0, 'a comparison table («Кол-во было | Кол-во стало», two prices, two sums) is not taken for an estimate');
const twoSided = one({ sheets: [sheet('Отчёт', [...TOP,
  ['N\nп/п', null, 'НАИМЕНОВАНИЕ', 'ЕД.\nИЗМ.', 'КОЛ-ВО', 'ЦЕНА\n ЗА ЕД.', 'СУММА \n(сум)', 'ЦЕНА\n ЗА ЕД.', 'СУММА \n(сум)'],
  [1, null, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68, 15, 60], [2, null, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, 57, 16, 48]])] });
check(twoSided.length === 0, 'nor is a table with a smeta price and a market price side by side');

/* 6 — a sheet that reads by its shape reads the same with and without its header row */
const noHead = one({ sheets: [sheet('УЛ1', [...TOP, [], [], ...body])] });
check(noHead.length === 1 && JSON.stringify(shape(noHead[0]).filter((r) => r[2] !== '2')) === JSON.stringify(shape(withHead[0]).filter((r) => r[2] !== '2')),
  'the header row changes nothing in how a sheet that reads by its shape is read');

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
