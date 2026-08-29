/*
 * Headless run of the whole core pipeline against the real workbooks, so the
 * parser / assembler / writer can be checked without a browser.
 *
 *   node test/pipeline.cjs <smeta.xlsx> [<smeta2.xlsx> …] [--out out.xlsx]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/vendor/fflate.umd.js',
  'src/lib/util.js',
  'src/lib/formula.js',
  'src/lib/xlsx-read.js',
  'src/lib/xlsx-write.js',
  'src/lib/smeta.js',
  'src/lib/assemble.js',
  'src/lib/report.js',
  'src/lib/export.js',
];

const ctx = vm.createContext({
  console, TextDecoder, TextEncoder, Intl, Date, Math, JSON, Map, Set, Uint8Array,
  isFinite, parseFloat, parseInt, Array, Object, String, Number, RegExp, Error,
});
ctx.self = ctx;
ctx.window = ctx;
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const S = ctx.S;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : path.join(ROOT, 'test/out.xlsx');
const inputs = (outIdx >= 0 ? args.slice(0, outIdx).concat(args.slice(outIdx + 2)) : args)
  .filter((a) => !a.startsWith('--'));
const mode = args.includes('--full') ? 'full' : args.includes('--dedup') ? 'dedup' : 'changed';

if (!inputs.length) { console.error('usage: node test/pipeline.cjs <file.xlsx>…'); process.exit(1); }

const projects = inputs.map((file, i) => {
  const t0 = Date.now();
  const bytes = new Uint8Array(fs.readFileSync(file));
  const wb = S.readXlsx(bytes);
  const objects = S.smeta.parseWorkbook(wb, path.basename(file));
  console.log(`${path.basename(file)}: ${wb.sheets.length} sheets, ${objects.length} resource sheets, ${Date.now() - t0} ms`);
  objects.forEach((o) => console.log(`    · ${o.name.padEnd(22)} ${String(o.rows.length).padStart(5)} rows  ${String(o.items).padStart(5)} items  "${o.subtitle.slice(0, 40)}"`));
  return {
    id: 'p' + i,
    name: (objects[0] && objects[0].subtitle ? 'Loyiha ' + (i + 1) : 'Loyiha ' + (i + 1)),
    title: objects[0] ? objects[0].title : '',
    objects,
  };
});

let t = Date.now();
const model = S.assemble(projects, {});
console.log(`assemble: ${model.rows.length} rows, ${model.resources.length} resources, nExtra=${model.nExtra}, ${Date.now() - t} ms`);

// Pretend the user re-priced a handful of resources.
const prices = {};
let n = 0;
for (const r of model.resources) { if (n++ % 17 === 0 && r.price > 0) prices[r.key] = Math.round(r.price * 0.9); }
t = Date.now();
S.applyPrices(model, prices);
console.log(`applyPrices(${Object.keys(prices).length}): ${Date.now() - t} ms`);

t = Date.now();
const bytes = S.buildWorkbook(model, {
  mode,
  stamp: '2026 y.  "____"_______________ dagi   \n\n  №________________________ xulosaga \n2-qo\'yilma',
  docTitle: 'TAQQOSLASH JADVALI  №2',
  noteText: 'Пересмотреть стоимость по всему проекту',
  autoNote: true,
});
fs.writeFileSync(out, Buffer.from(bytes));
console.log(`export(${mode}): ${(bytes.length / 1024).toFixed(0)} KB, ${Date.now() - t} ms -> ${out}`);
