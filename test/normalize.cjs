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
const path = require('node:path');
const { load, ROOT: root } = require('./load.cjs');

const S = load(load.CORE, 'assemble');

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
mkSame('ПРОФНАСТИЛЬ H-35-1000', 'ПРОФНАСТИЛЬ Н-35-1000');   // a type code is read by shape
mkSame('АВТОМАТ ВА47-100', 'АВТОМАТ BA47-100');
mkSame('ТРУБА Д-110×6,3ММ', 'ТРУБА Д-110Х6,3ММ');           // × and Х are one sign
console.log('-- match key: digits still hold --');
mkDiff('АНКЕР М5', 'АНКЕР М8');
mkDiff('ЗНАК 4.1.1', 'ЗНАК 4.11');
mkDiff('ДО 5 Т', 'ДО 8 Т');
// Dropping a separator between two digits would MAKE a number nobody wrote,
// and «1, 5» would be offered the price of «15» as an exact match.
mkDiff('ПРОВОД 1, 5 ММ2', 'ПРОВОД 15 ММ2');
mkDiff('СТАЛЬ ЛИСТОВАЯ 08', 'СТАЛЬ ЛИСТОВАЯ 8');            // a grade is not a thickness

console.log('-- grades written in Roman are numbers too --');
check(S.numberRelation('СТАЛЬ КЛАССА А-I ДИАМ 6 ММ', 'СТАЛЬ КЛАССА А-III ДИАМ 6 ММ') === 'conflict',
  'А-I and А-III are different steel');
check(S.similarity('СТАЛЬ КЛАССА А-I ДИАМ 6 ММ', 'СТАЛЬ КЛАССА А-III ДИАМ 6 ММ', {}) === 0,
  'and one is never suggested for the other');
check(S.numberRelation('ДОСКИ СОРТА II', 'ДОСКИ СОРТА III') === 'conflict', 'sort II is not sort III');
check(S.numberRelation('АРМАТУРА АIII', 'АРМАТУРА А-III') === 'same', 'but АIII and А-III are one grade');
check(S.numbers('OMICRON 5').join() === '5', 'the I of a Latin word is not a numeral');
check(S.numbers('PIPE TECHNOLOGIES 63').join() === '63', 'nor the I of PIPE');
check(S.numbers('ТИП-1 IP65').join() === '1,65', 'nor the I of IP65');
// A grade marker is a whole word — the class letter with the numeral glued to
// it, or the numeral alone. Read out of the middle of words instead, it went
// wrong in both directions: a grade typed on the Latin layout was invisible,
// and words that merely contain Roman letters grew a numeral nobody wrote.
check(S.numberRelation('АРМАТУРА AI', 'АРМАТУРА AII') === 'conflict',
  'a grade typed on the Latin layout is still a grade');
check(S.similarity('АРМАТУРА AI', 'АРМАТУРА AII', {}) === 0, 'so one is never offered for the other');
check(S.numbers('АГРЕГАТЫ СВАРОЧНЫЕ ОМIСRОN').join() === '',
  'and a brand name with a stray Latin I carries no numeral');
check(S.numbers('АВТОМАТИЧЕСКИЙ ВЫКЛЮЧАТЕЛЬ IН=100А ВА47-100').join() === '100,47,100',
  'nor does «IН=100А» — the I belongs to the current, not to a grade');
check(S.numbers('MIX 20').join() === '20', 'nor MIX, whose letters merely look Roman');

console.log('-- a standard is not a size --');
check(S.numberRelation('ЛЮК ЧУГУННЫЙ ЛЕГКИЙ ГОСТ 3634-79', 'ЛЮК ЧУГУННЫЙ ЛЕГКИЙ') === 'same',
  'the year of a ГОСТ does not make two hatches different');
check(S.similarity('ЛЮК ЧУГУННЫЙ ЛЕГКИЙ ГОСТ 3634-79', 'ЛЮК ЧУГУННЫЙ ЛЕГКИЙ', {}) >= 0.6,
  'so the hatch still finds its price');

console.log('-- the order of a dimension is part of it --');
check(S.numberRelation('КАБЕЛЬ СЕЧ.3Х16ММ2', 'КАБЕЛЬ СЕЧ.16Х3ММ2') === 'extra',
  '3Х16 and 16Х3 are not the same cable');
check(S.similarity('КАБЕЛЬ СЕЧ.3Х16ММ2', 'КАБЕЛЬ СЕЧ.16Х3ММ2', {}) < 0.62,
  'and neither is suggested for the other');

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

console.log('-- a word the other side has no spelling of --');
/* Four words out of five agree and the fifth names another product. Prices
   from the three real workbooks, so the cost of getting these wrong is on
   the record: 5 210 against 82 087, and eighteen times over for the machines. */
const other = (a, b) => check(S.similarity(a, b, {}) === 0, `sim = 0  ${show(a)} ~ ${show(b)}`);
other('ПЕРЕХОД ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ', 'АДАПТЕР ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ');
other('СТАНКИ СВЕРЛИЛЬНЫЕ', 'СТАНКИ ФРЕЗЕРНЫЕ');
other('КАТКИ ДОРОЖНЫЕ САМОХОДНЫЕ ГЛАДКИЕ 8 Т', 'КАТКИ ДОРОЖНЫЕ ПРИЦЕПНЫЕ КУЛАЧКОВЫЕ 8 Т');
other('СИРЕНЬ ИНДИЙСКАЯ С КОМОМ 0,2Х0,15', 'СИРЕНЬ ОБЫКНОВЕННЫЙ С КОМОМ 0,2Х0,15');
other('КИСЛОРОД ТЕХНИЧЕСКИЙ ГАЗООБРАЗНЫЙ', 'АЦЕТИЛЕН ГАЗООБРАЗНЫЙ ТЕХНИЧЕСКИЙ');
/* What the guard may not touch: one word spelled two ways, and one name
   spelled out more fully than the other. */
