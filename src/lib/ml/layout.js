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
 *   x  y     text with letters: short, long (over 24 characters)
 *   z        text without letters that is not a number («—», «4.1.1»); a number written as text («12», «1.1»,
 *            «1 234,5») is coded as a number
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
 *   S.ml.layout.check(objects)             → { items, rows, ok, score } — rows: the lines with all three numbers; ok:
 *                                            of them, quantity × price = sum (S.ml.layout.agree); score: ok / rows
 *   S.ml.layout.agree(a, b)                → a is b, give or take how b was rounded: a sum printed whole may be off by
 *                                            half a sum; one with a fraction, by a thousandth of itself (or 0.005)
 *   S.ml.layout.DOUBT                      a read file whose score is under this is «read, sums do not agree»: kept whole
 *                                            and listed to be looked at (one threshold for the page, the admin and tests)
 *   S.ml.layout.doubtful(fmt)              → that, for a description
 *   S.ml.layout.sha256(bytes)              → hex — which file this is: S.refs.pkg.sha256 (src/lib/refs/package.js, pure
 *                                            JS: crypto.subtle is absent on plain-http pages), loaded beside this file
 *   S.ml.layout.describe(bytes, wb, objects) → { v, hash, size, read, objects, items, checked, score, doubt, signature, sample }
 *
 * Changing what a sample holds raises VERSION: the samples kept so far are then made again from their files.
 * Pure — no page, no server, no clock.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var ML = S.ml = S.ml || {};

  // 2 (v2.16.1): quantity × price = sum by agree() (a flat half made small numbers agree), and `doubt` in the description
  var VERSION = 2;
  var DOUBT = 0.9;
  var MAX_SHEETS = 12, MAX_ROWS = 600, MAX_COLS = 30, MAX_NUMS = 10, TOP_REL = 6;
  var LETTER = /[A-Za-zЀ-ӿ]/;

  /* ------------------------------------------------------------------ a cell */
  // units by their matching key (S.matchUnitKey: «ТН» and «Т» are one, «компл.» is «KT»), the number in front left out
  var UNITS = {};
  ('T KG G GR TS M M2 M3 KM SM MM DM L ML SHT KT CHELCH MASHCH CHELCHAS MASHCHAS CHELDN MASHSM TKM TNKM GA PARA UPAK RULON ' +
    'LIST MESTO BALLON KVT KVTCH CHAS CH SUTKI MES SMENA EKZ BUHTA PACH BANKA FLAKON YASHIK MESHOK UZEL TOCHKA SEKTSIYA ' +
    'ELEMENT OPORA SKVAZHINA PROLET STYK PRIBOR USTROISTVO SOEDINENIE KONTSEVAYA GOLOVKA').split(' ').forEach(function (u) { UNITS[u] = 1; });

  function tail(key) { return String(key || '').replace(/^\d+/, ''); }
  /** `u`: the text's name key, computed once by code(). */
  function isUnit(t, u) {
    if (t.length > 24 || !S.matchUnitKey) return false;
    if (UNITS[tail(S.matchUnitKey(t))]) return true;
    // «1000 М3 ГРУНТА», «100М2 ПЛОЩАДИ»: the unit and what it is of
    var words = u.split(' ').filter(function (w) { return w && !/^\d+$/.test(w); });
    return words.length > 1 && words.length <= 3 && !!UNITS[tail(S.matchUnitKey(words[0]))];
  }

  /** A word a header (or a total, a section) is made of → its character, or ''. `u`: the text's name key. */
  function headCode(t, u) {
    if (t.length > 120) return '';
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
    var u = t.length > 120 ? '' : S.nameKey(t);
    return headCode(t, u) || (isUnit(t, u) ? 'u' : (t.length > 24 ? 'y' : 'x'));
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

  /**
   * a is b, give or take how b was rounded. A sum printed as a whole number may be off by half a sum (the estimate's
   * own rounding, as assemble.js counts it); one printed with a fraction, by a thousandth of itself or half a tiyin.
   * A flat half for every number made 0.3 × 0.5 «agree» with 0.6.
   */
  function agree(a, b) {
    var whole = Math.abs(b - Math.round(b)) < 1e-9;
    return Math.abs(a - b) <= (whole ? 0.51 : Math.max(0.005, Math.abs(b) * 0.001));
  }

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
            if (k === i || k === j || !agree(p, nums[k][1])) continue;
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
    var out = { items: 0, rows: 0, ok: 0, score: null };
    (objects || []).forEach(function (o) {
      (o.rows || []).forEach(function (r) {
        if (r.kind !== 'item') return;
        out.items++;
        if (r.qty == null || r.price == null || r.sum == null) return;
        out.rows++;
        if (agree(r.qty * r.price, r.sum)) out.ok++;
      });
    });
    if (out.rows) out.score = Math.round(out.ok / out.rows * 1e4) / 1e4;
    return out;
  }

  function doubtful(fmt) { return !!(fmt && fmt.read && fmt.checked > 0 && fmt.score != null && fmt.score < DOUBT); }

  /* ------------------------------------------------------------------ which file */
  function sha256(bytes) {
    if (!S.refs || !S.refs.pkg || !S.refs.pkg.sha256) throw new Error('layout.js: src/lib/refs/package.js is not loaded');
    return S.refs.pkg.sha256(bytes);
  }

  /** Everything kept about one file: which file, how it was read, and its sample. `wb` null: it could not be opened. */
  function describe(bytes, wb, objects) {
    var objs = objects || [], out = { v: VERSION, hash: sha256(bytes), size: bytes.length, read: objs.length > 0,
      objects: objs.length, items: 0, checked: 0, score: null, doubt: false, signature: '', sample: null };
    if (!wb) return out;
    var ck = check(objs);
    out.items = ck.items; out.checked = ck.rows; out.score = ck.score;
    out.doubt = doubtful(out);
    out.sample = sample(wb, objs);
    out.signature = signature(out.sample);
    return out;
  }

  ML.layout = { VERSION: VERSION, DOUBT: DOUBT, MAX_SHEETS: MAX_SHEETS, MAX_ROWS: MAX_ROWS, MAX_COLS: MAX_COLS,
    code: code, grid: grid, relations: relations, sample: sample, signature: signature, check: check, agree: agree,
    doubtful: doubtful, sha256: sha256, describe: describe };
})(S);
