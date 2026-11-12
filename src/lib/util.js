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

  /**
   * Does `v` look like `base` with VAT on top (× 1,12)? Market prices are typed without VAT, and a price copied from
   * an invoice carries it. To the tiyin under a gross price of 20; beyond that within 0,05 % of it, so a price
   * rounded to whole sums is caught from 1 000 up. Only a hint for the expert: nothing is changed by it.
   */
  function looksGross(v, base) {
    if (!(base > 0) || !(v > base)) return false;
    var g = base * 1.12;
    return Math.abs(v - g) <= Math.max(0.01, Math.min(0.5, g * 5e-4));
  }

  /**
   * A number as it is written in an estimate or typed into a price box; null when the text is not one.
   *
   * One comma or one point is the decimal mark, as it always was: «12,5» and «12.5», and «12,500» is twelve and
   * a half — a comma is the decimal mark in Russian, and quantities are written to three places.
   *
   * What used to be refused, and is read now, is a number written with its thousands grouped: «1 234 567,89»
   * was always read (spaces go), but «1,234,567.89», «1.234.567,89» and «1,234,567» were not a number at all —
   * and a price box given one quietly put the estimate's price back. With both marks present the one written
   * last is the decimal mark and the other groups thousands; a mark written more than once groups thousands.
   * Groups must be of three digits, so «4.1.1» and «12.11.2026» stay what they are: not numbers. A leading «+»
   * and the typographic minus are read too.
   */
  function grouped(head, mark) {
    var parts = head.replace(/^-/, '').split(mark);
    if (!/^\d{1,3}$/.test(parts[0])) return false;
    for (var i = 1; i < parts.length; i++) if (!/^\d{3}$/.test(parts[i])) return false;
    return true;
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') {
      var t = v.replace(NBSP, '').replace(/\s/g, '').replace(/\u2212/g, '-');
      if (t.charAt(0) === '+') t = t.slice(1);
      var commas = t.split(',').length - 1, points = t.split('.').length - 1;
      if (commas && points) {
        var dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.', grp = dec === ',' ? '.' : ',';
        var cut = t.split(dec);
        if (cut.length !== 2 || !grouped(cut[0], grp)) return null;
        t = cut[0].split(grp).join('') + '.' + cut[1];
      } else if (commas > 1 || points > 1) {
        var mark = commas > 1 ? ',' : '.';
        if (!grouped(t, mark)) return null;
        t = t.split(mark).join('');
      } else t = t.replace(',', '.');
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
  S.near = near; S.num = num;
  S.vat = { RATE: 0.12, looksGross: looksGross };
  S.money = money; S.price = price; S.qty = qty; S.debounce = debounce;

  /*
   * The interface is Russian (CLAUDE.md). Values the server stores as codes — a market, a role, an export mode —
   * are shown through this one vocabulary, so the same thing has the same Russian name on every page.
   *   S.ru('role', 'ekspert') → 'Эксперт';  a code it does not know comes back as it is.
   */
  S.RU = {
    market: { internal: 'Внутренний рынок', 'export': 'Экспортный рынок' },
    role: { admin: 'Администратор', ekspert: 'Эксперт' },
    mode: { changed: 'Только изменённые', dedup: 'Все ресурсы', full: 'Полная копия' }
  };
  S.ru = function (group, code) { return (S.RU[group] || {})[code] || code; };
})(S);
if (typeof self !== 'undefined') self.S = S;
