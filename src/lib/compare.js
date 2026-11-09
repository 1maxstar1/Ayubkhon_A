/*
 * Version comparison: the smeta as it first came in, the smeta the sender returned after our
 * comparison table, and what that table asked for. Which lines were fixed, which were not,
 * and what changed that nobody asked about.
 *
 *   S.compare.versions(oldObjects, newObjects, requested) → result
 *     oldObjects / newObjects   parsed sheets (S.smeta.parseWorkbook) of the two versions
 *     requested                 resource key (S.resKey of the OLD line) → { market, note }:
 *                               the price our table gave, or only a note (equipment)
 *     known                     key → market price we set but the table did not carry (below its
 *                               threshold): shown for reference, never judged as a request
 *   S.compare.workbook(result, opts) → Uint8Array   the comparison as a styled .xlsx
 *
 * Lines are paired inside each sheet by name + unit, in order (longest common subsequence),
 * so a line inserted or deleted by the sender shows as added / removed and does not shift
 * the pairing of the lines after it. Sheets are paired by their name, else by position.
 */
(function (S) {
  'use strict';

  /* ------------------------------------------------------------ statuses */

  // tone: good (green), bad (red), part (amber), info (grey), '' (unchanged)
  var STATUS = {
    fixed:    { tone: 'good', label: 'Исправлено',            rank: 3 },
    lowered:  { tone: 'good', label: 'Снижено без замечания', rank: 2 },
    qtydown:  { tone: 'good', label: 'Объём уменьшен',        rank: 2 },
    partial:  { tone: 'part', label: 'Исправлено частично',   rank: 6 },
    notfixed: { tone: 'bad',  label: 'Не исправлено',         rank: 9 },
    worse:    { tone: 'bad',  label: 'Цена повышена вопреки замечанию', rank: 10 },
    raised:   { tone: 'bad',  label: 'Цена повышена',         rank: 8 },
    qtyup:    { tone: 'bad',  label: 'Объём увеличен',        rank: 7 },
    added:    { tone: 'bad',  label: 'Новая строка',          rank: 7 },
    removed:  { tone: 'part', label: 'Строка удалена',        rank: 5 },
    note:     { tone: 'info', label: 'Замечание (без цены)',  rank: 4 },
    same:     { tone: '',     label: 'Без изменений',         rank: 0 }
  };

  /** Two smeta prices are the same price when they differ by rounding only: 0.1 %, at most one sum. */
  function samePrice(a, b) {
    var x = a || 0, y = b || 0;
    return Math.abs(x - y) < Math.min(1, Math.max(1e-6, Math.abs(x) * 1e-3));
  }
  /** The price we asked for counts as reached within 0.1 % (or one sum). */
  function reached(p, market) { return p <= market || Math.abs(p - market) <= Math.max(1, market * 0.001); }
  function sameQty(a, b) { var x = a || 0, y = b || 0; return Math.abs(x - y) <= Math.max(1e-9, Math.abs(x) * 1e-9); }

  /**
   * One pair of lines. `a` old, `b` new (either may be missing); `req` our request for the old line.
   * The price status comes first; a quantity change is reported when the price says nothing.
   */
  function classify(a, b, req) {
    if (a && !b) return 'removed';
    if (!a && b) return 'added';
    var p1 = a.price || 0, p2 = b.price || 0;
    var qtyUp = !sameQty(a.qty, b.qty) && (b.qty || 0) > (a.qty || 0);
    var qtyDown = !sameQty(a.qty, b.qty) && !qtyUp;
    if (req && req.market != null && !samePrice(req.market, p1)) {
      var m = req.market;
      if (m < p1) {                                    // we asked for a lower price
        if (reached(p2, m)) return qtyUp ? 'qtyup' : 'fixed';
        if (p2 < p1 && !samePrice(p2, p1)) return 'partial';
        if (p2 > p1 && !samePrice(p2, p1)) return 'worse';
        return 'notfixed';
      }
      // we asked for a higher price (rare: the smeta was below the market)
      if (samePrice(p2, m) || (p2 > p1 && p2 <= m)) return qtyUp ? 'qtyup' : 'fixed';
      if (samePrice(p2, p1)) return 'notfixed';
      return p2 < p1 ? 'lowered' : 'raised';
    }
    if (!samePrice(p1, p2)) return p2 < p1 ? 'lowered' : 'raised';
    if (qtyUp) return 'qtyup';
    if (qtyDown) return 'qtydown';
    if (req && req.note) return 'note';
    return 'same';
  }

  /* ------------------------------------------------------------- pairing */

  function itemsOf(obj) {
    return (obj && obj.rows || []).filter(function (r) { return r.kind === 'item'; });
  }
  function nuKey(r) { return S.nameUnitKey(r.nm || '', r.unit || ''); }

  /** Longest common subsequence over name + unit: [[i, j]] with -1 for an unpaired side. */
  function align(A, B) {
    var n = A.length, m = B.length, ka = A.map(nuKey), kb = B.map(nuKey);
    // fast path: same length and the same keys in the same places
    if (n === m) {
      var same = true;
      for (var s = 0; s < n && same; s++) same = ka[s] === kb[s];
      if (same) return ka.map(function (_, i) { return [i, i]; });
    }
    var W = m + 1, L = new Int32Array((n + 1) * W);
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        L[i * W + j] = ka[i] === kb[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      }
    }
    var out = [], x = 0, y = 0;
    while (x < n && y < m) {
      if (ka[x] === kb[y]) { out.push([x, y]); x++; y++; }
      else if (L[(x + 1) * W + y] >= L[x * W + y + 1]) { out.push([x, -1]); x++; }
      else { out.push([-1, y]); y++; }
    }
    for (; x < n; x++) out.push([x, -1]);
    for (; y < m; y++) out.push([-1, y]);
    return out;
  }

  function objName(o) { return S.nameKey(o.subtitle || o.name || ''); }

  /** Sheets: by name when the names tell them apart, otherwise by position. */
  function pairObjects(olds, news) {
    var used = {}, pairs = [];
    var byName = {};
    news.forEach(function (o, j) { var k = objName(o); (byName[k] = byName[k] || []).push(j); });
    olds.forEach(function (o, i) {
      var cand = (byName[objName(o)] || []).filter(function (j) { return !used[j]; });
      var j = cand.length ? cand[0] : (i < news.length && !used[i] ? i : -1);
      if (j >= 0) used[j] = true;
      pairs.push([i, j]);
    });
    news.forEach(function (o, j) { if (!used[j]) pairs.push([-1, j]); });
    return pairs;
  }

  /* -------------------------------------------------------------- result */

  function versions(olds, news, requested, known) {
    requested = requested || {};
    known = known || {};
    var objects = [], groups = new Map();
    var T = { oldSum: 0, newSum: 0, askedSaving: 0, gotSaving: 0, otherChange: 0, rows: 0, changedRows: 0, leftRows: 0, counts: {} };
    Object.keys(STATUS).forEach(function (k) { T.counts[k] = 0; });

    pairObjects(olds, news).forEach(function (op) {
      var oa = op[0] >= 0 ? olds[op[0]] : null, ob = op[1] >= 0 ? news[op[1]] : null;
      var A = itemsOf(oa), B = itemsOf(ob);
      var o = { name: (oa || ob).subtitle || (oa || ob).name || '', oldName: oa ? oa.subtitle || oa.name : '',
                newName: ob ? ob.subtitle || ob.name : '', rows: [], oldSum: 0, newSum: 0, bad: 0, good: 0 };
      align(A, B).forEach(function (pr) {
        var a = pr[0] >= 0 ? A[pr[0]] : null, b = pr[1] >= 0 ? B[pr[1]] : null;
        var key = a ? S.resKey(a.nm || '', a.unit || '', a.price) : S.resKey(b.nm || '', b.unit || '', b.price);
        var req = a ? requested[key] : null;
        var st = classify(a, b, req);
        var s1 = a ? (a.qty || 0) * (a.price || 0) : 0, s2 = b ? (b.qty || 0) * (b.price || 0) : 0;
        var row = { st: st, key: key, nm: (a || b).nm || '', unit: (a || b).unit || '', section: (a || b).section || '',
                    no: (b || a).noTxt || '', oldNo: a ? a.noTxt || '' : '', newNo: b ? b.noTxt || '' : '',
                    q1: a ? a.qty || 0 : null, q2: b ? b.qty || 0 : null,
                    p1: a ? a.price || 0 : null, p2: b ? b.price || 0 : null,
                    market: req && req.market != null ? req.market : null, note: req && req.note || '',
                    ours: !req && a && known[key] != null ? known[key] : null,
                    s1: s1, s2: s2, object: o.name };
        o.rows.push(row);
        o.oldSum += s1; o.newSum += s2;
        T.oldSum += s1; T.newSum += s2; T.rows++;
        T.counts[st]++;
        if (st !== 'same') T.changedRows++;
        if (st === 'notfixed' || st === 'worse') T.leftRows++;
        var tone = STATUS[st].tone;
        if (tone === 'bad' || tone === 'part') o.bad++;
        if (tone === 'good') o.good++;
        if (row.market != null && a && row.market < row.p1) {
          T.askedSaving += (a.qty || 0) * (row.p1 - row.market);
          T.gotSaving += s1 - s2;
        } else T.otherChange += s2 - s1;

        var g = groups.get(key);
        if (!g) {
          g = { key: key, nm: row.nm, unit: row.unit, section: row.section, p1: row.p1, market: row.market, note: row.note, ours: row.ours,
                p2: [], rows: 0, counts: {}, s1: 0, s2: 0, objects: [] };
          groups.set(key, g);
        }
        g.rows++;
        g.counts[st] = (g.counts[st] || 0) + 1;
        g.s1 += s1; g.s2 += s2;
        if (row.p2 != null && !g.p2.some(function (p) { return samePrice(p, row.p2); })) g.p2.push(row.p2);
        if (g.objects.indexOf(o.name) < 0) g.objects.push(o.name);
      });
      objects.push(o);
    });

    var resources = [];
    groups.forEach(function (g) { g.st = groupStatus(g); resources.push(g); });
    resources.sort(function (x, y) {
      return STATUS[y.st].rank - STATUS[x.st].rank || Math.abs(y.s1 - y.s2) - Math.abs(x.s1 - x.s2);
    });
    T.resCounts = {};
    Object.keys(STATUS).forEach(function (k) { T.resCounts[k] = 0; });
    resources.forEach(function (g) { T.resCounts[g.st]++; });
    return { objects: objects, resources: resources, totals: T };
  }

  /**
   * A resource on several lines: fixed everywhere is fixed; fixed on some lines and left on
   * others is partial — the lines left are listed, which is what has to go back to the sender.
   */
  function groupStatus(g) {
    var ks = Object.keys(g.counts);
    if (ks.length === 1) return ks[0];
    var c = g.counts;
    if (c.worse) return 'worse';
    if ((c.fixed || c.partial) && (c.notfixed || c.partial)) return 'partial';
    var best = ks[0];
    ks.forEach(function (k) { if (STATUS[k].rank > STATUS[best].rank) best = k; });
    return best;
  }

  /* ------------------------------------------------------------- workbook */

  var FILL = { good: 'FFC6EFCE', bad: 'FFFFC7CE', part: 'FFFFEB9C', info: 'FFEDEDED', head: 'FFCCFFFF' };
  var F = { sz: 10 }, FB = { sz: 10, b: true };

  function workbook(res, opts) {
    opts = opts || {};
    var styles = new S.Styles();
    var sheets = [];

    function st(kind, tone, fmt, h) {
      return styles.xf({ font: kind === 'head' || kind === 'title' ? FB : F, fill: kind === 'head' ? FILL.head : FILL[tone] || null,
        border: kind === 'title' || kind === 'plain' ? '' : 'lrtb', fmt: fmt || null, h: h || (kind === 'head' ? 'center' : null),
        v: 'center', wrap: kind !== 'title' });
    }
    function sheet(name, head, widths, body, title) {
      var rows = [], r = 1;
      title.forEach(function (t) { rows.push({ r: r++, ht: 18, cells: [{ c: 1, s: st('title'), v: t }] }); });
      rows.push({ r: r++, cells: [] });
      var hr = r;
      rows.push({ r: r++, ht: 38, cells: head.map(function (h, i) { return { c: i + 1, s: st('head'), v: h }; }) });
      body.forEach(function (b) {
        rows.push({ r: r++, cells: b.cells.map(function (v, i) {
          var fmt = typeof v === 'number' ? (b.fmt && b.fmt[i]) || '#,##0' : null;
          return { c: i + 1, s: st('cell', b.tone, fmt, typeof v === 'number' ? 'right' : null), v: v == null ? '' : v };
        }) });
      });
      sheets.push({ name: name, rows: rows, cols: widths.map(function (w, i) { return { min: i + 1, max: i + 1, width: w }; }),
        freeze: hr, autoFilter: 'A' + hr + ':' + S.col(head.length) + (r - 1),
        pageSetup: { scale: 75, orientation: 'landscape' }, printTitles: '$' + hr + ':$' + hr });
    }

    var T = res.totals;
    var title = [opts.title || 'Сравнение версий сметы', (opts.oldLabel ? 'Было: ' + opts.oldLabel : '') +
      (opts.newLabel ? '   ·   Стало: ' + opts.newLabel : ''),
      'Сумма было ' + S.money(T.oldSum) + ' · стало ' + S.money(T.newSum) + ' · разница ' + S.money(T.newSum - T.oldSum) +
      '   ·   снижение по замечаниям: запрошено ' + S.money(T.askedSaving) + ', получено ' + S.money(T.gotSaving)];

    sheet('По ресурсам',
      ['№', 'Наименование', 'Ед. изм.', 'Цена в первой смете', 'Наша цена (замечание)', 'Цена в исправленной смете',
        'Строк', 'Сумма было', 'Сумма стало', 'Разница', 'Статус', 'Листы'],
      [5, 55, 8, 13, 13, 16, 7, 15, 15, 15, 26, 40],
      res.resources.filter(function (g) { return g.st !== 'same'; }).map(function (g, i) {
        return { tone: STATUS[g.st].tone, cells: [i + 1, g.nm, g.unit, g.p1, g.market != null ? g.market : g.note ? 'примечание' :
          g.ours != null ? S.price(g.ours) + ' (не в таблице)' : '',
          g.p2.length === 1 ? g.p2[0] : g.p2.map(function (p) { return S.price(p); }).join(' / '), g.rows,
          g.s1, g.s2, g.s2 - g.s1, statusText(g), g.objects.join('; ')] };
      }), title);

    var lines = [];
    res.objects.forEach(function (o) {
      o.rows.forEach(function (x) {
        if (x.st === 'same') return;
        lines.push({ tone: STATUS[x.st].tone, fmt: { 5: '0.000', 6: '0.000' }, cells: [x.object, x.no, x.nm, x.unit,
          x.q1, x.q2, x.p1, x.market != null ? x.market : x.ours != null ? S.price(x.ours) + ' (не в таблице)' : null,
          x.p2, x.s1, x.s2, x.s2 - x.s1, STATUS[x.st].label] });
      });
    });
    sheet('По строкам',
      ['Лист', '№', 'Наименование', 'Ед. изм.', 'Кол-во было', 'Кол-во стало', 'Цена было', 'Наша цена', 'Цена стало',
        'Сумма было', 'Сумма стало', 'Разница', 'Статус'],
      [24, 6, 55, 8, 11, 11, 13, 13, 13, 15, 15, 15, 26], lines, title);

    return S.writeWorkbook({ sheets: sheets, styles: styles, title: title[0] });
  }

  function statusText(g) {
    var t = STATUS[g.st].label;
    if (g.rows > 1 && Object.keys(g.counts).length > 1) {
      t += ' (' + Object.keys(g.counts).map(function (k) { return STATUS[k].label.toLowerCase() + ': ' + g.counts[k]; }).join(', ') + ')';
    }
    return t;
  }

  /**
   * What our comparison table asked for, read off the report the way it is exported (same mode,
   * same threshold): a changed price, or the equipment note on an unchanged one. Lines the
   * threshold left out of the table were never asked about.
   */
  function requested(model, opts) {
    var out = {};
    if (!model) return out;
    var NOTE = S.report.cols.NOTE;
    model.spans.forEach(function (span) {
      S.report.build(model, span, opts || {}).rows.forEach(function (r) {
        if (r.kind !== 'item' || !r.key) return;
        if (r.market != null && !samePrice(r.market, r.price)) out[r.key] = { market: r.market };
        else if (r.cells && r.cells[NOTE] && r.cells[NOTE].v && !out[r.key]) out[r.key] = { note: String(r.cells[NOTE].v) };
      });
    });
    return out;
  }

  S.compare = { versions: versions, workbook: workbook, requested: requested, classify: classify, align: align,
                STATUS: STATUS, statusText: statusText };
})(S);
