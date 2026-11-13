/*
 * The price model (docs/ai-reja.md, «Модель цен»): the evidence about a resource, the dataset of finished prices,
 * the fitted correction and the decision «this smeta price is too high». Synthetic data only (the reference fixture
 * and the invented expert of test/ml-synth.cjs) — no real name, price or document.
 *
 *   - a finished row says «the price is this» (corrected), «at least this» (left), or nothing (struck out, percent);
 *   - the evidence of a resource never reads its own smeta price; memory comes only from EARLIER applications of
 *     the same region, never from the application itself or a later one;
 *   - the loss and its gradient agree with numbers computed by hand and by finite differences; a price that was
 *     left only pushes a prediction up, never down;
 *   - a model of another schema decides nothing; the decision flags only above its margin;
 *   - on the synthetic world the fitted correction is the planted one, the expert's own earlier prices beat the bare
 *     reference line, and the same data give the same model;
 *   - the numbers shown carry no name and no price.
 *
 *   node test/ml-price.cjs
 */
'use strict';
const { load } = require('./load.cjs');
const F = require('./refs-fixture.cjs');
const W = require('./ml-synth.cjs');

const S = load(load.CORE, load.REFS, load.ML);
const PD = S.ml.pricedata, PM = S.ml.pricemodel;
let fail = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fail++; };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const pkg = F.makePackage(), P = F.PRICES;
const sug = S.refs.create({ policy: 'p3' });
sug.init({ handle: S.refs.open(S.refs.derive(pkg)), sources: pkg.sources });
const REGION = 'xorazm';
let n = 0;
const row = (name, unit, over) => Object.assign({ workspace: 'w1', contragent: 'c1', region: REGION, name, unit, section: 'materials',
  match_key: S.matchKey(name), match_unit_key: S.matchUnitKey(unit), res_key: 'r' + (++n), kind: 'corrected', source: 'typed', smeta_price: 0,
  final_price: 0, asof: '2026-06-30', finished: '2026-11-13', accepted: false }, over || {});
const item = (r, over) => Object.assign({ name: r.name, unit: r.unit, section: r.section, region: r.region, asof: r.asof, key: PD.keyOf(r), workspace: r.workspace,
  contragent: r.contragent }, over || {});
const ix = PD.INDEX;

/* ------------------------------------------------------------------ what a row says */
{
  ok(same(PD.label({ kind: 'corrected', source: 'typed', final_price: 80, smeta_price: 100 }), { kind: 'price', y: 80 }) &&
    same(PD.label({ kind: 'checked', final_price: 100, smeta_price: 100 }), { kind: 'floor', y: 100 }) &&
    same(PD.label({ kind: 'untouched', final_price: 100, smeta_price: 100 }), { kind: 'floor', y: 100 }),
    'a corrected price is the price; a price that was left says «at least this»');
  ok(PD.label({ kind: 'corrected', source: 'pct', final_price: 80, smeta_price: 100 }).kind === null && PD.label({ kind: 'zeroed', final_price: 0, smeta_price: 100 }).kind === null &&
    PD.label({ kind: 'corrected', source: 'typed', final_price: 0, smeta_price: 100 }).kind === null && PD.label({ kind: 'checked', smeta_price: 0 }).kind === null,
    'a blanket percent, a struck-out resource and a smeta price of 0 say nothing');
  ok(new Set(PD.NAMES).size === PD.NAMES.length && /^p\d+-[0-9a-f]{8}$/.test(PD.HASH) && PD.HASH !== S.ml.features.HASH, 'the evidence has its own schema hash (' + PD.NAMES.length + ' features, ' + PD.HASH + ')');
}

