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

/* 10 — «№ п/п» with another column between it and the name: the № column is where the header says */
const just = one({ sheets: [sheet('РЕСУРС', [
  ['Ведомость ресурсов'],
  ['№ п/п', 'Обоснование', 'Наименование', 'Ед. изм.', 'Количество', 'Цена за ед.', 'Сумма'],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'С101-0001', 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  ['ПЕРЕВОЗКА'],
  [1, 'С310-0002', 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 3, 12]
])] });
const ji = just.length ? just[0].rows.filter((r) => r.kind === 'item') : [];
check(just.length === 1 && just[0].layout.no === 1 && ji.length === 2 && ji.every((r) => r.no === 1) &&
  just[0].rows.filter((r) => r.kind === 'section').length === 2, 'a column between «№ п/п» and the name: the № and the bands are read from the № column');
check(ji[1] && ji[1].nm === 'ПЕРЕВОЗКА ЩЕБЕНЬ ТЕСТОВЫЙ' && ji[0].nm === 'ЩЕБЕНЬ ТЕСТОВЫЙ', '… so the haulage band is seen and its line named apart');
const jm = S.assemble([{ name: 'j', file: 'j.xlsx', objects: just, enabled: true }], {});
const jRow = jm.rows.find((r) => r.kind === 'item');
check(jRow && jRow.cells[jm.cols.NO] && jRow.cells[jm.cols.NO].v === 1 && jRow.cells[jm.cols.UNIT].v === 'М3' && !jm.rows.some((r) => r.cells && Object.keys(r.cells).some((k) => r.cells[k] && r.cells[k].v === 'С101-0001')),
  'the code column between them is left out of the document, never written over the № or the unit');
// a line whose formula reads that left-out column (the overhead worked out from a figure in it) goes in as its value —
// and is counted, so that the page says it stays the estimate's number on the market side too
const dead = one({ sheets: [sheet('РЕСУРС', [
  ['Ведомость ресурсов'],
  ['№ п/п', 'Обоснование', 'Наименование', 'Ед. изм.', 'Количество', 'Цена за ед.', 'Сумма'],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 7, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  [null, null, 'ТРАНСПОРТНЫЕ РАСХОДЫ 5 %', 'СУМ', null, null, '=B4*0.5'],
  ['ИТОГО', null, null, 'СУМ', null, null, '=SUM(G4:G5)']])] });
const dm = S.assemble([{ name: 'd', file: 'd.xlsx', objects: dead, enabled: true }], {});
const dRow = dm.rows.find((r) => r.nm === 'ТРАНСПОРТНЫЕ РАСХОДЫ 5 %');
check(dm.frozen.dead === 0 && dRow && dRow.cells[dm.cols.SUM].f === '=7*0.5' && dRow.cells[dm.cols.MSUM] && dRow.cells[dm.cols.MSUM].f === '=7*0.5',
  'a formula reading a plain number in the left-out column gets that number written in and stays alive, on both sides (' + JSON.stringify(dRow && [dRow.cells[dm.cols.SUM], dRow.cells[dm.cols.MSUM]]) + ')');
// the number beside the line, times a sum of the table: alive, and worked out from the market sum on the market side
const liveSheet = sheet('РЕСУРС', [
  ['Ведомость ресурсов'],
  ['№ п/п', 'Обоснование', 'Наименование', 'Ед. изм.', 'Количество', 'Цена за ед.', 'Сумма'],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'С101', 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  [null, 0.05, 'ТРАНСПОРТНЫЕ РАСХОДЫ 5 %', 'СУМ', null, null, '=G4*B5'],
  [null, '=1+1', 'ЗАГОТОВИТЕЛЬНЫЕ РАСХОДЫ', 'СУМ', null, null, '=G4*B6'],
  [null, '=B5*2', 'СКЛАДСКИЕ РАСХОДЫ', 'СУМ', null, null, '=G4*B7'],
  [null, null, 'ПРОЧИЕ', 'СУМ', null, null, '=SUM(B5:B6)'],
  // a resource line whose quantity is worked out from the left-out column: its quantity and sum are the table's own anyway
  [2, 3, 'ПЕСОК ТЕСТОВЫЙ', 'М3', '=B9*2', 5, '=E9*F9']]);
liveSheet.rows[9][5] = { f: '=B9*2', v: 6 }; liveSheet.rows[9][7] = { f: '=E9*F9', v: 30 };     // as a saved file has them: with their values
const live = one({ sheets: [liveSheet] });
const lv = S.assemble([{ name: 'd', file: 'd.xlsx', objects: live, enabled: true }], {});
const cellsOf = (nm) => { const r = lv.rows.find((x) => x.nm === nm); return r ? [r.cells[lv.cols.SUM], r.cells[lv.cols.MSUM]] : null; };
const item = lv.rows.find((r) => r.kind === 'item'), at = item ? item.cells[lv.cols.IDX].v : 0;
const t5 = cellsOf('ТРАНСПОРТНЫЕ РАСХОДЫ 5 %');
check(t5 && t5[0].f === '=' + 'G' + at + '*0.05' && t5[1].f === '=' + 'I' + at + '*0.05',
  'the percentage kept in the left-out column is written into the formula: the line follows the market sum (' + JSON.stringify(t5) + ')');
const noF = (nm) => { const c = cellsOf(nm); return !!c && (!c[0] || c[0].f == null); };
const z = cellsOf('ЗАГОТОВИТЕЛЬНЫЕ РАСХОДЫ');
check(z && z[0].f === '=G' + at + '*(1+1)' && z[1].f === '=I' + at + '*(1+1)', 'a cell there that is a formula of plain numbers is written in as that formula (' + JSON.stringify(z) + ')');
check(noF('СКЛАДСКИЕ РАСХОДЫ') && noF('ПРОЧИЕ'), 'a chain of such cells, or a range over the left-out column, is nothing to write in: those go in as values');
const sandRow = lv.rows.find((r) => r.nm === 'ПЕСОК ТЕСТОВЫЙ');
check(sandRow && sandRow.kind === 'item' && sandRow.cells[lv.cols.QTY].v === 6 && /^=E\d+\*F\d+$/.test(sandRow.cells[lv.cols.SUM].f),
  'a resource line keeps the table\'s own quantity and sum whatever its estimate formula read (' + JSON.stringify(sandRow && [sandRow.cells[lv.cols.QTY], sandRow.cells[lv.cols.SUM]]) + ')');

