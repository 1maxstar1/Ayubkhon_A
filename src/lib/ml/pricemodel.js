/*
 * Learning from the expert, the price model (docs/ai-reja.md, «Модель цен»): from the evidence about a resource
 * to the expert's market price, and from that to «this smeta price is too high — proposed: X».
 *
 *   S.ml.pricemodel.train(ds, opts)        → model (JSON): { format, version, kind, schema, w, tau, … }
 *   S.ml.pricemodel.predict(model, x, la)  → log of the proposed price
 *   S.ml.pricemodel.decide(model, ev, smetaPrice) → { price, flag, over } — flag: the smeta price is above the
 *                                             proposal by more than the model's margin
 *   S.ml.pricemodel.measure(ds, f, tau, split) → how a predictor does on a part of the dataset
 *   S.ml.pricemodel.experiments(ds, opts)  → { rows: [{ name, what, tau, test, selected }], model }
 *   S.ml.pricemodel.summary(ds, exp)       → [[key, value]…] — counts and metrics only
 *   S.ml.pricemodel.loss / grad            for the tests (a gradient check)
 *
 * The model is linear on purpose: pred = la + w·x, the log of the anchor plus a learned correction. With a few
 * thousand examples and thirty features, anything larger would learn the examples by heart. It is fitted on
 *   - a corrected price: the squared error of the log price (the expert's price is the answer);
 *   - a price that was left: one-sided — only a prediction BELOW the smeta price costs (the market price is at least
 *     that; how much more, nobody said), at FLOOR_WEIGHT;
 *   - a ridge penalty that pulls the correction to zero: with no evidence to the contrary, the anchor stands.
 * Plain gradient descent from zero, a fixed number of steps chosen by the validation part (the newest fifth of the
 * training applications) — no randomness anywhere, so the same data give the same model.
 *
 * The margin `tau` (flag when smeta > proposal × (1 + tau)) is chosen on the validation part: the one with the best
 * F0.5 — being right when it speaks counts twice as much as speaking often. The test part chooses nothing.
 * Pure — no page, no server, no clock.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};
  var M = ML.metrics, PD = ML.pricedata;

  var FLOOR_WEIGHT = 0.3, RIDGE = 0.01, LR = 0.1, STEPS = 3000, CHECK = 50;
  var TAUS = [0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
  var LOWERED = 0.005;          // a corrected price this much below the smeta price is «lowered»

  function dot(w, x) { var s = 0; for (var i = 0; i < w.length; i++) s += w[i] * x[i]; return s; }

  /** The mean loss of w on the items, and its gradient. */
  function lossGrad(w, items, ridge) {
    var g = new Array(w.length), L = 0, n = items.length || 1, i, j;
    for (j = 0; j < g.length; j++) g[j] = 0;
    for (i = 0; i < items.length; i++) {
      var it = items[i], e = it.la + dot(w, it.x) - it.ly, k = 0;
      if (it.kind === 'price') { L += e * e; k = 2 * e; }
      else if (e < 0) { L += FLOOR_WEIGHT * e * e; k = 2 * FLOOR_WEIGHT * e; }
      if (k) for (j = 0; j < g.length; j++) g[j] += k * it.x[j];
    }
    L /= n;
    for (j = 0; j < g.length; j++) { g[j] = g[j] / n + 2 * ridge * w[j]; L += ridge * w[j] * w[j]; }
    return { loss: L, grad: g };
  }
  function loss(w, items, ridge) { return lossGrad(w, items, ridge == null ? RIDGE : ridge).loss; }
  function grad(w, items, ridge) { return lossGrad(w, items, ridge == null ? RIDGE : ridge).grad; }

  function part(ds, name) { return ds.items.filter(function (it) { return ds.apps[it.a].split === name; }); }

  /** Train on the training applications: the oldest four fifths fit, the newest fifth of them stops and picks tau. */
  function fit(ds, opts) {
    var o = opts || {};
    var apps = ds.apps.map(function (a, i) { return { i: i, date: a.date, id: a.id, split: a.split }; })
      .filter(function (a) { return a.split === 'train'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1; });
    var nVal = apps.length < 3 ? 0 : Math.max(1, Math.round(apps.length * 0.2));
    var valSet = {};
    apps.slice(apps.length - nVal).forEach(function (a) { valSet[a.i] = 1; });
    var all = part(ds, 'train');
    var tr = all.filter(function (it) { return !valSet[it.a]; }), va = all.filter(function (it) { return valSet[it.a]; });
    var n = PD.NAMES.length, w = new Array(n), best = null, bestL = Infinity, bestStep = 0, ridge = o.ridge == null ? RIDGE : o.ridge;
    for (var j = 0; j < n; j++) w[j] = 0;
    var steps = o.steps || STEPS;
    for (var s = 0; s <= steps; s++) {
      if (s % CHECK === 0) {
        var lv = va.length ? lossGrad(w, va, 0).loss : lossGrad(w, tr, ridge).loss;
        if (lv < bestL - 1e-9) { bestL = lv; best = w.slice(); bestStep = s; }
        else if (va.length && s - bestStep >= 6 * CHECK) break;      // the validation part stopped improving
      }
      if (!tr.length) break;
      var g = lossGrad(w, tr, ridge).grad;
      for (j = 0; j < n; j++) w[j] -= LR * g[j];
    }
    return { w: best || w, steps: bestStep, fit: tr, val: va.length ? va : tr, hasVal: va.length > 0 };
  }

  function predict(model, x, la) { return la + dot(model.w, x); }

  /* ------------------------------------------------------------------ measuring a predictor */
  /**
   * f(item) → the log of the proposed price, or null (no proposal). Over the items of `list` that carry a smeta
   * price: of those flagged, how many the expert did lower (precision); of those he lowered, how many were flagged
   * (recall); how far the proposal is from his price where he set one; how many accepted prices are flagged.
   */
  function measureItems(list, f, tau) {
    var lt = Math.log(1 + tau), rows = [];
    list.forEach(function (it) {
      if (it.ls == null) return;
      var p = f(it);
      var lowered = it.kind === 'price' && it.ly < it.ls - LOWERED;
      rows.push({ has: p != null, flag: p != null && it.ls > p + lt, lowered: lowered, floor: it.kind === 'floor',
        err: p != null && it.kind === 'price' ? Math.abs(Math.exp(p - it.ly) - 1) : null });
    });
    var stat = function (rs) {
      var flagged = 0, hit = 0, low = 0, floors = 0, alarm = 0, covered = 0, errs = [];
      rs.forEach(function (r) {
        if (r.flag) flagged++;
        if (r.lowered) { low++; if (r.flag) hit++; if (r.has) covered++; }
        if (r.floor) { floors++; if (r.flag) alarm++; }
        if (r.err != null && r.lowered) errs.push(r.err);
      });
      var prec = flagged ? hit / flagged : null, rec = low ? hit / low : null;
      return { n: rs.length, lowered: low, flagged: flagged, precision: prec, recall: rec,
        f05: prec != null && rec != null && prec + rec > 0 ? 1.25 * prec * rec / (0.25 * prec + rec) : null,
        alarm: floors ? alarm / floors : null, coverage: low ? covered / low : null, price_err: M.median(errs), n_err: errs.length };
    };
    return { rows: rows, stat: stat };
  }
  function measure(ds, f, tau, split, opts) {
    var o = opts || {}, m = measureItems(typeof split === 'string' ? part(ds, split) : split, f, tau), out = m.stat(m.rows);
    if (o.n !== 0) {
      ['precision', 'recall', 'price_err', 'alarm'].forEach(function (k) {
        out[k + '_ci'] = M.bootstrap(m.rows, function (rs) { return m.stat(rs)[k]; }, { n: o.n || 300, seed: o.seed });
      });
    }
    return out;
  }
  /** The margin with the best F0.5 on the list (ties: the larger margin — the more careful one). */
  function pickTau(list, f) {
    var best = TAUS[TAUS.length - 1], bestF = -1;
    TAUS.forEach(function (t) {
      var m = measureItems(list, f, t), s = m.stat(m.rows);
      if (s.f05 != null && s.f05 >= bestF) { bestF = s.f05; best = t; }
    });
    return best;
  }

  /* ------------------------------------------------------------------ the experiments table */
  /**
   * Three ways to propose a price, measured on the same test part:
   *   ref    — the first reference line, as it is (what «справ.» shows today);
   *   anchor — the newest own price of the resource, else the reference line, else the highest accepted price;
   *   model  — the anchor with the learned correction.
   * Each picks its margin on the validation part. Selected: the best precision on the test part's stand-in — the
   * validation part — and of those within one point of it, the simplest (ref, then anchor, then model).
   */
  function experiments(ds, opts) {
    var o = opts || {};
    var ft = fit(ds, o);
    var model = { format: 'smeta-ml-model', version: 1, kind: 'price-linear', schema: { hash: PD.HASH, names: PD.NAMES.slice() }, w: ft.w, tau: null,
      steps: ft.steps, trained: o.now || null, floor_weight: FLOOR_WEIGHT, ridge: o.ridge == null ? RIDGE : o.ridge };
    var ways = [
      { name: 'ref', what: 'the first reference line', f: function (it) { return it.lref; } },
      { name: 'anchor', what: 'own newest price, else the reference line, else the highest accepted price', f: function (it) { return it.la; } },
      { name: 'model', what: 'the anchor with the learned correction', f: function (it) { return it.la + dot(ft.w, it.x); } }
    ];
    var test = part(ds, 'test');
    var rows = ways.map(function (wy) {
      var tau = pickTau(ft.val, wy.f);
      var v = measureItems(ft.val, wy.f, tau);
      // the same on the test part, apart for each kind of anchor: is a proposal that rests on an accepted price as good?
      var by = {};
      ['mem', 'ref', 'acc'].forEach(function (b) {
        var part = test.filter(function (it) { return it.by === b; });
        if (part.length) by[b] = measure(ds, wy.f, tau, part, { n: 0 });
      });
      return { name: wy.name, what: wy.what, tau: tau, val: v.stat(v.rows), test: test.length ? measure(ds, wy.f, tau, test, o) : null, by: by, selected: false };
    });
    var bestP = Math.max.apply(null, rows.map(function (r) { return r.val.f05 == null ? -1 : r.val.f05; }));
    var pick = rows.filter(function (r) { return r.val.f05 != null && r.val.f05 >= bestP - 0.01; })[0] || rows[0];
    pick.selected = true;
    model.tau = rows[2].tau;
    model.use = pick.name;
    model.n = { applications: ds.apps.filter(function (a) { return a.split === 'train'; }).length, fit: ft.fit.length, val: ft.hasVal ? ft.val.length : 0 };
    return { rows: rows, model: model, hasVal: ft.hasVal };
  }
  function train(ds, opts) { return experiments(ds, opts).model; }

  /** For one resource of a new smeta: the proposal, and whether its smeta price is too high. */
  function decide(model, ev, smetaPrice) {
    if (!model || !ev || !model.schema || model.schema.hash !== PD.HASH) return null;
    var la = Math.log(ev.anchor);
    var lp = model.use === 'ref' ? (ev.ref ? Math.log(ev.ref) : null) : model.use === 'anchor' ? la : la + dot(model.w, ev.x);
    if (lp == null || !isFinite(lp)) return null;
    var price = Math.exp(lp), over = smetaPrice > 0 ? smetaPrice / price - 1 : null;
    return { price: price, over: over, flag: over != null && over > model.tau };
  }

  function fmt(v) { return v == null ? '—' : typeof v === 'number' && Math.floor(v) !== v ? v.toFixed(3) : String(v); }
  function ci(r, k) { return fmt(r[k]) + (r[k + '_ci'] ? ' [' + fmt(r[k + '_ci'][0]) + ' … ' + fmt(r[k + '_ci'][1]) + ']' : ''); }

  /** Counts and metrics only — no name, no price. */
  function summary(ds, exp) {
    var out = [], c = { price: 0, floor: 0 }, by = { mem: 0, ref: 0, acc: 0 }, sp = { train: 0, test: 0 };
    ds.items.forEach(function (it) { c[it.kind]++; by[it.by]++; });
    ds.apps.forEach(function (a) { sp[a.split] = (sp[a.split] || 0) + 1; });
    out.push(['price.schema', ds.schema.hash]);
    out.push(['price.rows', ds.rows]);
    out.push(['price.applications', (sp.train || 0) + (sp.test || 0)]);
    out.push(['price.applications.test', sp.test || 0]);
    out.push(['price.items', ds.items.length]);
    out.push(['price.items.corrected', c.price]);
    out.push(['price.items.accepted', c.floor]);
    out.push(['price.anchor.memory', by.mem]);
    out.push(['price.anchor.reference', by.ref]);
    out.push(['price.anchor.accepted', by.acc]);
    ['struck', 'pct', 'nodate', 'noevidence', 'noevidence_price', 'noevidence_price_other_region'].forEach(function (k) { out.push(['price.skipped.' + k, ds.skipped[k] || 0]); });
    if (!exp) return out;
    out.push(['price.validation', exp.hasVal ? 'own' : 'none — measured on what it was fitted on']);
    exp.rows.forEach(function (r) {
      var h = 'price.' + r.name + '.';
      out.push([h + 'tau', r.tau]);
      out.push([h + 'selected', r.selected ? 1 : 0]);
      if (!r.test) return;
      out.push([h + 'test.n', r.test.n]);
      out.push([h + 'test.lowered', r.test.lowered]);
      out.push([h + 'test.flagged', r.test.flagged]);
      out.push([h + 'test.precision', ci(r.test, 'precision')]);
      out.push([h + 'test.recall', ci(r.test, 'recall')]);
      out.push([h + 'test.alarm', ci(r.test, 'alarm')]);
      out.push([h + 'test.coverage', fmt(r.test.coverage)]);
      out.push([h + 'test.price_err', ci(r.test, 'price_err') + ' (n ' + r.test.n_err + ')']);
      if (r.name !== 'ref') Object.keys(r.by).forEach(function (b) {
        var t = r.by[b];
        out.push([h + 'by_' + b, 'n ' + t.n + ' · lowered ' + t.lowered + ' · flagged ' + t.flagged + ' · precision ' + fmt(t.precision) + ' · recall ' + fmt(t.recall) + ' · err ' + fmt(t.price_err)]);
      });
    });
    exp.model.w.forEach(function (v, i) { if (Math.abs(v) >= 0.0005) out.push(['price.w.' + PD.NAMES[i], v.toFixed(3)]); });
    out.push(['price.model.steps', exp.model.steps]);
    return out;
  }

  ML.pricemodel = { FLOOR_WEIGHT: FLOOR_WEIGHT, RIDGE: RIDGE, TAUS: TAUS, loss: loss, grad: grad, fit: fit, predict: predict, measure: measure,
    pickTau: pickTau, experiments: experiments, train: train, decide: decide, summary: summary };
})(S);
