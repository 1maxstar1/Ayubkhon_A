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

/* ------------------------------------------------------- nothing else broke */
console.log('-- a file that is not a workbook at all --');
const junk = read(new Uint8Array([1, 2, 3, 4, 5]), 'junk');
check(!!junk.err, 'five random bytes are refused, not silently accepted');
const empty = read(book(''), 'empty');
check(!empty.err && empty.wb.sheets[0].rows.length <= 1, 'a workbook with no rows is simply empty');

console.log(fail ? `FAILED (${fail})` : 'xlsx-guard OK');
process.exit(fail ? 1 : 0);