/* 11 — a band whose title begins like a haulage word but is a resource band */
const eq = one({ sheets: [sheet('РЕСУРС', [
  ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'],
  [1, 2, 3, 4, 5, 6],
  ['ТРАНСПОРТНОЕ ОБОРУДОВАНИЕ'],
  [1, 'ЛИФТ ТЕСТОВЫЙ ПАССАЖИРСКИЙ', 'ШТ', 1, 1000, 1000]
])] });
const ei = eq.length ? eq[0].rows.filter((r) => r.kind === 'item') : [];
check(ei.length === 1 && ei[0].nm === 'ЛИФТ ТЕСТОВЫЙ ПАССАЖИРСКИЙ' && ei[0].section === 'equipment', '«ТРАНСПОРТНОЕ ОБОРУДОВАНИЕ» is equipment: its lines are not renamed as haulage');
// the other bands that begin so are resource bands too; «ТРАНСПОРТИРОВКА (ОБОРУДОВАНИЕ)» is haulage, equipment named or not;
// and «ПЕРЕВОЗКА» written in the name column (no number on it) is a haulage band as well
const bands = one({ sheets: [sheet('РЕСУРС', [
  ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'],
  [1, 2, 3, 4, 5, 6],
  ['СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
  [1, 'КАТОК ТЕСТОВЫЙ', 'МАШ.-Ч', 2, 13, 26],
  ['ТРАНСПОРТНЫЕ СРЕДСТВА'],
  [1, 'АВТОМОБИЛЬ ТЕСТОВЫЙ БОРТОВОЙ', 'МАШ.-Ч', 3, 11, 33],
  ['ТРАНСПОРТНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
  [1, 'ТЯГАЧ ТЕСТОВЫЙ', 'МАШ.-Ч', 1, 19, 19],
  ['ТРАНСПОРТИРОВКА (ОБОРУДОВАНИЕ)'],
  [1, 'ЩИТ ТЕСТОВЫЙ', 'Т', 2, 7, 14],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  [null, 'ПЕРЕВОЗКА'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'Т', 6, 3, 18]
])] });
const bi = bands.length ? bands[0].rows.filter((r) => r.kind === 'item').map((r) => r.nm) : [];
check(bi.join('|') === 'КАТОК ТЕСТОВЫЙ|АВТОМОБИЛЬ ТЕСТОВЫЙ БОРТОВОЙ|ТЯГАЧ ТЕСТОВЫЙ|ПЕРЕВОЗКА ЩИТ ТЕСТОВЫЙ|ЩЕБЕНЬ ТЕСТОВЫЙ|ПЕРЕВОЗКА ЩЕБЕНЬ ТЕСТОВЫЙ',
  '«ТРАНСПОРТНЫЕ СРЕДСТВА / МАШИНЫ» are resource bands; «ТРАНСПОРТИРОВКА (ОБОРУДОВАНИЕ)» and «ПЕРЕВОЗКА» in the name column are haulage (' + bi.join(' | ') + ')');

/* 12 — a sheet read by its shape that opens with «ПЕРЕВОЗКА» */
const top = one({ sheets: [sheet('ПЕРЕВОЗКА', [
  ['ТЕСТОВАЯ СТРОЙКА'],
  ['ПЕРЕВОЗКА'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 3, 12],
  [2, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2, 2, 4],
  ['ИТОГО', null, 'СУМ', null, null, 16],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ГРАВИЙ ТЕСТОВЫЙ', 'М3', 1, 9, 9]
])] });
const ti = top.length ? top[0].rows.filter((r) => r.kind === 'item') : [];
check(ti.length === 3 && ti[0].nm === 'ПЕРЕВОЗКА ЩЕБЕНЬ ТЕСТОВЫЙ' && ti[1].nm === 'ПЕРЕВОЗКА ПЕСОК ТЕСТОВЫЙ' && ti[2].nm === 'ГРАВИЙ ТЕСТОВЫЙ',
  'a «ПЕРЕВОЗКА» band opening a sheet read by its shape names its lines; the next band ends it (' + ti.map((r) => r.nm).join(' | ') + ')');

/* 13 — form 4А: the header repeated on a new printed page inside one estimate */
const est = [
  [null, null, ' ЛОКАЛЬНЫЙ   РЕСУРСНЫЙ   СМЕТНЫЙ   РАСЧЕТ', '№ 1'],
  [null, 'на', 'ТЕСТОВЫЕ РАБОТЫ'],
  [],
  ['№ п/п', 'Шифр ресурсов', 'Наименование ресурсов, оборудования, конструкций, изделий и  деталей', 'Единица измерения', 'Количество единиц', 'Сметная стоимость'],
  [null, null, null, null, null, 'на единицу', 'общая'],
  [1, 2, 3, 4, 5, 6, 7],
  [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  ['1', 'С1', 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 29, 116],
  // a new page: the header again, nothing above it but the page break
  ['№ п/п', 'Шифр ресурсов', 'Наименование ресурсов, оборудования, конструкций, изделий и  деталей', 'Единица измерения', 'Количество единиц', 'Сметная стоимость'],
  [null, null, null, null, null, 'на единицу', 'общая'],
  [1, 2, 3, 4, 5, 6, 7],
  ['2', 'С2', 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2, 7, 14],
  [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, 130],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 130]
];
const pg = one({ sheets: [sheet('РА', [[null, null, null, null, null, 'Форма 4А АВС-4'], ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...est])] });
const pi = pg.flatMap((o) => o.rows.filter((r) => r.kind === 'item'));
check(pg.length === 1 && pi.length === 2 && pi.map((r) => r.nm).join('|') === 'ЩЕБЕНЬ ТЕСТОВЫЙ|ПЕСОК ТЕСТОВЫЙ' && pi.every((r) => r.section === 'materials'),
  'form 4А: a header repeated on a new page does not split the estimate; no line is lost, the band runs on (' + pg.length + ' objects, ' + pi.length + ' lines)');

/* 14 — a «№ …» column to the right of the sum is not the line number (v2.16.1 took it for one) */
const cert = one({ sheets: [sheet('РЕСУРС', [
  ['Ведомость ресурсов'],
  ['N п/п', 'Наименование', 'Ед. изм.', 'Количество', 'Цена за ед.', 'Сумма', '№ сертификата'],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68, 'С-77'],
  [2, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2, 5, 10, 'С-78'],
  ['ИТОГО', null, 'СУМ', null, null, 78]
])] });
const ci = cert.length ? cert[0].rows.filter((r) => r.kind === 'item') : [];
check(cert.length === 1 && cert[0].layout.no === 1 && ci.length === 2 && ci[0].no === 1 && ci[1].no === 2 &&
  cert[0].rows.some((r) => r.kind === 'section') && cert[0].rows.some((r) => r.kind === 'total'),
  'a «№ сертификата» column right of the sum: the № is still the first column, the band and the ИТОГО are read (№ column ' + (cert[0] && cert[0].layout.no) + ')');

/* 15 — form 4А: two estimates whose titles are written whole in one cell, and two with nothing but a signature between */
const HEAD4 = [
  ['№ п/п', 'Шифр ресурсов', 'Наименование ресурсов, оборудования, конструкций, изделий и  деталей', 'Единица измерения', 'Количество единиц', 'Сметная стоимость'],
  [null, null, null, null, null, 'на единицу', 'общая'],
  [1, 2, 3, 4, 5, 6, 7]];
const bodyOf = (code, nm, unit, q, p) => [
  [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  ['1', code, nm, unit, q, p, q * p],
  [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, q * p],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, q * p]];
const signed = [[], [null, 'СОСТАВИЛ', null, 'ТЕСТОВ Т.Т.'], []];
const oneCell = one({ sheets: [sheet('РА', [
  ['Наименование стройки - ТЕСТОВАЯ СТРОЙКА'], [],
  ['ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ № 01-01-01'], ['на ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ'], [],
  ...HEAD4, ...bodyOf('С1', 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 4, 17), ...signed,
  ['ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ № 01-01-02'], ['на ДОРОЖНЫЕ РАБОТЫ'], [],
  ...HEAD4, ...bodyOf('С2', 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'М3', 2, 9), ...signed])] });
const itemsOf = (o) => o.rows.filter((r) => r.kind === 'item').map((r) => r.nm).join('|');
check(oneCell.length === 2 && itemsOf(oneCell[0]) === 'ТЕСТОВЫЙ АНКЕР М5' && itemsOf(oneCell[1]) === 'ТЕСТОВЫЙ ЩЕБЕНЬ' &&
  !oneCell.some((o) => o.rows.some((r) => r.kind !== 'header' && /ЛОКАЛЬНЫЙ/.test(String(r.nm || '')))),
  'form 4А: two estimates titled in one cell each stay two; no title line falls into the table (' + oneCell.length + ' objects)');
const bare = one({ sheets: [sheet('РА', [
  [null, null, ' ЛОКАЛЬНЫЙ   РЕСУРСНЫЙ   СМЕТНЫЙ   РАСЧЕТ', '№ 1'], [null, 'на', 'ТЕСТОВЫЕ РАБОТЫ'], [],
  ...HEAD4, ...bodyOf('С1', 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 4, 17), ...signed,
  ...HEAD4, ...bodyOf('С2', 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'М3', 2, 9), ...signed])] });
check(bare.length === 2 && itemsOf(bare[0]) === 'ТЕСТОВЫЙ АНКЕР М5' && itemsOf(bare[1]) === 'ТЕСТОВЫЙ ЩЕБЕНЬ',
  'form 4А: a header after «ИТОГО ПРЯМЫЕ ЗАТРАТЫ» opens another estimate even with no title above it (' + bare.length + ' objects)');

/* 16 — a sheet read by its shape whose title begins «ТРАНСПОРТН…»: a street, not a haulage band */
const street = one({ sheets: [sheet('УЛ', [
  ['Тест'], ['ТРАНСПОРТНАЯ УЛИЦА'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, 68],
  [],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2, 5, 10]
])] });
const si = street.length ? street[0].rows.filter((r) => r.kind === 'item') : [];
check(si.length === 2 && si[0].nm === 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'a title «ТРАНСПОРТНАЯ УЛИЦА» above the first lines does not rename them as haulage (' + si.map((r) => r.nm).join(' | ') + ')');

/* 17 — a haulage sheet written as «МАТЕРЯЛЫ | ЕД ИЗ | … | ТОН/КМ», with the two mistakes such a sheet is known to carry:
        a material in tonnes with a specific weight of 2, and a «ВСЕГО» whose SUM stops a line short */
const haul2 = sheet('перевозка', [['ТЕСТОВАЯ СТРОЙКА'], [], ['ТРАНСПОРТНЫЕ РАСХОДЫ НА ПЕРЕВОЗИМЫЕ ГРУЗЫ'], [],
  ['№', 'МАТЕРЯЛЫ', 'ЕД ИЗ', 'КОЛИЧЕСТВА', 'УДЕЛНЫЙ ВЕС ТН', 'ОБШИЙ ТОННА', 'АВТОТРАНСПОРТ КМ', 'ТОН/КМ', 'СТОИМОСТЬ ЗА ОДИН ТН/КМ', 'ВСЕГО'],
  [1, 'ТЕСТОВАЯ СМЕСЬ ПЛОТНАЯ', 'ТН', 100, 1, '=E6*D6', 20, '=G6*F6', 3, '=I6*H6'],
  [2, 'ТЕСТОВАЯ СМЕСЬ ПОРИСТАЯ', 'ТН', 10, 2, '=E7*D7', 20, '=G7*F7', 3, '=I7*H7'],
  [3, 'ТЕСТОВЫЙ ГРАВИЙ', 'М3', 50, 1.4, '=E8*D8', 5, '=G8*F8', 4, '=I8*H8'],
  [null, 'ВСЕГО', null, null, null, null, null, null, null, '=SUM(J6:J7)'],
  [], [null, 'ЗАКАЗЧИК', null, null, null, null, 'ПОДРЯДЧИК']]);
// the values Excel saved with the formulas: F = D·E, H = F·G, J = H·I; the ВСЕГО leaves the gravel out
const val = (r, c, v) => { haul2.rows[r][c].v = v; };
val(6, 6, 100); val(6, 8, 2000); val(6, 10, 6000);
val(7, 6, 20); val(7, 8, 400); val(7, 10, 1200);
val(8, 6, 70); val(8, 8, 350); val(8, 10, 1400);
val(9, 10, 7200);
const h2 = one({ sheets: [haul2] });
const h2i = h2.length ? h2[0].rows.filter((r) => r.kind === 'item') : [];
check(h2.length === 1 && h2[0].layout.transport && h2i.length === 3 && h2i[1].nm === 'Транспортировка ТЕСТОВАЯ СМЕСЬ ПОРИСТАЯ 20 км' &&
  h2i[1].qty === 400 && h2i[1].price === 3 && h2i[2].nm === 'Транспортировка ТЕСТОВЫЙ ГРАВИЙ 5 км',
  'a haulage sheet headed «МАТЕРЯЛЫ | ЕД ИЗ | ТОН/КМ» is read as one: each material in т/км (' + h2i.map((r) => r.nm).join(' | ') + ')');
