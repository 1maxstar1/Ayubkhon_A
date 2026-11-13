/*
 * Learning from the expert (docs/ai-reja.md, phase 3): the feature schema, the metrics, the dataset and today's rules
 * measured on it. Synthetic data only — the reference fixture (test/refs-fixture.cjs) and an invented world with a
 * simulated expert (test/ml-synth.cjs). No real name, price or document.
 *
 *   - the metrics equal what a hand computes on small cases; nothing-to-measure is null, never 0;
 *   - a line's features never read the smeta price or the expert's price, and stay within bounds;
 *   - every finished price is labelled by the owner's rules (applied line, typed near a line, none is right, left
 *     although a line was lower) or left out for the stated reason;
 *   - the newest fifth of the applications is the test part; a hand-labelled list is kept apart;
 *   - neither the numbers shown nor the saved dataset carry a name or a price;
 *   - building the dataset leaves the suggester's answers byte for byte as they were;
 *   - no score moves a «Похожий» line above a «Документ» one, and no score brings in a line the gate did not;
 *   - on the synthetic world the pipeline finds the planted preference (own region, newest, not «declared»).
 *
 *   node test/ml.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { load, ROOT } = require('./load.cjs');
const F = require('./refs-fixture.cjs');
const W = require('./ml-synth.cjs');

const S = load(load.CORE, load.REFS, load.ML);
const M = S.ml.metrics, FE = S.ml.features, D = S.ml.dataset;
let fail = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fail++; };
const eq = (a, b) => Math.abs(a - b) < 1e-12;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ metrics, by hand */
{
  const qs = [
    { y: [1, 0, 0], pos: true },              // right at once
    { y: [0, 0.5, 0], pos: true },            // second
    { y: [0, 0, 0, 1], pos: true },           // fourth
    { y: [0, 0], pos: true },                 // a right line exists, it was not shown
    { y: [0, 0], none: true },                // none is right, and the policy spoke
    { y: [0], none: true, abstain: true }     // none is right, and it kept silent
  ];
  ok(eq(M.precisionAt1(qs), 1 / 4), 'P@1: one of the four questions with a right line has it first');
  ok(eq(M.recallAt(qs, 3), 2 / 4) && eq(M.recallAt(qs, 4), 3 / 4), 'Recall@3 is 2/4, Recall@4 is 3/4');
  ok(eq(M.mrr(qs), (1 + 1 / 2 + 1 / 4 + 0) / 4), 'MRR is (1 + 1/2 + 1/4 + 0) / 4');
  ok(eq(M.abstention(qs), 1 / 2) && eq(M.answered(qs), 1), 'abstention: silent on one of the two «none is right»; every other question answered');
  const silent = qs.concat([{ y: [1], pos: true, abstain: true }]);
  ok(eq(M.precisionAt1(silent), 1 / 5) && eq(M.answered(silent), 4 / 5) && eq(M.mrr(silent), (1 + 1 / 2 + 1 / 4) / 5),
    'keeping silent where a right line exists is a miss, whatever the hidden order was');
  ok(M.precisionAt1([]) === null && M.mrr([{ y: [0], none: true }]) === null && M.abstention([{ y: [1], pos: true }]) === null &&
    M.ece([], 10) === null && M.medianRelErr([{ rel: null }]) === null, 'nothing to measure is null, not 0');

  const cal = [
    { y: [1], pos: true, conf: 0.8 }, { y: [0, 1], pos: true, conf: 0.8 },      // bin 0.8: half right
    { y: [0], pos: true, conf: 0.2 }, { y: [0], none: true, conf: 0.2 },        // bin 0.2: none right
    { y: [1], pos: true, conf: 0.9, abstain: true }, { y: [1], pos: true }      // silent, or no confidence: not counted
  ];
  ok(eq(M.ece(cal, 10), 0.5 * Math.abs(0.5 - 0.8) + 0.5 * Math.abs(0 - 0.2)), 'calibration error: ½·|0.5 − 0.8| + ½·|0 − 0.2| = 0.25');
  ok(eq(M.ece([{ y: [1], pos: true, conf: 1 }, { y: [0], none: true, conf: 0 }], 10), 0), 'a policy sure when right and unsure when wrong has no calibration error');
  ok(eq(M.medianRelErr([{ rel: 0.1 }, { rel: 0.3 }, { rel: 0.2 }, { rel: null }]), 0.2) && eq(M.medianRelErr([{ rel: 0.1 }, { rel: 0.3 }]), 0.2),
    'the median price error: the middle one, or the mean of the two middle ones');

  const r1 = M.rng(5), r2 = M.rng(5), r3 = M.rng(6);
  const a1 = [r1(), r1(), r1()], a2 = [r2(), r2(), r2()], a3 = [r3(), r3(), r3()];
  let sum = 0; const rr = M.rng(1); for (let i = 0; i < 2e4; i++) sum += rr();
  ok(same(a1, a2) && !same(a1, a3) && a1.every((v) => v >= 0 && v < 1) && Math.abs(sum / 2e4 - 0.5) < 0.01, 'the generator is seeded: the same seed gives the same numbers, in [0, 1)');
  const many = [];
  for (let i = 0; i < 200; i++) many.push({ y: [i % 4 === 0 ? 0 : 1], pos: true });
  const ci = M.bootstrap(many, M.precisionAt1, { n: 400, seed: 3 }), ci2 = M.bootstrap(many, M.precisionAt1, { n: 400, seed: 3 });
  ok(same(ci, ci2) && ci[0] < 0.75 && ci[1] > 0.75 && ci[0] > 0.65 && ci[1] < 0.85, 'the interval of 150/200 holds 0.75, is narrow, and is the same every run (' + ci.map((v) => v.toFixed(3)).join(' … ') + ')');
  ok(same(M.bootstrap([{ y: [1], pos: true }, { y: [1], pos: true }], M.precisionAt1, { n: 50 }), [1, 1]) && M.bootstrap([], M.precisionAt1) === null,
    'all right gives [1, 1]; no questions give no interval');
  const rep = M.report(qs, { n: 100, seed: 1 });
  ok(rep.n === 6 && rep.n_pos === 4 && rep.n_none === 2 && eq(rep.p1, 0.25) && rep.p1_ci && rep.p1_ci[0] <= 0.25 && rep.p1_ci[1] >= 0.25 && M.report(qs, { n: 0 }).p1_ci === null,
    'the report carries every number with its interval and the counts');
}

