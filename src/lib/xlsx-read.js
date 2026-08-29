/*
 * Minimal, fast .xlsx reader.
 *
 * Only what this tool needs: sheet names, cell values, cached formula results
 * and formula text. Scanner-based rather than DOM-based, because the real
 * workbooks here run to tens of thousands of cells and DOMParser on a 20 MB
 * sheet is exactly where the old build stalled.
 */
(function (S) {
  'use strict';

  function decodeText(buf) {
    return new TextDecoder('utf-8').decode(buf);
  }

  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function unesc(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var code = e.charAt(1) === 'x' || e.charAt(1) === 'X'
          ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }

  /** Concatenated <t> runs of one <si>, honouring xml:space and skipping <rPh>. */
  function siText(xml) {
    var out = '';
    var re = /<t[^>]*>([\s\S]*?)<\/t>|<t\/>/g, m;
    // Phonetic hints (<rPh>) must not leak into the string.
    var body = xml.indexOf('<rPh') < 0 ? xml : xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
    while ((m = re.exec(body))) out += m[1] === undefined ? '' : unesc(m[1]);
    return out;
  }

  function sharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var re = /<si>([\s\S]*?)<\/si>|<si\/>/g, m;
    while ((m = re.exec(xml))) out.push(m[1] === undefined ? '' : siText(m[1]));
    return out;
  }

  var ATTR = /([a-zA-Z:]+)="([^"]*)"/g;
  function attrs(tag) {
    var o = {}, m;
    ATTR.lastIndex = 0;
    while ((m = ATTR.exec(tag))) o[m[1]] = m[2];
    return o;
  }

  function refCol(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n;
  }

  /**
   * Parse one worksheet.
   * @returns {{rows: Array<Array<?{v:*,f:?string}>>, maxCol:number, cols:Array, merges:Array<string>}}
   */
  function parseSheet(xml, sst) {
    var rows = [], maxCol = 0;

    var dim = /<dimension ref="([^"]*)"/.exec(xml);
    void dim; // informational only; real bounds come from the cells we see

    var rowRe = /<row([^>]*)\/>|<row([^>]*)>([\s\S]*?)<\/row>/g;
    var cellRe = /<c([^>]*)\/>|<c([^>]*)>([\s\S]*?)<\/c>/g;
    var rm;
    while ((rm = rowRe.exec(xml))) {
      var rowAttr = rm[1] !== undefined ? rm[1] : rm[2];
      var inner = rm[3];
      var ra = attrs(rowAttr);
      var r = +ra.r;
      if (!r) continue;
      if (!inner) { continue; }
      var cells = rows[r] || (rows[r] = []);
      cellRe.lastIndex = 0;
      var cm;
      while ((cm = cellRe.exec(inner))) {
        var ca = attrs(cm[1] !== undefined ? cm[1] : cm[2]);
        var body = cm[3] || '';
        var ci = ca.r ? refCol(ca.r) : 0;
        if (!ci) continue;
        if (ci > maxCol) maxCol = ci;

        var f = null;
        var fi = body.indexOf('<f');
        if (fi >= 0) {
          var fm = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body);
          if (fm) f = '=' + unesc(fm[1]);
        }

        var v = null;
        var t = ca.t;
        if (t === 'inlineStr') {
          v = siText(body);
        } else {
          var vm = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body);
          if (vm) {
            var raw = vm[1];
            if (t === 's') v = sst[+raw];
            else if (t === 'str' || t === 'e') v = unesc(raw);
            else if (t === 'b') v = raw === '1';
            else { v = +raw; if (!isFinite(v)) v = unesc(raw); }
          }
        }
        if (v === null && f === null) continue;
        cells[ci] = f ? { v: v, f: f } : { v: v };
      }
    }

    var cols = [];
    var colsBlock = /<cols>([\s\S]*?)<\/cols>/.exec(xml);
    if (colsBlock) {
      var cre = /<col([^>]*)\/>/g, cmm;
      while ((cmm = cre.exec(colsBlock[1]))) {
        var a = attrs(cmm[1]);
        cols.push({ min: +a.min, max: +a.max, width: +a.width, hidden: a.hidden === '1' });
      }
    }

    var merges = [];
    var mergeBlock = /<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/.exec(xml);
    if (mergeBlock) {
      var mre = /<mergeCell ref="([^"]*)"/g, mmm;
      while ((mmm = mre.exec(mergeBlock[1]))) merges.push(mmm[1]);
    }

    return { rows: rows, maxCol: maxCol, cols: cols, merges: merges };
  }

  /**
   * @param {Uint8Array} bytes  raw .xlsx
   * @returns {{sheets: Array<{name:string, rows:Array, maxCol:number, cols:Array, merges:Array}>}}
   */
  function read(bytes) {
    var files = fflate.unzipSync(bytes, {
      filter: function (f) {
        var n = f.name;
        return n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' ||
          n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n);
      }
    });

    var wbXml = files['xl/workbook.xml'];
    if (!wbXml) throw new Error('xl/workbook.xml topilmadi — bu .xlsx fayl emas.');
    wbXml = decodeText(wbXml);

    var rels = {};
    if (files['xl/_rels/workbook.xml.rels']) {
      var relXml = decodeText(files['xl/_rels/workbook.xml.rels']);
      var rre = /<Relationship([^>]*)\/>/g, rm2;
      while ((rm2 = rre.exec(relXml))) {
        var a = attrs(rm2[1]);
        rels[a.Id] = a.Target.replace(/^\/?xl\//, '').replace(/^\.\//, '');
      }
    }

    var sst = sharedStrings(files['xl/sharedStrings.xml'] ? decodeText(files['xl/sharedStrings.xml']) : null);

    var sheets = [];
    var sre = /<sheet([^>]*)\/>/g, sm;
    while ((sm = sre.exec(wbXml))) {
      var sa = attrs(sm[1]);
      var target = rels[sa['r:id']] || rels[sa['id']];
      var key = target ? 'xl/' + target : null;
      var raw = key && files[key];
      if (!raw) continue;
      var parsed = parseSheet(decodeText(raw), sst);
      parsed.name = unesc(sa.name || '');
      parsed.hidden = sa.state === 'hidden' || sa.state === 'veryHidden';
      sheets.push(parsed);
    }
    return { sheets: sheets };
  }

  S.readXlsx = read;
})(S);
