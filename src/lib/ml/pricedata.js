/*
 * Learning from the expert, the price model (docs/ai-reja.md, «Модель цен»): what is known about one resource
 * before its smeta price is looked at, and the dataset of every finished resource.
 *
 * The owner's decision (2026-11-13): the program flags a smeta price that is too high and proposes a price; a
 * resource left out of the reply was looked at and is not too high. So the model learns the expert's market
 * price from the evidence — his own earlier prices, the reference package — and the program compares the smeta
 * price with it afterwards. The smeta price of the resource itself is never an input (the same rule as for the
 * ranker): it is only the label of a resource that was left (its market price is at least that much).
 *
 *   S.ml.pricedata.NAMES / HASH            the evidence features, in order, and their schema hash
 *   S.ml.pricedata.index(rows)             the memory of finished applications, by region and resource, by date
 *   S.ml.pricedata.evidence(item, ctx)     → { anchor, by, x } | null — no evidence, no proposal
 *       item: { name, unit, section, region, asof, key, workspace }   (key: match key + unit key)
 *       ctx:  { sug, mem (index), today } — the reference suggester (or none) and the memory index
 *   S.ml.pricedata.build(sug, rows, opts)  → the price dataset (one item per finished resource with evidence)
 *   S.ml.pricedata.label(row)              → { kind: 'price' | 'floor' | null, y } — what a row says
 *
 * Evidence, all in prices of the resource's own unit:
 *   memory   — the expert's corrected prices of this resource in earlier applications of the same region (never a
 *              later one: an application learns only from what was finished before its own date), the newest and
 *              the median of the last two years; accepted smeta prices (left, «проверено») as a floor;
 *   reference — the first line of today's suggestions as of the application's date (choose()), its tier, and the
 *              lowest line of the best class.
 * The anchor is the first of: the newest corrected price in memory, the reference first line, the highest accepted
 * price. Every other number is a log-ratio to the anchor, so one model serves cheap and dear resources alike.
 * Pure — no page, no server, no clock (ctx.today is given).
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};

  var VERSION = 1;
  var MEM_MONTHS = 24;            // a corrected price older than this is not evidence (as in src/lib/memory.js)
  var NAMES = [
    'bias',
    // which evidence is the anchor
    'a_mem', 'a_ref', 'a_acc',
    // memory: corrected prices of this resource (earlier applications, this region)
    'm_has', 'm_n', 'm_age', 'm_med', 'm_spread', 'm_other_ctr', 'm_accepted',
    // memory: accepted smeta prices (a floor)
    'acc_has', 'acc_n', 'acc_max',
    // the reference
    'r_has', 'r_price', 'r_min', 'r_exact', 'r_document', 'r_estimate', 'r_similar', 'r_median', 'r_wide', 'r_stale', 'r_other_region', 'r_n',
    // agreement between the two
    'mem_vs_ref',
    // the question
    's_labor', 's_machines', 's_transport', 's_materials', 's_equipment'
  ];
  var IX = {};
  for (var i = 0; i < NAMES.length; i++) IX[NAMES[i]] = i;
  var HASH = 'p' + VERSION + '-' + (ML.features ? ML.features.fnv(VERSION + '|' + NAMES.join('|')) : '0');
  var DAY = 86400000;

  function day(v) { var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '')); return m ? m[1] : ''; }
  function months(a, b) { var x = Date.parse(a), y = Date.parse(b); return isNaN(x) || isNaN(y) ? null : (y - x) / DAY / 30.4375; }
  function lg(v) { return Math.log(v); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function median(a) {
    var s = a.slice().sort(function (p, q) { return p - q; }), n = s.length;
    return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null;
  }
  /** The date a finished price is for: its application's date, or the finishing day when that is earlier (as S.memory.dateOf). */
  function dateOf(r) { var a = day(r.asof), f = day(r.finished); return a && f ? (a < f ? a : f) : a || f; }
  function keyOf(r) {
    if (r.match_key) return r.match_key + '␟' + (r.match_unit_key || '');
    return S.matchPair ? S.matchPair(r.name || '', r.unit || '') : String(r.name) + '␟' + String(r.unit);
  }

  /** What one finished row says about the market price: exactly this ('price'), or at least this ('floor'). */
  function label(r) {
    var fin = +r.final_price, sm = +r.smeta_price;
    if (r.kind === 'corrected') {
      if (!(fin > 0) || r.source === 'pct') return { kind: null, y: null };   // struck out; a blanket percent
      return { kind: 'price', y: fin };
    }
    if ((r.kind === 'checked' || r.kind === 'untouched') && sm > 0) return { kind: 'floor', y: sm };
    return { kind: null, y: null };
  }

  /** region → key → [{ date, workspace, contragent, kind, price, accepted }] (oldest first). */
  function index(rows) {
    var by = {};
    (rows || []).forEach(function (r) {
      var lb = label(r);
      if (!lb.kind) return;
      var d = dateOf(r);
      if (!d) return;
      var reg = r.region || '', k = keyOf(r);
      var m = by[reg] || (by[reg] = {});
      (m[k] || (m[k] = [])).push({ date: d, workspace: r.workspace || '', contragent: r.contragent || '', kind: lb.kind, price: lb.y,
        accepted: !!r.accepted, checked: r.kind === 'checked' });
    });
    Object.keys(by).forEach(function (reg) {
      Object.keys(by[reg]).forEach(function (k) { by[reg][k].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); });
    });
    return by;
  }

  function evidence(item, ctx) {
    var x = new Array(NAMES.length);
    for (var j = 0; j < x.length; j++) x[j] = 0;
    function set(n, v) { x[IX[n]] = v; }
    var asof = day(item.asof) || day(ctx.today);

    // memory: earlier applications only, same region, not this application
    var past = ((ctx.mem || {})[item.region || ''] || {})[item.key] || [];
    var corr = [], acc = [];
    for (var a = 0; a < past.length; a++) {
      var p = past[a];
      if (p.date >= asof) break;                                   // oldest first: the rest is later
      if (item.workspace && p.workspace === item.workspace) continue;
      var age = months(p.date, asof);
      if (p.kind === 'price') { if (age <= MEM_MONTHS) corr.push(p); } else acc.push(p);
    }
    var newest = corr.length ? corr[corr.length - 1] : null;
    var accMax = acc.length ? Math.max.apply(null, acc.map(function (q) { return q.price; })) : null;

    // the reference, as of the application's date
    var top = null, best = null, nLines = 0;
    if (ctx.sug && S.refs) {
      try {
        var q = S.refs.queryOf({ name: item.name, unit: item.unit, section: item.section }, { region: item.region, asof: asof });
        var lines = ctx.sug.gather(q).lines;
        nLines = lines.length;
        if (lines.length) {
          var shown = ctx.sug.choose(lines, q);
          top = shown[0];
          var bk = top.tierRank;
          best = lines.filter(function (l) { return l.tierRank === bk; }).reduce(function (m, l) { return !m || l.price < m.price ? l : m; }, null);
        }
      } catch (e) { top = null; }
    }

    var anchor = null, by = null;
    if (newest) { anchor = newest.price; by = 'mem'; }
    else if (top && top.price > 0) { anchor = top.price; by = 'ref'; }
    else if (accMax > 0) { anchor = accMax; by = 'acc'; }
    if (!(anchor > 0)) return null;
    var A = lg(anchor);
    set('bias', 1);
    set('a_' + by, 1);

    if (corr.length) {
      var ps = corr.map(function (q) { return q.price; });
      set('m_has', 1);
      set('m_n', clamp(Math.log(1 + corr.length) / Math.log(11), 0, 1.5));
      set('m_age', clamp(months(newest.date, asof) / MEM_MONTHS, 0, 1));
      set('m_med', clamp(lg(median(ps)) - A, -1.5, 1.5));
      set('m_spread', clamp(lg(Math.max.apply(null, ps) / Math.min.apply(null, ps)), 0, 1.5));
      if (item.contragent && newest.contragent && newest.contragent !== item.contragent) set('m_other_ctr', 1);
      if (newest.accepted) set('m_accepted', 1);
    }
    if (accMax > 0) {
      set('acc_has', 1);
      set('acc_n', clamp(Math.log(1 + acc.length) / Math.log(11), 0, 1.5));
      set('acc_max', clamp(lg(accMax) - A, -1.5, 1.5));
    }
    if (top && top.price > 0) {
      set('r_has', 1);
      set('r_price', clamp(lg(top.price) - A, -1.5, 1.5));
      if (best && best.price > 0) set('r_min', clamp(lg(best.price) - A, -1.5, 1.5));
      var t = top.tierRank;
      set(t === 0 ? 'r_exact' : t === 1 ? 'r_document' : t === 1.5 ? 'r_estimate' : 'r_similar', 1);
      var fl = top.flags || [];
      if (top.isMedian) set('r_median', 1);
      if (fl.indexOf('wide-spread') >= 0) set('r_wide', 1);
      if (fl.indexOf('stale') >= 0) set('r_stale', 1);
      if (fl.indexOf('other-region') >= 0) set('r_other_region', 1);
      set('r_n', clamp(Math.log(1 + nLines) / Math.log(21), 0, 1.5));
      if (newest) set('mem_vs_ref', clamp(lg(newest.price) - lg(top.price), -1.5, 1.5));
    }
    var sec = { labor: 's_labor', machines: 's_machines', transport: 's_transport', materials: 's_materials', equipment: 's_equipment' }[item.section];
    if (sec) set(sec, 1);
    return { anchor: anchor, by: by, x: x,
      ref: top && top.price > 0 ? top.price : null, refTier: top ? top.tierRank : null, mem: newest ? newest.price : null, memDate: newest ? newest.date : null,
      memN: corr.length, acc: accMax };
  }

  /**
   * Every finished resource with evidence: { a (application), kind 'price'|'floor', ly (log of the label), la (log of
   * the anchor), ls (log of the smeta price — for the decision «is it too high» and its measurement, never in x), by,
   * x, lref, lmem } — logs only; names stay out of the dataset.
   * A floor's label is its smeta price — the one place it is used, as the answer «at least this», never as an input.
   */
  function build(sug, rows, opts) {
    var o = opts || {};
    var mem = index(rows);
    var ds = { format: 'smeta-ml-prices', version: VERSION, schema: { hash: HASH, names: NAMES.slice() }, built: o.now || null,
      rows: 0, apps: [], items: [], skipped: { struck: 0, pct: 0, nodate: 0, noevidence: 0, noevidence_price: 0, noevidence_price_other_region: 0 } };
    var appIx = {};
    (rows || []).forEach(function (r, i) {
      if (o.progress && i % 50 === 0) o.progress(i, rows.length);
      if (!r || !r.name) return;
      ds.rows++;
      var lb = label(r);
      if (!lb.kind) { if (r.source === 'pct') ds.skipped.pct++; else ds.skipped.struck++; return; }
      var d = dateOf(r);
      if (!d) { ds.skipped.nodate++; return; }
      var ev = evidence({ name: r.name, unit: r.unit, section: r.section, region: r.region, asof: d, key: keyOf(r), workspace: r.workspace,
        contragent: r.contragent }, { sug: sug, mem: mem, today: o.today });
      if (!ev) {
        ds.skipped.noevidence++;
        if (lb.kind === 'price') {
          ds.skipped.noevidence_price++;
          // counted only: would another region's memory have had an earlier price of it? (not read — the owner decides)
          var k0 = keyOf(r), far = false;
          Object.keys(mem).forEach(function (reg) {
            if (far || reg === (r.region || '')) return;
            far = (mem[reg][k0] || []).some(function (p) { return p.kind === 'price' && p.date < d; });
          });
          if (far) ds.skipped.noevidence_price_other_region++;
        }
        return;
      }
      var id = String(r.workspace || '?');
      if (appIx[id] == null) { appIx[id] = ds.apps.length; ds.apps.push({ id: id, date: d, finished: day(r.finished) || d, region: r.region || '', split: null, n: 0 }); }
      ds.apps[appIx[id]].n++;
      var sm = +r.smeta_price;
      ds.items.push({ a: appIx[id], kind: lb.kind, ly: lg(lb.y), la: lg(ev.anchor), by: ev.by, x: ev.x, ls: sm > 0 ? lg(sm) : null,
        lref: ev.ref ? lg(ev.ref) : null, lmem: ev.mem ? lg(ev.mem) : null, sec: r.section || '', acc: r.accepted ? 1 : 0 });
    });
    if (o.progress) o.progress(rows.length, rows.length);
    if (ML.dataset) ML.dataset.split(ds.apps);
    return ds;
  }

  ML.pricedata = { VERSION: VERSION, NAMES: NAMES, INDEX: IX, HASH: HASH, MEM_MONTHS: MEM_MONTHS, label: label, index: index, evidence: evidence,
    build: build, keyOf: keyOf };
})(S);
