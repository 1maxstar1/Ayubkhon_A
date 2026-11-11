/*
 * A small spreadsheet evaluator for tests that read an exported workbook back: numbers, references, ranges,
 * + - * /, unary signs, parentheses and SUM. That is everything the program itself writes.
 *
 *   const { makeSheetCalc } = require('./calc.cjs');
 *   const calc = makeSheetCalc(sheet);            // a sheet as S.readXlsx returns it
 *   calc.value(row, col)                          // a number, a string, null, or { err: '#CIRC' | '#VALUE!' | … }
 *
 * As in Excel: text in arithmetic is an error, text and blanks inside a SUM range are skipped, and a formula
 * that reaches itself is a circular reference.
 */
function colIdx(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function makeSheetCalc(sheet) {
  const memo = new Map(), busy = new Set();
  function cell(r, c) { const row = sheet.rows[r]; return row && row[c] || null; }
  function value(r, c) {
    const k = r + ':' + c;
    if (memo.has(k)) return memo.get(k);
    const ce = cell(r, c);
    let v;
    if (!ce) v = null;
    else if (ce.f != null) {
      if (busy.has(k)) v = { err: '#CIRC' };
      else { busy.add(k); try { v = evalFormula(ce.f); } catch (e) { v = { err: '#PARSE ' + e.message + ' in ' + ce.f }; } busy.delete(k); }
    } else v = ce.v;
    memo.set(k, v);
    return v;
  }
  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v && v.err) throw v;
    throw { err: '#VALUE!' };
  }
  function evalFormula(f) {
    let s = f.charAt(0) === '=' ? f.slice(1) : f, i = 0;
    function ws() { while (s[i] === ' ') i++; }
    function expr() { let a = term(); for (;;) { ws(); const ch = s[i]; if (ch === '+') { i++; a = num(a) + num(term()); } else if (ch === '-') { i++; a = num(a) - num(term()); } else return a; } }
    function term() { let a = unary(); for (;;) { ws(); const ch = s[i]; if (ch === '*') { i++; a = num(a) * num(unary()); } else if (ch === '/') { i++; const d = num(unary()); if (d === 0) throw { err: '#DIV/0!' }; a = num(a) / d; } else return a; } }
    function unary() { ws(); if (s[i] === '-') { i++; return -num(unary()); } if (s[i] === '+') { i++; return num(unary()); } return atom(); }
    function ref() {
      const m = /^\$?([A-Z]{1,3})\$?(\d+)/.exec(s.slice(i));
      if (!m) return null; i += m[0].length; return { c: colIdx(m[1]), r: +m[2] };
    }
    function atom() {
      ws();
      if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i] !== ')') throw new Error('missing )'); i++; return v; }
      const fm = /^([A-Z]+)\(/.exec(s.slice(i));
      if (fm) {
        if (fm[1] !== 'SUM') throw new Error('function ' + fm[1]);
        i += fm[0].length; let total = 0;
        for (;;) {
          ws(); const save = i; const a = ref();
          if (a && s[i] === ':') { i++; const b = ref(); if (!b) throw new Error('range');
            for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) { const v = value(r, c); if (typeof v === 'number') total += v; else if (v && v.err) throw v; }
          } else { i = save; total += num(expr()); }
          ws(); if (s[i] === ',' || s[i] === ';') { i++; continue; } if (s[i] === ')') { i++; break; } throw new Error('SUM args at ' + i);
        }
        return total;
      }
      const a = ref(); if (a) return value(a.r, a.c);
      const nm = /^\d+(\.\d+)?([eE][-+]?\d+)?/.exec(s.slice(i));
      if (nm) { i += nm[0].length; return parseFloat(nm[0]); }
      throw new Error('unexpected ' + JSON.stringify(s.slice(i, i + 12)));
    }
    try { const v = expr(); ws(); if (i < s.length) throw new Error('trailing ' + JSON.stringify(s.slice(i, i + 12))); return v; }
    catch (e) { if (e && e.err) return e; throw e; }
  }
  return { value, cell };
}
module.exports = { makeSheetCalc, colIdx };
