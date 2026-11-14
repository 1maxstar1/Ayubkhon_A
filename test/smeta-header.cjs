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

/* 7 — the statement of required resources («ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ»): «Сметная потребность» is the quantity,
   «Сметная стоимость» splits two rows down into «единицы | всего»; bands in the first column, items «1.», «2.» */
const ved = (name) => sheet(name, [
  ['Наименование стройки -', null, null, 'ТЕСТОВАЯ СТРОЙКА'], [], ['ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ №'], [],
  ['N п/п', 'Шифр (обоснование)', 'Код АВС', 'Наименование ресурса', 'Единица измерения', 'Сметная потреб-ность', 'Сметная стоимость, СУМ'],
  [null, null, null, null, null, null, 'в текущем уровне'],
  [null, null, null, null, null, null, 'единицы', 'всего'],
  [1, 2, 3, 4, 5, 6, 7, 8],
  ['Ресурсы по нормам ШНК'],
  ['Затраты труда'],
  ['1.', null, 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'чел.-ч', 10, 17, '=G11*F11'],
  [null, null, null, 'Итого по трудовым ресурсам', 'СУМ', null, null, '=SUM(H11)'],
  ['Строительные машины и механизмы'],
  ['1.', null, 97, 'КАТОК ТЕСТОВЫЙ 10 Т', 'маш.-ч', 3, 19, '=G14*F14'],
  ['2.', null, 98, 'ЭКСКАВАТОР ТЕСТОВЫЙ 0,65 М3', 'маш.-ч', 2, 23, '=G15*F15'],
  [null, null, null, 'Итого по строительным машинам', 'СУМ', null, null, '=SUM(H14:H15)'],
  ['Строительные материалы, изделия и детали'],
  ['1.', null, 6076, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'м3', 4, 29, '=G18*F18'],
  [null, null, null, 'Итого по материальным ресурсам', 'СУМ', null, null, '=SUM(H18)'],
  ['Перевозка строительные материалы'],
  [1, null, 4, 'ЩЕБЕНЬ ТЕСТОВЫЙ - 19 КМ', 'тн/км', 76, 3, '=G21*F21'],
  [null, null, 4, 'АНКЕР ТЕСТОВЫЙ - 53 КМ', 'тн/км', 53, 3, '=G22*F22'],
  [4, null, null, 'Перевозка материалов 5% от стоимости материалов', 'СУМ', 116, 0.05, '=G23*F23'],
  [null, null, null, 'Итого прямой затрат:', 'СУМ', null, null, '=H12+H16+H19']]);
const vb = S.smeta.parseWorkbook({ sheets: [ved('1'), ved('2')] }, 'v.xlsx');
const vItems = (o) => o.rows.filter((r) => r.kind === 'item');
check(vb.length === 2 && vb.every((o) => vItems(o).length === 6) && vb[0].layout.qty === 6 && vb[0].layout.price === 7 && vb[0].layout.sum === 8 && vb[0].layout.name === 4,
  'the statement of required resources is read on every object sheet: quantity, unit price and total from «Сметная потребность» and «единицы | всего»');
const by = {}; vItems(vb[0]).forEach((r) => { by[r.section] = (by[r.section] || 0) + 1; });
check(JSON.stringify(by) === JSON.stringify({ labor: 1, machines: 2, materials: 1, other: 2 }) && vItems(vb[0]).every((r) => r.qty > 0 && r.price > 0 && r.unit),
  'its bands in the first column give the sections; the haulage lines, numbered or not, are resources of their own (' + JSON.stringify(by) + ')');
check(vb[0].rows.find((r) => r.r === 23).kind === 'extra' && vb[0].rows.filter((r) => r.kind === 'total').length === 4 && vb[0].rows.find((r) => r.r === 5).kind === 'header' &&
  vb[0].rows.find((r) => r.r === 7).kind === 'header' && vb[0].rows.find((r) => r.r === 8).kind === 'numbering',
  'a line priced in sums (5 % of the materials) is not a resource; «Итого» lines are totals; the header and its numbering stay out');
const vm = S.assemble([{ name: 'v', file: 'v.xlsx', objects: vb, enabled: true }], {});
check(vm.resources.length === 6 && vm.resources.find((r) => r.name === 'КАТОК ТЕСТОВЫЙ 10 Т').qty === 6, 'the two object sheets assemble into one list: each resource once, its quantities added');
// the same header under a form-5 statement («Количество на ед. измерения | по проектным данным») is not taken for one
const form5 = one({ sheets: [sheet('1-1', [['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ'], [],
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество'],
  [null, null, null, null, 'на. ед. измерения', 'по проектным данным'], [1, 2, 3, 4, 5, 6],
  [1, 'Е0101', 'РАЗРАБОТКА ГРУНТА ТЕСТОВАЯ', '1000М3', 17], ['1.1', 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 4.69, 81, 17, 1377]])] });