/* ------------------------------------------------------------------ evidence */
{
  const beton = 'Бетон тяжёлый В15';
  // nothing remembered: the reference line is the anchor
  const r0 = row(beton, 'м3', { smeta_price: P.h, final_price: P.g });
  const e0 = PD.evidence(item(r0), { sug, mem: {} });
  ok(e0 && e0.by === 'ref' && near(e0.anchor, P.g, 0.01) && e0.x[ix.a_ref] === 1 && e0.x[ix.r_has] === 1 && e0.x[ix.r_document] === 1 && e0.x[ix.r_wide] === 1 &&
    e0.x[ix.m_has] === 0 && near(e0.x[ix.r_price], 0) && e0.x[ix.r_min] < 0 && e0.x[ix.s_materials] === 1,
    'with nothing remembered the first reference line is the anchor; its tier and flags are read');
  ok(PD.evidence(item(row('Краска масляная белая МА-15', 'кг')), { sug, mem: {} }) === null, 'no reference line and nothing remembered: no evidence — no proposal');

  // memory: earlier applications of the same region only
  const earlier = [
    row(beton, 'м3', { workspace: 'w0', contragent: 'c9', asof: '2026-03-01', smeta_price: P.h, final_price: P.c }),
    row(beton, 'м3', { workspace: 'w00', contragent: 'c9', asof: '2025-12-01', smeta_price: P.h, final_price: P.a, accepted: true }),
    row(beton, 'м3', { workspace: 'wL', asof: '2026-08-01', smeta_price: P.h, final_price: P.typed }),                  // later
    row(beton, 'м3', { workspace: 'wR', region: 'toshkent_sh', asof: '2026-01-01', smeta_price: P.h, final_price: P.typed }),  // another region
    row(beton, 'м3', { workspace: 'w1', asof: '2026-02-01', smeta_price: P.h, final_price: P.typed }),                  // the application itself
    row(beton, 'м3', { workspace: 'wP', asof: '2026-02-01', source: 'pct', smeta_price: P.h, final_price: P.typed }),   // a percent
    row(beton, 'м3', { workspace: 'wO', asof: '2023-02-01', smeta_price: P.h, final_price: P.typed }),                  // three years old
    row(beton, 'м3', { workspace: 'wA', contragent: 'c7', asof: '2026-01-15', kind: 'checked', source: 'mark', smeta_price: P.b, final_price: P.b })
  ];
  const mem = PD.index(earlier);
  const e1 = PD.evidence(item(r0), { sug, mem });
  ok(e1.by === 'mem' && near(e1.anchor, P.c) && e1.memN === 2 && e1.x[ix.a_mem] === 1 && e1.x[ix.m_has] === 1 && e1.x[ix.m_other_ctr] === 1 && e1.x[ix.m_accepted] === 0 &&
    near(e1.x[ix.m_med], Math.log((P.c + P.a) / 2 / P.c)) && near(e1.x[ix.m_spread], Math.log(P.a / P.c)) && near(e1.x[ix.r_price], Math.log(P.g / P.c)) &&
    near(e1.x[ix.mem_vs_ref], Math.log(P.c / P.g)) && e1.x[ix.acc_has] === 1 && near(e1.x[ix.acc_max], Math.log(P.b / P.c)),
    'the newest earlier corrected price of the region is the anchor; a later one, another region\'s, the application\'s own, a percent and a three-year-old one are not read');
  const e2 = PD.evidence(item(row('Краска масляная белая МА-15', 'кг')), { sug, mem: PD.index([row('Краска масляная белая МА-15', 'кг', { workspace: 'w0', asof: '2026-01-01', kind: 'untouched', source: '', smeta_price: 50, final_price: 50 })]) });
  ok(e2 && e2.by === 'acc' && near(e2.anchor, 50) && e2.x[ix.a_acc] === 1, 'with only an accepted smeta price of an earlier application, that is the anchor');
  // the resource's own smeta price is not an input
  const a = PD.evidence(item(row(beton, 'м3', { smeta_price: P.h, final_price: P.g })), { sug, mem });
  const b = PD.evidence(item(row(beton, 'м3', { smeta_price: P.h * 7, final_price: P.a, kind: 'checked' })), { sug, mem });
  ok(same(a.x, b.x) && a.anchor === b.anchor, 'the same resource gives the same evidence whatever its own smeta price and the expert\'s decision were');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/lib/ml/pricedata.js'), 'utf8');
  const body = src.slice(src.indexOf('function evidence('), src.indexOf('function build('));
  ok(!/smeta_price|final_price|\.ls\b/.test(body), 'evidence() names no smeta price and no expert price of the item');
  ok(a.x.every((v) => typeof v === 'number' && isFinite(v) && v >= -1.5 && v <= 1.5) && a.x.length === PD.NAMES.length, 'every evidence number is within ±1.5');
}

