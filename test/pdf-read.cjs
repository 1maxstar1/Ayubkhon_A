/*
 * «Наш ответ» as a PDF (src/lib/pdf-read.js). Our reply often leaves as a PDF — the export printed by Windows'
 * «Microsoft: Print To PDF» or saved from Excel — and the expert used to type it back into Excel before the program
 * could judge the corrected smeta against it. The reader puts every glyph where the page puts it, takes the table's
 * rows and columns from its ruled lines, and gives a book of the shape S.readXlsx gives, so «Наш ответ» reads it
 * exactly as it reads the spreadsheet.
 *
 * Every PDF here is made by test/pdf-make.cjs from invented tables (the reply of test/compare-books.cjs among them).
 *
 *   node test/pdf-read.cjs
 */
'use strict';
const { load } = require('./load.cjs');
const { Page, makePdf } = require('./pdf-make.cjs');
const { book, replyBook, xlsx } = require('./compare-books.cjs');

const S = load(load.PIPELINE, 'reply', 'pdf-read');
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const cellsOf = (row) => (row || []).slice(1).map((c) => (c ? String(c.v) : null));
const rowsOf = (wb) => wb.sheets[0].rows.slice(1).map(cellsOf);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throws = (fn) => { try { fn(); return ''; } catch (e) { return String(e.message || e); } };
/** A number as our table prints it: «1 234,50». */
const money = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ');

/* ----------------------------------------------- the reply of compare-books, printed to PDF */

// the same lines as replyBook(): the title, the header, the numbering row of our table, the lines over two pages
const source = replyBook().sheets[0].rows.map(cellsOf);
const head = source[3], lines = source.slice(4);
// (a page shows two spaces as one gap: the reader gives one; a row ends at its last cell with text)
const trim = (r) => { const x = r.slice(); while (x.length && x[x.length - 1] == null) x.pop(); return x; };
const printed = lines.map((r) => trim(r.map((v, c) => (v == null || v === '' ? null : (c === 3 || c === 4) ? money(+v) : String(v).replace(/\s+/g, ' ')))));
const numbering = head.map((h, i) => String(i + 1));
const widths = [28, 150, 50, 70, 70, 140];
/** The reply over two pages, each with the header and the numbering row again, the way a long table is printed. */
function replyPages() {
  const one = new Page(842, 595), two = new Page(842, 595);
  one.text(40, 36, 'TAQQOSLASH JADVALI №2', 11);
  one.text(40, 52, source[1][0], 9);
  one.table(40, 70, widths, [head, numbering, ...printed.slice(0, 4)], { tj: [1] });
  two.table(40, 40, widths, [head, numbering, ...printed.slice(4)], { tj: [1] });
  return [one, two];
}
const sheetReply = S.reply.parse(replyBook());
const fields = (es) => es.map((e) => [e.no, e.name, e.unit, e.price, e.market, e.note].join(' | '));

// «Microsoft: Print To PDF»: the page flipped, a two-byte font with a ToUnicode map, borders as thin filled rectangles
const pdf = makePdf(replyPages(), { style: 'print', compress: true });
check(S.isPdf(pdf) && !S.isPdf(new Uint8Array(xlsx(S, replyBook()))), 'a PDF is told by its first bytes');
const wb = S.readPdf(pdf);
const rows = rowsOf(wb);
check(rows[0][0] === 'TAQQOSLASH JADVALI №2' && rows[1][0] === source[1][0], 'the title above the table is read as rows of one cell (' + rows[0] + ' / ' + rows[1] + ')');
check(same(rows[2], head), 'the header row is read cell by cell (' + rows[2].join(' | ') + ')');
check(same(rows[3], numbering), 'the numbering row, written as one run with wide kerning, is split into its cells (' + rows[3].join(' ') + ')');
check(same(rows.slice(4, 8), printed.slice(0, 4)), 'the lines of the first page are read cell by cell, empty cells empty');
check(same(rows[8], head) && same(rows.slice(10), printed.slice(4)), 'the second page follows the first, its header again');
check(rows[4][4] === money(11) && rows[8 + 2 + 0][1] === 'ТЕСТОВЫЙ ДЮБЕЛЬ', 'numbers come back as the page prints them (' + rows[4][4] + ')');
const pdfReply = S.reply.parse(wb);
check(same(fields(pdfReply.entries), fields(sheetReply.entries)),
  'the reply read from the PDF gives the entries the spreadsheet gives (' + pdfReply.entries.length + ' of ' + sheetReply.entries.length + ')');
