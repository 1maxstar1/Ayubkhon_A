/*
 * A synthetic reference-price package for the tests. Every name, document, number and date here is invented: the
 * names are generic standard designations, the documents are «Тест-Поставщик», and the prices come only from the
 * fixed set PRICES below, which is checked against the real package by test/refs-privacy.cjs (REFS_KIT set): none of
 * them, nor their rounded or truncated forms, is a real price. Never add a number from a real document here — pick
 * another invented one and let refs-privacy check it.
 *
 *   const F = require('./refs-fixture.cjs');
 *   F.makePackage()          → the package object (format smeta-refs v1)
 *   F.gzip(pkg)              → its .json.gz bytes (Buffer)
 *   F.makeSmeta()            → a small smeta workbook (.xlsx bytes) whose resources meet the package: one per kind
 *                              of line (median, wide spread, «Похожий», wage table, machine list, t·km, М8 ≠ М5),
 *                              one that meets nothing, and filler rows so the price list scrolls
 *   node test/refs-fixture.cjs --out <dir>       writes fake-20260101-1.json.gz (a gitignored dir: test/.refs/)
 *   node test/refs-fixture.cjs --doc-example     prints the example of docs/spravochnik.md
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/* the only prices a fixture may use (and their ÷1000 / medians in assertions) */
const PRICES = {
  a: 111111.11, b: 123456.78, bKm: 123456780, c: 98765.43, d: 222222.22, e: 271828.18, f: 314159.26,
  g: 138271.59, h: 248228.91, typed: 44444.44
};

const SOURCES = [
  { id: 'fake-src-0001', doc_type: 'supplier-offer', issuer: 'ООО «Тест-Поставщик-1»', customer: null, doc_no: 'ТЕСТ-1',
    issue_date: '2025-03-14', as_of_date: null, region: 'xorazm', ships_nationally: false, vat_default: false, method: 'fixture' },
  { id: 'fake-src-0002', doc_type: 'manufacturer-list', issuer: 'ООО «Тест-Поставщик-2»', customer: null, doc_no: 'ТЕСТ-2',
    issue_date: '2025-11-20', as_of_date: null, region: 'toshkent_sh', ships_nationally: true, vat_default: false, method: 'fixture' },
  { id: 'fake-src-0003', doc_type: 'machine-hour-list', issuer: 'ООО «Тест-Поставщик-3»', customer: null, doc_no: 'ТЕСТ-3',
    issue_date: '2026-01-01', as_of_date: '2026-01-01', region: 'national', ships_nationally: true, vat_default: false, method: 'fixture' },
  { id: 'fake-src-0004', doc_type: 'wage-table', issuer: 'ООО «Тест-Поставщик-4»', customer: null, doc_no: 'ТЕСТ-4',
    issue_date: null, as_of_date: null, region: 'xorazm', ships_nationally: false, vat_default: false, method: 'fixture' },
  { id: 'fake-src-0005', doc_type: 'supplier-offer', issuer: 'ООО «Тест-Поставщик-1»', customer: null, doc_no: 'ТЕСТ-5',
    issue_date: '2026-02-27', as_of_date: null, region: 'xorazm', ships_nationally: false, vat_default: false, method: 'fixture' },
  { id: 'fake-src-0006', doc_type: 'supplier-offer', issuer: 'ООО «Тест-Поставщик-6»', customer: null, doc_no: 'ТЕСТ-6',
    issue_date: '2025-12-01', as_of_date: null, region: 'xorazm', ships_nationally: false, vat_default: false, method: 'fixture' }
];

const FIELDS = ['rid', 'name', 'name_raw', 'unit', 'unit_raw', 'section', 'price', 'price_date', 'avail', 'avail_src',
  'region', 'src', 'group', 'basis', 'delivery', 'plant', 'code', 'flags', 'attrs'];

