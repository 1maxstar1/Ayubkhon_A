/*
 * Minimal, fast .xlsx reader.
 *
 * Only what this tool needs: sheet names, cell values, cached formula results
 * and formula text. Scanner-based rather than DOM-based, because the real
 * workbooks here run to tens of thousands of cells and DOMParser on a 20 MB
 * sheet is exactly where the old build stalled.
 *
 * The file comes from outside, so the reader must finish on anything: every
 * search below walks the text once. They used to be regular expressions of
 * the form «<row …>…</row>», and an opening tag that is never closed makes
 * such an expression read to the end of the sheet from every opening tag in
 * turn — a few hundred kilobytes of «<row>» kept the page busy for hours.
 * test/xlsx-guard.cjs holds the reader to that.
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
        // past the last code point there is no character to make, and asking for one throws
        return code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : m;
      }
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }

  /** What may follow a tag's name: «>», «/» or white space. «<c» is not «<col». */
  function edge(c) { return c === 62 || c === 47 || c === 32 || c === 9 || c === 10 || c === 13; }

  /**
   * Every element `name` of `xml`, in order, in one pass.
   *   fn(attrs, inner, start, end) — `attrs` is the text between the name and «>»; `inner` is the text up to
   *   the closing tag, or undefined for «<name/>»; start/end bound the whole element. Returning true stops.
   * An opening tag with no closing tag after it is not an element and is stepped over — and once one closing
   * tag has not been found, no later one will be either, so it is not looked for again.
   */
  function each(xml, name, fn) {
    var open = '<' + name, close = '</' + name + '>', n = open.length;
    var p = 0, unclosed = false;
    while ((p = xml.indexOf(open, p)) >= 0) {
      var a = p + n;
      if (!edge(xml.charCodeAt(a))) { p = a; continue; }
      var gt = xml.indexOf('>', a);
      if (gt < 0) break;
      if (xml.charCodeAt(gt - 1) === 47) {
        if (fn(xml.slice(a, gt - 1), undefined, p, gt + 1)) return;
        p = gt + 1;
        continue;
      }
      var end = unclosed ? -1 : xml.indexOf(close, gt + 1);
      if (end < 0) { unclosed = true; p = gt + 1; continue; }
      if (fn(xml.slice(a, gt), xml.slice(gt + 1, end), p, end + close.length)) return;
      p = end + close.length;
    }
  }

  /** The content of the first `name` element that has any, or null. */
  function inner(xml, name) {
    var out = null;
    each(xml, name, function (a, body) {
      if (body === undefined) return false;
      out = body;
      return true;
    });
    return out;
  }

  /** `xml` with every `name` element cut out. */
  function without(xml, name) {
    var out = '', last = 0;
    each(xml, name, function (a, body, start, end) {
      if (body === undefined) return;
      out += xml.slice(last, start);
      last = end;
    });
    return last ? out + xml.slice(last) : xml;
  }

  /** Concatenated <t> runs of one <si>, honouring xml:space and skipping <rPh>. */
  function siText(xml) {
    var out = '';
    // Phonetic hints (<rPh>) must not leak into the string.
    var body = xml.indexOf('<rPh') < 0 ? xml : without(xml, 'rPh');
    each(body, 't', function (a, text) { if (text !== undefined) out += unesc(text); });
    return out;
  }

  /* A workbook is read whole into memory, so how much it may hold is decided here and not by the file. These
     are far past anything an estimate has — the real ones run to tens of thousands of cells and a few megabytes
     of XML — and well short of what stops a browser tab. */
  var MAX_XML = 256 * 1024 * 1024;      // bytes of XML in the parts that are read, unpacked
  var MAX_ITEMS = 5000000;              // cells in the workbook; shared strings

  function tooBig() {
    return new Error('файл слишком большой для чтения: в нём больше данных, чем бывает в смете. ' +
      'Если это настоящая смета, сохраните в отдельный файл только нужные листы.');
  }

  function sharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    each(xml, 'si', function (a, body) {
      if (out.length >= MAX_ITEMS) throw tooBig();
      out.push(body === undefined ? '' : siText(body));
    });
    return out;
  }

  /* Attributes are found only where one can start — after white space — so a long run of letters is read once
     and not once from each of its letters. */
  var ATTR = /(?:^|\s)([a-zA-Z:]+)="([^"]*)"/g;
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
      if (n > MAX_COL) break;           // a reference of a million letters is not a column
    }
    return n;
  }

  /* A row and column number are read straight out of the file and used as array
     indices, so they are the one thing in a workbook that can hurt the reader
     before anybody looks at it: «r="900000000"» costs a billion empty slots,
     and a seven-letter column reference eight billion. These are the limits
     Excel itself works to, so no honest file is turned away by them. */
  var MAX_ROW = 1048576;
  var MAX_COL = 16384;

  /**
   * Parse one worksheet.
   * @param {{cells:number}} count  cells read so far in the whole workbook
   * @returns {{rows: Array<Array<?{v:*,f:?string}>>, maxCol:number, cols:Array, merges:Array<string>}}
   */
  function parseSheet(xml, sst, count) {
    var rows = [], maxCol = 0;

    each(xml, 'row', function (rowAttr, rowBody) {
      if (!rowBody) return;
      var r = +attrs(rowAttr).r;
      if (!r || r > MAX_ROW) return;
      var cells = rows[r] || (rows[r] = []);
      each(rowBody, 'c', function (cellAttr, body) {
        var ca = attrs(cellAttr);
        body = body || '';
        var ci = ca.r ? refCol(ca.r) : 0;
        if (!ci || ci > MAX_COL) return;
        if (ci > maxCol) maxCol = ci;

        var f = null;
        if (body.indexOf('<f') >= 0) {
          var ft = inner(body, 'f');
          if (ft !== null) f = '=' + unesc(ft);
        }

        var v = null;
        var t = ca.t;
        if (t === 'inlineStr') {
          v = siText(body);
        } else {
          var raw = inner(body, 'v');
          if (raw !== null) {
            if (t === 's') v = sst[+raw];
            else if (t === 'str' || t === 'e') v = unesc(raw);
            else if (t === 'b') v = raw === '1';
            else { v = +raw; if (!isFinite(v)) v = unesc(raw); }
          }
        }
        if (v === null && f === null) return;
        if (++count.cells > MAX_ITEMS) throw tooBig();
        cells[ci] = f ? { v: v, f: f } : { v: v };
      });
    });

    var cols = [];
    var colsBlock = inner(xml, 'cols');
    if (colsBlock !== null) {
      each(colsBlock, 'col', function (colAttr) {
        var a = attrs(colAttr);
        cols.push({ min: +a.min, max: +a.max, width: +a.width, hidden: a.hidden === '1' });
      });
    }

    var merges = [];
    var mergeBlock = inner(xml, 'mergeCells');
    if (mergeBlock !== null) {
      each(mergeBlock, 'mergeCell', function (mergeAttr) {
        var ref = attrs(mergeAttr).ref;
        if (ref !== undefined) merges.push(ref);
      });
    }

    return { rows: rows, maxCol: maxCol, cols: cols, merges: merges };
  }

  /**
   * @param {Uint8Array} bytes  raw .xlsx
   * @returns {{sheets: Array<{name:string, rows:Array, maxCol:number, cols:Array, merges:Array}>}}
   */
  function read(bytes) {
    /* The archive says how large each part is once unpacked, and that is asked before anything is unpacked: a
       sheet of two gigabytes of spaces packs into a file smaller than an ordinary estimate. A part that claims
       less than it holds gains nothing by it — it is unpacked into exactly the room it asked for. */
    var total = 0;
    var files = fflate.unzipSync(bytes, {
      filter: function (f) {
        var n = f.name;
        var wanted = n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' ||
          n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n);
        if (!wanted) return false;
        total += f.originalSize || 0;
        if (total > MAX_XML) throw tooBig();
        return true;
      }
    });

    var wbXml = files['xl/workbook.xml'];
    if (!wbXml) throw new Error('xl/workbook.xml не найден — это не файл .xlsx.');
    wbXml = decodeText(wbXml);

    var rels = {};
    if (files['xl/_rels/workbook.xml.rels']) {
      each(decodeText(files['xl/_rels/workbook.xml.rels']), 'Relationship', function (relAttr) {
        var a = attrs(relAttr);
        if (a.Id === undefined || a.Target === undefined) return;
        rels[a.Id] = a.Target.replace(/^\/?xl\//, '').replace(/^\.\//, '');
      });
    }

    var sst = sharedStrings(files['xl/sharedStrings.xml'] ? decodeText(files['xl/sharedStrings.xml']) : null);

    var sheets = [], count = { cells: 0 };
    each(wbXml, 'sheet', function (sheetAttr) {
      var sa = attrs(sheetAttr);
      var target = rels[sa['r:id']] || rels[sa['id']];
      var key = target ? 'xl/' + target : null;
      var raw = key && files[key];
      if (!raw) return;
      // a part is one sheet: a workbook that lists the same part a million times is not read a million times
      delete files[key];
      var parsed = parseSheet(decodeText(raw), sst, count);
      parsed.name = unesc(sa.name || '');
      parsed.hidden = sa.state === 'hidden' || sa.state === 'veryHidden';
      sheets.push(parsed);
    });
    return { sheets: sheets };
  }

  S.readXlsx = read;
})(S);
