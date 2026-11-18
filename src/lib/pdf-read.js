/*
 * A table printed to PDF, read back as a book.
 *
 * «Наш ответ» goes out as a PDF as often as a spreadsheet: our own export printed («Microsoft: Print To PDF», Excel's
 * «Сохранить как PDF»), and the expert has had to type such a file back into Excel before the program could judge
 * the corrected smeta against it. Here the PDF itself is read: every glyph is placed where the page puts it, the
 * table's ruled lines give its rows and columns, and the result has the shape S.readXlsx gives — rows[r][c] = { v },
 * from 1 — so that S.reply.parse reads it as it reads the spreadsheet.
 *
 *   S.isPdf(bytes)   → true for a file that begins «%PDF»
 *   S.readPdf(bytes) → { sheets: [{ name: 'PDF', rows }] }    (throws, with a message for the person, when it cannot)
 *
 * What is read: the objects of the file (also inside object streams), Flate-compressed streams, the page tree, the
 * text of every page (fonts with a ToUnicode map, two-byte Identity encodings and simple fonts, their widths, the
 * text and graphics state, form XObjects) and the lines and thin rectangles that draw the table. Text outside the
 * table (the title above it) becomes rows of one cell each. A page with no ruled table gives its text line by line,
 * each line split into cells at wide gaps. Nothing is guessed from a picture: a scanned page has no text to read.
 */