/* ------------------------------------------------------------------ the fixture */
const pkg = F.makePackage();
const sug = S.refs.create({ policy: 'p3' });
sug.init({ handle: S.refs.open(S.refs.derive(pkg)), sources: pkg.sources });
const PID = pkg.package_id, P = F.PRICES;
const REGION = 'xorazm', ASOF = '2026-06-30';
const all = [].concat(F.SMETA.labor, F.SMETA.machines, F.SMETA.materials);
const answers = () => JSON.stringify(all.map((r) => sug.suggest(S.refs.queryOf({ name: r[0], unit: r[1], section: 'materials' }, { region: REGION, asof: ASOF }))));
const before = answers();

let n = 0;
const row = (name, unit, over) => Object.assign({ workspace: 'w1', contragent: 'c1', region: REGION, name, unit, section: 'materials',
  match_key: S.matchKey(name), match_unit_key: S.matchUnitKey(unit), res_key: 'r' + (++n), kind: 'corrected', source: 'typed', smeta_price: 0,
  final_price: 0, asof: ASOF, finished: ASOF, accepted: false }, over || {});
const ridsOf = (name, unit, section) => sug.gather(S.refs.queryOf({ name, unit, section: section || 'materials' }, { region: REGION, asof: ASOF })).lines
  .map((l) => l.recs.map((r) => r.rid).join('+'));
const one = (r) => D.one(sug, r, { package_id: PID });
const byRid = (r, res) => { const ids = ridsOf(r.name, r.unit, r.section), o = {}; ids.forEach((id, i) => { o[id] = res.y[i]; }); return o; };

