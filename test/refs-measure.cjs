/*
 * Reference prices on a real smeta, the way the program asks (S.refs.queryOf): timings, memory and coverage, so
 * the budget can be checked on the owner's own machine with his own files.
 *
 *   REFS_KIT=<kit> node test/refs-measure.cjs <smeta.xlsx> [more.xlsx…] [--region xorazm] [--asof YYYY-MM-DD]
 *                  [--policy p3] [--compare <queries.json>]
 *
 * The package is REFS_KIT/pkg/<newest>.json.gz (or --pkg). --compare takes the measurement's own query file for the
 * same smeta and reports how the program's queries differ from it (sections, units, distinct pairs, coverage).
 * Prints counts and timings only — never a name, a price or a document.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { load } = require('./load.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const KIT = process.env.REFS_KIT;
const VALUED = new Set(['--region', '--asof', '--policy', '--compare', '--pkg']);
const smetas = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(args[i - 1])));
if (!KIT && !opt('--pkg')) { console.error('REFS_KIT=<private kit> (or --pkg <package.json.gz>) is required'); process.exit(2); }
if (!smetas.length) { console.error('usage: REFS_KIT=<kit> node test/refs-measure.cjs <smeta.xlsx>…'); process.exit(2); }

const mem = () => { if (global.gc) global.gc(); const m = process.memoryUsage(); return Math.round(m.heapUsed / 1048576); };
const S = load(load.PIPELINE, 'regions', load.REFS);
const R = S.refs;
const T = {};
let t = Date.now();
const lap = (k) => { const n = Date.now(); T[k] = n - t; t = n; };

// the smeta, read by the program's own parser
const projects = smetas.map((file, i) => ({
  id: 'p' + i, name: 'p' + i, title: '', enabled: true,
  objects: S.smeta.parseWorkbook(S.readXlsx(new Uint8Array(fs.readFileSync(file))), path.basename(file))
}));
const model = S.assemble(projects, {});
lap('smeta_ms');

const pkgFile = opt('--pkg') || (() => {
  const d = path.join(KIT, 'pkg');
  const fl = fs.readdirSync(d).filter((f) => /\.json\.gz$/.test(f)).sort();
  return path.join(d, fl[fl.length - 1]);
})();
const raw = zlib.gunzipSync(fs.readFileSync(pkgFile));
const pkg = JSON.parse(raw.toString('utf8'));
lap('unpack_ms');
const v = R.pkg.validate(pkg, { bytes: raw.length });
lap('validate_ms');
if (!v.ok) { console.error('package does not validate: ' + v.errors.length + ' errors'); process.exit(1); }
const heap0 = mem();
let recs = R.derive(pkg);
lap('derive_ms');
const enc = R.encodeCache(recs);
lap('encode_ms');
recs = null;
const back = R.decodeCache(enc);
lap('decode_ms');
const h = R.open(back);
lap('index_ms');
const heapIndex = mem();

const ctx = { region: opt('--region', 'xorazm'), asof: opt('--asof', null) };
const sug = R.create({ policy: opt('--policy', 'p3') });
sug.init({ handle: h, sources: pkg.sources });
const seen = new Map(), by = {}, bySection = {};
for (const r of model.resources) {
  const q = R.queryOf(r, ctx);
  const s = R.querySection(r);
  by[s.by] = (by[s.by] || 0) + 1;
  if (!seen.has(q.id)) { seen.set(q.id, q); bySection[q.section] = (bySection[q.section] || 0) + 1; }
}
const lat = [];
let covered = 0, lines = 0;
const tiers = {};
for (const q of seen.values()) {
  const a = process.hrtime.bigint();
  const out = sug.suggest(q);
  lat.push(Number(process.hrtime.bigint() - a) / 1e6);
  if (out.length) { covered++; tiers[out[0].tier] = (tiers[out[0].tier] || 0) + 1; }
  lines += out.length;
}
lap('queries_ms');
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : 0; };
const report = {
  package: { records: v.rows, sources: v.sources, gzip_kb: Math.round(fs.statSync(pkgFile).size / 1024), raw_mb: +(raw.length / 1048576).toFixed(1) },
  smeta: { files: smetas.length, resources: model.resources.length, queries: seen.size, query_section: bySection, section_decided_by: by },
  asof: ctx.asof || 'registration date / today (per workspace)',
  timing_ms: T,
  cold_total_ms: T.unpack_ms + T.validate_ms + T.derive_ms + T.encode_ms + T.index_ms + T.queries_ms,
  warm_total_ms: T.decode_ms + T.index_ms + T.queries_ms,
  query_ms: { mean: +(lat.reduce((x, y) => x + y, 0) / (lat.length || 1)).toFixed(2), p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: pct(lat, 1) },
  heap_mb: { before_derive: heap0, after_index: heapIndex },
  covered, lines, top_tier: tiers
};

const cmpFile = opt('--compare');
if (cmpFile) {
  // the measurement's own queries for this smeta: how the program's queries differ (counts only)
  const ref = JSON.parse(fs.readFileSync(cmpFile, 'utf8'));
  const key = (q) => S.matchPair(q.name, q.unit);
  const mine = new Map();
  for (const q of seen.values()) mine.set(key(q), q);
  const theirs = new Map(ref.map((q) => [key(q), q]));
  let both = 0, sameSection = 0, sameUnit = 0;
  const confusion = {};
  for (const [k, q] of theirs) {
    const m = mine.get(k);
    if (!m) continue;
    both++;
    if (m.section === q.section) sameSection++;
    const cell = q.section + '→' + m.section;
    confusion[cell] = (confusion[cell] || 0) + 1;
    if (R.units.norm(m.unit) === R.units.norm(q.unit)) sameUnit++;
  }
  let refCovered = 0;
  const sugRef = R.create({ policy: opt('--policy', 'p3') });
  sugRef.init({ handle: h, sources: pkg.sources });
  for (const q of ref) if (sugRef.suggest(Object.assign({}, q, { asof: ctx.asof || q.asof })).length) refCovered++;
  report.compare = { measurement_queries: theirs.size, program_queries: mine.size, shared_pairs: both, same_section: sameSection,
    same_unit: sameUnit, section_measurement_to_program: confusion, covered_with_measurement_queries: refCovered };
}
console.log(JSON.stringify(report, null, 1));
