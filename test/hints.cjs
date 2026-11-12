/*
 * What the «Похожие ресурсы» tier would actually put in front of an expert.
 *
 *   node test/hints.cjs <smeta.xlsx> [<smeta2.xlsx> …]     measure these, and every other recorded set found here
 *   node test/hints.cjs --recorded                          measure every recorded set whose files are found here
 *   node test/hints.cjs <a.xlsx> <b.xlsx> --record [--accept "<why>"]   record these estimates (and every recorded set
 *                                                           found here) as the baseline of the code the stamp names —
 *                                                           a new set, or one recorded by this same code; changed code,
 *                                                           or a baseline moved to other code, only with --accept
 *   node test/hints.cjs --check-stamp                       has the similarity code changed since it was measured?
 *
 * The similarity layer cannot be judged by reading it: whether «ПЕРЕХОД
 * ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ» is close to «АДАПТЕР ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ» is
 * a question about a price book, not about strings. So it is judged by the
 * prices: every priced resource is asked what it would be offered, with its own
 * key held out of the pool and out of the idf. If the top suggestion is really
 * the same resource, the two prices agree.
 *
 * What is judged:
 *
 *   1. Within one workbook — every resource against the other resources of the same estimate. One estimate is one
 *      region and one quarter, so a price that disagrees means a wrong suggestion. Judged by the thresholds the test
 *      has always had (85 % within 25 %, at most 5 % three times away), for a workbook that says something about a
 *      proportion: more than 100 priced resources and at least 20 suggestions.
 *
 *   2. Against a recorded baseline — every suggestion made now, within each workbook and across workbooks (every
 *      resource of one against the resources of the others only: what hints.js does with another project's
 *      corrections), set beside what the recorded code offered the same resource. Over the resources both know,
 *      within and across must each be, each within one suggestion:
 *        as precise — the share of top suggestions within 25 % of the price no lower;
 *        as complete — no fewer top suggestions within 25 %;
 *        as safe — no more top suggestions three times away, and no more resources offered one three times away
 *        anywhere among the SIM_SHOW the page lists.
 *      A looser threshold dilutes the first, a stricter one loses the second, a guard taken out breaks the third.
 *      A change among equally scored candidates is not a change of similarity and is not counted: which of two
 *      candidates with the same score comes first is alphabetical luck. A change that trades one count for another
 *      fails too: that is a decision for a person, who records the new baseline with --accept and the reason.
 *      The counts are summed over the workbooks of a set: a loss on one estimate can be offset by a gain on another.
 *      They are over the resources both know, so 98 % of the resources recorded must be found again: a change of how
 *      names are keyed (normalize.js) would otherwise compare nothing, and nothing is «not worse». A baseline moves to
 *      other code only with --accept — otherwise passes within one suggestion, each recorded in turn, would ratchet.
 *      The baseline is private — made from the owner's estimates: hashes of names and the paths of the files on
 *      this machine, no name or price of the estimates — and lives with the reference kit: $HINTS_GOLDEN, or
 *      $REFS_KIT/hints-golden.json. With a baseline, every recorded set whose files are found on this machine is
 *      measured, not only the estimates given: a change can pass one pair and fail another.
 *
 *   3. The code that decides the suggestions — src/lib/match.js, src/lib/normalize.js and the page's SIM_MIN, SIM_SHOW
 *      (each one plain «var X = <number>;», named nowhere else outside rankSimilar) and the whole of its rankSimilar
 *      (src/ui/hints.js; pinned by RANK_SHA: suggest() reproduces exactly that text, and a change to it stops the test
 *      until suggest() and RANK_SHA are changed with it) — carries a stamp of its last measurement, test/hints.stamp, like
 *      the reference prices' test/refs-parity.stamp. Without the baseline the stamp must still match the code: a change
 *      to the similarity that was never measured is a failure, not a skip (CLAUDE.md). The stamp is written only for
 *      code it does not name yet, and only by a run that judged within and across against the baseline on at least one
 *      set of two or more distinct estimates, every one of them real-size (judged by itself), with every measured set
 *      passing — or by a recording a person accepted (--accept, the reason kept in the stamp). A recording without
 *      --accept never writes it, and is refused for code the stamp does not name: a baseline recorded by changed code
 *      would let that code pass against itself. The stamp names what was measured. It is committed.
 *
 * Printed, not judged: how suggestions across workbooks agree with prices, beside how the very same resource agrees
 * with itself across the two estimates (two estimates are two regions and two quarters; on the real estimates
 * measured, a resource under the same name agrees with itself within 25 % in 63–72 % of cases between distinct
 * estimates, and in about 90 % between two versions of one) — and the pooled figure of earlier releases.
 *
 * The test used to pool the workbooks into one corpus and hold it to the within-estimate thresholds; with the two
 * real estimates the pool «failed» at 83 % on every release since the form 4А estimate became readable. An absolute
 * threshold across estimates does not work in either direction: it fails two estimates from distant regions that
 * are as well suggested as can be, and lets through a moderate regression on estimates whose prices agree.
 *
 * Not judged at all: what prices cannot tell — a suggestion moved to another candidate of the same price class
 * (removing the Roman-grade guard, for one, looks like an improvement on these estimates). Nor the parser: the
 * baseline is keyed by the bytes of each file and by resource, and smeta.js is not in the stamp; a file saved again
 * has no baseline until it is recorded again.
 *
 * Nothing measurable is said, and exits 77 (test/all.sh shows it as SKIP with the reason): «NaN % within 25 %»
 * used to pass silently.
 *
 * Nothing is written to the repository but the stamp, and no price leaves the machine.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load, ROOT } = require('./load.cjs');

const S = load(load.PIPELINE);

const args = process.argv.slice(2);
function opt(n, d) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
const VALUED = ['--min', '--show', '--list', '--golden', '--accept'];
const given = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1])));
const RECORD = args.includes('--record');
const ACCEPT = args.includes('--accept') ? String(opt('--accept', '') || '').trim() : '';
if (args.includes('--accept') && (!ACCEPT || ACCEPT.startsWith('--'))) { console.error('--accept needs the reason, in words: --accept "<why>"'); process.exit(1); }
const RECORDED = args.includes('--recorded');
const STAMP = path.join(ROOT, 'test/hints.stamp');
const SKIP = 77;

// what the page uses, read from the page itself, so a change there is measured too
const PAGE = fs.readFileSync(path.join(ROOT, 'src/ui/hints.js'), 'utf8').replace(/\r\n/g, '\n');   // a Windows checkout too
// the whole of the page's ranking, from «rankSimilar:» to the next method: a change anywhere in it is a change of what
// is measured, whether or not suggest() below follows it
const RANK = (/\n(\s*)rankSimilar: function[\s\S]*?(?=\n\1[A-Za-z_$][\w$]*: function)/.exec(PAGE) || [])[0] || '';
// each constant must be one plain declaration, a number literal and nothing else, and never assigned again: an
// expression or a second assignment would change what the page uses while the number read here stayed the same
function constant(name, re) {
  // outside rankSimilar (which is pinned whole, below) the one line that may name it is its declaration
  const sets = PAGE.replace(RANK, '').split('\n').filter((l) => new RegExp('\\b' + name + '\\b').test(l));
  const m = sets.length === 1 && new RegExp('^\\s*var ' + name + ' = (' + re + ');\\s*(//.*)?$').exec(sets[0]);
  if (!m) { console.error(`src/ui/hints.js: ${name} must be set once, as «var ${name} = <number>;» — found:\n  ${sets.join('\n  ') || '(nothing)'}`); process.exit(1); }
  return +m[1];
}
const PAGE_MIN = constant('SIM_MIN', '\\d*\\.?\\d+');
const PAGE_SHOW = constant('SIM_SHOW', '\\d+');
const PAGE_CALL = PAGE.split('\n').filter((l) => /bestMatches\(/.test(l)).map((l) => l.trim()).join('\n');
if (!(PAGE_MIN > 0) || !(PAGE_SHOW > 0) || !PAGE_CALL || !RANK) { console.error('SIM_MIN / SIM_SHOW / the call of bestMatches / rankSimilar not found in src/ui/hints.js'); process.exit(1); }
// suggest() below reproduces these three lines of the page; ranked any other way, the page is not what is measured
const PAGE_FORM = [
  "var cands = this.pool.map(function (c) { return { name: c.name, unit: c.unit || '', rec: c }; });",
  'var idf = S.idfOf(cands.map(function (c) { return c.name; }));',
  "var best = S.bestMatches(r.name, r.unit || '', cands, { idf: idf, min: SIM_MIN, limit: SIM_SHOW });"
];
// suggest() reproduces rankSimilar as it is — this text of it, and nothing else: a statement added anywhere in it (a filter
// of the candidates, a slice of what is shown) would be stamped as measured by a test that never ran it. A change to
// rankSimilar is a change to suggest() and to RANK_SHA here, made together.
const RANK_SHA = 'aa36c5d9b1ad8938';
const rankSha = crypto.createHash('sha256').update(RANK.trim()).digest('hex').slice(0, 16);
if (RANK && rankSha !== RANK_SHA) {
  console.error(`src/ui/hints.js: rankSimilar is not the one this test reproduces (${rankSha}, the test knows ${RANK_SHA}). ` +
    'Make suggest() in test/hints.cjs do what it does now, then set RANK_SHA — and measure.');
  process.exit(1);
}
const rankLines = RANK.split('\n').map((l) => l.trim());
const at = PAGE_FORM.map((l) => rankLines.indexOf(l));
if (PAGE_CALL.split('\n').length !== 1 || PAGE_FORM.some((l) => rankLines.filter((x) => x === l).length !== 1) ||
    at.some((i, k) => i < 0 || (k && i <= at[k - 1]))) {
  console.error('src/ui/hints.js ranks the suggestions in a way this test does not reproduce — change suggest() in test/hints.cjs ' +
    'and PAGE_FORM together with it, or the page is not what is measured. Expected in rankSimilar, once each, in this order:\n  ' + PAGE_FORM.join('\n  '));
  process.exit(1);
}
const MIN = +opt('--min', PAGE_MIN);
const SHOW = +opt('--show', PAGE_SHOW);
const LIST = +opt('--list', 12);
const PAGE_RUN = MIN === PAGE_MIN && SHOW === PAGE_SHOW;
const BIG = 100;                      // priced resources a workbook needs to be judged by itself
const ENOUGH = 20;                    // suggestions, for a proportion to say anything
const GOLDEN = opt('--golden', process.env.HINTS_GOLDEN || (process.env.REFS_KIT ? path.join(process.env.REFS_KIT, 'hints-golden.json') : ''));
const VERSION = 3;                    // of the baseline's format

/* ---------------------------------------------------------------------- the stamp */
/** The code the measurement covers. */
function codeHash() {
  const h = crypto.createHash('sha256');
  for (const f of ['src/lib/match.js', 'src/lib/normalize.js']) {
    h.update(f + '\0' + fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n') + '\0');
  }
  h.update('SIM_MIN=' + PAGE_MIN + '\0SIM_SHOW=' + PAGE_SHOW + '\0' + RANK.replace(/\r\n/g, '\n') + '\0v' + VERSION);
  return h.digest('hex').slice(0, 16);
}
// taken once, when the code was read: a file saved while the run goes on must not be stamped as measured
const CODE = codeHash();
function readStamp() { try { return JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch (e) { return null; } }
function stampSays() {
  const st = readStamp(), code = CODE;
  if (st && st.code === code) return { ok: true, text: `the similarity code was measured on ${st.date} (code ${code})` };
  return { ok: false, text: `NOT MEASURED: src/lib/match.js, src/lib/normalize.js or SIM_MIN/SIM_SHOW/rankSimilar of src/ui/hints.js ` +
    `changed since ${st ? st.date : 'never'} — measure with real estimates and the baseline (REFS_KIT)` };
}
function writeStamp(result, measured) {
  fs.writeFileSync(STAMP, JSON.stringify({ code: CODE, date: new Date().toISOString().slice(0, 10), result, measured }, null, 1) + '\n');
  console.log('stamp written: test/hints.stamp');
}

if (args.includes('--check-stamp')) {
  const s = stampSays();
  console.log(s.text);
  process.exit(s.ok ? 0 : 1);
}
if (!given.length && !RECORDED) { console.error('usage: node test/hints.cjs <smeta.xlsx> [<smeta2.xlsx> …] [--record [--accept "<why>"]] | --recorded | --check-stamp'); process.exit(1); }
if (RECORD && given.length < 2) { console.error('--record needs two estimates or more: the baseline holds the suggestions across them too'); process.exit(1); }
if (!PAGE_RUN) console.log(`(--min ${MIN} --show ${SHOW}: the page uses ${PAGE_MIN} and ${PAGE_SHOW}; nothing is recorded or stamped from this run)`);
if (RECORD) {
  if (!GOLDEN) { console.error('--record needs a place for the baseline: HINTS_GOLDEN=<file> or REFS_KIT=<kit>'); process.exit(1); }
  if (!PAGE_RUN) { console.error('--record records what the page does: run it without --min/--show'); process.exit(1); }
  // a baseline recorded by changed code would let that code pass against itself: a recording is of the code the stamp
  // names, or a person's decision
  const st = readStamp();
  if (!ACCEPT && !(st && st.code === CODE)) {
    console.error('--record: the similarity code changed since it was measured (test/hints.stamp). Measure it first against the ' +
      'baseline (node test/hints.cjs <files>, which stamps it when it passes), or record the change on purpose with --accept "<why>"');
    process.exit(1);
  }
}

let fail = 0;
function check(ok, what) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); return ok; }

