/*
 * Work volumes (src/lib/volumes.js): the local resource statement of form 5, the «объем» sheet of a reply, and
 * «Сопоставительная таблица №1».
 *
 * Held here:
 *   - the works of form 5 are read with their volume, section and resources (per unit and in all); the numbering
 *     row and the summary after «ИТОГО ПО ЛОКАЛЬНОЙ…» are not works;
 *   - the same file read twice gives the same keys; two files that hold an identical work keep them apart;
 *   - a reply line finds its work by name and unit, and by the estimate's volume when several share them; the
 *     project's volume is kept only when it differs; a remark alone is kept;
 *   - a new volume moves each resource of the work by per unit × (new − old), and nothing else;
 *   - the table holds only what was decided, then the resources whose total was set by hand.
 *
 * Names and numbers are invented.
 *
 *   node test/volumes.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load('normalize', 'match', 'sections', 'util', 'formula', 'smeta', 'assemble', 'volumes');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

function sheet(name, lines) {
  const rows = [];
  lines.forEach((line, i) => {
    const cells = [];
    line.forEach((v, c) => { if (v != null) cells[c + 1] = { v }; });
    rows[i + 1] = cells;
  });
  return { name, rows };
}

const NOTE = S.volumes.NOTE;

/* ------------------------------------------------------------------ form 5 */
const lrv = sheet('01_ЛРВ', [
  ['Строительство склада'],
  ['(наименование стройки)'],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ', '№ 01-01'],
  ['на', 'Общестроительные работы'],
  [],
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество'],
  [null, null, null, null, 'на ед. измерения', 'по проектным данным'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ 1. Земляные работы'],
  [1, 'Е01-001-01', 'Разработка грунта экскаватором', '1000 м3', 0.4],
  ['1.1', '1', 'Затраты труда рабочих', 'чел.-ч', 12, 4.8],
  ['1.2', '2', 'Экскаватор 0,5 м3', 'маш.-ч', 20, 8],
  [2, 'Е01-002-01', 'Засыпка траншей', '100 м3', 2.5],
  ['2.1', '1', 'Затраты труда рабочих', 'чел.-ч', 3, 7.5],
  ['РАЗДЕЛ 2. Фундаменты'],
  [3, 'Е06-001-01', 'Устройство бетонной подготовки', '100 м3', 0.2],
  ['3.1', '1', 'Затраты труда рабочих', 'чел.-ч', 150, 30],
  ['3.2', '4', 'Бетон тяжелый В7,5', 'м3', 102, 20.4],
  [4, 'Е06-001-01', 'Устройство бетонной подготовки', '100 м3', 0.1],
  ['4.1', '1', 'Затраты труда рабочих', 'чел.-ч', 150, 15],
  ['4.2', '4', 'Бетон тяжелый В7,5', 'м3', 102, 10.2],
  ['ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ:'],
  [1, '1', 'Затраты труда рабочих', 'чел.-ч', null, 57.3],
]);

const st = S.volumes.parseSheet(lrv);
check(!!st && st.works.length === 4, 'form 5: four works, the numbering row and the summary are not works');
check(st && st.number === '№ 01-01' && st.work === 'Общестроительные работы', 'form 5: its number and what it is for');
const w1 = st && st.works[0];
check(w1 && w1.no === '1' && w1.code === 'Е01-001-01' && w1.unit === '1000 м3' && near(w1.volume, 0.4) &&
  w1.section === 'РАЗДЕЛ 1. Земляные работы', 'form 5: a work with its code, unit, volume and section');
check(w1 && w1.resources.length === 2 && near(w1.resources[1].norm, 20) && near(w1.resources[1].qty, 8),
  'form 5: its resources, per unit and in all');
check(st && st.works[2].section === 'РАЗДЕЛ 2. Фундаменты', 'form 5: the next section');
check(S.volumes.parseSheet(sheet('РЕСУРС', [['НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА'], ['Бетон', 'м3', 3, 5]])) === null,
  'a resource sheet is not form 5');

/* ------------------------------------------------------------------ keys */
const a = S.volumes.list([st], 'a.xlsx'), a2 = S.volumes.list([S.volumes.parseSheet(lrv)], 'a.xlsx');
check(a.map((w) => w.key).join() === a2.map((w) => w.key).join(), 'keys: the same file read again gives the same keys');
check(new Set(S.volumes.list([st, st], 'a.xlsx').map((w) => w.key)).size === 8, 'keys: two identical works (same name, code, volume) are not one');
check(a[2].key !== a[3].key && a[2].volume !== a[3].volume, 'keys: same name and code, other volume — other key');
const b = S.volumes.list([st], 'b.xlsx');
check(!a.some((w) => b.some((x) => x.key === w.key)), 'keys: the same work in another file is another work');

/* ------------------------------------------------------------------ reply */
const reply = { sheets: [
  sheet('цены', [['№', 'Наименование', 'Ед. изм.', 'Цена по смете', 'Рыночная цена'], [1, 'Бетон тяжелый В7,5', 'м3', 9, 7]]),
  sheet('объем', [
    ['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №1'],
    ['№ п/п', 'Наименование работ и затрат', 'Ед.изм.', 'Объемы работ', null, 'Примечание'],
    [null, null, null, 'по локальной ресурсной смете', 'по рабочему проекту'],
    [1, 2, 3, 4, 5, 6],
    ['РАЗДЕЛ 1. Земляные работы'],
    [1, 'Разработка грунта экскаватором', '1000 м3', 0.4, 0.3, 'по рабочему проекту'],
    [2, 'Засыпка траншей', '100 м3', 2.5, null, NOTE],
    [3, 'Устройство бетонной подготовки', '100 м3', 0.1, 0.1, NOTE],
    [4, 'Устройство кровли', '100 м2', 1, null, NOTE],
  ]),
] };
const rp = S.volumes.parseReply(reply);
check(rp && rp.sheet === 'объем' && rp.entries.length === 4, 'reply: the «объем» sheet, four lines (section and numbering are not lines)');
check(rp && near(rp.entries[0].project, 0.3) && rp.entries[0].note === 'по рабочему проекту', 'reply: the project volume and the remark');
const m = S.volumes.match(rp.entries, a);
check(m.found.length === 3 && m.missing.length === 1 && m.missing[0].name === 'Устройство кровли', 'reply: three found, the one not in the estimate is said');
check(m.set[a[0].key] && near(m.set[a[0].key].v, 0.3), 'reply: a new volume');
check(m.set[a[1].key] && m.set[a[1].key].v == null && m.set[a[1].key].note === NOTE, 'reply: a remark alone');
check(m.set[a[3].key] && !m.set[a[2].key] && m.set[a[3].key].v == null, 'reply: of two works of one name, the one of that volume; the same volume is no change');

// a reply made from an earlier one: its «объем» sheet still names the earlier object, the prices name this one
const titled = (obj) => ({ name: 'объем', rows: [null, [null, { v: ' объёмов работ рабочего проекта с локальной ресурсной ведомостью по объекту: ' + obj }], ...reply.sheets[1].rows.slice(1)] });
const pricesBy = (line) => ({ name: 'цены', rows: [null, [null, { v: 'СРАВНИТЕЛЬНАЯ ТАБЛИЦА №2' }], [null, { v: line }], [], [null, { v: '№ п/п' }, { v: 'Наименование ресурса' }]] });
check(S.volumes.titleObject(titled('«ТЕСТОВАЯ ДОРОГА 1-2 КМ»').rows) === '«ТЕСТОВАЯ ДОРОГА 1-2 КМ»' &&
  S.volumes.titleObject(pricesBy('ТЕСТОВЫЙ МОСТ НА 7 КМ').rows) === 'ТЕСТОВЫЙ МОСТ НА 7 КМ' &&
  S.volumes.titleObject(pricesBy('по итогам изучения ценовых параметров … по объекту: ТЕСТОВЫЙ МОСТ').rows) === 'ТЕСТОВЫЙ МОСТ',
  'reply: the object a title names — after «по объекту:», or the line under «ТАБЛИЦА №2»');
const foreign = S.volumes.parseReply({ sheets: [titled('«ТЕСТОВАЯ ДОРОГА 1-2 КМ»'), pricesBy('ТЕСТОВЫЙ МОСТ НА 7 КМ')] });
const own2 = S.volumes.parseReply({ sheets: [titled('«ТЕСТОВЫЙ МОСТ НА 7 КМ»'), pricesBy('по итогам … по объекту: ТЕСТОВЫЙ МОСТ НА 7 КМ')] });
const bare = S.volumes.parseReply({ sheets: [titled('«ТЕСТОВАЯ ДОРОГА 1-2 КМ»')] });
check(foreign.other === true && own2.other === false && bare.other === false && foreign.entries.length === 4,
  'reply: a «объем» sheet naming another object than the prices is told apart (the page then reads only the prices); the same object, or no prices sheet, is not');

/* ------------------------------------------------------------------ quantities */
const d = S.volumes.deltas(a, m.set);
const labour = S.nameUnitKey('Затраты труда рабочих', 'чел.-ч'), exc = S.nameUnitKey('Экскаватор 0,5 м3', 'маш.-ч');
check(near(d[exc], 20 * (0.3 - 0.4)) && near(d[labour], 12 * (0.3 - 0.4)), 'quantities: per unit × (new − old)');
check(Object.keys(d).length === 2, 'quantities: a remark without a volume moves nothing');
check(Object.keys(S.volumes.deltas(a, {})).length === 0, 'quantities: nothing decided — nothing moves');

/* ------------------------------------------------------------------ table */
const empty = S.volumes.table(a, {}, [], {});
check(empty.count === 0, 'table: nothing decided — no table');
const t = S.volumes.table(a, m.set, [{ name: 'Бетон тяжелый В7,5', unit: 'м3', smeta: 30.6, expert: 25 }], { object: 'Склад' });
const items = t.rows.filter((r) => r.kind === 'vitem');
check(t.count === 4 && items.length === 4, 'table: three works and one resource');
check(items[0].cells[2].v === 'Разработка грунта экскаватором' && near(items[0].cells[4].v, 0.4) && near(items[0].cells[5].v, 0.3),
  'table: the estimate volume beside the project volume');
check(items[1].cells[5] == null && items[1].cells[6].v === NOTE, 'table: a remark without a volume');
check(t.rows.some((r) => r.kind === 'vsection' && r.cells[2].v === 'Количество ресурсов') && near(items[3].cells[5].v, 25),
  'table: the resources set by hand, under their own heading');
check(t.rows.filter((r) => r.kind === 'vsection').map((r) => r.cells[2].v).join('|') ===
  'РАЗДЕЛ 1. Земляные работы|РАЗДЕЛ 2. Фундаменты|Количество ресурсов', 'table: by section');

// our own document read back as «Наш ответ»: the works come back, the resources after them are not works
const own = { name: 'Таблица №1 (объёмы)', rows: [] };
t.rows.forEach((r, i) => { const cells = []; Object.keys(r.cells).forEach((c) => { cells[+c] = r.cells[c]; }); own.rows[i + 1] = cells; });
const back = S.volumes.parseReply({ sheets: [own] });
const mb = back && S.volumes.match(back.entries, a);
check(back && back.entries.length === 3 && mb.found.length === 3 && JSON.stringify(mb.set) === JSON.stringify(m.set),
  'our own table read back gives the same decisions (' + (back && back.entries.length) + ' lines)');

// a work given to one reply line is not given to another: the extra line is missing, the first decision stands
const twice = S.volumes.match([
  { name: 'Разработка грунта экскаватором', unit: '1000 м3', smeta: 0.4, project: 0.3, note: 'a' },
  { name: 'Разработка грунта экскаватором', unit: '1000 м3', smeta: 0.4, project: 0.35, note: 'b' }
], a);
check(twice.found.length === 1 && twice.missing.length === 1 && near(twice.set[a[0].key].v, 0.3) && twice.set[a[0].key].note === 'a',
  'reply: a work already given to a line is not given to a second one');

// works of two estimates: each under its own object; the intro names both
const two = S.volumes.list([st], 'a.xlsx').map((w) => Object.assign(w, { projectTitle: 'Склад' }))
  .concat(S.volumes.list([st], 'b.xlsx').map((w) => Object.assign(w, { projectTitle: 'Гараж' })));
const both = {}; both[two[0].key] = { v: null, note: NOTE }; both[two[4].key] = { v: 0.2, note: '' };
const t2 = S.volumes.table(two, both, [], { objects: ['Склад', 'Гараж'] });
const heads = t2.rows.filter((r) => r.kind === 'vsection').map((r) => r.cells[2].v);
check(heads.join('|') === 'Склад|РАЗДЕЛ 1. Земляные работы|Гараж|РАЗДЕЛ 1. Земляные работы', 'table: works of two estimates, each under its own object, sections afresh (' + heads.join('|') + ')');
check(/по объектам:\n«Склад», «Гараж»/.test(t2.rows.find((r) => r.kind === 'vintro').cells[1].v), 'table: the intro names both objects');
const t1 = S.volumes.table(two, { [two[0].key]: { v: null, note: NOTE } }, [], { objects: ['Склад'] });
check(!t1.rows.some((r) => r.kind === 'vsection' && r.cells[2].v === 'Склад') && /по объекту:\n«Склад»/.test(t1.rows.find((r) => r.kind === 'vintro').cells[1].v),
  'table: one estimate — no object heading, the intro names it');

// two files of one construction carry the same title: still two lists, each named by its own estimate
const twins = S.volumes.list([st], 'a.xlsx').map((w) => Object.assign(w, { projectTitle: 'Склад', project: 'Склад дорога' }))
  .concat(S.volumes.list([st], 'b.xlsx').map((w) => Object.assign(w, { projectTitle: 'Склад', project: 'Склад освещение' })));
const tw = {}; tw[twins[0].key] = { v: null, note: NOTE }; tw[twins[4].key] = { v: 0.2, note: '' };
const t3 = S.volumes.table(twins, tw, [], { objects: ['Склад'] });
const heads3 = t3.rows.filter((r) => r.kind === 'vsection').map((r) => r.cells[2].v);
check(heads3.join('|') === 'Склад — Склад дорога|РАЗДЕЛ 1. Земляные работы|Склад — Склад освещение|РАЗДЕЛ 1. Земляные работы',
  'table: two estimates with one title are still two lists, each under its own name (' + heads3.join('|') + ')');

/* ------------------------------------------------------- «Сравнение версий»: did the works' volumes change */
const lines = (fix) => {
  const src = [
    ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество'],
    [null, null, null, null, 'на ед. измерения', 'по проектным данным'],
    [1, 2, 3, 4, 5, 6],
    ['РАЗДЕЛ 1. Земляные работы'],
  ];
  fix.forEach(([no, code, name, unit, v]) => { src.push([no, code, name, unit, v]); src.push([no + '.1', '1', 'Затраты труда рабочих', 'чел.-ч', 3, 3 * v]); });
  return S.volumes.parseSheet(sheet('01_ЛРВ', src));
};
const W = [[1, 'Е01-001-01', 'Разработка грунта экскаватором', '1000 м3', 0.4], [2, 'Е01-002-01', 'Засыпка траншей', '100 м3', 2.5],
  [3, 'Е06-001-01', 'Устройство бетонной подготовки', '100 м3', 0.2], [4, 'Е06-001-01', 'Устройство бетонной подготовки', '100 м3', 0.1]];
const was = [lines(W)];
const c0 = S.volumes.changes(was, [lines(W)]);
check(c0.works === 4 && c0.same === 4 && !c0.up.length && !c0.down.length && !c0.gone.length && !c0.added.length,
  'changes: the same statement — every work the same, nothing up or down');
const c1 = S.volumes.changes(was, [lines([W[0], W[1], W[3], W[2]])]);
check(c1.same === 4 && !c1.up.length && !c1.down.length, 'changes: two works of one code and name swapped in order — still the same volumes');
const c2 = S.volumes.changes(was, [lines([[1, 'Е01-001-01', 'Разработка грунта экскаватором', '1000 м3', 0.3], W[1], W[2],
  [4, 'Е06-001-01', 'Устройство бетонной подготовки', '100 м3', 0.15], [5, 'Е11-001-01', 'Устройство покрытия', '100 м2', 1.2]])]);
check(c2.same === 2 && c2.up.length === 1 && near(c2.up[0].from, 0.1) && near(c2.up[0].to, 0.15) &&
  c2.down.length === 1 && c2.down[0].work.code === 'Е01-001-01' && near(c2.down[0].to, 0.3) &&
  c2.added.length === 1 && c2.added[0].code === 'Е11-001-01' && !c2.gone.length,
  'changes: one work of two with a code raised, another lowered, a new work added (the twin with the same volume stays the same)');
const c3 = S.volumes.changes(was, [lines([W[0], W[2], W[3]])]);
check(c3.same === 3 && c3.gone.length === 1 && c3.gone[0].name === 'Засыпка траншей' && c3.worksNew === 3, 'changes: a work taken out is gone');

console.log(fail ? fail + ' failed' : 'all ok');
process.exit(fail ? 1 : 0);