const ck2 = (h2[0] && h2[0].checks) || [];
const wck = ck2.find((c) => c.kind === 'weight'), tck = ck2.find((c) => c.kind === 'total');
check(ck2.length === 2 && wck && wck.r === 7 && wck.weight === 2 && wck.tkmFixed === 200 && wck.sumFixed === 600 && /завышены в 2 раза/.test(wck.text),
  'a material in tonnes with a specific weight of 2: said, with the т·км and the sum it should have (' + (wck && wck.text) + ')');
check(tck && tck.total === 7200 && tck.lines === 8600 && tck.missing.join() === 'ТЕСТОВЫЙ ГРАВИЙ' && /не учтена строка «ТЕСТОВЫЙ ГРАВИЙ»/.test(tck.text),
  'a «ВСЕГО» that leaves a line out: said, and which line (' + (tck && tck.text) + ')');
check(!ck2.some((c) => c.r === 8 && c.kind === 'weight'), 'a weight of 1,4 for a material in м3 is no mistake');
// the old haulage sheet of section 8 (all weights right, ИТОГО the sum of its lines with the 3 % line) says nothing
check(!(hb[0].checks || []).some((c) => c.kind === 'weight'), 'a haulage sheet with right weights carries no weight remark');

/* 18 — the haulage sheet of another estimating program: «Объем- ный вес», «Дальность возки км», «тон / км»,
        «Стоимость грузоперевозок» as the sum, the weight in a merged two-column cell */
const haul3 = sheet('Транспортны.', [['Транспортные расходы на перевозку строительных материалов'], ['ТЕСТОВЫЙ УЧАСТОК'], [], ['ТЕСТОВАЯ ЧАСТЬ'],
  ['№ П/П', 'Наменование материалов', 'Единица измерения', 'Коли- чество', 'Объем- ный вес', null, 'Общая тонна', 'Дальность возки км', 'тон / км', 'Стоимость за один т/км', 'Стоимость грузоперевозок'],
  [null, null, null, null, 'тон/м3'],
  [1, 'ТЕСТОВЫЕ СМЕСИ', 'т', 100, 1, null, 100, 30, 3000, 2, 6000],
  [2, 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'м3', 10, 1.45, 1.45, 14.5, 10, 145, 3, 435],
  [3, 'ТЕСТОВЫЕ ИЗДЕЛИЯ', 'т', 5, 2.4, 2.4, 12, 10, 120, 3, 360],
  [null, 'ВСЕГО', null, null, null, null, null, null, null, null, 6795]]);
const h3 = one({ sheets: [haul3] });
const h3i = h3.length ? h3[0].rows.filter((r) => r.kind === 'item') : [];
check(h3.length === 1 && h3[0].layout.transport && h3i.length === 3 && h3i[0].nm === 'Транспортировка ТЕСТОВЫЕ СМЕСИ 30 км' && h3i[0].qty === 3000 &&
  h3i[0].price === 2 && h3i[0].sum === 6000, 'a haulage sheet with «Стоимость грузоперевозок» for its sum is read (' + h3i.map((r) => r.nm).join(' | ') + ')');
const ck3 = (h3[0] && h3[0].checks) || [];
check(ck3.length === 1 && ck3[0].kind === 'weight' && ck3[0].r === 9 && ck3[0].weight === 2.4,
  '«Объем- ный вес» is the weight: 2,4 for a material in тонны is said, 1,45 for м3 is not, the ВСЕГО of all lines says nothing (' + ck3.map((c) => c.kind + ' r' + c.r).join(', ') + ')');

/* 19 — a resource estimate of another program (the «_ЛРС» sheet): «Сметная стоимость» over two levels — «в базисном
        уровне» (all «--») and «в текущем», each with «на ед. изм.» and «общая» a row lower; the totals («ИТОГО ПО …») in
        the code column; the haulage lines with their names in the code column too, under «Перевозка материалов» (sums as cached values, as a saved file has them) */
