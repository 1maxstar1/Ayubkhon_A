/*
 * .xlsx writer with full cell formatting.
 *
 * Written by hand rather than pulled from a library because the deliverable has
 * to be byte-for-byte the same *look* as the reference workbook: Times New Roman
 * 10, CCFFFF header bands, thin borders, the #,##0 / 0.000 number formats, the
 * "> 10 000 000" pink conditional format, hidden helper columns and the
 * landscape fit-to-width print setup. Community spreadsheet builders drop all of
 * that, which is why the earlier export "did not look like mine".
 */
(function (S) {
  'use strict';

  var esc = S.esc;

  /* ---------------------------------------------------------------- styles */

  function Styles() {
    this.numFmts = [];              // {id, code}
    this.numFmtIdx = {};
    this.fonts = ['<font><sz val="10"/><name val="Times New Roman"/><family val="1"/><charset val="204"/></font>'];
    this.fontIdx = {};
    this.fills = ['<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>'];
    this.fillIdx = {};
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.borderIdx = {};
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.xfIdx = {};
    this.dxfs = [];
  }

  var BUILTIN = { 'General': 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '@': 49 };

  Styles.prototype.numFmt = function (code) {
    if (!code || BUILTIN[code] !== undefined) return BUILTIN[code] || 0;
    if (this.numFmtIdx[code] !== undefined) return this.numFmtIdx[code];
    var id = 164 + this.numFmts.length;
    this.numFmts.push({ id: id, code: code });
    this.numFmtIdx[code] = id;
    return id;
  };

  Styles.prototype.font = function (f) {
    if (!f) return 0;
    var key = JSON.stringify(f);
    if (this.fontIdx[key] !== undefined) return this.fontIdx[key];
    var x = '<font>';
    if (f.b) x += '<b/>';
    if (f.i) x += '<i/>';
    if (f.u) x += '<u/>';
    x += '<sz val="' + (f.sz || 10) + '"/>';
    if (f.color) x += '<color rgb="' + f.color + '"/>';
    x += '<name val="' + (f.name || 'Times New Roman') + '"/><family val="1"/><charset val="204"/></font>';
    var id = this.fonts.length;
    this.fonts.push(x);
    this.fontIdx[key] = id;
    return id;
  };

  Styles.prototype.fill = function (rgb) {
    if (!rgb) return 0;
    if (this.fillIdx[rgb] !== undefined) return this.fillIdx[rgb];
    var id = this.fills.length;
    this.fills.push('<fill><patternFill patternType="solid"><fgColor rgb="' + rgb +
      '"/><bgColor indexed="64"/></patternFill></fill>');
    this.fillIdx[rgb] = id;
    return id;
  };

  /** @param {string} sides subset of "lrtb", e.g. "lrtb" or "rb" */
  Styles.prototype.border = function (sides) {
    if (!sides) return 0;
    if (this.borderIdx[sides] !== undefined) return this.borderIdx[sides];
    var thin = '<color indexed="64"/>';
    var x = '<border>' +
      (sides.indexOf('l') >= 0 ? '<left style="thin">' + thin + '</left>' : '<left/>') +
      (sides.indexOf('r') >= 0 ? '<right style="thin">' + thin + '</right>' : '<right/>') +
      (sides.indexOf('t') >= 0 ? '<top style="thin">' + thin + '</top>' : '<top/>') +
      (sides.indexOf('b') >= 0 ? '<bottom style="thin">' + thin + '</bottom>' : '<bottom/>') +
      '<diagonal/></border>';
    var id = this.borders.length;
    this.borders.push(x);
    this.borderIdx[sides] = id;
    return id;
  };

  /**
   * @param {{fmt?:string, font?:object, fill?:string, border?:string,
   *          h?:string, v?:string, wrap?:boolean, indent?:number}} sp
   * @returns {number} cellXfs index
   */
  Styles.prototype.xf = function (sp) {
    var key = JSON.stringify(sp);
    if (this.xfIdx[key] !== undefined) return this.xfIdx[key];
    var nf = this.numFmt(sp.fmt), fo = this.font(sp.font), fi = this.fill(sp.fill), bo = this.border(sp.border);
    var al = '';
    if (sp.h || sp.v || sp.wrap || sp.indent) {
      al = '<alignment' + (sp.h ? ' horizontal="' + sp.h + '"' : '') +
        (sp.v ? ' vertical="' + sp.v + '"' : '') +
        (sp.wrap ? ' wrapText="1"' : '') +
        (sp.indent ? ' indent="' + sp.indent + '"' : '') + '/>';
    }
    var x = '<xf numFmtId="' + nf + '" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo +
      '" xfId="0"' + (nf ? ' applyNumberFormat="1"' : '') + (fo ? ' applyFont="1"' : '') +
      (fi ? ' applyFill="1"' : '') + (bo ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1"' : '') +
      (al ? '>' + al + '</xf>' : '/>');
    var id = this.xfs.length;
    this.xfs.push(x);
    this.xfIdx[key] = id;
    return id;
  };

  /** Differential format for conditional formatting. Returns the dxf index. */
  Styles.prototype.dxf = function (fontColor, fillColor) {
    var x = '<dxf>' + (fontColor ? '<font><color rgb="' + fontColor + '"/></font>' : '') +
      (fillColor ? '<fill><patternFill><bgColor rgb="' + fillColor + '"/></patternFill></fill>' : '') + '</dxf>';
    var i = this.dxfs.indexOf(x);
    if (i >= 0) return i;
    this.dxfs.push(x);
    return this.dxfs.length - 1;
  };

  Styles.prototype.toXml = function () {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (this.numFmts.length
        ? '<numFmts count="' + this.numFmts.length + '">' +
          this.numFmts.map(function (n) { return '<numFmt numFmtId="' + n.id + '" formatCode="' + esc(n.code) + '"/>'; }).join('') +
          '</numFmts>'
        : '') +
      '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts>' +
      '<fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills>' +
      '<borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      (this.dxfs.length ? '<dxfs count="' + this.dxfs.length + '">' + this.dxfs.join('') + '</dxfs>' : '<dxfs count="0"/>') +
      '</styleSheet>';
  };

  /* ------------------------------------------------------------ sheet xml */

  function cellXml(ref, cell) {
    var s = cell.s ? ' s="' + cell.s + '"' : '';
    if (cell.f != null) {
      var f = cell.f.charAt(0) === '=' ? cell.f.slice(1) : cell.f;
      // No cached <v>: Excel recalculates on open, which is what we want after
      // a price edit anyway.
      return '<c r="' + ref + '"' + s + '><f>' + esc(f) + '</f></c>';
    }
    var v = cell.v;
    if (v == null || v === '') return s ? '<c r="' + ref + '"' + s + '/>' : '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '<c r="' + ref + '"' + s + '/>';
      return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    }
    if (typeof v === 'boolean') return '<c r="' + ref + '"' + s + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sh) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];

    var view = '<sheetView' + (sh.tabSelected ? ' tabSelected="1"' : '') +
      (sh.zoom ? ' zoomScale="' + sh.zoom + '" zoomScaleNormal="100"' : '') + ' workbookViewId="0">';
    if (sh.freeze) {
      view += '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) +
        '" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A' + (sh.freeze + 1) + '" sqref="A' + (sh.freeze + 1) + '"/>';
    }
    view += '</sheetView>';
    out.push('<sheetViews>' + view + '</sheetViews>');
    out.push('<sheetFormatPr defaultRowHeight="12.75"/>');

    if (sh.cols && sh.cols.length) {
      out.push('<cols>' + sh.cols.map(function (c) {
        return '<col min="' + c.min + '" max="' + c.max + '" width="' + c.width +
          '" customWidth="1"' + (c.hidden ? ' hidden="1"' : '') + (c.style ? ' style="' + c.style + '"' : '') + '/>';
      }).join('') + '</cols>');
    }

    out.push('<sheetData>');
    var rows = sh.rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var cells = row.cells, body = '';
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (!c) continue;
        body += cellXml(S.col(c.c) + row.r, c);
      }
      if (!body && !row.ht) continue;
      out.push('<row r="' + row.r + '"' + (row.ht ? ' ht="' + row.ht + '" customHeight="1"' : '') +
        (row.hidden ? ' hidden="1"' : '') + '>' + body + '</row>');
    }
    out.push('</sheetData>');

    if (sh.autoFilter) out.push('<autoFilter ref="' + sh.autoFilter + '"/>');
    if (sh.merges && sh.merges.length) {
      out.push('<mergeCells count="' + sh.merges.length + '">' +
        sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
    }
    if (sh.cf) {
      sh.cf.forEach(function (r) {
        out.push('<conditionalFormatting sqref="' + r.sqref + '">' +
          '<cfRule type="cellIs" dxfId="' + r.dxf + '" priority="' + r.priority +
          '" operator="' + r.op + '"><formula>' + r.formula + '</formula></cfRule></conditionalFormatting>');
      });
    }
    if (sh.printCentered) out.push('<printOptions horizontalCentered="1"/>');
    out.push('<pageMargins left="0.51181102362204722" right="0.51181102362204722" top="0.74803149606299213"' +
      ' bottom="0.74803149606299213" header="0.31496062992125984" footer="0.31496062992125984"/>');
    if (sh.pageSetup) {
      out.push('<pageSetup paperSize="9" scale="' + (sh.pageSetup.scale || 75) +
        '" fitToHeight="0" orientation="' + (sh.pageSetup.orientation || 'landscape') + '"/>');
    }
    out.push('</worksheet>');
    return out.join('');
  }

  /* -------------------------------------------------------------- package */

  function writeWorkbook(spec) {
    var sheets = spec.sheets;
    var files = {};
    var enc = new TextEncoder();
    var put = function (name, str) { files[name] = enc.encode(str); };

    put('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (s, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>');

    put('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>');

    var defNames = '';
    sheets.forEach(function (s, i) {
      if (s.autoFilter) {
        defNames += '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' +
          "'" + s.name.replace(/'/g, "''") + "'!" + s.autoFilter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') + '</definedName>';
      }
      if (s.printTitles) {
        defNames += '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' +
          "'" + s.name.replace(/'/g, "''") + "'!" + s.printTitles + '</definedName>';
      }
    });

    put('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sheets.map(function (s, i) {
        return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') + '</sheets>' +
      (defNames ? '<definedNames>' + defNames + '</definedNames>' : '') +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');

    put('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) {
        return '<Relationship Id="rId' + (i + 1) +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
          (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');

    sheets.forEach(function (s, i) { put('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)); });
    put('xl/styles.xml', spec.styles.toXml());

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    put('docProps/core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(spec.title || 'Taqqoslash jadvali') + '</dc:title>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>');
    put('docProps/app.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>Smeta Taqqoslash</Application></Properties>');

    return fflate.zipSync(files, { level: 6, mem: 8 });
  }

  S.Styles = Styles;
  S.writeWorkbook = writeWorkbook;
})(S);