const ratio = (a, b) => (a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : Infinity);
const pct = (n, d) => (d ? Math.round(100 * n / d) : 0);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);

/* --------------------------------------------------------------------- the baseline */
// a top suggestion's class by the price: 3 right (within 25 %), 2 none, 1 wrong, 0 three times away
const RIGHT = 3, NONE = 2, WILD = 0;
function readGolden() {
  if (!GOLDEN || !fs.existsSync(GOLDEN)) return null;
  let g;
  try { g = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')); } catch (e) {
    console.error(`the baseline ${GOLDEN} cannot be read (${e.message}) — nothing is measured against it, and nothing is recorded over it`);
    process.exit(1);
  }
  if (!g || g.version !== VERSION) {
    console.error(`the baseline ${GOLDEN} was recorded by another version of this test (${g && g.version}) — record it again with --record`);
    process.exit(1);
  }
  const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  // and every entry the shape run() writes: one that is not would be counted as nothing, or as no suggestion, and a
  // comparison against nothing passes
  const entry = (e) => obj(e) && [0, 1, 2, 3].includes(e.c) && (e.t === null || typeof e.t === 'string') &&
    (e.c === NONE ? e.t === null : typeof e.t === 'string' && typeof e.s === 'number') &&
    (e.ties === undefined || Array.isArray(e.ties)) && (e.a === undefined || e.a === 1);
  const map = (m) => obj(m) && Object.values(m).every(entry);
  const ok = obj(g.within) && obj(g.across) && obj(g.sets) && Object.values(g.within).every(map) &&
    Object.values(g.across).every((a) => obj(a) && Object.values(a).every(map)) &&
    Object.values(g.sets).every((x) => obj(x) && Array.isArray(x.files));
  if (!ok) {
    console.error(`the baseline ${GOLDEN} is not one this test wrote (an entry of within, across or sets has another shape) — nothing is measured against it`);
    process.exit(1);
  }
  return g;
}
const golden = readGolden();

