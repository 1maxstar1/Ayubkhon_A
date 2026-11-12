/*
 * Invented estimates, large enough for the tests that used to need a real one.
 *
 *   node test/synth.cjs <out1.xlsx> [<out2.xlsx>]
 *   require('./synth.cjs').write(S, path, which)      // which: 1 or 2
 *
 * The tests of the whole program — the pipeline, the page in a browser, the workspace on the server, the hints
 * between applications — were written against the owner's estimates, which are not in the repository and never
 * will be. Without them those tests were skipped, so on any machine but one the suite said nothing about the
 * larger half of the program.
 *
 * These workbooks are made here, from nothing: form 4А, one sheet, several local estimates, the four bands,
 * totals that add up. Every name is put together from a noun, the word «ТЕСТОВЫЙ» and a size; every quantity
 * and price is arithmetic on the line's number. The second workbook shares most resources with the first, some
 * at another price — as two estimates of one builder do. Nothing in them comes from a real document.
 */
'use strict';
const fs = require('node:fs');
// the layout of a local estimate is drawn from the one place the tiny estimates of the compare tests come from
const { xlsx, sheet, estimate, line } = require('./compare-books.cjs');

const MATERIALS = [
  ['ТРУБА ПОЛИЭТИЛЕНОВАЯ ТЕСТОВАЯ НАПОРНАЯ ДИАМЕТРОМ', 'ММ', 'М'],
  ['КАБЕЛЬ МЕДНЫЙ ТЕСТОВЫЙ СИЛОВОЙ СЕЧЕНИЕМ', 'ММ2', 'М'],
  ['АРМАТУРА СТАЛЬНАЯ ТЕСТОВАЯ ПЕРИОДИЧЕСКОГО ПРОФИЛЯ ДИАМЕТРОМ', 'ММ', 'Т'],
  ['ЛИСТ СТАЛЬНОЙ ТЕСТОВЫЙ ГОРЯЧЕКАТАНЫЙ ТОЛЩИНОЙ', 'ММ', 'Т'],
  ['ДОСКА ОБРЕЗНАЯ ТЕСТОВАЯ ХВОЙНЫХ ПОРОД ТОЛЩИНОЙ', 'ММ', 'М3'],
  ['УГОЛОК СТАЛЬНОЙ ТЕСТОВЫЙ РАВНОПОЛОЧНЫЙ ШИРИНОЙ ПОЛКИ', 'ММ', 'Т'],
  ['ЭЛЕКТРОДЫ ТЕСТОВЫЕ ДЛЯ РУЧНОЙ СВАРКИ ДИАМЕТРОМ', 'ММ', 'КГ'],
  ['ГВОЗДИ ТЕСТОВЫЕ СТРОИТЕЛЬНЫЕ ДЛИНОЙ', 'ММ', 'КГ'],
  ['ЩЕБЕНЬ ТЕСТОВЫЙ ИЗ ПРИРОДНОГО КАМНЯ ФРАКЦИИ ДО', 'ММ', 'М3'],
  ['СТЕКЛО ОКОННОЕ ТЕСТОВОЕ ЛИСТОВОЕ ТОЛЩИНОЙ', 'ММ', 'М2'],
  ['ПЛИТКА КЕРАМИЧЕСКАЯ ТЕСТОВАЯ ДЛЯ ПОЛОВ СО СТОРОНОЙ', 'СМ', 'М2'],
  ['ПРОВОД АЛЮМИНИЕВЫЙ ТЕСТОВЫЙ УСТАНОВОЧНЫЙ СЕЧЕНИЕМ', 'ММ2', 'М']
];
const SIZES = [16, 20, 25, 32, 40, 50, 63];
// three cranes that differ by one number, first by the alphabet: a family of near names for the tests of «Похожие ресурсы»
const MACHINES = [
  'АВТОКРАН ТЕСТОВЫЙ СТРЕЛОВОЙ ГРУЗОПОДЪЁМНОСТЬЮ 10 Т', 'ЭКСКАВАТОР ТЕСТОВЫЙ ОДНОКОВШОВЫЙ 0,5 М3',
  'АВТОКРАН ТЕСТОВЫЙ СТРЕЛОВОЙ ГРУЗОПОДЪЁМНОСТЬЮ 16 Т', 'БУЛЬДОЗЕР ТЕСТОВЫЙ 79 КВТ',
  'АВТОКРАН ТЕСТОВЫЙ СТРЕЛОВОЙ ГРУЗОПОДЪЁМНОСТЬЮ 25 Т', 'АВТОМОБИЛЬ ТЕСТОВЫЙ БОРТОВОЙ ДО 5 Т',
  'АГРЕГАТ ТЕСТОВЫЙ СВАРОЧНЫЙ ПЕРЕДВИЖНОЙ', 'КОМПРЕССОР ТЕСТОВЫЙ ПЕРЕДВИЖНОЙ 5 М3/МИН'
];
const EQUIPMENT = ['ЩИТ ТЕСТОВЫЙ РАСПРЕДЕЛИТЕЛЬНЫЙ', 'НАСОС ТЕСТОВЫЙ ЦЕНТРОБЕЖНЫЙ', 'ВЕНТИЛЯТОР ТЕСТОВЫЙ КРЫШНЫЙ'];
const WORKS = ['ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ', 'ВОДОПРОВОД И КАНАЛИЗАЦИЯ', 'ЭЛЕКТРОМОНТАЖНЫЕ РАБОТЫ', 'ОТОПЛЕНИЕ И ВЕНТИЛЯЦИЯ',
  'НАРУЖНЫЕ СЕТИ', 'БЛАГОУСТРОЙСТВО'];

