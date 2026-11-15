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

/* 11 — a band whose title begins like a haulage word but is a resource band */
const eq = one({ sheets: [sheet('РЕСУРС', [
  ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'],
  [1, 2, 3, 4, 5, 6],
  ['ТРАНСПОРТНОЕ ОБОРУДОВАНИЕ'],
  [1, 'ЛИФТ ТЕСТОВЫЙ ПАССАЖИРСКИЙ', 'ШТ', 1, 1000, 1000]
])] });
const ei = eq.length ? eq[0].rows.filter((r) => r.kind === 'item') : [];
check(ei.length === 1 && ei[0].nm === 'ЛИФТ ТЕСТОВЫЙ ПАССАЖИРСКИЙ' && ei[0].section === 'equipment', '«ТРАНСПОРТНОЕ ОБОРУДОВАНИЕ» is equipment: its lines are not renamed as haulage');

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

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
