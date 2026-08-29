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

  var NBSP = /[   ]/g;
  var APOS = /[`‘’ʻʼ]/g;

  /**
   * Resource-name key. Prices are keyed by name so one edit propagates to every
   * occurrence across every street and every sheet — the whole point of the
   * "adjust once, apply everywhere" workflow.
   */
  function nameKey(s) {
    return String(s == null ? '' : s)
      .replace(NBSP, ' ')
      .replace(APOS, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function unitKey(s) { return nameKey(s).replace(/[.\-\s]/g, ''); }

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

  S.col = col; S.colIndex = colIndex; S.esc = esc;
  S.nameKey = nameKey; S.unitKey = unitKey; S.near = near; S.num = num;
  S.money = money; S.price = price; S.qty = qty; S.debounce = debounce;
})(S);
if (typeof self !== 'undefined') self.S = S;