const v1 = S.smeta.parseWorkbook(book(1), 'v1.xlsx');
const mSheet = S.reply.match(sheetReply.entries, v1), mPdf = S.reply.match(pdfReply.entries, v1);
check(same(mPdf.prices, mSheet.prices) && mPdf.found.length === 6 && mPdf.missing.length === 1,
  'matched against the smeta, the PDF reply prices the lines the spreadsheet prices: 6 found, 1 not (' + mPdf.found.length + '/' + mPdf.missing.length + ')');
check(rows.every((r) => r.every((v) => v == null || v === v.trim())), 'no cell keeps a leading or trailing space');

// the same file kept in an object stream with a cross-reference stream (PDF 1.5), drawn inside a form XObject
const packed = makePdf(replyPages(), { style: 'print', compress: true, objstm: true, form: true });
check(same(rowsOf(S.readPdf(packed)), rows), 'objects inside an object stream, a page drawn through a form: the same rows');

// a page kept portrait and turned by /Rotate 90 (some printers do that with a landscape sheet)
const turned = makePdf(replyPages(), { style: 'turned' });
check(same(rowsOf(S.readPdf(turned)), rows), 'a page turned by /Rotate 90 is read the right way up');

/* ------------------------------------- a simple font, stroked borders, merged cells, wrapped names */

{
  const pg = new Page(595, 842);
  const t = [
    ['№', 'Наименование', 'Ед. изм.', 'Цена', null, 'Примечание'],
    [null, null, null, 'по смете', 'рыночная', null],
    ['1', 'ГРУНТОВКА ГФ-021 КРАСНО-КОРИЧНЕВАЯ', 'Т', money(1234.5), money(1000), 'Пересмотреть'],
    ['2', 'ТЕСТОВАЯ ТРУБА СТАЛЬНАЯ ЭЛЕКТРОСВАРНАЯ ПРЯМОШОВНАЯ ДИАМЕТРОМ 159 ММ ДЛЯ ФУТЛЯРА', 'М', money(98.25), money(90), 'Пересмотреть стоимость по всему проекту'],
    ['3', 'ТЕСТОВЫЙ ЦЕМЕНТ (М-400)', 'Т', money(23), money(21), null]
  ];
  pg.text(40, 40, 'Ответ на смету: проверьте цены');
  pg.table(40, 60, [24, 110, 40, 60, 60, 90], t, {
    merge: [{ r: 0, c: 0, rs: 2, cs: 1 }, { r: 0, c: 1, rs: 2, cs: 1 }, { r: 0, c: 2, rs: 2, cs: 1 }, { r: 0, c: 3, rs: 1, cs: 2 }, { r: 0, c: 5, rs: 2, cs: 1 }]
  });
  const plain = makePdf([pg], { style: 'plain' });
  const got = rowsOf(S.readPdf(plain));
  const want = t.map((r) => r.map((v) => (v == null ? null : v)));
  check(got[0][0] === 'Ответ на смету: проверьте цены', 'a simple font: Cyrillic through /Differences glyph names (' + got[0][0] + ')');
  check(same(trim(got[1]), trim(want[0])), 'a cell merged over two rows or two columns keeps its text in its top-left cell (' + got[1].join(' | ') + ')');
  check(same(trim(got[2]), trim(want[1])), 'the second header row has only its own cells (' + got[2].join(' | ') + ')');
  check(got[3][1] === 'ГРУНТОВКА ГФ-021 КРАСНО-КОРИЧНЕВАЯ', 'a word the cell broke after its hyphen is one word again (' + got[3][1] + ')');
  check(got[4][1] === t[3][1] && got[4][5] === t[3][5], 'a name wrapped over several lines is one cell (' + got[4][1] + ')');
  check(same(trim(got[5]), trim(want[4])), 'brackets and hyphens of a simple font come back (' + got[5][1] + ')');
  check(S.num(got[3][3]) === 1234.5, 'a printed «1 234,50» is the number 1234.5');
}