/* ------------------------------------------------------------------ the loss, by hand and by finite differences */
{
  const N = PD.NAMES.length, zero = () => PD.NAMES.map(() => 0);
  const x1 = zero(); x1[ix.bias] = 1;
  const price = { kind: 'price', la: 0, ly: -0.2, x: x1 }, floorLow = { kind: 'floor', la: 0, ly: -0.3, x: x1 }, floorHigh = { kind: 'floor', la: 0, ly: 0.4, x: x1 };
  const w0 = zero();
  ok(near(PM.loss(w0, [price], 0), 0.04) && near(PM.loss(w0, [floorLow], 0), 0) && near(PM.loss(w0, [floorHigh], 0), PM.FLOOR_WEIGHT * 0.16),
    'a corrected price costs its squared log error; a left price costs only when the prediction is below it');
  ok(near(PM.grad(w0, [price], 0)[ix.bias], 0.4) && near(PM.grad(w0, [floorLow], 0)[ix.bias], 0) && near(PM.grad(w0, [floorHigh], 0)[ix.bias], -2 * PM.FLOOR_WEIGHT * 0.4),
    'the gradient pulls toward a corrected price, is zero above a left price and pushes up below it');
  const w1 = zero(); w1[ix.bias] = 0.5;
  ok(near(PM.loss(w1, [], 0.1), 0.1 * 0.25) && near(PM.grad(w1, [], 0.1)[ix.bias], 0.1), 'the ridge penalty is ridge·w² and pulls the correction to zero');
  // finite differences on a random-looking mix
  const rand = S.ml.metrics.rng(9), items = [];
  for (let i = 0; i < 40; i++) items.push({ kind: i % 3 ? 'price' : 'floor', la: rand() * 2, ly: rand() * 2, x: PD.NAMES.map(() => rand() * 2 - 1) });
  const w = PD.NAMES.map(() => rand() - 0.5), g = PM.grad(w, items, 0.01);
  let worst = 0;
  for (let j = 0; j < N; j++) {
    const up = w.slice(), dn = w.slice(); up[j] += 1e-6; dn[j] -= 1e-6;
    worst = Math.max(worst, Math.abs((PM.loss(up, items, 0.01) - PM.loss(dn, items, 0.01)) / 2e-6 - g[j]));
  }
  ok(worst < 1e-5, 'the gradient equals finite differences of the loss on every weight (worst gap ' + worst.toExponential(1) + ')');

  // a problem a hand can solve: every price is the anchor × 0.8 → the bias goes to log 0.8 (a little less: the ridge)
  const mk = (kind, la, ly, split) => ({ a: split, kind, la, ly, ls: ly + 0.3, by: 'ref', x: x1, lref: la, lmem: null });
  const apps = [{ id: 'a', date: '2026-01-01', split: 'train' }, { id: 'b', date: '2026-02-01', split: 'train' }, { id: 'c', date: '2026-03-01', split: 'train' }, { id: 'd', date: '2026-04-01', split: 'test' }];
  const hand = { apps, items: [] };
  for (let i = 0; i < 30; i++) hand.items.push(mk('price', i / 10, i / 10 + Math.log(0.8), i % 4));
  const ft = PM.fit(hand, {});
  ok(near(ft.w[ix.bias], Math.log(0.8), 0.01) && ft.w.every((v, j) => j === ix.bias || v === 0) && ft.hasVal,
    'every price at 0.8 of its anchor: the fitted correction is log 0.8 (' + ft.w[ix.bias].toFixed(3) + '), nothing else moves');
  const floors = { apps, items: [] };
  for (let i = 0; i < 30; i++) floors.items.push(mk('floor', 1, 1 - 0.5, i % 4));
  ok(PM.fit(floors, {}).w.every((v) => v === 0), 'prices that were left below the anchor move nothing');
  const up = { apps, items: [] };
  for (let i = 0; i < 30; i++) up.items.push(mk('floor', 1, 1 + 0.5, i % 4));
  const fu = PM.fit(up, {});
  ok(fu.w[ix.bias] > 0.2 && fu.w[ix.bias] <= 0.5 + 1e-6, 'prices that were left above the anchor push the proposal up toward them, not past (' + fu.w[ix.bias].toFixed(3) + ')');
}

/* ------------------------------------------------------------------ the decision */
{
  const x = PD.NAMES.map(() => 0); x[ix.bias] = 1;
  const w = PD.NAMES.map(() => 0); w[ix.bias] = Math.log(0.9);
  const model = { schema: { hash: PD.HASH }, w, tau: 0.1, use: 'model' };
  const ev = { anchor: 1000, x, ref: 1200 };
  const d1 = PM.decide(model, ev, 1000), d2 = PM.decide(model, ev, 980), d3 = PM.decide(model, ev, 0);
  ok(near(d1.price, 900, 1e-6) && d1.flag === true && near(d1.over, 1000 / 900 - 1) && d2.flag === false && d3.flag === false && d3.over === null,
    'the proposal is the anchor with the correction; the smeta price is flagged only above it by more than the margin');
  ok(near(PM.decide(Object.assign({}, model, { use: 'anchor' }), ev, 1500).price, 1000) && near(PM.decide(Object.assign({}, model, { use: 'ref' }), ev, 1500).price, 1200) &&
    PM.decide(Object.assign({}, model, { use: 'ref' }), { anchor: 1000, x, ref: null }, 1500) === null, 'a model that selected a simpler way proposes by it');
  ok(PM.decide({ schema: { hash: 'p0-00000000' }, w, tau: 0.1, use: 'model' }, ev, 1000) === null && PM.decide(null, ev, 1000) === null && PM.decide(model, null, 1000) === null,
    'a model of another schema, no model or no evidence: no decision — the program stays as it is');
}

