/*
 * Turns the row models into a styled workbook: one assembled "Лист1" plus one
 * TAQQOSLASH JADVALI №2 sheet per project.
 *
 * Every style constant here was read out of the reference workbook, so the
 * output is the same document, not merely the same numbers.
 */
(function (S) {
  'use strict';

  var CYAN = 'FFCCFFFF';       // section / header / ИТОГО bands
  var BLUE = 'FFD9E2F3';       // Uzbek header band on the report sheets
  var PINK = 'FFFFC7CE';       // conditional format fill
  var PINKTX = 'FF9C0006';
  var ALL = 'lrtb', RB = 'rb';

  var F = { b: true }, FN = null, FI = { i: true, sz: 11 }, F11B = { b: true, sz: 11 },
      F11 = { sz: 11 }, F8 = { sz: 8 };

  /* ------------------------------------------------------- Лист1 profile */

  var MAIN_FMT = { 2: '#,##0', 5: '0.000', 6: '#,##0.000', 7: '#,##0', 8: '#,##0.000', 9: '#,##0', 10: '#,##0' };

  function mainStyle(kind, c) {
    // Column A is the row-index helper; K and beyond are the source sheet's own
    // helper columns — both are carried across unstyled, as in the original.
    if (c === 1 || c > 10) return { fmt: 'General' };
    var fmt = MAIN_FMT[c] || 'General';
    switch (kind) {
      case 'title':
      case 'object':
        return { font: F, v: 'center', wrap: true };
      case 'header':
      case 'numbering':
        return { fmt: c === 5 ? '0.000' : '#,##0', font: F, fill: CYAN, border: ALL, h: 'center', v: 'center', wrap: true };
      case 'section':
        return { font: F, fill: CYAN, border: ALL, v: 'center', wrap: true };
      case 'total':
        if (c === 2) return { font: F, fill: CYAN, border: 'ltb', v: 'center', wrap: true };
        if (c === 3) return { font: F, fill: CYAN, border: 'rtb', v: 'center', wrap: true };
        return { fmt: fmt, font: F, fill: CYAN, border: c === 10 ? '' : ALL, h: 'center', v: 'center', wrap: true };
      case 'extra':
        if (c === 3) return { border: ALL, h: 'left', v: 'center', wrap: true };
        return { fmt: fmt, font: c === 5 || c === 6 || c === 8 ? F : FN, border: c === 10 ? '' : ALL, h: 'center', v: 'center' };
      case 'item':
        if (c === 2) return { fmt: '#,##0', border: ALL, h: 'center', v: 'center' };
        if (c === 3) return { border: RB, h: 'left', v: 'center', wrap: true };
        if (c === 4) return { border: RB, h: 'center', v: 'center' };
        if (c === 5) return { fmt: '0.000', font: F, border: RB, h: 'center', v: 'center' };
        if (c === 10) return { fmt: '#,##0', h: 'center', v: 'center' };
        return { fmt: fmt, border: ALL, h: 'center', v: 'center', wrap: c === 6 || c === 8 };
      default:
        return { fmt: 'General' };
    }
  }

  /* ------------------------------------------------------ report profile */

  var REP_FMT = { 2: '#,##0', 3: '#,##0', 6: '0.000', 7: '#,##0.000', 8: '#,##0', 9: '#,##0.000', 10: '#,##0', 11: '#,##0' };

  function reportStyle(kind, c) {
    if (c > 12) return { fmt: 'General' };
    var fmt = REP_FMT[c] || 'General';
    switch (kind) {
      case 'stamp': return { font: F8, h: 'center', v: 'center', wrap: true };
      case 'intro': return { font: F11B, h: 'center', v: 'center', wrap: true };
      case 'bigtitle':
      case 'bigtitle2': return { font: F11, h: 'center', v: 'center' };
      case 'uzhead': return { font: FI, fill: BLUE, border: c === 12 ? ALL : 'lrt', h: 'center', v: 'center', wrap: true };
      case 'uznum': return { font: { i: true, sz: 10 }, fill: BLUE, border: ALL, h: 'center', v: 'center', wrap: true };
      case 'header':
      case 'numbering':
        return { fmt: c === 6 ? (kind === 'header' ? '0.000' : '0') : '#,##0', font: F, fill: CYAN,
                 border: c === 11 ? '' : ALL, h: 'center', v: 'center', wrap: true };
      case 'section': return { font: F, fill: CYAN, border: c === 11 ? '' : ALL, v: 'center', wrap: true };
      case 'total':
      case 'grandtotal':
        if ((c >= 2 && c <= 4) || c === 12) return { font: F, fill: CYAN, border: ALL, v: 'center', wrap: true };
        if (c === 5) return { font: F, fill: CYAN, border: ALL, h: 'center', v: 'center', wrap: true };
        return { fmt: c === 6 ? '0.000' : '#,##0', font: F, fill: CYAN,
                 border: c === 11 ? '' : ALL, h: 'center', v: 'center' };
      case 'extra':
        if (c === 4) return { border: ALL, h: 'left', v: 'center', wrap: true };
        return { fmt: fmt, border: c === 11 ? '' : ALL, h: 'center', v: 'center' };
      case 'item':
        if (c === 2) return { fmt: '#,##0', border: ALL, h: 'center', v: 'center' };
        if (c === 3) return { fmt: '#,##0', border: RB, h: 'center', v: 'center' };
        if (c === 4) return { border: RB, h: 'left', v: 'center', wrap: true };
        if (c === 5) return { border: RB, h: 'center', v: 'center' };
        if (c === 6) return { fmt: '0.000', font: F, border: RB, h: 'center', v: 'center' };
        if (c === 11) return { fmt: '#,##0', h: 'center', v: 'center' };
        if (c === 12) return { h: 'left', v: 'center', wrap: true };
        return { fmt: fmt, border: ALL, h: 'center', v: 'center', wrap: c === 7 || c === 9 };
      default: return { fmt: 'General' };
    }
  }

  /* ---------------------------------------------------- contents profile */

  var IDX_FMT = { 1: '#,##0', 4: '#,##0', 5: '#,##0', 6: '#,##0', 7: '#,##0',
                  8: '#,##0', 9: '#,##0', 10: '#,##0' };

  function contentsStyle(kind, c) {
    if (c > 10) return { fmt: 'General' };
    var fmt = IDX_FMT[c] || 'General';
    switch (kind) {
      case 'bigtitle': return { font: F11B, h: 'left', v: 'center' };
      case 'header':
        return { font: F, fill: CYAN, border: ALL, h: 'center', v: 'center', wrap: true };
      case 'total':
        return { fmt: fmt, font: F, fill: CYAN, border: ALL,
                 h: c === 2 || c === 3 ? 'left' : 'center', v: 'center', wrap: c === 3 };
      case 'grandtotal':
        return { fmt: fmt, font: F, fill: CYAN, border: ALL,
                 h: c === 3 ? 'left' : 'center', v: 'center' };
      case 'item':
        if (c === 3) return { border: ALL, h: 'left', v: 'center', wrap: true, indent: 1 };
        return { fmt: fmt, border: ALL, h: 'center', v: 'center' };
      default: return { fmt: 'General' };
    }
  }

  /* --------------------------------------------------------------- build */

  function toSheet(styles, name, rows, lastCol, styleOf, extra) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], cells = [];
      var kind = row.kind || 'blank';
      var maxc = lastCol;
      for (var c in row.cells) { if (+c > maxc) maxc = +c; }
      for (var cc = 1; cc <= maxc; cc++) {
        var src = row.cells[cc];
        var hasValue = src && (src.v != null || src.f != null);
        if (!hasValue && kind === 'blank') continue;
        if (!hasValue && cc > lastCol) continue;
        var sp = styleOf(kind, cc);
        var sid = styles.xf(sp);
        var cell = { c: cc, s: sid };
        if (src) { if (src.f != null) cell.f = src.f; else cell.v = src.v; }
        cells.push(cell);
      }
      out.push({ r: i + 1, ht: row.ht || heightFor(kind), cells: cells });
    }
    var sheet = { name: name, rows: out };
    for (var k in extra) sheet[k] = extra[k];
    return sheet;
  }

  var HEIGHTS = { title: 50.25, object: 12.75, header: 25.5, section: 12.75, total: 12.75,
                  uzhead: 60, uznum: 23.25, stamp: 61.5, intro: 47.25, bigtitle: 20.25,
                  grandtotal: 24.75 };
  function heightFor(kind) { return HEIGHTS[kind] || 0; }

  function mainCols(nExtra) {
    var cols = [
      { min: 1, max: 1, width: 9.14 },
      { min: 2, max: 2, width: 8.14 },
      { min: 3, max: 3, width: 63.86 },
      { min: 4, max: 4, width: 9.29 },
      { min: 5, max: 5, width: 10.43 },
      { min: 6, max: 6, width: 12 },
      { min: 7, max: 7, width: 14.29 },
      { min: 8, max: 8, width: 12 },
      { min: 9, max: 10, width: 14.29 }
    ];
    if (nExtra > 0) cols.push({ min: 11, max: 10 + nExtra, width: 11.86 });
    if (nExtra > 0) cols.push({ min: 11 + nExtra, max: 10 + nExtra * 2, width: 11.86, hidden: true });
    return cols;
  }

  /**
   * @param {object} model    result of S.assemble
   * @param {object} opts     {mode, stamp, docTitle, noteText, autoNote, sheetName, cfLimit}
   * @returns {Uint8Array}
   */
  function build(model, opts) {
    opts = opts || {};
    var styles = new S.Styles();
    var dxf = styles.dxf(PINKTX, PINK);
    var limit = opts.cfLimit || 10000000;
    var sheets = [];

    var lastCol = 10 + model.nExtra * 2;
    var mainRows = model.rows;
    var headerRow = 0;
    for (var i = 0; i < mainRows.length; i++) if (mainRows[i].kind === 'numbering') { headerRow = i + 1; break; }

    sheets.push(toSheet(styles, opts.sheetName || 'Лист1', mainRows, 10, mainStyle, {
      cols: mainCols(model.nExtra),
      autoFilter: headerRow ? 'A' + headerRow + ':J' + mainRows.length : null,
      freeze: 0,
      cf: [
        { sqref: 'G1:G1048576', dxf: dxf, priority: 2, op: 'greaterThan', formula: limit },
        { sqref: 'I1:J1048576', dxf: dxf, priority: 1, op: 'greaterThan', formula: limit }
      ]
    }));
    void lastCol;

    model.spans.forEach(function (span) {
      var rep = S.report.build(model, span, opts);
      sheets.push(toSheet(styles, uniqueName(sheets, rep.name), rep.rows, 12, reportStyle, {
        cols: rep.cols,
        merges: rep.merges,
        autoFilter: rep.autoFilter,
        printTitles: rep.printTitles,
        printCentered: true,
        pageSetup: { scale: 75, orientation: 'landscape' },
        zoom: 70,
        cf: [
          { sqref: 'H8:H1048576 J8:K1048576', dxf: dxf, priority: 3, op: 'greaterThan', formula: limit },
          { sqref: 'G8:G1048576 I8:I1048576', dxf: dxf, priority: 1, op: 'greaterThan', formula: 5000000 }
        ]
      }));
    });

    if (opts.contents !== false) {
      var idx = S.report.contents(model, opts);
      sheets.push(toSheet(styles, uniqueName(sheets, opts.contentsSheet || 'Mundarija'),
        idx.rows, 10, contentsStyle, { cols: idx.cols, printCentered: true,
        pageSetup: { scale: 90, orientation: 'landscape' } }));
    }

    return S.writeWorkbook({ sheets: sheets, styles: styles, title: opts.docTitle });
  }

  function uniqueName(sheets, name) {
    var base = String(name || 'Loyiha').replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Loyiha';
    var n = base, i = 2;
    while (sheets.some(function (s) { return s.name === n; })) n = base.slice(0, 28) + ' ' + (i++);
    return n;
  }

  S.buildWorkbook = build;
  S.exportStyles = { mainStyle: mainStyle, reportStyle: reportStyle };
})(S);
