/*
 * What a smeta file looks like, without what it says (docs/format-reja.md) — the data the program keeps so that it
 * can learn to read formats nobody has written a rule for.
 *
 * Estimates come from many programs and in many layouts. The rules (src/lib/smeta.js) read the ones they know; a
 * file they refuse is answered with a new rule. Every file uploaded as a project leaves a *sample* of its layout,
 * and for a file the rules read, the sample carries the answer — where the header stands, which column is which,
 * what kind of line each row is. Enough such samples train a model that proposes a layout for a file the rules
 * cannot read.
 *
 * A sample holds no name and no price. A cell is one character — what kind of thing stands there:
 *
 *   .        empty                             0…9  a whole number, by its number of digits − 1 (capped at 9)
 *   a…j      a number with a fraction (by the digits of its whole part)
 *   A…J      a whole number, by a formula      K…T  a number with a fraction, by a formula
 *   x  y     text with letters: short, long (over 24 characters)       z  text without letters («1.1», «-»)
 *   w        a formula that gives no number    u    a unit of measure («м3», «100 шт», «маш.-ч»)
 *   words a header is made of:
 *   #  №, N п/п      @  наименование     %  ед. изм.      *  кол-во, количество     $  цена, на единицу
 *   +  сумма, всего, общая, стоимость    &  шифр, код     =  итого …, всего по …     !  раздел …
 *   ^  a band («трудовые ресурсы», «машины и механизмы», «материалы», «оборудование»)
 *   ~  примечание    :  сум
 *
 *   S.ml.layout.code(cell)                 → that character
 *   S.ml.layout.grid(sheet)                → [row string…] — rows 1…600, columns 1…30, trailing empties cut
 *   S.ml.layout.relations(sheet)           → { rel: [[a, b, c, n]…], rows } — the column triples with a × b = c, how
 *                                            many rows hold each (the six most frequent), and per row which of them
 *   S.ml.layout.sample(wb, objects)        → { v, total, sheets: [{ i, rows, cols, g, rel, rr, k, b }] }
 *                                            k: per row, what the rules read it as (i item · s section · t total ·
 *                                            h header · n numbering · e extra · b blank · . outside); b: the blocks
 *                                            [{ from, to, L: { no, name, unit, qty, price, sum, code, headerRow, … } }]
 *   S.ml.layout.signature(sample)          → 16 hex: files of one format share it (headers and column places)
 *   S.ml.layout.check(objects)             → { items, rows, ok, score, totals, totalsOk } — quantity × price = sum
 *   S.ml.layout.sha256(bytes)              → hex — which file this is (crypto.subtle is absent on plain-http pages)
 *   S.ml.layout.describe(bytes, wb, objects) → { v, hash, size, read, objects, items, checked, score, signature, sample }
 *                                            checked: the lines that have all three numbers; score: of them, agreeing
 *
 * Changing what a sample holds raises VERSION: the samples kept so far are then made again from their files.
 * Pure — no page, no server, no clock.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};

  var VERSION = 1;
  var MAX_SHEETS = 12, MAX_ROWS = 600, MAX_COLS = 30, MAX_NUMS = 10, TOP_REL = 6;
  var LETTER = /[A-Za-zЀ-ӿ]/;

  /* ------------------------------------------------------------------ a cell */
  // units by their matching key (S.matchUnitKey: «ТН» and «Т» are one, «компл.» is «KT»), the number in front left out
  var UNITS = {};
  ('T KG G GR TS M M2 M3 KM SM MM DM L ML SHT KT CHELCH MASHCH CHELCHAS MASHCHAS CHELDN MASHSM TKM TNKM GA PARA UPAK RULON ' +
    'LIST MESTO BALLON KVT KVTCH CHAS CH SUTKI MES SMENA EKZ BUHTA PACH BANKA FLAKON YASHIK MESHOK UZEL TOCHKA SEKTSIYA ' +
    'ELEMENT OPORA SKVAZHINA PROLET STYK PRIBOR USTROISTVO SOEDINENIE KONTSEVAYA GOLOVKA').split(' ').forEach(function (u) { UNITS[u] = 1; });

  function tail(key) { return String(key || '').replace(/^\d+/, ''); }
  function isUnit(t) {
    if (t.length > 24 || !S.matchUnitKey) return false;
    if (UNITS[tail(S.matchUnitKey(t))]) return true;
    // «1000 М3 ГРУНТА», «100М2 ПЛОЩАДИ»: the unit and what it is of
    var words = S.nameKey(t).split(' ').filter(function (w) { return w && !/^\d+$/.test(w); });
    return words.length > 1 && words.length <= 3 && !!UNITS[tail(S.matchUnitKey(words[0]))];
  }

  /** A word a header (or a total, a section) is made of → its character, or ''. */
  function headCode(t) {
    if (t.length > 120) return '';
    var u = S.nameKey(t);
    if (!u) return /^\s*№/.test(t) ? '#' : '';
    if (/^\s*№/.test(t) || /^N( П П)?$/.test(u) || u === 'П П') return '#';
    if (u.indexOf('НАИМЕНОВАНИЕ') === 0) return '@';
    if ((/^ЕД/.test(u) && u.indexOf('ИЗМ') > 0)) return '%';
    if (u.indexOf('КОЛ ВО') === 0 || u.indexOf('КОЛВО') === 0 || u.indexOf('КОЛИЧЕСТВО') === 0 || /^СМЕТНАЯ ПОТРЕБ/.test(u)) return '*';
    if (u.indexOf('ЦЕНА') === 0 || u.indexOf('НА ЕДИНИЦУ') === 0 || u === 'ЕДИНИЦЫ' || u.indexOf('СТОИМОСТЬ ЗА') === 0 ||
        u.indexOf('СМЕТНАЯ ЦЕНА') === 0) return '$';
    if (u.indexOf('СУММА') === 0 || u === 'ВСЕГО' || u === 'ОБЩАЯ' || u.indexOf('ОБЩАЯ СТОИМОСТЬ') === 0 ||
        u.indexOf('СМЕТНАЯ СТОИМОСТЬ') === 0 || u === 'СТОИМОСТЬ') return '+';
    if (u.indexOf('ШИФР') === 0 || /^КОД( |$)/.test(u) || u.indexOf('ОБОСНОВАНИЕ') === 0) return '&';
    if (/^(ИТОГО|ВСЕГО)( |$)/.test(u)) return '=';
    if (/^РАЗДЕЛ( |$)/.test(u)) return '!';
    if (u.indexOf('ПРИМЕЧАНИЕ') === 0) return '~';
    if (u === 'СУМ') return ':';
    if (t.length <= 70 && S.smeta && S.smeta.sectionOf && S.smeta.sectionOf(t) !== 'other') return '^';
    return '';
  }

  function numCode(v, formula) {
    var a = Math.floor(Math.abs(v));
    var b = a < 1 ? 0 : Math.min(9, Math.floor(Math.log(a) / Math.LN10 + 1e-9));
    var whole = Math.abs(v - Math.round(v)) < 1e-9;
    return String.fromCharCode((formula ? (whole ? 65 : 75) : (whole ? 48 : 97)) + b);
  }

  function numOf(cell) {
    if (!cell || cell.v == null || cell.v === '') return null;
    if (typeof cell.v === 'number') return isFinite(cell.v) ? cell.v : null;
    if (typeof cell.v !== 'string') return null;
    var t = cell.v.trim();
    if (!t || LETTER.test(t)) return null;
    return S.num(t);
  }

  function code(cell) {
    if (!cell) return '.';
    var v = cell.v, f = cell.f != null && cell.f !== '';
    if (v == null || v === '') return f ? 'w' : '.';
    if (typeof v === 'number') return isFinite(v) ? numCode(v, f) : 'z';
    if (typeof v !== 'string') return 'z';
    var t = v.trim();
    if (!t) return f ? 'w' : '.';
    if (!LETTER.test(t)) {
      if (/^\s*№/.test(t)) return '#';
      var n = S.num(t);
      return n != null ? numCode(n, f) : 'z';
    }
    return headCode(t) || (isUnit(t) ? 'u' : (t.length > 24 ? 'y' : 'x'));
  }

  /* ------------------------------------------------------------------ a sheet */
  function grid(sheet) {
    var rows = sheet.rows || [], out = [], last = Math.min(rows.length - 1, MAX_ROWS);
    for (var r = 1; r <= last; r++) {
      var cells = rows[r] || [], s = '', n = Math.min(cells.length - 1, MAX_COLS);
      for (var c = 1; c <= n; c++) s += code(cells[c]);
      out.push(s.replace(/\.+$/, ''));
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }

  function about(a, b) { return Math.abs(a - b) <= Math.max(0.51, Math.abs(b) * 0.001); }

  /** Which columns multiply into which: the trace quantity × price = sum leaves, whatever the columns are called. */
  function relations(sheet) {
    var rows = sheet.rows || [], last = Math.min(rows.length - 1, MAX_ROWS), count = {}, per = [];
    for (var r = 1; r <= last; r++) {
      var cells = rows[r] || [], nums = [], n = Math.min(cells.length - 1, MAX_COLS), found = [];
      for (var c = 1; c <= n && nums.length < MAX_NUMS; c++) {
        var v = numOf(cells[c]);
        if (v != null && v !== 0) nums.push([c, v]);
      }
      for (var i = 0; i < nums.length; i++) {
        for (var j = i + 1; j < nums.length; j++) {
          var p = nums[i][1] * nums[j][1];
          for (var k = 0; k < nums.length; k++) {
            if (k === i || k === j || !about(p, nums[k][1])) continue;
            var key = nums[i][0] + ',' + nums[j][0] + ',' + nums[k][0];
            count[key] = (count[key] || 0) + 1;
            found.push(key);
          }
        }
      }
      per.push(found);
    }
    var top = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1); }).slice(0, TOP_REL);
    var place = {};
    top.forEach(function (k, i) { place[k] = i; });
    var mask = per.map(function (found) {
      var best = -1;
      found.forEach(function (k) { if (place[k] != null && (best < 0 || place[k] < best)) best = place[k]; });
      return best < 0 ? '.' : String(best);
    }).join('').replace(/\.+$/, '');
    return { rel: top.map(function (k) { return k.split(',').map(Number).concat(count[k]); }), rows: mask };
  }

  var KIND = { item: 'i', section: 's', total: 't', header: 'h', numbering: 'n', extra: 'e', blank: 'b' };
  var ROLES = ['no', 'name', 'unit', 'qty', 'price', 'sum', 'code', 'headerRow', 'subRow', 'numRow'];
  var FLAGS = ['need', 'transport', 'guessed'];

  /** What the rules read on one sheet: the blocks with their layout, and the kind of every row. */
  function labels(objs, height) {
    var kinds = [], blocks = [];
    for (var r = 0; r < height; r++) kinds.push('.');
    objs.forEach(function (o) {
      var L = o.layout || {}, slim = {}, from = 0, to = 0;
      ROLES.forEach(function (k) { if (L[k]) slim[k] = L[k]; });
      FLAGS.forEach(function (k) { if (L[k]) slim[k] = 1; });
      (o.rows || []).forEach(function (row) {
        if (!from || row.r < from) from = row.r;
        if (row.r > to) to = row.r;
        if (row.r >= 1 && row.r <= height) kinds[row.r - 1] = KIND[row.kind] || 'e';
      });
      blocks.push({ from: from, to: to, L: slim });
    });
    return { k: kinds.join('').replace(/\.+$/, ''), b: blocks };
  }

  /** The sample of a workbook: its visible sheets (those the rules read first), each as characters. */
  function sample(wb, objects) {
    var sheets = (wb && wb.sheets) || [], byIndex = {}, order = [], visible = 0;
    (objects || []).forEach(function (o) { (byIndex[o.index] = byIndex[o.index] || []).push(o); });
    sheets.forEach(function (sh, i) { if (!sh.hidden) { visible++; if (byIndex[i]) order.push(i); } });
    sheets.forEach(function (sh, i) { if (!sh.hidden && !byIndex[i]) order.push(i); });
    var out = order.slice(0, MAX_SHEETS).map(function (i) {
      var sh = sheets[i], g = grid(sh), rel = relations(sh);
      var one = { i: i, rows: Math.max(0, (sh.rows || []).length - 1), cols: sh.maxCol || 0, g: g, rel: rel.rel, rr: rel.rows };
      if (byIndex[i]) { var lab = labels(byIndex[i], g.length); one.k = lab.k; one.b = lab.b; }
      return one;
    });
    return { v: VERSION, total: visible, sheets: out };
  }

  /* ------------------------------------------------------------------ which format */
  function fnv(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  var HEADISH = /[#@%*$+&]/g;

  /**
   * Files of one format share a signature: for a sheet the rules read — its header rows as characters and the places
   * of its columns; for one they did not — the first row that looks like a header. Counts of sheets and rows do not
   * enter it: ten streets in one file and one street in another are the same format.
   */
  function signature(smp) {
    var parts = {};
    ((smp && smp.sheets) || []).forEach(function (sh) {
      if (sh.b && sh.b.length) {
        sh.b.forEach(function (b) {
          var L = b.L || {};
          var cols = ['no', 'name', 'unit', 'qty', 'price', 'sum', 'code'].map(function (k) { return L[k] || 0; }).join('.');
          var head = (L.headerRow ? sh.g[L.headerRow - 1] || '' : '') + '/' + (L.subRow ? sh.g[L.subRow - 1] || '' : '');
          parts['R' + FLAGS.map(function (k) { return L[k] ? 1 : 0; }).join('') + '|' + cols + '|' + head] = 1;
        });
        return;
      }
      for (var r = 0; r < Math.min(sh.g.length, 40); r++) {
        var m = sh.g[r].match(HEADISH);
        if (m && m.length >= 3) { parts['U|' + sh.g[r]] = 1; return; }
      }
    });
    var keys = Object.keys(parts).sort();
    // only what the rules read tells the format of a read file: the other sheets of the workbook vary freely
    var read = keys.filter(function (k) { return k.charAt(0) === 'R'; });
    var s = (read.length ? read : keys).join(';') || 'none';
    return fnv(s, 2166136261) + fnv(s, 3339675911);
  }

  /* ------------------------------------------------------------------ does the reading add up */
  function check(objects) {
    var out = { items: 0, rows: 0, ok: 0, score: null, totals: 0, totalsOk: 0 };
    (objects || []).forEach(function (o) {
      var band = 0, all = 0;
      (o.rows || []).forEach(function (r) {
        if (r.kind === 'section') { band = 0; return; }
        if (r.kind === 'item') {
          out.items++;
          var line = r.sum != null ? r.sum : (r.qty != null && r.price != null ? r.qty * r.price : 0);
          band += line; all += line;
          if (r.qty == null || r.price == null || r.sum == null) return;
          out.rows++;
          if (about(r.qty * r.price, r.sum)) out.ok++;
          return;
        }
        // a total that directly closes its band, or the object so far: counted apart, it does not enter the score
        if (r.kind === 'total' && r.sum != null && /^\s*ИТОГО/i.test(r.nm || '')) {
          out.totals++;
          if (about(band, r.sum) || about(all, r.sum)) out.totalsOk++;
        }
      });
    });
    if (out.rows) out.score = Math.round(out.ok / out.rows * 1e4) / 1e4;
    return out;
  }

  /* ------------------------------------------------------------------ which file */
  var K = [];
  (function () {
    var n = 2, i = 0;
    while (i < 64) {
      var prime = true;
      for (var d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (prime) { var c = Math.pow(n, 1 / 3); K[i++] = ((c - Math.floor(c)) * 4294967296) >>> 0; }
      n++;
    }
  })();

  function sha256(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length, total = ((len + 9 + 63) >> 6) << 6, w = new Int32Array(64), block = new Uint8Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var q = 0; q < 64; q++) {
        var at = off + q;
        block[q] = at < len ? bytes[at] : at === len ? 0x80 : 0;
      }
      if (off + 64 === total) {
        var hi = Math.floor(len / 536870912), lo = (len << 3) >>> 0;
        block[56] = hi >>> 24; block[57] = hi >>> 16; block[58] = hi >>> 8; block[59] = hi;
        block[60] = lo >>> 24; block[61] = lo >>> 16; block[62] = lo >>> 8; block[63] = lo;
      }
      for (var t = 0; t < 16; t++) w[t] = (block[t * 4] << 24) | (block[t * 4 + 1] << 16) | (block[t * 4 + 2] << 8) | block[t * 4 + 3];
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('0000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  /** Everything kept about one file: which file, how it was read, and its sample. `wb` null: it could not be opened. */
  function describe(bytes, wb, objects) {
    var objs = objects || [], out = { v: VERSION, hash: sha256(bytes), size: bytes.length, read: objs.length > 0,
      objects: objs.length, items: 0, checked: 0, score: null, signature: '', sample: null };
    if (!wb) return out;
    var ck = check(objs);
    out.items = ck.items; out.checked = ck.rows; out.score = ck.score;
    out.sample = sample(wb, objs);
    out.signature = signature(out.sample);
    return out;
  }

  ML.layout = { VERSION: VERSION, MAX_SHEETS: MAX_SHEETS, MAX_ROWS: MAX_ROWS, MAX_COLS: MAX_COLS,
    code: code, grid: grid, relations: relations, sample: sample, signature: signature, check: check, sha256: sha256, describe: describe };
})(S);
