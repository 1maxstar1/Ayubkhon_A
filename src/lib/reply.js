/*
 * «Наш ответ»: the comparison table we sent, read back from a spreadsheet — our own export
 * (the TAQQOSLASH JADVALI №2 sheet of 321.xlsx) or any table with the columns name, unit,
 * smeta price, market price and note (a PDF of an older reply, turned into Excel). Its prices
 * are put on the smeta they were written for, and its lines are what the comparison of
 * versions judges as asked.
 *
 *   S.reply.parse(wb)              → { entries: [{ no, name, unit, price, market, note }], sheet, cols }
 *   S.reply.match(entries, objects) → { prices: key → market, requested: key → { market | note },
 *                                       found: [{ entry, keys }], missing: [entry] }
 */
(function (S) {
  'use strict';

  /** What a header cell names. First match wins, in this order: «Loyiha smeta … birligi» is a price, not a unit. */
  var ROLES = [
    ['note', /ESLATMA|ПРИМЕЧ|IZOH|ИЗОХ|NOTE/],
    ['market', /BOZOR|РЫН|MARKET/],
    ['price', /LOYIHA|СМЕТ|SMETA/],
    ['name', /NOMI|НАИМЕН|NAME/],
    ['unit', /O.?LCHOV|ЕД\.?\s*ИЗМ|^ЕД\.?$|UNIT|BIRLIK/],
    ['no', /^№|^N(\s|$)|T\/R|П\/П/]
  ];
  var SKIP = /СУММ|SUMMA|ОБЩАЯ|JAMI|РАЗН|FARQ|КОЛ-?ВО|MIQDOR/;

  function text(c) { return c && c.v != null ? String(c.v) : ''; }
  function key(s) { return S.nameKey(s).replace(/[ʻʼ‘’`´]/g, "'"); }

  /** The header row: the first row (in the first 40) that names a name column and a market price column. */
  function header(rows) {
    for (var r = 1; r < Math.min(rows.length, 41); r++) {
      var cells = rows[r] || [], cols = {};
      for (var c = 1; c < cells.length; c++) {
        var t = key(text(cells[c]));
        if (!t) continue;
        for (var k = 0; k < ROLES.length; k++) {
          var role = ROLES[k][0];
          if (cols[role] || !ROLES[k][1].test(t)) continue;
          if ((role === 'market' || role === 'price') && SKIP.test(t)) continue;
          cols[role] = c;
          break;
        }
      }
      if (cols.name && cols.market) return { row: r, cols: cols };
    }
    return null;
  }

  function parse(wb) {
    for (var s = 0; s < wb.sheets.length; s++) {
      var rows = wb.sheets[s].rows || [];
      var h = header(rows);
      if (!h) continue;
      var C = h.cols, out = [];
      for (var r = h.row + 1; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        var name = text(row[C.name]).replace(/\s+/g, ' ').trim();
        var market = S.num(text(row[C.market]));
        if (!name || market == null || /^\d+$/.test(name)) continue;   // section, total and numbering rows
        out.push({
          no: C.no ? text(row[C.no]).trim() : '',
          name: name,
          unit: C.unit ? text(row[C.unit]).trim() : '',
          price: C.price ? S.num(text(row[C.price])) : null,
          market: market,
          note: C.note ? text(row[C.note]).trim() : ''
        });
      }
      if (out.length) return { entries: out, sheet: wb.sheets[s].name, cols: C };
    }
    return { entries: [], sheet: null, cols: null };
  }

  /* -------------------------------------------------------------- matching */

  /** Prices printed in a table are rounded to the sum: «12 346» stands for the smeta's 12 345,6789. */
  function samePrice(a, b) { return Math.abs(a - b) <= Math.max(1, Math.abs(a) * 1e-3); }
  /** Our market price equals the smeta price up to its rounding: 0.1 %, at most one sum (as in S.compare). */
  function unchanged(p, m) { return Math.abs(p - m) < Math.min(1, Math.max(1e-6, Math.abs(p) * 1e-3)); }
  function bare(s) { return S.nameKey(s).replace(/[\s.,;:()"'«»-]+/g, ''); }

  /**
   * Each line of the reply to the smeta's resources: name and unit, and the smeta price when the
   * table gives one. A name broken over lines («2-» / «3,75 М») is matched without its spaces and
   * punctuation; failing that, the closest name of the same unit and price (similarity ≥ 0.9).
   */
  function match(entries, objects) {
    var res = new Map();
    objects.forEach(function (o) {
      (o.rows || []).forEach(function (r) {
        if (r.kind !== 'item') return;
        var k = S.resKey(r.nm || '', r.unit || '', r.price == null ? 0 : r.price);
        if (!res.has(k)) res.set(k, { key: k, nm: r.nm || '', nk: S.nameKey(r.nm || ''), bk: bare(r.nm || ''),
                                       uk: S.unitKey(r.unit || ''), price: r.price || 0 });
      });
    });
    var all = Array.from(res.values());
    var out = { prices: {}, requested: {}, found: [], missing: [] };
    entries.forEach(function (e) {
      var uk = S.unitKey(e.unit || ''), nk = S.nameKey(e.name), bk = bare(e.name);
      var fits = function (x) { return (!uk || x.uk === uk) && (e.price == null || samePrice(x.price, e.price)); };
      var hit = all.filter(function (x) { return x.nk === nk && fits(x); });
      if (!hit.length) hit = all.filter(function (x) { return x.bk === bk && fits(x); });
      if (!hit.length && e.price != null) {
        var best = null, bs = 0.9;
        all.forEach(function (x) {
          if (!fits(x)) return;
          var sim = S.charSimilarity(x.nm, e.name);
          if (sim >= bs) { bs = sim; best = x; }
        });
        if (best) hit = [best];
      }
      if (!hit.length) { out.missing.push(e); return; }
      hit.forEach(function (x) {
        if (!unchanged(x.price, e.market)) {                // a price we changed (our figure, exact)
          out.prices[x.key] = e.market;
          out.requested[x.key] = { market: e.market };
        } else if (e.note) out.requested[x.key] = { note: e.note };
      });
      out.found.push({ entry: e, keys: hit.map(function (x) { return x.key; }) });
    });
    return out;
  }

  S.reply = { parse: parse, match: match };
})(S);
