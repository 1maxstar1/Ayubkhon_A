/*
 * The page reads an estimate in a worker; the tests read it by calling the parser. Both must see the same thing.
 *
 * They did not. The worker posted back a hand-picked list of each object's fields, and a field added to the
 * parser later — `equipTitle`, the mark of a local estimate «на ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ» — was never
 * added to that list. Every node test passed, because none of them goes through the worker, and in the page
 * the rule that rests on the field (the note on large equipment) did nothing.
 *
 * So this test runs the worker itself, as built into the pages, on a workbook, and compares what it posts with
 * what the parser returns, field by field. A field the parser gains tomorrow is covered the day it is added.
 *
 * The estimate is invented.
 *
 *   node build.mjs && node test/worker-parity.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, ROOT } = require('./load.cjs');
const books = require('./compare-books.cjs');

const S = load(load.PIPELINE);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/** The worker's source as the built page carries it: window.__WORKER_SRC__ = "…". */
function workerSource(page) {
  const html = fs.readFileSync(path.join(ROOT, 'dist', page), 'utf8');
  const at = html.indexOf('window.__WORKER_SRC__ = "');
  if (at < 0) throw new Error(page + ': no worker source in the page — run node build.mjs');
  const from = html.indexOf('"', at);
  let i = from + 1;
  while (html[i] !== '"') i += html[i] === '\\' ? 2 : 1;
  return JSON.parse(html.slice(from, i + 1));
}

/** Run the worker on one file and hand back what it posts. */
function throughWorker(src, name, bytes) {
  const posted = [];
  const ctx = vm.createContext({
    console, Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error, isNaN, isFinite,
    parseFloat, parseInt, Uint8Array, Int8Array, Int32Array, Uint16Array, Uint32Array, Float64Array, DataView,
    ArrayBuffer, Map, Set, Symbol, Promise, Intl, TextDecoder, TextEncoder, setTimeout, clearTimeout
  });
  ctx.self = ctx;
  // what the page receives is a structured clone: plain data, nothing shared with the worker
  ctx.postMessage = (m) => posted.push(JSON.parse(JSON.stringify(m)));
  vm.runInContext(src, ctx, { filename: 'worker' });
  const copy = new Uint8Array(bytes);     // the page transfers the buffer; the worker owns its copy
  ctx.onmessage({ data: { cmd: 'parse', id: 7, name, buffer: copy.buffer } });
  return posted[0];
}

// form 4А: two local estimates on one sheet, the second one «на ТЕСТОВОЕ ОБОРУДОВАНИЕ»
const bytes = books.xlsx(S, books.book(1));
const direct = JSON.parse(JSON.stringify(S.smeta.parseWorkbook(S.readXlsx(new Uint8Array(bytes)), 'a.xlsx')));

check(direct.length === 2 && direct[0].equipTitle === false && direct[1].equipTitle === true,
  'the parser marks the equipment estimate: ' + JSON.stringify(direct.map((o) => o.equipTitle)));

['smeta-taqqoslash.html', 'index.html'].forEach((page) => {
  const msg = throughWorker(workerSource(page), 'a.xlsx', bytes);
  check(msg && msg.ok === true && msg.id === 7 && msg.name === 'a.xlsx' && msg.sheetCount === 1,
    page + ': the worker answers the question it was asked');
  const got = msg && msg.objects || [];
  check(got.length === direct.length, page + ': as many objects as the parser finds (' + got.length + ')');
  direct.forEach((want, i) => {
    const have = got[i] || {};
    const lost = Object.keys(want).filter((k) => !(k in have));
    const added = Object.keys(have).filter((k) => !(k in want));
    const differ = Object.keys(want).filter((k) => k in have && JSON.stringify(want[k]) !== JSON.stringify(have[k]));
    check(!lost.length && !added.length && !differ.length, page + ': object ' + (i + 1) + ' is the parser\'s object, field for field' +
      (lost.length ? ' — not posted: ' + lost.join(', ') : '') + (added.length ? ' — only in the worker: ' + added.join(', ') : '') +
      (differ.length ? ' — different: ' + differ.join(', ') : ''));
  });
  // and the rule that rests on the lost field works on what the page receives
  const model = S.assemble([{ id: 'p', name: 'Тест', title: 'ТЕСТ', objects: got }], {});
  const marked = model.rows.filter((r) => r.kind === 'item' && r.equipBlock).map((r) => r.nm);
  check(marked.length === 2 && marked.indexOf('ТЕСТОВЫЙ ЩИТ') >= 0,
    page + ': the lines of the equipment estimate are marked as equipment (' + marked.length + ')');
});

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