/* ------------------------------------------------------------------ features */
{
  ok(new Set(FE.NAMES).size === FE.NAMES.length && /^f\d+-[0-9a-f]{8}$/.test(FE.HASH) && FE.fnv('a|b') !== FE.fnv('a|c') && FE.fnv('a|b') === FE.fnv('a|b'),
    'the feature names are distinct and the schema has a hash (' + FE.NAMES.length + ' features, ' + FE.HASH + ')');
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/ml/features.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  ok(!/smeta_price|final_price|smetaPrice|\bmarket\b|\brow\b/.test(src), 'the feature code names no smeta price, no expert price and no memory row');

  const beton = row('Бетон тяжёлый В15', 'м3', { source: 'ref:' + PID + ':9', final_price: P.g, smeta_price: P.g * 1.2 });
  const a = one(beton);
  const b = one(Object.assign({}, beton, { smeta_price: P.g * 5, final_price: P.h, source: 'ref:' + PID + ':8', kind: 'corrected' }));
  const c = one(Object.assign({}, beton, { kind: 'untouched', source: '', smeta_price: P.h * 2, final_price: P.h * 2 }));
  ok(same(a.x, b.x) && same(a.x, c.x), 'the same question gives the same features whatever the smeta price, the expert\'s price and his decision were');
  const flat = [].concat(...a.x);
  ok(a.x.every((x) => x.length === FE.NAMES.length) && flat.every((v) => typeof v === 'number' && isFinite(v) && v >= -1.5 && v <= 1.5),
    'every line has ' + FE.NAMES.length + ' numbers, each within ±1.5');
  const ix = FE.INDEX, ids = ridsOf(beton.name, beton.unit);
  const x9 = a.x[ids.indexOf('9')], x8 = a.x[ids.indexOf('8')], x7 = a.x[ids.indexOf('7')];
  ok(x9[ix.same_region] === 1 && x8[ix.same_region] === 0 && x8[ix.other_region] === 1 && x9[ix.t_document] === 1 && x9[ix.h_exact_key] === 1 &&
    x9[ix.newest] === 1 && x7[ix.newest] === 0 && x9[ix.f_vat_inferred] === 1 && x8[ix.f_vat_inferred] === 0 && x8[ix.b_list] === 1 && x9[ix.b_offer] === 1 &&
    x7[ix.is_lowest] === 1 && x8[ix.is_highest] === 1 && x9[ix.q_materials] === 1 && x7[ix.age] > x9[ix.age],
    'region, tier, date, price basis, flags and the place among the other prices are read from the line');
  ok(x9[ix.pos] === 0 && x9[ix.shown] === 1 && x7[ix.pos] > 0 && x8[ix.pos] > x7[ix.pos], 'the place on screen is recorded: the first line, then the others');
  const n9 = FE.neutral(x9), n8 = FE.neutral(x8);
  ok(n9[ix.pos] === 0 && n8[ix.pos] === 0 && n8[ix.shown] === 1 && n8[ix.in_summary] === 0 && x8[ix.pos] > 0 &&
    FE.POSITION.every((k) => n8[ix[k]] === n9[ix[k]]) && n8[ix.same_region] === x8[ix.same_region],
    'a model is asked with every line «in the first place»: only the position features change');
  const cab = one(row('Кабель ВВГ 3х2,5', 'м', { source: 'typed', final_price: P.typed }));
  ok(cab.x.every((x) => x[ix.in_summary] === 1 && x[ix.pos] === 0 && x[ix.shown] === 1), 'lines folded into «медиана N строк» stand where the summary stands');
  const lab = one(row('Затраты труда рабочих-строителей', 'чел-ч', { section: 'labor', final_price: P.typed }));
  ok(lab.x[0][ix.t_exact] === 1 && lab.x[0][ix.h_wage] === 1 && lab.x[1][ix.f_older_quarter] === 1 && lab.x[0][ix.q_labor] === 1 && lab.q.section === 'labor',
    'a wage-table line is «Ставка по таблице», an older quarter is flagged');
  const rel = one(row('Кабель ВВГнг(А)-LS 3х2,5', 'м', { final_price: P.typed }));
  ok(rel.x.every((x) => x[ix.t_similar] === 1 && x[ix.h_relaxed] === 1 && x[ix.grade_relaxed] > 0 && x[ix.drops] > 0), 'a relaxed match is «Похожий», with what it dropped counted');
}

