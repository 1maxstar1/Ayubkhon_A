/*
 * Reading a resource's band off its own name.
 *
 * A smeta is written in bands — ЗАТРАТЫ ТРУДА, СТРОИТЕЛЬНЫЕ МАШИНЫ И
 * МЕХАНИЗМЫ, СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ, ОБОРУДОВАНИЕ — and the
 * parser reads each row's band from the header it sits under. This is the
 * second opinion, taken from the name alone, used to fill in a sheet that has
 * no bands and to say when a row looks out of place.
 *
 * Measured against every resource of the three real workbooks
 * (test/fixtures/resource-sections.json, labelled by the band each row was
 * actually filed under). Two of the workbooks were used to write the lexicon;
 * the third, 321.xlsx, was never looked at while writing it and is the
 * honest number.
 *
 *   node test/sections.cjs
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.dirname(__dirname);
const ctx = { console };
vm.createContext(ctx);
for (const f of ['src/lib/normalize.js', 'src/lib/match.js', 'src/lib/sections.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const S = ctx.S;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/* ------------------------------------------------- what the unit alone says */
console.log('-- the unit settles two of the four bands --');
const is = (name, unit, want) => {
  const g = S.sections.classify(name, unit);
  check(g.section === want, `${want.padEnd(9)} <- ${unit.padEnd(7)} ${name.slice(0, 46)}` +
    (g.section === want ? '' : `  (got ${g.section || 'nothing'})`));
};
is('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 'labor');
is('Затраты труда рабочих-строителей', 'чел.-ч', 'labor');
is('БУЛЬДОЗЕРЫ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ СТРОИТЕЛЬСТВА 96 КВТ', 'МАШ-Ч', 'machines');
is('АВТОМОБИЛИ-САМОСВАЛЫ ГРУЗОПОДЪЕМНОСТЬЮ ДО 10 Т', 'МАШ-Ч', 'machines');

console.log('-- and the name settles them without a unit --');
is('ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ ДИЗЕЛЬНЫЕ', '', 'machines');
is('АВТОГРЕЙДЕРЫ СРЕДНЕГО ТИПА', '', 'machines');
is('БЕТОН ТЯЖЕЛЫЙ КЛАССА В15', 'М3', 'materials');
is('ЩЕБЕНЬ ФРАКЦИИ 5-20ММ', 'М3', 'materials');
is('ГОРЯЧЕКАТАННАЯ АРМАТУРНАЯ СТАЛЬ КЛАССА А-III ДИАМ. 16 ММ', 'Т', 'materials');
is('ДОРОЖНЫЙ ЗНАК 4.1.1', 'ШТ', 'equipment');
is('КАШТАН', 'ШТ', 'materials');          // a sapling is bought, not hired
is('KASHTAN', 'ШТ', 'materials');         // and reads the same in Latin

console.log('-- the traps --');
is('КРАН ШАРОВОЙ Д-63ММ', 'ШТ', 'materials');        // a ball valve, not a crane
is('БЕНЗИН АВТОМОБИЛЬНЫЙ АИ-98', 'Т', 'materials');  // fuel, not a car
check(S.sections.classify('РОЗЕТКА ШТЕПСЕЛЬНАЯ ДЛЯ ОТКРЫТОЙ УСТАНОВКИ', 'ШТ').section !== 'machines',
  '«для открытой установки» is not a machine');
check(S.sections.classify('', '').section === '', 'an empty name says nothing');
check(S.sections.classify('ФЫВАПРОЛДЖ', 'ШТ').section === '' ||
      S.sections.classify('ФЫВАПРОЛДЖ', 'ШТ').confidence < 0.9,
  'a name it does not know is not answered confidently');

console.log('-- materials and equipment are one band for an accusation --');
check(S.sections.band('equipment') === S.sections.band('materials'),
  'because the workbooks themselves disagree where that line runs');
check(S.sections.band('machines') !== S.sections.band('materials'), 'the other bands are distinct');

/* ------------------------------------------------------------- the corpus */
const rows = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/resource-sections.json'), 'utf8'));
const HELD = 'e1e43f34';                 // 321.xlsx — the sample document, held out
const train = rows.filter((r) => r.f !== HELD);
const held = rows.filter((r) => r.f === HELD);
check(rows.length > 1500 && held.length > 500,
  `corpus: ${rows.length} labelled resources, ${held.length} of them held out`);

function score(set) {
  let right = 0, wrong = 0, quiet = 0;
  for (const r of set) {
    const g = S.sections.classify(r.n, r.u);
    if (!g.section) { quiet++; continue; }
    if (S.sections.band(g.section) === S.sections.band(r.s)) right++; else wrong++;
  }
  return { right, wrong, quiet, precision: right / (right + wrong) };
}
for (const [label, set] of [['training', train], ['held out', held]]) {
  const s = score(set);
  console.log(`   ${label}: ${set.length} rows — right ${s.right}, wrong ${s.wrong}, no answer ${s.quiet}` +
    ` (${(s.precision * 100).toFixed(1)}% of the answers it gives)`);
}
const h = score(held);
check(h.precision >= 0.98, `on the workbook it never saw, ${(h.precision * 100).toFixed(1)}% of its answers are right`);
check(h.quiet / held.length <= 0.15, `and it answers ${(100 - h.quiet / held.length * 100).toFixed(0)}% of the rows`);

// The two bands the estimate is really about must be near-perfect: a machine
// filed as a material would land in the wrong band of the comparison table.
for (const band of ['machines', 'labor']) {
  const set = held.filter((r) => r.s === band);
  const got = set.filter((r) => S.sections.classify(r.n, r.u).section === band).length;
  check(got / set.length >= 0.98, `${band}: ${got} of ${set.length} recognised on the held-out workbook`);
}
// And nothing else may be mistaken for one of them.
const falseMachines = held.filter((r) => r.s !== 'machines' && S.sections.classify(r.n, r.u).section === 'machines');
check(falseMachines.length <= 2,
  `only ${falseMachines.length} non-machine mistaken for a machine` +
  (falseMachines.length ? ' -> ' + falseMachines.map((r) => r.n.slice(0, 40)).join(' | ') : ''));

/* ---------------------------------------------- the report fills in a gap */
console.log('-- filling in a sheet that has no section bands --');
const unlabelled = held.filter((r) => r.s === 'machines').slice(0, 3)
  .concat(held.filter((r) => r.s === 'materials').slice(0, 3));
const placed = unlabelled.filter((r) => {
  const g = S.sections.classify(r.n, r.u);
  return g.section && g.confidence >= 0.6 && S.sections.band(g.section) === S.sections.band(r.s);
});
check(placed.length === unlabelled.length,
  `${placed.length} of ${unlabelled.length} unlabelled rows land in the right band`);

console.log('-- disagreements --');
const planted = [
  { name: 'ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ ДИЗЕЛЬНЫЕ', unit: 'МАШ-Ч', section: 'materials' },
  { name: 'БЕТОН ТЯЖЕЛЫЙ КЛАССА В15', unit: 'М3', section: 'materials' },
  { name: 'ЩЕБЕНЬ ФРАКЦИИ 5-20ММ', unit: 'М3', section: 'machines' }
];
const found = S.sections.disagreements(planted);
check(found.length === 2, `both planted mistakes reported, the correct row is not (${found.length})`);
check(found.every((d) => d.evidence.length), 'each says what made it think so');

console.log(fail ? `FAILED (${fail})` : 'sections OK');
process.exit(fail ? 1 : 0);