/* ----------------------------------------------------------------- the workbooks */
const cache = new Map();
function read(file) {
  if (cache.has(file)) return cache.get(file);
  const bytes = fs.readFileSync(file);
  const wb = S.readXlsx(new Uint8Array(bytes));
  const by = new Map();
  let rows = 0;
  for (const o of S.smeta.parseWorkbook(wb, path.basename(file))) {
    for (const r of o.rows) {
      if (r.kind !== 'item' || !r.nm) continue;
      rows++;
      const k = S.nameKey(r.nm) + '␟' + S.unitKey(r.unit || '');
      let e = by.get(k);
      if (!e) by.set(k, e = { key: k, name: r.nm, unit: r.unit || '', prices: [] });
      if (r.price > 0) e.prices.push(r.price);
    }
  }
  const id = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const b = { file, id, rows, by, priced: pricedOf(by, id) };
  cache.set(file, b);
  return b;
}
/**
 * One entry per resource (name and unit), priced by the median of its lines — so one mistyped row does not become
 * the price. `src` names the workbook: a resource two other estimates both carry is two candidates, at two prices.
 */
function pricedOf(by, src) {
  const out = [];
  for (const e of by.values()) {
    if (!e.prices.length) continue;
    out.push({ key: e.key, src, name: e.name, unit: e.unit, price: median(e.prices), mp: S.matchPair(e.name, e.unit) });
  }
  return out;
}
const candId = (c) => hash(c.key + '\0' + (c.src || ''));