const lrs = one({ sheets: [sheet('_ЛРС', [['ТЕСТОВАЯ СТРОЙКА'], [null, null, null, null, null, null, '#VALUE!'], [null, '(наименование стройки)'], [null, 'ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ'], ['на ', ','],
  ['Сметная стоимость', null, null, null, null, '--', 'ТЫС.СУМ.', '--', 'ТЫС.СУМ.'], [],
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество ', 'Сметная стоимость, сум'],
  [null, null, null, null, null, 'в базисном уровне', null, 'в текущем (прогнозном)'],
  [null, null, null, null, null, 'на.ед.изм.', 'общая', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 10, '--', '--', 7, 70],
  [null, 'ИТОГО ПО ТРУДОВЫМ РЕСУРСАМ:', null, 'СУМ', null, null, '--', null, 70],
  [null, null, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
  [1, '97', 'ТЕСТОВЫЙ АВТОГРЕЙДЕР', 'МАШ.-Ч', 4, '--', '--', 11, 44],
  [2, '108', 'ТЕСТОВЫЙ КАТОК 8 Т', 'МАШ.-Ч', 3, null, null, 13, 39],
  [null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАШИНАМ:', null, 'СУМ', null, null, '--', null, 83],
  ['Перевозка материалов'],
  [1, 'ПЕРЕВОЗКА ТЕСТОВОЙ СМЕСИ НА 30 КМ ПО А/Д', null, 'ТН/КМ', 100, null, null, 2, 200],
  [2, 'ПЕРЕВОЗКА ТЕСТОВОГО ЩЕБНЯ НА 30 КМ ПО А/Д', null, 'ТН/КМ', 50, null, null, 3, 150],
  [null, 'ПЕРЕВОЗКА ТЕСТОВОГО ПЕСКА НА 45 КМ ПО А/Д', null, 'ТН/КМ', null, null, null, 5, 0],
  [null, 'Итого по перевозке', null, 'СУМ', null, null, null, null, 350],
  [null, null, 'МАТЕРИАЛЬНЫЕ РЕСУРСЫ'],
  [1, '6076', 'ТЕСТОВАЯ СМЕСЬ ГОРЯЧАЯ', 'Т', 20, null, null, 17, 340],
  [2, '9219', 'ВОДА', 'М3', 5, '--', '--', 0, 0],
  [null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', null, 'СУМ', null, null, '--', null, 340],
  [],
  [null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', null, 'СУМ', null, null, '--', null, 690],
  [null, 'ИТОГО ПО РЕСУРСНОМУ РАСЧЕТУ:', null, 'СУМ', null, null, '--', null, 843],
  [], [null, 'СОСТАВИЛ', null, null, 'ТЕСТОВ Т.Т.']])] });
const li = lrs.length ? lrs[0].rows.filter((r) => r.kind === 'item') : [];
const lNames = li.map((r) => r.nm);
check(lrs.length === 1 && li.length === 8, 'a «_ЛРС» sheet with «Сметная стоимость» over two levels is read: 8 resources (' + lNames.join(' | ') + ')');
const grader = li.find((r) => r.nm === 'ТЕСТОВЫЙ АВТОГРЕЙДЕР');
check(grader && grader.qty === 4 && grader.price === 11 && grader.sum === 44,
  'the price and the sum are the current ones («в текущем»), not the base «--» (' + JSON.stringify(grader && [grader.qty, grader.price, grader.sum]) + ')');
const mix = li.find((r) => /ПЕРЕВОЗКА ТЕСТОВОЙ СМЕСИ/.test(r.nm));
check(mix && mix.unit && /ТН\/КМ/i.test(mix.unit) && mix.qty === 100 && mix.price === 2 && mix.sum === 200,
  'a haulage line with its name in the code column is a resource: name, т/км, quantity, price (' + JSON.stringify(mix && [mix.nm, mix.unit, mix.qty, mix.price]) + ')');
check(!lNames.some((n) => /ИТОГО|Итого/.test(n)) && lrs[0].rows.some((r) => r.kind === 'total'),
  'the totals in the code column are totals, not resources');
check(li.some((r) => r.nm === 'ТЕСТОВАЯ СМЕСЬ ГОРЯЧАЯ') && li.some((r) => r.nm === 'ВОДА'),
  'the materials after «Итого по перевозке» are read: the estimate does not end at the first total in the code column');
const sand = li.find((r) => /ТЕСТОВОГО ПЕСКА/.test(r.nm));
check(sand && sand.qty === 0 && sand.price === 5 && sand.sum === 0,
  'a haulage line with its price and no quantity (its sum 0), numbered or not, is read with the quantity 0 — nothing on the sheet goes unseen (' + JSON.stringify(sand && [sand.qty, sand.price, sand.sum]) + ')');
check(li.filter((r) => /^ПЕРЕВОЗКА/.test(r.nm)).every((r) => r.section === 'other') && grader.section === 'machines',
  'the lines under «Перевозка материалов» (a band in the number column) are haulage, not the machines of the band above (' + li.map((r) => r.section).join(',') + ')');
check(lrs[0].title === 'ТЕСТОВАЯ СТРОЙКА' && lrs[0].subtitle !== ',',
  'the construction is the line above its caption «(наименование стройки)» (not «#VALUE!»), and a blank «на ,» names no works (' + JSON.stringify([lrs[0].title, lrs[0].subtitle]) + ')');
const lm = S.assemble([{ name: 'l', file: 'l.xlsx', objects: lrs, enabled: true }], {});
const lmix = lm.rows.find((r) => r.kind === 'item' && /ПЕРЕВОЗКА ТЕСТОВОЙ СМЕСИ/.test(r.nm || r.name || ''));
check(!!lmix, 'and the haulage line goes into the comparison table under its name');

/* 20 — a haulage sheet with no т·км column: the header over two rows («Автомобил» above «Автотранспортная км | Стоимость
        за один т/км | Итого»), «Удель- ный вес», the т·км the tonnes × the km; and a money line («На остальные материалы
        3%») inside the «ИТОГО» is no missing line */
const haul4 = sheet('Транспорт', [[' Транспортные расходы на перевозимые грузы'], ['ТЕСТОВАЯ ДОРОГА'],
  ['№ П/П', 'Наименование материалов', 'Единица измерения', 'Коли-чество', 'Удель- ный вес', 'Общая тонна', 'Автомобил'],
  [null, null, null, null, 'тон', null, 'Автотранспортная км', 'Стоимость за один т/км', 'Итого'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 'ТЕСТОВАЯ СМЕСЬ', 'т', 37, 1, 37, 23, 3, 2553],
  [2, 'ТЕСТОВЫЙ БИТУМ', 'т', 2, 1, 2, 23, 3, 138],
  [3, 'На остальные материалы 3% от стоимости материалов', null, null, null, null, null, null, 17],
  [4, 'ИТОГО', null, null, null, null, null, null, 2708]]);
const h4 = one({ sheets: [haul4] });
const h4i = h4.length ? h4[0].rows.filter((r) => r.kind === 'item') : [];
check(h4.length === 1 && h4[0].layout.transport && h4i.length === 2 && h4i[0].nm === 'Транспортировка ТЕСТОВАЯ СМЕСЬ 23 км' && h4i[0].unit === 'т/км' &&
  h4i[0].qty === 851 && h4i[0].price === 3 && h4i[0].sum === 2553 && h4i[1].qty === 46,
  'a haulage sheet without a т·км column is read: the т·км is the tonnes × the km (' + h4i.map((r) => r.nm + ' ' + r.qty + '×' + r.price + '=' + r.sum).join(' | ') + ')');
check(h4i.every((r) => r.cells[h4[0].layout.qty].v === r.qty && r.cells[h4[0].layout.qty].f == null && r.cells[h4[0].layout.sum].f == null),
  'the т·км and the sum go into the document as values: the sheet\'s formulas name the km and the tonnes, which are left out');
check(!(h4[0].checks || []).length, 'the 3 % line is part of the «ИТОГО»: no line is said to be missing (' + JSON.stringify((h4[0].checks || []).map((c) => c.text)) + ')');
// the same sheet whose «ИТОГО» (2 691) is the SUM of the two materials only, the 3 % line on the sheet left out of it: the
// estimate's own way (the owner's corrected file leaves it so) — the materials read are what it charges, nothing is said
const withTotal = (t) => sheet('Транспорт', haul4.rows.slice(1).map((cs) => (cs || []).slice(1).map((c) => (c ? c.v : null))).map((l) => (l[1] === 'ИТОГО' ? [4, 'ИТОГО', null, null, null, null, null, null, t] : l)));
const ck5 = (one({ sheets: [withTotal(2691)] })[0] || {}).checks || [];
check(ck5.length === 0, 'an «ИТОГО» of the materials only, with the 3 % line outside it, is no mistake (' + ck5.map((c) => c.text).join('; ') + ')');
// with the 3 % line outside, a material left out is still said: its name, and the sum of the material lines
const ck6 = (one({ sheets: [withTotal(2553)] })[0] || {}).checks || [];
check(ck6.length === 1 && ck6[0].kind === 'total' && ck6[0].total === 2553 && ck6[0].lines === 2691 && ck6[0].missing.join() === 'ТЕСТОВЫЙ БИТУМ' &&
  /не учтена строка «ТЕСТОВЫЙ БИТУМ» \(138\)/.test(ck6[0].text),
  'a material left out of an «ИТОГО» that leaves the 3 % line out too: said, and which line (' + ck6.map((c) => c.text).join('; ') + ')');
// and a total that is neither the materials nor the materials with the 3 % line: said, with the difference
const ck7 = (one({ sheets: [withTotal(2601)] })[0] || {}).checks || [];
check(ck7.length === 1 && ck7[0].lines === 2708 && ck7[0].diff === 107 && !ck7[0].missing.length && /разница 107/.test(ck7[0].text),
  'an «ИТОГО» that is no sum of the lines at all: said, with the difference (' + ck7.map((c) => c.text).join('; ') + ')');

/* 21 — the local resource estimate with a code column whose band ends with lines the estimator added by hand, without
        numbers («Разъединитель | комплект | 1 | … », counted by the band's «ИТОГО»): resources all the same. Lines with no
        number that are not resources stay out: «В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ» priced like one, a money line in «СУМ»,
        and a line whose quantity × price is not its sum */
const lrs2 = one({ sheets: [sheet('3', [[null, 'ТЕСТОВАЯ СТРОЙКА'], [null, '(наименование стройки)'], [null, null, 'ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ'], [],
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество ', 'Сметная стоимость'],
  [null, null, null, null, null, 'в базисном уровне'],
  [null, null, null, null, null, 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7],
  [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 13, 7, 91],
  [null, 'ИТОГО ПО ТРУДОВЫМ РЕСУРСАМ:', null, 'СУМ', null, null, 91],
  [null, null, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
  ['2', '101', 'ТЕСТОВЫЙ АВТОГИДРОПОДЪЕМНИК', 'МАШ.-Ч', 3, 29, 87],
  [null, null, 'В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ.-Ч', 3, 7, 21],
  [null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАШИНАМ:', null, 'СУМ', null, null, 87],
  [null, null, 'МАТЕРИАЛЬНЫЕ РЕСУРСЫ'],
  ['3', 'СЦЕНА', 'ТЕСТОВЫЙ ИЗОЛЯТОР ПОДВЕСНОЙ', 'ШТ', 6, 31, 186],
  [null, 'СЦЕНА', 'ТЕСТОВЫЙ РАЗЪЕДИНИТЕЛЬ 6 КВ', 'комплект', 1, 1093.75, 1093.75],
  [null, 'СЦЕНА', 'ТЕСТОВЫЙ РАЗРЯДНИК', 'шт', 3, 47.5, 142.5],
  [null, 'СЦЕНА', 'ТЕСТОВЫЙ ЗАЖИМ НАТЯЖНОЙ', 'ШТ', 4, 19, 97],
  [null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', null, 'СУМ', null, null, 1422.25],
  [null, null, 'ТРАНСПОРТНЫЕ РАСХОДЫ', 'СУМ', 0.03, 1422.25, 42.6675],
  [null, 'ВСЕГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', null, 'СУМ', null, null, 1464.9175]])] });
const l2 = lrs2.length ? lrs2[0].rows.filter((r) => r.kind === 'item') : [];
const l2n = l2.map((r) => r.nm);
check(l2n.includes('ТЕСТОВЫЙ РАЗЪЕДИНИТЕЛЬ 6 КВ') && l2n.includes('ТЕСТОВЫЙ РАЗРЯДНИК') && l2.find((r) => r.nm === 'ТЕСТОВЫЙ РАЗРЯДНИК').section === 'materials',
  'lines added by hand without numbers, priced like resources, are read under their band (' + l2n.join(' | ') + ')');
const l2mat = l2.filter((r) => r.section === 'materials').reduce((t, r) => t + r.sum, 0);
check(Math.abs(l2mat - 186 - 1093.75 - 142.5) < 1e-6, 'the materials read: the numbered line and the two priced ones (' + l2mat + ')');
check(!l2n.some((n) => /В Т\.Ч\./.test(n)) && !l2n.includes('ТРАНСПОРТНЫЕ РАСХОДЫ'),
  '«В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ» priced like a line, and the money line in «СУМ», are not resources');
check(!l2n.includes('ТЕСТОВЫЙ ЗАЖИМ НАТЯЖНОЙ'), 'nor a line without a number whose quantity × price is not its sum (4 × 19 ≠ 97)');

/* 22 — the local resource statement of another program («ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ»): each work line («1», a code, a work
        unit, its project quantity, its unit price and sum) is followed by its resources («1.1», «1.2» …); «Количество» over two
        columns — «на единицу измерения» and «по проектным данным» —, «Сметная стоимость» over «на единицу измерения» and «общая»;
        «N п/п» for the number column; the numbers written as text with a decimal comma */
const lrv = one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['Заказчик: Тестовый'], ['ТЕСТОВАЯ ДОРОГА'], ['наименование (объекта) стройки'], ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 1'], ['на ТЕСТОВЫЕ РАБОТЫ'], [],
  ['N п/п', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат, характеристика оборудования', 'Единица измерения', 'Количество', null, 'Сметная стоимость'],
  [null, null, null, null, 'на единицу измерения', 'по проектным данным', 'на единицу измерения', 'общая'],
  ['1', '2', '3', '4', '5', '6', '7', '8'],
  [' РАЗДЕЛ 1. ТЕСТОВАЯ ОДЕЖДА'],
  ['1', 'Е01-01-003-8', 'РАЗРАБОТКА ТЕСТОВОГО ГРУНТА', '1000 М3', null, '0,5', '5000,00', '2500,00'],
  ['1.1', '00001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-ЧАС', '10', '5', '100,00', '500,00'],
  ['1.2', '00003', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ-ЧАС', '20', '10', '0,00', '0,00'],
  ['1.3', '02264', 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3', 'МАШ-ЧАС', '20', '10', '200,00', '2000,00'],
  ['2', 'Е27-04-003-6', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '1000 М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИЯ', null, '2', '1700,00', '3400,00'],
  ['2.1', '00107', 'ТЕСТОВЫЙ АВТОГРЕЙДЕР', 'МАШ-ЧАС', '1,5', '3', '300,00', '900,00'],
  ['2.2', '4071', 'ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ', 'М3', '125', '250', '10,00', '2500,00'],
  ['Итого по разделу " РАЗДЕЛ 1. ТЕСТОВАЯ ОДЕЖДА"', null, null, null, null, null, null, '5900,00'],
  ['ИТОГО: ', null, null, null, null, null, null, '5900,00 ']])] });
const lw = lrv.length ? lrv[0].rows.filter((r) => r.kind === 'item') : [];
check(lrv.length === 1 && lw.length === 5 && lw.map((r) => r.nm).join('|') ===
  'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ|ЗАТРАТЫ ТРУДА МАШИНИСТОВ|ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3|ТЕСТОВЫЙ АВТОГРЕЙДЕР|ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ',
  'a resource statement with the resources under each work is read: its 5 resources (' + lw.map((r) => r.nm).join(' | ') + ')');
const exc = lw.find((r) => r.nm === 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3');
check(exc && exc.qty === 10 && exc.price === 200 && exc.sum === 2000 && lrv[0].layout.no === 1,
  'the quantity is the project one («по проектным данным»), not the one per unit; the price is «на единицу измерения» of the cost (' + JSON.stringify(exc && [exc.qty, exc.price, exc.sum]) + ')');
check(!lw.some((r) => /^(РАЗРАБОТКА|УСТРОЙСТВО)/.test(r.nm)) && lrv[0].rows.filter((r) => r.kind === 'extra' && /^(РАЗРАБОТКА|УСТРОЙСТВО)/.test(r.nm)).length === 2,
  'the work lines (nothing per unit) are not resources: their cost is the sum of the resources under them');
check(Math.abs(lw.reduce((t, r) => t + r.sum, 0) - 5900) < 1e-6, 'the resources read add up to the «ИТОГО» (5 900)');
// the same sheet with one quantity column (the ordinary one): the per-unit and project split is not looked for
const lrv1 = one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['ТЕСТОВАЯ ДОРОГА'], [],
  ['№ п/п', 'Шифр', 'Наименование работ и затрат', 'Единица измерения', 'Количество', 'Цена', 'Сумма'],
  ['1', '2', '3', '4', '5', '6', '7'],
  ['1', '02264', 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3', 'МАШ-ЧАС', 10, 200, 2000],
  ['2', '4071', 'ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ', 'М3', 250, 10, 2500]])] });
check(lrv1.length === 1 && lrv1[0].rows.filter((r) => r.kind === 'item').length === 2 && !lrv1[0].layout.unitQty, 'one quantity column: read as before');

/* 23 — «Расчёт стоимости перевозки материальных ресурсов» of another program: the name under «Наименование работ и затрат»
        merged over two columns (written in the second), «потребность», «Объём- ный весь т/м3», the rail columns empty,
        «Расст» / «расс-т», «автотр расход» over «на тн/км», «Всего» (the cost of one unit) and «Общая цена материалов» (the
        whole cost); no т·км column: it is the quantity × the specific weight × the km */
const calc = sheet('расчет', [[], [], [null, 'Р А С Ч Ё Т'], [null, 'Стоимости перевозки материальных ресурсов'], [], [null, 'ТЕСТОВЫЙ ОБЪЕКТ'], [],
  ['№', 'Наименование работ и затрат, характеристика оборудования и его масса', null, 'Еди-ница изме-рение', 'потребность', ' ', 'Объём- ный весь т/м3', 'расход ж/д перевозки', null, null, 'Расст', 'автотр расход', null, 'Общая цена материалов'],
  [null, null, null, null, null, null, null, 'Расст-е на перев-у', 'на 1тн', 'Стоим-ть транс-ка мат 1 м3 по ж/д', 'расс-т', 'на тн/км', 'Всего'],
  [], [], [],
  [1, 2, null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  ['ТЕСТОВЫЙ ОБЪЕКТ'],
  [1, null, 'ТЕСТОВАЯ СМЕСЬ ПЛОТНАЯ', 'тн', 100, 'АБЗ', 1, null, null, null, 20, 3, 60, 6000],
  [null, null, 'ТЕСТОВАЯ СМЕСЬ КРУПНАЯ', 'тн', 20, 'АБЗ', 1, null, null, null, 20, 3, 60, 1200],
  [2, null, 'ТЕСТОВАЯ ПЕСЧАНО-ГРАВИЙНАЯ СМЕСЬ', 'м3', 10, 'КАРЬЕР', 1.6, null, null, null, 25.5, 3, 122.4, 1224],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, 8424],
  [], [], [null, null, ' Составил:', null, null, null, null, 'ТЕСТОВ Т.']]);
const c23 = one({ sheets: [calc] });
const c23i = c23.length ? c23[0].rows.filter((r) => r.kind === 'item') : [];
check(c23.length === 1 && c23[0].layout.transport && c23i.length === 3 && c23i[0].nm === 'Транспортировка ТЕСТОВАЯ СМЕСЬ ПЛОТНАЯ 20 км' &&
  c23i[0].unit === 'т/км' && c23i[0].qty === 2000 && c23i[0].price === 3 && c23i[0].sum === 6000,
  'a «Расчёт стоимости перевозки» is read: т·км = потребность × вес × км, the price «на тн/км», the sum «Общая цена» (' +
  c23i.map((r) => r.nm + ' ' + r.qty + '×' + r.price + '=' + r.sum).join(' | ') + ')');
check(c23i.length === 3 && c23i[1].nm === 'Транспортировка ТЕСТОВАЯ СМЕСЬ КРУПНАЯ 20 км' && c23i[2].nm === 'Транспортировка ТЕСТОВАЯ ПЕСЧАНО-ГРАВИЙНАЯ СМЕСЬ 25,5 км' &&
  Math.abs(c23i[2].qty - 408) < 1e-9 && c23i[2].sum === 1224 && c23i.every((r) => r.section === 'other'),
  'the line without a number is read too, and a material in м3 is carried by its weight (10 × 1,6 × 25,5 = 408 т·км)');
check(c23.length === 1 && Math.abs(c23i.reduce((t, r) => t + r.sum, 0) - 8424) < 1e-6, 'the haulage read is the sheet\'s whole cost (8 424)');

/* 24 — a «Расчёт стоимости перевозки» whose cost is added to the price of each material («Стоимост мат-ов без перевозки»
        beside it, «Общая цена» = the material + its haulage, per unit): the resource sheet already carries that price, so the
        sheet is a calculation of prices — read as haulage it would count the haulage twice. It is not read. */
const res24 = sheet('Р1', [...TOP, HEAD, [1, 2, 3, 4, 5, 6], ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ТЕСТОВАЯ СМЕСЬ ГОРЯЧАЯ', 'Т', 10, 1620, '=D7*E7'], ['ИТОГО', null, 'СУМ', null, null, '=SUM(F7:F7)']]);
const mat24 = sheet('перевозка1', [[], [null, 'Расчёт'], [null, 'Стоимости перевозки материалных'], [null, 'ТЕСТОВЫЙ ОБЪЕКТ'], [],
  ['№', 'Наименование работ и затрат, характеристика оборудования', 'Еди-ница изме-рение', 'Кол-во', 'Наименова-ние поставшика и пункт отправления', 'Стоимост мат-ов без перевозки на ед.', 'Объём- ный весь т/м3', 'расход транс перевозки', null, null, 'Общая цена материалов'],
  [null, null, null, null, null, null, null, 'Расст', 'на тн/км', 'Всего'],
  [], [], [],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [null, 'Материалные ресурсы'],
  [1, 'ТЕСТОВАЯ СМЕСЬ ГОРЯЧАЯ', 'Т', 10, 'ТЕСТОВЫЙ АБЗ', 1500, 1, 40, 3, 120, 1620]]);
const o24 = one({ sheets: [res24, mat24] });
check(o24.length === 1 && o24[0].name === 'Р1' && o24[0].rows.filter((r) => r.kind === 'item').length === 1,
  'a haulage calculation folded into the material prices is not read: the material is counted once (' + o24.map((o) => o.name).join(', ') + ')');

/* 25 — «N п/п» over the number column, a code column («Код АВС») between it and the name, and «Сметная потреб-ность»: the
        bands written in the number column («Затраты труда», «Строительные машины и механизмы» …) are seen, and the lines
        go under them; «N п/п» was not taken for the number column, which was then the code column, and every line went
        under no band at all */
const vr = one({ sheets: [sheet('ресурс', [['ТЕСТОВАЯ СТРОЙКА'], [], ['ВЕДОМОСТЬ РАСХОДА МАТЕРИАЛОВ'], [],
  ['N п/п', 'Код АВС', 'Наименование ресурса', 'Единица измерения', 'Сметная потреб-ность', 'Сметная стоимость, СУМ'],
  [null, null, null, null, null, 'в базисном уровне'],
  [null, null, null, null, null, 'единицы', 'всего'],
  [1, 3, 4, 5, 6, 7, 8],
  ['Ресурсы по нормам СНиП'],
  ['Затраты труда'],
  ['1.', 1, 'Затраты труда тестовых рабочих', 'чел.-ч', 10, 7, 70],
  [null, null, 'Итого по трудовым ресурсам', 'СУМ', null, null, 70],
  ['Строительные машины и механизмы'],
  ['1.', 97, 'Тестовые автомобили-самосвалы до 30 т', 'маш.-ч', 3, 19, 57],
  [null, null, 'Итого по строительным машинам', 'СУМ', null, null, 57],
  ['Материальные ресурсы'],
  ['1.', 4071, 'Тестовая смесь песчано-гравийная', 'м3', 25, 11, 275],
  [null, null, 'Итого по материальным ресурсам', 'СУМ', null, null, 275]])] });
const vri = vr.length ? vr[0].rows.filter((r) => r.kind === 'item') : [];
check(vr.length === 1 && vr[0].layout.no === 1 && vri.length === 3 && vri.map((r) => r.section).join() === 'labor,machines,materials',
  '«N п/п» is the number column, and the bands in it are seen: labor, machines, materials (' + JSON.stringify(vr[0] && vr[0].layout.no) + ' ' + vri.map((r) => r.section).join() + ')');

/* 26 — the local resource statement (22): a resource with nothing «на единицу измерения» — a material the project names, its
        norm left blank, «-» or a word — is a resource all the same when it is numbered under the work above it («1.3» under
        «1»); it was taken for a work and left out, and the resources read fell short of the «ИТОГО». A line the numbering
        does not put under a work is still told by its norm, as before */
const b26head = [
  ['N п/п', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат, характеристика оборудования', 'Единица измерения', 'Количество', null, 'Сметная стоимость'],
  [null, null, null, null, 'на единицу измерения', 'по проектным данным', 'на единицу измерения', 'общая'],
  ['1', '2', '3', '4', '5', '6', '7', '8']];
const b26read = (norm, line) => one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['ТЕСТОВАЯ ДОРОГА'], ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 2'], [], ...b26head,
  ['1', 'Е01-01-003-8', 'РАЗРАБОТКА ТЕСТОВОГО ГРУНТА', '1000 М3', null, '0,5', '6800,00', '3400,00'],
  ['1.1', '00001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-ЧАС', '10', '5', '100,00', '500,00'],
  ['1.2', '02264', 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3', 'МАШ-ЧАС', '20', '10', '200,00', '2000,00'],
  line || ['1.3', '9001', 'ТЕСТОВАЯ ТРУБА ПО ПРОЕКТУ', 'М', norm, '100', '9,00', '900,00'],
  ['2', 'Е27-04-003-6', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '1000 М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИЯ', null, '2', '500,00', '1000,00'],
  ['2.1', '4071', 'ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ', 'М3', '50', '100', '10,00', '1000,00'],
  ['ИТОГО: ', null, null, null, null, null, null, '4400,00']])] });
const b26items = (o) => (o.length ? o[0].rows.filter((r) => r.kind === 'item') : []);
const b26work = (r) => /^(РАЗРАБОТКА|УСТРОЙСТВО)/.test(r.nm);
[null, '-', 'по проекту'].forEach((norm) => {
  const b26o = b26read(norm), b26i = b26items(b26o), b26pipe = b26i.find((r) => r.nm === 'ТЕСТОВАЯ ТРУБА ПО ПРОЕКТУ');
  const b26said = norm == null ? 'nothing' : '«' + norm + '»';
  check(b26o.length === 1 && b26i.length === 4 && !!b26pipe && b26pipe.qty === 100 && b26pipe.price === 9 && b26pipe.sum === 900,
    'a line numbered under its work («1.3» under «1») with ' + b26said + ' per unit is a resource (' + b26i.map((r) => r.nm).join(' | ') + ')');
  check(Math.abs(b26i.reduce((t, r) => t + r.sum, 0) - 4400) < 1e-6 && !b26i.some(b26work) &&
    b26o.length === 1 && b26o[0].rows.filter((r) => r.kind === 'extra' && b26work(r)).length === 2,
    '… the resources read add up to the «ИТОГО» (4 400), and the two works are still not resources');
});
// where the numbering says nothing the norm still decides, as it did: works numbered «1.1», «1.2» (the second is not under
// the first), their resources without numbers, and a line with no number and nothing per unit
const b26flat = one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['ТЕСТОВАЯ ДОРОГА'], ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 3'], [], ...b26head,
  ['1.1', 'Е01-01-003-8', 'РАЗРАБОТКА ТЕСТОВОГО ГРУНТА', '1000 М3', null, '0,5', '5000,00', '2500,00'],
  [null, '02264', 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3', 'МАШ-ЧАС', '25', '12,5', '200,00', '2500,00'],
  ['1.2', 'Е27-04-003-6', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '1000 М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИЯ', null, '2', '500,00', '1000,00'],
  [null, '4071', 'ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ', 'М3', '50', '100', '10,00', '1000,00'],
  [null, null, 'ТЕСТОВЫЕ ПРОЧИЕ РАБОТЫ', 'М2', null, '10', '7,00', '70,00'],
  ['ИТОГО: ', null, null, null, null, null, null, '3570,00']])] });