/* one object per record; the package stores rows in FIELDS order */
const P = PRICES;
const RECORDS = [
  // cable 3x2.5: an older edition per km, the newer edition of the same issuer per m, and another region's list
  { rid: 1, name: 'Кабель ВВГ 3х2,5', unit: 'км', unit_raw: 'км', section: 'materials', price: P.bKm, price_date: '2025-03-14', region: 'xorazm', src: 'fake-src-0001', group: 'cables', basis: 'offer' },
  { rid: 2, name: 'Кабель ВВГ 3х2,5', unit: 'м', unit_raw: 'м', section: 'materials', price: P.a, price_date: '2026-02-27', region: 'xorazm', src: 'fake-src-0005', group: 'cables', basis: 'offer' },
  { rid: 3, name: 'Кабель ВВГ 3х2,5', unit: 'м', unit_raw: 'м', section: 'materials', price: P.g, price_date: '2025-11-20', region: 'toshkent_sh', src: 'fake-src-0002', group: 'cables', basis: 'list', delivery: 'ex-works' },
  { rid: 4, name: 'Кабель ВВГ 3х4', unit: 'м', unit_raw: 'м', section: 'materials', price: P.c, price_date: '2025-11-20', region: 'toshkent_sh', src: 'fake-src-0002', group: 'cables', basis: 'list' },
  // steel pipe per tonne from two documents that agree within ×1.5 (median 268 190,74)
  { rid: 5, name: 'Труба стальная электросварная 57х3,5', unit: 'т', unit_raw: 'тн', section: 'materials', price: P.d, price_date: '2025-11-20', region: 'toshkent_sh', src: 'fake-src-0002', group: 'pipes', basis: 'list' },
  { rid: 6, name: 'Труба стальная электросварная 57х3,5', unit: 'т', unit_raw: 'т', section: 'materials', price: P.f, price_date: '2025-12-01', region: 'xorazm', src: 'fake-src-0006', group: 'pipes', basis: 'offer' },
  // concrete from three documents that disagree (×2.51): the p1 line, flagged, with the range
  { rid: 7, name: 'Бетон тяжёлый В15', unit: 'м3', unit_raw: 'м3', section: 'materials', price: P.c, price_date: '2025-03-14', region: 'xorazm', src: 'fake-src-0001', group: 'concrete', basis: 'offer' },
  { rid: 8, name: 'Бетон тяжёлый В15', unit: 'м3', unit_raw: 'м3', section: 'materials', price: P.h, price_date: '2025-11-20', region: 'toshkent_sh', src: 'fake-src-0002', group: 'concrete', basis: 'list' },
  { rid: 9, name: 'Бетон тяжёлый В15', unit: 'м3', unit_raw: 'м3', section: 'materials', price: P.g, price_date: '2025-12-01', region: 'xorazm', src: 'fake-src-0006', group: 'concrete', basis: 'offer', flags: ['vat_inferred'] },
  // anchors: М8 and М5 never meet
  { rid: 10, name: 'Анкер М8', unit: 'шт', unit_raw: 'шт', section: 'materials', price: P.d, price_date: '2025-11-20', region: 'toshkent_sh', src: 'fake-src-0002', group: 'misc', basis: 'list' },
  { rid: 11, name: 'Анкер М5', unit: 'шт', unit_raw: 'шт', section: 'materials', price: P.f, price_date: '2025-03-14', region: 'xorazm', src: 'fake-src-0001', group: 'misc', basis: 'offer' },
  // machine-hour list (national)
  { rid: 12, name: 'Экскаватор одноковшовый 0,65 м3', unit: 'маш-ч', unit_raw: 'маш-ч', section: 'machines', price: P.e, price_date: '2026-01-01', region: 'national', src: 'fake-src-0003', group: 'machine-list', basis: 'list' },
  // wage table, two quarters; the 2026 Q1 edition is published on 15.01.2026
  { rid: 13, name: 'Затраты труда рабочих-строителей', unit: 'чел-ч', unit_raw: 'чел.-ч', section: 'labor', price: P.a, price_date: '2025-10-01', avail: '2025-11-15', region: 'xorazm', src: 'fake-src-0004', group: 'wages', basis: 'wage-12%' },
  { rid: 14, name: 'Затраты труда рабочих-строителей', unit: 'чел-ч', unit_raw: 'чел.-ч', section: 'labor', price: P.b, price_date: '2026-01-01', avail: '2026-01-15', region: 'xorazm', src: 'fake-src-0004', group: 'wages', basis: 'wage-12%' },
  // t·km bands of one flatbed truck in one document
  { rid: 15, name: 'Автомобиль бортовой 20 т', unit: 'т-км', unit_raw: 'т-км', section: 'transport', price: P.c / 1000, price_date: '2025-12-01', region: 'xorazm', src: 'fake-src-0006', group: 'machine-conclusions', basis: 'offer', attrs: { km: 10, with_fuel: true } },
  { rid: 16, name: 'Автомобиль бортовой 20 т', unit: 'т-км', unit_raw: 'т-км', section: 'transport', price: P.a / 1000, price_date: '2025-12-01', region: 'xorazm', src: 'fake-src-0006', group: 'machine-conclusions', basis: 'offer', attrs: { km: 20, with_fuel: true } }
];