/**
 * The suggestions for `q` among `pool` — its own name and unit held out of the pool and of the idf: all of them, in
 * the page's order. The page shows the first SHOW; the rest are only looked at for the candidates tied at the top.
 */
function suggest(q, pool) {
  const cands = pool.filter((c) => c.mp !== q.mp);
  return S.bestMatches(q.name, q.unit, cands, { idf: S.idfOf(cands.map((c) => c.name)), min: MIN, limit: Infinity });
}

const classOf = (q, best) => {
  if (!best.length) return NONE;
  const x = ratio(q.price, best[0].item.price);
  return x <= 1.25 ? RIGHT : x > 3 ? WILD : 1;
};

/** Ask every resource of `queries` against `pool`: the figures, and an entry per resource for the baseline. */
function run(queries, pool) {
  const t0 = Date.now(), offered = [], entries = {};
  for (const q of queries) {
    const all = suggest(q, pool), best = all.slice(0, SHOW);
    const e = { t: null, c: classOf(q, best) };
    if (best.length) {
      const top = best[0].score;
      e.t = candId(best[0].item);
      e.s = Math.round(top * 1e6) / 1e6;
      const tied = all.filter((b) => Math.abs(b.score - top) < 1e-9);
      if (tied.length > 1) e.ties = tied.map((b) => candId(b.item));
      if (best.some((h) => ratio(q.price, h.item.price) > 3)) e.a = 1;
      offered.push({ q, hits: best });
    }
    entries[hash(q.key)] = e;
  }
  const top = (o) => ratio(o.q.price, o.hits[0].item.price);
  return {
    ms: Date.now() - t0, entries, offered,
    near: offered.filter((o) => top(o) <= 1.25).length,
    far: offered.filter((o) => top(o) > 1.25),
    wild: offered.filter((o) => top(o) > 3).length,
    wildAny: offered.filter((o) => o.hits.some((h) => ratio(o.q.price, h.item.price) > 3)).length
  };
}

