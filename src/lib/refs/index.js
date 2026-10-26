/*
 * Reference prices: the family parsers, loaded together, with overlap resolution.
 *
 * units.js and families/*.js are plain scripts that leave one global each (Units, FamilyMachines, CableFamily,
 * SteelFamily, MineralFamily, FamilyElectro). This file collects them into S.refs, removes the globals, and gives
 * one parse per name:
 *
 *   S.refs.units                                     the unit table (units.js)
 *   S.refs.families                                  [{ file, id, mod, rank }], most specific first
 *   S.refs.famParse(families, name, unit, section)   one parse or null
 *   S.refs.parseAll(families, name, unit, section)   every family that owns and parses the name
 *   S.refs.KEYS                                      stamp of the key-deriving code (build.mjs puts
 *                                                    `self.REFS_KEYS = '…';` first in the worker); 'dev' without it
 *
 * A name owned (owns() true and parse() gives a key) by two families goes to the more specific one:
 *   1. when both parses state the printed head word of the item (attrs.head, a word of the name) and the two heads
 *      differ, the head printed first wins (a telephone with a camera is a telephone, not a precast chamber);
 *   2. otherwise the narrower family wins, in this fixed order (scope, not score):
 *        machines   only маш-ч / чел-ч / т-км or the sections machines / labor / transport
 *        cable      cables, wires and conductor wire
 *        steel      steel and plastic pipes, rolled steel, fasteners, wire mesh
 *        mineral    concrete, precast, asphalt, cement, aggregates, bitumen
 *        electro    the long tail
 * A family whose file is missing is skipped (the main thread loads none of them).
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (root, S) {
  'use strict';
  var R = S.refs = S.refs || {};

  var ORDER = ['machines', 'cable', 'steel', 'mineral', 'electro'];
  var GLOBAL = { machines: 'FamilyMachines', cable: 'CableFamily', steel: 'SteelFamily', mineral: 'MineralFamily',
    electro: 'FamilyElectro' };

  if (root.Units) { R.units = root.Units; try { delete root.Units; } catch (e) { root.Units = undefined; } }

  var families = [];
  for (var i = 0; i < ORDER.length; i++) {
    var g = GLOBAL[ORDER[i]];
    var m = root[g];
    if (!m) continue;
    try { delete root[g]; } catch (e) { root[g] = undefined; }
    if (typeof m.parse !== 'function') continue;
    families.push({ file: ORDER[i] + '.js', id: m.id || ORDER[i], mod: m, rank: i });
  }
  if (families.length) R.families = families;
  else if (!R.families) R.families = [];

  function norm(f, p) {
    var levels = [];
    if (Object.prototype.toString.call(p.levels) === '[object Array]') {
      for (var j = 0; j < p.levels.length; j++) {
        var l = p.levels[j];
        if (l && l.key) levels.push(Object.assign({}, l, { key: String(l.key), drop: l.drop || [] }));
      }
    }
    return Object.assign({}, p, { id: f.id, family: p.family || f.id, key: String(p.key), levels: levels, attrs: p.attrs || null });
  }

  /** Every family that owns the (upper-cased) name and parses it to a key. */
  function parseAll(fams, name, unit, section, err) {
    if (!name) return [];
    var up = String(name).toUpperCase();
    var out = [];
    for (var i = 0; i < fams.length; i++) {
      var f = fams[i];
      try {
        if (typeof f.mod.owns === 'function' && !f.mod.owns(up, unit, section)) continue;
        var p = f.mod.parse(up, unit, section);
        if (p && p.key) out.push(Object.assign(norm(f, p), { _rank: f.rank }));
      } catch (e) {
        if (err) { err[f.id] = (err[f.id] || 0) + 1; if (!err['_' + f.id]) err['_' + f.id] = String(e && e.message || e).slice(0, 200); }
      }
    }
    return out;
  }

  /** Position of a printed head word in the name (word start), or -1. */
  function headPos(up, p) {
    var h = p && p.attrs && typeof p.attrs.head === 'string' ? p.attrs.head.toUpperCase() : '';
    if (!h || h.length < 3 || !/[А-ЯЁ]/.test(h)) return -1;
    var re = new RegExp('(^|[^А-ЯЁA-Z0-9])' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    var m = re.exec(up);
    return m ? m.index + m[1].length : -1;
  }

  /** The more specific of several parses of one name (see the header). */
  function resolve(up, parses) {
    if (parses.length < 2) return { pick: parses[0] || null, rule: null };
    var best = parses[0], rule = 'order';
    for (var i = 1; i < parses.length; i++) {
      var c = parses[i];
      var hb = headPos(up, best), hc = headPos(up, c);
      if (hb >= 0 && hc >= 0 && hb !== hc) {
        if (hc < hb) { best = c; rule = 'head-first'; } else rule = rule === 'order' ? 'head-first' : rule;
      } else if (c._rank < best._rank) { best = c; rule = 'order'; }
    }
    return { pick: best, rule: rule };
  }

  /**
   * One parse for a name, or null. `stats` (optional) collects the overlaps:
   * { overlaps: n, by_pair: { 'cable+steel→cable (order)': n }, examples: { pair: [names] } }.
   */
  function famParse(fams, name, unit, section, err, stats) {
    if (!name) return null;
    var up = String(name).toUpperCase();
    var all = parseAll(fams, up, unit, section, err);
    if (!all.length) return null;
    var r = resolve(up, all), pick = r.pick;
    if (all.length > 1 && stats) {
      stats.overlaps = (stats.overlaps || 0) + 1;
      var k = all.map(function (p) { return p.id; }).join('+') + '→' + pick.id + ' (' + r.rule + ')';
      stats.by_pair = stats.by_pair || {};
      stats.by_pair[k] = (stats.by_pair[k] || 0) + 1;
      stats.examples = stats.examples || {};
      var ex = stats.examples[k] = stats.examples[k] || [];
      if (ex.length < 5 && ex.indexOf(up.slice(0, 100)) < 0) ex.push(up.slice(0, 100));
    }
    var out = Object.assign({}, pick);
    delete out._rank;
    if (all.length > 1) out.also = all.filter(function (p) { return p !== pick; }).map(function (p) { return p.id; });
    return out;
  }

  function familyMod(id) {
    for (var i = 0; i < R.families.length; i++) if (R.families[i].id === id) return R.families[i].mod;
    return null;
  }

  R.ORDER = ORDER;
  R.parseAll = parseAll;
  R.headPos = headPos;
  R.resolve = resolve;
  R.famParse = famParse;
  R.familyMod = familyMod;
  R.KEYS = (typeof root.REFS_KEYS === 'string' && root.REFS_KEYS) || 'dev';
})(this, S);
