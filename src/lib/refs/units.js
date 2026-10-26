/*
 * Units of reference prices (ES5 plain script; sets the global `Units`, read by src/lib/refs/index.js).
 *
 *   norm(unitRaw)                    -> canonical unit ('шт', 'м', 'т', 'м3', 'маш-ч', '100м', '1000шт' …) or null
 *   factor(from, to, itemData)       -> a price per `from` × factor = a price per `to`; null when not convertible.
 *                                       Changes that need item data (kg per m, m³ per piece, pack content) read it
 *                                       from `itemData` (see itemAttrs) or give null.
 *   canon(u), dim(u), same(a, b), parse(u), itemAttrs(unit, unitRaw, attrs)
 *
 * The tables are generic unit vocabulary. Comments that named where a spelling was seen are kept privately in the
 * reference kit; this file is otherwise unchanged from the measured version. Tables change only with the parity
 * measurement (test/refs-parity.cjs).
 */
(function (root) {
  'use strict';

  var BASE = {
    'шт': { dim: 'count', size: 1 },
    'м': { dim: 'len', size: 1 },
    'км': { dim: 'len', size: 1000 },
    'кг': { dim: 'mass', size: 1 },
    'т': { dim: 'mass', size: 1000 },
    'г': { dim: 'mass', size: 0.001 },
    'м3': { dim: 'vol', size: 1 },
    'л': { dim: 'vol', size: 0.001 },
    'дал': { dim: 'vol', size: 0.01 },
    'м2': { dim: 'area', size: 1 },
    'компл': { dim: 'kit', size: 1 },
    'маш-ч': { dim: 'mach_h', size: 1 },
    'чел-ч': { dim: 'man_h', size: 1 },
    'т-км': { dim: 't_km', size: 1 },
    'кВт-ч': { dim: 'kwh', size: 1 },
    'кВАр': { dim: 'kvar', size: 1 },
    'упак': { dim: 'упак', size: 1 },
    'пачка': { dim: 'пачка', size: 1 },
    'рулон': { dim: 'рулон', size: 1 },
    'лист': { dim: 'лист', size: 1 },
    'пара': { dim: 'pair', size: 1 },
    'м шва': { dim: 'seam', size: 1 },
    '%': { dim: 'pct', size: 1 }
  };

  var PACK_DIM = { 'упак': 1, 'пачка': 1, 'рулон': 1, 'лист': 1 };

  var WORD = {
    'шт': 'шт', 'штук': 'шт', 'штука': 'шт', 'штуки': 'шт',
    'ш': 'шт',
    'дона': 'шт', 'dona': 'шт',
    'pcs': 'шт', 'sht': 'шт',
    'м': 'м', 'метр': 'м', 'метра': 'м', 'метров': 'м', 'm': 'м',
    'пм': 'м', 'погонныйметр': 'м', 'погм': 'м', 'мп': 'м',
    'км': 'км', 'километр': 'км', 'km': 'км',
    'кг': 'кг', 'килограмм': 'кг', 'kg': 'кг',
    'т': 'т', 'тн': 'т', 'тонна': 'т', 'тонну': 'т', 'тонн': 'т', 'тонны': 'т',
    't': 'т', 'tn': 'т', 'tonna': 'т',
    'г': 'г', 'грамм': 'г',
    'м3': 'м3', 'мз': 'м3', 'm3': 'м3', 'куб': 'м3', 'кубм': 'м3', 'кубметр': 'м3', 'кубическийметр': 'м3',
    'kubmetr': 'м3', 'м³': 'м3',
    'л': 'л', 'литр': 'л', 'литра': 'л', 'литров': 'л', 'l': 'л',
    'ли': 'л',
    'дал': 'дал', 'декалитр': 'дал',
    'м2': 'м2', 'квм': 'м2', 'м²': 'м2', 'm2': 'м2',
    'компл': 'компл', 'комп': 'компл', 'комплект': 'компл', 'кт': 'компл', 'кмпл': 'компл',
    'камп': 'компл', 'ком': 'компл', 'копл': 'компл', 'коплект': 'компл',
    'комплектдаги': 'компл',
    'kompl': 'компл', 'komplekt': 'компл',
    'машч': 'маш-ч', 'машчас': 'маш-ч', 'машчаса': 'маш-ч', 'машинч': 'маш-ч', 'машиночас': 'маш-ч',
    'мчас': 'маш-ч',
    'mashsoat': 'маш-ч', 'msoat': 'маш-ч', 'машсоат': 'маш-ч',
    'челч': 'чел-ч', 'челчас': 'чел-ч', 'кишисоат': 'чел-ч',
    'ткм': 'т-км', 'тнкм': 'т-км', 'tkm': 'т-км', 'tnkm': 'т-км',
    'квтч': 'кВт-ч', 'квтчас': 'кВт-ч',
    'квтс': 'кВт-ч',
    'квар': 'кВАр',
    'упак': 'упак', 'упаковка': 'упак', 'упаковки': 'упак', 'уп': 'упак', 'пакет': 'упак',
    'мешок': 'упак', 'мешка': 'упак', 'коробка': 'упак', 'короб': 'упак', 'ведро': 'упак',
    'пачка': 'пачка', 'пачки': 'пачка',
    'рулон': 'рулон', 'рул': 'рулон',
    'лист': 'лист', 'листа': 'лист',
    'пара': 'пара', 'пар': 'пара',
    'мшва': 'м шва',
    '%': '%'
  };

  var WORD_MULT = {
    'тшт': [1000, 'шт'],
    'тысшт': [1000, 'шт']
  };

  function unbreak(s) {
    return s.replace(/упако-вка|упаков-ка/g, 'упаковка').replace(/короб-ка/g, 'коробка');
  }

  function num(s) {
    if (s === null || s === undefined || s === '') return NaN;
    if (typeof s === 'number') return s;
    var t = String(s).replace(/\s+/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    return parseFloat(t);
  }

  function fmtMult(m) {
    var r = Math.round(m * 1e6) / 1e6;
    return String(r);
  }

  function squeeze(s) {
    return s.replace(/[\s.\-\/‐-―_]+/g, '').replace(/[()]/g, '');
  }

  function parsePart(s0) {
    var s = unbreak(s0.replace(/\(column header\)/g, ' '));
    s = s.replace(/\s+/g, ' ').replace(/^[\s,;:]+|[\s,;:]+$/g, '');
    if (!s) return null;

    var ci = s.indexOf('цена');
    if (ci >= 0) {
      var tail = s.slice(ci + 4);
      var m0 = /^\s*(?:за\s*)?(\d+(?:[.,]\d+)?\s*[^\s,(]+)/.exec(tail);
      if (m0) s = m0[1];
      else {
        var p0 = /\(([^)]+)\)/.exec(tail);
        if (!p0) return null;
        s = p0[1];
      }
    }
    s = s.replace(/^(?:за|на)\s*/, '')
      .replace(/\s+(?:продукцию|uchun|махсулотлар|трубы)(?:\s.*)?$/, '')
      .replace(/^в\s+\S+\s+/, '')
      .replace(/^\(+|\)+$/g, '')
      .replace(/\s+с\s+(?:ндс|учетом).*$/, '')
      .replace(/\s+без\s+ндс.*$/, '')
      .trim();
    if (!s) return null;

    var pk = /^(упаковка|упаковки|упак|уп|мешок|мешка|коробка|короб|ведро|пакет|канистра|бочка)\.?\s*(\d+(?:[.,]\d+)?)\s*(кг|г|л|т|шт)\.?$/.exec(s);
    if (pk) return pack(num(pk[2]), WORD[squeeze(pk[3])]);
    var bm = /^(\d+(?:[.,]\d+)?)\s*(кг)\.?$/.exec(s);
    if (bm && num(bm[1]) !== 1) return pack(num(bm[1]), 'кг');

    var mult = 1, rest = s;
    var mm = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(s);
    if (mm && mm[2]) {
      mult = num(mm[1]);
      rest = mm[2];
    }
    var key = squeeze(rest);
    if (WORD_MULT[key]) return unit(mult * WORD_MULT[key][0], WORD_MULT[key][1]);
    var base = WORD[key];
    if (!base) {
      if (key.charAt(key.length - 1) === 'а' && WORD[key.slice(0, -1)]) base = WORD[key.slice(0, -1)];
    }
    if (!base) return null;
    return unit(mult, base);
  }

  function unit(mult, base) {
    if (!BASE[base] || !(mult > 0)) return null;
    return { unit: (mult === 1 ? '' : fmtMult(mult)) + base, mult: mult, base: base, pack: null };
  }

  function pack(qty, contentUnit) {
    if (!(qty > 0) || !contentUnit || !BASE[contentUnit]) return null;
    var p = {}, b = BASE[contentUnit];
    if (b.dim === 'mass') p.pack_kg = qty * b.size;
    else if (b.dim === 'vol') p.pack_l = qty * b.size * 1000;
    else if (b.dim === 'count') p.pack_pcs = qty;
    else return null;
    return { unit: 'упак', mult: 1, base: 'упак', pack: p };
  }

  function parse(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).toLowerCase().replace(/ё/g, 'е').replace(/ /g, ' ').trim();
    if (!s) return null;
    var parts = s.split(/\s+\/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var r = parsePart(parts[i]);
      if (r) return r;
    }
    return null;
  }

  function norm(raw) {
    var r = parse(raw);
    return r ? r.unit : null;
  }

  var CANON_RE = /^(\d+(?:\.\d+)?)?(.+)$/;
  var canonCache = {};
  function canon(u) {
    if (u === null || u === undefined || u === '') return null;
    var k = String(u);
    if (Object.prototype.hasOwnProperty.call(canonCache, k)) return canonCache[k];
    var out = null, m = CANON_RE.exec(k);
    if (m && BASE[m[2]] && (m[1] === undefined || parseFloat(m[1]) > 0)) {
      out = { mult: m[1] === undefined ? 1 : parseFloat(m[1]), base: m[2] };
    } else {
      var p = parse(k);
      if (p) out = { mult: p.mult, base: p.base };
    }
    if (out) { out.dim = BASE[out.base].dim; out.size = BASE[out.base].size; }
    canonCache[k] = out;
    return out;
  }

  function pos(v) { var n = num(v); return n > 0 && isFinite(n) ? n : 0; }

  function links(attrs, fromDim) {
    var out = [];
    if (!attrs) return out;
    var v;
    if ((v = pos(attrs.kg_per_m))) out.push(['len', 'mass', v]);
    if ((v = pos(attrs.m_per_piece))) out.push(['count', 'len', v]);
    if ((v = pos(attrs.m3_per_piece))) out.push(['count', 'vol', v]);
    if ((v = pos(attrs.m2_per_piece))) out.push(['count', 'area', v]);
    if ((v = pos(attrs.kg_per_piece))) out.push(['count', 'mass', v]);
    if ((v = pos(attrs.t_per_m3))) out.push(['vol', 'mass', v * 1000]);
    if ((v = pos(attrs.kg_per_l))) out.push(['vol', 'mass', v * 1000]);
    if (PACK_DIM[fromDim]) {
      if ((v = pos(attrs.pack_kg))) out.push([fromDim, 'mass', v]);
      if ((v = pos(attrs.pack_pcs))) out.push([fromDim, 'count', v]);
      if ((v = pos(attrs.pack_m))) out.push([fromDim, 'len', v]);
      if ((v = pos(attrs.pack_m2))) out.push([fromDim, 'area', v]);
      if ((v = pos(attrs.pack_l))) out.push([fromDim, 'vol', v / 1000]);
      if ((v = pos(attrs.pack_m3))) out.push([fromDim, 'vol', v]);
    }
    return out;
  }

  function factor(from, to, attrs) {
    var a = canon(from), b = canon(to);
    if (!a || !b) return null;
    var qa = a.mult * a.size, qb = b.mult * b.size;
    if (a.dim === b.dim) return qb / qa;
    var L = links(attrs, a.dim);
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      if (l[0] === a.dim && l[1] === b.dim) return qb / (qa * l[2]);
      if (l[0] === b.dim && l[1] === a.dim) return (qb * l[2]) / qa;
    }
    return null;
  }

  function same(from, to) { return factor(from, to) === 1; }

  function itemAttrs(unitIn, unitRaw, attrs) {
    var a = attrs || {}, out = {}, c = canon(unitIn), v;
    if (!c) return out;
    v = pos(a.kg_per_m) || pos(a.mass_kg_m) || pos(a.mass_theoretical_kg_m);
    if (!v && pos(a.m_per_t)) v = 1000 / pos(a.m_per_t);
    if (v) out.kg_per_m = v;
    v = pos(a.t_per_m3) || pos(a.density_t_per_unit);
    if (v && c.dim === 'vol') out.t_per_m3 = v;
    if (c.dim === 'count') {
      if ((v = pos(a.m3_per_piece) || pos(a.vol_m3))) out.m3_per_piece = v;
      if ((v = pos(a.m_per_piece) || pos(a.length_m))) out.m_per_piece = v;
      if ((v = pos(a.kg_per_piece) || pos(a.mass_kg) || pos(a.pack_kg))) out.kg_per_piece = v;
      var pq = pos(a.pack_qty), pu = a.pack_unit ? canon(a.pack_unit) : null;
      if (pq && pu) {
        if (pu.dim === 'mass' && !out.kg_per_piece) out.kg_per_piece = pq * pu.mult * pu.size;
        else if (pu.dim === 'vol' && !out.m3_per_piece) out.m3_per_piece = pq * pu.mult * pu.size;
        else if (pu.dim === 'len' && !out.m_per_piece) out.m_per_piece = pq * pu.mult * pu.size;
      }
    }
    if (PACK_DIM[c.dim]) {
      var pr = parse(unitRaw);
      var pp = pr && pr.pack ? pr.pack : {};
      if ((v = pos(a.pack_kg) || pos(pp.pack_kg))) out.pack_kg = v;
      if ((v = pos(a.pack_l) || pos(pp.pack_l))) out.pack_l = v;
      if ((v = pos(a.pack_pcs) || pos(a.bundle_pcs) || pos(pp.pack_pcs))) out.pack_pcs = v;
      if (c.dim === 'рулон' && (v = pos(a.roll_length_m))) out.pack_m = v;
    }
    return out;
  }

  var api = {
    BASE: BASE,
    WORD: WORD,
    norm: norm,
    parse: parse,
    canon: canon,
    factor: factor,
    same: same,
    itemAttrs: itemAttrs,
    dim: function (u) { var c = canon(u); return c ? c.dim : null; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Units = api;
})(this);
