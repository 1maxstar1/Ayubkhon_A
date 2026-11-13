/*
 * Learning from the expert (docs/ai-reja.md, phase 3): the dataset — every finished price asked again.
 *
 *   S.ml.dataset.build(sug, rows, opts) → the dataset
 *   S.ml.dataset.baseline(ds, opts)     → how today's rules (policy p3) do on it: row 1 of the experiments table
 *   S.ml.dataset.evaluate(ds, score, o) → any other order of the lines, measured the same way (the tier order kept)
 *   S.ml.dataset.summary(ds, opts)      → counts and metrics only: [[key, value]…] — nothing of a name or a price
 *   S.ml.dataset.text(summary)          → the same as lines «key = value», safe to send to the maintainer
 *   S.ml.dataset.source(s)              → a recorded price source, read: { type, pkg, rids, cut }
 *
 *   sug:   the suggester (S.refs.create(…) after init): gather(q) gives every candidate the gate let through,
 *          choose(lines, q) the order the program shows them in today
 *   rows:  price_memory records — one resource of one finished application: { workspace, contragent, region, name,
 *          unit, section, match_key, match_unit_key, smeta_price, final_price, kind, source, asof, finished, accepted }
 *   opts:  { package_id, gold: [{ name, unit, section, region, asof, price | rid | none }], progress(done, total) }
 *
 * One question = one resource of one finished application, asked as of that application's date. Its lines are
 * labelled by what the expert did (the owner's rules):
 *
 *   kind `ref`    the price was applied from the reference («Применить»): that line 1, the others 0. A summary line
 *                 («медиана N строк») applied: each of its components 0.5.
 *   kind `near`   the price was typed (or taken from another source): a line within NEAR of it is 0.5, the rest 0.
 *   kind `none`   the price was typed and no line is near it: «none is right» — a model learns to keep silent.
 *   kind `left`   the smeta price was left while a line was lower than it: nothing was taken. The lower lines are 0,
 *                 the others are not judged (−1): a line above the smeta price was not refused, it did not apply.
 *                 Weight 1 when the resource was marked «проверено», LEFT_UNMARKED when merely left.
 *   skipped       `above`  left, and every line is at or above the smeta price — nothing was refused (memory only);
 *                 `pct`    «Применить %» — a blanket discount is not a price looked up;
 *                 `zeroed` the resource was struck out;
 *                 `empty`  the reference has no line for it at all;
 *                 `lost`   applied from the reference, but that record is not among today's lines (another package).
 *
 * The smeta price decides only which questions are left out and which lines are not judged — it is never a feature
 * (S.ml.features does not see the row). The split is by application and by time: the newest fifth of the finished
 * applications is the test set and never trains anything; a hand-labelled gold set is kept apart the same way.
 * Pure — no page, no server, no clock (opts.now is written into the dataset as given).
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};
  var F = ML.features, M = ML.metrics;

  var FORMAT = 'smeta-ml-dataset', VERSION = 1;
  var NEAR = 0.02;              // a typed price this close to a line agrees with it
  var LEFT_UNMARKED = 0.5;      // the weight of a price merely left, against 1 for one marked «проверено»
  var TEST_SHARE = 0.2;
  var SHOWN = 6;                // the lines a model may show (the suggester's maxLines)

  function uniq(a) { var s = {}, o = []; for (var i = 0; i < a.length; i++) if (!s[a[i]]) { s[a[i]] = 1; o.push(a[i]); } return o; }
  function ridsOf(l) { return uniq((l.recs || [l.rec]).map(function (r) { return r.rid; })); }

  /** typed | ref:<package>:<rid> | ref:<package>:median:<rid>,<rid>…[…] | hint:… | uzex:… | mem:… | pct */
  function source(s) {
    s = String(s || '');
    var m = /^ref:([^:]+):(?:(\d+)|median:([\d,]+)(…)?)$/.exec(s);
    if (m) return { type: 'ref', pkg: m[1], rids: (m[2] ? [m[2]] : m[3].split(',')).filter(Boolean).map(Number), cut: !!m[4] };
    var t = /^(typed|hint|uzex|mem|pct)(?::|$)/.exec(s);
    return { type: t ? t[1] : 'typed', pkg: null, rids: [], cut: false };
  }

  /** 1: these records are exactly what was applied; 0.5: a part of an applied summary; else 0. */
  function refLabel(rids, want) {
    var inWant = 0;
    for (var i = 0; i < rids.length; i++) if (want.rids.indexOf(rids[i]) >= 0) inWant++;
    if (!inWant) return 0;
    if (inWant === want.rids.length && (rids.length === inWant || want.cut)) return 1;
    return inWant === rids.length ? 0.5 : 0;
  }
  function nearLabel(price, fin) { return fin > 0 && Math.abs(price - fin) <= NEAR * fin ? 0.5 : 0; }

  /**
   * One row asked again. → { skip: reason } or { q, kind, w, x, y, base } (x: one feature row per candidate).
   */
  function one(sug, row, o) {
    var kind = row.kind, fin = +row.final_price, sm = +row.smeta_price;
    var src = source(row.source);
    if (!row.gold) {
      if (kind === 'zeroed' || (kind === 'corrected' && !(fin > 0))) return { skip: 'zeroed' };
      if (kind === 'corrected' && src.type === 'pct') return { skip: 'pct' };
      if (kind !== 'corrected' && kind !== 'checked' && kind !== 'untouched') return { skip: 'zeroed' };
    }
    var q = S.refs.queryOf({ name: row.name, unit: row.unit, section: row.section },
      { region: row.region, asof: row.asof || row.finished });
    var lines;
    try { lines = sug.gather(q).lines; } catch (e) { lines = []; }
    if (!lines.length) return { skip: 'empty', corrected: kind === 'corrected' };
    var shown = sug.choose(lines, q);
    var label, out = { q: q, kind: null, w: 1 };

    if (row.gold && row.none) { out.kind = 'none'; label = function () { return 0; }; }
    else if (kind === 'corrected') {
      var byRef = src.type === 'ref' && src.pkg === o.package_id && src.rids.length;
      var refHit = byRef && (lines.some(function (l) { return refLabel(ridsOf(l), src) > 0; }) ||
        shown.some(function (l) { return refLabel(ridsOf(l), src) > 0; }));
      if (refHit) { out.kind = 'ref'; label = function (l) { return refLabel(ridsOf(l), src); }; }
      else {
        label = function (l) { return nearLabel(l.price, fin); };
        if (lines.some(function (l) { return label(l) > 0; })) { out.kind = 'near'; out.w = 0.5; }
        else if (src.type === 'ref') return { skip: 'lost' };
        else out.kind = 'none';
      }
    } else {
      var lim = sm * (1 - NEAR);
      if (!(sm > 0) || !lines.some(function (l) { return l.price < lim; })) return { skip: 'above' };
      out.kind = 'left'; out.w = kind === 'checked' ? 1 : LEFT_UNMARKED;
      label = function (l) { return l.price < lim ? 0 : -1; };
    }

    var ctx = F.context(lines, shown);
    out.x = lines.map(function (l) { return F.of(l, q, ctx); });
    out.y = lines.map(label);
    out.tiers = lines.map(function (l) { return l.tierRank; });
    // what stood on screen, top down: a summary line is followed by the documents folded inside it
    var ranked = [];
    shown.forEach(function (l) {
      ranked.push(l);
      if (l.isMedian && l.medianLines) l.medianLines.forEach(function (c) { ranked.push(c); });
    });
    out.base = {
      y: ranked.map(function (l) { var v = label(l); return v < 0 ? 0 : v; }),
      tier: shown[0].tierRank,
      // against the expert's own price only — never against a smeta price that was merely left
      rel: kind === 'corrected' && fin > 0 && shown[0].price > 0 ? Math.abs(shown[0].price - fin) / fin : null
    };
    return out;
  }

  /** The newest fifth of the applications (by the day they were finished) is the test set. */
  function split(apps) {
    var real = apps.filter(function (a) { return a.split !== 'gold'; })
      .sort(function (a, b) { return a.finished < b.finished ? -1 : a.finished > b.finished ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var nTest = real.length < 2 ? 0 : Math.max(1, Math.round(real.length * TEST_SHARE));
    real.forEach(function (a, i) { a.split = i >= real.length - nTest ? 'test' : 'train'; });
    return apps;
  }

  function build(sug, rows, opts) {
    var o = opts || {};
    var ds = { format: FORMAT, version: VERSION, schema: { hash: F.HASH, names: F.NAMES.slice() }, package_id: o.package_id || null,
      built: o.now || null, near: NEAR, rows: 0, apps: [], queries: [],
      skipped: { above: 0, pct: 0, zeroed: 0, empty: 0, empty_corrected: 0, lost: 0 } };
    var appIx = {};
    function appOf(row) {
      var id = row.gold ? 'gold' : String(row.workspace || '?');
      if (appIx[id] == null) {
        appIx[id] = ds.apps.length;
        ds.apps.push({ id: id, finished: String(row.finished || row.asof || '').slice(0, 10), region: row.region || '', split: row.gold ? 'gold' : null, n: 0 });
      }
      return appIx[id];
    }
    var all = (rows || []).concat((o.gold || []).map(function (g) {
      return { gold: true, none: !!g.none, workspace: 'gold', region: g.region, name: g.name, unit: g.unit, section: g.section,
        kind: 'corrected', final_price: +g.price || 0, smeta_price: 0, asof: g.asof, finished: g.asof,
        source: g.rid != null && g.rid !== '' ? 'ref:' + o.package_id + ':' + g.rid : 'typed' };
    }));
    for (var i = 0; i < all.length; i++) {
      var row = all[i];
      if (o.progress && i % 50 === 0) o.progress(i, all.length);
      if (!row || !row.name) continue;
      ds.rows++;
      var a = appOf(row), r = one(sug, row, o);
      if (r.skip) {
        ds.skipped[r.skip]++;
        if (r.skip === 'empty' && r.corrected) ds.skipped.empty_corrected++;
        continue;
      }
      ds.apps[a].n++;
      var key = row.match_key ? row.match_key + '|' + (row.match_unit_key || '') : (S.matchPair ? S.matchPair(row.name, row.unit) : row.name + '|' + row.unit);
      ds.queries.push({ a: a, kind: r.kind, w: r.w, acc: row.accepted ? 1 : 0, sec: r.q.section, k: F.fnv(String(key)), seen: 0,
        x: r.x, y: r.y, tiers: r.tiers, base: r.base });
    }
    if (o.progress) o.progress(all.length, all.length);
    split(ds.apps);
    // a name is «seen» when an application of the training part asked for it too
    var known = {};
    ds.queries.forEach(function (q) { if (ds.apps[q.a].split === 'train') known[q.k] = 1; });
    ds.queries.forEach(function (q) { q.seen = ds.apps[q.a].split !== 'train' && known[q.k] ? 1 : 0; });
    return ds;
  }

  /* ------------------------------------------------------------------ today's rules, measured */
  function isJudged(q) { return q.kind === 'ref' || q.kind === 'near' || q.kind === 'none'; }
  function asMetric(q, conf) {
    return { y: q.base.y, pos: q.kind === 'ref' || q.kind === 'near', none: q.kind === 'none' || q.kind === 'left', abstain: false,
      conf: conf ? conf(q) : null, rel: q.base.rel };
  }

  /**
   * Policy p3 on the dataset. It never abstains and states no confidence of its own: its confidence is how often the
   * first line of that tier was right in the training part (the test part when there is no other).
   */
  function baseline(ds, opts) {
    var o = opts || {};
    var part = function (name) { return ds.queries.filter(function (q) { return ds.apps[q.a].split === name; }); };
    var train = part('train'), test = part('test'), gold = part('gold');
    var from = train.some(isJudged) ? train : test;
    var hit = {}, n = {};
    from.filter(isJudged).forEach(function (q) {
      var t = String(q.base.tier);
      n[t] = (n[t] || 0) + 1;
      if (q.kind !== 'none' && q.base.y[0] > 0) hit[t] = (hit[t] || 0) + 1;
    });
    var conf = function (q) { var t = String(q.base.tier); return ((hit[t] || 0) + 1) / ((n[t] || 0) + 2); };
    var rep = function (qs) {
      var judged = qs.filter(isJudged).map(function (q) { return asMetric(q, conf); });
      var out = M.report(judged, { n: o.n, seed: o.seed });
      var left = qs.filter(function (q) { return q.kind === 'left'; });
      out.n_left = left.length;
      return out;
    };
    var tiers = {};
    Object.keys(n).forEach(function (t) { tiers[t] = { n: n[t], right: hit[t] || 0 }; });
    var rank = [0, 0, 0, 0, 0, 0, 0, 0];          // where the right line stood: 1…6, [7] — lower, [0] — not shown
    ds.queries.forEach(function (q) {
      if ((q.kind !== 'ref' && q.kind !== 'near') || ds.apps[q.a].split === 'gold') return;
      var r = 0;
      for (var i = 0; i < q.base.y.length && !r; i++) if (q.base.y[i] > 0) r = i + 1;
      rank[Math.min(r, 7)]++;
    });
    return { policy: 'p3', train: rep(train), test: rep(test), gold: gold.length ? rep(gold) : null,
      test_seen: rep(test.filter(function (q) { return q.seen; })), test_unseen: rep(test.filter(function (q) { return !q.seen; })),
      all: rep(train.concat(test)), tiers: tiers, rank: rank, conf_from: from === train ? 'train' : 'test' };
  }

  /**
   * Any other order, measured the same way: `score(x, q)` → a number per line (higher first). The tier order is kept
   * whatever the score says — a «Похожий» / «Оценка» line never stands above a «Документ» / «Ставка по таблице» one.
   * opts.abstain(best, q) → true: show nothing first; opts.conf(best, q) → 0…1; opts.split: 'test' (default) | 'train' | 'gold' | 'all'.
   */
  function evaluate(ds, score, opts) {
    var o = opts || {}, want = o.split || 'test';
    var qs = ds.queries.filter(function (q) { var sp = ds.apps[q.a].split; return want === 'all' ? sp !== 'gold' : sp === want; });
    var judged = qs.filter(isJudged).map(function (q) {
      var s = q.x.map(function (x) { return score(F.neutral(x), q); });
      var ix = q.x.map(function (_, i) { return i; }).sort(function (a, b) {
        return (q.tiers[a] >= 1.5 ? 1 : 0) - (q.tiers[b] >= 1.5 ? 1 : 0) || s[b] - s[a] || a - b;
      });
      var top = ix[0];
      return { y: ix.slice(0, SHOWN).map(function (i) { return q.y[i] < 0 ? 0 : q.y[i]; }), pos: q.kind === 'ref' || q.kind === 'near',
        none: q.kind === 'none', abstain: o.abstain ? !!o.abstain(s[top], q) : false, conf: o.conf ? o.conf(s[top], q) : null,
        rel: null };
    });
    return M.report(judged, { n: o.n, seed: o.seed });
  }

  /** For each feature: its mean over the lines the expert took and over the lines of the same questions he did not. */
  function lift(ds) {
    var n = F.NAMES.length, pos = new Array(n), neg = new Array(n), np = 0, nn = 0, i;
    for (i = 0; i < n; i++) { pos[i] = 0; neg[i] = 0; }
    ds.queries.forEach(function (q) {
      if (q.kind !== 'ref' && q.kind !== 'near') return;
      if (ds.apps[q.a].split !== 'train') return;                  // the test part trains nothing, not even an eye
      for (var l = 0; l < q.x.length; l++) {
        var to = q.y[l] > 0 ? pos : q.y[l] === 0 ? neg : null;
        if (!to) continue;
        if (to === pos) np++; else nn++;
        for (var j = 0; j < n; j++) to[j] += q.x[l][j];
      }
    });
    return { names: F.NAMES, taken: np, other: nn,
      pos: pos.map(function (v) { return np ? v / np : null; }), neg: neg.map(function (v) { return nn ? v / nn : null; }) };
  }

  function fmt(v) { return v == null ? '—' : typeof v === 'number' && Math.floor(v) !== v ? v.toFixed(3) : String(v); }
  function withCi(r, k) { return fmt(r[k]) + (r[k + '_ci'] ? ' [' + fmt(r[k + '_ci'][0]) + ' … ' + fmt(r[k + '_ci'][1]) + ']' : ''); }

  /** Counts and metrics only — [[key, value]…]; no name, no price, no document. */
  function summary(ds, opts) {
    var out = [], kinds = {}, secs = {}, splits = { train: 0, test: 0, gold: 0 }, acc = 0, sizes = [];
    var b = (opts && opts.baseline) || baseline(ds, opts);
    ds.queries.forEach(function (q) {
      var sp = ds.apps[q.a].split;
      kinds[q.kind + '.' + sp] = (kinds[q.kind + '.' + sp] || 0) + 1;
      kinds[q.kind] = (kinds[q.kind] || 0) + 1;
      secs[q.sec] = (secs[q.sec] || 0) + 1;
      if (q.acc) acc++;
      sizes.push(q.x.length);
    });
    ds.apps.forEach(function (a) { splits[a.split] = (splits[a.split] || 0) + 1; });
    out.push(['schema', ds.schema.hash]);
    out.push(['rows', ds.rows]);
    out.push(['applications', splits.train + splits.test]);
    out.push(['applications.train', splits.train]);
    out.push(['applications.test', splits.test]);
    out.push(['queries', ds.queries.length]);
    ['ref', 'near', 'none', 'left'].forEach(function (k) {
      out.push(['queries.' + k, kinds[k] || 0]);
      ['train', 'test', 'gold'].forEach(function (sp) { if (kinds[k + '.' + sp]) out.push(['queries.' + k + '.' + sp, kinds[k + '.' + sp]]); });
    });
    out.push(['queries.accepted_by_contractor', acc]);
    ['above', 'pct', 'zeroed', 'empty', 'empty_corrected', 'lost'].forEach(function (k) { out.push(['skipped.' + k, ds.skipped[k] || 0]); });
    ['labor', 'machines', 'transport', 'materials', 'equipment'].forEach(function (k) { out.push(['section.' + k, secs[k] || 0]); });
    out.push(['lines.median', fmt(M.median(sizes))]);
    out.push(['lines.max', sizes.length ? Math.max.apply(null, sizes) : 0]);
    ['test', 'train', 'all', 'test_seen', 'test_unseen', 'gold'].forEach(function (p) {
      var r = b[p];
      if (!r) return;
      var h = 'p3.' + p + '.';
      out.push([h + 'n_pos', r.n_pos]);
      out.push([h + 'n_none', r.n_none]);
      out.push([h + 'n_left', r.n_left]);
      out.push([h + 'p1', withCi(r, 'p1')]);
      out.push([h + 'r3', withCi(r, 'r3')]);
      out.push([h + 'mrr', withCi(r, 'mrr')]);
      out.push([h + 'abstention', withCi(r, 'abstention')]);
      out.push([h + 'ece', withCi(r, 'ece')]);
      out.push([h + 'price_err', withCi(r, 'price_err') + ' (n ' + r.n_price + ')']);
    });
    Object.keys(b.tiers).sort().forEach(function (t) { out.push(['p3.tier.' + t, b.tiers[t].right + ' / ' + b.tiers[t].n]); });
    out.push(['p3.conf_from', b.conf_from]);
    out.push(['p3.rank', b.rank.slice(1, 7).join(' ') + ' | lower ' + b.rank[7] + ' | not shown ' + b.rank[0]]);
    var li = lift(ds);
    out.push(['lift.lines', li.taken + ' taken / ' + li.other + ' other']);
    li.names.forEach(function (nm, i) {
      if (F.POSITION.indexOf(nm) < 0 && /^q_/.test(nm)) return;    // the same for every line of a question
      if (li.pos[i] || li.neg[i]) out.push(['lift.' + nm, fmt(li.pos[i]) + ' / ' + fmt(li.neg[i])]);
    });
    return out;
  }

  function text(sum) { return (sum || []).map(function (r) { return r[0] + ' = ' + r[1]; }).join('\n'); }

  ML.dataset = { FORMAT: FORMAT, VERSION: VERSION, NEAR: NEAR, LEFT_UNMARKED: LEFT_UNMARKED, TEST_SHARE: TEST_SHARE, SHOWN: SHOWN,
    source: source, refLabel: refLabel, one: one, split: split, build: build, baseline: baseline, evaluate: evaluate, lift: lift, summary: summary, text: text };
})(S);