function print(r) {
  console.log(`-- ${r.offered.length} resources offered a suggestion, ${r.ms} ms --`);
  console.log(`   top-1 within 25 % of the resource's own price   ${r.near}`);
  console.log(`   top-1 further than 25 %                         ${r.far.length}`);
  console.log(`   top-1 further than three times                  ${r.wild}`);
  console.log(`   any of the ${SHOW} further than three times              ${r.wildAny}`);
  if (LIST && r.far.length) {
    console.log('-- the ones an expert would have to catch by reading the name --');
    r.far.map((o) => ({ o, x: ratio(o.q.price, o.hits[0].item.price) }))
      .sort((a, b) => b.o.hits[0].score - a.o.hits[0].score)
      .slice(0, LIST)
      .forEach((x) => console.log(`   ${x.o.hits[0].score.toFixed(3)}  ${x.x.toFixed(1)}x  ` +
        `${x.o.q.name.slice(0, 42).padEnd(42)} <- ${x.o.hits[0].item.name.slice(0, 42)}`));
  }
}

/** `then` and `now` entries over the resources both know: what changed, and the counts on each side. */
function compare(then, nowE) {
  const t = { then: Object.keys(then).length, common: 0, same: 0, ties: 0, changed: 0, offeredThen: 0, offeredNow: 0, rightThen: 0, rightNow: 0,
    wildThen: 0, wildNow: 0, anyThen: 0, anyNow: 0 };
  for (const k of Object.keys(nowE)) {
    const g = then[k];
    if (!g) continue;
    let n = nowE[k];
    t.common++;
    if (g.t === n.t) t.same++;
    // another candidate of the same score, among the ones tied at the top before or now: the order of equals
    else if (g.s != null && g.s === n.s && ((g.ties && g.ties.includes(n.t)) || (n.ties && n.ties.includes(g.t)))) { t.ties++; n = g; }
    else t.changed++;
    if (g.c !== NONE) t.offeredThen++;
    if (n.c !== NONE) t.offeredNow++;
    if (g.c === RIGHT) t.rightThen++;
    if (n.c === RIGHT) t.rightNow++;
    if (g.c === WILD) t.wildThen++;
    if (n.c === WILD) t.wildNow++;
    if (g.a) t.anyThen++;
    if (n.a) t.anyNow++;
  }
  return t;
}

