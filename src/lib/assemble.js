/*
 * Assembly: many smeta workbooks -> one continuous "Лист1", with the two extra
 * market columns appended, exactly the way the sheet is built by hand.
 *
 * Target column layout
 *   A  row index helper            G  СУММА (сум)      — smeta,  =E*F
 *   B  N п/п                       H  ЦЕНА ЗА ЕД.      — market
 *   C  НАИМЕНОВАНИЕ                I  СУММА (сум)      — market, =E*H
 *   D  ЕД. ИЗМ.                    J  difference       — =G-I
 *   E  КОЛ-ВО                      K…  source helper columns, copied verbatim
 *   F  ЦЕНА ЗА ЕД.  — smeta        …   market mirrors of those helpers
 */
(function (S) {
  'use strict';

  var C_IDX = 1, C_NO = 2, C_NAME = 3, C_UNIT = 4, C_QTY = 5,
      C_PRICE = 6, C_SUM = 7, C_MPRICE = 8, C_MSUM = 9, C_DIFF = 10, C_EXTRA = 11;

  var H_PRICE = 'ЦЕНА\n ЗА ЕД.';
  var H_SUM = 'СУММА \n(сум)';

  /**
   * Resource identity, and with it the granularity of a price edit.
   *
   * Name + unit + smeta price. One line when the name and the price are the
   * same; separate lines when one name carries different prices, and separate
   * lines when different names happen to share a price — the same rule the
   * comparison table is built on.
   */
  // The separator has to survive HTML escaping: the key is carried on the rows
  // as a data attribute, and esc() strips control characters.
  var SEP = '\u241F';
  function resKey(name, unit, price) {
    return nameUnitKey(name, unit) + SEP + priceKey(price);
  }
  function nameUnitKey(name, unit) {
    return S.nameKey(name) + SEP + S.unitKey(unit);
  }
  /* The same two keys as they were built before the homoglyph repair landed.
     Only a workspace saved by the older page is read through these — see
     Sync.reindex(), which lifts the stored prices onto the live rows. */
  function nameUnitKeyV1(name, unit) {
    return S.nameKeyV1(name) + SEP + S.unitKeyV1(unit);
  }
  function resKeyV1(name, unit, price) {
    return nameUnitKeyV1(name, unit) + SEP + priceKey(price);
  }
  /** Smeta prices carry long binary-float tails; key on the rounded value. */
  function priceKey(p) {
    return String(Math.round((p || 0) * 1e6) / 1e6);
  }

  /** Column map for copying a source row into the assembled sheet. */
  function makeColMap(L, nExtra) {
    var t = {};
    t[L.no] = C_NO; t[L.name] = C_NAME; t[L.unit] = C_UNIT;
    t[L.qty] = C_QTY; t[L.price] = C_PRICE; t[L.sum] = C_SUM;
    return function (c) {
      var m = t[c];
      if (m !== undefined) return m;
      if (c > L.sum) return C_EXTRA + (c - L.sum - 1);
      return c; // columns left of the table proper: keep where they are
    };
  }

  /** Column map turning a smeta-side formula into its market-side twin. */
  function makeMarketMap(nExtra) {
    return function (c) {
      if (c === C_PRICE) return C_MPRICE;
      if (c === C_SUM) return C_MSUM;
      if (c >= C_EXTRA && c < C_EXTRA + nExtra) return c + nExtra;
      return c;
    };
  }

  function copyCells(srcCells, L, colMap, rowDelta, into) {
    for (var c = 1; c < srcCells.length; c++) {
      var cell = srcCells[c];
      if (!cell) continue;
      var tc = colMap(c);
      // Formulas pointing at sheets we do not carry over (VLOOKUP into a price
      // book sheet, say) would export as #REF!, so keep their cached result.
      if (cell.f && cell.f.indexOf('!') < 0) into[tc] = { f: S.formula.translate(cell.f, colMap, rowDelta) };
      else if (cell.v != null && cell.v !== '') into[tc] = { v: cell.v };
    }
  }

  /**
   * @param {Array} projects  [{id, name, title, objects:[parsedSheet], enabled}]
   * @param {Object} prices   resource key -> market unit price
   * @returns {{rows:Array, nExtra:number, resources:Array, projects:Array}}
   */
  function assemble(projects, prices) {
    prices = prices || {};

    var nExtra = 0;
    projects.forEach(function (p) {
      p.objects.forEach(function (o) {
        if (o.enabled === false) return;
        nExtra = Math.max(nExtra, Math.max(0, o.maxCol - o.layout.sum));
      });
    });

    var marketMap = makeMarketMap(nExtra);
    var rows = [];
    var resMap = new Map();
    var out = [];

    function push(row) {
      row.r = rows.length + 1;
      if (!row.cells[C_IDX]) row.cells[C_IDX] = { v: row.r };
      rows.push(row);
      return row;
    }
    function blank(n) { for (var i = 0; i < n; i++) push({ kind: 'blank', cells: {} }); }

    projects.forEach(function (proj, pi) {
      if (proj.enabled === false) return;
      var objs = proj.objects.filter(function (o) { return o.enabled !== false; });
      if (!objs.length) return;
      var span = { project: proj, pi: pi, from: rows.length + 1, to: 0, objects: [] };

      objs.forEach(function (obj, oi) {
        var L = obj.layout;
        var colMap = makeColMap(L, nExtra);

        if (oi === 0) {
          push({ kind: 'title', pi: pi, cells: cellsOf(C_NO, proj.title || obj.title) });
        } else {
          blank(5);
        }
        // Column A runs 1..N across the whole assembled sheet; these are the
        // ranges that used to be written down by hand ("1-3000 Marg'ilon,
        // 3001-6140 Farg'ona").
        var objSpan = { oi: oi, name: obj.subtitle || obj.name, from: rows.length + 1, to: 0 };
        span.objects.push(objSpan);
        push({ kind: 'object', pi: pi, oi: oi, cells: cellsOf(C_NO, obj.subtitle || obj.name) });
        blank(1);

        obj.rows.forEach(function (sr) {
          var cells = {};
          var target = rows.length + 1;
          var delta = target - sr.r;
          copyCells(sr.cells, L, colMap, delta, cells);
          cells[C_IDX] = { v: target };

          var row = {
            kind: sr.kind, pi: pi, oi: oi, section: sr.section,
            src: sr.r, cells: cells, nm: sr.nm, unit: sr.unit
          };

          if (sr.kind === 'header') {
            cells[C_MPRICE] = { v: H_PRICE };
            cells[C_MSUM] = { v: H_SUM };
            if (!cells[C_PRICE]) cells[C_PRICE] = { v: H_PRICE };
            if (!cells[C_SUM]) cells[C_SUM] = { v: H_SUM };
          } else if (sr.kind === 'numbering') {
            cells[C_MPRICE] = { v: 5 };
            cells[C_MSUM] = { v: 6 };
          } else if (sr.kind === 'item') {
            var key = resKey(sr.nm, sr.unit, sr.price == null ? 0 : sr.price);
            var sp = sr.price == null ? 0 : sr.price;
            var mp = prices[key];
            if (mp == null) mp = sp;
            row.key = key; row.qty = sr.qty; row.price = sp; row.market = mp;
            cells[C_PRICE] = { v: sp };
            cells[C_QTY] = { v: sr.qty };
            cells[C_SUM] = { f: '=E' + target + '*F' + target };
            cells[C_MPRICE] = { v: mp };
            cells[C_MSUM] = { f: '=E' + target + '*H' + target };
            cells[C_DIFF] = { f: '=+G' + target + '-I' + target };

            var rec = resMap.get(key);
            if (!rec) {
              rec = {
                key: key, nk: nameUnitKey(sr.nm, sr.unit),
                // cross-project lookup key; absent when match.js is not loaded
                mk: S.matchPair ? S.matchPair(sr.nm, sr.unit) : '',
                name: sr.nm, unit: sr.unit, section: sr.section || '', count: 0, qty: 0,
                price: sp, market: mp, smetaSum: 0, marketSum: 0, projects: {},
                variants: 1, siblings: [sp]
              };
              resMap.set(key, rec);
            }
            if (!rec.section && sr.section) rec.section = sr.section;
            rec.count++;
            rec.qty += sr.qty || 0;
            rec.smetaSum += (sr.qty || 0) * sp;
            rec.marketSum += (sr.qty || 0) * mp;
            rec.projects[proj.id] = true;
          } else if (sr.kind === 'total' || sr.kind === 'extra') {
            // Mirror whatever the smeta side computes onto the market side.
            var g = cells[C_SUM], f = cells[C_PRICE];
            if (g && g.f) cells[C_MSUM] = { f: S.formula.translate(g.f, marketMap, 0) };
            else if (g && g.v != null) cells[C_MSUM] = { v: g.v };
            if (f && f.f) cells[C_MPRICE] = { f: S.formula.translate(f.f, marketMap, 0) };
            else if (f && f.v != null && sr.kind === 'extra') cells[C_MPRICE] = { v: f.v };
            for (var e = 0; e < nExtra; e++) {
              var src = cells[C_EXTRA + e];
              if (!src) continue;
              cells[C_EXTRA + nExtra + e] = src.f
                ? { f: S.formula.translate(src.f, marketMap, 0) } : { v: src.v };
            }
          }
          push(row);
        });

        objSpan.to = rows.length;
      });

      span.to = rows.length;
      out.push(span);
    });

    var resources = Array.from(resMap.values());
    resources.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : a.price - b.price;
    });
    // How many priced variants one name+unit has, so the workspace can point a
    // line at its siblings.
    var byName = new Map();
    resources.forEach(function (r) {
      var g = byName.get(r.nk);
      if (g) g.push(r); else byName.set(r.nk, [r]);
    });
    byName.forEach(function (g) {
      var prices = g.map(function (r) { return r.price; });
      g.forEach(function (r) { r.variants = g.length; r.siblings = prices; });
    });

    var model = { rows: rows, nExtra: nExtra, resources: resources, spans: out, cols: {
      IDX: C_IDX, NO: C_NO, NAME: C_NAME, UNIT: C_UNIT, QTY: C_QTY,
      PRICE: C_PRICE, SUM: C_SUM, MPRICE: C_MPRICE, MSUM: C_MSUM, DIFF: C_DIFF, EXTRA: C_EXTRA
    } };
    spanStats(model);
    return model;
  }

  /**
   * Per-project and per-object row counts and money, keyed off the column A
   * ranges. Recomputed after every price change so the index always agrees with
   * what the sheet says.
   */
  function spanStats(model) {
    var owner = [];
    model.spans.forEach(function (s) {
      s.items = 0; s.smetaSum = 0; s.marketSum = 0;
      s.objects.forEach(function (o) {
        o.items = 0; o.smetaSum = 0; o.marketSum = 0;
        for (var r = o.from; r <= o.to; r++) owner[r] = o;
      });
    });
    model.spans.forEach(function (s) {
      for (var i = s.from - 1; i < s.to; i++) {
        var row = model.rows[i];
        if (!row || row.kind !== 'item') continue;
        var sm = (row.qty || 0) * row.price, mk = (row.qty || 0) * row.market;
        s.items++; s.smetaSum += sm; s.marketSum += mk;
        var o = owner[row.r];
        if (o) { o.items++; o.smetaSum += sm; o.marketSum += mk; }
      }
    });
    return model;
  }

  function cellsOf(col, v) { var o = {}; o[col] = { v: v }; return o; }

  /** Re-apply the price book to an already assembled model, in place. */
  function applyPrices(model, prices) {
    var rows = model.rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.kind !== 'item') continue;
      var mp = prices[row.key];
      if (mp == null) mp = row.price;
      row.market = mp;
      row.cells[C_MPRICE] = { v: mp };
    }
    model.resources.forEach(function (rec) {
      var mp = prices[rec.key];
      rec.market = mp == null ? rec.price : mp;
    });
    recomputeResourceSums(model);
    spanStats(model);
  }

  function recomputeResourceSums(model) {
    var by = new Map();
    model.resources.forEach(function (r) { r.qty = 0; r.count = 0; r.smetaSum = 0; r.marketSum = 0; by.set(r.key, r); });
    model.rows.forEach(function (row) {
      if (row.kind !== 'item') return;
      var r = by.get(row.key);
      if (!r) return;
      r.count++;
      r.qty += row.qty || 0;
      r.smetaSum += (row.qty || 0) * row.price;
      r.marketSum += (row.qty || 0) * row.market;
    });
  }

  S.assemble = assemble;
  S.applyPrices = applyPrices;
  S.spanStats = spanStats;
  S.resKey = resKey;
  S.nameUnitKey = nameUnitKey;
  S.resKeyV1 = resKeyV1;
  S.nameUnitKeyV1 = nameUnitKeyV1;
  S.marketColMap = makeMarketMap;
})(S);
