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

/* ------------------------------------------- tags that are opened and never closed */
/*
 * The reader looked for <row…>…</row> with an expression that, on an opening tag with no closing one, read to
 * the end of the sheet and started over at the next opening tag: eighty thousand of them, two kilobytes zipped,
 * took a quarter of a minute, and twice as many a minute. The same went for cells, for a cell's formula and
 * value, and for the shared strings. Each case here is small enough to send by e-mail and, before the reader
 * went through the text once, large enough to stop the page for the time it takes to give up on it.
 */
console.log('-- tags that are opened and never closed --');
const N = 200 * 1000;
const timed = (what, bytes, extraOk) => {
  const r = read(bytes, what);
  check(!r.err && r.ms < 2000 && (!extraOk || extraOk(r.wb)), `${what}: read in ${r.ms} ms, ${bytes.length} bytes of file`);
};
const real = '<row r="2">' + cell('A2', 'настоящая строка') + '</row>';
timed(N + ' <row> tags never closed', book('<row r="1">'.repeat(N)));
timed('a real row before them is still read', book(real + '<row r="3">'.repeat(N)), (wb) => wb.sheets[0].rows[2][1].v === 'настоящая строка');
timed(N + ' <c> tags never closed in one row', book('<row r="1">' + '<c r="A1">'.repeat(N) + '</row>' + real), (wb) => wb.sheets[0].rows[2][1].v === 'настоящая строка');
timed(N + ' <f> tags never closed in one cell', book('<row r="1"><c r="A1">' + '<f>'.repeat(N) + '<v>5</v></c></row>'), (wb) => wb.sheets[0].rows[1][1].v === 5);
timed(N + ' <v> tags never closed in one cell', book('<row r="1"><c r="A1">' + '<v>'.repeat(N) + '</c></row>' + real));
timed(N + ' <t> tags never closed in one string', book('<row r="1"><c r="A1" t="inlineStr"><is>' + '<t>'.repeat(N) + '</is></c></row>' + real));
timed(N + ' <rPh> tags never closed in one string', book('<row r="1"><c r="A1" t="inlineStr"><is>' + '<rPh>'.repeat(N) + '<t>x</t></is></c></row>'));
{
  const enc = new TextEncoder();
  const files = fflate.unzipSync(plain);
  files['xl/sharedStrings.xml'] = enc.encode('<sst>' + '<si>'.repeat(N) + '</sst>');
  timed(N + ' <si> tags never closed in the shared strings', fflate.zipSync(files));
}

/* ------------------------------------------- what the expressions found, the walk finds */
console.log('-- a sheet as Excel writes it --');
const excel = book(
  '<row r="1" spans="1:3"><c r="A1" t="inlineStr"><is><r><t>Сме</t></r><r><t xml:space="preserve">та </t></r><rPh sb="0" eb="1"><t>ФОН</t></rPh></is></c>' +
  '<c r="B1"><f>SUM(B2:B3)</f><v>12</v></c><c r="C1" s="3"/></row>' +
  '<row r="2"><c r="B2"><v>5</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="str"><f t="shared" si="0"/><v>a&amp;b</v></c></row>' +
  '<row r="3" hidden="1"/><row r="4"><c r="B4"><v>7</v></c></row>') ;
const ex = read(excel, 'excel').wb.sheets[0].rows;
check(ex[1][1].v === 'Смета ' && !/ФОН/.test(ex[1][1].v), 'runs of one string are joined, its phonetic hint left out');
check(ex[1][2].f === '=SUM(B2:B3)' && ex[1][2].v === 12 && ex[1][3] === undefined, 'a formula with its value; an empty styled cell is no cell');
check(ex[2][2].v === 5 && ex[2][3].v === true && ex[2][4].v === 'a&b' && !ex[2][4].f, 'numbers, booleans, text; a shared-formula reference carries no formula text');
check(ex[3] === undefined && ex[4][2].v === 7, 'a self-closing row is skipped and the one after it read');
const withCols = fflate.unzipSync(plain);
withCols['xl/worksheets/sheet1.xml'] = new TextEncoder().encode('<worksheet><cols><col min="1" max="2" width="9" hidden="1"/></cols><sheetData>' +
  '<row r="1">' + cell('A1', 'x') + '</row></sheetData><rowBreaks count="1"><brk id="1"/></rowBreaks><colBreaks count="1"><brk id="1"/></colBreaks></worksheet>');
