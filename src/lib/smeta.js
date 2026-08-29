/*
 * Recognises the "resource sheet" layout used by the smeta workbooks and turns
 * each such sheet into a list of typed rows, keeping the raw cells so the
 * assembler can copy them (formulas included) without losing anything.
 *
 * Expected layout, located by its header text rather than by fixed columns:
 *
 *   row 1   project title
 *   row 2   object / street title
 *   row 4   N п/п | НАИМЕНОВАНИЕ | ЕД. ИЗМ. | КОЛ-ВО | ЦЕНА ЗА ЕД. | СУММА (сум)
 *   row 5   1 | 2 | 3 | 4 | 5 | 6
 *   row 6+  ЗАТРАТЫ ТРУДА / СТРОИТЕЛЬНЫЕ МАШИНЫ … sections, items, ИТОГО lines
 */
(function (S) {
  'use strict';

  var SECTIONS = [
    'ЗАТРАТЫ ТРУДА',
    'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ',
    'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ',
    'ОБОРУДОВАНИЕ'
  ];

  function txt(cell) {
    if (!cell) return '';
    var v = cell.v;
    return typeof v === 'string' ? v : (v == null ? '' : String(v));
  }
  function up(s) { return S.nameKey(s); }

  function isTotal(t) {
    var u = up(t);
    return u.indexOf('ИТОГО') === 0 || u.indexOf('ВСЕГО') === 0;
  }
  function isSection(t) {
    var u = up(t);
    for (var i = 0; i < SECTIONS.length; i++) if (u === SECTIONS[i]) return true;
    // Tolerate spelling drift in real files ("СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ" etc).
    return /^(ЗАТРАТЫ ТРУДА|СТРОИТЕЛЬНЫЕ (МАШИНЫ|МАТЕРИАЛЫ)|ОБОРУДОВАНИ|МАТЕРИАЛЫ|МАШИНЫ)/.test(u);
  }
  function sectionOf(t) {
    var u = up(t);
    if (u.indexOf('ЗАТРАТЫ ТРУДА') === 0) return 'labor';
    if (u.indexOf('СТРОИТЕЛЬНЫЕ МАШИНЫ') === 0 || u.indexOf('МАШИНЫ') === 0) return 'machines';
    if (u.indexOf('СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ') === 0 || u.indexOf('МАТЕРИАЛЫ') === 0) return 'materials';
    if (u.indexOf('ОБОРУДОВАНИ') === 0) return 'equipment';
    return 'other';
  }

  /** Locate the header row and the six meaningful columns. */
  function findLayout(rows) {
    for (var r = 1; r < Math.min(rows.length, 40); r++) {
      var cells = rows[r];
      if (!cells) continue;
      var L = null;
      for (var c = 1; c < cells.length; c++) {
        var u = up(txt(cells[c]));
        if (!u) continue;
        if (u.indexOf('НАИМЕНОВАНИЕ') >= 0) { L = L || {}; L.name = c; }
        else if (/^N\s*П\/П$|^№/.test(u) || u === 'N П/П') { L = L || {}; L.no = c; }
        else if (u.indexOf('ЕД') === 0 && u.indexOf('ИЗМ') > 0) { L = L || {}; L.unit = c; }
        else if (u.indexOf('КОЛ-ВО') >= 0 || u.indexOf('КОЛВО') >= 0) { L = L || {}; L.qty = c; }
        else if (u.indexOf('ЦЕНА') >= 0) { L = L || {}; if (!L.price) L.price = c; }
        else if (u.indexOf('СУММА') >= 0) { L = L || {}; if (!L.sum) L.sum = c; }
      }
      if (L && L.name && L.qty && L.price && L.sum) {
        if (!L.no) L.no = L.name - 1 || 1;
        if (!L.unit) L.unit = L.name + 1;
        L.headerRow = r;
        // The "1 2 3 4 5 6" row directly beneath the header, when present.
        var nxt = rows[r + 1];
        L.numRow = nxt && S.num(nxt[L.name] && nxt[L.name].v) != null ? r + 1 : 0;
        L.lastCol = Math.max(L.sum, L.price, L.qty, L.unit, L.name, L.no);
        return L;
      }
    }
    return null;
  }

  /**
   * Some object sheets (the "ПЕРЕВОЗКА" ones) carry no header band at all — they
   * open straight on a section title. Infer the six columns from the shape of
   * the first item line instead.
   */
  function inferLayout(rows) {
    for (var r = 1; r < Math.min(rows.length, 60); r++) {
      var cells = rows[r];
      if (!cells) continue;
      for (var c = 1; c < cells.length - 4; c++) {
        if (S.num(cells[c] && cells[c].v) == null) continue;
        var nm = txt(cells[c + 1]), un = txt(cells[c + 2]);
        if (nm.length < 4 || !un || un.length > 12) continue;
        if (S.num(cells[c + 3] && cells[c + 3].v) == null) continue;
        var priced = cells[c + 4] && (S.num(cells[c + 4].v) != null || cells[c + 4].f);
        var summed = cells[c + 5] && (S.num(cells[c + 5].v) != null || cells[c + 5].f);
        if (!priced || !summed) continue;
        return {
          no: c, name: c + 1, unit: c + 2, qty: c + 3, price: c + 4, sum: c + 5,
          headerRow: 0, numRow: 0, lastCol: c + 5
        };
      }
    }
    return null;
  }

  function firstBodyRow(rows, L) {
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells) continue;
      var noTxt = txt(cells[L.no]);
      if (noTxt && isSection(noTxt)) return r;
      if (txt(cells[L.name]) && S.num(cells[L.qty] && cells[L.qty].v) != null) return r;
    }
    return 1;
  }

  function lastContentRow(rows) {
    for (var r = rows.length - 1; r > 0; r--) {
      var cells = rows[r];
      if (!cells) continue;
      for (var c = 1; c < cells.length; c++) {
        var cell = cells[c];
        if (cell && (cell.v != null || cell.f != null)) return r;
      }
    }
    return 0;
  }

  /**
   * @returns {?{name, title, subtitle, layout, rows: Array<Row>, maxCol:number}}
   *   Row = {r, kind, section, no, nm, unit, qty, price, sum, cells}
   */
  function parseSheet(sheet) {
    var L = findLayout(sheet.rows) || inferLayout(sheet.rows);
    if (!L) return null;
    var start = L.headerRow || firstBodyRow(sheet.rows, L);

    var last = lastContentRow(sheet.rows);
    if (last <= start) return null;

    var title = '', subtitle = '';
    for (var r0 = 1; r0 < start; r0++) {
      var cs = sheet.rows[r0];
      if (!cs) continue;
      var t = '';
      for (var c0 = 1; c0 <= L.lastCol; c0++) { t = txt(cs[c0]); if (t) break; }
      if (!t) continue;
      if (!title) title = t; else if (!subtitle) subtitle = t;
    }

    var out = [], section = '', items = 0, sections = 0, wide = L.lastCol;
    for (var r = start; r <= last; r++) {
      var cells = sheet.rows[r] || [];
      var nm = txt(cells[L.name]);
      var noCell = cells[L.no];
      var noTxt = txt(noCell);
      var qty = S.num(cells[L.qty] && cells[L.qty].v);
      var price = S.num(cells[L.price] && cells[L.price].v);
      var sum = S.num(cells[L.sum] && cells[L.sum].v);
      var kind;

      if (r === L.headerRow) kind = 'header';
      else if (r === L.numRow) kind = 'numbering';
      else if (isTotal(noTxt) || isTotal(nm)) kind = 'total';
      else if (noTxt && isSection(noTxt) && qty == null) { kind = 'section'; section = sectionOf(noTxt); sections++; }
      else if (nm && qty != null) { kind = 'item'; items++; }
      else if (nm) kind = 'extra';
      else if (noTxt) kind = 'section';
      else kind = 'blank';

      for (var w = cells.length - 1; w > wide; w--) {
        if (cells[w] && (cells[w].v != null || cells[w].f != null)) { wide = w; break; }
      }

      out.push({
        r: r, kind: kind, section: section,
        no: S.num(noCell && noCell.v), noTxt: noTxt,
        nm: nm, unit: txt(cells[L.unit]),
        qty: qty, price: price, sum: sum,
        cells: cells
      });
    }
    // A summary ("свод") sheet has the same column shape but never carries the
    // ЗАТРАТЫ ТРУДА / МАШИНЫ / МАТЕРИАЛЫ / ОБОРУДОВАНИЕ bands. That is the tell.
    if (!items || !sections) return null;

    return {
      name: sheet.name, title: title, subtitle: subtitle || sheet.name,
      layout: L, rows: out, items: items, sections: sections,
      maxCol: Math.min(wide, L.sum + 8)
    };
  }

  /** Every sheet in a workbook that looks like a resource sheet, in file order. */
  function parseWorkbook(wb, fileName) {
    var objects = [];
    for (var i = 0; i < wb.sheets.length; i++) {
      var sh = wb.sheets[i];
      if (sh.hidden) continue;
      var p = parseSheet(sh);
      if (p) { p.file = fileName; p.index = i; objects.push(p); }
    }
    return objects;
  }

  S.smeta = {
    parseSheet: parseSheet, parseWorkbook: parseWorkbook,
    SECTIONS: SECTIONS, sectionOf: sectionOf
  };
})(S);
