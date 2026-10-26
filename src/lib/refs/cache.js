/*
 * Reference prices: a compact, structured-cloneable form of the derived pool, for the worker's IndexedDB cache.
 *
 *   var enc = S.refs.encodeCache(recs);     // typed arrays + value tables; ~0.5 s for the whole country
 *   var recs = S.refs.decodeCache(enc);     // records that share their repeated values (names, parses, units …)
 *
 * Repeated strings (unit, section, region, src, dates …) are stored once per value with an Int32Array index;
 * rid and price are typed arrays; the name texts of a record ([name, fz, name_raw, mp, mp_raw]) and the family
 * parses are tables of distinct values (a parse shared by many records in the pool stays shared after decoding);
 * ua, flags and attrs are stored only where present. decodeCache(encodeCache(recs)) deep-equals recs.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var R = S.refs = S.refs || {};

  var DICT = ['group_raw', 'unit', 'unit_raw', 'section', 'price_date', 'region', 'src', 'group', 'basis', 'delivery',
    'plant', 'code', 'avail', 'avail_src'];
  var SEP = '\u0001';
  var VERSION = 1;

  function encodeCache(recs) {
    var n = recs.length;
    var enc = { v: VERSION, n: n, dict: {}, rid: new Int32Array(n), price: new Float64Array(n),
      names: [], nameIdx: new Int32Array(n), fams: [], famIdx: new Int32Array(n), ua: [], flags: [], attrs: [] };
    var d, i;
    for (d = 0; d < DICT.length; d++) {
      var f = DICT[d], values = [], at = new Map(), idx = new Int32Array(n);
      for (i = 0; i < n; i++) {
        var val = recs[i][f];
        if (val === undefined) val = null;
        var k = at.get(val);
        if (k === undefined) { k = values.length; values.push(val); at.set(val, k); }
        idx[i] = k;
      }
      enc.dict[f] = { values: values, idx: idx };
    }
    var nameAt = new Map(), famAt = new Map();
    for (i = 0; i < n; i++) {
      var r = recs[i];
      enc.rid[i] = r.rid;
      enc.price[i] = r.price;
      var tuple = [r.name, r.fz, r.name_raw === undefined ? null : r.name_raw, r.mp, r.mp_raw === undefined ? null : r.mp_raw];
      var key = tuple.join(SEP) + SEP + (r.name_raw === undefined ? 0 : 1) + (r.mp_raw === undefined ? 0 : 1);
      var ni = nameAt.get(key);
      if (ni === undefined) { ni = enc.names.length; enc.names.push(tuple); nameAt.set(key, ni); }
      enc.nameIdx[i] = ni;
      if (r.fam) {
        var fi = famAt.get(r.fam);
        if (fi === undefined) { fi = enc.fams.length; enc.fams.push(r.fam); famAt.set(r.fam, fi); }
        enc.famIdx[i] = fi;
      } else enc.famIdx[i] = -1;
      if (r.ua) enc.ua.push([i, r.ua]);
      if (r.flags && r.flags.length) enc.flags.push([i, r.flags]);
      if (r.attrs) enc.attrs.push([i, r.attrs]);
    }
    return enc;
  }

  function decodeCache(enc) {
    if (!enc || enc.v !== VERSION) throw new Error('refs cache: unknown version');
    var n = enc.n, out = new Array(n), i, j;
    var ua = new Array(n), flags = new Array(n), attrs = new Array(n);
    for (j = 0; j < enc.ua.length; j++) ua[enc.ua[j][0]] = enc.ua[j][1];
    for (j = 0; j < enc.flags.length; j++) flags[enc.flags[j][0]] = enc.flags[j][1];
    for (j = 0; j < enc.attrs.length; j++) attrs[enc.attrs[j][0]] = enc.attrs[j][1];
    var D = enc.dict;
    function dv(f, k) { var t = D[f]; return t.values[t.idx[k]]; }
    for (i = 0; i < n; i++) {
      var nm = enc.names[enc.nameIdx[i]];
      var rec = {
        rid: enc.rid[i], name: nm[0], group_raw: dv('group_raw', i), fz: nm[1], unit: dv('unit', i), unit_raw: dv('unit_raw', i),
        ua: ua[i] || null, section: dv('section', i), price: enc.price[i], price_date: dv('price_date', i),
        region: dv('region', i), src: dv('src', i), group: dv('group', i), basis: dv('basis', i),
        delivery: dv('delivery', i), plant: dv('plant', i), code: dv('code', i),
        flags: flags[i] || [], attrs: attrs[i] || null, mp: nm[3], fam: enc.famIdx[i] >= 0 ? enc.fams[enc.famIdx[i]] : null,
        avail: dv('avail', i), avail_src: dv('avail_src', i)
      };
      if (nm[2] !== null) rec.name_raw = nm[2];
      if (nm[4] !== null) rec.mp_raw = nm[4];
      out[i] = rec;
    }
    return out;
  }

  R.encodeCache = encodeCache;
  R.decodeCache = decodeCache;
})(S);
