/*
 * A workbook the program did not write.
 *
 * Estimates arrive as files from outside — a contractor's e-mail, a flash
 * drive, a download. Nothing about them is trustworthy, and the reader has to
 * survive whatever is in them rather than believe what they claim about
 * themselves. The row and column numbers are the sharp edge: they are read
 * straight out of the file and used as array indices, so a file that claims
 * row 900 000 000 used to make the parser walk a billion empty slots and the
 * page stop answering.
 *
 * Everything here is a file built in memory, a few hundred bytes each. What is
 * checked is that the reader finishes, quickly, and returns something sane.
 *
 *   node test/xlsx-guard.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'smeta');
const fflate = S.__fflate;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/** The smallest .xlsx that opens: one sheet, whatever rows XML you hand it. */
function book(sheetRows) {
  const enc = new TextEncoder();
  const files = {
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Лист1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + sheetRows + '</sheetData></worksheet>'
  };
  const zip = {};
  for (const k in files) zip[k] = enc.encode(files[k]);
  return fflate.zipSync(zip);
}

const cell = (ref, v) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;

/** Read it, and say how long that took. */
function read(bytes, what) {
  const t0 = Date.now();
  let wb = null, err = null;
  try { wb = S.readXlsx(bytes); } catch (e) { err = e; }
  return { wb, err, ms: Date.now() - t0, what };
}

/* ------------------------------------------------- an honest little file */
console.log('-- a workbook the program itself could have written --');
const plain = book(
  '<row r="1">' + cell('A1', 'Смета') + '</row>' +
  '<row r="2">' + cell('A2', '1') + cell('B2', 'БЕТОН') + cell('C2', 'М3') + '</row>'
);
const okRead = read(plain, 'plain');
check(!okRead.err, 'a small ordinary workbook reads without error');
check(okRead.wb && okRead.wb.sheets.length === 1, 'and has its one sheet');
const rows = okRead.wb.sheets[0].rows;
check(rows.length === 3, `rows are indexed by their own number (length ${rows.length})`);
check(rows[2] && rows[2][2] && rows[2][2].v === 'БЕТОН', 'and the cells are where they say they are');

/* -------------------------------------------------- a row number nobody wrote */
console.log('-- a row that claims to be nine hundred million --');
const huge = book(
  '<row r="1">' + cell('A1', 'Смета') + '</row>' +
  '<row r="900000000">' + cell('A900000000', 'далеко') + '</row>'
);
check(huge.length < 2000, `the whole file is ${huge.length} bytes`);
const big = read(huge, 'huge row');
check(!big.err, 'it still reads without throwing');
check(big.ms < 2000, `and reads quickly (${big.ms} ms)`);
check(big.wb.sheets[0].rows.length <= 1048577,
  `the sheet is not a billion rows long (${big.wb.sheets[0].rows.length})`);
check(big.wb.sheets[0].rows[1] && big.wb.sheets[0].rows[1][1].v === 'Смета',
  'and the row that was real is still there');

/* --------------------------------------------------- and a column to match */
console.log('-- a column past the end of the alphabet --');
const wide = book('<row r="1">' + cell('A1', 'Смета') + cell('ZZZZZZZ1', 'далеко') + '</row>');
const w = read(wide, 'huge col');
check(!w.err && w.ms < 2000, `a 7-letter column reference does not hang the reader (${w.ms} ms)`);
check(w.wb.sheets[0].maxCol <= 16384, `and does not widen the sheet past Excel's own limit (${w.wb.sheets[0].maxCol})`);

/* ------------------------------------------------ the parser above it, too */
console.log('-- the estimate parser walks the same rows --');
const t0 = Date.now();
const objects = S.smeta.parseWorkbook(big.wb, 'hostile.xlsx');
const parseMs = Date.now() - t0;
check(parseMs < 2000, `parseWorkbook finishes on the hostile file (${parseMs} ms)`);
check(Array.isArray(objects), 'and returns a list, whatever it decided about the sheet');