check(form5.length === 0, 'the works-and-resources statement of form 5 (its prices come from the other sheet) is still left out');

/* 8 — the haulage sheet: one line per material; each is «Транспортировка <материал> <N> км» in т/км */
const haul = sheet('ТРАНСПОРТ', [['Транспортные расходы на перевозимые грузы'], ['ТЕСТОВАЯ СТРОЙКА'], [],
  ['№ П/П', 'Наменование  материалов', 'Единица  измерения', 'Коли-чество', 'Удель- ный  вес', 'Общая  тонна', 'Автотранспортная  км', 'тн/км', 'Стоимость за  один тн/км', 'Всего'],
  [null, null, null, null, 'тн'],
  [1, 2, 3, 4, 6, 7, 9, 10, 11, 12],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'т', 40, 1, 40, 19, 760, 3, 2280],
  [2, 'ПЕСОК ТЕСТОВЫЙ', 'м3', 10, 1.6, 16, 2.5, 40, 5, 200],
  [3, 'На остальные материалы 3% от стоимости материалов', null, null, null, null, null, null, null, 75],
  [null, 'ИТОГО', null, null, null, null, null, null, null, 2555]]);
const hb = one({ sheets: [haul] });
const hi = hb.length ? hb[0].rows.filter((r) => r.kind === 'item') : [];
check(hb.length === 1 && hi.length === 2 && hi[0].nm === 'Транспортировка ЩЕБЕНЬ ТЕСТОВЫЙ 19 км' && hi[1].nm === 'Транспортировка ПЕСОК ТЕСТОВЫЙ 2,5 км' &&
  hi.every((r) => r.unit === 'т/км') && hi[0].qty === 760 && hi[0].price === 3 && hi[1].qty === 40 && hi[1].price === 5,
  'the haulage sheet: each material is «Транспортировка <материал> <N> км» in т/км, its т·км the quantity and the price of one т·км the price');
check(hb.length === 1 && hb[0].rows.find((r) => r.r === 9).kind === 'extra' && hb[0].rows.find((r) => r.r === 10).kind === 'total' &&
  hb[0].rows.find((r) => r.r === 6).kind === 'numbering' && hi.every((r) => !r.cells[4] && !r.cells[7] && r.cells[2].v === r.nm),
  '… the 3 % line is not a resource, ИТОГО is a total; the material\'s own quantity and km are not copied into the table');
const hm = S.assemble([{ name: 'h', file: 'h.xlsx', objects: hb, enabled: true }], {});
check(hm.resources.length === 2 && hm.resources.some((r) => r.name === 'Транспортировка ЩЕБЕНЬ ТЕСТОВЫЙ 19 км' && r.qty === 760), 'the two haulage lines assemble as two resources');

/* 9 — a line under «ПЕРЕВОЗКА» is the haulage of a material: the same name under the materials is another resource */
const hv = ved('1');
// put a haulage band with the material's own name between the machines and the materials
hv.rows.splice(17, 0, [, { v: 'ПЕРЕВОЗКА' }], [, { v: '1.' }, , { v: 7 }, { v: 'ЩЕБЕНЬ ТЕСТОВЫЙ' }, { v: 'м3' }, { v: 4 }, { v: 3 }, { f: '=G19*F19' }],
  [, , , , { v: 'Итого по перевозке' }, { v: 'СУМ' }, , , { f: '=SUM(H19)' }]);
hv.rows.length = hv.rows.length;
const hvb = S.smeta.parseWorkbook({ sheets: [hv] }, 'h.xlsx');
const hvm = S.assemble([{ name: 'h', file: 'h.xlsx', objects: hvb, enabled: true }], {});
const stone = hvm.resources.filter((r) => /ЩЕБЕНЬ ТЕСТОВЫЙ$/.test(r.name) && r.unit === 'м3');
check(stone.length === 2 && stone.some((r) => r.name === 'ПЕРЕВОЗКА ЩЕБЕНЬ ТЕСТОВЫЙ' && r.price === 3) && stone.some((r) => r.name === 'ЩЕБЕНЬ ТЕСТОВЫЙ' && r.price === 29) &&
  stone.every((r) => r.variants === 1), 'a line under «ПЕРЕВОЗКА» is «ПЕРЕВОЗКА <материал>», apart from the material: a price typed for one never lands on the other');
const priced = S.assemble([{ name: 'h', file: 'h.xlsx', objects: hvb, enabled: true }], { [stone.find((r) => r.name === 'ЩЕБЕНЬ ТЕСТОВЫЙ').key]: 25 });
check(priced.resources.find((r) => r.name === 'ПЕРЕВОЗКА ЩЕБЕНЬ ТЕСТОВЫЙ').market === 3 && priced.resources.find((r) => r.name === 'ЩЕБЕНЬ ТЕСТОВЫЙ').market === 25,
  '… the material\'s market price leaves the haulage line at its own price');

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
