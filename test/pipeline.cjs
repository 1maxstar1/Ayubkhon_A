/*
 * Headless run of the whole core pipeline against the real workbooks, so the
 * parser / assembler / writer can be checked without a browser.
 *
 *   node test/pipeline.cjs <smeta.xlsx> [<smeta2.xlsx> …] [--out out.xlsx]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('./load.cjs');

const S = load(load.PIPELINE);

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

/*
 * The comparison document's layout is one thing said in one place. The report
 * builds its rows from the column numbers in report.js; the ranges the pink
 * conditional formatting paints, the merged title cells and the auto-filter
 * used to be written out again as letters, in two files, with nothing to say
 * so if a column ever moved. They are derived now — these are the letters they
 * must still come out as, so the sample document keeps looking the way it
 * looks.
 */
const rep = S.report.build(model, model.spans[0], { mode });
const C = S.report.cols;
const band = (from, to) => S.col(from) + '8:' + S.col(to || from) + '1048576';
const layout = [
  [band(C.SUM) + ' ' + band(C.MSUM, C.DIFF), 'H8:H1048576 J8:K1048576', 'the sums the pink rule watches'],
  [band(C.PRICE) + ' ' + band(C.MPRICE), 'G8:G1048576 I8:I1048576', 'the unit prices it watches'],
  [rep.merges.join(','), 'B2:L2,A3:L4', 'the merged title cells'],
  [rep.autoFilter.replace(/\d+$/, ''), 'A10:K', 'the auto-filter']
];
let bad = 0;
for (const [got, want, what] of layout) {
  if (got !== want) { bad++; console.log(`FAIL ${what}: ${got}, expected ${want}`); }
}
console.log(bad ? `FAILED (${bad}) — the document layout moved` : `layout unchanged: ${layout.length} ranges`);
if (bad) process.exit(1);