near('ЩЕБЕНЬ ФРАКЦИЯ 5-20ММ', 'ЩЕБЕНЬ ФРАКЦИИ 5-20ММ', 0.8, {});
near('ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЕ Д-100ММ', 'ТРОЙНИК ПОЛИЭТИЛЕНОВАЯ Д-100ММ', 0.8, {});
near('LOLA DAPXTU', 'LOLA DAPAXTI', 0.7, {});
near('КОЖУХ СТАЛЬНАЯ ЭЛЕКТРОСВАРНАЯ Д-159Х4ММ', 'КОЖУХ ИЗ ТРУБ СТАЛЬНЫХ ЭЛЕКТРОСВАРНЫХ Д-159Х4ММ', 0.7, {});
near('БЕТОН В15', 'БЕТОН ТЯЖЕЛЫЙ КЛАССА В15', 0.62, {});

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
// The invariant that keeps the two keys honest: whatever the identity key
// merges, the match key merges too. If that ever breaks, one of them drifted.
var coarsening = true, drift = null;
for (var gi = 0; gi < names.length && coarsening; gi++) {
  for (var gj = gi + 1; gj < names.length; gj++) {
    if (S.nameKey(names[gi]) !== S.nameKey(names[gj])) continue;
    if (S.matchKey(names[gi]) === S.matchKey(names[gj])) continue;
    coarsening = false; drift = [names[gi], names[gj]]; break;
  }
}
check(coarsening, 'the match key merges everything the identity key merges' + (drift ? ' -> ' + show(drift) : ''));
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

/*
 * Glyphs that arrive from somewhere else.
 *
 * An estimate is pasted together out of other documents, and what comes with
 * it is «м²», a diameter typed on a fullwidth keyboard, a grade written with
 * the Roman-numeral codepoint or the Ukrainian І. None of those characters is
 * in the alphabet the keys are built from, so all of them used to be struck
 * out with the punctuation — and the number they carried went with them. That
 * is the one thing this program may never do.
 */
console.log('-- a character that spells a digit is a digit --');
check(S.unitKey('м²') === S.unitKey('М2'), `«м²» is the square metre (${S.unitKey('м²')})`);
check(S.unitKey('м³') === S.unitKey('М3'), `«м³» is the cubic metre (${S.unitKey('м³')})`);
check(S.unitKey('м²') !== S.unitKey('м'), 'and neither of them is the plain metre');
check(S.matchPair('ПЛЕНКА ПОЛИЭТИЛЕНОВАЯ', 'м²') !== S.matchPair('ПЛЕНКА ПОЛИЭТИЛЕНОВАЯ', 'м'),
  'so a price per square metre is never offered as the price of a metre');
check(S.nameKey('ТРУБА Д-１１０ММ') !== S.nameKey('ТРУБА Д-１６０ММ'),
  'two diameters typed in fullwidth digits are two resources');
check(S.nameKey('ТРУБА Д-１１０ММ') === S.nameKey('ТРУБА Д-110ММ'),
  'and a fullwidth diameter is the same resource as the plain one');
check(S.nameKey('АРМАТУРА АІ') !== S.nameKey('АРМАТУРА АІІІ'),
  'А-I and А-III written with the Ukrainian І are two steel grades');
check(S.nameKey('АРМАТУРА АⅢ') === S.nameKey('АРМАТУРА АIII'),
  'and the Roman-numeral codepoint spells the same grade as the letters');
check(S.matchKey('ЛЮК Ⅱ СОРТА') === S.matchKey('ЛЮК II СОРТА'), 'the match key spells them out too');

/*
 * The three string functions the matcher leans on remember their answers —
 * scoring one project against a region's history asks the same question about
 * the same few hundred names tens of thousands of times. The table that
 * remembers them has no prototype, so a resource named «constructor» is a key
 * like any other rather than a function handed back as an answer.
 */
for (const odd of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
  check(typeof S.matchKey(odd) === 'string' && S.matchKey(odd) === odd.toUpperCase().replace(/_/g, ''),
    `«${odd}» is a name, not a method (${JSON.stringify(S.matchKey(odd))})`);
  check(Array.isArray(S.tokens(odd)) && Array.isArray(S.numbers(odd)),
    `and its words and numbers come back as lists`);
  // The identity key has its own memo, and it is the one a workbook cannot
  // survive: unitKey called .replace on the function it got back.
  check(typeof S.nameKey(odd) === 'string' && typeof S.unitKey(odd) === 'string',
    `and the identity key answers with a key, not a method (${typeof S.nameKey(odd)})`);
}
check(S.matchKey('') === '' && S.matchKey(null) === '', 'an empty name still keys to nothing');
// Asked twice, answered the same — the memo must not hand back another name's answer.
let stable = 0;
for (const r of rows) {
  if (S.matchKey(r.n) === S.matchKey(r.n) && S.tokens(r.n).join('\u0000') === S.tokens(r.n).join('\u0000')) stable++;
}
check(stable === rows.length, `every name answers the same the second time (${stable} of ${rows.length})`);

console.log(fail ? `FAILED (${fail})` : 'normalize OK');
process.exit(fail ? 1 : 0);