/* ------------------------------------------------------------------------ one set */
/**
 * Measure one set of workbooks. Returns what was judged: within (absolute), and within/across against the baseline.
 */
function measure(files, label) {
  const books = [];
  for (const f of files) {
    const b = read(f);
    if (books.some((x) => x.id === b.id)) { console.log(`(${f} is the same workbook as one given before it — measured once)`); continue; }
    books.push(b);
  }
  const setId = books.map((b) => b.id).sort().join('+');
  const res = { files: books.length, resources: 0, setId, absolute: 0, within: false, across: false, passed: true, entries: { within: {}, across: {} } };
  const failBefore = fail;
  console.log(`\n######## ${label}: ${books.length} workbook(s) ########`);

  books.forEach((b, i) => {
    console.log(`\n== workbook ${i + 1} of ${books.length}, within itself ==`);
    console.log(`${b.rows} item rows, ${b.by.size} resources, ${b.priced.length} of them priced`);
    res.resources += b.priced.length;
    const r = run(b.priced, b.priced);
    res.entries.within[b.id] = r.entries;
    print(r);
    if (b.priced.length <= BIG || r.offered.length < ENOUGH) {
      console.log(`   not judged by itself: ${b.priced.length} priced resources and ${r.offered.length} suggestions ` +
        `(more than ${BIG} and at least ${ENOUGH} needed for a proportion to say anything)`);
      return;
    }
    res.absolute++;
    /*
     * Proportions rather than counts, so another workbook can be measured with the same test. Before the
     * substitution guard of match.js the two came out at 77 % and 8 % on the three real workbooks, so both have teeth.
     */
    check(r.near >= r.offered.length * 0.85,
      `${pct(r.near, r.offered.length)} % of top suggestions are within 25 % of the price (want 85)`);
    check(r.wild <= r.offered.length * 0.05,
      `${pct(r.wild, r.offered.length)} % point at a price three times away (want 5 or less)`);
  });

  if (books.length > 1) {
    books.forEach((b, i) => {
      const others = books.filter((x, j) => j !== i);
      const pool = [].concat(...others.map((x) => x.priced));
      console.log(`\n== workbook ${i + 1} against the other${others.length > 1 ? 's' : ''} only (information; judged against the baseline) ==`);
      const theirs = new Map(pool.map((c) => [c.key, c]));
      const same = b.priced.filter((c) => theirs.has(c.key)).map((c) => ratio(c.price, theirs.get(c.key).price));
      const sameNear = same.filter((x) => x <= 1.25).length, sameWild = same.filter((x) => x > 3).length;
      console.log(`   the same resource in both: ${same.length} names; within 25 % of itself ${sameNear} (${pct(sameNear, same.length)} %), ` +
        `three times away ${sameWild} (${pct(sameWild, same.length)} %)`);
      const r = run(b.priced, pool);
      res.entries.across[b.id] = r.entries;
      print(r);
    });

    // the measure of earlier releases, exactly: all workbooks in one corpus, a resource's lines from every workbook in
    // one median; printed for comparison with the earlier record, not judged
    const all = new Map();
    books.forEach((b) => b.by.forEach((e, k) => {
      const a = all.get(k);
      if (a) a.prices = a.prices.concat(e.prices); else all.set(k, { key: k, name: e.name, unit: e.unit, prices: e.prices.slice() });
    }));
    const pooled = pricedOf(all, 'pooled');
    const r = run(pooled, pooled);
    console.log(`\n== all ${books.length} pooled (information: the measure of earlier releases, then held to 85 % / 5 %) ==`);
    console.log(`   ${pooled.length} priced resources, ${r.offered.length} offered; ${pct(r.near, r.offered.length)} % within 25 %, ` +
      `${pct(r.wild, r.offered.length)} % three times away`);
  }

  if (golden) {
    const kinds = [['within', books.map((b) => [golden.within[b.id], res.entries.within[b.id]])]];
    if (books.length > 1) kinds.push(['across', books.map((b) => [golden.across[setId] && golden.across[setId][b.id], res.entries.across[b.id]])]);
    console.log('\n== against the recorded baseline ==');
    for (const [kind, pairs] of kinds) {
      let tot = null;
      for (const [then, nowE] of pairs) {
        if (!then) continue;
        const c = compare(then, nowE);
        if (!tot) tot = c; else for (const k of Object.keys(tot)) tot[k] += c[k];
      }
      if (!tot || !tot.then) { console.log(`   ${kind}: no baseline recorded for these workbooks${tot ? ' (nothing priced was recorded)' : ''}`); continue; }
      res[kind] = true;
      // the counts are over the resources both know: a change of how resources are keyed (normalize.js) would make
      // that nothing, and nothing compares as «not worse». Nearly every resource recorded must be found again.
      check(tot.common >= tot.then * 0.98, `${kind}, the same resources: ${tot.common} of the ${tot.then} recorded are found again ` +
        '(98 % needed — a change of how names are keyed is a decision: --record --accept "<why>")');
      console.log(`   ${kind}: ${tot.common} resources; the same suggestion for ${tot.same}, another of the same score for ${tot.ties}, ` +
        `another (or none) for ${tot.changed}`);
      const precThen = tot.offeredThen ? tot.rightThen / tot.offeredThen : 1;
      const precNow = tot.offeredNow ? tot.rightNow / tot.offeredNow : 1;
      const slack = tot.offeredNow ? 1 / tot.offeredNow : 0;
      check(precNow >= precThen - slack, `${kind}, as precise: ${pct(tot.rightNow, tot.offeredNow)} % of ${tot.offeredNow} suggestions within 25 % — ` +
        `the baseline ${pct(tot.rightThen, tot.offeredThen)} % of ${tot.offeredThen}`);
      check(tot.rightNow >= tot.rightThen - 1, `${kind}, as complete: ${tot.rightNow} suggestions within 25 % — the baseline ${tot.rightThen}`);
      check(tot.wildNow <= tot.wildThen + 1 && tot.anyNow <= tot.anyThen + 1,
        `${kind}, as safe: ${tot.wildNow} top suggestions three times away, ${tot.anyNow} resources with one among the ${SHOW} shown — ` +
        `the baseline ${tot.wildThen} and ${tot.anyThen}`);
    }
    if (!res.within && !res.across) console.log(`   (baseline: ${GOLDEN}; these workbooks were never recorded)`);
  }
  res.passed = fail === failBefore;
  return res;
}