/* ------------------------------------------------ tags that are never closed */
/*
 * The reader used to find its elements with expressions like «<row …>…</row>». Given an opening tag with no
 * closing one, such an expression reads on to the end of the sheet — and then does so again from the next
 * opening tag. Two hundred thousand of them are under a megabyte of XML and a few kilobytes of file, and used
 * to be hours of a page that does not answer. Every search is one pass now; each shape below is one of the
 * places that was not.
 */
console.log('-- opening tags with nothing to close them --');
const N = 200000;
const sheetXml = (body) => '<?xml version="1.0"?><worksheet><sheetData>' + body + '</sheetData></worksheet>';
function parts(over) {
  const enc = new TextEncoder();
  const files = Object.assign({
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook><sheets><sheet name="L" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': sheetXml('<row r="1">' + cell('A1', 'Смета') + '</row>')
  }, over);
  const zip = {};
  for (const k in files) zip[k] = typeof files[k] === 'string' ? enc.encode(files[k]) : files[k];
  return fflate.zipSync(zip);
}
const real = '<row r="7">' + cell('B7', 'настоящая') + '</row>';
const SHAPES = {
  'shared strings': { 'xl/sharedStrings.xml': '<sst>' + '<si>'.repeat(N) + '</sst>' },
  'phonetic runs in a string': { 'xl/sharedStrings.xml': '<sst><si>' + '<rPh>'.repeat(N) + '</si></sst>' },
  'rows': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1">'.repeat(N)) },
  'rows cut off inside the tag': { 'xl/worksheets/sheet1.xml': sheetXml('<row '.repeat(N)) },
  'cells': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1">' + '<c r="A1">'.repeat(N) + '</row>' + real) },
  'cells cut off inside the tag': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1">' + '<c '.repeat(N) + '</row>') },
  'formulas in one cell': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1"><c r="A1">' + '<f>'.repeat(N) + '</c></row>' + real) },
  'values in one cell': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1"><c r="A1">' + '<v>'.repeat(N) + '</c></row>' + real) },
  'text runs in one cell': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1"><c r="A1" t="inlineStr">' + '<t>'.repeat(N) + '</c></row>' + real) },
  'an attribute name a megabyte long': { 'xl/worksheets/sheet1.xml': sheetXml('<row ' + 'a'.repeat(5 * N) + '>x</row>' + real) },
  'a column reference a megabyte long': { 'xl/worksheets/sheet1.xml': sheetXml('<row r="1"><c r="' + 'Z'.repeat(5 * N) + '1"><v>1</v></c></row>' + real) },
  'column blocks': { 'xl/worksheets/sheet1.xml': '<worksheet>' + '<cols>'.repeat(N) + '<sheetData>' + real + '</sheetData></worksheet>' },
  'merge blocks': { 'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' + real + '</sheetData>' + '<mergeCells>'.repeat(N) + '<mergeCell ref="'.repeat(N) + '</worksheet>' },
  'dimensions': { 'xl/worksheets/sheet1.xml': '<worksheet>' + '<dimension ref="'.repeat(N) + '<sheetData>' + real + '</sheetData></worksheet>' },
  'relationships': { 'xl/_rels/workbook.xml.rels': '<Relationships>' + '<Relationship '.repeat(N) + '</Relationships>' },
  'sheets in the workbook': { 'xl/workbook.xml': '<workbook><sheets>' + '<sheet '.repeat(N) + '</sheets></workbook>' }
};
Object.keys(SHAPES).forEach((what) => {
  const bytes = parts(SHAPES[what]);
  const r = read(bytes, what);
  check(!r.err && r.ms < 2000, `${what}, ${N} of them unclosed: ${bytes.length} bytes of file, read in ${r.ms} ms`);
  const keepsReal = JSON.stringify(SHAPES[what]).indexOf('настоящая') < 0 ||
    (r.wb && r.wb.sheets[0] && r.wb.sheets[0].rows[7] && r.wb.sheets[0].rows[7][2].v === 'настоящая');
  check(keepsReal, '  and the honest row after them is still read');
});

