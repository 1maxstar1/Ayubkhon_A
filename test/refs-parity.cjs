/*
 * The measurement of src/lib/refs (CLAUDE.md: the reference-price tables change only with measurement).
 *
 *   REFS_KIT=<kit> node test/refs-parity.cjs [--policies p1,p2,p3] [--no-rows] [--no-cache]
 *   node test/refs-parity.cjs --check-stamp          (test/all.sh without the kit)
 *
 * The kit is private (the owner's data; never in a repository): REFS_KIT/pkg/<id>.json.gz is the current package,
 * REFS_KIT/golden/queries.jsonl the 1 571 measured queries (975 eval + 596 of a real smeta) and
 * REFS_KIT/golden/full-p{1,2,3}.jsonl the COMPLETE output of the measured engine for them (every line, every field).
 *
 * The gate: the program's code (package → S.refs.derive → S.refs.open → S.refs.create) gives exactly the golden
 * output for every query and policy — deep equality, not only prices — and again after the IndexedDB cache form
 * (encodeCache → decodeCache). On top, when the kit has the evaluation harness, its p3 rows.jsonl equals the measured
 * one byte for byte. On a pass the stamp test/refs-parity.stamp records the hash of the code it measured.
 * Output: counts, query ids and field names only — never a value of the data.
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { load, ROOT } = require('./load.cjs');

const STAMP = path.join(ROOT, 'test/refs-parity.stamp');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

/** The code the measurement covers: src/lib/refs/**, the NLP core it calls, and its entries in test/load.cjs. */
function codeHash() {
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p);
    }
  })(path.join(ROOT, 'src/lib/refs'));
  files.push(path.join(ROOT, 'src/lib/normalize.js'), path.join(ROOT, 'src/lib/match.js'));
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(path.relative(ROOT, f) + '\0' + fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') + '\0');
  const loader = fs.readFileSync(path.join(ROOT, 'test/load.cjs'), 'utf8').split('\n').filter((l) => /refs/.test(l)).join('\n');
  h.update('test/load.cjs\0' + loader);
  return h.digest('hex').slice(0, 16);
}

function readStamp() { try { return JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch (e) { return null; } }

if (args.includes('--check-stamp')) {
  const st = readStamp(), code = codeHash();
  if (st && st.code === code) { console.log('measured ' + st.date + ', src/lib/refs unchanged'); process.exit(0); }
  console.log(st ? 'src/lib/refs changed since ' + st.date + ' — run with REFS_KIT' : 'never measured — run with REFS_KIT');
  process.exit(1);
}

const KIT = process.env.REFS_KIT;
if (!KIT) { console.error('REFS_KIT=<private kit> is required (or --check-stamp)'); process.exit(2); }

/* ------------------------------------------------------------------ deep equality, reporting field names only */
function plain(x) { return JSON.parse(JSON.stringify(x)); }
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
  return true;
}
function diffFields(got, want) {
  const f = new Set();
  if (got.length !== want.length) f.add('n_lines');
  for (let i = 0; i < Math.min(got.length, want.length); i++) {
    for (const k of new Set(Object.keys(got[i]).concat(Object.keys(want[i])))) if (!same(got[i][k], want[i][k])) f.add(k);
  }
  return [...f];
}

