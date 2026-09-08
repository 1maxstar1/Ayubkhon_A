/*
 * The two keys that decide whether two written names mean one resource.
 *
 *   S.nameKey   identity inside one document — it decides which rows of the
 *               exported .xlsx share a single edited price, so it may only
 *               forgive what is certainly the same name.
 *   S.matchKey  lookup across past projects, for price hints. It may be
 *               bolder, because a hint is a suggestion somebody accepts.
 *
 * The rule neither key may ever break: digits survive. «АНКЕР М5» is not
 * «АНКЕР М8» and road sign 4.1.1 is not 4.11. That is checked twice here —
 * against hand-written pairs, and as an invariant over every name the two real
 * workbooks contain (test/fixtures/resource-names.json).
 *
 *   node test/normalize.cjs
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.dirname(__dirname);
const ctx = { console };
vm.createContext(ctx);
for (const f of ['src/lib/normalize.js', 'src/lib/match.js', 'src/lib/util.js', 'src/lib/assemble.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const S = ctx.S;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const show = (s) => JSON.stringify(s);

function pair(fn, label, a, b, want) {
  const ka = fn(a), kb = fn(b);
  const same = ka === kb;
  check(same === want, `${label} ${want ? '≡' : '≠'} ${show(a)} ${show(b)}` +
    (same === want ? '' : `  -> ${show(ka)} / ${show(kb)}`));
}
const idSame = (a, b) => pair(S.nameKey, 'name ', a, b, true);
const idDiff = (a, b) => pair(S.nameKey, 'name ', a, b, false);
const mkSame = (a, b) => pair(S.matchKey, 'match', a, b, true);
const mkDiff = (a, b) => pair(S.matchKey, 'match', a, b, false);

/* ---------------------------------------- identity: a half-switched keyboard */
console.log('-- identity key: same name, typed differently --');
idSame('CТАЛЬ КРУГЛАЯ', 'СТАЛЬ КРУГЛАЯ');          // Latin C in a Cyrillic word
idSame('KОМПРЕССОРЫ', 'КОМПРЕССОРЫ');              // Latin K
idSame('БЕТOН М300', 'БЕТОН М300');                // Latin O
idSame('ОMICRON', 'OMICRON');                      // the other way round: Cyrillic О in a Latin word
idSame('ДИАМ. 16 ММ', 'ДИАМ.16 ММ');
idSame('ЛЕНТА "ФУМ "РУЛОН', 'ЛЕНТА "ФУМ" РУЛОН');
idSame('ЁМКОСТЬ', 'ЕМКОСТЬ');
idSame('  ГРУНТ   ПЕСЧАНЫЙ ', 'Грунт песчаный');
idSame('ШКАФ УЧЕТА (ЩУ) С АППАРАТУРОЙ', 'ШКАФ УЧЕТА (ЩУ)С АППАРАТУРОЙ');

