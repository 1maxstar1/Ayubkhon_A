/*
 * The local resource estimate of form 4А (АВС-4).
 *
 * That export puts many local estimates on one sheet, one after another, each
 * under its own title block: «ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ № …», «на …»,
 * «Наименование объекта - …». Its header has a «Шифр ресурсов» column between
 * № and the name, says «Количество единиц», and splits «Сметная стоимость» on
 * the next row into «на единицу» and «общая». Its bands are written in the
 * name column, and next to the numbered resources it carries lines that hold a
 * quantity but are not resources: «В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ …» under a
 * machine, and «ЗАТРАТЫ ТРУДА РАБОЧИХ» after the bands. A file like that used
 * to give «листы ресурсов не найдены».
 *
 * The sheet below is invented — names, numbers and prices — and built as the
 * parser sees a sheet (rows of cells), so no real estimate is needed.
 *
 *   node test/smeta-form4a.cjs
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

function estimate(no, works, object, rows) {
  return [
    [null, null, ' ЛОКАЛЬНЫЙ   РЕСУРСНЫЙ   СМЕТНЫЙ   РАСЧЕТ', no],
    [null, null, '(локальная смета)'],
    [],
    [null, 'на', works],
    ['Наименование объекта -', null, object],
    ['Основание:', null, 'ЧЕРТЕЖИ'],
    [],
    ['№ п/п', 'Шифр ресурсов', 'Наименование ресурсов, оборудования, конструкций, изделий и  деталей',
      'Единица измерения', 'Количество единиц', 'Сметная стоимость'],
    [null, null, null, null, null, 'на единицу', 'общая'],
    [1, 2, 3, 4, 5, 6, 7],
    ...rows,
    [],
    [null, 'СОСТАВИЛ', null, 'ИВАНОВ И.И.'],
    [], []
  ];
}

const first = estimate('№ 01-01-01', 'ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ', 'ТЕСТОВЫЙ МОСТ', [
  [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', 'АВС 000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 10, 11, 110],
  ['2', 'АВС 000003', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ.-Ч', 2, 0, '(0)'],
  [null, null, 'ИТОГО ТРУДОВЫЕ РЕСУРСЫ', 'СУМ', null, null, 110],
  [null, null, 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ.-Ч', 10],
  [],
  [null, null, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
  ['1', '111 С', 'ТЕСТОВЫЙ КРАН 10 Т', 'МАШ.-Ч', 2, 13, 26],
  [null, null, 'В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ, ЭКИПАЖ 1 ЧЕЛ.', 'ЧЕЛ.-Ч', 2, '--', '--'],
  [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ', 'СУМ', null, null, 26],
  [],
  [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  ['1', '222 С', 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 4, 17, 68],
  ['2', '223 С', 'ТЕСТОВЫЙ АНКЕР М8', 'ШТ', 3, 19, 57],
  [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, 125],
  [],
  [null, null, 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ.-Ч', 10],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 261]
]);
// the second estimate has no «ЛОКАЛЬНЫЙ … №» line, only «на …», as in the field
const second = estimate(null, 'ТЕСТОВОЕ ОБОРУДОВАНИЕ', 'ТЕСТОВЫЙ ЛИФТ', [
  [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
  [1, 'АВС 000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 5, 11, '=E1*F1'],
  [null, null, 'ИТОГО ТРУДОВЫЕ РЕСУРСЫ', 'СУМ', null, null, 55],
  [],
  [null, null, 'ОБОРУДОВАНИЕ, МЕБЕЛЬ И ИНВЕНТАРЬ (ПОСТАВКА ПОДРЯДЧИКА)'],
  [1, null, 'ТЕСТОВЫЙ ЩИТ', 'ШТ', 1, 29, 29],
  [null, null, 'ИТОГО ОБОРУДОВАНИЕ, МЕБЕЛЬ И ИНВЕНТАРЬ', 'СУМ', null, null, 29],
  [],
  [null, null, 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ.-Ч', 5],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 84]
]);
second[0] = [];

const lines = [
  [null, null, null, null, null, 'Форма 4А АВС-4'],
  ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'],
  [],
  ...first,
  ...second
];
const wb = { sheets: [sheet('РА', lines)] };

const objs = S.smeta.parseWorkbook(wb, 'test.xlsx');
check(objs.length === 2, 'two local estimates on one sheet are two objects (' + objs.length + ')');
if (objs.length !== 2) { console.log('\nFAILED: the sheet was not read as two estimates'); process.exit(1); }
check(objs.map((o) => o.name).join('|') === 'РА · 1|РА · 2', 'named by the sheet and their order (' + objs.map((o) => o.name).join('|') + ')');
check(objs.every((o) => o.title === 'ТЕСТОВАЯ СТРОЙКА'), 'the project title is «Наименование стройки», not «Форма 4А АВС-4»');
check(objs[0].subtitle === '№ 01-01-01 — ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ — ТЕСТОВЫЙ МОСТ', 'the object is the estimate number, its works and its object (' + objs[0].subtitle + ')');
check(objs[1].subtitle === 'ТЕСТОВОЕ ОБОРУДОВАНИЕ — ТЕСТОВЫЙ ЛИФТ', 'an estimate without a number line still has its title (' + objs[1].subtitle + ')');

const items = (o) => o.rows.filter((r) => r.kind === 'item');
const a = items(objs[0]), b = items(objs[1]);
check(a.length === 5 && b.length === 2, 'every numbered line is a resource, and only those (' + a.length + ', ' + b.length + ')');
check(a.map((r) => r.section).join(',') === 'labor,labor,machines,materials,materials', 'bands written in the name column set the section (' + a.map((r) => r.section) + ')');
check(b[1].section === 'equipment', 'equipment band');
check(!objs[0].rows.some((r) => r.kind === 'item' && /В Т\.Ч\.|^ЗАТРАТЫ ТРУДА РАБОЧИХ$/.test(r.nm)), '«В Т.Ч. …» and «ЗАТРАТЫ ТРУДА РАБОЧИХ» are not resources');
check(a[2].nm === 'ТЕСТОВЫЙ КРАН 10 Т' && a[2].qty === 2 && a[2].price === 13 && a[2].unit === 'МАШ.-Ч', 'name, unit, quantity and price come from their own columns, not from «Шифр»');
check(a[0].no === 1, 'the number column is «№ п/п», not the code beside it');
check(objs[0].rows.filter((r) => r.kind === 'header').length === 2, 'both header lines are header rows');
check(!objs[0].rows.some((r) => /СОСТАВИЛ|ЛОКАЛЬНЫЙ/.test(S.nameKey(String((r.cells[2] && r.cells[2].v) || '') + ' ' + r.nm))),
  'an estimate ends at its last ИТОГО: the signature and the next title block stay out');
check(a[3].nm !== a[4].nm, 'М5 and М8 stay two resources');

// assembled: the code column is left out, numbering reads 1..6, both header lines labelled on the market side
const asm = S.assemble([{ id: 'p1', title: objs[0].title, objects: objs }], {});
const item = asm.rows.find((r) => r.kind === 'item' && r.nm === 'ТЕСТОВЫЙ КРАН 10 Т');
check(item && item.cells[2].v === '1' && item.cells[3].v === 'ТЕСТОВЫЙ КРАН 10 Т', 'in the table № holds the line number, not the code «111 С»');
check(!asm.rows.some((r) => Object.keys(r.cells).some((k) => r.cells[k] && /^(111 С|222 С|АВС 000001)$/.test(String(r.cells[k].v)))), 'no code value is copied anywhere');
const num = asm.rows.find((r) => r.kind === 'numbering');
check(num && [2, 3, 4, 5, 6, 7].map((c) => num.cells[c].v).join(' ') === '1 2 3 4 5 6', 'the numbering row counts 1..6 (' + (num && [2, 3, 4, 5, 6, 7].map((c) => num.cells[c] && num.cells[c].v).join(' ')) + ')');
const sub = asm.rows.find((r) => r.kind === 'header' && r.cells[6] && r.cells[6].v === 'на единицу');
check(sub && sub.cells[8].v === 'на единицу' && sub.cells[9].v === 'общая', 'the second header line is mirrored on the market side');
check(asm.resources.length === 6, 'resources by name, unit and price across both estimates (' + asm.resources.length + ')');
const labour = asm.resources.find((r) => r.name === 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ');
check(labour && labour.count === 2 && labour.qty === 15, 'one resource in two estimates is one line with both quantities');

// the report: equipment is always listed, with the note asking for parameters and two offers
const NOTE = 'Для полноценного изучения стоимости данного оборудования необходимо представить ' +
  'дополнительные технические параметры, а также обосновать цену оборудования не менее чем ' +
  'двумя коммерческими предложениями.';
const C = S.report.cols;
const repItems = (rep) => rep.rows.filter((r) => r.kind === 'item');
const plain = repItems(S.report.build(asm, asm.spans[0], { mode: 'changed', autoNote: true, noteText: 'X' }));
check(plain.length === 0, 'without the equipment note an unchanged project lists nothing («changed» mode)');
// the synthetic shield costs 29: above a threshold of 20, below the default threshold
for (const mode of ['changed', 'dedup', 'full']) {
  const rep = repItems(S.report.build(asm, asm.spans[0], { mode, autoNote: true, noteText: 'X', equipNote: NOTE, equipLimit: 20 }));
  const eq = rep.filter((r) => r.section === 'equipment');
  check(eq.length === 1 && eq[0].nm === 'ТЕСТОВЫЙ ЩИТ' && eq[0].cells[C.NOTE] && eq[0].cells[C.NOTE].v === NOTE,
    mode + ': the equipment line is listed with its note');
  check(rep.filter((r) => r.section !== 'equipment').every((r) => !r.cells[C.NOTE] || r.cells[C.NOTE].v !== NOTE),
    mode + ': no other line gets the equipment note');
}
// a re-priced equipment line still carries the equipment note, not the generic one
const key = asm.resources.find((r) => r.name === 'ТЕСТОВЫЙ ЩИТ').key;
const asm3 = S.assemble([{ id: 'p1', title: objs[0].title, objects: objs }], { [key]: 31 });
const moved = repItems(S.report.build(asm3, asm3.spans[0], { mode: 'changed', autoNote: true, noteText: 'X', equipNote: NOTE, equipLimit: 20 }));
check(moved.length === 1 && moved[0].cells[C.NOTE].v === NOTE && moved[0].market === 31, 'a re-priced equipment line keeps the equipment note');

// only equipment whose smeta amount is above the threshold: the default one unless set
const under = repItems(S.report.build(asm, asm.spans[0], { mode: 'changed', autoNote: true, noteText: 'X', equipNote: NOTE }));
check(under.length === 0, 'equipment at or under the default threshold is not added (amount 29)');
const atLimit = repItems(S.report.build(asm, asm.spans[0], { mode: 'changed', autoNote: true, noteText: 'X', equipNote: NOTE, equipLimit: 29 }));
check(atLimit.length === 0, 'the amount has to be above the threshold, not equal to it');
const fullUnder = repItems(S.report.build(asm, asm.spans[0], { mode: 'full', autoNote: true, noteText: 'X', equipNote: NOTE }));
check(fullUnder.every((r) => !r.cells[C.NOTE] || r.cells[C.NOTE].v !== NOTE), 'full mode: no note on equipment under the threshold');
const movedUnder = repItems(S.report.build(asm3, asm3.spans[0], { mode: 'changed', autoNote: true, noteText: 'X', equipNote: NOTE }));
check(movedUnder.length === 1 && movedUnder[0].cells[C.NOTE].v === 'X', 're-priced equipment under the threshold gets the usual note');

// the band may be written «Jihozlar», «Жиҳозлар» or «Жихозлар»
for (const t of ['ОБОРУДОВАНИЕ, МЕБЕЛЬ И ИНВЕНТАРЬ (ПОСТАВКА ПОДРЯДЧИКА)', 'Jihozlar', 'ЖИҲОЗЛАР', 'Жихозлар'])
  check(S.smeta.sectionOf(t) === 'equipment', '«' + t + '» is an equipment band');

console.log(fail ? `\nFAILED (${fail})` : '\nsmeta-form4a OK');
process.exit(fail ? 1 : 0);
