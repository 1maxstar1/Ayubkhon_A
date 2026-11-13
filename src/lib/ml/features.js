/*
 * Learning from the expert (docs/ai-reja.md, phase 3): what the ranker is told about one candidate line.
 *
 *   S.ml.features.NAMES                 the feature names, in order — the schema
 *   S.ml.features.HASH                  the hash of that schema: a model trained for another schema is not loaded
 *   S.ml.features.context(lines, shown) what the lines of one question have in common (computed once per question)
 *   S.ml.features.of(line, q, ctx)      → the numbers of one line, in NAMES order
 *   S.ml.features.neutral(x)            → the same numbers with the on-screen position replaced by a constant
 *
 *   line:  a candidate of the suggester's gather(q) — { rec, recs, price, how, sim, stage, tierRank, grade, flags, … }
 *   q:     the question { section, region, asof }
 *   shown: the lines in the order the program shows them today (choose(lines, q)); a summary line («медиана N строк»)
 *          stands for its components
 *
 * Three rules this file keeps:
 *   - the smeta price is never read: the question does not carry it, and nothing here is derived from it. What a line
 *     costs is compared only with the other lines of the same question;
 *   - nothing here decides whether a line may be shown at all — that is the gate (the retrieval rules), and it is
 *     not learned. A feature only describes a line the gate let through;
 *   - the position on screen is a feature for training only (people take the first line more often whatever it is):
 *     neutral() puts every line «in the first place» before a model is asked.
 * Every number is between −1.5 and 1.5, so that no model has to rescale them. Pure — no page, no server, no clock.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};

  var VERSION = 1;
  var NAMES = [
    // how sure the match is
    't_exact', 't_document', 't_estimate', 't_similar',
    'h_exact_key', 'h_family', 'h_relaxed', 'h_fuzzy', 'h_wage', 'h_tariff', 'h_tariff_other',
    'sim', 'sim_known', 'stage_2', 'stage_3', 'grade_relaxed', 'drops', 'states_more', 'derived', 'unit_converted',
    // where and when the price is from
    'same_region', 'national', 'other_region', 'age', 'stale', 'newest', 'age_rank',
    // what kind of price it is
    'f_forward', 'f_vat_inferred', 'f_delivered', 'f_plant_calc', 'f_declared', 'f_non_construction', 'f_excludes_pipe',
    'f_km_bands', 'f_older_quarter',
    'b_catalogue', 'b_exchange', 'b_list', 'b_recommended', 'b_offer', 'b_protocol', 'b_invoice', 'b_designer', 'b_wage',
    // the records behind the line
    'n_recs', 'spread', 'older_editions',
    // the line among the other lines of the question (their prices only)
    'price_vs_median', 'is_lowest', 'is_highest', 'in_best_class', 'n_lines', 'alone',
    // the question
    'q_labor', 'q_machines', 'q_transport', 'q_materials', 'q_equipment',
    // where it stood on screen (training only; see neutral)
    'pos', 'shown', 'in_summary'
  ];
  var IX = {};
  for (var i = 0; i < NAMES.length; i++) IX[NAMES[i]] = i;
  var POSITION = ['pos', 'shown', 'in_summary'];
  var DAY = 86400000;

  /** FNV-1a (32 bit) of a string, as 8 hex digits. */
  function fnv(s) {
    var h = 0x811c9dc5;
    for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 0x01000193); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  var HASH = 'f' + VERSION + '-' + fnv(VERSION + '|' + NAMES.join('|'));

  function has(a, x) { return !!a && a.indexOf(x) >= 0; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function median(xs) {
    var a = xs.slice().sort(function (p, q) { return p - q; }), n = a.length;
    if (!n) return 0;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function classKey(l) { return [l.tierRank, l.stage, l.grade >= 1000 ? 1000 : l.grade]; }
  function cmpKey(a, b) { for (var j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] - b[j]; return 0; }

  /**
   * What the lines of one question share. `shown`: the program's own order (may hold a summary line with
   * `medianLines`); a line not in it was not on screen.
   */
  function context(lines, shown) {
    var ps = [], dates = [], best = null, pos = new Map(), inSum = new Set();
    for (var a = 0; a < lines.length; a++) {
      var l = lines[a];
      if (l.price > 0) ps.push(l.price);
      dates.push(l.rec.price_date || '');
      var k = classKey(l);
      if (!best || cmpKey(k, best) < 0) best = k;
    }
    // a shown line may be a copy of its candidate (a flag added): the records behind it are the same array
    (shown || []).forEach(function (s, n) {
      if (s.isMedian && s.medianLines) s.medianLines.forEach(function (c) { pos.set(c.recs, n); inSum.add(c.recs); });
      else pos.set(s.recs, n);
    });
    var sorted = dates.slice().sort().reverse();                    // newest first
    return { n: lines.length, median: median(ps), min: ps.length ? Math.min.apply(null, ps) : 0,
      max: ps.length ? Math.max.apply(null, ps) : 0, newest: sorted[0] || '', dates: sorted, best: best, pos: pos, inSum: inSum };
  }

  function of(l, q, ctx) {
    var x = new Array(NAMES.length);
    for (var j = 0; j < x.length; j++) x[j] = 0;
    function set(name, v) { x[IX[name]] = v; }
    var r = l.rec || {}, fl = l.flags || [];

    var t = l.tierRank;
    set(t === 0 ? 't_exact' : t === 1 ? 't_document' : t === 1.5 ? 't_estimate' : 't_similar', 1);
    var how = { 'exact-key': 'h_exact_key', family: 'h_family', 'family-relaxed': 'h_relaxed', fuzzy: 'h_fuzzy', wage: 'h_wage',
      tariff: 'h_tariff', 'tariff-other-vehicle': 'h_tariff_other' }[l.how];
    if (how) set(how, 1);
    if (l.sim != null) { set('sim', clamp(+l.sim || 0, 0, 1)); set('sim_known', 1); }
    if (l.stage >= 2) set('stage_2', 1);
    if (l.stage >= 3) set('stage_3', 1);
    if (l.grade >= 100 && l.grade < 1000) set('grade_relaxed', clamp(Math.log(1 + l.grade - 100) / Math.log(20), 0, 1.5));
    set('drops', clamp(((l.drop && l.drop.length) || 0) / 5, 0, 1));
    if (l.statesMore) set('states_more', 1);
    if (l.derived) set('derived', 1);
    if (l.factor != null && l.factor !== 1) set('unit_converted', 1);

    var nat = r.region === 'national' || r.region === 'respublika';
    if (r.region && q.region && r.region === q.region) set('same_region', 1);
    if (nat) set('national', 1);
    if (has(fl, 'other-region')) set('other_region', 1);
    var age = (Date.parse(q.asof) - Date.parse(r.price_date)) / DAY;
    if (!(age >= 0)) age = 0;
    set('age', clamp(Math.log(1 + age) / Math.log(1 + 1095), 0, 1.5));
    if (has(fl, 'stale')) set('stale', 1);
    if (ctx && r.price_date && r.price_date === ctx.newest) set('newest', 1);
    if (ctx && ctx.n > 1) set('age_rank', ctx.dates.indexOf(r.price_date || '') / (ctx.n - 1));

    if (has(fl, 'forward')) set('f_forward', 1);
    if (has(fl, 'vat_inferred')) set('f_vat_inferred', 1);
    if (has(fl, 'delivered')) set('f_delivered', 1);
    if (has(fl, 'plant-calc')) set('f_plant_calc', 1);
    if (has(fl, 'declared')) set('f_declared', 1);
    if (has(fl, 'non-construction')) set('f_non_construction', 1);
    if (has(fl, 'excludes-pipe-cost')) set('f_excludes_pipe', 1);
    if (has(fl, 'km-bands')) set('f_km_bands', 1);
    if (has(fl, 'older-quarter')) set('f_older_quarter', 1);
    var basis = { catalogue: 'b_catalogue', 'exchange-spot': 'b_exchange', 'exchange-forward': 'b_exchange', list: 'b_list',
      recommended: 'b_recommended', offer: 'b_offer', protocol: 'b_protocol', invoice: 'b_invoice',
      'designer-memory': 'b_designer', 'wage-12%': 'b_wage' }[r.basis];
    if (basis) set(basis, 1);

    var nr = (l.recs && l.recs.length) || 1;
    set('n_recs', clamp(Math.log(nr) / Math.log(10), 0, 1.5));
    set('spread', clamp((l.spread || 1) - 1, 0, 1));
    set('older_editions', clamp((l.olderEditions || 0) / 5, 0, 1));

    if (ctx) {
      if (ctx.median > 0 && l.price > 0) set('price_vs_median', clamp(Math.log(l.price / ctx.median), -1, 1));
      if (ctx.n > 1 && l.price === ctx.min && ctx.min < ctx.max) set('is_lowest', 1);
      if (ctx.n > 1 && l.price === ctx.max && ctx.min < ctx.max) set('is_highest', 1);
      if (ctx.best && cmpKey(classKey(l), ctx.best) === 0) set('in_best_class', 1);
      set('n_lines', clamp(Math.log(1 + ctx.n) / Math.log(21), 0, 1.5));
      if (ctx.n === 1) set('alone', 1);
      if (ctx.pos.has(l.recs)) { set('pos', ctx.pos.get(l.recs) / 5); set('shown', 1); if (ctx.inSum.has(l.recs)) set('in_summary', 1); }
      else set('pos', 1.2);
    }
    var sec = { labor: 'q_labor', machines: 'q_machines', transport: 'q_transport', materials: 'q_materials', equipment: 'q_equipment' }[q.section];
    if (sec) set(sec, 1);
    return x;
  }

  /** The same line as if it stood first on screen, alone: what a model is asked with. */
  function neutral(x) {
    var y = x.slice();
    y[IX.pos] = 0; y[IX.shown] = 1; y[IX.in_summary] = 0;
    return y;
  }

  ML.features = { VERSION: VERSION, NAMES: NAMES, INDEX: IX, HASH: HASH, POSITION: POSITION, context: context, of: of,
    neutral: neutral, fnv: fnv };
})(S);