/* ------------------------------------------------------------------ labels */
{
  ok(same(D.source('ref:fake-1:25'), { type: 'ref', pkg: 'fake-1', rids: [25], cut: false }) &&
    same(D.source('ref:fake-1:median:2,3'), { type: 'ref', pkg: 'fake-1', rids: [2, 3], cut: false }) &&
    same(D.source('ref:fake-1:median:2,3…'), { type: 'ref', pkg: 'fake-1', rids: [2, 3], cut: true }) &&
    D.source('typed').type === 'typed' && D.source('').type === 'typed' && D.source('hint:abcdefghijklmno').type === 'hint' &&
    D.source('uzex:12:3').type === 'uzex' && D.source('mem:abcdefghijklmno').type === 'mem' && D.source('pct').type === 'pct',
    'a recorded source is read: one record, a summary of records, a cut list, and the other kinds');

  let r = row('Бетон тяжёлый В15', 'м3', { source: 'ref:' + PID + ':9', final_price: P.g, smeta_price: P.g * 1.2 });
  let q = one(r);
  ok(q.kind === 'ref' && q.w === 1 && same(byRid(r, q), { 9: 1, 8: 0, 7: 0 }) && q.base.y[0] === 1 && eq(q.base.rel, 0) && q.base.tier === 1,
    'applied from the reference: that line is 1, the others 0; today\'s first line was the one');
  r = row('Бетон тяжёлый В15', 'м3', { source: 'ref:' + PID + ':8', final_price: P.h, smeta_price: P.h * 1.2 });
  q = one(r);
  ok(q.kind === 'ref' && same(byRid(r, q), { 9: 0, 8: 1, 7: 0 }) && same(q.base.y, [0, 0, 1]) && eq(q.base.rel, Math.abs(P.g - P.h) / P.h),
    'another line applied: today\'s first line is wrong, the right one stands third; the price error is against the expert\'s price');
  r = row('Кабель ВВГ 3х2,5', 'м', { source: 'ref:' + PID + ':median:2,3', final_price: (P.a + P.g) / 2, smeta_price: P.b });
  q = one(r);
  ok(q.kind === 'ref' && same(byRid(r, q), { 2: 0.5, 3: 0.5 }) && same(q.base.y, [1, 0.5, 0.5]),
    'a summary applied: each of its lines is 0.5; today\'s first line — the summary — is right');
  r = row('Кабель ВВГ 3х2,5', 'м', { source: 'typed', final_price: P.a * 1.015, smeta_price: P.b });
  q = one(r);
  ok(q.kind === 'near' && q.w === 0.5 && same(byRid(r, q), { 2: 0.5, 3: 0 }) && same(q.base.y, [0, 0.5, 0]),
    'a typed price within 2 % of a line: that line is 0.5 (it stood inside the summary, second on screen)');
  q = one(row('Кабель ВВГ 3х2,5', 'м', { source: 'typed', final_price: P.a * 1.03, smeta_price: P.b }));
  ok(q.kind === 'none' && q.y.every((v) => v === 0), 'a typed price 3 % away from every line: none is right');
  q = one(row('Кабель ВВГ 3х2,5', 'м', { source: 'hint:abcdefghijklmno', final_price: P.typed, smeta_price: P.b }));
  ok(q.kind === 'none' && eq(q.base.rel, Math.abs((P.a + P.g) / 2 - P.typed) / P.typed), 'a price from «Прежние проекты» no line has: none is right too');
  q = one(row('Бетон тяжёлый В15', 'м3', { source: '', final_price: P.c, smeta_price: P.h }));
  ok(q.kind === 'near', 'a corrected price with no recorded source is a typed one');

  r = row('Бетон тяжёлый В15', 'м3', { kind: 'checked', source: '', smeta_price: P.g * 1.1, final_price: P.g * 1.1 });
  q = one(r);
  ok(q.kind === 'left' && q.w === 1 && same(byRid(r, q), { 9: 0, 8: -1, 7: 0 }) && q.base.rel === null,
    'the smeta price left and marked «проверено» while two lines were lower: those two are 0, the line above it is not judged');
  q = one(Object.assign({}, r, { kind: 'untouched' }));
  ok(q.kind === 'left' && q.w === D.LEFT_UNMARKED, 'merely left: the same, at half the weight');
  ok(one(row('Бетон тяжёлый В15', 'м3', { kind: 'untouched', source: '', smeta_price: P.c * 0.99, final_price: P.c * 0.99 })).skip === 'above' &&
    one(row('Бетон тяжёлый В15', 'м3', { kind: 'checked', source: '', smeta_price: P.c * 1.01, final_price: P.c * 1.01 })).skip === 'above',
    'left while every line was at or above the smeta price (within 2 %): not a question for the ranker');
  ok(one(row('Бетон тяжёлый В15', 'м3', { source: 'pct', final_price: P.c, smeta_price: P.h })).skip === 'pct' &&
    one(row('Бетон тяжёлый В15', 'м3', { kind: 'zeroed', source: '', final_price: 0, smeta_price: P.h })).skip === 'zeroed' &&
    one(row('Бетон тяжёлый В15', 'м3', { source: 'typed', final_price: 0, smeta_price: P.h })).skip === 'zeroed',
    '«Применить %» and a struck-out resource are left out');
  ok(one(row('Краска масляная белая МА-15', 'кг', { final_price: P.typed })).skip === 'empty', 'a resource the reference has no line for is left out');
  ok(one(row('Бетон тяжёлый В15', 'м3', { source: 'ref:other-20250101-1:9', final_price: P.typed, smeta_price: P.h })).skip === 'lost' &&
    one(row('Бетон тяжёлый В15', 'м3', { source: 'ref:' + PID + ':999', final_price: P.typed, smeta_price: P.h })).skip === 'lost' &&
    one(row('Бетон тяжёлый В15', 'м3', { source: 'ref:other-20250101-1:9', final_price: P.g, smeta_price: P.h })).kind === 'near',
    'applied from another package: the record is gone — left out, unless a line of today has that price');
  ok(D.refLabel([2, 3], D.source('ref:x-1:median:2,3')) === 1 && D.refLabel([2], D.source('ref:x-1:median:2,3')) === 0.5 &&
    D.refLabel([2, 4], D.source('ref:x-1:median:2,3')) === 0 && D.refLabel([2, 3, 4], D.source('ref:x-1:median:2,3…')) === 1 &&
    D.refLabel([2, 3], D.source('ref:x-1:2')) === 0 && D.refLabel([5], D.source('ref:x-1:2')) === 0,
    'a line is the applied one only when its records are exactly those applied (a cut list may be longer)');
}

