/*
 * Privacy gate of the reference-price work: nothing of the owner's data may enter this public repository.
 *
 *   node test/refs-privacy.cjs                       the branch against its base (default 6561791)
 *   node test/refs-privacy.cjs --staged --msg <f>    before a commit: the staged change and its message
 *   REFS_KIT=<private kit> node test/refs-privacy.cjs …   adds the checks against the real package
 *
 * A price rule over the whole tree cannot work (dist and the vendor bundles hold hundreds of numbers that happen to
 * equal some price), so the gate looks at what the branch ADDS:
 *   A  the added lines of the diff (not dist, not src/vendor) and every file of the reference-price work
 *      (src/lib/refs/**, src/refs-worker.js, src/ui/refs*.js, test/refs*, docs/spravochnik.md);
 *   B  the commit messages (and --msg);
 *   C  dist equals a fresh build of src (build.mjs has no clock or random input), and src/vendor is unchanged.
 * Always: no tracked package or data file (*.json.gz, *.jsonl, refs-*.json); no 12-hex token (a source id) in A or B;
 * every number of five or more digits in test/refs-fixture.cjs is one of its declared synthetic prices.
 * With REFS_KIT (the package): in A and B no source id, document number, issuer or plant string (≥ 6 chars), none
 * of the 2k longest record names and no number of five or more digits equal to a rounded package price (or with VAT);
 * on the whole tree including dist the string kinds; and no synthetic fixture price equal to a real one (exact,
 * rounded or truncated) — the fixture is never allow-listed: pick another invented number.
 * A hit that is generic code (a rounding constant, a common word) is allow-listed in test/refs-privacy.allow by the
 * hash of its line text, never by its value: «<sha256-16 of the trimmed line>  <kind>  <reason>».
 * Output: kinds and file:line (or commit:<hash>) only, never a value. Exit 1 on any hit.
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.dirname(__dirname);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', '6561791');
const STAGED = args.includes('--staged');
const MSG = opt('--msg');
const KIT = process.env.REFS_KIT;
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

const hits = [];
const allowed = new Set();
const ALLOW = path.join(ROOT, 'test/refs-privacy.allow');
if (fs.existsSync(ALLOW)) {
  for (const l of fs.readFileSync(ALLOW, 'utf8').split('\n')) {
    const m = /^([0-9a-f]{16})\s+(\S+)/.exec(l.trim());
    if (m) allowed.add(m[1] + ' ' + m[2]);
  }
}
const lineHash = (t) => crypto.createHash('sha256').update(t.trim()).digest('hex').slice(0, 16);
let allowUsed = 0;
function hit(kind, where, text) {
  if (text != null && allowed.has(lineHash(text) + ' ' + kind)) { allowUsed++; return; }
  hits.push(kind + '  ' + where);
}

/* ------------------------------------------------------------------ scope A: added lines + the refs files */
const REFS_FILE = /^(src\/lib\/refs\/|src\/refs-worker\.js$|src\/ui\/refs[^/]*\.js$|test\/refs|docs\/spravochnik\.md$)/;
const A = new Map();   // 'file:line' -> text
{
  const diff = git('diff', '--cached', '-U0', STAGED ? 'HEAD' : BASE, '--', '.', ':!dist', ':!src/vendor');
  let file = null, ln = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { ln = +h[1]; continue; }
    if (file && file !== '/dev/null' && l.startsWith('+')) { A.set(file + ':' + ln, l.slice(1)); ln++; }
  }
  const files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter((f) => REFS_FILE.test(f));
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((t, i) => A.set(f + ':' + (i + 1), t));
  }
}
/* ------------------------------------------------------------------ scope B: messages */
const B = new Map();
if (!STAGED) {
  const log = git('log', BASE + '..HEAD', '--format=%H%n%B%n<<END>>');
  let hash = null, i = 0;
  for (const l of log.split('\n')) {
    if (l === '<<END>>') { hash = null; continue; }
    if (!hash) { hash = l.slice(0, 12); i = 0; continue; }
    B.set('commit:' + hash + ':' + (++i), l);
  }
}
if (MSG) fs.readFileSync(MSG, 'utf8').split('\n').forEach((t, i) => B.set('message:' + (i + 1), t));

/* ------------------------------------------------------------------ always */
for (const f of git('ls-files').split('\n')) {
  if (/\.json\.gz$|\.jsonl$|(^|\/)refs-[^/]*\.json$/.test(f)) hit('tracked-data-file', f);
}
for (const [where, t] of [...A, ...B]) {
  if (/(^|[^0-9a-f])[0-9a-f]{12}([^0-9a-f]|$)/.test(t) && /\b[0-9a-f]{12}\b/.test(t)) hit('hex12', where, t);
}
const FIXTURE = path.join(ROOT, 'test/refs-fixture.cjs');
const fixturePrices = Object.values(require(FIXTURE).PRICES);
const FIVE = 10 * 1000;   // the smallest number the price rule looks at
const numRe = /(?<![\w.,])(\d{1,3}(?:[   ]\d{3})+|\d{5,})((?:[.,]\d+)?)(?![\w])/g;
function numbers(t) {
  const out = [];
  let m;
  numRe.lastIndex = 0;
  while ((m = numRe.exec(t))) out.push(+(m[1].replace(/[   ]/g, '') + m[2].replace(',', '.')));
  return out;
}
fs.readFileSync(FIXTURE, 'utf8').split('\n').forEach((t, i) => {
  if (/^\s*(\*|\/\/|\/\*)/.test(t)) return;
  for (const v of numbers(t)) if (v >= FIVE && fixturePrices.indexOf(v) < 0 && !/package_id|fake-\d{8}|created/.test(t)) hit('fixture-number-not-declared', 'test/refs-fixture.cjs:' + (i + 1));
});