/** Every material of the catalogue: its name, unit and a price that is arithmetic on its place in it. */
function catalogue() {
  const out = [];
  MATERIALS.forEach((m, a) => SIZES.forEach((size, b) => {
    out.push({ name: m[0] + ' ' + size + ' ' + m[1], unit: m[2], price: 1100 + (a * 7 + b) * 130 + size });
  }));
  return out;
}

/**
 * One workbook. `which` 1: six local estimates; 2: five, sharing most resources with the first — every seventh
 * of them at another price, as a second estimate of the same builder has them.
 */
function book(which) {
  const cat = catalogue();
  const n = which === 2 ? 5 : 6;
  const all = [[null, null, null, null, null, 'Форма 4А АВС-4'], ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА № ' + which], []];
  for (let e = 0; e < n; e++) {
    const body = [];
    let direct = 0;
    const band = (title, lines) => {
      if (!lines.length) return;
      let sum = 0;
      body.push([null, null, title]);
      lines.forEach((l, i) => { const row = line(i + 1, l.name, l.unit, l.qty, l.price); sum += row[6]; body.push(row); });
      body.push([null, null, 'ИТОГО ' + title, 'СУМ', null, null, sum]);
      direct += sum;
    };
    band('ТРУДОВЫЕ РЕСУРСЫ', [
      { name: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', unit: 'ЧЕЛ.-Ч', qty: 40 + e * 6, price: 31 },
      { name: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', unit: 'ЧЕЛ.-Ч', qty: 8 + e, price: 33 }
    ]);
    band('СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ', MACHINES.filter((m, i) => (i + e) % 2 === 0)
      .map((m, i) => ({ name: m, unit: 'МАШ.-Ч', qty: 2 + i + e, price: 1500 + MACHINES.indexOf(m) * 210 })));
    // each estimate takes a different stretch of the catalogue, overlapping its neighbours
    const mats = [];
    for (let i = 0; i < 26; i++) {
      const at = (e * 11 + i * (which === 2 ? 3 : 2) + (which === 2 ? 5 : 0)) % cat.length;
      const m = cat[at];
      if (mats.some((x) => x.name === m.name)) continue;
      const other = which === 2 && at % 7 === 0;
      mats.push({ name: m.name, unit: m.unit, qty: 1 + ((at * 3 + e) % 9), price: other ? m.price + 90 : m.price });
    }
    band('СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', mats);
    if (e % 3 === 2) band('ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ', [{ name: EQUIPMENT[(e + which) % EQUIPMENT.length], unit: 'ШТ', qty: 1 + (e % 2), price: 2900 + e * 100 }]);
    const est = estimate(WORKS[e % WORKS.length], body, { no: e + 1, object: 'ТЕСТОВЫЙ ОБЪЕКТ ' + (e + 1), direct });
    if (e > 0) est[0] = [];
    all.push(...est);
  }
  return { sheets: [sheet('РА', all)] };
}

/** Write workbook `which` to `path` through the program's own writer. */
function write(S, path, which) {
  fs.writeFileSync(path, xlsx(S, book(which)));
  return path;
}

module.exports = { book, write, catalogue };

if (require.main === module) {
  const { load } = require('./load.cjs');
  const S = load(load.PIPELINE);
  const out = process.argv.slice(2);
  if (!out.length) { console.error('usage: node test/synth.cjs <out1.xlsx> [<out2.xlsx>]'); process.exit(1); }
  out.forEach((p, i) => { write(S, p, i + 1); console.log('written ' + p); });
}
