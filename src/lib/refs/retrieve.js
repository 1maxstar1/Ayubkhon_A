/*
 * Reference prices: candidate retrieval over the derived pool.
 *
 *   var h = S.refs.open(recs, { families: S.refs.families });   // builds the indexes (~2 s for the whole country)
 *   var list = h.candidates(q, opts);
 *
 * q = { name, unit, section, asof, exclude_src } (S.refs.queryOf). Each result is
 *   { rid, rec, how, sim, numRel, unitFactor, price_q, drop[, level] }
 * how:
 *   'exact-key'       S.matchKey of the name equal (name or name_raw of the record), unit convertible
 *   'family'          the family parsers give both names the same exact key
 *   'family-relaxed'  equal at a relaxed level; `drop` lists what was dropped on either side
 *   'fuzzy'           S.similarity ≥ opts.fuzzyMin with the pool idf; blocked by a token / prefix inverted index of
 *                     words, word stems and numbers (rarest first, ranked by a cosine over those terms); number
 *                     conflicts rejected
 * A record is listed once, under the first stage that finds it (exact, family, relaxed, fuzzy). Within a stage: best
 * first (sim, family level), then newest price_date, then lowest rid.
 *
 * Every stage applies the same gates, before any similarity is computed:
 *   * src not in q.exclude_src;
 *   * price_date set and ≤ q.asof, and the availability date (rec.avail, from the package) ≤ q.asof;
 *   * section agreement: machines only with machines, labour with labour, transport with transport; materials and
 *     equipment may meet;
 *   * unit: units.factor(record unit → q.unit, record item data) is not null. price_q = price × that factor. A query
 *     without a unit gets no candidates.
 *
 * opts: { stages: ['exact','family','fuzzy'], fuzzyMin: 0.5, fuzzyN: 10 (distinct texts kept by the fuzzy stage),
 *         compare: 150 (distinct texts scored per query), budget: 40k (postings read; the 2 rarest terms always),
 *         unseen: 'max'|'one' (idf of a query word no pool text has) }
 * Every comparator and tie-break here is part of the measured behaviour (test/refs-parity.cjs).
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var R = S.refs = S.refs || {};

  var BAND = { materials: 'mat', equipment: 'mat', machines: 'machines', labor: 'labor', transport: 'transport' };
  function sectionOK(qs, rs) {
    if (!qs) return true;
    var a = BAND[qs] || qs, b = BAND[rs] || rs;
    return a === b;
  }

  var SEP = '␟';
  function nameKeyOfPair(mp) { var i = mp.indexOf(SEP); return i < 0 ? mp : mp.slice(0, i); }

  /*
   * Blocking terms of a name: its words (S.tokens), their stems, and its numbers (S.numbers). The stem strips one
   * Russian inflection from a transliterated word, so «ТРУБЫ СТАЛЬНЫЕ» meets «Труба стальная»; numbers make
   * «57х3,5мм» meet «57Х3,5 ММ». Terms only block (decide which records are compared); the score is S.similarity.
   */
  var ENDINGS = ['IYAMI', 'YAMI', 'AMI', 'OGO', 'EGO', 'OMU', 'EMU', 'IMI', 'UYU', 'YUYU', 'AYA', 'YAYA', 'IYA',
    'IYU', 'IEM', 'OE', 'EE', 'IE', 'IH', 'IM', 'OY', 'EY', 'IY', 'AH', 'YAH', 'AM', 'YAM', 'OV', 'EV', 'II', 'YA', 'YU',
    'A', 'I', 'E', 'O', 'U', 'Y'];
  function stemOf(t) {
    if (t.length < 5 || !/^[A-Z]+$/.test(t)) return null;
    for (var i = 0; i < ENDINGS.length; i++) {
      var e = ENDINGS[i];
      if (t.length - e.length >= 4 && t.slice(t.length - e.length) === e) return t.slice(0, t.length - e.length);
    }
    return t;
  }
  function uniqStrings(a) {
    var seen = new Set(), out = [];
    for (var i = 0; i < a.length; i++) if (!seen.has(a[i])) { seen.add(a[i]); out.push(a[i]); }
    return out;
  }
  function termsOf(name) {
    var out = [];
    var toks = S.tokens(name);
    for (var i = 0; i < toks.length; i++) {
      out.push(toks[i]);
      var st = stemOf(toks[i]);
      if (st) out.push('~' + st);
    }
    var nums = S.numbers(name);
    for (var j = 0; j < nums.length; j++) out.push('#' + nums[j]);
    return uniqStrings(out);
  }

  /** Everything levels 1..k of a parsed name dropped. */
  function dropsUpTo(p, k) {
    var out = [];
    for (var j = 0; j < k && p.levels && j < p.levels.length; j++) {
      var d = p.levels[j].drop || [];
      for (var i = 0; i < d.length; i++) out.push(d[i]);
    }
    return out;
  }

  function push(map, k, v) { var a = map.get(k); if (a) a.push(v); else map.set(k, [v]); }
  function append(out, part) { for (var i = 0; i < part.length; i++) out.push(part[i]); }

  function open(recs, opts) {
    var o = opts || {};
    var t0 = Date.now();
    var U = R.units;
    var n = recs.length;
    var avail = new Array(n);
    for (var i0 = 0; i0 < n; i0++) avail[i0] = recs[i0].avail || null;

    // ---- indexes
    // Fuzzy retrieval works on distinct texts (r.fz): the exchange repeats one item in many weekly bulletins and the
    // catalogue in several months; each text is scored once and brings all its records.
    var byName = new Map();          // matchKey(name) -> [i]
    var famIdx = new Map();          // family#key -> [[i, lvl]]
    var textId = new Map();          // fz -> tid
    var texts = [], textRecs = [];
    for (var i = 0; i < n; i++) {
      var r = recs[i];
      var k1 = nameKeyOfPair(r.mp);
      if (k1) push(byName, k1, i);
      if (r.mp_raw) { var k2 = nameKeyOfPair(r.mp_raw); if (k2 && k2 !== k1) push(byName, k2, i); }
      if (r.fam && r.fam.key) {
        push(famIdx, r.fam.family + '#' + r.fam.key, [i, 0]);
        var lv = r.fam.levels || [];
        for (var k = 0; k < lv.length; k++) push(famIdx, r.fam.family + '#' + lv[k].key, [i, k + 1]);
      }
      var tid0 = textId.get(r.fz);
      if (tid0 === undefined) { tid0 = texts.length; texts.push(r.fz); textRecs.push([]); textId.set(r.fz, tid0); }
      textRecs[tid0].push(i);
    }
    var nT = texts.length;
    var termIdx = new Map();         // blocking term -> [tid]
    var tokDf = new Map();           // S.tokens word -> number of distinct texts with it (the idf of S.similarity)
    var termsByText = new Array(nT);
    for (var tid = 0; tid < nT; tid++) {
      var terms = termsOf(texts[tid]);
      termsByText[tid] = terms;
      for (var ti = 0; ti < terms.length; ti++) {
        var t = terms[ti];
        push(termIdx, t, tid);
        if (t.charAt(0) !== '~' && t.charAt(0) !== '#') tokDf.set(t, (tokDf.get(t) || 0) + 1);
      }
    }
    // idf as S.idfOf computes it, log(1 + N / df), over the distinct fuzzy texts of the pool
    var idf = Object.create(null);
    tokDf.forEach(function (df, w) { idf[w] = Math.log(1 + nT / df); });
    var idfMax = Math.log(1 + nT);
    var termW = new Map();
    termIdx.forEach(function (a, w) { termW.set(w, Math.log(1 + nT / a.length)); });
    // the length of each text's term vector, for a cosine over blocking terms
    var textNorm = new Float64Array(nT);
    for (var tid2 = 0; tid2 < nT; tid2++) {
      var s2 = 0, tt = termsByText[tid2];
      for (var q2 = 0; q2 < tt.length; q2++) { var w0 = termW.get(tt[q2]); s2 += w0 * w0; }
      textNorm[tid2] = Math.sqrt(s2) || 1;
      termsByText[tid2] = null;
    }

    var families = o.families || R.families || [];
    var famById = new Map();
    for (var fi = 0; fi < families.length; fi++) famById.set(families[fi].id, families[fi].mod);
    var tIndex = Date.now();

    // scratch for the fuzzy accumulator
    var acc = new Float64Array(nT);

    var facCache = new Map();
    function factorOf(r, qUnit) {
      if (r.ua) return U.factor(r.unit, qUnit, r.ua);
      var key = r.unit + '→' + qUnit;
      var f = facCache.get(key);
      if (f === undefined) { f = U.factor(r.unit, qUnit, null); facCache.set(key, f); }
      return f;
    }

    function candidates(q, copts) {
      var c = Object.assign({ stages: ['exact', 'family', 'fuzzy'], fuzzyMin: 0.5, fuzzyN: 10, compare: 150,
        budget: 40 * 1000, unseen: 'max' }, copts || {});
      var out = [];
      var info = { exact: 0, family: 0, relaxed: 0, fuzzy: 0, compared: 0, postings: 0, famRejected: 0, qfam: null };
      out.info = info;
      var qUnit = U.norm(q.unit);
      if (!qUnit || !q.name) { info.why = !qUnit ? 'query unit unknown' : 'no name'; return out; }
      var qs = q.section || '';
      var asof = q.asof || null;
      var excl = new Set(q.exclude_src || []);
      var found = new Set();
      var stages = c.stages;

      function gate(i) {
        var r = recs[i];
        if (excl.has(r.src)) return null;
        if (!r.price_date) return null;
        if (asof && r.price_date > asof) return null;
        if (asof && !(avail[i] && avail[i] <= asof)) return null;
        if (!sectionOK(qs, r.section)) return null;
        return factorOf(r, qUnit);
      }
      function line(i, how, sim, numRel, f, drop) {
        var r = recs[i];
        return { rid: r.rid, rec: r, how: how, sim: sim, numRel: numRel, unitFactor: f, price_q: r.price * f, drop: drop || [] };
      }
      function byDate(a, b) {
        return (b.sim - a.sim) || (a.rec.price_date < b.rec.price_date ? 1 : a.rec.price_date > b.rec.price_date ? -1 : a.rid - b.rid);
      }

      // (a) exact key
      if (stages.indexOf('exact') >= 0) {
        var hits = byName.get(S.matchKey(q.name)) || [];
        var part = [];
        for (var h = 0; h < hits.length; h++) {
          var i = hits[h];
          var f = gate(i);
          if (f === null) continue;
          found.add(i);
          part.push(line(i, 'exact-key', 1, S.numberRelation(q.name, recs[i].name), f));
        }
        part.sort(byDate); info.exact = part.length; append(out, part);
      }

      // (b) family key, then relaxed levels
      if (stages.indexOf('family') >= 0 && families.length) {
        var qf = R.famParse(families, q.name, qUnit, q.section);
        info.qfam = qf;
        if (qf) {
          // levels relax step by step: what a level dropped includes what the levels before it dropped
          var qkeys = [{ key: qf.key, lvl: 0, drop: [] }];
          var ql = qf.levels || [];
          for (var lk = 0; lk < ql.length; lk++) qkeys.push({ key: ql[lk].key, lvl: lk + 1, drop: dropsUpTo(qf, lk + 1) });
          var best = new Map();     // i -> {score, qk, rl}
          for (var qi = 0; qi < qkeys.length; qi++) {
            var qk = qkeys[qi];
            var fh = famIdx.get(qf.family + '#' + qk.key) || [];
            for (var x = 0; x < fh.length; x++) {
              var ii = fh[x][0], rl = fh[x][1];
              if (found.has(ii)) continue;
              var sc = qk.lvl + rl, b0 = best.get(ii);
              if (!b0 || sc < b0.score) best.set(ii, { score: sc, qk: qk, rl: rl });
            }
          }
          var mod = famById.get(qf.id);
          var fpart = [];
          best.forEach(function (b, bi) {
            var f2 = gate(bi);
            if (f2 === null) return;
            var r = recs[bi];
            if (mod && typeof mod.conflict === 'function') {
              var why = null;
              try { why = mod.conflict(qf, r.fam); } catch (e) { why = null; }
              if (why) { info.famRejected++; return; }
            }
            var exactFam = b.qk.lvl === 0 && b.rl === 0;
            var drop = exactFam ? [] : uniqStrings([].concat(b.qk.drop, dropsUpTo(r.fam, b.rl)));
            found.add(bi);
            var ln = line(bi, exactFam ? 'family' : 'family-relaxed', exactFam ? 1 : null, S.numberRelation(q.name, r.name), f2, drop);
            ln.level = { q: b.qk.lvl, rec: b.rl };
            fpart.push(ln);
          });
          fpart.sort(function (a, b) {
            return (a.how === b.how ? 0 : a.how === 'family' ? -1 : 1) ||
              (a.level.q + a.level.rec) - (b.level.q + b.level.rec) || byDate(a, b);
          });
          var nf = 0;
          for (var y = 0; y < fpart.length; y++) if (fpart[y].how === 'family') nf++;
          info.family = nf;
          info.relaxed = fpart.length - nf;
          append(out, fpart);
        }
      }

      // (c) fuzzy
      if (stages.indexOf('fuzzy') >= 0) {
        var qt = uniqStrings(S.tokens(q.name));
        var added = [];
        if (c.unseen === 'max') for (var a0 = 0; a0 < qt.length; a0++) if (idf[qt[a0]] === undefined) { idf[qt[a0]] = idfMax; added.push(qt[a0]); }
        try {
          fuzzy(q, c, info, out, found, gate, line, byDate);
        } finally {
          for (var d0 = 0; d0 < added.length; d0++) delete idf[added[d0]];
        }
      }
      return out;
    }

    function fuzzy(q, c, info, out, found, gate, line, byDate) {
      // rarest terms first; stop adding common terms once the posting budget is spent
      var qterms = termsOf(q.name), order = [];
      for (var i = 0; i < qterms.length; i++) {
        var p = termIdx.get(qterms[i]) || [];
        if (p.length) order.push({ t: qterms[i], p: p });
      }
      order.sort(function (x, y) { return x.p.length - y.p.length; });
      var touched = [];
      var used = 0;
      for (var oi = 0; oi < order.length; oi++) {
        var e = order[oi];
        if (used >= 2 && info.postings + e.p.length > c.budget) break;
        used++;
        var w = termW.get(e.t), w2 = w * w;
        for (var pi = 0; pi < e.p.length; pi++) {
          var ti = e.p[pi];
          if (acc[ti] === 0) touched.push(ti);
          acc[ti] += w2;
        }
        info.postings += e.p.length;
      }
      info.terms = order.length; info.termsUsed = used;
      // the `compare` best texts by the blocking cosine that have a record passing the gates
      // (bounded min-heap; ties: lower text id)
      var K = c.compare, hs = [], hi = [];
      function worse(x, ix, y, iy) { return x < y || (x === y && ix > iy); }
      function swap(k, m) { var t = hs[k]; hs[k] = hs[m]; hs[m] = t; t = hi[k]; hi[k] = hi[m]; hi[m] = t; }
      function down(k) {
        for (;;) {
          var l = 2 * k + 1, r2 = l + 1;
          var m = k;
          if (l < hs.length && worse(hs[l], hi[l], hs[m], hi[m])) m = l;
          if (r2 < hs.length && worse(hs[r2], hi[r2], hs[m], hi[m])) m = r2;
          if (m === k) return;
          swap(k, m); k = m;
        }
      }
      var gated = new Map();     // tid -> [[i, factor]]
      for (var x = 0; x < touched.length; x++) {
        var tid = touched[x];
        var a = acc[tid] / textNorm[tid]; acc[tid] = 0;
        if (hs.length >= K && !worse(hs[0], hi[0], a, tid)) continue;   // cannot enter the heap
        var gl = [], tr = textRecs[tid];
        for (var j = 0; j < tr.length; j++) {
          var ri = tr[j];
          if (found.has(ri)) continue;
          var f = gate(ri);
          if (f !== null) gl.push([ri, f]);
        }
        if (!gl.length) continue;
        gated.set(tid, gl);
        if (hs.length < K) {
          hs.push(a); hi.push(tid);
          for (var k = hs.length - 1; k > 0;) {
            var par = (k - 1) >> 1;
            if (!worse(hs[k], hi[k], hs[par], hi[par])) break;
            swap(k, par); k = par;
          }
        } else { hs[0] = a; hi[0] = tid; down(0); }
      }
      var groups = [];
      for (var g = 0; g < hi.length; g++) {
        var gtid = hi[g];
        info.compared++;
        var text = texts[gtid];
        var rel = S.numberRelation(q.name, text);
        if (rel === 'conflict') continue;
        var sim = S.similarity(q.name, text, idf);
        if (!(sim >= c.fuzzyMin)) continue;
        var lines = gated.get(gtid).map(function (pr) { return line(pr[0], 'fuzzy', sim, rel, pr[1]); }).sort(byDate);
        groups.push({ sim: sim, newest: lines[0].rec.price_date, tid: gtid, lines: lines });
      }
      groups.sort(function (x, y) { return (y.sim - x.sim) || (x.newest < y.newest ? 1 : x.newest > y.newest ? -1 : x.tid - y.tid); });
      info.fuzzyTexts = groups.length;
      var nfz = 0;
      for (var gi = 0; gi < groups.length; gi++) nfz += groups[gi].lines.length;
      info.fuzzy = nfz;
      for (var gk = 0; gk < groups.length && gk < c.fuzzyN; gk++) append(out, groups[gk].lines);
    }

    /** S.similarity with the pool idf and the same policy for query words the pool never has. */
    function similarity(qName, text, unseen) {
      var added = [];
      if ((unseen || 'max') === 'max') {
        var toks = S.tokens(qName);
        for (var i = 0; i < toks.length; i++) if (idf[toks[i]] === undefined) { idf[toks[i]] = idfMax; added.push(toks[i]); }
      }
      try { return S.similarity(qName, text, idf); } finally { for (var j = 0; j < added.length; j++) delete idf[added[j]]; }
    }

    return {
      candidates: candidates,
      similarity: similarity,
      availOf: function (i) { return avail[i]; },
      size: n,
      recs: recs,
      idf: idf,
      families: families.map(function (f) { return f.id; }),
      timing: { index_ms: tIndex - t0 },
      index: { names: byName.size, famKeys: famIdx.size, texts: nT, terms: termIdx.size, words: tokDf.size }
    };
  }

  R.sectionOK = sectionOK;
  R.termsOf = termsOf;
  R.open = open;
})(S);