check(b26flat.length === 1 && b26items(b26flat).map((r) => r.nm).join('|') === 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3|ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ' &&
  b26flat[0].rows.filter((r) => r.kind === 'extra' && (b26work(r) || r.nm === 'ТЕСТОВЫЕ ПРОЧИЕ РАБОТЫ')).length === 3,
  'a line the numbering does not put under the work above it («1.2» after «1.1», or no number) and with nothing per unit is a work, as before (' +
  b26items(b26flat).map((r) => r.nm).join(' | ') + ')');
// … and a line numbered under the work is rescued only when it is priced as a resource: a money line («СУМ»), a «%» line and
// a «В Т.Ч. …» line with nothing per unit stay out, as they were
[['1.3', '9002', 'ТЕСТОВЫЙ КОМПЛЕКТ', 'СУМ', null, '100', '9,00', '900,00'],
  ['1.3', '9003', 'ТЕСТОВЫЕ НАКЛАДНЫЕ', '%', null, '100', '9,00', '900,00'],
  ['1.3', null, 'В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ-ЧАС', null, '3', null, null]].forEach((line) => {
  const b26o = b26read(null, line), b26i = b26items(b26o);
  check(b26o.length === 1 && b26i.length === 3 && !b26i.some((r) => r.nm === line[2]) && b26o[0].rows.some((r) => r.kind === 'extra' && r.nm === line[2]),
    '«' + line[2] + ' | ' + line[3] + '» numbered under its work with nothing per unit is not a resource (' + b26i.map((r) => r.nm).join(' | ') + ')');
});
// … nor a line with lines numbered under it: «1.1» followed by «1.1.1» is a work of its own (numbered three levels deep), not
// a resource of the work «1» above it — the works stay out of the resources
const b26deep = one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['ТЕСТОВАЯ ДОРОГА'], ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 6'], [], ...b26head,
  ['1', 'Е01', 'ТЕСТОВЫЕ ЗЕМЛЯНЫЕ РАБОТЫ', '1000 М3', null, '1', '3000,00', '3000,00'],
  ['1.1', 'Е01-01-003-8', 'РАЗРАБОТКА ТЕСТОВОГО ГРУНТА', '1000 М3', null, '0,5', '2000,00', '1000,00'],
  ['1.1.1', '00001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-ЧАС', '10', '5', '200,00', '1000,00'],
  ['1.2', 'Е27-04-003-6', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '1000 М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИЯ', null, '0,5', '4000,00', '2000,00'],
  ['1.2.1', '02264', 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3', 'МАШ-ЧАС', '20', '10', '200,00', '2000,00'],
  ['ИТОГО: ', null, null, null, null, null, null, '3000,00']])] });