function makePackage(opts) {
  const o = opts || {};
  const recs = RECORDS;
  const rows = recs.map((r) => {
    const row = FIELDS.map((f) => (r[f] === undefined ? null : r[f]));
    while (row.length && row[row.length - 1] === null) row.pop();
    return row;
  });
  const dates = recs.map((r) => r.price_date).sort();
  return {
    format: 'smeta-refs', version: 1, full: true, package_id: o.id || 'fake-20260101-1',
    created: '2026-01-01T00:00:00Z', tool: 'test/refs-fixture.cjs',
    rid_min: recs[0].rid, rid_max: recs[recs.length - 1].rid,
    counts: { records: recs.length, sources: SOURCES.length },
    date_min: dates[0], date_max: dates[dates.length - 1],
    sources: JSON.parse(JSON.stringify(SOURCES)), fields: FIELDS.slice(), rows
  };
}

/*
 * The synthetic smeta: [name, unit, qty, smeta price]. Smeta prices are derived from the fixture prices (never
 * written as numbers), so no number here can be a real one.
 */
const SMETA = {
  labor: [['Затраты труда рабочих-строителей', 'чел-ч', 120, P.a * 0.9]],
  machines: [['Экскаватор одноковшовый 0,65 м3', 'маш-ч', 12, P.e * 1.05]],
  materials: [
    ['Кабель ВВГ 3х2,5', 'м', 500, P.b * 0.8],
    ['Кабель ВВГнг(А)-LS 3х2,5', 'м', 200, P.b * 0.85],
    ['Кабель ВВГ 3х4', 'м', 300, P.c * 1.1],
    ['Труба стальная электросварная 57х3,5', 'т', 2, P.f * 0.95],
    ['Бетон тяжёлый В15', 'м3', 40, P.g * 1.2],
    ['Анкер М8', 'шт', 100, P.d * 0.7],
    ['Перевозка грузов 20 т 15 км', 'т-км', 900, P.c / 1000 * 1.5],
    ['Краска масляная белая МА-15', 'кг', 20, P.a / 100]
  ]
};
const FILLER = 60;   // «Материал вспомогательный N»: meets nothing, makes the list long enough to scroll

function xmlEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** A one-sheet .xlsx the program's smeta reader takes: header, bands, items (Uint8Array). */
function makeSmeta() {
  const fflate = require('./load.cjs').load('fflate').__fflate;
  const enc = new TextEncoder();
  const COLS = 'ABCDEF';
  let r = 0;
  const rows = [];
  const cell = (c, v) => (typeof v === 'number'
    ? `<c r="${COLS[c]}${r}"><v>${+v.toFixed(2)}</v></c>`
    : `<c r="${COLS[c]}${r}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`);
  const row = (...vals) => { r++; rows.push(`<row r="${r}">` + vals.map((v, i) => (v == null ? '' : cell(i, v))).join('') + '</row>'); };
  row(null, 'Локальная ресурсная смета (тестовая)');
  row('№', 'Наименование', 'Ед. изм.', 'Кол-во', 'Цена', 'Сумма');
  let n = 0;
  const items = (list) => list.forEach(([nm, unit, qty, price]) => { n++; row(n, nm, unit, qty, price, qty * price); });
  row('Затраты труда'); items(SMETA.labor);
  row('Машины и механизмы'); items(SMETA.machines);
  row('Материалы');
  items(SMETA.materials);
  const filler = [];
  for (let i = 1; i <= FILLER; i++) filler.push(['Материал вспомогательный ' + i, 'шт', i, P.a / 1000 + i]);
  items(filler);
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Объект 1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + rows.join('') + '</sheetData></worksheet>'
  };
  const zip = {};
  for (const k in files) zip[k] = enc.encode(files[k]);
  return fflate.zipSync(zip);
}

function gzip(pkg) { return zlib.gzipSync(Buffer.from(JSON.stringify(pkg), 'utf8'), { level: 9 }); }

/** The example of docs/spravochnik.md: the head and the first row of the fixture. */
function docExample() {
  const p = makePackage();
  const head = Object.assign({}, p, { sources: [p.sources[0]], rows: [p.rows[0]] });
  return JSON.stringify(head, null, 2).replace(/\n {6,}/g, ' ').replace(/\n {4}\]/g, ' ]');
}

module.exports = { makePackage, makeSmeta, gzip, docExample, PRICES, SOURCES, RECORDS, FIELDS, SMETA, FILLER };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doc-example')) { console.log(docExample()); process.exit(0); }
  const i = args.indexOf('--out');
  if (i < 0) { console.error('usage: node test/refs-fixture.cjs --out <dir> | --doc-example'); process.exit(2); }
  const dir = path.resolve(args[i + 1]);
  fs.mkdirSync(dir, { recursive: true });
  const p = makePackage();
  const file = path.join(dir, p.package_id + '.json.gz');
  fs.writeFileSync(file, gzip(p));
  console.log(file);
}
