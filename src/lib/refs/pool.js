/*
 * Reference prices: from package rows to the candidate pool (the records retrieval works on).
 *
 *   var recs = S.refs.derive(pkg, { progress: function (done, total) {} });
 *
 * A package (S.refs.pkg, format smeta-refs v1) carries only what a record IS; everything retrieval matches on is
 * derived here, by the program's own code, so a key computed in the browser can never disagree with a key computed
 * anywhere else. Per row:
 *   unit   S.refs.units.norm of the package unit
 *   ua     the item data units.factor() can use (units.itemAttrs), plus the steel parser's mass per metre (below)
 *   fz     the text fuzzy retrieval compares: the name, or name_raw when a catalogue prepended a block heading
 *          to the item («<heading>: <item>»)
 *   mp     S.matchPair(name, unit); mp_raw the same for a different, name-like name_raw
 *   fam    the family parse of the name (or of name_raw when the name has none), with `from: 'name_raw'` then
 *   avail, avail_src   the availability date and the edition to cite (package values, else price_date / src)
 * A family parse is computed once per distinct (text, unit, section) and SHARED by every record with that text:
 * nothing downstream writes to a parse (a name_raw parse gets its own copy because it is marked).
 *
 * The steel parser's mass per metre from the standard's formula fills a missing kg_per_m, and replaces a record's
 * own value that disagrees with it by more than ×1.25 when the record's other statement of its mass (theoretical
 * mass, or metres per tonne) sides with the formula within 5 %. A formula marked as the 3262 variant is not used.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var R = S.refs = S.refs || {};

  function squash(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /** name_raw is a name (not a table row dump of numbers) */
  function nameLike(s) {
    if (!s) return false;
    var t = S.tokens(s);
    if (!t.length) return false;
    if (String(s).indexOf('|') >= 0) return false;
    for (var i = 0; i < t.length; i++) if (/^[A-Z]{3,}/.test(t[i])) return true;
    return false;
  }

  function endsWith(s, tail) { return s.length >= tail.length && s.slice(s.length - tail.length) === tail; }

  /** The text fuzzy retrieval compares (see the header). rec: { name, name_raw, group } */
  function fuzzyText(rec) {
    var name = squash(rec.name), raw = squash(rec.name_raw);
    if (rec.group === 'catalogue' && raw && name !== raw && name.length > raw.length && endsWith(name, raw) && nameLike(raw)) {
      return { fz: raw, how: 'name_raw_without_heading' };
    }
    return { fz: name || raw, how: name ? 'name' : 'name_raw' };
  }

  function derive(pkg, opts) {
    var o = opts || {};
    var U = R.units;
    var fams = o.families || R.families;
    if (!U) throw new Error('S.refs.units is not loaded');
    var F = {};
    for (var k = 0; k < pkg.fields.length; k++) F[pkg.fields[k]] = k;
    var rows = pkg.rows, n = rows.length;
    var skip = o.skip || null;
    var famCache = new Map(), rawCache = new Map();
    var err = o.errors || {};
    var out = [];
    var step = o.progressEvery || 5000;
    function v(row, f) { var i = F[f]; return i === undefined || i >= row.length || row[i] === undefined ? null : row[i]; }
    function fam1(text, unit, section) {
      var key = text + '\u0001' + unit + '\u0001' + section;
      if (famCache.has(key)) return famCache.get(key);
      var p = R.famParse(fams, text, unit, section, err) || null;
      famCache.set(key, p);
      return p;
    }
    for (var j = 0; j < n; j++) {
      if (o.progress && j % step === 0) o.progress(j, n);
      if (skip && skip.has(j)) continue;
      var row = rows[j];
      var rUnit = v(row, 'unit'), unitRaw = v(row, 'unit_raw'), attrs = v(row, 'attrs'), section = v(row, 'section');
      var group = v(row, 'group'), rawName = v(row, 'name_raw');
      var unit = U.norm(rUnit);
      var ua = U.itemAttrs(unit, unitRaw, attrs);
      var name = squash(v(row, 'name')), nameRaw = rawName == null ? '' : squash(rawName);
      var fz = fuzzyText({ name: name, name_raw: rawName, group: group }).fz;
      var mp = S.matchPair(name, rUnit);
      var mpRaw = null;
      if (nameRaw && nameLike(nameRaw)) {
        var k2 = S.matchPair(nameRaw, rUnit);
        if (k2 !== mp) mpRaw = k2;
      }
      var fam = fam1(name, unit, section);
      if (!fam && nameRaw && nameRaw !== name && nameLike(nameRaw)) {
        var rk = nameRaw + '\u0001' + unit + '\u0001' + section;
        if (rawCache.has(rk)) fam = rawCache.get(rk);
        else {
          fam = fam1(nameRaw, unit, section);
          if (fam) fam = Object.assign({}, fam, { from: 'name_raw' });
          rawCache.set(rk, fam);
        }
      }
      var fa = fam && fam.attrs ? fam.attrs : null;
      var ff = fa ? fa.kg_per_m_from : null;
      var fk = fa && fa.kg_per_m > 0 && ff && ff !== 'printed' && !/3262/.test(ff) ? fa.kg_per_m : null;
      if (fk) {
        var ra = attrs || {};
        var other = [];
        if (ra.mass_theoretical_kg_m > 0) other.push(ra.mass_theoretical_kg_m);
        if (ra.m_per_t > 0 && 1000 / ra.m_per_t > 0) other.push(1000 / ra.m_per_t);
        if (!ua.kg_per_m) { ua.kg_per_m = fk; ua.kg_per_m_from = 'family:' + ff; }
        else if (Math.max(ua.kg_per_m / fk, fk / ua.kg_per_m) > 1.25 && other.some(function (x) { return Math.max(x / fk, fk / x) <= 1.05; })) {
          ua.kg_per_m = fk; ua.kg_per_m_from = 'family:' + ff;
        }
      }
      var flags = v(row, 'flags');
      var priceDate = v(row, 'price_date'), src = v(row, 'src');
      var rec = {
        rid: v(row, 'rid'), name: name, group_raw: null, fz: fz, unit: unit, unit_raw: unitRaw,
        ua: Object.keys(ua).length ? ua : null, section: section, price: v(row, 'price'), price_date: priceDate,
        region: v(row, 'region'), src: src, group: group, basis: v(row, 'basis'),
        delivery: v(row, 'delivery'), plant: v(row, 'plant'), code: v(row, 'code'),
        flags: flags ? flags.slice() : [], attrs: attrs, mp: mp, fam: fam,
        avail: v(row, 'avail') || priceDate, avail_src: v(row, 'avail_src') || src
      };
      if (nameRaw && nameRaw !== name) rec.name_raw = nameRaw;
      if (mpRaw) rec.mp_raw = mpRaw;
      out.push(rec);
    }
    if (o.progress) o.progress(n, n);
    return out;
  }

  R.squash = squash;
  R.nameLike = nameLike;
  R.fuzzyText = fuzzyText;
  R.derive = derive;
})(S);