check(!b26items(b26deep).some(b26work), 'works numbered «1.1», «1.2» with lines «1.1.1», «1.2.1» under them are not resources of the work «1» (' +
  b26items(b26deep).map((r) => r.nm).join(' | ') + ')');

/* 27 — the same statement with «Цена» and «Сумма» named in the main header row, each over both rows, so that the row below
        holds nothing but the two columns of «Количество» («на единицу измерения» | «по проектным данным»): the two were only
        looked for when the price or the sum had to be found on that row, and the quantity was read from the norm column
        (10, 20, 1 for 5, 10, 100) */
const b27lines = [
  ['1', 'Е01-01-003-8', 'РАЗРАБОТКА ТЕСТОВОГО ГРУНТА', '1000 М3', null, '0,5', '5000,00', '2500,00'],
  ['1.1', '00001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-ЧАС', '10', '5', '100,00', '500,00'],
  ['1.2', '02264', 'ТЕСТОВЫЙ ЭКСКАВАТОР 0,65 М3', 'МАШ-ЧАС', '20', '10', '200,00', '2000,00'],
  ['2', 'Е27-04-003-6', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '1000 М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИЯ', null, '2', '500,00', '1000,00'],
  ['2.1', '4071', 'ТЕСТОВАЯ СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ', 'М3', '1', '100', '10,00', '1000,00'],
  ['ИТОГО: ', null, null, null, null, null, null, '3500,00']];
const b27 = one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['ТЕСТОВАЯ ДОРОГА'], ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 4'], [],
  ['N п/п', 'Шифр', 'Наименование работ и затрат', 'Единица измерения', 'Количество', null, 'Цена', 'Сумма'],
  [null, null, null, null, 'на единицу измерения', 'по проектным данным'],
  ['1', '2', '3', '4', '5', '6', '7', '8'], ...b27lines])] });
const b27work = (r) => /^(РАЗРАБОТКА|УСТРОЙСТВО)/.test(r.nm);
const b27L = b27.length ? b27[0].layout : {};
const b27i = b27.length ? b27[0].rows.filter((r) => r.kind === 'item') : [];
check(b27.length === 1 && b27L.unitQty === 5 && b27L.qty === 6 && b27L.price === 7 && b27L.sum === 8,
  '«Количество» over two columns is seen under a header that names «Цена» and «Сумма» itself (' + JSON.stringify([b27L.unitQty, b27L.qty, b27L.price, b27L.sum]) + ')');
check(b27i.length === 3 && b27i.map((r) => r.qty).join() === '5,10,100' && b27i.every((r) => Math.abs(r.qty * r.price - r.sum) < 1e-6),
  'the quantity is the project one, not the one per unit: quantity × price is the sum (' + b27i.map((r) => r.qty + '×' + r.price + '=' + r.sum).join(' | ') + ')');
check(b27.length === 1 && !b27i.some(b27work) && b27[0].rows.filter((r) => r.kind === 'extra' && b27work(r)).length === 2 &&
  Math.abs(b27i.reduce((t, r) => t + r.sum, 0) - 3500) < 1e-6, 'the works are not resources, and the resources read add up to the «ИТОГО» (3 500)');
const b27at = (r) => (b27.length ? b27[0].rows.find((x) => x.r === r) : null) || {};
check(b27at(5).kind === 'header' && b27at(5).sub === true && b27at(6).kind === 'numbering' && !(b27.length && b27[0].rows.some((r) => r.kind === 'extra' && r.nm === '3')),
  'the row of the two columns is the header\'s second line, and the «1 2 3 …» row under it is the numbering — not a line of the estimate (' + b27at(5).kind + ', ' + b27at(6).kind + ')');
