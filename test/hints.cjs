/*
 * What the «Похожие ресурсы» tier would actually put in front of an expert.
 *
 *   node test/hints.cjs <smeta.xlsx> [<smeta2.xlsx> …]
 *
 * The similarity layer cannot be judged by reading it: whether «ПЕРЕХОД
 * ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ» is close to «АДАПТЕР ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ» is
 * a question about a price book, not about strings. So it is judged by the
 * prices: every priced resource of the given workbooks is asked what it would
 * be offered, with its own key held out of the pool and out of the idf —
 * exactly how hints.js ranks a resource against another project's corrections.
 * If the top suggestion is really the same resource, the two prices agree.
 *
 * Nothing is written and no price leaves the machine: the workbooks are read
 * into memory and the numbers below are all that comes out.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.cjs');

const S = load(load.PIPELINE);

const args = process.argv.slice(2);
function opt(n, d) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const MIN = +opt('--min', 0.62);      // hints.js SIM_MIN
const SHOW = +opt('--show', 4);       // hints.js SIM_SHOW
const LIST = +opt('--list', 12);

if (!files.length) { console.error('usage: node test/hints.cjs <smeta.xlsx> [<smeta2.xlsx> …]'); process.exit(1); }

let fail = 0;
function check(ok, what) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); }

/* ------------------------------------------------------------- the corpus */
const by = new Map();
let rows = 0;
for (const file of files) {
  const wb = S.readXlsx(new Uint8Array(fs.readFileSync(file)));
  for (const o of S.smeta.parseWorkbook(wb, path.basename(file))) {
    for (const r of o.rows) {
      if (r.kind !== 'item' || !r.nm) continue;
      rows++;
      const k = S.nameKey(r.nm) + '␟' + S.unitKey(r.unit || '');
      let e = by.get(k);
      if (!e) by.set(k, e = { name: r.nm, unit: r.unit || '', prices: [] });
      if (r.price > 0) e.prices.push(r.price);
    }
  }
}
const corpus = [];
for (const e of by.values()) {
  if (!e.prices.length) continue;
  e.prices.sort((a, b) => a - b);
  // the median, so one mistyped row of a hundred does not become the price
  corpus.push({ name: e.name, unit: e.unit, price: e.prices[Math.floor(e.prices.length / 2)] });
}
for (const c of corpus) c.mp = S.matchPair(c.name, c.unit);
console.log(`${rows} item rows, ${by.size} resources, ${corpus.length} of them priced`);
check(corpus.length > 100, `the corpus is big enough to measure (${corpus.length} priced resources)`);

/* ------------------------------------------------------- leave-one-out run */
const t0 = Date.now();
const offered = [];
for (const q of corpus) {
  // Its own key is never among another project's corrections, so it is not in
  // the pool — and therefore not in the idf either. Scoring it against a pool
  // that has already seen its words makes every name look commoner than it is.
  const cands = corpus.filter((c) => c.mp !== q.mp);
  const best = S.bestMatches(q.name, q.unit, cands, { idf: S.idfOf(cands.map((c) => c.name)), min: MIN, limit: SHOW });
  if (best.length) offered.push({ q: q, hits: best });
}
const ratio = (a, b) => (a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : Infinity);

const near = offered.filter((o) => ratio(o.q.price, o.hits[0].item.price) <= 1.25);
const far = offered.filter((o) => ratio(o.q.price, o.hits[0].item.price) > 1.25);
const wild = offered.filter((o) => ratio(o.q.price, o.hits[0].item.price) > 3);
const wildAny = offered.filter((o) => o.hits.some((h) => ratio(o.q.price, h.item.price) > 3));

console.log(`\n-- ${offered.length} resources offered a suggestion, ${Date.now() - t0} ms --`);
console.log(`   top-1 within 25 % of the resource's own price   ${near.length}`);
console.log(`   top-1 further than 25 %                         ${far.length}`);
console.log(`   top-1 further than three times                  ${wild.length}`);
console.log(`   any of the ${SHOW} further than three times              ${wildAny.length}`);

if (LIST && far.length) {
  console.log('\n-- the ones an expert would have to catch by reading the name --');
  far.map((o) => ({ o: o, r: ratio(o.q.price, o.hits[0].item.price) }))
    .sort((a, b) => b.o.hits[0].score - a.o.hits[0].score)
    .slice(0, LIST)
    .forEach((x) => console.log(`   ${x.o.hits[0].score.toFixed(3)}  ${x.r.toFixed(1)}x  ` +
      `${x.o.q.name.slice(0, 42).padEnd(42)} <- ${x.o.hits[0].item.name.slice(0, 42)}`));
}

/*
 * Proportions rather than counts, so another set of workbooks can be measured
 * with the same test. Before the substitution guard of match.js the two came
 * out at 77 % and 8 % on the three real workbooks, so both have teeth.
 */
console.log('');
check(near.length >= offered.length * 0.85,
  `${Math.round(100 * near.length / offered.length)} % of top suggestions are within 25 % of the price (want 85)`);
check(wild.length <= offered.length * 0.05,
  `${Math.round(100 * wild.length / offered.length)} % point at a price three times away (want 5 or less)`);

console.log(fail ? `FAILED (${fail})` : 'hints OK');
process.exit(fail ? 1 : 0);
