/*
 * Rebuilds the measuring sticks in test/fixtures/ from real documents.
 *
 * Everything the matching, section and region code claims about itself is
 * measured against these three files, so they are the part of the project that
 * has to stay honest. Each one is extracted from real work, never written by
 * hand, and each carries a label that came from the document itself rather
 * than from anybody's opinion:
 *
 *   resource-names.json     {n: name, u: unit} — every distinct resource of the
 *                           given estimates. Used to check that a normalisation
 *                           change merges only what it should.
 *   resource-sections.json  + {s: section, f: workbook} — the band the workbook
 *                           itself filed the row under. That is the answer the
 *                           name-based classifier has to reproduce.
 *   application-regions.json {t: title, o: client, r: region} — the 1200-odd
 *                           applications whose «place» column named their
 *                           region. The column is dropped here on purpose: the
 *                           classifier must find the answer in the text.
 *
 * Add a new workbook and re-run this, and every number the tests print moves
 * with it. Commit the fixtures together with whatever change they justify.
 *
 *   node test/fixtures.cjs --smeta a.xlsx b.xlsx --registry Report_1.xls
 *   node test/fixtures.cjs --smeta *.xlsx            (sections + names only)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test/fixtures');

function load(files) {
  const ctx = vm.createContext({
    console, TextDecoder, TextEncoder, Intl, Date, Math, JSON, Map, Set, Uint8Array,
    isFinite, parseFloat, parseInt, Array, Object, String, Number, RegExp, Error
  });
  ctx.self = ctx;
  ctx.window = ctx;
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.S;
}

const argv = process.argv.slice(2);
function group(flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]);
  return out;
}
const smeta = group('--smeta');
const registry = group('--registry');
if (!smeta.length && !registry.length) {
  console.error('usage: node test/fixtures.cjs --smeta a.xlsx [b.xlsx …] [--registry reestr.xls]');
  process.exit(1);
}

/* ------------------------------------------------- names and their sections */
if (smeta.length) {
  const S = load([
    'src/vendor/fflate.umd.js', 'src/lib/normalize.js', 'src/lib/match.js', 'src/lib/util.js',
    'src/lib/formula.js', 'src/lib/xlsx-read.js', 'src/lib/smeta.js'
  ]);

  const names = [], sections = [];
  const seenName = new Set(), seenSection = new Set();
  for (const file of smeta) {
    const tag = path.basename(file).slice(0, 8);          // enough to tell the workbooks apart
    const wb = S.readXlsx(new Uint8Array(fs.readFileSync(file)));
    const objects = S.smeta.parseWorkbook(wb, path.basename(file));
    let rows = 0;
    for (const o of objects) {
      for (const row of o.rows) {
        if (row.kind !== 'item' || !row.nm) continue;
        rows++;
        const n = String(row.nm).trim(), u = String(row.unit || '').trim();
        const s = row.section || 'other';
        const kn = n + '|' + u;
        if (!seenName.has(kn)) { seenName.add(kn); names.push({ n, u }); }
        const ks = n + '|' + u + '|' + s + '|' + tag;
        if (!seenSection.has(ks)) { seenSection.add(ks); sections.push({ n, u, s, f: tag }); }
      }
    }
    console.log(`${path.basename(file).slice(0, 40).padEnd(42)} ${objects.length} sheets, ${rows} rows`);
  }
  fs.writeFileSync(path.join(OUT, 'resource-names.json'), JSON.stringify(names));
  fs.writeFileSync(path.join(OUT, 'resource-sections.json'), JSON.stringify(sections));

  const by = {};
  for (const r of sections) by[r.s] = (by[r.s] || 0) + 1;
  console.log(`resource-names.json      ${names.length} distinct name+unit pairs`);
  console.log(`resource-sections.json   ${sections.length} labelled rows — ` +
    Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
  if (sections.length && !Object.keys(by).some((k) => k !== 'other')) {
    console.log('   ! every row came out «other» — these workbooks have no section bands,');
    console.log('     so they cannot teach the section classifier anything.');
  }
}

/* ------------------------------------------------ applications and regions */
if (registry.length) {
  const S = load(['src/vendor/xlsx.full.min.js', 'src/lib/normalize.js', 'src/lib/util.js', 'src/lib/registry-parse.js']);
  // The Russian labels the registry writes in its «place» column, and the key
  // each one stands for. This is the only place the two vocabularies meet.
  const LABEL = {
    'город Ташкент': 'toshkent_sh',
    'Ташкентская область': 'toshkent_vil',
    'Республика Каракалпакстан': 'qoraqalpogiston',
    'Бухарская область': 'buxoro',
    'Кашкадарьинская область': 'qashqadaryo',
    'Хорезмская область': 'xorazm',
    'Самаркандская область': 'samarqand',
    'Джизакская область': 'jizzax',
    'Ферганская область': 'fargona',
    'Сырдарьинская область': 'sirdaryo',
    'Навоийская область': 'navoiy',
    'Сурхандарьинская область': 'surxondaryo',
    'Андижанская область': 'andijon',
    'Наманганская область': 'namangan',
    'Общереспубликанский': 'respublika'
  };

  const out = [];
  let total = 0, unlabelled = 0;
  for (const file of registry) {
    const rows = S.parseRegistry(fs.readFileSync(file)).rows;
    for (const r of rows) {
      total++;
      const want = LABEL[String(r.place || '').trim()];
      if (!want) { unlabelled++; continue; }
      // the place column is dropped on purpose — that is the whole exercise
      out.push({ t: r.project_title || '', o: r.org_name || '', r: want });
    }
    console.log(`${path.basename(file).slice(0, 40).padEnd(42)} ${rows.length} applications`);
  }
  fs.writeFileSync(path.join(OUT, 'application-regions.json'), JSON.stringify(out));
  const by = {};
  for (const r of out) by[r.r] = (by[r.r] || 0) + 1;
  console.log(`application-regions.json ${out.length} of ${total} applications state their region ` +
    `(${unlabelled} leave the column empty)`);
  console.log('   ' + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}

console.log('\nEndi o\'lchang:  node test/normalize.cjs && node test/sections.cjs && node test/regions.cjs');