// the same header without a code column
const b27plain = one({ sheets: [sheet('ЛОКАЛЬНО-РЕС', [['ТЕСТОВАЯ ДОРОГА'], ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 5'], [],
  ['N п/п', 'Наименование работ и затрат', 'Единица измерения', 'Количество', null, 'Цена', 'Сумма'],
  [null, null, null, 'на единицу измерения', 'по проектным данным'],
  ['1', '2', '3', '4', '5', '6', '7'], ...b27lines.map((l) => (l.length > 1 ? [l[0], ...l.slice(2)] : l))])] });
const b27pi = b27plain.length ? b27plain[0].rows.filter((r) => r.kind === 'item') : [];
check(b27plain.length === 1 && b27plain[0].layout.unitQty === 4 && b27plain[0].layout.qty === 5 && b27pi.map((r) => r.qty).join() === '5,10,100' && !b27pi.some(b27work),
  '… and without a code column: the same three resources with their project quantities (' + b27pi.map((r) => r.nm + ' ' + r.qty).join(' | ') + ')');
// the statement of 22 (the price and the sum on the row of the two columns) keeps the layout it was read by — key for key, in
// the same order: test/smeta-corpus.cjs fingerprints the layout as it is written out, so a key set earlier than before would
// call every recorded statement of that kind «read differently» with not one of its rows changed (the string changes only
// together with a «test/smeta-corpus.cjs --record» the owner has decided on)
const b27was = '{"code":2,"name":3,"unit":4,"qty":6,"unitQty":5,"price":7,"sum":8,"subRow":8,"no":1,"headerRow":7,"numRow":9,"lastCol":8}';
check(lrv.length === 1 && JSON.stringify(lrv[0].layout) === b27was, 'the statement of 22 keeps its layout as it was recorded (' + JSON.stringify(lrv[0] && lrv[0].layout) + ')');

/* 28 — a haulage sheet with a «Всего» to the right of another sum column: the «Всего» is the sum, as it was before v2.16.11
        («Итого | Погрузка | Всего», «Сумма материалов | … | Всего»); only «Общая цена» keeps the sum against a «Всего» of
        one unit beside it */
const c28head = (sums) => ['№ П/П', 'Наименование материалов', 'Ед. изм.', 'Количество', 'Удельный вес', 'Общая тонна', 'Автотранспорт км', 'тн/км', 'Стоимость за один тн/км'].concat(sums);
const c28a = one({ sheets: [sheet('ТРАНСПОРТ', [['Транспортные расходы'], ['ТЕСТОВАЯ СТРОЙКА'], [],
  c28head(['Итого', 'Погрузка', 'Всего']),
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'т', 40, 1, 40, 19, 760, 3, 2280, 120, 2400],
  [2, 'ПЕСОК ТЕСТОВЫЙ', 'т', 10, 1, 10, 5, 50, 4, 200, 30, 230],
  [null, 'ВСЕГО', null, null, null, null, null, null, null, 2480, 150, 2630]])] });
const c28ai = c28a.length ? c28a[0].rows.filter((r) => r.kind === 'item') : [];
check(c28a.length === 1 && c28a[0].layout.sum === 12 && c28ai.length === 2 && c28ai[0].sum === 2400 && c28ai[1].sum === 230 && !(c28a[0].checks || []).length,
  '«Итого | Погрузка | Всего»: the sum is the «Всего» (' + c28ai.map((r) => r.sum).join(', ') + ')');
const c28b = one({ sheets: [sheet('ТРАНСПОРТ', [['Транспортные расходы'], ['ТЕСТОВАЯ СТРОЙКА'], [],
  ['№ П/П', 'Наименование материалов', 'Ед. изм.', 'Количество', 'Сумма материалов', 'Удельный вес', 'Общая тонна', 'Автотранспорт км', 'тн/км', 'Стоимость за один тн/км', 'Всего'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'т', 40, 4000, 1, 40, 19, 760, 3, 2280],
  [2, 'ПЕСОК ТЕСТОВЫЙ', 'т', 10, 900, 1, 10, 5, 50, 4, 200],
  [null, 'ВСЕГО', null, null, 4900, null, null, null, null, null, 2480]])] });
const c28bi = c28b.length ? c28b[0].rows.filter((r) => r.kind === 'item') : [];
check(c28b.length === 1 && c28b[0].layout.sum === 11 && c28bi.length === 2 && c28bi[0].sum === 2280 && c28bi[1].sum === 200,
  '«Сумма материалов | … | Всего»: the haulage sum is the «Всего», not the materials\' own sum (' + c28bi.map((r) => r.sum).join(', ') + ')');
const c28c = one({ sheets: [sheet('расчет', [[null, 'Стоимости перевозки материальных ресурсов'], [null, 'ТЕСТОВЫЙ ОБЪЕКТ'], [],
  ['№', 'Наименование работ и затрат', 'Ед. изм.', 'потребность', 'Объёмный вес', 'Расст', 'на тн/км', 'Общая цена', 'Всего'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 'ТЕСТОВАЯ ПЕСЧАНО-ГРАВИЙНАЯ СМЕСЬ', 'м3', 10, 1.6, 25.5, 3, 1224, 122.4]])] });
const c28ci = c28c.length ? c28c[0].rows.filter((r) => r.kind === 'item') : [];
check(c28c.length === 1 && c28c[0].layout.sum === 8 && c28ci.length === 1 && c28ci[0].sum === 1224,
  '«Общая цена | Всего» in one header row: the sum stays the «Общая цена», the «Всего» is the cost of one unit (' + c28ci.map((r) => r.sum).join(', ') + ')');

/* 29 — a «Расчёт стоимости перевозки» that adds the haulage to the material's price, whatever its header calls that price
        («Цена материала без перевозки», «Стоим. мат.», «Отпускная цена», or no word for a price at all): its «Общая цена»
        (the material + its haulage, per unit) is not the т·км × the price of one т·км on any line, so it is not read and the
        haulage is not counted twice; a genuine one with one line off (a slip) or one sum left empty is still read */