/* ------------------------------------------------------------------ the dataset: split, counts, what it carries */
{
  const rows = [];
  const add = (ws, day, list) => list.forEach((r) => rows.push(Object.assign(r, { workspace: ws, finished: day, asof: ASOF })));
  const A = () => [
    row('Бетон тяжёлый В15', 'м3', { source: 'ref:' + PID + ':9', final_price: P.g, smeta_price: P.h, accepted: true }),
    row('Кабель ВВГ 3х2,5', 'м', { source: 'typed', final_price: P.a, smeta_price: P.b }),
    row('Анкер М8', 'шт', { source: 'typed', final_price: P.typed, smeta_price: P.d }),
    row('Экскаватор одноковшовый 0,65 м3', 'маш-ч', { section: 'machines', kind: 'untouched', source: '', smeta_price: P.e * 1.5, final_price: P.e * 1.5 }),
    row('Затраты труда рабочих-строителей', 'чел-ч', { section: 'labor', kind: 'checked', source: '', smeta_price: P.a * 0.9, final_price: P.a * 0.9 }),
    row('Краска масляная белая МА-15', 'кг', { source: 'typed', final_price: P.typed, smeta_price: P.a }),
    row('Кабель ВВГ 3х4', 'м', { source: 'pct', final_price: P.c * 0.9, smeta_price: P.c }),
    row('Труба стальная электросварная 57х3,5', 'т', { kind: 'zeroed', source: '', final_price: 0, smeta_price: P.f })
  ];
  ['2026-03-01', '2026-03-05', '2026-04-01', '2026-05-01', '2026-06-01'].forEach((d, i) => add('ws' + (i + 1), d, A()));
  // the newest application also asks for a name no earlier one has
  rows.push(row('Перевозка грузов 20 т 15 км', 'т-км', { workspace: 'ws5', finished: '2026-06-01', source: 'typed', final_price: P.a / 1000, smeta_price: P.c }));
  const seen = [];
  const ds = D.build(sug, rows, { package_id: PID, now: '2026-11-13T00:00:00Z', progress: (d, t) => seen.push(d + '/' + t),
    gold: [{ name: 'Бетон тяжёлый В15', unit: 'м3', region: REGION, asof: ASOF, rid: 8 }, { name: 'Анкер М8', unit: 'шт', region: REGION, asof: ASOF, none: true },
      { name: 'Кабель ВВГ 3х4', unit: 'м', region: REGION, asof: ASOF, price: P.c }] });
  const split = {}; ds.apps.forEach((a) => { split[a.id] = a.split; });
  ok(same(split, { ws1: 'train', ws2: 'train', ws3: 'train', ws4: 'train', ws5: 'test', gold: 'gold' }), 'of five applications the newest is the test part; the hand-labelled list is apart');
  const kinds = (sp) => { const o = {}; ds.queries.filter((q) => ds.apps[q.a].split === sp).forEach((q) => { o[q.kind] = (o[q.kind] || 0) + 1; }); return o; };
  ok(same(kinds('train'), { ref: 4, near: 4, none: 4, left: 4 }) && same(kinds('test'), { ref: 1, near: 2, none: 1, left: 1 }) && same(kinds('gold'), { ref: 1, none: 1, near: 1 }),
    'each application gives one applied line, one typed near a line, one «none is right» and one «left»; the list gives its three');
  ok(ds.rows === rows.length + 3 && ds.queries.length + ds.skipped.above + ds.skipped.pct + ds.skipped.zeroed + ds.skipped.empty + ds.skipped.lost === ds.rows &&
    same(ds.skipped, { above: 5, pct: 5, zeroed: 5, empty: 5, empty_corrected: 5, lost: 0 }), 'every row is a question or is left out for a stated reason');
  const test = ds.queries.filter((q) => ds.apps[q.a].split === 'test');
  ok(test.filter((q) => q.seen).length === 4 && test.filter((q) => !q.seen).length === 1 && ds.queries.filter((q) => ds.apps[q.a].split === 'train').every((q) => !q.seen),
    'a name of the test part is «seen» when the training part asked for it; the transport name is new');
  ok(seen[0] === '0/' + (rows.length + 3) && seen[seen.length - 1] === (rows.length + 3) + '/' + (rows.length + 3), 'progress is reported to the end');
  ok(ds.format === 'smeta-ml-dataset' && ds.version === 1 && ds.schema.hash === FE.HASH && same(ds.schema.names, FE.NAMES) && ds.package_id === PID && ds.built === '2026-11-13T00:00:00Z',
    'the dataset names its format, its feature schema and the package it was asked of');

  for (const [n1, d1] of [[1, 0], [2, 1], [4, 1], [5, 1], [7, 1], [8, 2], [10, 2], [13, 3]]) {
    const apps = []; for (let i = 0; i < n1; i++) apps.push({ id: 'a' + String(i).padStart(2, '0'), finished: '2026-01-' + String(10 + (i % 5)).padStart(2, '0'), split: null });
    D.split(apps);
    const t = apps.filter((a) => a.split === 'test');
    if (t.length !== d1 || apps.some((a) => a.split !== 'test' && a.split !== 'train') ||
        t.some((x) => apps.some((a) => a.split === 'train' && (a.finished > x.finished || (a.finished === x.finished && a.id > x.id))))) { ok(false, 'split of ' + n1); }
  }
  ok(true, 'the test part is the newest fifth (one application of 2–7, two of 8–12), none of a single application; ties go by id');

  const b = D.baseline(ds, { n: 200, seed: 1 });
  ok(b.policy === 'p3' && b.train.n_pos === 8 && b.train.n_none === 4 && b.train.n_left === 4 && eq(b.train.p1, 0.5) && eq(b.train.r3, 1) && eq(b.train.mrr, 0.75) &&
    eq(b.train.abstention, 0) && b.test.n_pos === 3 && b.gold.n_pos === 2 && b.gold.n_none === 1 && b.conf_from === 'train' && same(b.tiers, { 1: { n: 12, right: 4 } }),
    'today\'s rules on the training part: the applied line first (4 of 8), the typed one second; never silent');
  ok(eq(b.train.ece, Math.abs(4 / 12 - 5 / 14)) && same(b.rank, [0, 6, 5, 0, 0, 0, 0, 0]) && eq(b.test_seen.n_pos, 2) && b.test_unseen.n_pos === 1,
    'its confidence is how often the first line of that tier was right in the training part; where the right line stood is counted');

  const sum = D.summary(ds, { n: 200, seed: 1 }), text = D.text(sum), json = JSON.stringify(ds);
  const get = (k) => (sum.find((r) => r[0] === k) || [])[1];
  ok(get('rows') === ds.rows && get('applications') === 5 && get('applications.test') === 1 && get('queries.ref') === 6 && get('queries.ref.gold') === 1 &&
    get('skipped.pct') === 5 && get('section.materials') === 18 && get('section.transport') === 1 && /^0\.500 \[/.test(get('p3.train.p1')) && get('p3.rank') === '6 5 0 0 0 0 | lower 0 | not shown 0' &&
    get('queries.accepted_by_contractor') === 5 && /\/ /.test(get('lift.same_region')), 'the summary gives the counts, today\'s metrics with intervals, and what the taken lines have more of');
  const secret = (s) => /[А-Яа-яЁё]/.test(s) || Object.keys(P).some((k) => s.indexOf(String(P[k])) >= 0 || s.indexOf(String(Math.round(P[k]))) >= 0 || s.indexOf(String(Math.floor(P[k]))) >= 0) ||
    pkg.sources.some((x) => s.indexOf(x.id) >= 0);
  ok(!secret(text) && sum.every((r2) => typeof r2[0] === 'string' && /^[a-z0-9_.]+$/.test(r2[0])), 'the numbers to copy carry no name, no price and no document');
  ok(!secret(json) && !/"name"|"unit"|price"/.test(json.replace('"names"', '')), 'the saved dataset carries no name, no unit, no price and no document either (' + Math.round(json.length / 1024) + ' KB)');
  ok(answers() === before, 'after all of it the suggester answers byte for byte as before');
}

/* ------------------------------------------------------------------ another order, measured the same way */
{
  const ix = FE.INDEX, mk = (o) => { const x = FE.NAMES.map(() => 0); Object.keys(o).forEach((k) => { x[ix[k]] = o[k]; }); return x; };
  const hand = { apps: [{ id: 'a', split: 'test' }], queries: [
    // a «Похожий» line the expert took, a «Документ», an «Оценка», a «Ставка по таблице»
    { a: 0, kind: 'ref', w: 1, x: [mk({ t_similar: 1, sim: 1, pos: 0.6, shown: 1 }), mk({ t_document: 1, sim: 0.2 }), mk({ t_estimate: 1, sim: 0.9 }), mk({ t_exact: 1, sim: 0.1 })],
      y: [1, 0, 0, 0], tiers: [2, 1, 1.5, 0], base: { y: [0, 0, 0, 1], tier: 0, rel: null } },
    { a: 0, kind: 'none', w: 1, x: [mk({ t_document: 1, sim: 0.3 })], y: [0], tiers: [1], base: { y: [0], tier: 1, rel: null } },
    { a: 0, kind: 'left', w: 1, x: [mk({ t_document: 1, sim: 0.3 }), mk({ t_document: 1 })], y: [0, -1], tiers: [1, 1], base: { y: [0, 0], tier: 1, rel: null } }
  ] };
  const order = [];
  const r = D.evaluate(hand, (x) => { order.push(x[ix.sim]); return x[ix.sim]; }, { n: 0 });
  ok(eq(r.p1, 0) && eq(r.mrr, 1 / 3) && r.n_pos === 1 && r.n_none === 1, 'a score that loves the «Похожий» line cannot put it above «Документ» and «Ставка по таблице»: it stands third, after them');
  const flip = D.evaluate(hand, (x) => -x[ix.sim], { n: 0 });
  ok(eq(flip.mrr, 1 / 4), 'and a score that hates it puts it last of its own tier group — fourth');
  let seenPos = 0;
  D.evaluate(hand, (x) => { seenPos += x[ix.pos] + x[ix.in_summary]; if (x[ix.shown] !== 1) seenPos++; return 0; }, { n: 0 });
  ok(seenPos === 0, 'a score is asked with the position on screen replaced by a constant');
  ok(order.length === 5 && eq(D.evaluate(hand, () => 0, { n: 0, abstain: () => true }).abstention, 1) &&
    eq(D.evaluate(hand, () => 0, { n: 0, abstain: () => true }).p1, 0), 'only the lines of the judged questions are scored (a «left» question is not ranked); a silent policy is right on «none» and wrong elsewhere');
  ok(D.evaluate(hand, () => 0, { n: 0, split: 'train' }).n === 0 && D.evaluate(hand, () => 0, { n: 0 }).n === 2, 'by default only the test part is measured');
}

/* ------------------------------------------------------------------ the synthetic world: the planted preference is found */
{
  const w = W.world(S, { seed: 11, apps: 15, perApp: 30, items: 80, noise: 0.05 });
  const ds = D.build(w.sug, w.rows, { package_id: w.pkg.package_id });
  const again = W.world(S, { seed: 11, apps: 15, perApp: 30, items: 80, noise: 0.05 });
  const sum = D.summary(ds, { n: 200, seed: 2 });
  ok(D.text(sum) === D.text(D.summary(D.build(again.sug, again.rows, { package_id: again.pkg.package_id }), { n: 200, seed: 2 })), 'the same seed gives the same world and the same numbers');
  const kinds = {}; ds.queries.forEach((q) => { kinds[q.kind] = (kinds[q.kind] || 0) + 1; });
  const sk = ds.skipped;
  ok(kinds.ref > 100 && kinds.near > 30 && kinds.none > 20 && kinds.left > 10 && sk.above > 10 && sk.pct > 5 && sk.zeroed > 5 &&
    ds.queries.length + sk.above + sk.pct + sk.zeroed + sk.empty + sk.lost === w.rows.length && sk.lost === 0 &&
    sk.pct === w.truth.pct && sk.zeroed === w.truth.zeroed && sk.above === w.truth.left_above && kinds.left === w.truth.left_lower && kinds.none === w.truth.typed_far,
    'the simulated expert\'s decisions come back as the kinds he made them (' + JSON.stringify(kinds) + ')');
  ok(ds.apps.filter((a) => a.split === 'test').length === 3 && ds.apps.filter((a) => a.split === 'train').length === 12, 'three of the fifteen applications are the test part');

  const li = D.lift(ds), at = (k) => FE.NAMES.indexOf(k);
  ok(li.pos[at('same_region')] > 2 * li.neg[at('same_region')] && li.pos[at('f_declared')] < li.neg[at('f_declared')] / 2 && li.pos[at('newest')] > 1.5 * li.neg[at('newest')] &&
    li.pos[at('other_region')] < li.neg[at('other_region')],
    'the lines he took are of his region, newer and not «declared» far more often than the lines he passed over');
  const ix = FE.INDEX;
  const planted = (x) => W.PREFER.same_region * x[ix.same_region] + W.PREFER.newer * (1 - x[ix.age_rank]) + W.PREFER.declared * x[ix.f_declared];
  const base = D.baseline(ds, { n: 300, seed: 4 }), mine = D.evaluate(ds, planted, { n: 300, seed: 4 }), wrong = D.evaluate(ds, (x) => -planted(x), { n: 0 });
  ok(mine.p1 > 0.8 && mine.p1_ci[0] > base.test.p1_ci[1] && base.test.p1 < 0.7 && wrong.p1 < base.test.p1,
    'ordering by the planted preference is right first far more often than today\'s rules, and the opposite order far less (' +
    [wrong.p1, base.test.p1, mine.p1].map((v) => v.toFixed(2)).join(' < ') + ')');
  ok(eq(base.test.abstention, 0) && eq(base.test.answered, 1) && base.test.price_err !== null && base.test.n_price > 0 && base.test.ece !== null,
    'today\'s rules never keep silent; their price error and calibration are measured');
  const none = W.world(S, { seed: 12, apps: 6, perApp: 20, items: 40, noise: 0 });
  const d0 = D.build(none.sug, none.rows, { package_id: none.pkg.package_id });
  const refOnly = { apps: d0.apps, queries: d0.queries.filter((q) => q.kind === 'ref' && q.y.indexOf(1) >= 0) };
  ok(refOnly.queries.length > 20 && eq(D.evaluate(refOnly, (x) => W.PREFER.same_region * x[ix.same_region] - W.PREFER.newer * x[ix.age] * 2 + W.PREFER.declared * x[ix.f_declared], { n: 0, split: 'all' }).p1, 1),
    'without noise, every line he applied is the first by his own preference');
}

console.log(fail ? `\nml: ${fail} FAILED` : '\nml: all passed');
process.exit(fail ? 1 : 0);