/* ------------------------------------------------------------------ scope C: dist and vendor */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-privacy-build-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'build.mjs'), path.join(tmp, 'build.mjs'));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
    const r = spawnSync(process.execPath, ['build.mjs'], { cwd: tmp, encoding: 'utf8' });
    if (r.status !== 0) hit('build-failed', 'build.mjs');
    else {
      for (const f of fs.readdirSync(path.join(tmp, 'dist'))) {
        const a = path.join(ROOT, 'dist', f);
        if (!fs.existsSync(a) || !fs.readFileSync(a).equals(fs.readFileSync(path.join(tmp, 'dist', f)))) hit('dist-not-a-fresh-build', 'dist/' + f);
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (spawnSync('git', ['diff', '--quiet', BASE, '--', 'src/vendor'], { cwd: ROOT }).status !== 0) hit('vendor-changed', 'src/vendor');
}

/* ------------------------------------------------------------------ with the real package */
let dataChecked = false;
if (KIT) {
  const dir = path.join(KIT, 'pkg');
  const files = fs.readdirSync(dir).filter((f) => /\.json\.gz$/.test(f));
  if (!files.length) { console.error('REFS_KIT/pkg has no package'); process.exit(2); }
  const ids = new Set(), strings = new Set(), prices = new Set(), realPrices = [];
  const allNames = new Set();
  const STOP = new Set(['UNKNOWN', 'NOT NAMED', 'UNNAMED', 'NONE', 'NULL']);
  const norm = (s) => String(s || '').replace(/\(.*?\)/g, ' ').replace(/[«»"]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  for (const f of files) {
    const p = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8'));
    const F = {};
    p.fields.forEach((k, i) => { F[k] = i; });
    for (const s of p.sources) {
      ids.add(s.id);
      for (const k of ['issuer', 'customer', 'doc_no']) { const v = norm(s[k]); if (v.length >= 6 && !STOP.has(v)) strings.add(v); }
    }
    for (const r of p.rows) {
      const pr = r[F.price];
      realPrices.push(pr);
      for (const v of [pr, pr * 1.12]) if (v >= FIVE) prices.add(Math.round(v));
      const pl = norm(r[F.plant]);
      if (pl.length >= 6 && !STOP.has(pl)) strings.add(pl);
      for (const k of ['name', 'name_raw']) if (r[k === 'name' ? F.name : F.name_raw]) allNames.add(String(r[k === 'name' ? F.name : F.name_raw]).replace(/\s+/g, ' ').trim().toUpperCase());
    }
  }
  const longest = [...allNames].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, 2 * 1000);
  const idList = [...ids], strList = [...strings];
  function scanStrings(where, t) {
    const up = t.toUpperCase();
    for (const id of idList) if (t.indexOf(id) >= 0) { hit('source-id', where, t); break; }
    for (const s of strList) if (up.indexOf(s) >= 0) { hit('issuer-or-plant', where, t); break; }
    if (up.length >= 20) for (const n of longest) if (up.indexOf(n) >= 0) { hit('record-name', where, t); break; }
  }
  for (const [where, t] of [...A, ...B]) {
    scanStrings(where, t);
    for (const v of numbers(t)) if (v >= FIVE && prices.has(Math.round(v))) { hit('real-price', where, t); break; }
  }
  // the whole tree, dist included: the string kinds only
  const tree = git('ls-files').split('\n').filter((f) => f && !/\.(png|xls|xlsx|jpg|gif|ico|zip|gz)$/i.test(f));
  for (const f of tree) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p) || fs.statSync(p).size > 8 << 20) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((t, i) => scanStrings(f + ':' + (i + 1), t));
  }
  // the synthetic prices are not real ones
  for (const x of fixturePrices) {
    if (realPrices.some((p) => p === x || Math.round(p) === Math.round(x) || Math.floor(p) === Math.floor(x))) hit('fixture-price-is-real', 'test/refs-fixture.cjs');
  }
  dataChecked = true;
}

const scope = STAGED ? 'staged change' : 'branch ' + BASE + '..HEAD';
console.log('scope: ' + scope + '; A ' + A.size + ' lines, B ' + B.size + ' message lines; data rules ' +
  (dataChecked ? 'ON (REFS_KIT)' : 'off (no REFS_KIT)') + '; allow-listed ' + allowUsed);
for (const h of hits) console.log('HIT  ' + h);
console.log(hits.length ? 'FAILED: ' + hits.length + ' hits' : 'ok: 0 hits');
process.exit(hits.length ? 1 : 0);
