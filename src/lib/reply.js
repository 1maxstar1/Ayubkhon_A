/*
 * «Наш ответ»: the comparison table we sent, read back from a spreadsheet — our own export
 * (the TAQQOSLASH JADVALI №2 sheet of 321.xlsx) or any table with the columns name, unit,
 * smeta price, market price and note (a PDF of an older reply, turned into Excel). Its prices
 * are put on the smeta they were written for, and its lines are what the comparison of
 * versions judges as asked.
 *
 *   S.reply.parse(wb)              → { entries: [{ no, name, unit, price, market, note, sheet }] (market null: a line
 *                                       answered with a note and no price — «-», «обоснов», or the note alone),
 *                                       unread: [{ no, name, text, sheet }], sheets: [name],
 *                                       sheet, cols (of the first sheet read), hasPrice }
 *   S.reply.match(entries, objects) → { prices: key → market, requested: key → { market | note },
 *                                       found: [{ entry, keys }], missing: [entry],
 *                                       ambiguous: [{ entry, units }], conflicts: [{ entry, key, kept }] }
 *
 * Every sheet with such a table is read (our export has one report sheet per project). A price
 * that cannot be read as a number («7 500 сум») is listed in `unread`, never dropped silently.
 */
(function (S) {
  'use strict';

  /** What a header cell names. First match wins, in this order: «Loyiha smeta … birligi» is a price, not a unit. */
  var ROLES = [
    ['note', /ESLATMA|ПРИМЕЧ|IZOH|ИЗОХ|NOTE/],
    ['market', /BOZOR|РЫН|MARKET/],
    ['price', /LOYIHA|СМЕТ|SMETA/],
    ['name', /NOMI|НАИМЕН|NAME/],
    // «Цены по ПСД» (the price of the project documentation): the smeta's own price under another name. Read apart from
    // `price` — a line is not tied to it — and used only to confirm a name written differently («АВТОГРЕЙДЕРЫ … 99 КВТ
    // /135 Л.С/» is the smeta's «Автогрейдеры … 99 (135) кВт (л.с.)» when the price agrees). A price that says ПСД, or
    // ПСД alone (the lower row of a two-row header: «Цена» above «по ПСД | рыночная»), after the name: «Наименование
    // ресурсов по ПСД» is the name, «Кол-во по ПСД» or «Ед.изм. по ПСД» no price at all
    ['psd', /(ЦЕН|СТОИМ|НАРХ|NARX|PRICE).*(ПСД|PSD)|(ПСД|PSD).*(ЦЕН|СТОИМ|НАРХ|NARX|PRICE)|^((ПО|PO) )?(ПСД|PSD)$/],
    ['unit', /O.?LCHOV|ЕД\.?\s*ИЗМ|^ЕД\.?$|UNIT|BIRLIK/],
    ['no', /^№|^N(\s|$)|T\/R|П\/П/]
  ];
  var SKIP = /СУММ|SUMMA|ОБЩАЯ|JAMI|РАЗН|FARQ|КОЛ-?ВО|MIQDOR/;
  // A cell of dashes only: the hyphen-minus and the dashes Excel writes for it - U+2010, U+2011, U+2013 (en dash),
  // U+2014 (em dash), U+2212 (the minus sign) - with spaces between them. Built from the codes: by eye most of them
  // cannot be told from a hyphen, and typed into the source they would not be seen to be there
  var DASHES = new RegExp('^[-' + String.fromCharCode(0x2010, 0x2011, 0x2013, 0x2014, 0x2212) + ' ]+$');
  // a name that already says it is haulage (the reader's own prefix, or the estimator's word): see match()
  var HAUL_NAME = /^(ПЕРЕВОЗК|ДОСТАВК|ТРАНСПОРТИРОВК|ТАШИШ|TASHISH)/;

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
          if ((role === 'market' || role === 'price' || role === 'psd') && SKIP.test(t)) continue;
          cols[role] = c;
          break;
        }
      }
      if (cols.name && cols.market) return { row: r, cols: cols };
    }
    return null;
  }

  function role(name) { for (var k = 0; k < ROLES.length; k++) if (ROLES[k][0] === name) return ROLES[k][1]; return null; }
  var NAME = role('name'), MARKET = role('market'), PRICE = role('price');

  function parse(wb) {
    var entries = [], unread = [], sheets = [], first = null, hasPrice = false;
    for (var s = 0; s < wb.sheets.length; s++) {
      var rows = wb.sheets[s].rows || [], sh = wb.sheets[s].name;
      var h = header(rows);
      if (!h) continue;
      var C = h.cols, n = 0;
      for (var r = h.row + 1; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        var name = text(row[C.name]).replace(/\s+/g, ' ').trim();
        var mt = text(row[C.market]).replace(/\s+/g, ' ').trim(), market = S.num(mt);
        if (!name || /^\d+$/.test(name)) continue;                     // numbering rows
        var no = C.no ? text(row[C.no]).trim() : '';
        var unit = C.unit ? text(row[C.unit]).trim() : '', note = C.note ? text(row[C.note]).replace(/\s+/g, ' ').trim() : '';
        // a percentage («Прочие затраты подрядчика | % | 17») is no resource: there is nothing in the smeta to put it on
        if (unit === '%') continue;
        var psd = C.psd ? S.num(text(row[C.psd])) : null;
        if (market == null) {
          // a header row repeated (our export's second, bilingual one): nothing
          if (mt && (NAME.test(key(name)) || MARKET.test(key(mt)) || PRICE.test(key(mt)))) continue;
          // a resource line we answered without a price of our own — «-», «обоснов», or the note alone («Стоимость
          // ресурса должна быть обоснована…»): asked all the same, a note and no price (it used to be dropped, or
          // listed as a price that could not be read). A dash with no note is that too (any dash Excel writes, the
          // minus sign included - DASHES): nothing in it is a price. A cell with figures in it («7 500 сум») is a price
          // we wrote: that one is listed as not read, as before
          if (unit && !/\d/.test(mt) && (note || /[A-Za-zА-Яа-яЁё]/.test(mt) || DASHES.test(mt))) {
            var said = /[A-Za-zА-Яа-яЁё]/.test(mt) && key(mt) !== key(note) ? mt + (note ? ' — ' + note : '') : note || mt;
            entries.push({ no: no, name: name, unit: unit, price: C.price ? S.num(text(row[C.price])) : null, psd: psd, market: null, note: said, sheet: sh });
            n++;
            continue;
          }
          // a price written but not a number
          if (mt) unread.push({ no: no, name: name, text: mt, sheet: sh });
          continue;                                                    // section and total rows: no price
        }
        entries.push({
          no: no,
          name: name,
          unit: unit,
          price: C.price ? S.num(text(row[C.price])) : null,
          psd: psd,
          market: market,
          note: note,
          sheet: sh
        });
        n++;
      }
      if (!n) continue;
      sheets.push(sh);
      if (!first) first = { sheet: sh, cols: C };
      if (C.price) hasPrice = true;
    }
    return { entries: entries, unread: unread, sheets: sheets, sheet: first ? first.sheet : null,
             cols: first ? first.cols : null, hasPrice: hasPrice };
  }

  /* -------------------------------------------------------------- matching */

  /** Prices printed in a table are rounded to the sum: «12 346» stands for the smeta's 12 345,6789. */
  function samePrice(a, b) { return Math.abs(a - b) <= Math.max(1, Math.abs(a) * 1e-3); }
  /** Our market price equals the smeta price up to its rounding: 0.1 %, at most one sum (as in S.compare). */
  // our own figure against the estimate's, exactly as the report puts a line in the table: less than a sum per unit
  // on a large quantity is a price we asked for
  function unchanged(p, m) { return S.near(p, m); }
  function bare(s) { return S.nameKey(s).replace(/[\s.,;:()"'«»-]+/g, ''); }
  /** The unit as the smeta and the reply both mean it: «ЧЕЛ-ЧАС» is «чел.-ч», «МАШ-ЧАС» is «маш.-ч». Here, and not in
   *  S.unitKey (src/lib/match.js is measured: a change there is one of the similarity's, made with its numbers). */
  function unitOf(u) { return S.unitKey(u || '').replace(/^(ЧЕЛ|МАШ)ЧАС$/, '$1Ч'); }

  /**
   * Each line of the reply to the smeta's resources: name and unit, and the smeta price when the
   * table gives one. A name broken over lines («2-» / «3,75 М») is matched without its spaces and
   * punctuation, unless that joins numbers apart («ТРУБА 1 20» is not ТРУБА 120, «4.11» not
   * 4.1.1); failing that, the closest name of the same unit and the same smeta price (similarity ≥ 0.9
   * by the table's own price column, ≥ 0.8 by its «Цены по ПСД»; with no rival as close) with the same numbers — АНКЕР М8
   * never lands on АНКЕР М5. A line with no unit, whose name the smeta has
   * in several units, prices none of them (`ambiguous`). A resource priced again by a later line
   * at another price keeps the first (`conflicts`).
   */
  function match(entries, objects) {
    var res = new Map();
    objects.forEach(function (o) {
      (o.rows || []).forEach(function (r) {
        if (r.kind !== 'item') return;
        var k = S.resKey(r.nm || '', r.unit || '', r.price == null ? 0 : r.price);
        if (!res.has(k)) res.set(k, { key: k, nm: r.nm || '', nk: S.nameKey(r.nm || ''), bk: bare(r.nm || ''),
                                       uk: unitOf(r.unit || ''), unit: r.unit || '', price: r.price || 0 });
      });
    });
    var all = Array.from(res.values());
    var out = { prices: {}, requested: {}, found: [], missing: [], ambiguous: [], conflicts: [] };
    var given = {};                                         // key → the market price its first line gave
    entries.forEach(function (e) {
      var uk = unitOf(e.unit || ''), nk = S.nameKey(e.name), bk = bare(e.name);
      var fits = function (x) { return (!uk || x.uk === uk) && (e.price == null || samePrice(x.price, e.price)); };
      var hit = all.filter(function (x) { return x.nk === nk && fits(x); });
      if (!hit.length) {
        hit = all.filter(function (x) { return x.bk === bk && fits(x) && S.numberRelation(x.nm, e.name) !== 'conflict'; });
      }
      // a haulage line named as the sheet names it («Асфальт - 11 км»): the reader calls a line under a haulage band
      // «Перевозка …» (the same name under «Материалы» is the material), and the table, made from the sheet, does not
      if (!hit.length && !HAUL_NAME.test(nk)) {
        var hk = S.nameKey('ПЕРЕВОЗКА ' + e.name), hb = bare('ПЕРЕВОЗКА ' + e.name);
        hit = all.filter(function (x) { return x.nk === hk && fits(x); });
        if (!hit.length) hit = all.filter(function (x) { return x.bk === hb && fits(x) && S.numberRelation(x.nm, e.name) !== 'conflict'; });
      }
      // a name written differently: the closest one of the same unit, the same numbers and the same smeta price — the
      // table's own column (similarity ≥ 0.9), or its «Цены по ПСД» (≥ 0.8: «… 99 КВТ /135 Л.С/» is 0.83, and no table
      // tied by its own price needed less than 0.9). Counted by name: one resource at two prices that differ by rounding
      // is one name, priced on all its keys like an exact name (and `ambiguous` below when it has several units). Another
      // name as close, or below 0.9 any other name at all, and the line does not say which resource it is: none (listed
      // as not found, never put on a guess)
      var ref = e.price != null ? e.price : e.psd;
      if (!hit.length && ref != null) {
        var min = e.price != null ? 0.9 : 0.8, byName = {}, names = [];
        all.forEach(function (x) {
          if ((uk && x.uk !== uk) || !samePrice(x.price, ref) || !S.sameNumbers(x.nm, e.name)) return;
          var sim = S.charSimilarity(x.nm, e.name);
          if (sim < min) return;
          var g = byName[x.nk];
          if (!g) { g = byName[x.nk] = { sim: 0, xs: [] }; names.push(g); }
          g.xs.push(x);
          if (sim > g.sim) g.sim = sim;
        });
        names.sort(function (a, b) { return b.sim - a.sim; });
        var rival = names.length > 1 ? names[1].sim : 0;
        if (names.length && rival < names[0].sim && (names[0].sim >= 0.9 || !rival)) hit = names[0].xs;
      }
      if (!hit.length) { out.missing.push(e); return; }
      if (!uk) {
        var us = {};
        hit.forEach(function (x) { if (!(x.uk in us)) us[x.uk] = x.unit; });
        var ks = Object.keys(us);
        if (ks.length > 1) { out.ambiguous.push({ entry: e, units: ks.map(function (k) { return us[k]; }) }); return; }
      }
      hit.forEach(function (x) {
        // a line answered with a note and no price: asked, priced by nothing (a price another line gave stays)
        if (e.market == null) { if (!out.requested[x.key]) out.requested[x.key] = { note: e.note }; return; }
        if (given[x.key] != null && given[x.key] !== e.market) {
          out.conflicts.push({ entry: e, key: x.key, kept: given[x.key] });
          return;
        }
        given[x.key] = e.market;
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