/* ------------------------------------------------------------------ the package and the queries */
const pkgFile = opt('--pkg') || (() => {
  const d = path.join(KIT, 'pkg');
  const fl = fs.readdirSync(d).filter((f) => /\.json\.gz$/.test(f)).sort();
  if (!fl.length) throw new Error('no package in REFS_KIT/pkg');
  return path.join(d, fl[fl.length - 1]);
})();
const G = path.join(KIT, 'golden');
const queries = fs.readFileSync(path.join(G, 'queries.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const policies = (opt('--policies', 'p1,p2,p3')).split(',');

const S = load(load.CORE, load.REFS);
const R = S.refs;
const T = {};
let t = Date.now();
const lap = (k) => { const n = Date.now(); T[k] = n - t; t = n; };
const gz = fs.readFileSync(pkgFile);
const sha = crypto.createHash('sha256').update(gz).digest('hex');
const raw = zlib.gunzipSync(gz);
const text = raw.toString('utf8');
const bad = R.pkg.checkDecoded(text.length, raw.length);
if (bad) { console.error('package: ' + bad); process.exit(1); }
const pkg = JSON.parse(text);
lap('unpack_ms');
const v = R.pkg.validate(pkg, { bytes: raw.length });
lap('validate_ms');
if (!v.ok) { console.error('package does not validate: ' + v.errors.length + ' errors, first: row ' + v.errors[0].row + ' field ' + v.errors[0].field); process.exit(1); }
let recs = R.derive(pkg);
lap('derive_ms');
console.log('package ' + path.basename(pkgFile) + ' (sha256 ' + sha.slice(0, 12) + '…): ' + recs.length + ' records, ' + pkg.sources.length + ' sources; queries ' + queries.length);

let failed = 0;
function run(label, handle, policy) {
  const golden = fs.readFileSync(path.join(G, 'full-' + policy + '.jsonl'), 'utf8').split('\n').filter(Boolean);
  if (golden.length !== queries.length) { console.log('FAIL ' + label + ': golden has ' + golden.length + ' lines'); failed++; return; }
  const sug = R.create({ policy });
  sug.init({ handle, sources: pkg.sources });
  let identical = 0;
  const fields = {}, first = [];
  const t0 = Date.now();
  for (let i = 0; i < queries.length; i++) {
    const g = JSON.parse(golden[i]);
    if (g.qid !== queries[i].id) { console.log('FAIL ' + label + ': golden line ' + (i + 1) + ' is for another query'); failed++; return; }
    const got = plain(sug.suggest(queries[i]));
    if (same(got, g.lines)) { identical++; continue; }
    const df = diffFields(got, g.lines);
    for (const k of df) fields[k] = (fields[k] || 0) + 1;
    if (first.length < 8) first.push(g.qid + ': ' + df.join(','));
  }
  const ms = Date.now() - t0;
  const ok = identical === queries.length;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + ': ' + identical + ' / ' + queries.length + ' queries identical to the golden (' + ms + ' ms)' +
    (ok ? '' : '; differing fields ' + JSON.stringify(fields) + '; first ' + first.join(' | ')));
}

let h = R.open(recs);
lap('index_ms');
for (const p of policies) run(p + ' (package → derive)', h, p);
if (!args.includes('--no-cache')) {
  const enc = R.encodeCache(recs);
  h = null; recs = null;
  const back = R.decodeCache(enc);
  run('p3 (through the cache form)', R.open(back), 'p3');
}

/* ------------------------------------------------------------------ the evaluation harness, if the kit has it */
const RUN = path.join(KIT, 'tools/match/eval/run.cjs');
const R4 = path.join(KIT, 'work/match/eval/r4/p3');
if (!args.includes('--no-rows') && fs.existsSync(RUN) && fs.existsSync(path.join(R4, 'rows.jsonl'))) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-parity-'));
  const r = spawnSync(process.execPath, ['--max-old-space-size=6000', RUN, '--suggester', path.join(ROOT, 'test/refs-parity-suggester.cjs'),
    '--set', 'A1,A2,E,D,B', '--out', out], { env: Object.assign({}, process.env, { REFS_REPO: ROOT, REFS_PKG: pkgFile }), encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { failed++; console.log('FAIL eval harness exited ' + r.status + ' (leakage guard or error; see its own output)'); }
  else {
    const rowsSame = fs.readFileSync(path.join(out, 'rows.jsonl')).equals(fs.readFileSync(path.join(R4, 'rows.jsonl')));
    const strip = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^Run |^Timing:/.test(l)).join('\n');
    const sumSame = strip(path.join(out, 'summary.md')) === strip(path.join(R4, 'summary.md'));
    if (!rowsSame || !sumSame) failed++;
    console.log((rowsSame ? 'ok   ' : 'FAIL ') + 'eval p3 rows.jsonl byte-identical to the measured r4 rows');
    console.log((sumSame ? 'ok   ' : 'FAIL ') + 'eval p3 summary.md identical (without the run header and timing)');
  }
  fs.rmSync(out, { recursive: true, force: true });
} else console.log('--   eval harness not run (' + (args.includes('--no-rows') ? '--no-rows' : 'not in the kit') + ')');

console.log('timing ' + JSON.stringify(T));
if (failed) { console.log('FAILED ' + failed); process.exit(1); }
const stamp = { code: codeHash(), date: new Date().toISOString().slice(0, 10), policies, queries: queries.length, result: 'identical' };
if (policies.join(',') === 'p1,p2,p3') {
  fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 1) + '\n');
  console.log('stamp written: test/refs-parity.stamp (code ' + stamp.code + ')');
}
