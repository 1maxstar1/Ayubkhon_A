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
        // past the last code point there is no character: String.fromCodePoint throws, and one such reference
        // in one cell made the whole workbook unreadable
        return code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : m;
      }
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }

  /*
   * Walking the elements of one name.
   *
   * These used to be regular expressions of the shape <row…>([\s\S]*?)</row>. On an opening tag that is never
   * closed such an expression reads to the end of the text, gives up, and starts again at the next opening tag:
   * the work grows with the square of the file. A sheet of eighty thousand unclosed <row> tags — two kilobytes
   * zipped — kept the reader busy for a quarter of a minute, and each doubling four times as long. A file is
   * read by whoever receives it, so that is a way to stop somebody's work with an e-mail.
   *
   * each() goes through the text once: the closing tag is looked for from where the opening one ended, and if
   * there is none, nothing after it can be a whole element either, so it stops. On a well-formed sheet it finds
   * exactly what the expressions found.
   *
   *   each(xml, 'row', fn)   fn(attributeText, innerText) for <row …>…</row>, fn(attributeText, undefined) for <row …/>
   *   first(xml, 'v')        the inner text of the first <v …>…</v>, or null
   */
  function nameEnds(xml, at) {
    var c = xml.charCodeAt(at);       // «<c » and «<c>» are a cell; «<col» and «<cols» are not
    return c === 32 || c === 62 || c === 47 || c === 9 || c === 10 || c === 13;
  }
  function each(xml, name, fn) {
    var open = '<' + name, close = '</' + name + '>', pos = 0;
    for (;;) {
      var a = xml.indexOf(open, pos);
      if (a < 0) return;
      var nameEnd = a + open.length;
      if (!nameEnds(xml, nameEnd)) { pos = nameEnd; continue; }
      var gt = xml.indexOf('>', nameEnd);
      if (gt < 0) return;
      if (xml.charCodeAt(gt - 1) === 47) { fn(xml.slice(nameEnd, gt - 1), undefined); pos = gt + 1; continue; }
      var z = xml.indexOf(close, gt + 1);
      if (z < 0) return;
      fn(xml.slice(nameEnd, gt), xml.slice(gt + 1, z));
      pos = z + close.length;
    }
  }
  function first(xml, name) {
    var open = '<' + name, pos = 0;
    for (;;) {
      var a = xml.indexOf(open, pos);
      if (a < 0) return null;
      var nameEnd = a + open.length;
      if (!nameEnds(xml, nameEnd)) { pos = nameEnd; continue; }
      var gt = xml.indexOf('>', nameEnd);
      if (gt < 0) return null;
      var z = xml.indexOf('</' + name + '>', gt + 1);
      return z < 0 ? null : xml.slice(gt + 1, z);
    }
  }
  /** `xml` without its <name …>…</name> elements. */
  function without(xml, name) {
    var open = '<' + name, close = '</' + name + '>', out = '', pos = 0;
    for (;;) {
      var a = xml.indexOf(open, pos);
      if (a < 0) return out + xml.slice(pos);
      var z = xml.indexOf(close, a);
      if (z < 0) return out + xml.slice(pos);
      out += xml.slice(pos, a);
      pos = z + close.length;
    }
  }

  /** Concatenated <t> runs of one <si>, honouring xml:space and skipping <rPh>. */
  function siText(xml) {
    var out = '';
    // Phonetic hints (<rPh>) must not leak into the string.
    var body = xml.indexOf('<rPh') < 0 ? xml : without(xml, 'rPh');
    each(body, 't', function (attr, inner) { if (inner !== undefined) out += unesc(inner); });
    return out;
  }

  function sharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    each(xml, 'si', function (attr, inner) { out.push(inner === undefined ? '' : siText(inner)); });
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
  /* A row and column number are read straight out of the file and used as array
     indices, so they are the one thing in a workbook that can hurt the reader
     before anybody looks at it: «r="900000000"» costs a billion empty slots,
     and a seven-letter column reference eight billion. These are the limits
     Excel itself works to, so no honest file is turned away by them. */
  var MAX_ROW = 1048576;
  var MAX_COL = 16384;

  function parseSheet(xml, sst) {
    var rows = [], maxCol = 0;

    var dim = /<dimension ref="([^"]*)"/.exec(xml);
    void dim; // informational only; real bounds come from the cells we see

    each(xml, 'row', function (rowAttr, inner) {
      var ra = attrs(rowAttr);
      var r = +ra.r;
      if (!r || r > MAX_ROW) return;
      if (!inner) return;
      var cells = rows[r] || (rows[r] = []);
      each(inner, 'c', function (cellAttr, cellBody) {
        var ca = attrs(cellAttr);
        var body = cellBody || '';
        var ci = ca.r ? refCol(ca.r) : 0;
        if (!ci || ci > MAX_COL) return;
        if (ci > maxCol) maxCol = ci;

        var f = null;
        if (body.indexOf('<f') >= 0) {
          var ft = first(body, 'f');
          if (ft !== null) f = '=' + unesc(ft);
        }

        var v = null;
        var t = ca.t;
        if (t === 'inlineStr') {
          v = siText(body);
        } else {
          var raw = first(body, 'v');
          if (raw !== null) {
            if (t === 's') v = sst[+raw];
            else if (t === 'str' || t === 'e') v = unesc(raw);
            else if (t === 'b') v = raw === '1';
            else { v = +raw; if (!isFinite(v)) v = unesc(raw); }
          }
        }
        if (v === null && f === null) return;
        cells[ci] = f ? { v: v, f: f } : { v: v };
      });
    });

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
  /*
   * A sheet is small in the file and can be anything unpacked: four hundred megabytes of spaces zip to four
   * hundred kilobytes, and unpacking them took more memory than a browser tab is given. The size a part will
   * have is written in the archive, so it is asked before anything is unpacked. An estimate's sheet is a few
   * megabytes; these limits are far above any real one.
   */
  var MAX_PART_MB = 120, MAX_ALL_MB = 360;

  function read(bytes) {
    var MB = 1024 * 1024, all = 0, tooBig = '';
    var files = fflate.unzipSync(bytes, {
      filter: function (f) {
        var n = f.name;
        var wanted = n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' ||
          n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n);
        if (!wanted || tooBig) return false;
        all += f.originalSize || 0;
        if (f.originalSize > MAX_PART_MB * MB || all > MAX_ALL_MB * MB) { tooBig = n; return false; }
        return true;
      }
    });
    if (tooBig) {
      throw new Error('Файл слишком велик в распакованном виде (' + tooBig.replace(/^.*\//, '') + ' — больше ' +
        MAX_PART_MB + ' МБ, или все листы вместе больше ' + MAX_ALL_MB + ' МБ). Такую книгу программа не читает.');
    }

    var wbXml = files['xl/workbook.xml'];
    if (!wbXml) throw new Error('xl/workbook.xml не найден — это не файл .xlsx.');
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
