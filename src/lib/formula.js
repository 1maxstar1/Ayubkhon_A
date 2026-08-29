/*
 * Formula translation.
 *
 * Rows are copied out of the source smeta sheets into the assembled sheet at a
 * different row and one (or four) columns to the right, and then mirrored again
 * into the market-price columns. Excel does this transparently on paste; here we
 * do it explicitly so the exported workbook keeps live, correct formulas instead
 * of frozen numbers.
 */
(function (S) {
  'use strict';

  // A1 / $A$1 references, but not the inside of a quoted string and not a
  // sheet-qualified name we would rather leave alone.
  var REF = /(\$?)([A-Z]{1,3})(\$?)([0-9]{1,7})/g;
  var STR = /"(?:[^"]|"")*"/g;

  /**
   * @param {string} f          formula text, with or without a leading "="
   * @param {function} mapCol   1-based source column -> 1-based target column
   * @param {number} rowDelta   added to every relative row reference
   */
  function translate(f, mapCol, rowDelta) {
    if (typeof f !== 'string' || !f) return f;
    var lead = f.charAt(0) === '=' ? '=' : '';
    var body = lead ? f.slice(1) : f;

    // Protect string literals so "A1" inside text is never rewritten.
    var lits = [];
    body = body.replace(STR, function (m) { lits.push(m); return '\u0001' + (lits.length - 1) + '\u0001'; });

    body = body.replace(REF, function (m, d1, letters, d2, digits, off, whole) {
      // Skip things like Sheet!A1 handled elsewhere, and function-ish tokens
      // (LOG10 -> "G10" would otherwise match) by checking the preceding char.
      var prev = off > 0 ? whole.charAt(off - 1) : '';
      if (/[A-Za-z0-9_.!$]/.test(prev)) return m;
      // LOG10( / ATAN2( are function names, not references; so is Sheet1!A1's name.
      var next = whole.charAt(off + m.length);
      if (next === '(' || next === '!') return m;
      var c = S.colIndex(letters);
      if (c > 16384) return m;
      var nc = mapCol(c);
      var nr = d2 ? +digits : +digits + rowDelta;
      if (nr < 1) nr = 1;
      return d1 + S.col(nc) + d2 + nr;
    });

    body = body.replace(/\u0001(\d+)\u0001/g, function (m, i) { return lits[+i]; });
    return lead + body;
  }

  /**
   * Like translate(), but rows move individually (a sort, or dropped lines)
   * rather than by a constant offset.
   * @param {function(number):?number} mapRow  null/undefined -> reference is dead
   * @returns {?string} null when the formula referenced a row that no longer exists
   */
  function translateMap(f, mapCol, mapRow) {
    if (typeof f !== 'string' || !f) return f;
    var lead = f.charAt(0) === '=' ? '=' : '';
    var body = lead ? f.slice(1) : f;
    var lits = [];
    body = body.replace(STR, function (m) { lits.push(m); return '\u0001' + (lits.length - 1) + '\u0001'; });
    var dead = false;
    body = body.replace(REF, function (m, d1, letters, d2, digits, off, whole) {
      var prev = off > 0 ? whole.charAt(off - 1) : '';
      if (/[A-Za-z0-9_.!$]/.test(prev)) return m;
      // LOG10( / ATAN2( are function names, not references; so is Sheet1!A1's name.
      var next = whole.charAt(off + m.length);
      if (next === '(' || next === '!') return m;
      var c = S.colIndex(letters);
      if (c > 16384) return m;
      var nr = mapRow(+digits);
      if (!nr) { dead = true; return m; }
      return d1 + S.col(mapCol(c)) + d2 + nr;
    });
    if (dead) return null;
    body = body.replace(/\u0001(\d+)\u0001/g, function (m, i) { return lits[+i]; });
    return lead + body;
  }

  /** Build a mapCol function from an explicit {sourceCol: targetCol} table. */
  function tableMap(table, fallback) {
    return function (c) {
      var t = table[c];
      return t === undefined ? (fallback ? fallback(c) : c) : t;
    };
  }

  S.formula = { translate: translate, translateMap: translateMap, tableMap: tableMap };
})(S);
