/*
 * The two invented versions of one tiny smeta used by test/compare.cjs and test/e2e-compare.mjs,
 * and the market prices «our table» put on the first. Names, numbers and prices are made up.
 */
'use strict';

function sheet(name, lines) {
  const rows = [];
  lines.forEach((line, i) => {
    const cells = [];
    line.forEach((v, c) => { if (v != null) cells[c + 1] = { v }; });
    rows[i + 1] = cells;
  });
  return { name, rows };
}

function estimate(works, rows) {
  return [
    [null, null, ' ЛОКАЛЬНЫЙ   РЕСУРСНЫЙ   СМЕТНЫЙ   РАСЧЕТ', '№ 1'],
    [null, 'на', works],
    ['Наименование объекта -', null, 'ТЕСТОВЫЙ ОБЪЕКТ'],
    [],
    ['№ п/п', 'Шифр ресурсов', 'Наименование ресурсов, оборудования, конструкций, изделий и  деталей',
      'Единица измерения', 'Количество единиц', 'Сметная стоимость'],
    [null, null, null, null, null, 'на единицу', 'общая'],
    [1, 2, 3, 4, 5, 6, 7],
    ...rows,
    [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 1],
    [], []
  ];
}

const line = (no, nm, unit, qty, price) => [String(no), null, nm, unit, qty, price, qty * price];

/** The two versions. `v` picks what differs: 1 = as first sent, 2 = as returned. */
function book(v) {
  const first = estimate('ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ', [
    [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
    line(1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 10, 11),
    [null, null, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
    line(1, 'ТЕСТОВЫЙ КРАН 10 Т', 'МАШ.-Ч', 2, v === 1 ? 13 : 11),
    [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
    ...(v === 2 ? [line(0, 'ТЕСТОВЫЙ КЛЕЙ', 'КГ', 1, 9)] : []),         // inserted by the sender
    line(1, 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 4, v === 1 ? 17 : 15),
    line(2, 'ТЕСТОВЫЙ АНКЕР М8', 'ШТ', 3, v === 1 ? 19 : 18),
    line(3, 'ТЕСТОВЫЙ БОЛТ', 'ШТ', 2, v === 1 ? 7 : 8),
    line(4, 'ТЕСТОВЫЙ ГВОЗДЬ', 'КГ', 1, v === 1 ? 5 : 4),
    line(5, 'ТЕСТОВЫЙ ШУРУП', 'КГ', 1, v === 1 ? 3 : 4),
    line(6, 'ТЕСТОВАЯ ДОСКА', 'М3', v === 1 ? 4 : 6, 2),
    ...(v === 1 ? [line(7, 'ТЕСТОВЫЙ ДЮБЕЛЬ', 'ШТ', 5, 1)] : []),        // deleted by the sender
    line(8, 'ТЕСТОВЫЙ ЦЕМЕНТ', 'Т', 1, 23),
    line(9, v === 1 ? 'ТЕСТОВАЯ ПЛЁНКА' : 'ТЕСТОВАЯ ПЛЁНКА 0,2 ММ', 'М2', 2, 3),  // renamed by the sender
    // the band total: summed in the first version, typed over in the returned one (its lines sum to 188)
    [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, v === 1 ? 189 : 200],
    // an overhead whose percentage the sender changed
    [null, null, v === 1 ? 'ТРАНСПОРТНЫЕ УСЛУГИ=5%' : 'ТРАНСПОРТНЫЕ УСЛУГИ=7%', 'СУМ', null, null, v === 1 ? 9 : 13]
  ]);
  const second = estimate('ТЕСТОВОЕ ОБОРУДОВАНИЕ', [
    [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
    line(1, 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 2, 17),                            // left at the old price here
    [null, null, 'ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ'],
    line(1, 'ТЕСТОВЫЙ ЩИТ', 'ШТ', 1, 29)
  ]);
  second[0] = [];
  return { sheets: [sheet('РА', [[null, null, null, null, null, 'Форма 4А АВС-4'],
    ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...first, ...second])] };
}


/** Our market prices on the first version, keyed the way the program keys them. */
function prices(S) {
  const k = (nm, unit, p) => S.resKey(nm, unit, p);
  const prices = {};
  prices[k('ТЕСТОВЫЙ КРАН 10 Т', 'МАШ.-Ч', 13)] = 11;
  prices[k('ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17)] = 15;
  prices[k('ТЕСТОВЫЙ АНКЕР М8', 'ШТ', 19)] = 16;
  prices[k('ТЕСТОВЫЙ БОЛТ', 'ШТ', 7)] = 6;
  prices[k('ТЕСТОВЫЙ ГВОЗДЬ', 'КГ', 5)] = 4.5;      // 1 × 0.5 — under the threshold, so not in the table
  prices[k('ТЕСТОВЫЙ ДЮБЕЛЬ', 'ШТ', 1)] = 0.5;      // 5 × 0.5 — in the table; the sender deleted the line
  return prices;
}

/** A parsed-sheet book ({sheets:[{name, rows}]}) as .xlsx bytes, through the program's own writer. */
function xlsx(S, wb) {
  const styles = new S.Styles();
  return S.writeWorkbook({ styles, sheets: wb.sheets.map((sh) => ({
    name: sh.name,
    rows: sh.rows.map((cells, r) => ({ r, cells: (cells || []).map((c, i) => c && { c: i, s: 0, v: c.v }).filter(Boolean) }))
      .filter((x) => x && x.cells.length)
  })) });
}

/** «Наш ответ» as a plain table — what a PDF reply looks like once turned into Excel. */
function replyBook() {
  return { sheets: [sheet('Лист1', [
    ['Ответ на смету'],
    [],
    ['№', 'Наименование', 'Ед. изм.', 'Цена по смете', 'Рыночная цена', 'Примечание'],
    [1, 'ТЕСТОВЫЙ КРАН 10 Т', 'МАШ.-Ч', 13, 11, 'Пересмотреть'],
    [2, 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17, 15, 'Пересмотреть'],
    [3, 'ТЕСТОВЫЙ АНКЕР  М 8', 'ШТ', 19, 16, 'Пересмотреть'],      // a name broken differently
    [4, 'ТЕСТОВЫЙ БОЛТ', 'ШТ', 7, 6, 'Пересмотреть'],
    [5, 'ТЕСТОВЫЙ ДЮБЕЛЬ', 'ШТ', 1, 0.5, 'Пересмотреть'],
    ['', 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ', '', '', '', ''],                // a band row: no price
    [6, 'ТЕСТОВЫЙ ЩИТ', 'ШТ', 29, 29, 'НУЖНЫ ДВА КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЯ'],
    [7, 'ТЕСТОВЫЙ РЕСУРС, КОТОРОГО НЕТ', 'ШТ', 3, 2, 'Пересмотреть']
  ])] };
}

module.exports = { book, prices, xlsx, replyBook };
