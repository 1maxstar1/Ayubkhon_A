/*
 * Reference prices: the query the program asks for one resource line.
 *
 *   S.refs.queryOf(r, ctx) → { id, name, unit, section, region, asof, exclude_src: [] }
 *   r:   an assembled resource { name, unit, section (the smeta band: labor | machines | materials | equipment |
 *        other), mk }
 *   ctx: { region, asof, registered_at, today }
 *
 * section: the unit decides first (чел-ч → labor, маш-ч → machines, т-км → transport); else the band the row sits
 *          under; else S.sections.classify at confidence ≥ 0.75; else materials.
 * asof:    ctx.asof; else the date part of the application's registered_at; else today.
 * id:      the cross-project match pair + section + region + asof: every variant line of a name+unit asks once.
 * The query never carries the smeta price (it is never a feature for ranking).
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (root, S) {
  'use strict';
  var R = S.refs = S.refs || {};

  var BY_NORM = { 'чел-ч': 'labor', 'маш-ч': 'machines', 'т-км': 'transport' };
  var BY_KEY = { CHELCH: 'labor', MASHCH: 'machines', TKM: 'transport' };
  var BANDS = { labor: true, machines: true, materials: true, equipment: true, transport: true };

  function unitSection(unit) {
    if (!unit) return null;
    var U = R.units || root.Units;
    if (U && U.norm) { var n = U.norm(unit); if (n && BY_NORM[n]) return BY_NORM[n]; }
    var k = S.matchUnitKey ? S.matchUnitKey(unit) : null;
    return (k && BY_KEY[k]) || null;
  }

  function dateOf(v) {
    if (!v) return null;
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
    return m ? m[1] : null;
  }

  function todayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function sectionOf(r) {
    var s = unitSection(r.unit);
    if (s) return { section: s, by: 'unit' };
    if (BANDS[r.section]) return { section: r.section, by: 'band' };
    if (S.sections && S.sections.classify) {
      var c = S.sections.classify(r.name, r.unit);
      if (c && c.confidence >= 0.75 && BANDS[c.section]) return { section: c.section, by: 'classify' };
    }
    return { section: 'materials', by: 'default' };
  }

  function asofOf(ctx) {
    var c = ctx || {};
    return dateOf(c.asof) || dateOf(c.registered_at) || dateOf(c.today) || todayISO();
  }

  function queryOf(r, ctx) {
    var c = ctx || {};
    var sec = sectionOf(r);
    var asof = asofOf(c);
    var region = c.region || null;
    var mk = r.mk || (S.matchPair ? S.matchPair(r.name, r.unit) : String(r.name) + '␟' + String(r.unit));
    return {
      id: mk + '|' + sec.section + '|' + (region || '') + '|' + asof,
      name: r.name, unit: r.unit, section: sec.section, region: region, asof: asof, exclude_src: []
    };
  }

  R.queryOf = queryOf;
  R.querySection = sectionOf;
  R.queryAsof = asofOf;
})(this, S);