/* ------------------------------------------------------------------- what is run */
const sets = [];
const key = (files) => [...new Set(files.map((f) => read(f).id))].sort().join('+');
if (given.length) sets.push({ files: given, label: 'the estimates given' });
// every recorded set found here — on --record too: a baseline recorded for one pair must not leave the others behind
if (golden) {
  const seen = new Set(sets.map((s) => key(s.files)));
  for (const [id, info] of Object.entries(golden.sets)) {
    if (seen.has(id)) continue;
    const files = Array.isArray(info && info.files) ? info.files.filter((f) => typeof f === 'string') : [];
    const found = files.length > 1 && files.every((f) => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
    if (!found) { console.log(`(a recorded set of ${files.length} workbooks is not on this machine — not measured)`); continue; }
    let now = '';
    try { now = key(files); } catch (e) { console.log(`(a recorded set whose files cannot be read (${e.message}) — not measured)`); continue; }
    if (now !== id) { console.log('(a recorded set whose files have changed since — not measured; record it again)'); continue; }
    sets.push({ files, label: 'a recorded set' });
    seen.add(id);
  }
}
if (!sets.length) {
  const s = stampSays();
  console.log(s.text);
  if (!s.ok) { console.log('FAIL the similarity code changed and was not measured against a baseline'); process.exit(1); }
  console.log('\nnot measured: no recorded set of estimates is found on this machine');
  process.exit(SKIP);
}
const results = sets.map((s) => measure(s.files, s.label));

/* --------------------------------------------------------------------- recording */
// a baseline is moved to other code only by a person: measured passes would otherwise ratchet it — each within one
// suggestion of the last, and the last of the one before
const what = (r) => ({ files: r.files, resources: r.resources, absolute: r.absolute, within: r.within, across: r.across });
if (RECORD) {
  if (results[0].files < 2) { console.error('\n--record needs two different workbooks: the baseline holds the suggestions across them too'); process.exit(1); }
  if (fail && !ACCEPT) {
    console.error('\nnot recorded: the measurement above fails. A trade-off made on purpose is recorded with --accept "<why>"');
    process.exit(1);
  }
  // a workbook's within-baseline is shared by every set it is in: one in a set recorded by other code is that code's
  const otherCode = new Set();
  if (golden) for (const [id, info] of Object.entries(golden.sets)) if (info.code !== CODE) id.split('+').forEach((w) => otherCode.add(w));
  const moved = results.filter((r) => (golden && golden.sets[r.setId] && golden.sets[r.setId].code !== CODE) ||
    Object.keys(r.entries.within).some((w) => otherCode.has(w)));
  if (moved.length && !ACCEPT) {
    console.error(`\nnot recorded: ${moved.length} set(s) hold workbooks whose baseline was recorded by other code. ` +
      'Moving a baseline to new code is a decision, with --accept "<why>": passing within one suggestion of it, and recording that, ' +
      'step after step, would let any regression through');
    process.exit(1);
  }
  const g = golden || { version: VERSION, within: {}, across: {}, sets: {} };
  const code = CODE;
  results.forEach((r, i) => {
    Object.assign(g.within, r.entries.within);
    g.across[r.setId] = r.entries.across;
    g.sets[r.setId] = { files: sets[i].files.map((f) => path.resolve(f)), at: new Date().toISOString().slice(0, 10), code };
  });
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, JSON.stringify(g));
  console.log(`\nbaseline recorded for ${results.length} set(s): ${GOLDEN}`);
  const left = Object.keys(g.sets).filter((id) => !results.some((r) => r.setId === id));
  if (left.length) console.log(`(${left.length} recorded set(s) not on this machine keep the baseline of code ${left.map((id) => g.sets[id].code || '?').join(', ')})`);
  if (!ACCEPT) console.log('(the stamp is not written by a recording: it is written by a measurement against a baseline, or by --accept "<why>")');
  else if (readStamp() && readStamp().code === CODE) console.log('(the code is the one the stamp already names — the stamp stays as it is)');
  else writeStamp('recorded and accepted by a person: ' + ACCEPT, results.map(what));
  console.log('\nhints OK (recorded)');
  process.exit(0);
}

/* --------------------------------------------------------------------- the stamp */
const judged = results.some((r) => r.absolute || r.within || r.across);
// a set vouches for the code when it has two workbooks or more, every one of them judged by itself, and was compared within
// and across against the baseline
const vouch = results.filter((r) => r.files > 1 && r.absolute === r.files && r.within && r.across);
if (fail === 0 && PAGE_RUN && vouch.length && results.every((r) => r.passed)) {
  const st = readStamp();
  if (!st || st.code !== CODE) {
    writeStamp('not worse than the recorded baseline', vouch.map(what));
  } else console.log('\nstamp: ' + stampSays().text);
} else {
  const s = stampSays();
  console.log('\n' + s.text);
  if (!s.ok) check(false, 'the similarity code changed and was not measured' + (PAGE_RUN ? ' against a baseline on two real-size estimates, within and across' : ' (--min/--show measure something else)'));
}

if (!judged && !fail) {
  console.log('\nnot measured: no workbook has more than ' + BIG + ' priced resources and ' + ENOUGH +
    ' suggestions, and there is no recorded baseline for these workbooks');
  process.exit(SKIP);
}
console.log(fail ? `\nFAILED (${fail})` : '\nhints OK');
process.exit(fail ? 1 : 0);
