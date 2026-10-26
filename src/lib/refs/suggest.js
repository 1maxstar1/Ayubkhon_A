/*
 * Reference prices: the suggester.
 *
 *   var sug = S.refs.create({ policy: 'p3' });       // { name, init(ctx), suggest(q) }
 *   sug.init({ handle: S.refs.open(recs), sources: pkg.sources });
 *   sug.suggest(q)  → [line …]                       // ≤ 6 lines, best first
 *   sug.gather(q)   → { lines, info }                // every collapsed candidate line with its features
 *
 * Routing by q.section:
 *   labor      → the wage table of q.region, the newest quarter published by q.asof (rec.avail: the earliest save date
 *                of the editions that print the value); the line cites that earliest edition (rec.avail_src,
 *                `published`). Line 1 tier 'exact'; up to 3 older quarters follow as 'document' (flag older-quarter).
 *                Machinists have no wage-table rate: no line.
 *   machines   → retrieval candidates (exact key, family key, relaxed levels, fuzzy ≥ 0.6), in three route stages:
 *                1 the national machine-hour list, 2 expert conclusions of q.region, 3 everything else. Conclusion
 *                rows priced without fuel are dropped when the same row exists with fuel; distance-banded rows of one
 *                vehicle collapse to their median (flag km-bands).
 *   transport  → t·km bands: the haul distance and the capacity are read from the name; every t·km series (one vehicle
 *                in one document, attrs.km bands) of q.region gives the tariff of its band (tariffFor, rule 'ceil',
 *                with fuel). General cargo takes tractors, flatbeds and dump trucks; a named vehicle type only that
 *                type. Tier 'document' when the capacity equals the stated one, else 'similar'. Other regions only
 *                when q.region has none (flag).
 *   materials, equipment → retrieval: exact key / exact family key 'document'; relaxed family level 'similar'; fuzzy
 *                'similar' only at S.similarity ≥ 0.8.
 * A unit change that needs item data (kg/m, m³ per piece, pack content) makes an exact-identity line 'estimate'; a
 * relaxed or fuzzy line stays 'similar' with the flag derived-unit.
 *
 * Per source family (the exchange; one catalogue manufacturer in one region; otherwise the issuer — or, for expert
 * conclusions, the enterprise the conclusion is for) and item (family key, else the match key) only the newest edition
 * ≤ asof is kept; several records of that edition become one line at their median with `rids`.
 *
 * The top line is a policy (opts.policy) applied to the qualifying lines = the lines of the best tier, in the first
 * route stage that has one, with the closest match grade:
 *   p1  same region first, then the newest price_date
 *   p2  the lowest price
 *   p3  the median of the qualifying lines when they agree (max/min ≤ 1.5): a summary line carrying its components,
 *       which are not repeated below it; when they disagree more, the p1 line flagged wide-spread with `range`.
 * Never used: the smeta price (the query does not carry it).
 *
 * Every comparator, tie-break and text here is part of the measured behaviour: the full output must equal the
 * private golden (test/refs-parity.cjs). Change only with that measurement.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var R = S.refs = S.refs || {};

  // a relaxed / fuzzy match with a derived unit factor (2.5) is a different resource first: «Похожий»
  var TIER_NAME = { 0: 'exact', 1: 'document', 1.5: 'estimate', 2: 'similar', 2.5: 'similar' };
  var DAY = 86400000;

  function normIssuer(s) {
    return String(s || '').toUpperCase().replace(/\([^)]*\)/g, ' ').replace(/[«»"“”„'`’‘ʻ]/g, ' ')
      .replace(/\b(ООО|OOO|СП|АО|AJ|MCHJ|МЧЖ|MCHJ QK|QK|DM|ДМ|ЧП|LLC|MCHJ|МЧЖ)\b/g, ' ').replace(/[^0-9A-ZА-ЯЁЎҚҒҲ ]+/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function median(xs) {
    var a = xs.slice().sort(function (p, q) { return p - q; }), n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }
  function has(a, x) { return !!a && a.indexOf(x) >= 0; }
  function uniq(a) {
    var seen = new Set(), out = [];
    for (var i = 0; i < a.length; i++) if (!seen.has(a[i])) { seen.add(a[i]); out.push(a[i]); }
    return out;
  }
  function minOf(a) { return Math.min.apply(null, a); }
  function maxOf(a) { return Math.max.apply(null, a); }
  function cmpDateDesc(a, b) { return a < b ? 1 : a > b ? -1 : 0; }

  function flagsOf(rec, q) {
    var f = [];
    var age = days(rec.price_date, q.asof);
    var fl = rec.flags || [];
    if (age > 91) f.push('stale');
    if (rec.basis === 'exchange-forward' || has(fl, 'forward')) f.push('forward');
    if (has(fl, 'vat_inferred')) f.push('vat_inferred');
    if (rec.delivery === 'delivered') f.push('delivered');
    if (rec.basis === 'plant-calc') f.push('plant-calc');
    if (rec.basis === 'declared') f.push('declared');
    if (rec.region && q.region && rec.region !== q.region && rec.region !== 'national' && rec.region !== 'respublika') f.push('other-region');
    if (has(fl, 'non_construction')) f.push('non-construction');
    if (has(fl, 'merge:excludes_pipe_cost')) f.push('excludes-pipe-cost');
    return f;
  }

  function machineStage(rec, q) {
    if (rec.group === 'machine-list') return 1;
    if (rec.group === 'machine-conclusions' && rec.region === q.region) return 2;
    return 3;
  }

  function tierOf(how, derived) {
    if (how === 'exact-key' || how === 'family') return derived ? 1.5 : 1;
    return derived ? 2.5 : 2;
  }

  function recDrops(fam, k) {
    var out = [];
    for (var j = 0; j < k && fam && fam.levels && j < fam.levels.length; j++) {
      var d = fam.levels[j].drop || [];
      for (var i = 0; i < d.length; i++) out.push(d[i]);
    }
    return uniq(out);
  }

  /* Levels a family marks `minor` (steel: maker, origin, pack, grade, standard) drop no identity: the grade counts
     the identity levels first; the raw level sum breaks ties. */
  function identityLevels(levels, k) {
    var n = 0;
    for (var j = 0; j < k && levels && j < levels.length; j++) if (!levels[j].minor) n++;
    return n;
  }
  function gradeOf(c) {
    if (c.how === 'exact-key' || c.how === 'family' || c.statesMore) return 0;
    if (c.how === 'family-relaxed') {
      if (!c.level) return 150;
      var raw = c.level.q + c.level.rec;
      if (c.qLevels || c.rLevels) return 100 + identityLevels(c.qLevels, c.level.q) + identityLevels(c.rLevels, c.level.rec) + raw / 100;
      return 100 + raw;
    }
    return 1000;
  }

  function collapse(cands) {
    // per (source family, item): the newest edition; its records → one line (median when they differ)
    var by = new Map();
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var k = c.sfam + '\u0001' + c.item;
      var g = by.get(k);
      if (!g) { by.set(k, [c]); continue; }
      g.push(c);
    }
    var out = [];
    by.forEach(function (g) {
      var newest = '';
      for (var a = 0; a < g.length; a++) if (g[a].rec.price_date > newest) newest = g[a].rec.price_date;
      var top = g.filter(function (c) { return c.rec.price_date === newest; });
      // best match form first (a record found by several stages keeps its first)
      var bestT = minOf(top.map(function (c) { return c.tierRank; }));
      top = top.filter(function (c) { return c.tierRank === bestT; });
      var ps = top.map(function (c) { return c.price; });
      var lo = minOf(ps), hi = maxOf(ps);
      var base = top.slice().sort(function (a, b) { return a.rec.rid - b.rec.rid; })[0];
      var line = Object.assign({}, base, { recs: top.map(function (c) { return c.rec; }), nEditionRecs: top.length,
        olderEditions: g.length - top.length, spread: lo > 0 ? hi / lo : 1 });
      if (hi > lo * 1.0005) {
        line.price = median(ps);
        line.medianOf = top.length;
      }
      line.sim = maxOf(top.map(function (c) { return c.sim == null ? -1 : c.sim; }));
      if (line.sim < 0) line.sim = null;
      out.push(line);
    });
    return out;
  }

  function create(opts) {
    var o = Object.assign({ policy: 'p1', issueGate: true, maxLines: 6, fuzzyMin: 0.8, fuzzyMinMachines: 0.6,
      staleDays: 91, olderQuarters: 3, transportOtherRegions: true, name: null,
      relaxedGates: true, statesMore: true, declaredStage: false, noBandedHours: true, medianMaxSpread: 1.5,
      machinesRelaxedMax: 8, machinesGate: 'side' }, opts || {});
    var name = o.name || ('suggest-' + o.policy + (o.issueGate ? '' : '-noissue'));
    var st = null;
    var RU = R.RU || { TIER: {}, FLAG: {} };

    function init(ctx) {
      var c = ctx || {};
      var h = c.handle;
      if (!h) throw new Error('S.refs.create: init({ handle, sources }) needs the handle of S.refs.open');
      var src = new Map();
      var sl = c.sources || [];
      for (var i = 0; i < sl.length; i++) src.set(sl[i].id, sl[i]);
      st = {
        h: h, src: src, MF: R.familyMod('machines'),
        wages: h.recs.filter(function (r) { return r.group === 'wages'; }),
        transport: h.recs.filter(function (r) { return r.section === 'transport' && r.unit === 'т-км'; }),
        plain: new Map()
      };
    }

    /* The source family of a record: one series whose editions replace each other. */
    function sourceFamily(rec) {
      if (rec.group === 'exchange') return 'exchange' + (rec.basis === 'exchange-forward' ? ':forward' : '');
      if (rec.group === 'catalogue') return 'catalogue|' + (rec.plant || '?') + '|' + (rec.region || '?');
      if (rec.group === 'wages') return 'wages|' + rec.region;
      var s = st.src.get(rec.src) || {};
      var who = /conclusion|protocol/.test(s.doc_type || '') && s.customer ? normIssuer(s.customer) : normIssuer(s.issuer || rec.src);
      return (rec.group || '?') + '|' + who + '|' + (rec.region || s.region || '?');
    }
    function issuerLabel(rec) {
      var s = st.src.get(rec.src) || {};
      var t = (s.issuer || rec.src).replace(/\s*\(.*$/, '').slice(0, 60);
      if (rec.group === 'catalogue' && rec.plant) t = 'каталог: ' + rec.plant;
      if (rec.group === 'exchange') t = 'биржа УзРТСБ';
      if (s.doc_no && rec.group !== 'exchange') t += (/^№/.test(s.doc_no) ? ' ' : ' №') + s.doc_no;
      return t;
    }

    /* Did units.factor need the record's item data (kg/m, m³ per piece, pack content) for this conversion? */
    function derivedFactor(rec, qUnit) {
      if (!rec.ua) return false;
      var k = rec.unit + '→' + qUnit;
      var f = st.plain.get(k);
      if (f === undefined) { f = R.units.factor(rec.unit, qUnit, null); st.plain.set(k, f); }
      return f === null;
    }

    function gate2(rec, q) {
      // the availability date (exchange bulletin end, wage edition, issue date), from the package
      var a = rec.avail;
      if (!a || a > q.asof) return false;
      if (has(rec.flags, 'merge:checker_dup_of_forward_trade')) return false;
      return true;
    }

    /* -------------------------------------------- labour */
    function labour(q) {
      var p = st.MF.parse(String(q.name).toUpperCase(), q.unit, 'labor');
      var kind = p && p.attrs ? p.attrs.kind : null;
      var info = { route: 'labor', kind: kind };
      if (kind === 'labour-machinists') return { lines: [], info: Object.assign(info, { why: 'нет ставки машинистов в таблице' }) };
      if (R.units.norm(q.unit) !== 'чел-ч') return { lines: [], info: Object.assign(info, { why: 'unit' }) };
      var excl = new Set(q.exclude_src || []);
      var recs = st.wages.filter(function (r) { return r.region === q.region && r.price_date <= q.asof && !excl.has(r.src); });
      // the earliest edition that prints the value (src or an equal also_in file) and its save date
      var ok = recs.map(function (r) { return { r: r, pub: r.avail, src: r.avail_src }; })
        .filter(function (x) { return x.pub && x.pub <= q.asof && !excl.has(x.src); })
        .sort(function (a, b) { return a.r.price_date < b.r.price_date ? 1 : -1; });
      var lines = ok.slice(0, 1 + o.olderQuarters).map(function (x, i) {
        var per = x.r.price_date.slice(0, 4) + ' Q' + (Math.floor((+x.r.price_date.slice(5, 7) - 1) / 3) + 1);
        return {
          recs: [x.r], rec: x.r, price: x.r.price, how: 'wage', sim: 1, level: null, drop: [], numRel: null, factor: 1,
          derived: false, stage: 1, tierRank: i === 0 ? 0 : 1, grade: i, sfam: 'wages|' + q.region, item: per,
          flags: i ? ['older-quarter'] : [], citeSrc: x.src, published: x.pub,
          why: ['таблица зарплаты ' + q.region + ', ' + per + ' (файл ' + x.src + ', сохранён ' + x.pub + ')', 'ставка с соцстрахом 12 %']
        };
      });
      return { lines: lines, info: info };
    }

    /* -------------------------------------------- transport */
    var GENERAL = new Set(['ТЯГАЧ', 'САМОСВАЛ', 'БОРТОВОЙ', 'АВТОМОБИЛЬ', 'ГРУЗОВОЙ']);
    function transport(q) {
      var up = String(q.name).toUpperCase();
      var info = { route: 'transport' };
      if (R.units.norm(q.unit) !== 'т-км') return { lines: [], info: Object.assign(info, { why: 'unit' }) };
      var mk = /(\d+(?:[.,]\d+)?)\s*КМ/.exec(up);
      var km = mk ? +mk[1].replace(',', '.') : null;
      var mc = /(\d+(?:[.,]\d+)?)\s*(?:ТН|Т|ТОНН)(?![А-ЯA-Z])/.exec(up);
      var cap = mc ? +mc[1].replace(',', '.') : null;
      var qp = st.MF.parse(up, 'т-км', 'transport');
      var qType = qp && qp.attrs && qp.attrs.type && !/ПЕРЕВОЗК|ГРУЗ|ТРАНСПОРТ/.test(qp.attrs.type) ? qp.attrs.type : null;
      info.km = km; info.cap = cap; info.qType = qType;
      if (!(km > 0)) return { lines: [], info: Object.assign(info, { why: 'no distance in the name' }) };
      var excl = new Set(q.exclude_src || []);
      var series = new Map();
      for (var i = 0; i < st.transport.length; i++) {
        var r = st.transport[i];
        if (excl.has(r.src) || !r.price_date || r.price_date > q.asof || !gate2(r, q)) continue;
        if (!(r.attrs && r.attrs.km > 0)) continue;
        var k = r.src + '\u0001' + r.name;
        if (!series.has(k)) series.set(k, []);
        series.get(k).push(r);
      }
      var cands = [];
      series.forEach(function (recs) {
        var r0 = recs[0];
        var p = st.MF.parse(String(r0.name).toUpperCase(), 'т-км', 'transport');
        var type = p && p.attrs ? p.attrs.type : null;
        if (qType ? type !== qType : !GENERAL.has(type)) return;
        var hit = st.MF.tariffFor(recs, km, { rule: 'ceil', withFuel: true });
        if (!hit) return;
        var nums = (p && p.attrs && p.attrs.nums) || [];
        var t = nums.filter(function (n) { return n.dim === 't'; }).map(function (n) { return +n.v; });
        var capOk = cap == null || t.indexOf(cap) >= 0;
        var same = r0.region === q.region;
        cands.push({
          rec: hit.rec, price: hit.rec.price, how: capOk ? 'tariff' : 'tariff-other-vehicle', sim: null, level: null,
          drop: capOk ? [] : ['грузоподъёмность ' + (t.join('/') || '?') + ' т ≠ ' + cap + ' т'],
          numRel: null, factor: 1, derived: false, stage: same ? 1 : 2, tierRank: capOk ? 1 : 2,
          grade: capOk ? 0 : 100 + Math.abs((t[0] || 0) - (cap || 0)),
          sfam: sourceFamily(hit.rec), item: 'TKM|' + (type || '?') + '|' + t.join('/'), flags: flagsOf(hit.rec, q),
          why: ['тариф т·км: ' + r0.name + ', полоса ' + hit.band + ' км для ' + km + ' км (ближайшая полоса не меньше расстояния)', 'с топливом']
        });
      });
      var use = cands.filter(function (c) { return c.stage === 1; });
      if (!use.length && o.transportOtherRegions) {
        use = cands.map(function (c) { return Object.assign(c, { flags: c.flags.concat(has(c.flags, 'other-region') ? [] : ['other-region']) }); });
      }
      return { lines: collapse(use), info: info };
    }

    /* -------------------------------------------- retrieval routes (machines, materials, equipment) */
    function retrieval(q) {
      var info = { route: q.section === 'machines' ? 'machines' : 'materials' };
      var isMach = q.section === 'machines';
      var list = st.h.candidates(q, { fuzzyMin: 0.5, issueGate: o.issueGate });
      info.retrieve = list.info ? { exact: list.info.exact, family: list.info.family, relaxed: list.info.relaxed, fuzzy: list.info.fuzzy,
        qfam: list.info.qfam ? list.info.qfam.key : null, why: list.info.why } : null;
      var qUnit = R.units.norm(q.unit);
      var qc = qUnit ? R.units.canon(qUnit) : null, qDim = qc ? qc.dim : null;
      var cands = [];
      var fuelPairs = new Set();
      for (var xi = 0; xi < list.length; xi++) {
        var x = list[xi];
        var rec = x.rec;
        if (!gate2(rec, q)) { info.issueGated = (info.issueGated || 0) + 1; continue; }
        // a truck's machine-hour priced by haul distance (t·km conclusions) is a haul price, not a list machine-hour
        if (o.noBandedHours && isMach && rec.attrs && rec.attrs.km > 0) { info.bandedHours = (info.bandedHours || 0) + 1; continue; }
        if (x.how === 'fuzzy' && !(x.sim >= (isMach ? o.fuzzyMinMachines : o.fuzzyMin))) continue;
        var fam = x.how === 'family-relaxed' && rec.fam ? rec.fam.family : null;
        // relaxed levels that carry no price information are not shown: the long-tail family's relaxed levels only
        // for goods priced by volume (m³: timber)
        if (o.relaxedGates && fam === 'electro' && !(qDim === 'vol' && x.unitFactor === 1)) { info.gatedRelaxed = (info.gatedRelaxed || 0) + 1; continue; }
        // a relaxed level of a steel item priced by the piece has dropped its size: another size is another price
        if (o.relaxedGates && fam === 'steel' && (qDim === 'count' || qDim === 'kit')) { info.gatedRelaxed = (info.gatedRelaxed || 0) + 1; continue; }
        // the generic-item machine levels (no numbers, codes or words) are hidden
        if (o.relaxedGates && fam === 'machines' && x.level && (o.machinesGate === 'sum' ? x.level.q + x.level.rec >= o.machinesRelaxedMax :
          (x.level.q >= o.machinesRelaxedMax || x.level.rec >= o.machinesRelaxedMax))) { info.gatedRelaxed = (info.gatedRelaxed || 0) + 1; continue; }
        if (rec.attrs && rec.attrs.with_fuel === true) fuelPairs.add(rec.src + '\u0001' + rec.name);
        var derived = derivedFactor(rec, qUnit);
        var tierRank = tierOf(x.how, derived);
        var flags = flagsOf(rec, q);
        if (derived && tierRank === 2.5) flags.push('derived-unit');
        // the document states more than the smeta (conductor shape / core roles, kV, U0/Um)
        var statesMore = false;
        if (o.statesMore && fam === 'cable' && x.level && x.level.q === 0 && x.level.rec > 0) {
          var rd = recDrops(rec.fam, x.level.rec);
          if (rd.length && rd.every(function (d) { return /^форма\/назначение жил|^kV$|^U0/.test(d); })) {
            statesMore = true; tierRank = derived ? 1.5 : 1; flags.push('document-states-more');
          }
        }
        if (has(flags, 'excludes-pipe-cost') && tierRank < 2) tierRank = 2;
        var stage = isMach ? machineStage(rec, q) : (has(flags, 'forward') ? 2 : 1);
        if (o.declaredStage && rec.basis === 'declared') stage += 1;
        var c = {
          rec: rec, price: x.price_q, how: x.how, sim: x.sim, level: x.level || null, drop: x.drop || [], numRel: x.numRel,
          factor: x.unitFactor, derived: derived, stage: stage, statesMore: statesMore,
          tierRank: tierRank, sfam: sourceFamily(rec), item: rec.fam ? rec.fam.family + '#' + rec.fam.key : 'mp#' + rec.mp, flags: flags
        };
        if (x.how === 'family-relaxed' && fam === 'steel') {
          var qf0 = list.info ? list.info.qfam : null;
          c.qLevels = qf0 && qf0.levels; c.rLevels = rec.fam && rec.fam.levels;
        }
        c.grade = gradeOf(c);
        cands.push(c);
      }
      // conclusion rows without fuel go when the same row is priced with fuel
      cands = cands.filter(function (c) { return !(c.rec.attrs && c.rec.attrs.with_fuel === false && fuelPairs.has(c.rec.src + '\u0001' + c.rec.name)); });
      var lines = collapse(cands);
      var qf = list.info ? list.info.qfam : null;
      for (var li = 0; li < lines.length; li++) {
        var l = lines[li];
        if (l.medianOf && l.recs.some(function (r) { return r.attrs && r.attrs.km > 0; })) l.flags = l.flags.concat(['km-bands']);
        // a relaxed cable line names the values it changed («экран 16 → 25») and its screen gap, so that
        // qualifying() keeps the nearest screen at or above the query's
        if (l.how === 'family-relaxed' && qf && qf.family === 'cable' && l.rec.fam && l.rec.fam.attrs) {
          var xa = qf.attrs || {}, ya = l.rec.fam.attrs;
          var ch = [];
          if (String(xa.screen_mm2 || '') !== String(ya.screen_mm2 || '')) ch.push('экран ' + (xa.screen_mm2 || '—') + ' → ' + (ya.screen_mm2 || '—'));
          if (String(xa.kv || '') !== String(ya.kv || '')) ch.push('kV ' + (xa.kv || '—') + ' → ' + (ya.kv || '—'));
          if (String(xa.mark || '') !== String(ya.mark || '')) ch.push('марка ' + (xa.mark || '—') + ' → ' + (ya.mark || '—'));
          l.changed = ch;
          if (xa.screen_mm2 && ya.screen_mm2) l.screenGap = Number(ya.screen_mm2) - Number(xa.screen_mm2);
        }
        l.why = whyOf(l, q);
      }
      return { lines: lines, info: info };
    }

    function whyOf(l, q) {
      var r = l.rec, w = [];
      var fk = r.fam && r.fam.key;
      if (l.statesMore) w.push('тот же кабель; документ указывает больше: ' + l.drop.join(', '));
      else if (l.how === 'exact-key') w.push('то же наименование: «' + (r.fz || r.name).slice(0, 90) + '»');
      else if (l.how === 'family') w.push('тот же ключ семейства ' + fk);
      else if (l.how === 'family-relaxed') w.push('похожий ключ ' + fk + (l.changed && l.changed.length ? '; ' + l.changed.join(', ') : l.drop.length ? '; без: ' + l.drop.join(', ') : ''));
      else if (l.how === 'fuzzy') w.push('похожее наименование (сходство ' + l.sim.toFixed(2) + '): «' + (r.fz || r.name).slice(0, 90) + '»');
      w.push(issuerLabel(r) + ', ' + r.price_date + (r.region ? ', ' + r.region : ''));
      if (l.factor !== 1) w.push('цена ' + Math.round(r.price).toLocaleString('ru') + ' за ' + r.unit + ' → ×' + +l.factor.toPrecision(6) + ' за ' + q.unit + (l.derived ? ' (по данным изделия)' : ''));
      if (l.medianOf) w.push('медиана ' + l.medianOf + ' записей одной редакции (разброс ×' + l.spread.toFixed(2) + ')');
      return w;
    }

    /* -------------------------------------------- choosing */
    function classKey(l) { return [l.tierRank, l.stage, l.grade >= 1000 ? 1000 : l.grade]; }
    function cmpKey(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
    function policyCmp(q) {
      if (o.policy === 'p2') {
        return function (a, b) { return a.price - b.price || cmpDateDesc(a.rec.price_date, b.rec.price_date) || a.rec.rid - b.rec.rid; };
      }
      // p1 (and the display order of p3)
      return function (a, b) {
        return ((b.rec.region === q.region) - (a.rec.region === q.region)) ||
          cmpDateDesc(a.rec.price_date, b.rec.price_date) ||
          ((b.sim == null ? 0 : b.sim) - (a.sim == null ? 0 : a.sim)) || a.rec.rid - b.rec.rid;
      };
    }

    function qualifying(lines) {
      if (!lines.length) return [];
      var best = lines.reduce(function (m, l) { return cmpKey(classKey(l), classKey(m)) < 0 ? l : m; }, lines[0]);
      var bk = classKey(best);
      var qual = lines.filter(function (l) { return cmpKey(classKey(l), bk) === 0; });
      // relaxed cable lines — the nearest screen at or above the query's, not every screen
      var gaps = qual.filter(function (l) { return l.screenGap != null && l.screenGap >= 0; }).map(function (l) { return l.screenGap; });
      if (gaps.length) { var g0 = minOf(gaps); qual = qual.filter(function (l) { return l.screenGap == null ? false : l.screenGap === g0; }); }
      if (bk[2] === 1000) {
        var bs = maxOf(qual.map(function (l) { return l.sim || 0; }));
        qual = qual.filter(function (l) { return (l.sim || 0) >= bs - 0.05; });
      }
      return qual;
    }

    function choose(lines, q) {
      if (!lines.length) return [];
      var pc = policyCmp(q);
      var qual = qualifying(lines).slice().sort(pc);
      var first, folded = null;
      if (o.policy === 'p3' && qual.length > 1) {
        var ps = qual.map(function (l) { return l.price; });
        var med = median(ps);
        var spread = maxOf(ps) / minOf(ps);
        var hit = null;
        for (var i = 0; i < qual.length; i++) if (Math.abs(qual[i].price - med) <= med * 1e-9) { hit = qual[i]; break; }
        if (spread > o.medianMaxSpread) {
          // lines that disagree by more than the cap are not summarised — the p1 line, flagged
          first = Object.assign({}, qual[0], { flags: qual[0].flags.concat(['wide-spread']),
            range: { min: minOf(ps), max: maxOf(ps), n: qual.length },
            why: (qual[0].why || []).concat(['документы лучшего уровня расходятся: ' + qual.length + ' строк, ×' + spread.toFixed(2) +
              ' (' + Math.round(minOf(ps)).toLocaleString('ru') + ' – ' + Math.round(maxOf(ps)).toLocaleString('ru') + ')']) });
          folded = new Set([qual[0]]);
        } else if (hit) first = hit;
        else {
          var newest = qual.reduce(function (m, l) { return l.rec.price_date > m ? l.rec.price_date : m; }, '');
          var allRecs = [], allFlags = [];
          for (var j = 0; j < qual.length; j++) {
            for (var a = 0; a < qual[j].recs.length; a++) allRecs.push(qual[j].recs[a]);
            for (var b = 0; b < qual[j].flags.length; b++) allFlags.push(qual[j].flags[b]);
          }
          first = Object.assign({}, qual[0], {
            price: med, isMedian: true, medianLines: qual, spreadLines: spread,
            recs: allRecs, rec: Object.assign({}, qual[0].rec, { price_date: newest }),
            flags: uniq(allFlags),
            why: ['медиана ' + qual.length + ' строк лучшего уровня (разброс ×' + spread.toFixed(2) + '): ' +
              qual.map(function (l) { return Math.round(l.price).toLocaleString('ru'); }).join(' / ')]
          });
          // its component lines are inside it (line.components), not repeated below
          folded = new Set(qual);
        }
      } else first = qual[0];
      var rest = lines.filter(function (l) { return l !== first && !(folded && folded.has(l)); })
        .sort(function (a, b) { return cmpKey(classKey(a), classKey(b)) || pc(a, b); });
      return [first].concat(rest).slice(0, o.maxLines);
    }

    function ruFlag(f) {
      return RU.FLAG[f] || f.replace(/^median-of-(\d+)-lines$/, 'медиана $1 строк').replace(/^median-of-(\d+)$/, 'медиана $1 записей');
    }

    function toLine(l, q) {
      var r = l.rec;
      var tier = TIER_NAME[l.tierRank] || 'similar';
      var rids = uniq(l.recs.map(function (x) { return x.rid; }));
      var line = {
        price: l.price, tier: tier, src: l.isMedian ? 'median' : (l.citeSrc || r.src), name: r.fz || r.name, unit: q.unit, price_date: r.price_date,
        region: r.region, basis: l.isMedian ? 'median' : r.basis, why: l.why || [], flags: l.flags.slice(),
        how: l.how, sim: l.sim, drop: l.drop, stage: l.stage, sfam: l.sfam, raw: { price: r.price, unit: r.unit, factor: l.factor }
      };
      if (rids.length === 1 && !l.isMedian) line.rid = rids[0];
      else line.rids = rids;
      if (l.medianOf) line.flags.push('median-of-' + l.medianOf);
      if (l.published) line.published = l.published;
      // display only: what a relaxed cable line changed, and the range of a wide-spread line
      if (l.changed) line.changed = l.changed.slice();
      if (l.range) line.range = Object.assign({}, l.range);
      if (l.isMedian) {
        line.flags.push('median-of-' + l.medianLines.length + '-lines'); line.tier = TIER_NAME[l.tierRank] || 'similar';
        line.summary = true; line.spread = +l.spreadLines.toFixed(4);
        // the median is a summary of LINES; each component keeps its own price, source, records and evidence
        line.components = l.medianLines.map(function (c) {
          return { price: c.price, src: c.rec.src, rids: uniq(c.recs.map(function (x) { return x.rid; })),
            name: c.rec.fz || c.rec.name, price_date: c.rec.price_date, region: c.rec.region, basis: c.rec.basis, how: c.how,
            sim: c.sim, drop: c.drop, changed: c.changed ? c.changed.slice() : undefined };
        });
      }
      line.label = RU.TIER[line.tier] + (line.flags.length ? ' · ' + line.flags.map(ruFlag).join(', ') : '');
      return line;
    }

    function gather(q) {
      if (!st) throw new Error('S.refs.create: call init() first');
      var sec = q.section;
      if (sec === 'labor') return labour(q);
      if (sec === 'transport') return transport(q);
      return retrieval(q);
    }

    return {
      name: name,
      opts: o,
      init: init,
      gather: gather,
      choose: choose,
      toLine: toLine,
      sourceFamily: function (rec) { return sourceFamily(rec); },
      suggest: function (q) {
        var g = gather(q);
        return choose(g.lines, q).map(function (l, i) { return toLine(l, q, i); });
      }
    };
  }

  R.create = create;
  R.median = median;
  R.normIssuer = normIssuer;
})(S);