/* ------------------------------------------------------------------ the synthetic expert: the planted price is found */
{
  const w = W.priceWorld(S, { seed: 5 });
  const ds = PD.build(w.sug, w.rows, {});
  const exp = PM.experiments(ds, { n: 200, seed: 1 });
  const again = W.priceWorld(S, { seed: 5 });
  const exp2 = PM.experiments(PD.build(again.sug, again.rows, {}), { n: 200, seed: 1 });
  const text = PM.summary(ds, exp).map((r) => r.join(' = ')).join('\n');
  ok(text === PM.summary(PD.build(again.sug, again.rows, {}), exp2).map((r) => r.join(' = ')).join('\n') && same(exp.model.w, exp2.model.w), 'the same data give the same model and the same numbers');
  const kinds = { price: 0, floor: 0 }; ds.items.forEach((it) => { kinds[it.kind]++; });
  ok(ds.items.length + ds.skipped.struck + ds.skipped.pct + ds.skipped.nodate + ds.skipped.noevidence === w.rows.length && ds.skipped.struck === w.truth.struck &&
    kinds.price > 300 && kinds.floor > 600 && ds.apps.filter((a) => a.split === 'test').length === 6,
    'every finished row is an example or is left out for a stated reason (' + JSON.stringify(kinds) + ', no evidence ' + ds.skipped.noevidence + ')');
  ok(ds.items.every((it) => it.x.length === PD.NAMES.length && isFinite(it.ly) && isFinite(it.la)) && !/[А-Яа-я]/.test(JSON.stringify(ds)) && !/"name"|"unit"/.test(JSON.stringify(ds).replace('"names"', '')),
    'the price dataset carries logs and features — no name, no unit');
  const by = {}; exp.rows.forEach((r) => { by[r.name] = r; });
  const wm = exp.model.w, refShift = wm[ix.bias] + wm[ix.a_ref] + wm[ix.r_has] + wm[ix.r_document] + wm[ix.s_materials];
  ok(near(refShift, Math.log(W.REF_RATIO), 0.03), 'where the reference line is the only evidence, the fitted correction is the planted one: ' + Math.exp(refShift).toFixed(3) + ' of the line (planted ' + W.REF_RATIO + ')');
  ok(by.ref.test.recall < by.anchor.test.recall - 0.2 && by.ref.test.coverage < 0.8 && by.anchor.test.coverage > 0.95 && by.model.test.price_err < by.ref.test.price_err / 3,
    'the expert\'s own earlier prices find far more of what he lowered than the bare reference line (recall ' + by.ref.test.recall.toFixed(2) + ' → ' + by.anchor.test.recall.toFixed(2) +
    '), and the proposals are far closer to his price (' + by.ref.test.price_err.toFixed(3) + ' → ' + by.model.test.price_err.toFixed(3) + ')');
  ok(by.model.test.precision > 0.9 && by.model.test.recall > 0.9 && by.model.test.alarm < 0.05 && by.model.test.precision_ci && by.model.test.precision_ci[0] <= by.model.test.precision,
    'on applications it never saw the model flags what the expert lowered and little else (precision ' + by.model.test.precision.toFixed(2) + ', recall ' + by.model.test.recall.toFixed(2) + ', false alarms ' + by.model.test.alarm.toFixed(3) + ')');
  ok(exp.rows.filter((r) => r.selected).length === 1 && exp.model.use === exp.rows.find((r) => r.selected).name && PM.TAUS.indexOf(exp.model.tau) >= 0 &&
    exp.model.schema.hash === PD.HASH && exp.model.format === 'smeta-ml-model' && exp.model.kind === 'price-linear',
    'one way is selected — the simplest within a point of the best on the validation part (' + exp.model.use + '); the model names its schema');
  ok(!/[А-Яа-я]/.test(text) && PM.summary(ds, exp).every((r) => /^price\.[a-z0-9_.]+$/.test(r[0])) && /price\.model\.test\.precision = /.test(text),
    'the numbers to copy are keys and numbers only');
  // a single application: nothing to test on, and it says so
  const one = PD.build(w.sug, w.rows.filter((r) => r.workspace === w.rows[0].workspace), {});
  const e1 = PM.experiments(one, { n: 0 });
  ok(e1.rows.every((r) => r.test === null) && e1.hasVal === false && /none/.test(PM.summary(one, e1).find((r) => r[0] === 'price.validation')[1]),
    'with one application there is no test part and no validation part, and the numbers say so');
}

console.log(fail ? `\nml-price: ${fail} FAILED` : '\nml-price: all passed');
process.exit(fail ? 1 : 0);
