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

  /*
   * Characters that spell a digit or a letter without being one.
   *
   * An estimate is often pasted together out of other documents, and what
   * arrives is «м²», «Д-110ММ» typed on a fullwidth keyboard, «АРМАТУРА АⅢ»
   * with the Roman-numeral codepoint, «А-І» with the Ukrainian І. None of them
   * is in the alphabet the keys are built from, so all of them used to be
   * struck out as punctuation — and the number they carried went with them:
   * «м²» became «М», so a price per square metre was offered as the price of a
   * metre, and two diameters typed in fullwidth digits became one resource.
   *
   * Spelled out in an explicit table rather than through a Unicode
   * normalisation call, so the browser and the server's Goja cannot disagree
   * about what a character means.
   */
  var SPELL = {
    '¹': '1', '²': '2', '³': '3',
    '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6',
    '⁷': '7', '⁸': '8', '⁹': '9',
    'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V',
    'Ⅵ': 'VI', 'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X',
    'Ⅺ': 'XI', 'Ⅻ': 'XII',
    /* Cyrillic letters that are only ever a Latin one typed on the wrong layout */
    'І': 'I', 'і': 'I', 'Ӏ': 'I', 'Ѕ': 'S', 'ѕ': 'S',
    'Ј': 'J', 'ј': 'J'
  };
  var SPELL_RE = /[¹²³⁰⁴-⁹Ⅰ-Ⅻⅰ-ⅻІіӀЅѕЈј０-９Ａ-Ｚａ-ｚ]/g;

  /** «м²» -> «м2», fullwidth «110» -> «110», «АⅢ» -> «АIII». */
  function spell(s) {
    SPELL_RE.lastIndex = 0;
    if (!SPELL_RE.test(s)) { SPELL_RE.lastIndex = 0; return s; }
    SPELL_RE.lastIndex = 0;
    return s.replace(SPELL_RE, function (ch) {
      var known = SPELL[ch];
      if (known) return known;
      var c = ch.charCodeAt(0);
      if (c >= 0xFF10 && c <= 0xFF19) return String.fromCharCode(c - 0xFF10 + 48);
      if (c >= 0xFF21 && c <= 0xFF3A) return String.fromCharCode(c - 0xFF21 + 65);
      if (c >= 0xFF41 && c <= 0xFF5A) return String.fromCharCode(c - 0xFF41 + 65);
      if (c >= 0x2170 && c <= 0x217B) return SPELL[String.fromCharCode(c - 0x2170 + 0x2160)] || ch;
      return ch;
    });
  }


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

  /**
   * Type codes are read by shape, not by sound. «Н-35» and «H-35» are one
   * profile, «ВА47-100» and «BA47-100» one circuit breaker — whoever typed
   * them just had the wrong layout on, and no majority inside the word can
   * say so, because the digits carry no script. So every whitespace-separated
   * chunk that contains a digit is pushed wholly into Cyrillic, where the
   * transliteration then lands both spellings on the same letters.
   *
   * Words without a digit are left to fold(), which can weigh their letters.
   */
  var CHUNK = /[^\s]+/g;
  function foldMarks(up) {
    if (!/\d/.test(up)) return up;
    return up.replace(CHUNK, function (w) {
      if (!/\d/.test(w) || !/[A-Z]/.test(w)) return w;
      return w.replace(LATIN, function (c) { return L2C[c] || c; });
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
    // Ё for Е is optional Russian spelling; Ъ for Ь is the everyday typo in
    // «ГРУЗОПОДЪЕМНОСТЬЮ». No Russian word is told from another by Ъ against Ь,
    // while Ь against nothing does tell УГОЛ from УГОЛЬ — so Ь is never dropped.
    var k = fold(spell(raw.replace(NBSP, ' ').replace(APOS, "'").toUpperCase()))
      .replace(/Ё/g, 'Е')
      .replace(/Ъ/g, 'Ь')
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


  S.fold = fold; S.foldMarks = foldMarks; S.spell = spell;
  S.nameKey = nameKey; S.unitKey = unitKey;
  S.nameKeyV1 = nameKeyV1; S.unitKeyV1 = unitKeyV1;
})(S);
if (typeof self !== 'undefined') self.S = S;