(function (S) {
  'use strict';

  var Z = typeof fflate !== 'undefined' ? fflate : null;
  var MAX_MB = 50;

  function isPdf(bytes) {
    return !!bytes && bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }

  /** bytes → a string of the same length, one char per byte (offsets in the one are offsets in the other). */
  function latin1(bytes) {
    var out = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + step)));
    return out;
  }

  /* ------------------------------------------------------------ the syntax */

  // names are kept as strings with their «/»; strings as { s }; references as { ref }; operators as { op }
  function Lexer(s, p) { this.s = s; this.p = p || 0; }
  function isWs(c) { return c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0; }
  function isDelim(c) { return c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37; }
  Lexer.prototype.skip = function () {
    var s = this.s, n = s.length;
    while (this.p < n) {
      var c = s.charCodeAt(this.p);
      if (isWs(c)) this.p++;
      else if (c === 37) { while (this.p < n && s.charCodeAt(this.p) !== 10 && s.charCodeAt(this.p) !== 13) this.p++; }
      else break;
    }
  };
  Lexer.prototype.token = function () {
    this.skip();
    var s = this.s, n = s.length;
    if (this.p >= n) return null;
    var c = s.charCodeAt(this.p), start;
    if (c === 47) {                                       // a name
      start = ++this.p;
      while (this.p < n && !isWs(s.charCodeAt(this.p)) && !isDelim(s.charCodeAt(this.p))) this.p++;
      return { t: 'v', v: '/' + s.slice(start, this.p).replace(/#([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }) };
    }
    if (c === 40) return { t: 'v', v: { s: this.literal() } };
    if (c === 60) {
      if (s.charCodeAt(this.p + 1) === 60) { this.p += 2; return { t: '<<' }; }
      start = ++this.p;
      var end = s.indexOf('>', start);
      if (end < 0) end = n;
      this.p = end + 1;
      var hex = s.slice(start, end).replace(/[^0-9A-Fa-f]/g, '');
      if (hex.length % 2) hex += '0';
      var str = '';
      for (var i = 0; i < hex.length; i += 2) str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      return { t: 'v', v: { s: str } };
    }
    if (c === 62 && s.charCodeAt(this.p + 1) === 62) { this.p += 2; return { t: '>>' }; }
    if (c === 91) { this.p++; return { t: '[' }; }
    if (c === 93) { this.p++; return { t: ']' }; }
    if (c === 123 || c === 125 || c === 41 || c === 62) { this.p++; return this.token(); }
    start = this.p;
    while (this.p < n && !isWs(s.charCodeAt(this.p)) && !isDelim(s.charCodeAt(this.p))) this.p++;
    var w = s.slice(start, this.p);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return { t: 'v', v: parseFloat(w) };
    if (w === 'true') return { t: 'v', v: true };
    if (w === 'false') return { t: 'v', v: false };
    if (w === 'null') return { t: 'v', v: null };
    return { t: 'op', v: w };
  };
  Lexer.prototype.literal = function () {
    var s = this.s, n = s.length, depth = 1, out = '';
    this.p++;
    while (this.p < n) {
      var ch = s.charAt(this.p++);
      if (ch === '\\') {
        var e = s.charAt(this.p++);
        if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === '\r') { if (s.charAt(this.p) === '\n') this.p++; }
        else if (e === '\n') { /* a line continued */ }
        else if (/[0-7]/.test(e)) {
          var oct = e;
          while (oct.length < 3 && /[0-7]/.test(s.charAt(this.p))) oct += s.charAt(this.p++);
          out += String.fromCharCode(parseInt(oct, 8) & 255);
        } else out += e;
      } else if (ch === '(') { depth++; out += ch; }
      else if (ch === ')') { if (--depth === 0) break; out += ch; }
      else out += ch;
    }
    return out;
  };
  /** One value, references («12 0 R») taken as such. */
  Lexer.prototype.value = function (tok) {
    tok = tok || this.token();
    if (!tok) return undefined;
    if (tok.t === '[') {
      var arr = [];
      for (;;) {
        var t = this.token();
        if (!t || t.t === ']') break;
        arr.push(this.value(t));
      }
      return refs(arr);
    }
    if (tok.t === '<<') {
      var dict = {};
      for (;;) {
        var k = this.token();
        if (!k || k.t === '>>') break;
        if (k.t !== 'v' || typeof k.v !== 'string') continue;
        dict[k.v.slice(1)] = this.value();
      }
      return dict;
    }
    if (tok.t === 'v' && typeof tok.v === 'number') {
      var at = this.p, g = this.token(), r = g && this.token();
      if (g && r && g.t === 'v' && typeof g.v === 'number' && r.t === 'op' && r.v === 'R') return { ref: tok.v };
      this.p = at;
      return tok.v;
    }
    if (tok.t === 'op') return { op: tok.v };
    return tok.v;
  };
  // inside an array, «12 0 R» came back as 12, 0, {op: R}: made one reference
  function refs(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (typeof arr[i] === 'number' && typeof arr[i + 1] === 'number' && arr[i + 2] && arr[i + 2].op === 'R') { out.push({ ref: arr[i] }); i += 2; }
      else out.push(arr[i]);
    }
    return out;
  }

  /* --------------------------------------------------------------- objects */

  function Doc(bytes) {
    this.b = bytes;
    this.s = latin1(bytes);
    this.at = {};          // object number → offset just after «obj»
    this.cache = {};
    this.packed = null;    // object number → { stream, index } of objects inside object streams
    var re = /(^|[\s>])(\d+)\s+(\d+)\s+obj\b/g, m;
    while ((m = re.exec(this.s))) this.at[+m[2]] = m.index + m[0].length;
  }
  Doc.prototype.get = function (num) {
    if (num in this.cache) return this.cache[num];
    var v;
    if (num in this.at) v = this.read(this.at[num]);
    else v = this.unpack(num);
    this.cache[num] = v;
    return v;
  };
  Doc.prototype.read = function (pos) {
    var lx = new Lexer(this.s, pos), v = lx.value();
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.s && !v.ref && !v.op) {
      lx.skip();
      if (this.s.substr(lx.p, 6) === 'stream') {
        var p = lx.p + 6;
        if (this.s.charAt(p) === '\r') p++;
        if (this.s.charAt(p) === '\n') p++;
        var len = this.resolve(v.Length), end = typeof len === 'number' && len >= 0 ? p + len : -1;
        if (end < 0 || end > this.s.length || this.s.slice(end, end + 30).indexOf('endstream') < 0) {
          end = this.s.indexOf('endstream', p);
          if (end < 0) end = this.s.length;
          while (end > p && (this.s.charAt(end - 1) === '\n' || this.s.charAt(end - 1) === '\r')) end--;
        }
        Object.defineProperty(v, '$raw', { value: this.b.subarray(p, end), enumerable: false });
      }
    }
    return v;
  };
  Doc.prototype.resolve = function (v) {
    var guard = 0;
    while (v && typeof v === 'object' && v.ref != null && guard++ < 32) v = this.get(v.ref);
    return v;
  };
  /** An object kept inside an object stream (PDF 1.5): every such stream is opened once, the first time one is asked for. */
  Doc.prototype.unpack = function (num) {
    if (!this.packed) {
      this.packed = {};
      for (var n in this.at) {
        var o = this.get(+n);
        if (!o || o.Type !== '/ObjStm' || !o.$raw) continue;
        var data = latin1(decode(o, this)), count = this.resolve(o.N) || 0, first = this.resolve(o.First) || 0;
        var lx = new Lexer(data, 0), pairs = [];
        for (var i = 0; i < count; i++) { var a = lx.value(), b = lx.value(); pairs.push([a, b]); }
        for (var j = 0; j < pairs.length; j++) if (!(pairs[j][0] in this.at)) this.packed[pairs[j][0]] = { data: data, at: first + pairs[j][1] };
      }
    }
    var p = this.packed[num];
    return p ? new Lexer(p.data, p.at).value() : null;
  };

  /** A stream's bytes with its filters undone (Flate; others give nothing, said by the caller's empty page). */
  function decode(obj, doc) {
    var raw = obj.$raw;
    if (!raw) return new Uint8Array(0);
    var f = doc.resolve(obj.Filter);
    var list = Array.isArray(f) ? f.map(function (x) { return doc.resolve(x); }) : f ? [f] : [];
    var data = raw;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === '/FlateDecode' || list[i] === '/Fl') {
        if (!Z) throw new Error('PDF не читается: нет распаковщика.');
        try { data = Z.unzlibSync(data); }
        catch (e) { try { data = Z.inflateSync(data); } catch (e2) { return new Uint8Array(0); } }
      } else return new Uint8Array(0);
    }
    return data;
  }

  /* ----------------------------------------------------------------- fonts */

  function utf16(hex) {
    var out = '';
    for (var i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    if (hex.length === 2) out = String.fromCharCode(parseInt(hex, 16));
    return out;
  }
  function plus(hex, k) {
    if (!k) return utf16(hex);
    var last = parseInt(hex.slice(-4), 16) + k;
    return utf16(hex.slice(0, -4)) + String.fromCharCode(last);
  }
  /** A ToUnicode CMap: code → text. */
  function cmap(text) {
    var map = {}, m, b;
    var chars = /beginbfchar([\s\S]*?)endbfchar/g, ranges = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((b = chars.exec(text))) {
      var pair = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
      while ((m = pair.exec(b[1]))) map[parseInt(m[1], 16)] = utf16(m[2]);
    }
    while ((b = ranges.exec(text))) {
      var r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
      while ((m = r.exec(b[1]))) {
        var lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
        if (hi - lo > 65535) continue;
        if (m[3] != null) for (var c = lo; c <= hi; c++) map[c] = plus(m[3], c - lo);
        else {
          var list = m[4].match(/<([0-9A-Fa-f]*)>/g) || [];
          for (var k = 0; k < list.length && lo + k <= hi; k++) map[lo + k] = utf16(list[k].slice(1, -1));
        }
      }
    }
    return map;
  }
  // a simple font without a ToUnicode map: its code as Windows-1252 (the default of Excel's and Word's simple fonts)
  var CP1252 = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352,
    139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732,
    153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 };
  function glyphName(n) {
    var m = /^uni([0-9A-Fa-f]{4})/.exec(n);
    if (m) return String.fromCharCode(parseInt(m[1], 16));
    if (n === 'space') return ' ';
    if (/^[A-Za-z]$/.test(n)) return n;
    return null;
  }
  function font(doc, fd) {
    var f = { two: false, map: null, w: {}, dw: 1000, diff: null };
    fd = doc.resolve(fd) || {};
    if (fd.Subtype === '/Type0') {
      f.two = true;
      var desc = doc.resolve((doc.resolve(fd.DescendantFonts) || [])[0]) || {};
      f.dw = typeof doc.resolve(desc.DW) === 'number' ? doc.resolve(desc.DW) : 1000;
      var W = doc.resolve(desc.W) || [];
      for (var i = 0; i < W.length;) {
        var a = doc.resolve(W[i]), b = doc.resolve(W[i + 1]);
        if (Array.isArray(b)) { for (var k = 0; k < b.length; k++) f.w[a + k] = doc.resolve(b[k]); i += 2; }
        else { var wv = doc.resolve(W[i + 2]); if (b - a < 65536) for (var c = a; c <= b; c++) f.w[c] = wv; i += 3; }
      }
    } else {
      var first = doc.resolve(fd.FirstChar) || 0, ws = doc.resolve(fd.Widths) || [];
      for (var j = 0; j < ws.length; j++) f.w[first + j] = doc.resolve(ws[j]);
      var d2 = doc.resolve(fd.FontDescriptor) || {};
      // a standard font names no widths: half an em a glyph keeps its words apart
      f.dw = doc.resolve(d2.MissingWidth) || (ws.length ? 0 : 500);
      var enc = doc.resolve(fd.Encoding);
      if (enc && typeof enc === 'object' && enc.Differences) {
        f.diff = {};
        var diffs = doc.resolve(enc.Differences) || [], code = 0;
        for (var q = 0; q < diffs.length; q++) {
          var x = doc.resolve(diffs[q]);
          if (typeof x === 'number') code = x;
          else if (typeof x === 'string') { var ch = glyphName(x.slice(1)); if (ch != null) f.diff[code] = ch; code++; }
        }
      }
    }
    var tu = doc.resolve(fd.ToUnicode);
    if (tu && tu.$raw) f.map = cmap(latin1(decode(tu, doc)));
    return f;
  }
  function charOf(f, code) {
    if (f.map && code in f.map) return f.map[code];
    if (f.two) return '';
    if (f.diff && code in f.diff) return f.diff[code];
    return String.fromCharCode(CP1252[code] || code);
  }

  /* ---------------------------------------------------------------- a page */

  function mul(a, b) {
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
      a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  /** The glyphs and the ruled lines of one content stream (and the forms it draws), in page space. */
  function run(doc, content, res, ctm, out, depth) {
    var lx = new Lexer(content, 0), ops = [], stack = [];
    var g = { ctm: ctm };
    var tm = [1, 0, 0, 1, 0, 0], tlm = tm, fnt = null, fs = 0, tc = 0, tw = 0, th = 1, tl = 0, ts = 0;
    var fonts = {}, path = [], cur = null;
    var fontRes = doc.resolve(res && res.Font) || {}, xres = doc.resolve(res && res.XObject) || {};
    var pt = function (x, y) { return apply(g.ctm, x, y); };
    var flush = function (fill) {
      path.forEach(function (sp) {
        if (sp.length < 2) return;
        var xs = sp.map(function (p) { return p[0]; }), ys = sp.map(function (p) { return p[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        if (fill) {
          if (y1 - y0 <= 2.5 && x1 - x0 > 4) out.h.push({ y: (y0 + y1) / 2, a: x0, b: x1 });
          else if (x1 - x0 <= 2.5 && y1 - y0 > 4) out.v.push({ x: (x0 + x1) / 2, a: y0, b: y1 });
          return;
        }
        for (var i = 1; i < sp.length; i++) {
          var p = sp[i - 1], q = sp[i];
          if (Math.abs(p[1] - q[1]) < 0.8 && Math.abs(p[0] - q[0]) > 4) out.h.push({ y: (p[1] + q[1]) / 2, a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) });
          else if (Math.abs(p[0] - q[0]) < 0.8 && Math.abs(p[1] - q[1]) > 4) out.v.push({ x: (p[0] + q[0]) / 2, a: Math.min(p[1], q[1]), b: Math.max(p[1], q[1]) });
        }
      });
      path = []; cur = null;
    };
    var show = function (str) {
      if (!fnt) return;
      var two = fnt.two;
      for (var i = 0; i < str.length; i += two ? 2 : 1) {
        var code = two ? (str.charCodeAt(i) << 8) | (str.charCodeAt(i + 1) || 0) : str.charCodeAt(i);
        var w = (code in fnt.w ? fnt.w[code] : fnt.dw) / 1000;
        var tx = (w * fs + tc + (!two && code === 32 ? tw : 0)) * th;
        var m = mul(tm, g.ctm), a = apply(m, 0, ts), b = apply(m, tx, ts);
        var size = Math.sqrt(m[2] * m[2] + m[3] * m[3]) * fs;
        out.t.push({ c: charOf(fnt, code), x: a[0], x2: b[0], y: a[1], size: size || 1 });
        tm = mul([1, 0, 0, 1, tx, 0], tm);
      }
    };
    for (;;) {
      var tok = lx.token();
      if (!tok) break;
      if (tok.t !== 'op') { stack.push(lx.value(tok)); continue; }
      var op = tok.v, A = stack;
      stack = [];
      switch (op) {
        case 'q': ops.push(g); g = { ctm: g.ctm }; break;
        case 'Q': if (ops.length) g = ops.pop(); break;
        case 'cm': if (A.length >= 6) g = { ctm: mul(A.slice(-6), g.ctm) }; break;
        case 'BT': tm = tlm = [1, 0, 0, 1, 0, 0]; break;
        case 'ET': break;
        case 'Tf':
          var fname = A[0];
          if (typeof fname === 'string') { if (!(fname in fonts)) fonts[fname] = font(doc, fontRes[fname.slice(1)]); fnt = fonts[fname]; }
          fs = typeof A[1] === 'number' ? A[1] : fs; break;
        case 'Tm': if (A.length >= 6) tm = tlm = A.slice(-6); break;
        case 'Td': tlm = mul([1, 0, 0, 1, A[0] || 0, A[1] || 0], tlm); tm = tlm; break;
        case 'TD': tl = -(A[1] || 0); tlm = mul([1, 0, 0, 1, A[0] || 0, A[1] || 0], tlm); tm = tlm; break;
        case 'T*': tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
        case 'TL': tl = A[0] || 0; break;
        case 'Tc': tc = A[0] || 0; break;
        case 'Tw': tw = A[0] || 0; break;
        case 'Tz': th = (A[0] == null ? 100 : A[0]) / 100; break;
        case 'Ts': ts = A[0] || 0; break;
        case 'Tj': if (A[0] && A[0].s != null) show(A[0].s); break;
        case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (A[0] && A[0].s != null) show(A[0].s); break;
        case '"': tw = A[0] || 0; tc = A[1] || 0; tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (A[2] && A[2].s != null) show(A[2].s); break;
        case 'TJ':
          (Array.isArray(A[0]) ? A[0] : []).forEach(function (x) {
            if (typeof x === 'number') tm = mul([1, 0, 0, 1, -x / 1000 * fs * th, 0], tm);
            else if (x && x.s != null) show(x.s);
          });
          break;
        case 'm': cur = [pt(A[0], A[1])]; path.push(cur); break;
        case 'l': if (cur) cur.push(pt(A[0], A[1])); break;
        case 'c': if (cur) cur.push(pt(A[4], A[5])); break;
        case 'v': case 'y': if (cur) cur.push(pt(A[2], A[3])); break;
        case 're':
          var x = A[0], y = A[1], w2 = A[2], h2 = A[3];
          cur = [pt(x, y), pt(x + w2, y), pt(x + w2, y + h2), pt(x, y + h2), pt(x, y)]; path.push(cur); cur = null; break;
        case 'h': if (cur && cur.length) cur.push(cur[0]); break;
        case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*': flush(true); break;
        case 'S': case 's': flush(false); break;
        case 'n': path = []; cur = null; break;
        case 'Do':
          var xo = doc.resolve(xres[String(A[0]).slice(1)]);
          if (xo && xo.Subtype === '/Form' && xo.$raw && depth < 8) {
            var fm = doc.resolve(xo.Matrix);
            run(doc, latin1(decode(xo, doc)), doc.resolve(xo.Resources) || res, mul(Array.isArray(fm) && fm.length === 6 ? fm : [1, 0, 0, 1, 0, 0], g.ctm), out, depth + 1);
          }
          break;
        case 'BI':
          // an inline image: its data is not syntax — skipped to «EI»
          var ei = content.indexOf('EI', lx.p);
          while (ei > 0 && !(isWs(content.charCodeAt(ei - 1)) && (ei + 2 >= content.length || isWs(content.charCodeAt(ei + 2))))) ei = content.indexOf('EI', ei + 2);
          lx.p = ei < 0 ? content.length : ei + 2;
          break;
        default: break;
      }
    }
  }

  /* ------------------------------------------------------- page → its rows */

  /** Values that lie within `tol` of each other, as one each (their middle). */
  function cluster(values, tol) {
    var v = values.slice().sort(function (a, b) { return a - b; }), out = [];
    for (var i = 0; i < v.length; i++) {
      if (out.length && v[i] - out[out.length - 1].hi <= tol) { var c = out[out.length - 1]; c.hi = v[i]; c.sum += v[i]; c.n++; }
      else out.push({ hi: v[i], sum: v[i], n: 1 });
    }
    return out.map(function (c) { return c.sum / c.n; });
  }

  /** Glyphs into lines of text: by baseline, top first, each line left to right with a space where the page leaves one. */
  function lines(glyphs) {
    var sorted = glyphs.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; }), out = [];
    sorted.forEach(function (gl) {
      var ln = out.length ? out[out.length - 1] : null;
      if (ln && Math.abs(ln.y - gl.y) <= Math.max(1, Math.min(ln.size, gl.size) * 0.4)) ln.g.push(gl);
      else out.push({ y: gl.y, size: gl.size, g: [gl] });
    });
    return out.map(function (ln) {
      ln.g.sort(function (a, b) { return a.x - b.x; });
      var text = '', prev = null;
      ln.g.forEach(function (gl) {
        if (prev && gl.x - prev.x2 > Math.min(prev.size, gl.size) * 0.18 && !/\s$/.test(text) && !/^\s/.test(gl.c)) text += ' ';
        text += gl.c;
        prev = gl;
      });
      return { y: ln.y, size: ln.size, g: ln.g, text: text.replace(/\s+/g, ' ').trim() };
    });
  }
  /** The lines of one cell as its text: a word the cell broke after its hyphen («ПМ-» / «100А») is one word again. */
  function joined(ls) {
    return ls.reduce(function (t, l) {
      if (!l.text) return t;
      if (!t) return l.text;
      return /[^\s-]-$/.test(t) ? t + l.text : t + ' ' + l.text;
    }, '');
  }

  /**
   * One page: its ruled table as rows of cells, the text around it as rows of one cell, top to bottom.
   *
   * The rows are the table's horizontal lines, the columns its vertical ones (each set gathered from the whole page).
   * A glyph is in the cell whose borders are drawn around it: the nearest line above it that passes over it, and the
   * nearest line to its left that passes beside it — so the text of a merged cell (no line through it) lands in its
   * top-left cell, as Excel keeps a merged cell's value.
   */
  function pageRows(glyphs, ruled) {
    var hs = ruled.h.filter(function (l) { return l.b - l.a >= 20; }), vs = ruled.v.filter(function (l) { return l.b - l.a >= 5; });
    var out = [];
    var xs = cluster(vs.map(function (l) { return l.x; }), 2), ys = cluster(hs.map(function (l) { return l.y; }), 2).reverse();
    var nearest = function (list, v) {
      var best = 0;
      for (var i = 1; i < list.length; i++) if (Math.abs(list[i] - v) < Math.abs(list[best] - v)) best = i;
      return best;
    };
    if (xs.length >= 3 && ys.length >= 2) {
      var left = xs[0], right = xs[xs.length - 1], top = ys[0], bottom = ys[ys.length - 1];
      var cells = {}, free = [];
      glyphs.forEach(function (gl) {
        var cx = (gl.x + gl.x2) / 2, cy = gl.y + gl.size * 0.3;
        if (cx < left || cx > right || cy > top || cy < bottom) { free.push(gl); return; }
        var above = null, before = null;
        hs.forEach(function (l) { if (l.y >= cy && l.a - 2 <= cx && cx <= l.b + 2 && (above == null || l.y < above)) above = l.y; });
        vs.forEach(function (l) { if (l.x <= cx && l.a - 2 <= cy && cy <= l.b + 2 && (before == null || l.x > before)) before = l.x; });
        if (above == null || before == null) { free.push(gl); return; }
        var r = Math.min(nearest(ys, above), ys.length - 2), c = Math.min(nearest(xs, before), xs.length - 2);
        ((cells[r] = cells[r] || {})[c] = cells[r][c] || []).push(gl);
      });
      var table = [];
      Object.keys(cells).map(Number).forEach(function (r) {
        var row = [], any = false;
        Object.keys(cells[r]).forEach(function (c) {
          var text = joined(lines(cells[r][c]));
          if (text) { row[+c + 1] = { v: text }; any = true; }
        });
        if (any) table.push({ y: ys[r], row: row });
      });
      lines(free).forEach(function (l) { if (l.text) table.push({ y: l.y, row: [undefined, { v: l.text }] }); });
      table.sort(function (a, b) { return b.y - a.y; });
      table.forEach(function (t) { out.push(t.row); });
      return out;
    }
    // no ruled table: each line of text, split into cells at the wide gaps
    lines(glyphs).forEach(function (l) {
      var row = [undefined], cell = '', prev = null;
      l.g.forEach(function (gl) {
        if (prev && gl.x - prev.x2 > Math.min(prev.size, gl.size) * 1.5) { if (cell.trim()) row.push({ v: cell.replace(/\s+/g, ' ').trim() }); cell = ''; }
        else if (prev && gl.x - prev.x2 > Math.min(prev.size, gl.size) * 0.18 && !/\s$/.test(cell)) cell += ' ';
        cell += gl.c;
        prev = gl;
      });
      if (cell.trim()) row.push({ v: cell.replace(/\s+/g, ' ').trim() });
      if (row.length > 1) out.push(row);
    });
    return out;
  }

  /* -------------------------------------------------------------- the file */

  function pages(doc) {
    var root = null, m;
    var tr = /trailer\s*<</g, last = null;
    while ((m = tr.exec(doc.s))) last = m.index + 7;
    if (last != null) { var t = new Lexer(doc.s, last).value(); root = doc.resolve(t && t.Root); }
    if (!root || root.Type !== '/Catalog') {
      root = null;
      for (var n in doc.at) {
        var o = doc.get(+n);
        if (o && o.Type === '/XRef' && o.Root) root = doc.resolve(o.Root);
        if (o && o.Type === '/Catalog') root = o;
      }
    }
    var out = [], seen = 0;
    // what a page does not say it takes from the node above it: its resources, its turn, its size
    var walk = function (node, up) {
      node = doc.resolve(node);
      if (!node || seen++ > 10000) return;
      var here = {
        res: node.Resources ? doc.resolve(node.Resources) : up.res,
        rotate: node.Rotate != null ? doc.resolve(node.Rotate) : up.rotate,
        box: node.MediaBox ? doc.resolve(node.MediaBox) : up.box
      };
      if (node.Type === '/Pages' || node.Kids) (doc.resolve(node.Kids) || []).forEach(function (k) { walk(k, here); });
      else out.push({ page: node, res: here.res, rotate: here.rotate, box: here.box });
    };
    if (root) walk(root.Pages, { res: null, rotate: 0, box: null });
    if (!out.length) {
      for (var k in doc.at) {
        var p = doc.get(+k);
        if (p && p.Type === '/Page') out.push({ page: p, res: doc.resolve(p.Resources), rotate: doc.resolve(p.Rotate) || 0, box: doc.resolve(p.MediaBox) });
      }
    }
    return out;
  }

  /** The page as it is shown: a page turned by /Rotate is read the right way up. */
  function turn(p) {
    var b = Array.isArray(p.box) && p.box.length === 4 ? p.box : [0, 0, 612, 792];
    var w = b[2] - b[0], h = b[3] - b[1], r = ((Math.round((+p.rotate || 0) / 90) % 4) + 4) % 4;
    if (r === 1) return [0, -1, 1, 0, 0, w];
    if (r === 2) return [-1, 0, 0, -1, w, h];
    if (r === 3) return [0, 1, -1, 0, h, 0];
    return [1, 0, 0, 1, 0, 0];
  }

  function readPdf(bytes) {
    if (!isPdf(bytes)) throw new Error('Это не PDF.');
    if (bytes.length > MAX_MB * 1024 * 1024) throw new Error('PDF больше ' + MAX_MB + ' МБ — такой файл не читается.');
    var doc = new Doc(bytes);
    // (the key of the trailer or of the cross-reference stream: a file someone put a password on)
    if (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(doc.s)) throw new Error('PDF защищён паролем — откройте его и сохраните без защиты.');
    var list = pages(doc), rows = [undefined], glyphs = 0, read = 0;
    list.forEach(function (p) {
      var content = doc.resolve(p.page.Contents), parts = Array.isArray(content) ? content : [content], text = '';
      parts.forEach(function (c) { c = doc.resolve(c); if (c && c.$raw) text += latin1(decode(c, doc)) + '\n'; });
      var got = { t: [], h: [], v: [] };
      run(doc, text, p.res || doc.resolve(p.page.Resources) || {}, turn(p), got, 0);
      var known = got.t.filter(function (gl) { return gl.c !== ''; });
      glyphs += got.t.length;
      read += known.length;
      pageRows(known, got).forEach(function (r) { rows.push(r); });
    });
    if (!list.length) throw new Error('PDF не читается: страницы не найдены.');
    if (!glyphs) throw new Error('В PDF нет текста — это, видимо, скан (картинка). Нужен PDF, сохранённый из Excel, или сам файл Excel.');
    if (!read) throw new Error('Текст этого PDF не извлекается: в его шрифтах нет таблицы символов. Сохраните таблицу из Excel ' +
      'в PDF заново или загрузите сам файл Excel.');
    return { sheets: [{ name: 'PDF', rows: rows, hidden: false }] };
  }

  S.isPdf = isPdf;
  S.readPdf = readPdf;
  /** A table given as a spreadsheet or as a PDF: our reply, a price list. */
  S.readTable = function (bytes) { return isPdf(bytes) ? readPdf(bytes) : S.readXlsx(bytes); };
})(S);