const c29res = sheet('Р1', [...TOP, HEAD, [1, 2, 3, 4, 5, 6], ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ТЕСТОВАЯ СМЕСЬ ГОРЯЧАЯ', 'Т', 10, 1620, '=D7*E7'], ['ИТОГО', null, 'СУМ', null, null, '=SUM(F7:F7)']]);
const c29calc = (word) => sheet('перевозка1', [[], [null, 'Расчёт'], [null, 'Стоимости перевозки материалных'], [null, 'ТЕСТОВЫЙ ОБЪЕКТ'], [],
  ['№', 'Наименование работ и затрат, характеристика оборудования', 'Еди-ница изме-рение', 'потребность', 'Наименова-ние поставшика и пункт отправления', word, 'Объём- ный весь т/м3', 'расход транс перевозки', null, null, 'Общая цена материалов'],
  [null, null, null, null, null, null, null, 'Расст', 'на тн/км', 'Всего'],
  [], [], [],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [null, 'Материалные ресурсы'],
  [1, 'ТЕСТОВАЯ СМЕСЬ ГОРЯЧАЯ', 'Т', 10, 'ТЕСТОВЫЙ АБЗ', 1500, 1, 40, 3, 120, 1620]]);
const c29words = ['Стоимост мат-ов без перевозки на ед.', 'Цена материала без перевозки', 'Стоим. мат.', 'Отпускная цена', 'Гр. 6'];
const c29read = c29words.map((w) => one({ sheets: [c29res, c29calc(w)] }).map((o) => o.name).join('+'));
check(c29read.every((n) => n === 'Р1'),
  'a haulage calculation folded into the material prices is not read, whatever the material\'s price is called (' + c29words.map((w, i) => w + ': ' + c29read[i]).join(' | ') + ')');
const c29true = (last) => sheet('перевозка1', [[], [null, 'Расчёт'], [null, 'Стоимости перевозки материалных'], [null, 'ТЕСТОВЫЙ ОБЪЕКТ'], [],
  ['№', 'Наименование работ и затрат, характеристика оборудования', 'Еди-ница изме-рение', 'потребность', 'Наименова-ние поставшика и пункт отправления', 'Гр. 6', 'Объём- ный весь т/м3', 'расход транс перевозки', null, null, 'Общая цена материалов'],
  [null, null, null, null, null, null, null, 'Расст', 'на тн/км', 'Всего'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [1, 'ТЕСТОВАЯ СМЕСЬ ПЛОТНАЯ', 'тн', 100, 'ТЕСТОВЫЙ АБЗ', null, 1, 20, 3, 60, 6000],
  [2, 'ТЕСТОВАЯ ПЕСЧАНО-ГРАВИЙНАЯ СМЕСЬ', 'м3', 10, 'ТЕСТОВЫЙ КАРЬЕР', null, 1.6, 25.5, 3, 122.4, last]]);
const c29slip = [1250, null].map((last) => {
  const o = one({ sheets: [c29true(last)] });
  return o.length ? o[0].rows.filter((r) => r.kind === 'item').map((r) => r.qty + '×' + r.price + '=' + r.sum).join(' ') : '(not read)';
});
check(c29slip[0] === '2000×3=6000 408×3=1250' && c29slip[1] === '2000×3=6000 408×3=null',
  '… but a genuine one with a slip in one line, or one sum left empty, is read, the line as the sheet has it (' + c29slip.join(' | ') + ')');

/* 30 — rail and road distance in one header: «Расст-е на перев-у» (under «расход ж/д перевозки») is the rail distance and is
        never the road km, whether it stands to the right of the road «расс-т» or to the left */
const c30calc = (railFirst, roadKm) => {
  const road = [['автотр расход', null, null], [roadKm || 'расс-т', 'на тн/км', 'Всего']];
  const rail = [['расход ж/д перевозки', null, null], ['Расст-е на перев-у', 'на 1тн', 'Стоим-ть транс-ка мат 1 м3 по ж/д']];
  const g = railFirst ? [rail, road] : [road, rail];
  const line = (no, nm, unit, q, src, w, km, p, one1, all) => {
    const rd = [km, p, one1], rl = [null, null, null];
    return [no, null, nm, unit, q, src, w].concat(railFirst ? rl.concat(rd) : rd.concat(rl), [all]);
  };
  return sheet('расчет', [[], [], [null, 'Р А С Ч Ё Т'], [null, 'Стоимости перевозки материальных ресурсов'], [], [null, 'ТЕСТОВЫЙ ОБЪЕКТ'], [],
    ['№', 'Наименование работ и затрат, характеристика оборудования и его масса', null, 'Еди-ница изме-рение', 'потребность', ' ', 'Объём- ный весь т/м3'].concat(g[0][0], g[1][0], ['Общая цена материалов']),
    [null, null, null, null, null, null, null].concat(g[0][1], g[1][1]),
    [], [1, 2, null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    line(1, 'ТЕСТОВАЯ СМЕСЬ ПЛОТНАЯ', 'тн', 100, 'АБЗ', 1, 20, 3, 60, 6000),
    line(2, 'ТЕСТОВАЯ ПЕСЧАНО-ГРАВИЙНАЯ СМЕСЬ', 'м3', 10, 'КАРЬЕР', 1.6, 25.5, 3, 122.4, 1224),
    [null, null, null, null, null, null, null, null, null, null, null, null, null, 7224]]);
};
const c30 = [false, true].map((railFirst) => {
  const o = one({ sheets: [c30calc(railFirst)] });
  return o.length ? o[0].rows.filter((r) => r.kind === 'item').map((r) => r.nm + ' ' + r.qty + '×' + r.price + '=' + r.sum) : [];
});
const c30want = 'Транспортировка ТЕСТОВАЯ СМЕСЬ ПЛОТНАЯ 20 км 2000×3=6000|Транспортировка ТЕСТОВАЯ ПЕСЧАНО-ГРАВИЙНАЯ СМЕСЬ 25,5 км 408×3=1224';
check(c30[0].join('|') === c30want, 'the rail distance to the right of the road «расс-т» is not the road km: both lines read (' + c30[0].join(' | ') + ')');
check(c30[1].join('|') === c30want, '… and to the left of it neither (' + c30[1].join(' | ') + ')');
const c30road = ['Расст', 'Расст.', 'Расст-е'].map((k) => {
  const o = one({ sheets: [c30calc(false, k)] });
  return o.length ? o[0].rows.filter((r) => r.kind === 'item').length : 0;
});
check(c30road.join() === '2,2,2', 'the road distance headed «Расст», «Расст.» or «Расст-е» is the road km beside the rail «Расст-е на перев-у» (' + c30road.join() + ')');

/* 31 — money lines without a number on a sheet with a code column, priced in another spelling of the currency than «СУМ»
        («сўм», «тыс.сум», «so'm», «1000 сум», «руб»), quantity × price = sum: money lines all the same, not lines added by
        hand — they were read as resources, offered for a market price and counted in the totals. A line added by hand in
        an ordinary unit («шт», «усл. ед.») is still read */
const d31Money = ['сўм', 'тыс.сум', "so'm", 'руб.', 'тыс. сўм', 'UZS', 'млн.сум', 'минг сўм', "ming so'm", 'sum', 'SOM',
  '1000 сум', 'тысяч сум', 'т.сум', 'рублей', 'RUB', 'млрд сум', "mln so'm", 'сум'];
const d31 = one({ sheets: [sheet('3', [[null, 'ТЕСТОВАЯ СТРОЙКА'], [null, '(наименование стройки)'], [null, null, 'ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ'], [],
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество ', 'Сметная стоимость'],
  [null, null, null, null, null, 'в базисном уровне'],
  [null, null, null, null, null, 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7],
  [null, null, 'МАТЕРИАЛЬНЫЕ РЕСУРСЫ'],
  ['1', 'СЦЕНА', 'ТЕСТОВЫЙ ИЗОЛЯТОР ПОДВЕСНОЙ', 'ШТ', 6, 31, 186],
  [null, 'СЦЕНА', 'ТЕСТОВЫЙ РАЗРЯДНИК', 'шт', 3, 47.5, 142.5],
  [null, null, 'ТЕСТОВАЯ НАЦЕНКА', 'усл. ед.', 2, 50, 100],
  ...d31Money.map((u, i) => [null, null, 'ТЕСТОВЫЕ РАСХОДЫ ' + (i + 1), u, 0.03, 186, 5.58]),
  [null, null, 'ТРАНСПОРТНЫЕ РАСХОДЫ', 'сўм', 0.03, 186, 5.58],
  [null, null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 'тыс.сум', 0.02, 186, 3.72],
  [null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', null, 'СУМ', null, null, 428.5]])] });
const d31i = d31.length ? d31[0].rows.filter((r) => r.kind === 'item') : [];
const d31n = d31i.map((r) => r.nm);
check(d31.length === 1 && !d31n.some((n) => /РАСХОДЫ/.test(n)),
  'a money line in «' + d31Money.join('», «') + '» priced like a resource is not a resource (' + d31n.join(' | ') + ')');
check(d31n.join('|') === 'ТЕСТОВЫЙ ИЗОЛЯТОР ПОДВЕСНОЙ|ТЕСТОВЫЙ РАЗРЯДНИК|ТЕСТОВАЯ НАЦЕНКА' &&
  Math.abs(d31i.reduce((t, r) => t + r.sum, 0) - 428.5) < 1e-6,
  '… while the lines added by hand in a unit that is not money are read, and the materials add up to their «ИТОГО» (428,5)');

/* 32 — a share of a cost under the haulage band: «Перевозка материалов - 5 % от стоимости» priced 0,05, its «quantity» the
        cost it is a share of, with the «тн/км» of the lines above it typed beside it: a money line, not a resource of
        0,05 a т·км (it was offered a market price); a material named with a percentage keeps its own price */
const e32 = (unit) => one({ sheets: [sheet('3', [...TOP, HEAD, [1, 2, 3, 4, 5, 6],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'М3', 20, 150, 3000],
  [2, 'ТЕСТОВЫЙ РАСТВОР 5 %', 'М3', 2, 400, 800],
  ['ИТОГО ПО МАТЕРИАЛАМ', null, 'СУМ', null, null, 3800],
  ['ПЕРЕВОЗКА СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ'],
  [1, 'ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', 'тн/км', 150, 9, 1350],
  [2, 'Перевозка материалов - 5 % от стоимости', unit, 800, 0.05, 40],
  ['ИТОГО ПО ПЕРЕВОЗКЕ', null, 'СУМ', null, null, 1390]])] });
const e32r = ['тн/км', 'тн-км', 'СУМ'].map((u) => {
  const o = e32(u), rows = o.length ? o[0].rows : [];
  return { items: rows.filter((r) => r.kind === 'item').map((r) => r.nm), share: rows.find((r) => /% от стоимости/.test(r.nm || '')) };
});
check(e32r.every((x) => x.share && x.share.kind === 'extra' && x.share.sum === 40 && !x.items.some((n) => /от стоимости/.test(n))),
  'a share of a cost («5 % от стоимости» at 0,05) is a money line whatever its unit — тн/км, тн-км, СУМ (' + e32r.map((x) => x.share && x.share.kind).join(', ') + ')');
check(e32r[0].items.join('|') === 'ТЕСТОВЫЙ ЩЕБЕНЬ|ТЕСТОВЫЙ РАСТВОР 5 %|Перевозка ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км',
  '… while a material named with a percentage, priced as a material, is a resource, and so is the haulage line (' + e32r[0].items.join(' | ') + ')');

/* 33 — a book shown with its summary statement of resources («Ресурс»), each line the quantity of a resource summed over
        some of the object sheets: not read — read with them it counted every resource twice; an object that only shares
        the resources of the others, with quantities of its own, is read */
const e33res = Array.from({ length: 12 }, (x, i) => ['ТЕСТОВЫЙ РЕСУРС ' + 'АБВГДЕЖЗИКЛМ'[i], i % 3 ? 'М3' : 'ШТ', 10 + 5 * i]);
const e33sheet = (name, qty) => {
  const lines = e33res.map((r, i) => [i + 1, r[0], r[1], qty(i + 1), r[2], qty(i + 1) * r[2]]);
  return sheet(name, [...TOP, HEAD, [1, 2, 3, 4, 5, 6], ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], ...lines,
    ['ИТОГО ПО МАТЕРИАЛАМ', null, 'СУМ', null, null, lines.reduce((t, l) => t + l[5], 0)]]);
};
const e33a = (i) => i, e33b = (i) => 2 * i + 1, e33c = () => 3, e33d = (i) => 5 * i - 2;
const e33left = [];
const e33 = S.smeta.parseWorkbook({ sheets: [e33sheet('1', e33a), e33sheet('2', e33b), e33sheet('3', e33c),
  e33sheet('Ресурс', (i) => e33a(i) + e33b(i))] }, 'a.xlsx', e33left);
check(e33.map((o) => o.name).join() === '1,2,3' && JSON.stringify(e33left) === '[{"name":"Ресурс","of":["1","2"]}]',
  'the summary sheet that adds up sheets 1 and 2 is not read, and said (' + e33.map((o) => o.name).join() + ' ' + JSON.stringify(e33left) + ')');
const e33own = [];
const e33o = S.smeta.parseWorkbook({ sheets: [e33sheet('1', e33a), e33sheet('2', e33b), e33sheet('3', e33c), e33sheet('4', e33d)] }, 'a.xlsx', e33own);
check(e33o.length === 4 && e33own.length === 0, '… four objects with the same resources and quantities of their own are all read (' + e33o.length + ')');
const e33two = one({ sheets: [e33sheet('1', e33a), e33sheet('Ресурс', e33a)] });
check(e33two.length === 2, '… and a book of two sheets is read as it was: a summary of one object is no summary (' + e33two.length + ')');

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
