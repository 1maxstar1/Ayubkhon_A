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
 *
 * and the local resource estimate of form 4А (АВС-4), many of them stacked on
 * one sheet, each under its own title block:
 *
 *   № п/п | Шифр ресурсов | Наименование | Единица измерения | Количество единиц | Сметная стоимость
 *                                                                                | на единицу | общая
 *   1 | 2 | 3 | 4 | 5 | 6 | 7
 *   ТРУДОВЫЕ РЕСУРСЫ / СТРОИТЕЛЬНЫЕ МАШИНЫ … in the name column, numbered items,
 *   «В Т.Ч. …» lines, ИТОГО lines, ИТОГО ПРЯМЫЕ ЗАТРАТЫ
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
  // The four bands, as they are actually written in the wild: Russian, and
  // Uzbek in both alphabets.
  var LABOR = /^(ЗАТРАТЫ ТРУДА|ТРУДОЗАТРАТЫ|ТРУДОВЫЕ РЕСУРСЫ|МЕҲНАТ|MEHNAT|ISHCHILAR)/;
  var MACH = /^((СТРОИТЕЛЬНЫЕ )?МАШИНЫ|МЕХАНИЗМЫ|(ҚУРИЛИШ )?МАШИНА|МЕХАНИЗМ|(QURILISH )?MASHINA|MEXANIZM)/;
  var MAT = /^((СТРОИТЕЛЬНЫЕ )?МАТЕРИАЛЫ|(ҚУРИЛИШ )?МАТЕРИАЛ|(QURILISH )?MATERIAL)/;
  var EQUIP = /^(ОБОРУДОВАНИ|УСКУНА|ЖИҲОЗ|USKUNA|JIHOZ|ASBOB)/;

  function isSection(t) {
    var u = up(t);
    for (var i = 0; i < SECTIONS.length; i++) if (u === SECTIONS[i]) return true;
    return LABOR.test(u) || MACH.test(u) || MAT.test(u) || EQUIP.test(u);
  }
  function sectionOf(t) {
    var u = up(t);
    if (LABOR.test(u)) return 'labor';
    if (MACH.test(u)) return 'machines';
    if (MAT.test(u)) return 'materials';
    if (EQUIP.test(u)) return 'equipment';
    return 'other';
  }

  /**
   * A resource line needs a name, not just a number in the name column.
   * Spelled out rather than \W, which is ASCII-only and would reject every
   * Cyrillic name.
   */
  var LETTER = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/;

  /**
   * The header row at r and the six meaningful columns, or null.
   *
   * Two spellings of the header are known. The resource sheets: НАИМЕНОВАНИЕ ·
   * КОЛ-ВО · ЦЕНА · СУММА on one row. The local resource estimate of form 4А
   * (АВС-4): «Шифр ресурсов» between № and the name, «Количество единиц», and
   * «Сметная стоимость» split on the next row into «на единицу» and «общая».
   */
  function layoutAt(rows, r) {
    var cells = rows[r];
    if (!cells) return null;
    var L = null, noRaw = 0;
    for (var c = 1; c < cells.length; c++) {
      var raw = txt(cells[c]);
      var u = up(raw);
      if (!u) continue;
      if (!noRaw && /^\s*№/.test(raw)) noRaw = c;
      if (u.indexOf('НАИМЕНОВАНИЕ') >= 0) { L = L || {}; L.name = c; }
      else if (/^N\s*П\/П$|^№/.test(u) || u === 'N П/П') { L = L || {}; L.no = c; }
      else if (u.indexOf('ЕД') === 0 && u.indexOf('ИЗМ') > 0) { L = L || {}; L.unit = c; }
      else if (u.indexOf('КОЛ-ВО') >= 0 || u.indexOf('КОЛВО') >= 0 || u.indexOf('КОЛИЧЕСТВО') === 0) { L = L || {}; L.qty = c; }
      else if (u.indexOf('ЦЕНА') >= 0) { L = L || {}; if (!L.price) L.price = c; }
      else if (u.indexOf('СУММА') >= 0) { L = L || {}; if (!L.sum) L.sum = c; }
      else if (u.indexOf('ШИФР') === 0) { L = L || {}; L.code = c; }
    }
    if (!L || !L.name || !L.qty) return null;
    if (!L.price || !L.sum) {
      var sub = rows[r + 1] || [];
      for (var k = 1; k < sub.length; k++) {
        var s = up(txt(sub[k]));
        if (!L.price && s.indexOf('НА ЕДИНИЦУ') === 0) L.price = k;
        else if (!L.sum && (s === 'ОБЩАЯ' || s === 'ВСЕГО')) L.sum = k;
      }
      if (!L.price || !L.sum) return null;
      L.subRow = r + 1;
    }
    // «№ п/п» folds to «П П», so with a code column in between the number
    // column is found by its raw «№», never guessed as the one left of the name.
    if (L.code && !L.no) L.no = noRaw && noRaw !== L.code ? noRaw : (L.code - 1 || 1);
    if (!L.no) L.no = L.name - 1 || 1;
    if (!L.unit) L.unit = L.name + 1;
    L.headerRow = r;
    // The "1 2 3 4 5 6" row directly beneath the header, when present.
    var nr = (L.subRow || r) + 1, nxt = rows[nr];
    L.numRow = nxt && S.num(nxt[L.name] && nxt[L.name].v) != null ? nr : 0;
    L.lastCol = Math.max(L.sum, L.price, L.qty, L.unit, L.name, L.no);
    return L;
  }

  /** Locate the header row and the six meaningful columns. */
  function findLayout(rows) {
    for (var r = 1; r < Math.min(rows.length, 40); r++) {
      var L = layoutAt(rows, r);
      if (L) return L;
    }
    return null;
  }

  /** Every row of the sheet that repeats the header found first. */
  function headerRows(rows, L) {
    var out = [];
    for (var r = L.headerRow; r < rows.length; r++) {
      var M = rows[r] && layoutAt(rows, r);
      if (M && M.name === L.name && M.qty === L.qty) out.push(r);
    }
    return out;
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
          headerRow: 0, numRow: 0, lastCol: c + 5, guessed: true
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

  /** The last ИТОГО / ВСЕГО line in rows a..b, or 0. */
  function lastTotalRow(rows, L, a, b) {
    for (var r = b; r >= a; r--) {
      var cells = rows[r];
      if (cells && (isTotal(txt(cells[L.name])) || isTotal(txt(cells[L.no])))) return r;
    }
    return 0;
  }

  /** The text after the first filled cell of a row: «Наименование объекта - | ПАССАЖИРСКИЙ ЛИФТ». */
  function labelled(cells) {
    var first = 0;
    for (var c = 1; c < cells.length; c++) {
      var t = txt(cells[c]).replace(/^\s+|\s+$/g, '');
      if (!t) continue;
      if (!first) { first = c; continue; }
      return t;
    }
    return '';
  }

  /**
   * The title block above one local estimate of form 4А: the construction
   * («Наименование стройки»), the estimate number («ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ
   * РАСЧЕТ | № 06-05-01»), the works («на | ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ») and the
   * object («Наименование объекта»).
   */
  function blockMeta(rows, a, b) {
    var m = { stroika: '', number: '', work: '', object: '' };
    for (var r = a; r <= b; r++) {
      var cells = rows[r];
      if (!cells) continue;
      var head = '';
      for (var c = 1; c < cells.length && !head; c++) head = up(txt(cells[c]));
      if (!head) continue;
      if (head.indexOf('НАИМЕНОВАНИЕ СТРОЙКИ') === 0) m.stroika = labelled(cells);
      else if (head.indexOf('НАИМЕНОВАНИЕ ОБ') === 0) m.object = labelled(cells);
      else if (head.indexOf('ЛОКАЛЬНЫЙ') === 0) m.number = labelled(cells);
      else if (head === 'НА') m.work = labelled(cells);
    }
    return m;
  }

  /**
   * @returns {?{name, title, subtitle, layout, rows: Array<Row>, maxCol:number}}
   *   Row = {r, kind, section, no, nm, unit, qty, price, sum, cells}
   */
  function parseRange(sheet, L, start, last, meta) {
    if (last <= start) return null;

    var title = '', subtitle = '';
    if (meta) {
      title = meta.stroika;
      var obj = meta.object && meta.object.length > 3 && meta.object !== meta.work ? meta.object : '';
      subtitle = [meta.number, meta.work, obj].filter(function (t) { return t; }).join(' — ');
    } else {
      for (var r0 = 1; r0 < start; r0++) {
        var cs = sheet.rows[r0];
        if (!cs) continue;
        var t = '';
        for (var c0 = 1; c0 <= L.lastCol; c0++) { t = txt(cs[c0]); if (t) break; }
        if (!t) continue;
        if (!title) title = t; else if (!subtitle) subtitle = t;
      }
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

      if (r === L.headerRow || r === L.subRow) kind = 'header';
      else if (r === L.numRow) kind = 'numbering';
      else if (isTotal(noTxt) || isTotal(nm)) kind = 'total';
      else if (noTxt && isSection(noTxt) && qty == null) { kind = 'section'; section = sectionOf(noTxt); sections++; }
      // Form 4А writes its bands in the name column, and its resources are the
      // numbered lines only: «В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ» and the closing
      // «ЗАТРАТЫ ТРУДА РАБОЧИХ» carry a quantity but are not resources.
      else if (L.code && !noTxt && nm && qty == null && isSection(nm)) { kind = 'section'; section = sectionOf(nm); sections++; }
      else if (nm && LETTER.test(nm) && qty != null && (!L.code || S.num(noCell && noCell.v) != null)) { kind = 'item'; items++; }
      else if (nm) kind = 'extra';
      else if (noTxt) kind = 'section';
      else kind = 'blank';

      for (var w = cells.length - 1; w > wide; w--) {
        if (cells[w] && (cells[w].v != null || cells[w].f != null)) { wide = w; break; }
      }

      out.push({
        r: r, kind: kind, section: section, sub: r === L.subRow,
        no: S.num(noCell && noCell.v), noTxt: noTxt,
        nm: nm, unit: txt(cells[L.unit]),
        qty: qty, price: price, sum: sum,
        cells: cells
      });
    }
    // A sheet with a proper header row (НАИМЕНОВАНИЕ + КОЛ-ВО + ЦЕНА + СУММА)
    // is a resource sheet, section bands or not. When the layout had to be
    // guessed, at least one band is required — that is what keeps the summary
    // ("свод") sheets out, since they carry no header of their own.
    if (!items || (L.guessed && !sections)) return null;

    return {
      name: sheet.name, title: title, subtitle: subtitle || sheet.name,
      layout: L, rows: out, items: items, sections: sections,
      maxCol: Math.min(wide, L.sum + 8)
    };
  }

  /**
   * Every resource object on one sheet. Usually one; a form 4А export stacks
   * many local estimates on a single sheet, each with its own title block and
   * header, and each becomes an object of its own («РА · 1», «РА · 2» …) that
   * ends at its last ИТОГО line, so the «СОСТАВИЛ» signature and the next
   * estimate's title block stay out.
   */
  function parseSheetObjects(sheet) {
    var rows = sheet.rows;
    var L = findLayout(rows) || inferLayout(rows);
    if (!L) return [];
    // Only form 4А is split: an ordinary resource sheet that repeats its header
    // on every printed page stays one object, as it always was.
    if (!L.code) {
      var one = parseRange(sheet, L, L.headerRow || firstBodyRow(rows, L), lastContentRow(rows), null);
      return one ? [one] : [];
    }
    var heads = headerRows(rows, L);
    var out = [], last = lastContentRow(rows), prevEnd = 0, stroika = '';
    for (var i = 0; i < heads.length; i++) {
      var Li = layoutAt(rows, heads[i]);
      var limit = i + 1 < heads.length ? heads[i + 1] - 1 : last;
      var end = lastTotalRow(rows, Li, heads[i], limit) || limit;
      var meta = blockMeta(rows, prevEnd + 1, heads[i] - 1);
      if (!stroika) stroika = meta.stroika;
      var o = parseRange(sheet, Li, heads[i], end, meta);
      prevEnd = end;
      if (o) out.push(o);
    }
    out.forEach(function (o, k) {
      if (!o.title) o.title = stroika;
      if (out.length > 1) o.name = sheet.name + ' · ' + (k + 1);
      if (o.subtitle === sheet.name) o.subtitle = o.name;
    });
    return out;
  }

  /** The first resource object of a sheet, or null. */
  function parseSheet(sheet) {
    return parseSheetObjects(sheet)[0] || null;
  }

  /** Every resource object of a workbook, in file order. */
  function parseWorkbook(wb, fileName) {
    var objects = [];
    for (var i = 0; i < wb.sheets.length; i++) {
      var sh = wb.sheets[i];
      if (sh.hidden) continue;
      var list = parseSheetObjects(sh);
      for (var k = 0; k < list.length; k++) {
        list[k].file = fileName; list[k].index = i;
        objects.push(list[k]);
      }
    }
    return objects;
  }

  S.smeta = {
    parseSheet: parseSheet, parseWorkbook: parseWorkbook,
    SECTIONS: SECTIONS, sectionOf: sectionOf
  };
})(S);
