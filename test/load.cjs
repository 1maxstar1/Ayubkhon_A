/*
 * Loading src/lib the way a browser does, for tests that run in node.
 *
 * The program has no modules: every file is a plain script that hangs things
 * off one global `S`, and build.mjs just concatenates them. A node test
 * therefore has to build the same global by hand — six of them were each
 * writing their own version of that, and each version had drifted a little,
 * so a test could pass because it was missing the file that would have
 * failed it.
 *
 *   const { load } = require('./load.cjs');
 *   const S = load('normalize', 'match', 'sections');   // by short name
 *   const S = load(load.CORE, 'assemble');              // or a named set
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.dirname(__dirname);

/**
 * What the vendor bundles expect to find. fflate and SheetJS are UMD, so they
 * look for `module`/`exports` first and fall back to a global — the context
 * deliberately has neither, which is how they behave in the browser.
 */
function context() {
  const ctx = vm.createContext({
    console, Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error,
    isNaN, isFinite, parseFloat, parseInt, decodeURIComponent, encodeURIComponent,
    Uint8Array, Int8Array, Int32Array, Uint16Array, Uint32Array, Float64Array,
    DataView, ArrayBuffer, Map, Set, Symbol, Promise, Intl, Buffer,
    TextDecoder, TextEncoder, setTimeout, clearTimeout
  });
  ctx.self = ctx;
  ctx.window = ctx;
  ctx.global = ctx;
  return ctx;
}

/* Short names, so a test says what it needs rather than where it lives. */
const FILE = {
  fflate: 'src/vendor/fflate.umd.js',
  xlsx: 'src/vendor/xlsx.full.min.js',
  normalize: 'src/lib/normalize.js',
  match: 'src/lib/match.js',
  sections: 'src/lib/sections.js',
  regions: 'src/lib/regions.js',
  util: 'src/lib/util.js',
  formula: 'src/lib/formula.js',
  'xlsx-read': 'src/lib/xlsx-read.js',
  'xlsx-write': 'src/lib/xlsx-write.js',
  smeta: 'src/lib/smeta.js',
  assemble: 'src/lib/assemble.js',
  report: 'src/lib/report.js',
  export: 'src/lib/export.js',
  'registry-parse': 'src/lib/registry-parse.js'
};

/**
 * The order build.mjs loads them in. normalize.js must come first — it creates
 * `S` and defines the name key that assemble.js keys every row by.
 */
const ORDER = ['fflate', 'xlsx', 'normalize', 'match', 'sections', 'regions', 'util',
  'formula', 'xlsx-read', 'xlsx-write', 'smeta', 'assemble', 'report', 'export',
  'registry-parse'];

/** Everything needed to read a workbook and build the comparison document. */
const PIPELINE = ['fflate', 'normalize', 'match', 'sections', 'util', 'formula',
  'xlsx-read', 'xlsx-write', 'smeta', 'assemble', 'report', 'export'];
/** Just the name keys and the matching layer. */
const CORE = ['normalize', 'match', 'sections', 'util'];
/** Reading a registry export (.xls / .xlsx) with SheetJS. */
const REGISTRY = ['xlsx', 'normalize', 'util', 'registry-parse'];

function load(...names) {
  const wanted = new Set(names.flat());
  for (const n of wanted) if (!FILE[n]) throw new Error('test/load.cjs: no such file: ' + n);
  const ctx = context();
  for (const n of ORDER) {
    if (!wanted.has(n)) continue;
    const rel = FILE[n];
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  // fflate and SheetJS are vendor globals rather than part of S; a test that
  // builds a workbook by hand needs them, so they ride along on S. A test may
  // want only the vendor bundles, and then nothing has created S yet.
  if (!ctx.S) ctx.S = {};
  if (ctx.fflate) ctx.S.__fflate = ctx.fflate;
  if (ctx.XLSX) ctx.S.__XLSX = ctx.XLSX;
  return ctx.S;
}

load.CORE = CORE;
load.PIPELINE = PIPELINE;
load.REGISTRY = REGISTRY;
load.ROOT = ROOT;
load.FILE = FILE;

module.exports = { load, ROOT };