/* -------------------------------------------- one part named a million times */
console.log('-- a workbook that lists one sheet over and over --');
const again = parts({
  'xl/workbook.xml': '<workbook><sheets>' + '<sheet name="L" sheetId="1" r:id="rId1"/>'.repeat(50000) + '</sheets></workbook>',
  'xl/worksheets/sheet1.xml': sheetXml(('<row r="1">' + cell('A1', 'x') + '</row>').repeat(2000))
});
const ag = read(again, 'same part');
check(!ag.err && ag.ms < 2000, `fifty thousand references to one part are not fifty thousand readings (${ag.ms} ms)`);
check(ag.wb && ag.wb.sheets.length === 1, `the part is one sheet (${ag.wb && ag.wb.sheets.length})`);

/* ------------------------------------------------- a character that is not one */
console.log('-- a character reference past the last character --');
const beyond = read(book('<row r="1">' + cell('A1', 'до &#x110000; и &#99999999999; после &#1071;') + '</row>'), 'code point');
check(!beyond.err, 'the workbook still opens' + (beyond.err ? ': ' + beyond.err.message : ''));
check(beyond.wb && beyond.wb.sheets[0].rows[1][1].v === 'до &#x110000; и &#99999999999; после Я',
  'the reference is left as it was written, and a real one beside it is still read');

/* --------------------------------------------------------- more than fits */
/*
 * An archive packs emptiness very well: three hundred megabytes of nothing is a file of three hundred kilobytes —
 * smaller than an ordinary estimate — and two gigabytes is two megabytes. Unpacked, it is the tab's memory. The
 * archive says how large each part will be, so that is asked before anything is unpacked.
 */
console.log('-- a small file that unpacks into a very large one --');
const bomb = parts({ 'xl/worksheets/sheet1.xml': new Uint8Array(300 * 1024 * 1024) });
check(bomb.length < 1024 * 1024, `the file is ${Math.round(bomb.length / 1024)} KB`);
const before = process.memoryUsage().arrayBuffers;
const bm = read(bomb, 'bomb');
check(!!bm.err && /слишком большой/.test(bm.err.message), 'it is refused, in words: ' + (bm.err && bm.err.message.slice(0, 40)) + '…');
check(bm.ms < 1000, `at once (${bm.ms} ms)`);
check(process.memoryUsage().arrayBuffers - before < 50 * 1024 * 1024, 'and without having been unpacked first');
// what the sheet does not say about itself: parts nobody asked for are not counted and not unpacked
const aside = read(parts({ 'xl/media/image1.bin': new Uint8Array(300 * 1024 * 1024) }), 'aside');
check(!aside.err && aside.wb.sheets.length === 1, 'a large part the reader never opens (a picture) does not get an estimate refused');

console.log('-- more cells than any estimate has --');
const many = parts({ 'xl/worksheets/sheet1.xml': sheetXml('<row r="1">' + '<c r="A1"><v>1</v></c>'.repeat(5000001) + '</row>') });
const mn = read(many, 'cells');
check(!!mn.err && /слишком большой/.test(mn.err.message), `five million and one cells are refused (${mn.ms} ms)`);
const strs = read(parts({ 'xl/sharedStrings.xml': '<sst>' + '<si/>'.repeat(5000001) + '</sst>' }), 'strings');
check(!!strs.err && /слишком большой/.test(strs.err.message), `and as many shared strings (${strs.ms} ms)`);

/* ------------------------------------------------------- nothing else broke */
console.log('-- a file that is not a workbook at all --');
const junk = read(new Uint8Array([1, 2, 3, 4, 5]), 'junk');
check(!!junk.err, 'five random bytes are refused, not silently accepted');
const empty = read(book(''), 'empty');
check(!empty.err && empty.wb.sheets[0].rows.length <= 1, 'a workbook with no rows is simply empty');

console.log(fail ? `FAILED (${fail})` : 'xlsx-guard OK');
process.exit(fail ? 1 : 0);
