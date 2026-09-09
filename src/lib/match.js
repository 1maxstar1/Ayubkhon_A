/*
 * Recognising that two written resource names mean the same thing.
 *
 * Estimates are typed by hand in three scripts at once, so the same resource
 * arrives as «КАШТАН», «KASHTAN», «CТАЛЬ» (a Latin C in front of a Cyrillic
 * word) or «ДИАМ. 16 ММ» versus «ДИАМ.16 ММ». Measured on two real workbooks:
 * of 896 distinct names, 139 mix both scripts and 55 tokens mix scripts inside
 * one word.
 *
 * Two keys, on purpose:
 *   S.nameKey (util.js)  identity INSIDE one document. Conservative: it decides
 *                        which rows share one edited price in the exported .xlsx.
 *   S.matchKey (here)    lookup ACROSS past projects, for price hints only. It
 *                        may be aggressive, because a hint is a suggestion the
 *                        expert accepts or ignores.
 *
 * The one rule neither key may break: digits and dimensions must survive
 * untouched. «АНКЕР М5» is not «АНКЕР М8», «ДО 5 Т» is not «ДО 8 Т», and road
 * sign 4.1.1 is not 4.11 — in the same two workbooks, 89 groups covering 272
 * names differ only by their numbers.
 */
(function (S) {
  'use strict';

  /* Cyrillic -> Latin. One target alphabet means a Cyrillic name and a Latin
     one meet in the middle: КАШТАН and KASHTAN both become KASHTAN. Uzbek
     letters (Ў Қ Ғ Ҳ) are included, and the signs Ъ Ь vanish — «ГРУЗОПОДЪЕМ…»
     and the misspelled «ГРУЗОПОДЬЕМ…» are one resource. */
  var TR = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Ғ': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
    'Ж': 'ZH', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Қ': 'Q', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'Ў': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'X', 'Ҳ': 'H', 'Ц': 'TS', 'Ч': 'CH', 'Ш': 'SH', 'Щ': 'SH',
    'Ъ': '', 'Ы': 'I', 'Ь': '', 'Э': 'E', 'Ю': 'YU', 'Я': 'YA', 'Ө': 'O', 'Ә': 'A',
    'Ң': 'N', 'Һ': 'H', 'Ї': 'I', 'І': 'I', 'Є': 'E'
  };

  var CYR_RE = /[Ѐ-ӿ]/g;

  function translit(s) {
    return s.replace(CYR_RE, function (ch) {
      var t = TR[ch];
      return t === undefined ? ch : t;
    });
  }

  function isDigit(ch) { return ch >= '0' && ch <= '9'; }
  function isKept(ch) { return (ch >= 'A' && ch <= 'Z') || isDigit(ch); }

  /**
   * Separators between digits carry meaning; every other separator is noise.
   * «ДИАМ. 16 ММ» equals «ДИАМ.16 ММ», 6,3 equals 6.3, and 110×6,3 equals
   * 110Х6,3 — but 4.1.1 must stay apart from 4.11.
   *
   * The rule that makes this safe: a separator is only ever dropped between two
   * letters, or between a letter and a digit. Between two digits it always
   * leaves something behind — the decimal point, the multiplication sign, or a
   * plain boundary — because dropping it would MAKE a number that nobody wrote.
   * «ПРОВОД 1, 5 ММ2» is not «ПРОВОД 15 ММ2», and before this rule existed the
   * two keyed identically and one was offered as the other's exact price.
   */
  function squeeze(s) {
    var out = '', i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (isKept(ch)) { out += ch; continue; }
      var prev = out.charAt(out.length - 1);
      if (!isDigit(prev)) continue;                  // nothing to protect
      // what is the next character that would be kept?
      var j = i, nxt = '';
      while (j < s.length) {
        var c = s.charAt(j);
        if (isKept(c)) { nxt = c; break; }
        j++;
      }
      if (!isDigit(nxt)) continue;                   // digit then letter: safe to drop
      if (ch === '.' || ch === ',') out += '.';      // 6,3 and 6.3 are one number
      else if (ch === '\u00D7' || ch === '*') out += 'X';   // 110×6,3 is 110Х6,3
      else out += '_';                               // «1, 5» keeps its gap
      i = j - 1;
    }
    return out;
  }

  /**
   * A bounded memo for the string-in functions the matcher calls over and
   * over. Scoring one project against a region's history asks the same
   * questions about the same few hundred names tens of thousands of times.
   *
   * Emptied wholesale once it passes `cap`: a long session must not grow
   * without bound, and a cold start costs one recomputation. The table has no
   * prototype, so a resource named «constructor» is a key like any other.
   *
   * The cached value is handed back as it is, not copied — so nothing may
   * modify what it gets. Nothing does: every caller of tokens() and numbers()
   * only reads.
   */
  function memo(fn, cap) {
    var cache = Object.create(null), n = 0;
    return function (s) {
      var raw = s == null ? '' : String(s);
      var hit = cache[raw];
      if (hit !== undefined) return hit;
      var v = fn(raw);
      if (n > cap) { cache = Object.create(null); n = 0; }
      cache[raw] = v; n++;
      return v;
    };
  }
  var MEMO = 20000;

  /**
   * Cross-project lookup key: one script, no separators, numbers intact.
   * Returns '' for an empty name.
   */
  var matchKey = memo(function (raw) {
    if (!raw) return '';
    // S.spell first, for the same reason the identity key does it: a character
    // that spells a digit without being one must not be struck out with the
    // punctuation, taking its number with it.
    return squeeze(translit(S.foldMarks(S.fold(S.spell(raw.toUpperCase())))));
  }, MEMO);

  /* Units that name the same quantity. Applied to the alphabetic tail only, so
     a per-hundred price (100ШТ) never merges with a per-piece one (ШТ). */
  var UNIT_SAME = {
    TN: 'T', TONN: 'T', TONNA: 'T',
    PM: 'M', MP: 'M', POGM: 'M', MPOG: 'M',
    KVM: 'M2', M2KV: 'M2', KUBM: 'M3', M3KUB: 'M3',
    SHTUK: 'SHT', SHTUKA: 'SHT', DONA: 'SHT', PCS: 'SHT',
    KOMPL: 'KT', KMPL: 'KT', KOMPLEKT: 'KT',
    CHASCH: 'CHELCH', CHELOVCH: 'CHELCH',
    MASHINOCH: 'MASHCH'
  };

  /** Unit key for lookup: «ТН» and «Т» are one tonne, «100ШТ» stays its own unit. */
  function matchUnitKey(unit) {
    var k = matchKey(unit);
    if (!k) return '';
    var m = /^(\d+)?([A-Z].*)$/.exec(k);
    if (!m) return k;
    var mult = m[1] || '', tail = m[2];
    return mult + (UNIT_SAME[tail] || tail);
  }

  /** Name and unit together — what a stored price is actually keyed by. */
  function matchPair(name, unit) {
    return matchKey(name) + '␟' + matchUnitKey(unit);
  }

  /* ------------------------------------------------------------ similarity */

  /* The Uzbek apostrophe is a letter, not a separator: G‘allaorol, O‘zbekiston
     and Farg‘ona are one word each, and splitting them there loses the name. */
  var APOS = /[`'\u2018\u2019\u02BB\u02BC\u00B4\u2032]/g;

  /** Words of a name, transliterated; digits stay glued to their word. */
  function tokensOf(name) {
    var t = translit(S.foldMarks(S.fold(String(name == null ? '' : name).replace(APOS, '').toUpperCase())));
    var out = [], cur = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) { cur += ch; continue; }
      if ((ch === '.' || ch === ',') && cur && /\d$/.test(cur) && /\d/.test(t.charAt(i + 1))) { cur += '.'; continue; }
      if (cur) { out.push(cur); cur = ''; }
    }
    if (cur) out.push(cur);
    return out;
  }
  var tokens = memo(tokensOf, MEMO);

  /* Numbers that identify a standard rather than the thing itself. «ЛЮК
     ЧУГУННЫЙ ГОСТ 3634-79» and «ЛЮК ЧУГУННЫЙ» are one hatch; the year of the
     standard must not make them look like different sizes. */
  var STD = /\b(?:GOST|TU|OST|SNIP|SHNK|SHNQ|DIN|ISO|ASTM)\s*[N\u2116]?\s*\d[\d.\-\u2013]*/g;

  /* Grades and sorts are written in Roman: А-I, А-III, СОРТ II, Вр-I. To a
     digit-only guard those are all the same name, so «АРМАТУРА А-I» would be
     offered the price of «АРМАТУРА А-III». They are read off the raw text,
     before transliteration, where Cyrillic И and Х are still their own
     characters and a Latin I really is a numeral. */
  var ROMAN = { I: 1, II: 1, III: 1, IV: 1, V: 1, VI: 1, VII: 1, VIII: 1, IX: 1 };
  var ROMAN_RE = /[IVX]+/g;
  var LAT_OR_DIGIT = /[A-Z0-9]/;

  /**
   * Every quantity in a name, in the order written — the part that may never
   * be guessed. Arabic numbers, with a comma between digits read as a decimal
   * point, and Roman grade markers as R-prefixed entries so they can never be
   * confused with a size.
   */
  function numbersOf(name) {
    var raw = String(name).toUpperCase();
    var out = [], m;
    ROMAN_RE.lastIndex = 0;
    while ((m = ROMAN_RE.exec(raw))) {
      if (!ROMAN[m[0]]) continue;
      var before = raw.charAt(m.index - 1), after = raw.charAt(m.index + m[0].length);
      if (LAT_OR_DIGIT.test(before) || LAT_OR_DIGIT.test(after)) continue;   // part of a Latin word
      out.push('R' + m[0]);
    }
    var t = translit(raw).replace(/(\d),(?=\d)/g, '$1.').replace(STD, ' ');
    var nums = t.match(/\d+(?:\.\d+)*/g) || [];
    for (var i = 0; i < nums.length; i++) {
      var n = nums[i];
      // one dot is a decimal point; two or more is a list, «25.32.40», and
      // 4.1.1 is three numbers, which is what keeps it apart from 4.11
      if ((n.split('.').length - 1) > 1) {
        var parts = n.split('.');
        for (var j = 0; j < parts.length; j++) if (parts[j]) out.push(parts[j]);
        continue;
      }
      if (n.indexOf('.') >= 0) n = n.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      out.push(n);
    }
    return out;
  }
  var numbers = memo(numbersOf, MEMO);

  /**
   * How the numbers of two names relate:
   *   'same'     the same quantities in the same order — «АНКЕР М5» and «Анкер M5»;
   *   'extra'    one side only adds quantities, or writes the same ones in
   *              another order — «КАШТАН» and «КАШТАН 3М», «3Х16» and «16Х3»;
   *   'conflict' each side carries a quantity the other does not — «М5» vs «М8».
   * A conflict is fatal: those are different resources, however alike they read.
   */
  function numberRelation(a, b) {
    var x = numbers(a), y = numbers(b), i;
    if (x.length === y.length) {
      var ordered = true;
      for (i = 0; i < x.length; i++) if (x[i] !== y[i]) { ordered = false; break; }
      if (ordered) return 'same';
    }
    var cx = {}, cy = {};
    for (i = 0; i < x.length; i++) cx[x[i]] = (cx[x[i]] || 0) + 1;
    for (i = 0; i < y.length; i++) cy[y[i]] = (cy[y[i]] || 0) + 1;
    var aOnly = false, bOnly = false, k;
    for (k in cx) if ((cy[k] || 0) < cx[k]) aOnly = true;
    for (k in cy) if ((cx[k] || 0) < cy[k]) bOnly = true;
    if (aOnly && bOnly) return 'conflict';
    return 'extra';   // an added quantity, or the same ones reordered
  }

  function sameNumbers(a, b) { return numberRelation(a, b) === 'same'; }

  /**
   * Inverse document frequency over a list of names: rare words weigh more.
   * «АНКЕР» appears in a hundred names, «ГРУЗОПОДЪЕМНОСТЬЮ» in three — sharing
   * the second says far more than sharing the first. Built once per candidate
   * set, then reused for every comparison against it.
   */
  function idfOf(names) {
    var df = {}, i, j, t, seen;
    for (i = 0; i < names.length; i++) {
      t = tokens(names[i]); seen = {};
      for (j = 0; j < t.length; j++) {
        if (seen[t[j]]) continue;
        seen[t[j]] = 1;
        df[t[j]] = (df[t[j]] || 0) + 1;
      }
    }
    var n = names.length || 1, idf = {};
    for (var k in df) idf[k] = Math.log(1 + n / df[k]);
    return idf;
  }

  function weightOf(idf, token) {
    return idf && idf[token] !== undefined ? idf[token] : 1;
  }

  /** Cosine over the tf-idf vectors of two token sets, plus plain Jaccard. */
  function tokenScore(ta, tb, idf) {
    var A = {}, B = {}, i, k;
    for (i = 0; i < ta.length; i++) A[ta[i]] = 1;
    for (i = 0; i < tb.length; i++) B[tb[i]] = 1;
    var dot = 0, na = 0, nb = 0, inter = 0, union = 0, w;
    for (k in A) { w = weightOf(idf, k); na += w * w; }
    for (k in B) { w = weightOf(idf, k); nb += w * w; if (A[k]) { dot += w * w; inter++; } }
    for (k in A) union++;
    for (k in B) if (!A[k]) union++;
    if (!na || !nb || !union) return 0;
    var cos = dot / Math.sqrt(na * nb);
    return 0.75 * cos + 0.25 * (inter / union);
  }

  /** Levenshtein distance, abandoned early when the two cannot come close. */
  function editDistance(a, b, cap) {
    var la = a.length, lb = b.length;
    if (!la) return lb;
    if (!lb) return la;
    if (cap !== undefined && Math.abs(la - lb) > cap) return cap + 1;
    var prev = new Array(lb + 1), cur = new Array(lb + 1), i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var best = cur[0], ca = a.charAt(i - 1);
      for (j = 1; j <= lb; j++) {
        var cost = ca === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur[j] = v;
        if (v < best) best = v;
      }
      if (cap !== undefined && best > cap) return cap + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }

  /** Character-level closeness of two match keys, 0..1 — catches plain typos. */
  function charSimilarity(a, b) {
    var x = matchKey(a), y = matchKey(b);
    if (!x || !y) return 0;
    var max = Math.max(x.length, y.length);
    var cap = Math.ceil(max * 0.4);
    var d = editDistance(x, y, cap);
    if (d > cap) return 0;
    return 1 - d / max;
  }

  /**
   * How alike two names read, 0..1.
   *
   * Two views, whichever is kinder: shared words weighted by rarity (tf-idf
   * cosine, steady when the words are reordered or one name is longer), and
   * character distance (steady against a typo inside one long word).
   *
   * Hard rule first: names whose numbers contradict each other are never
   * similar, whatever the words say. That is what keeps «АНКЕР М5» away from
   * «АНКЕР М8» and «КРАН ДО 5 Т» away from «КРАН ДО 8 Т». A name that merely
   * adds a dimension the other lacks is allowed through at a discount — it may
   * be the same resource spelled out more fully, or another size.
   */
  function similarity(a, b, idf) {
    var rel = numberRelation(a, b);
    if (rel === 'conflict') return 0;
    var ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    var score = Math.max(tokenScore(ta, tb, idf), charSimilarity(a, b));
    if (rel === 'extra') score *= 0.7;   // an added dimension may well be another size
    return Math.round(score * 1000) / 1000;
  }

  /**
   * The closest of `candidates` to `name`, best first.
   * Each candidate is {name, unit, ...}; anything else on it is carried through.
   * A candidate measured in another unit is dropped — a price per tonne is no
   * hint for a price per kilogram.
   */
  function bestMatches(name, unit, candidates, opts) {
    var o = opts || {};
    var min = o.min === undefined ? 0.6 : o.min;
    var limit = o.limit === undefined ? 5 : o.limit;
    var key = matchKey(name), uk = matchUnitKey(unit);
    var idf = o.idf || idfOf(candidates.map(function (c) { return c.name; }));
    var out = [], i, c;
    for (i = 0; i < candidates.length; i++) {
      c = candidates[i];
      if (!c || !c.name) continue;
      if (matchKey(c.name) === key && matchUnitKey(c.unit) === uk) continue;   // that is an exact hint, not a guess
      if (uk && matchUnitKey(c.unit) !== uk) continue;
      var score = similarity(name, c.name, idf);
      if (score >= min) out.push({ item: c, score: score });
    }
    out.sort(function (p, q) { return q.score - p.score || (p.item.name < q.item.name ? -1 : 1); });
    return out.slice(0, limit);
  }

  S.translit = translit;
  S.matchKey = matchKey;
  S.matchUnitKey = matchUnitKey;
  S.matchPair = matchPair;
  S.tokens = tokens;
  S.numbers = numbers;
  S.numberRelation = numberRelation;
  S.sameNumbers = sameNumbers;
  S.editDistance = editDistance;
  S.charSimilarity = charSimilarity;
  S.similarity = similarity;
  S.idfOf = idfOf;
  S.bestMatches = bestMatches;
})(S);
