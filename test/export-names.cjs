/*
 * The names of the exported workbook's sheets, and the columns of a report with one extra column.
 *
 * A sheet name is typed or taken from a file: «Навои & Чилонзор», a title longer than Excel allows, a name with
 * a slash in it, two projects called «Смета» and «СМЕТА». Each of these once gave a workbook Excel refused or
 * «repaired»:
 *
 *   - an ampersand in a sheet with a filter: the name is written again inside workbook.xml (the filter's
 *     defined name), and there it was not escaped — the XML broke;
 *   - the summary sheet's own name (the «Лист1» field) was written as typed: more than 31 characters, or one of
 *     \ / * ? : [ ] in it;
 *   - two sheets whose names differ only in case: one name to Excel;
 *   - a smeta with exactly one column after the sum: its market copy on the report sheet stood visible.
 *
 * Names, quantities and prices are invented.
 *
 *   node test/export-names.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load(load.PIPELINE);
const fflate = S.__fflate;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/** rows[r][c] = {v} or {f}; r and c from 1, as the reader returns them. */
function sheet(name, lines) {
  const rows = [];
  lines.forEach((line, i) => {
    const cells = [];
    line.forEach((v, c) => { if (v != null) cells[c + 1] = typeof v === 'string' && v[0] === '=' ? { f: v } : { v }; });
    rows[i + 1] = cells;
  });
  return { name, rows };
}

/** A small resource sheet; `note` adds one column after the sum (an «ПРИМЕЧАНИЕ»). */
function book(note) {
  const L = [['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВАЯ УЛИЦА'], []];
  L.push(['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'].concat(note ? ['ПРИМЕЧАНИЕ'] : []));
  L.push([1, 2, 3, 4, 5, 6].concat(note ? [7] : []));
  L.push(['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ']);
  L.push([1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, '=D7*E7'].concat(note ? ['карьер'] : []));
  L.push([2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, '=D8*E8'].concat(note ? ['склад'] : []));
  L.push(['ИТОГО', null, 'СУМ', null, null, '=SUM(F7:F8)']);
  return { sheets: [sheet('УЛ1', L)] };
}

const objects = (note) => S.smeta.parseWorkbook(book(note), 'a.xlsx');
const project = (id, name, note) => ({ id, name, title: name, objects: objects(note) });
const k = S.resKey('ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 17);
const prices = { [k]: 15 };

/** The workbook's own XML files, by path. */
function parts(bytes) {
  const files = fflate.unzipSync(bytes), out = {};
  Object.keys(files).forEach((p) => { out[p] = fflate.strFromU8(files[p]); });
  return out;
}
const bareAmp = (xml) => /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(xml);
const validName = (n) => typeof n === 'string' && n.length >= 1 && n.length <= 31 && !/[\\/*?:[\]]/.test(n) && !/^'|'$/.test(n);

/* ------------------------------------------------------------------ an ampersand */
{
  const model = S.assemble([project('p', 'Навои & Чилонзор')], prices);
  const bytes = S.buildWorkbook(model, { mode: 'full', minDiff: 0, sheetName: 'Свод & итог' });
  const x = parts(bytes);
  check(!bareAmp(x['xl/workbook.xml']), 'workbook.xml: an ampersand in a sheet name is escaped wherever the name is written (the filter\'s defined name too)');
  check(/_xlnm\._FilterDatabase[^>]*>'Навои &amp; Чилонзор'!/.test(x['xl/workbook.xml']), 'the filter of the report sheet names it, escaped');
  const wb = S.readXlsx(bytes);
  check(wb.sheets[0].name === 'Свод & итог' && wb.sheets[1].name === 'Навои & Чилонзор', 'and the workbook reads back with its names (' + wb.sheets.map((s) => s.name).join(' | ') + ')');
}

/* ------------------------------------------------------------------ the summary sheet's name, as typed */
{
  const model = S.assemble([project('p', 'Тест')], prices);
  const long = 'Сводная таблица по объекту: улицы 1/2 [черновик] * ?';
  const names = S.readXlsx(S.buildWorkbook(model, { mode: 'full', minDiff: 0, sheetName: long })).sheets.map((s) => s.name);
  check(validName(names[0]) && names[0].startsWith('Сводная таблица по объекту'), 'a long name with \\ / * ? : [ ] in it is made one Excel takes (' + JSON.stringify(names[0]) + ')');
  const quoted = S.readXlsx(S.buildWorkbook(model, { mode: 'full', minDiff: 0, sheetName: "'Свод'" })).sheets.map((s) => s.name);
  check(quoted[0] === 'Свод', 'an apostrophe at either end is dropped (' + JSON.stringify(quoted[0]) + ')');
}

/* ------------------------------------------------------------------ names that differ only in case */
{
  const model = S.assemble([project('a', 'Смета'), project('b', 'СМЕТА')], prices);
  const names = S.readXlsx(S.buildWorkbook(model, { mode: 'full', minDiff: 0, sheetName: 'смета' })).sheets.map((s) => s.name);
  const upper = names.map((n) => n.toUpperCase());
  check(names.length >= 3 && new Set(upper).size === upper.length && names.every(validName), 'sheets named «смета», «Смета», «СМЕТА» get names unique to Excel (' + names.join(' | ') + ')');
}

/* ------------------------------------------------------------------ one column after the sum */
{
  const model = S.assemble([project('p', 'Тест', true)], prices);
  check(model.nExtra === 1, 'the smeta has one column after the sum (nExtra ' + model.nExtra + ')');
  const R = S.report.cols;
  const rep = S.report.build(model, model.spans[0], { mode: 'full', minDiff: 0 });
  const hidden = rep.cols.find((c) => c.min === R.EXTRA + 1);
  check(!!hidden && hidden.max === R.EXTRA + 2 && hidden.hidden === true, 'the report sheet keeps its extra columns hidden, as it does for two or more (' + JSON.stringify(hidden || null) + ')');
  const x = parts(S.buildWorkbook(model, { mode: 'full', minDiff: 0 }));
  const sheet2 = x['xl/worksheets/sheet2.xml'] || '';
  const col = new RegExp('<col min="' + (R.EXTRA + 1) + '" max="' + (R.EXTRA + 2) + '"[^>]*hidden="1"');
  check(col.test(sheet2), 'and so does the written report sheet');
}

console.log(fail ? `FAILED (${fail})` : 'export-names OK');
process.exit(fail ? 1 : 0);
