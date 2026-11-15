/*
 * Excel 97–2003 books (.xls). Some estimating programs and some experts still save in the old format; the reader
 * hands such a book to SheetJS (src/vendor/xlsx.full.min.js, carried by the worker that reads the files) and gets
 * the same sheets an .xlsx gives: values, formulas with the values Excel saved, hidden sheets.
 *
 * The books are invented here and written as .xls by SheetJS itself.
 *
 *   node test/xls-read.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load(load.PIPELINE, 'xlsx');
const X = S.__XLSX;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/** An .xls of the given sheets: rows of values, a string beginning with «=» a formula (its saved value next to it). */
function xls(sheets, hidden) {
  const wb = X.utils.book_new();
  sheets.forEach((sh) => {
    const ws = X.utils.aoa_to_sheet(sh.rows.map((r) => r.map((v) => (v && v.f ? null : v))));
    sh.rows.forEach((r, ri) => r.forEach((v, ci) => {
      if (v && v.f) ws[X.utils.encode_cell({ r: ri, c: ci })] = { t: 'n', v: v.v, f: v.f };
    }));
    X.utils.book_append_sheet(wb, ws, sh.name);
  });
  if (hidden) { wb.Workbook = { Sheets: sheets.map((s, i) => ({ Hidden: hidden.indexOf(i) >= 0 ? 1 : 0 })) }; }
  return new Uint8Array(X.write(wb, { type: 'array', bookType: 'biff8' }));
}

const resource = { name: 'Ресурсы', rows: [
  ['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВАЯ УЛИЦА'], [],
  ['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'],
  [1, 2, 3, 4, 5, 6],
  ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, { f: 'D7*E7', v: 68 }],
  [2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, { f: 'D8*E8', v: 57 }],
  ['ИТОГО', null, 'СУМ', null, null, { f: 'SUM(F7:F8)', v: 125 }]
] };
const note = { name: 'Пояснительная', rows: [['Пояснительная записка'], ['Тест']] };
const bytes = xls([note, resource], [0]);
check(bytes[0] === 0xD0 && bytes[1] === 0xCF, 'the test book is an Excel 97–2003 file (OLE)');

const wb = S.readXlsx(bytes);
const sh = wb.sheets.find((s) => s.name === 'Ресурсы');
check(wb.sheets.length === 2 && wb.sheets[0].hidden === true && wb.sheets[1].hidden === false, 'both sheets, the hidden one marked hidden');
check(sh && sh.rows[7][2].v === 'ЩЕБЕНЬ ТЕСТОВЫЙ' && sh.rows[7][4].v === 4 && sh.rows[7][6].v === 68 && sh.maxCol === 6,
  'cells from 1, as an .xlsx gives them');
// SheetJS writes no formulas into an .xls: what it reads from a real one (formula text without «=», the saved value, an
// error cell, a reference to another sheet) is handed to the reader as SheetJS gives it
{
  const realRead = X.read;
  X.read = () => ({ SheetNames: ['перевозка'], Workbook: { Sheets: [{ Hidden: 0 }] }, Sheets: { 'перевозка': {
    '!ref': 'A1:C2', '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }], '!cols': [{ wch: 5 }, { wch: 40, hidden: true }],
    A1: { t: 's', v: 'ТЕСТ' }, A2: { t: 'n', v: 7, f: 'vrmu!D57' }, B2: { t: 'e', v: 7, w: '#DIV/0!', f: 'A2/0' }, C2: { t: 'n', v: 14, f: 'A2*2' } } } });
  let got; try { got = S.readXlsx(bytes); } finally { X.read = realRead; }
  const r2 = got.sheets[0].rows[2];
  check(r2[1].f === '=vrmu!D57' && r2[1].v === 7 && r2[3].f === '=A2*2' && r2[3].v === 14 && r2[2].v === '#DIV/0!' &&
    got.sheets[0].merges[0] === 'A1:C1' && got.sheets[0].cols[1].hidden === true,
    'formulas get their «=» and keep the saved value; an error cell is its text; merges and hidden columns as in an .xlsx');
}
const objs = S.smeta.parseWorkbook(wb, 'a.xls');
const items = objs.length ? objs[0].rows.filter((r) => r.kind === 'item') : [];
check(objs.length === 1 && items.length === 2 && items[0].nm === 'ЩЕБЕНЬ ТЕСТОВЫЙ' && items[0].sum === 68 && items[1].qty === 3,
  'the resource sheet of an .xls is read as the same sheet of an .xlsx would be');
const asXlsx = S.smeta.parseWorkbook(S.readXlsx(new Uint8Array(X.write((() => {
  const b = X.read(bytes, { type: 'array', cellFormula: true }); return b; })(), { type: 'array', bookType: 'xlsx' }))), 'a.xls');
check(JSON.stringify(asXlsx.map((o) => o.rows.map((r) => [r.kind, r.nm, r.qty, r.price, r.sum]))) === JSON.stringify(objs.map((o) => o.rows.map((r) => [r.kind, r.nm, r.qty, r.price, r.sum]))),
  'and gives what the same book saved as .xlsx gives');

// without SheetJS (the page itself, a browser without workers) the old advice stands
const bare = load(load.PIPELINE);
let msg = '';
try { bare.readXlsx(bytes); } catch (e) { msg = e.message; }
check(/старого формата \(\.xls\)/.test(msg), 'without SheetJS an .xls is refused with the advice to save it as .xlsx');
// a password-protected .xlsx is an OLE file SheetJS cannot open: the same advice, not a crash
const fake = new Uint8Array(4096); fake.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
msg = '';
try { S.readXlsx(fake); } catch (e) { msg = e.message; }
check(/старого формата|защищённая паролем/.test(msg), 'an OLE file SheetJS cannot open is refused with the same advice (' + msg.slice(0, 50) + '…)');

console.log(fail ? `FAILED (${fail})` : 'xls-read OK');
process.exit(fail ? 1 : 0);