console.log('-- identity key: the digits must hold these apart --');
idDiff('АНКЕР М5', 'АНКЕР М8');
idDiff('ЗНАК 4.1.1', 'ЗНАК 4.11');
idDiff('КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 10 Т', 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 16 Т');
idDiff('БЕТОН В15', 'БЕТОН В25');
idDiff('ТРУБА Д-110ММ', 'ТРУБА Д-160ММ');
console.log('-- identity key: different resources stay apart --');
idDiff('ДРЕЛИ ЭЛЕКТРИЧЕСКИЕ', 'ПЕРФОРАТОРЫ ЭЛЕКТРИЧЕСКИЕ');
idDiff('ЛИПА', 'КАШТАН');
idDiff('КАШТАН', 'KASHTAN');     // the identity key stays inside one alphabet

/* ---------------------------------------- lookup: one alphabet, no separators */
console.log('-- match key: across the two alphabets --');
mkSame('КАШТАН', 'KASHTAN');
mkSame('Липа', 'LIPA');
mkSame('СИРЕНЬ', 'SIREN');
mkSame('ШАМШОД', 'SHAMSHOD');
mkSame('АРМАТУРА АIII', 'АРМАТУРА А-III');
mkSame('ГРУЗОПОДЪЕМНОСТЬ', 'ГРУЗОПОДЬЕМНОСТЬ');    // the misspelling with a soft sign
mkSame('УДЛИНИТЕЛЬ Д-1/2" 12ММ', 'УДЛИНИТЕЛЬ Д1/2 12ММ');
mkSame('ТРУБА Д-110Х6,3ММ', 'ТРУБА Д-110Х6.3ММ');  // a comma is a decimal point
console.log('-- match key: digits still hold --');
mkDiff('АНКЕР М5', 'АНКЕР М8');
mkDiff('ЗНАК 4.1.1', 'ЗНАК 4.11');
mkDiff('ДО 5 Т', 'ДО 8 Т');

console.log('-- units: the same quantity, another spelling --');
const uSame = (a, b) => check(S.matchUnitKey(a) === S.matchUnitKey(b),
  `unit  ≡ ${a} ${b} -> ${S.matchUnitKey(a)} / ${S.matchUnitKey(b)}`);
const uDiff = (a, b) => check(S.matchUnitKey(a) !== S.matchUnitKey(b),
  `unit  ≠ ${a} ${b} -> ${S.matchUnitKey(a)} / ${S.matchUnitKey(b)}`);
uSame('ТН', 'Т'); uSame('КУБ.М', 'М3'); uSame('КВ.М', 'М2');
uSame('ПМ', 'М'); uSame('ШТУК', 'ШТ'); uSame('SHT', 'ШТ');
uDiff('100ШТ', 'ШТ');            // a price per hundred is not a price per piece
uDiff('Т', 'КГ'); uDiff('М2', 'М3');

/* ---------------------------------------------------------------- similarity */
console.log('-- similarity --');
const near = (a, b, min, idf) => {
  const s = S.similarity(a, b, idf);
  check(s >= min, `sim ≥ ${min} (${s}) ${show(a)} ~ ${show(b)}`);
};
const far = (a, b, max, idf) => {
  const s = S.similarity(a, b, idf);
  check(s <= max, `sim ≤ ${max} (${s}) ${show(a)} ~ ${show(b)}`);
};
const sample = ['КАШТАН', 'КАШТАН 3М', 'ЛИПА МЕЛКОЛИСТНАЯ', 'АНКЕР М5', 'АНКЕР М8',
  'БОЛТ АНКЕРНЫЙ М5', 'ТРОЙНИК ПОЛИЭТИЛЕНОВЫЕ Д-110ММ', 'ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ Д-110ММ'];
const idf = S.idfOf(sample);
near('ТРОЙНИК ПОЛИЭТИЛЕНОВЫЕ Д-110ММ', 'ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ Д-110ММ', 0.8, idf);
near('КИРПИЧ ЖЖЕННЫЙ', 'КИРПИЧ ЖЖЕНЫЙ', 0.85, idf);
near('КАШТАН', 'Kashtan (3 м)', 0.4, idf);
check(S.similarity('АНКЕР М5', 'АНКЕР М8', idf) === 0, 'sim = 0 for contradicting numbers (АНКЕР М5 / М8)');
check(S.similarity('КРАН ДО 5 Т', 'КРАН ДО 8 Т', idf) === 0, 'sim = 0 for contradicting numbers (ДО 5 Т / ДО 8 Т)');
far('ДРЕЛИ ЭЛЕКТРИЧЕСКИЕ', 'ПЕРФОРАТОРЫ ЭЛЕКТРИЧЕСКИЕ', 0.7, idf);
check(S.numberRelation('КАШТАН', 'КАШТАН 3М') === 'extra', 'an added dimension is "extra", not a conflict');
check(S.numberRelation('ТРУБА 6,3ММ', 'ТРУБА 6.3ММ') === 'same', 'comma and dot are one number');
check(S.editDistance('ЖЖЕННЫЙ', 'ЖЖЕНЫЙ') === 1, 'edit distance counts the doubled letter');

console.log('-- best matches, with the unit as a hard filter --');
const cands = [
  { name: 'ТРОЙНИК ПОЛИЭТИЛЕНОВЫЕ Д-110ММ', unit: 'ШТ', price: 100 },
  { name: 'АНКЕР М8', unit: 'ШТ', price: 7 },
  { name: 'ТРОЙНИК ПОЛИЭТИЛЕНОВЫЙ Д-110ММ', unit: 'КГ', price: 900 }
];
const best = S.bestMatches('ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ Д-110ММ', 'ШТ', cands);
check(best.length === 1, 'one suggestion survives: ' + best.length);
check(best[0] && best[0].item.unit === 'ШТ', 'the one measured in another unit is dropped');
check(!S.bestMatches('АНКЕР М5', 'ШТ', cands).length, 'a different size is never suggested');

/* ------------------------------------------------- saved prices survive the upgrade */
console.log('-- old keys can still be recognised --');
const oldK = S.resKeyV1('CТАЛЬ КРУГЛАЯ', 'Т', 100);
const newK = S.resKey('CТАЛЬ КРУГЛАЯ', 'Т', 100);
check(oldK !== newK, 'the key of a homoglyph name did change with the repair');
check(S.resKey('СТАЛЬ КРУГЛАЯ', 'Т', 100) === newK, 'both spellings now key the same row');
check(S.resKeyV1('СТАЛЬ КРУГЛАЯ', 'Т', 100) !== oldK, 'they did not, before');

/* ------------------------------------------------------------ the real corpus */
console.log('-- every name in the two real workbooks --');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/resource-names.json'), 'utf8'));
const names = [...new Set(rows.map((r) => r.n))];
check(names.length > 500, `corpus loaded: ${rows.length} rows, ${names.length} distinct names`);

function group(fn) {
  const g = new Map();
  for (const n of names) {
    const k = fn(n);
    if (g.has(k)) g.get(k).push(n); else g.set(k, [n]);
  }
  return [...g.values()].filter((v) => v.length > 1);
}
// The invariant: whatever a key merges, it never merges two different sizes.
for (const [label, fn] of [['nameKey', S.nameKey], ['matchKey', S.matchKey]]) {
  const merged = group(fn);
  const unsafe = [];
  for (const list of merged) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (S.numberRelation(list[i], list[j]) !== 'same') unsafe.push([list[i], list[j]]);
      }
    }
  }
  check(unsafe.length === 0,
    `${label}: ${merged.length} groups merged, none mixing different numbers` +
    (unsafe.length ? ' -> ' + show(unsafe[0]) : ''));
  check(merged.length > 0, `${label}: it does merge something (${merged.length} groups)`);
}
// The identity key must not merge more than the match key does.
check(group(S.nameKey).length <= group(S.matchKey).length,
  'the identity key is the more careful of the two');

// Nothing at all may be scored similar while its numbers contradict.
const uniq = [];
const seenPair = new Set();
for (const r of rows) {
  const k = S.matchPair(r.n, r.u);
  if (seenPair.has(k)) continue;
  seenPair.add(k);
  uniq.push(r);
}
const corpusIdf = S.idfOf(uniq.map((r) => r.n));
let scored = 0, conflicts = 0;
for (let i = 0; i < uniq.length; i++) {
  for (let j = i + 1; j < uniq.length; j++) {
    if (S.matchUnitKey(uniq[i].u) !== S.matchUnitKey(uniq[j].u)) continue;
    const s = S.similarity(uniq[i].n, uniq[j].n, corpusIdf);
    if (s < 0.6) continue;
    scored++;
    if (S.numberRelation(uniq[i].n, uniq[j].n) === 'conflict') conflicts++;
  }
}
check(conflicts === 0, `${scored} pairs would be suggested, none with contradicting numbers`);
check(scored > 20, `the suggestion pass finds something to offer (${scored} pairs)`);

console.log(fail ? `FAILED (${fail})` : 'normalize OK');
process.exit(fail ? 1 : 0);