const wc = read(fflate.zipSync(withCols), 'cols').wb.sheets[0];
check(wc.rows[1][1].v === 'x' && wc.cols.length === 1 && wc.cols[0].hidden === true, '<cols>, <rowBreaks> and <colBreaks> are not taken for cells or rows');

/* ------------------------------------------- a character that does not exist */
console.log('-- a character reference past the last character --');
const ref = read(book('<row r="1">' + cell('A1', 'a&#x110000;b&#99999999999;c&#x41;') + '</row>'), 'ref');
check(!ref.err && ref.wb.sheets[0].rows[1][1].v === 'a&#x110000;b&#99999999999;cA', 'is left as it is written, and the workbook still reads (it made the whole file unreadable)');

/* ------------------------------------------- small in the file, enormous unpacked */
console.log('-- a sheet that is small zipped and enormous unpacked --');
{
  const mb = 200;
  const sheet = new Uint8Array(mb * 1024 * 1024).fill(32);
  const files = fflate.unzipSync(plain);
  files['xl/worksheets/sheet1.xml'] = sheet;
  const bomb = fflate.zipSync(files, { level: 9 });
  const before = process.memoryUsage().rss;
  const r = read(bomb, 'bomb');
  const grew = Math.round((process.memoryUsage().rss - before) / 1024 / 1024);
  check(bomb.length < 1024 * 1024 && !!r.err && /слишком велик/.test(r.err.message), `${mb} MB of sheet in ${Math.round(bomb.length / 1024)} kB of file is refused in words`);
  check(r.ms < 1000 && grew < 50, `before it is unpacked (${r.ms} ms, +${grew} MB)`);
}

/* ------------------------------------------------------- nothing else broke */
console.log('-- a file that is not a workbook at all --');
const junk = read(new Uint8Array([1, 2, 3, 4, 5]), 'junk');
check(!!junk.err, 'five random bytes are refused, not silently accepted');
const empty = read(book(''), 'empty');
check(!empty.err && empty.wb.sheets[0].rows.length <= 1, 'a workbook with no rows is simply empty');

/* ------------------------------------------------ a damaged file is refused in words */
/*
 * The part reader looks for tags, not for a well-formed document. A sheet cut off in the middle used to give the
 * rows before the cut and say nothing — half an estimate, and in server mode it was stored like that; a missing
 * shared-strings table turned every name into an empty cell; a broken archive said «invalid zip data». Each of
 * these is now refused, in Russian, with what to do about it.
 */
