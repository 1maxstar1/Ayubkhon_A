/*
 * Learning from the expert (docs/ai-reja.md, phase 3): how good an order of suggestions is — the same numbers for
 * today's rules and for every model, on the same questions.
 *
 *   One answered question:
 *     { y: [label…],      the labels of the lines in the order they were shown, best first (the first 6 — what fits
 *                         on screen); a label > 0 is a line the expert took (1) or agreed with (0.5)
 *       pos: bool,        the question has a right line at all (among every candidate, shown or not)
 *       none: bool,       «none is right»: the expert set a price no line has
 *       abstain: bool,    the policy chose to show nothing as its first line
 *       conf: 0…1|null,   how sure the policy says it is of its first line
 *       rel: number|null  |first line − the expert's price| / the expert's price }
 *
 *   S.ml.metrics.precisionAt1(qs)   of the questions with a right line: the first line is one             (0…1 | null)
 *   S.ml.metrics.recallAt(qs, k)    … a right line is among the first k
 *   S.ml.metrics.mrr(qs)            … the mean of 1 / (the place of the first right line); 0 when not shown
 *   S.ml.metrics.abstention(qs)     of the «none is right» questions: the policy abstained
 *   S.ml.metrics.answered(qs)       of the questions with a right line: the policy did not abstain
 *   S.ml.metrics.ece(qs, bins)      expected calibration error of `conf` over the answered questions (right line or none)
 *   S.ml.metrics.medianRelErr(qs)   the median of `rel`
 *   S.ml.metrics.bootstrap(qs, fn, { n, seed })  → [lo, hi]: the 95 % interval of fn over resampled questions
 *   S.ml.metrics.report(qs, { n, seed })         → every number above with its interval and the counts
 *   S.ml.metrics.rng(seed)          the seeded generator everything random in S.ml uses (mulberry32): () → [0, 1)
 *
 * A metric over nothing is null, never 0 — «no such questions» is not «all wrong». An abstaining policy has no first
 * line: for a question with a right line that is a miss. Pure — no page, no server, no clock.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};

  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isPos(q) { return !!q.pos && !q.none; }
  function firstRight(q) {
    if (q.abstain) return 0;
    for (var i = 0; i < q.y.length; i++) if (q.y[i] > 0) return i + 1;
    return 0;
  }
  function mean(qs, pick, f) {
    var n = 0, s = 0;
    for (var i = 0; i < qs.length; i++) if (pick(qs[i])) { n++; s += f(qs[i]); }
    return n ? s / n : null;
  }
  function median(xs) {
    var a = xs.slice().sort(function (p, q) { return p - q; }), n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  function precisionAt1(qs) { return mean(qs, isPos, function (q) { return firstRight(q) === 1 ? 1 : 0; }); }
  function recallAt(qs, k) { return mean(qs, isPos, function (q) { var r = firstRight(q); return r && r <= k ? 1 : 0; }); }
  function mrr(qs) { return mean(qs, isPos, function (q) { var r = firstRight(q); return r ? 1 / r : 0; }); }
  function abstention(qs) { return mean(qs, function (q) { return !!q.none; }, function (q) { return q.abstain ? 1 : 0; }); }
  function answered(qs) { return mean(qs, isPos, function (q) { return q.abstain ? 0 : 1; }); }

  /** Over the answered questions that have a verdict (a right line exists, or none is right): |accuracy − confidence|. */
  function ece(qs, bins) {
    var B = bins || 10, n = [], hit = [], conf = [], total = 0, i;
    for (i = 0; i < B; i++) { n.push(0); hit.push(0); conf.push(0); }
    for (i = 0; i < qs.length; i++) {
      var q = qs[i];
      if (q.abstain || q.conf == null || !(isPos(q) || q.none)) continue;
      var c = Math.min(1, Math.max(0, q.conf));
      var b = Math.min(B - 1, Math.floor(c * B));
      n[b]++; conf[b] += c; if (!q.none && firstRight(q) === 1) hit[b]++;
      total++;
    }
    if (!total) return null;
    var e = 0;
    for (i = 0; i < B; i++) if (n[i]) e += n[i] / total * Math.abs(hit[i] / n[i] - conf[i] / n[i]);
    return e;
  }

  function medianRelErr(qs) {
    var xs = [];
    for (var i = 0; i < qs.length; i++) if (qs[i].rel != null && !qs[i].abstain && isFinite(qs[i].rel)) xs.push(qs[i].rel);
    return median(xs);
  }

  /** The 2.5th and 97.5th percentile of fn over `n` resamples of the questions (with replacement), or null. */
  function bootstrap(qs, fn, opts) {
    var o = opts || {}, n = o.n || 1000, rand = rng(o.seed == null ? 20261113 : o.seed);
    if (!qs.length || fn(qs) == null) return null;
    var vals = [];
    for (var b = 0; b < n; b++) {
      var s = new Array(qs.length);
      for (var i = 0; i < qs.length; i++) s[i] = qs[Math.floor(rand() * qs.length)];
      var v = fn(s);
      if (v != null) vals.push(v);
    }
    if (!vals.length) return null;
    vals.sort(function (a, b) { return a - b; });
    var at = function (p) { return vals[Math.min(vals.length - 1, Math.max(0, Math.floor(p * (vals.length - 1) + 0.5)))]; };
    return [at(0.025), at(0.975)];
  }

  function count(qs, f) { var n = 0; for (var i = 0; i < qs.length; i++) if (f(qs[i])) n++; return n; }

  /** Every number with its interval. `opts.n`: resamples (0 — no intervals). */
  function report(qs, opts) {
    var o = opts || {};
    var defs = {
      p1: precisionAt1, r3: function (x) { return recallAt(x, 3); }, mrr: mrr, abstention: abstention, answered: answered,
      ece: function (x) { return ece(x, o.bins); }, price_err: medianRelErr
    };
    var out = { n: qs.length, n_pos: count(qs, isPos), n_none: count(qs, function (q) { return !!q.none; }),
      n_price: count(qs, function (q) { return q.rel != null && !q.abstain; }) };
    Object.keys(defs).forEach(function (k) {
      out[k] = defs[k](qs);
      out[k + '_ci'] = o.n === 0 ? null : bootstrap(qs, defs[k], { n: o.n, seed: o.seed });
    });
    return out;
  }

  ML.metrics = { rng: rng, precisionAt1: precisionAt1, recallAt: recallAt, mrr: mrr, abstention: abstention, answered: answered,
    ece: ece, medianRelErr: medianRelErr, bootstrap: bootstrap, report: report, median: median };
})(S);
