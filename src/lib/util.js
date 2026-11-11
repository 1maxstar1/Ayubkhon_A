/* Shared helpers. Loaded first; everything hangs off the global `S` namespace. */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';

  var A = 'A'.charCodeAt(0);

  /** 1-based column index -> spreadsheet column letters (1 -> "A", 27 -> "AA"). */
  function colName(n) {
    var s = '';
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(A + r) + s; n = (n - r - 1) / 26; }
    return s;
  }
  /** "AB" -> 28. */
  function colIndex(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - A + 1);
    return n;
  }

  var CACHE = [];
  for (var i = 1; i <= 64; i++) CACHE[i] = colName(i);
  function col(n) { return CACHE[n] || colName(n); }

  var CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
  function esc(s) {
    if (s == null) return '';
    s = String(s);
    return s.replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    }).replace(CTRL, '');
  }

  var NBSP = /[   ]/g;

  /** Money-ish comparison: smeta numbers carry long binary-float tails. */
  function near(a, b) {
    if (a == null || b == null) return a === b;
    var d = Math.abs(a - b);
    return d < 1e-6 || d < Math.abs(a) * 1e-9;
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') {
      var t = v.replace(NBSP, '').replace(/\s/g, '').replace(',', '.');
      if (t === '' || !/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return null;
      var n = parseFloat(t);
      return isFinite(n) ? n : null;
    }
    return null;
  }

  /**
   * A number the way a person types it into a price field.
   *
   * num() above reads what a file holds and is left exactly as it is — the estimates are read through it. A
   * person types «1 234,56», pastes «1,234.56» or «1.234,56» from another table, or a minus that is not the
   * keyboard's; num() answers null to those, and the field then quietly put the estimate's price back.
   *
   *   - spaces of any kind and apostrophes between digits are grouping; «−» and «–» are a minus; «+» is allowed;
   *   - with both «,» and «.» the last one is the decimal mark and the other one groups thousands;
   *   - one mark repeated («1.234.567») groups thousands;
   *   - a single mark is the decimal mark, as before — but «12,500» can also be twelve thousand five hundred,
   *     so that reading is handed back too (`alt`) for the field to offer.
   *
   * @returns {{v: ?number, empty: boolean, alt: (number|undefined)}}  v is null when the text is not a number
   */
  function typed(text) {
    var t = String(text == null ? '' : text).replace(NBSP, '').replace(/[\s'’`]/g, '').replace(/[\u2212\u2013\u2014]/g, '-');
    if (t === '') return { v: null, empty: true };
    var no = { v: null, empty: false };
    if (/e/i.test(t)) { var e = num(t); return e == null ? no : { v: e, empty: false }; }
    var m = /^([-+]?)([\d.,]+)$/.exec(t);
    if (!m || !/\d/.test(m[2])) return no;
    var sign = m[1] === '-' ? -1 : 1;
    var body = m[2].replace(/[.,]$/, '');                 // «12,» on the way to «12,5» is twelve
    var commas = body.split(',').length - 1, dots = body.split('.').length - 1;
    var GROUPS = /^\d{1,3}(?:[.,]\d{3})+$/;
    var out, alt;
    if (!commas && !dots) out = +body;
    else if (commas && dots) {
      var dec = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.';
      var cut = body.lastIndexOf(dec);
      var whole = body.slice(0, cut), frac = body.slice(cut + 1);
      // the decimal mark once; the other one only before it, and in threes
      if ((dec === ',' ? commas : dots) !== 1 || !/^\d+$/.test(frac) || !GROUPS.test(whole)) return no;
      out = +(whole.replace(/[.,]/g, '') + '.' + frac);
    } else if (commas + dots > 1) {
      if (!GROUPS.test(body)) return no;
      out = +body.replace(/[.,]/g, '');
    } else {
      var p = body.split(/[.,]/);
      if (!/^\d*$/.test(p[0]) || !/^\d+$/.test(p[1])) return no;
      out = +((p[0] || '0') + '.' + p[1]);
      if (p[1].length === 3 && /^[1-9]\d{0,2}$/.test(p[0])) alt = +(p[0] + p[1]);
    }
    if (!isFinite(out)) return no;
    var res = { v: sign * out, empty: false };
    if (alt != null) res.alt = sign * alt;
    return res;
  }

  var NF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var NF3 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
  function money(v) {
    if (v == null) return '';
    var n = Math.round(v);
    return NF.format(n === 0 ? 0 : n);   // never render "-0"
  }
  /** Unit prices keep their fractional tail, the way the sheet shows them. */
  function price(v) {
    if (v == null) return '';
    return Math.abs(v - Math.round(v)) < 5e-4 ? NF.format(Math.round(v)) : NF3.format(v);
  }
  function qty(v) { return v == null ? '' : NF3.format(v); }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  /**
   * Where the page is, kept in the address (#ws=…&tab=…) so a reload (Cmd+R / F5) comes back to
   * the same workspace and tab. replaceState: moving around adds nothing to the back button.
   */
  function hashGet(k) {
    var m = new RegExp('(?:^|[#&])' + k + '=([^&]*)').exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : '';
  }
  function hashSet(k, v) {
    var parts = (location.hash || '').replace(/^#/, '').split('&').filter(function (x) { return x && x.split('=')[0] !== k; });
    if (v) parts.push(k + '=' + encodeURIComponent(v));
    var h = parts.length ? '#' + parts.join('&') : '';
    try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { location.hash = h; }
  }
  S.hashGet = hashGet; S.hashSet = hashSet;

  S.col = col; S.colIndex = colIndex; S.esc = esc;
  S.near = near; S.num = num; S.typed = typed;
  S.money = money; S.price = price; S.qty = qty; S.debounce = debounce;
})(S);
if (typeof self !== 'undefined') self.S = S;