console.log('-- a damaged file is refused in words, never half read --');
{
  const enc = new TextEncoder();
  const rowsOf = (n) => Array.from({ length: n }, (_, i) =>
    `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>${i}</v></c><c r="B${i + 1}"><v>${i + 1}</v></c></row>`).join('');
  const sstOf = (n) => '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    `count="${n}" uniqueCount="${n}">` + Array.from({ length: n }, (_, i) => `<si><t>РЕСУРС ${i}</t></si>`).join('') + '</sst>';
  /** book() with shared strings: six rows whose names live in xl/sharedStrings.xml */
  const withSst = () => {
    const f = fflate.unzipSync(book(rowsOf(6)));
    f['xl/sharedStrings.xml'] = enc.encode(sstOf(6));
    return f;
  };
  const text = (u8) => new TextDecoder().decode(u8);
  const cut = (u8) => u8.slice(0, Math.floor(u8.length / 2));

  const good = read(fflate.zipSync(withSst()), 'sst');
  check(!good.err && good.wb.sheets[0].rows[6][1].v === 'РЕСУРС 5', 'a workbook with shared strings reads, names in place');

  const refused = (what, bytes, more) => {
    const r = read(bytes, what);
    const m = r.err ? String(r.err.message) : '';
    check(!!r.err && /[А-Яа-я]/.test(m) && !/invalid|undefined|zip data/i.test(m) && (!more || more.test(m)),
      `${what}: refused — ${m || 'NOT REFUSED (' + (r.wb ? r.wb.sheets.map((s) => s.rows.length).join('/') : '?') + ' rows read)'}`);
  };

  refused('random bytes', new Uint8Array(Array.from({ length: 300 }, (_, i) => (i * 37 + 11) & 255)), /не открывается/);
  { const cfb = new Uint8Array(1024); cfb.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    refused('an old .xls (or password-protected) file', cfb, /\.xls.*парол|парол.*\.xls/); }
  refused('the archive cut in half', cut(fflate.zipSync(withSst())), /не открывается/);
  { const f = withSst(); f['xl/worksheets/sheet1.xml'] = cut(f['xl/worksheets/sheet1.xml']);
    refused('the sheet cut in half', fflate.zipSync(f), /Лист1.*обрывается/); }
  { const f = withSst(); delete f['xl/worksheets/sheet1.xml'];
    refused('the sheet missing from the archive', fflate.zipSync(f), /Лист1.*отсутствует/); }
  { const f = withSst(); delete f['xl/_rels/workbook.xml.rels'];
    refused('no description of the sheets (workbook.xml.rels)', fflate.zipSync(f), /описания листов/); }
  { const f = withSst(); delete f['xl/sharedStrings.xml'];
    refused('cells pointing at shared strings, with no shared strings', fflate.zipSync(f), /отсутствующую строку/); }
  { const f = withSst(); f['xl/sharedStrings.xml'] = enc.encode(sstOf(3));
    refused('a cell pointing past the end of the shared strings', fflate.zipSync(f), /отсутствующую строку/); }
  { const f = withSst(); f['xl/sharedStrings.xml'] = cut(f['xl/sharedStrings.xml']);
    refused('the shared strings cut in half', fflate.zipSync(f), /таблица строк/); }
  { const f = withSst(); f['xl/workbook.xml'] = cut(f['xl/workbook.xml']);
    refused('the workbook description cut in half', fflate.zipSync(f), /описание книги/); }

  // what other tools write is still read
  { const f = withSst();
    f['xl/_rels/workbook.xml.rels'] = enc.encode(text(f['xl/_rels/workbook.xml.rels']).replace('</Relationships>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet2.xml"/></Relationships>'));
    f['xl/workbook.xml'] = enc.encode(text(f['xl/workbook.xml']).replace('</sheets>', '<sheet name="Диаграмма" sheetId="2" r:id="rId2"/></sheets>'));
    const r = read(fflate.zipSync(f), 'chartsheet');
    check(!r.err && r.wb.sheets.length === 1 && r.wb.sheets[0].rows[6][1].v === 'РЕСУРС 5', 'a chart sheet the reader does not read is still skipped, not refused'); }
  { const f = withSst();
    f['xl/worksheets/sheet1.xml'] = enc.encode('<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<x:sheetData></x:sheetData></x:worksheet>\r\n\n  ');
    f['xl/sharedStrings.xml'] = enc.encode('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>\n');
    const r = read(fflate.zipSync(f), 'prefixed');
    check(!r.err, 'a prefixed root with trailing whitespace, and an empty self-closed string table, are read' + (r.err ? ' — ' + r.err.message : '')); }
  { const f = withSst();
    f['xl/worksheets/Sheet1.xml'] = f['xl/worksheets/sheet1.xml']; delete f['xl/worksheets/sheet1.xml'];
    const r = read(fflate.zipSync(f), 'case');
    check(!r.err && !!r.wb.sheets[0] && r.wb.sheets[0].rows[6][1].v === 'РЕСУРС 5', 'a part name in another letter case is found (package names are not case-sensitive)'); }
}

console.log(fail ? `FAILED (${fail})` : 'xlsx-guard OK');
process.exit(fail ? 1 : 0);