/* -------------------------------- a number padded to the right of its cell with spaces */

// Excel's accounting format pads a number to the right of its cell with spaces, and Windows' printer puts the last of
// them over the number's first digit: taken as text, that space went inside the number («1 21 744,00»)
{
  const pg = new Page(595, 842);
  const bottom = pg.table(40, 60, [150, 90], [['Наименование', 'Цена'], ['ТЕСТОВЫЙ ПЕСОК', null], ['ТЕСТОВЫЙ ЩЕБЕНЬ', null]]);
  const rowH = (bottom - 60) / 3;
  // twelve spaces, then the number moved back by more than one space's width: its first digit starts before the last space
  pg.tj(192, 60 + rowH + rowH / 2 + 3, [' '.repeat(12), 280, '987,50']);
  pg.tj(192, 60 + 2 * rowH + rowH / 2 + 3, [' '.repeat(10), 260, '5 432,00']);
  const got = rowsOf(S.readPdf(makePdf([pg], { style: 'print' })));
  check(got[1][1] === '987,50' && got[2][1] === '5 432,00', 'a number padded with spaces that run over its first digit reads as printed (' + got[1][1] + ' / ' + got[2][1] + ')');
}

/* ---------------------------------------------------------- no ruled table */

{
  const pg = new Page(595, 842);
  pg.text(40, 40, 'Перечень цен');
  pg.text(40, 60, 'ТЕСТОВЫЙ ПЕСОК'); pg.text(220, 60, 'М3'); pg.text(300, 60, money(57));
  pg.text(40, 74, 'ТЕСТОВЫЙ ЩЕБЕНЬ ФР. 5-20'); pg.text(220, 74, 'М3'); pg.text(300, 74, money(69));
  const got = rowsOf(S.readPdf(makePdf([pg], { style: 'print' })));
  check(same(got, [['Перечень цен'], ['ТЕСТОВЫЙ ПЕСОК', 'М3', money(57)], ['ТЕСТОВЫЙ ЩЕБЕНЬ ФР. 5-20', 'М3', money(69)]]),
    'a page with no ruled table: each line, split into cells at its wide gaps (' + JSON.stringify(got) + ')');
}

/* ------------------------------------------------------- what is not read */

check(/скан/.test(throws(() => S.readPdf(makePdf(replyPages(), { scan: true })))), 'a page that is only a picture: said to be a scan');
check(/паролем/.test(throws(() => S.readPdf(makePdf(replyPages(), { encrypt: true })))), 'a PDF with a password: said so');
check(/паролем/.test(throws(() => S.readPdf(makePdf(replyPages(), { encrypt: true, objstm: true })))), '… also when the password is named by a cross-reference stream');
check(/не извлекается/.test(throws(() => S.readPdf(makePdf(replyPages(), { noUnicode: true })))), 'a two-byte font with no ToUnicode map: said that its text cannot be taken');
check(/не PDF/.test(throws(() => S.readPdf(new Uint8Array(xlsx(S, replyBook()))))), 'a book is not read as a PDF');
check(/Это PDF/.test(throws(() => S.readXlsx(pdf))), 'a PDF given where a smeta is read: said to be a PDF, and where a PDF reply goes');
check(/страницы не найдены|скан/.test(throws(() => S.readPdf(new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF\n'))))), 'an empty PDF: no pages');

// S.readTable: one door for our reply, a spreadsheet or a PDF
check(same(fields(S.reply.parse(S.readTable(new Uint8Array(xlsx(S, replyBook())))).entries), fields(sheetReply.entries)) &&
  same(fields(S.reply.parse(S.readTable(pdf)).entries), fields(sheetReply.entries)), 'S.readTable reads the reply from a spreadsheet and from a PDF alike');

console.log(fail ? '\nFAILED: ' + fail : '\nall pdf-read checks passed');
process.exit(fail ? 1 : 0);
