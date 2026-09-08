/*
 * Turning what somebody typed into a key.
 *
 * Estimates are typed by hand, in a hurry, on a keyboard that is half Latin
 * and half Cyrillic. The same resource therefore arrives as «СТАЛЬ» and
 * «CТАЛЬ» (a Latin C), as «ДИАМ. 16 ММ» and «ДИАМ.16 ММ», as «ЛЕНТА "ФУМ"
 * РУЛОН» and «ЛЕНТА "ФУМ "РУЛОН». Measured on two real workbooks: of 896
 * distinct names, 139 mix both scripts and 55 words mix scripts inside one
 * word.
 *
 * Loaded before everything else: assemble.js keys every row through nameKey,
 * and the worker builds those keys too.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';

  var NBSP = /[   ]/g;
  var APOS = /[`‘’ʻʼ]/g;

  /* Letters that look identical in both alphabets. Estimates are typed with the
     keyboard layout half-switched, so «СТАЛЬ» arrives with a Latin C and
     «КОМПРЕССОРЫ» with a Latin K — the same word, a different byte. */
  var L2C = {
    A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К',
    M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У'
  };
  var C2L = {};
  for (var _l in L2C) C2L[L2C[_l]] = _l;

  var WORD = /[A-ZА-ЯЁЎҚҒҲҮҢӨӘҺ0-9]+/g;
  var LATIN = /[A-Z]/g;
  var CYRIL = /[А-ЯЁЎҚҒҲҮҢӨӘҺ]/g;

  /**
   * Repairs a mixed-script word by moving its minority letters into the script
   * the rest of the word is written in. Works both ways, so «CТАЛЬ» becomes
   * «СТАЛЬ» and «ОMICRON» becomes «OMICRON». A word written wholly in one
   * script is left alone — that is the transliteration layer's business
   * (match.js), not this one's.
   */
  function fold(up) {
    if (!LATIN.test(up)) { LATIN.lastIndex = 0; return up; }
    LATIN.lastIndex = 0;
    if (!CYRIL.test(up)) { CYRIL.lastIndex = 0; return up; }
    CYRIL.lastIndex = 0;
    return up.replace(WORD, function (w) {
      var lat = (w.match(LATIN) || []).length;
      var cyr = (w.match(CYRIL) || []).length;
      if (!lat || !cyr) return w;
      return cyr >= lat
        ? w.replace(LATIN, function (c) { return L2C[c] || c; })
        : w.replace(CYRIL, function (c) { return C2L[c] || c; });
    });
  }

  var nkCache = {}, nkCount = 0;

  /**
   * Resource-name key. Prices are keyed by name so one edit propagates to every
   * occurrence across every street and every sheet — the whole point of the
   * "adjust once, apply everywhere" workflow.
   *
   * Conservative on purpose: this key decides which rows of the exported .xlsx
   * share one price, so it only forgives what is certainly the same name — a
   * half-switched keyboard layout, stray quotes and dots, Ё for Е. Digits keep
   * their own tokens, so «АНКЕР М5» never meets «АНКЕР М8» and road sign
   * 4.1.1 never meets 4.11.
   */
  function nameKey(s) {
    var raw = String(s == null ? '' : s);
    var hit = nkCache[raw];
    if (hit !== undefined) return hit;
    var k = fold(raw.replace(NBSP, ' ').replace(APOS, "'").toUpperCase())
      .replace(/Ё/g, 'Е')
      .replace(/[^A-ZА-ЯЎҚҒҲҮҢӨӘҺ0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (nkCount > 20000) { nkCache = {}; nkCount = 0; }   // a long session must not grow without bound
    nkCache[raw] = k; nkCount++;
    return k;
  }

  /** The key as it was before the homoglyph repair — only for re-reading prices
      saved by an older version of the page. */
  function nameKeyV1(s) {
    return String(s == null ? '' : s)
      .replace(NBSP, ' ')
      .replace(APOS, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function unitKey(s) { return nameKey(s).replace(/[.\-\s]/g, ''); }
  function unitKeyV1(s) { return nameKeyV1(s).replace(/[.\-\s]/g, ''); }


  S.fold = fold;
  S.nameKey = nameKey; S.unitKey = unitKey;
  S.nameKeyV1 = nameKeyV1; S.unitKeyV1 = unitKeyV1;
})(S);
if (typeof self !== 'undefined') self.S = S;
