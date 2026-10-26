/*
 * Reference prices: what a suggestion line says to the expert, in Russian.
 *
 *   S.refs.RU = { TIER, FLAG, BASIS, DOC }      one table for the engine's `label` and the popover
 *   S.refs.view(line, ctx) → { price, badge, summary, flags[], name, evidence[], source, conv, basis, age, vsSmeta,
 *                              components[] }
 *   ctx: { sources: { id: { doc_type, issuer, doc_no, issue_date, as_of_date, region } } | Map,
 *          asof: 'YYYY-MM-DD', smetaPrice: number, unit: the smeta unit, regionLabel: function (key) → label,
 *          queryName: the smeta's own name of the resource }
 *
 * Everything shown is built from the structured fields of the line (tier, flags, name, how, sim, drop, changed,
 * range, raw, published, price_date, src → ctx.sources, region → a region label, components). The engine's `why`
 * texts are for measurement only and are never shown: they hold internal family keys and file ids. Neither is a
 * source id or a raw region key ever printed — a source without an issuer shows its document type.
 *
 * What the parsers dropped or changed (drop, changed) is written in their normalized tokens: Latin letters moved to
 * their Cyrillic twins, word stems, country codes. Each token is shown as the record's or the smeta's own name spells
 * it, else in one script (a letter only Latin has makes the word Latin, one only Cyrillic has makes it Cyrillic), and
 * country codes as country names. The issuer and the number of a document lose the extractor's notes (parentheses,
 * lower-case English notes such as «not stated …») and are cut at a word, with «…».
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var R = S.refs = S.refs || {};

  var RU = {
    TIER: { exact: 'Ставка по таблице', document: 'Документ', similar: 'Похожий', estimate: 'Оценка' },
    FLAG: {
      stale: 'старше 13 нед.', forward: 'форвард', vat_inferred: 'НДС выведен', delivered: 'с доставкой',
      'plant-calc': 'калькуляция завода', 'other-region': 'другой регион', 'non-construction': 'не строительный лот биржи',
      'excludes-pipe-cost': 'без стоимости трубы', 'km-bands': 'медиана по расстояниям', 'older-quarter': 'прошлый квартал',
      'issue-after-asof': 'издан после даты', declared: 'заявленная цена', 'document-states-more': 'документ подробнее',
      'derived-unit': 'пересчёт по данным изделия', 'wide-spread': 'документы расходятся'
    },
    BASIS: {
      offer: 'предложение', 'exchange-spot': 'биржа', 'exchange-forward': 'биржа, форвард', catalogue: 'каталог',
      list: 'прайс-лист', recommended: 'рекомендовано', 'wage-12%': 'ставка с соцстрахом 12 %', declared: 'заявлено',
      'plant-calc': 'калькуляция завода', protocol: 'протокол', invoice: 'счёт', 'designer-memory': 'цена проектировщика',
      median: 'медиана'
    },
    DOC: {
      'expert-conclusion': 'заключение экспертизы', 'exchange-quotes': 'биржевые котировки',
      'manufacturer-list': 'прайс-лист производителя', 'supplier-offer': 'предложение поставщика',
      'plant-calculation': 'калькуляция завода', 'regional-catalogue': 'региональный каталог цен',
      'dealer-list': 'прайс-лист дилера', 'manufacturer-catalogue': 'каталог производителя', 'wage-table': 'таблица ставок',
      'spec-sheet': 'спецификация', 'price-list': 'прайс-лист', brochure: 'буклет', 'company-profile': 'сведения о компании',
      'price-proposal': 'ценовое предложение', 'supplier-list': 'прайс-лист поставщика', invoice: 'счёт',
      'machine-hour-list': 'перечень стоимости машино-часа', offer: 'предложение'
    }
  };

  var NF2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var NF0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  function money(v) { return v == null || !isFinite(v) ? '' : NF2.format(Math.round(v * 100) / 100).replace(/ /g, ' '); }
  function whole(v) { return v == null || !isFinite(v) ? '' : NF0.format(Math.round(v)).replace(/ /g, ' '); }
  function dec(v, d) { return v.toFixed(d).replace('.', ','); }
  function ruDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : ''; }
  function has(a, x) { return !!a && a.indexOf(x) >= 0; }

  function srcOf(ctx, id) {
    var s = ctx && ctx.sources;
    if (!s || !id) return null;
    if (typeof s.get === 'function') return s.get(id) || null;
    return Object.prototype.hasOwnProperty.call(s, id) ? s[id] : null;
  }
  function regionName(ctx, key) {
    if (!key) return '';
    if (key === 'national') return 'вся республика';
    var f = (ctx && ctx.regionLabel) || S.regionLabel;
    var t = f ? f(key) : '';
    // never a raw region key: an unknown key reads as «другой регион»
    return t && t !== key ? t : 'другой регион';
  }
  /** 1 строка, 2 строки, 5 строк */
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  }
  function lines(n) { return plural(n, 'строка', 'строки', 'строк'); }
  function flagText(f) {
    if (RU.FLAG[f]) return RU.FLAG[f];
    var m = /^median-of-(\d+)-lines$/.exec(f);
    if (m) return 'медиана: ' + lines(+m[1]);
    m = /^median-of-(\d+)$/.exec(f);
    if (m) return 'медиана: ' + plural(+m[1], 'запись', 'записи', 'записей');
    return null;
  }
  function quarter(d) { return d ? d.slice(0, 4) + ', ' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1) + ' кв.' : ''; }

  /* ------------------------------------------------------------------ the parsers' tokens, as the names spell them */
  var L2C = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
  var C2L = {};
  for (var l2c in L2C) C2L[L2C[l2c]] = l2c;
  var LAT_ONLY = /[DFGIJLNQRSUVWZ]/, CYR_ONLY = /[БГДЁЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯЎҚҒҲ]/;
  var AN = '0-9A-Za-zА-Яа-яЁё';
  var TOKEN = new RegExp('[' + AN + '](?:[' + AN + '.\\-/]*[' + AN + '])?', 'g');
  var COUNTRY = { RU: 'Россия', UZ: 'Узбекистан', CN: 'Китай', TR: 'Турция', BY: 'Беларусь', UA: 'Украина', KZ: 'Казахстан',
    IR: 'Иран', AZ: 'Азербайджан', PL: 'Польша', DK: 'Дания', FR: 'Франция', KG: 'Кыргызстан', DE: 'Германия',
    IT: 'Италия', KR: 'Корея', IN: 'Индия' };

  function swap(c, map) {
    var u = map[c.toUpperCase()];
    return u ? (c === c.toUpperCase() ? u : u.toLowerCase()) : c;
  }
  function toLatin(s) { return s.replace(/[А-ЯЁа-яё]/g, function (c) { return swap(c, C2L); }); }
  function toCyrillic(s) { return s.replace(/[A-Za-z]/g, function (c) { return swap(c, L2C); }); }
  /** One script for a word the parsers mixed: a letter only Latin has makes it Latin, one only Cyrillic has makes it
      Cyrillic; twin letters only — the script most of them are in. */
  function oneScript(tok) {
    if (!/[A-Za-z]/.test(tok) || !/[А-Яа-яЁё]/.test(tok)) return tok;
    var up = tok.toUpperCase(), lat = LAT_ONLY.test(up), cyr = CYR_ONLY.test(up);
    if (lat && !cyr) return toLatin(tok);
    if (cyr && !lat) return toCyrillic(tok);
    if (lat && cyr) return tok;
    return (tok.match(/[A-Za-z]/g) || []).length > (tok.match(/[А-Яа-яЁё]/g) || []).length ? toLatin(tok) : toCyrillic(tok);
  }
  /** «НD270» → a pattern that finds «HD-270» in a name: either twin of each letter, any case, a separator or none. */
  function tokenRx(tok, stem) {
    var parts = [];
    for (var i = 0; i < tok.length; i++) {
      var ch = tok.charAt(i), up = ch.toUpperCase(), tw = L2C[up] || C2L[up];
      if (/[0-9]/.test(ch)) parts.push(ch);
      else if (/[A-Za-zА-Яа-яЁё]/.test(ch)) parts.push('[' + up + up.toLowerCase() + (tw ? tw + tw.toLowerCase() : '') + ']');
      else parts.push('[.\\-/]?');
    }
    return new RegExp('(^|[^' + AN + '])(' + parts.join('[\\s\\-–./]?') + (stem ? '[А-Яа-яЁё]+' : '') + ')(?![' + AN + '])');
  }
  function spell(tok, names) {
    var letters = (tok.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
    if (!letters || tok === tok.toLowerCase()) return tok;          // a Russian label word, a plain number
    if (tok.length >= 3 && letters >= 2) {
      var rx = tokenRx(tok, false), i, m;
      // a name typed with the keyboard layout half-switched is itself mixed: its spelling, in one script
      for (i = 0; i < names.length; i++) if (names[i] && (m = rx.exec(names[i]))) return oneScript(m[2]);
      // a word stem («ДИЗЕЛ»): the whole word of the name it starts
      if (letters >= 4 && /^[А-ЯЁа-яё]+$/.test(tok)) {
        rx = tokenRx(tok, true);
        for (i = 0; i < names.length; i++) if (names[i] && (m = rx.exec(names[i]))) return oneScript(m[2]);
      }
    }
    return oneScript(tok);
  }
  /** A drop / changed label of a parser, readable: its tokens as the names spell them, country codes named. */
  function label(s, names) {
    var t = String(s == null ? '' : s);
    var c = /^страна ([A-Z]{2}(?:\/[A-Z]{2})*)$/.exec(t);
    if (c) return 'страна ' + c[1].split('/').map(function (x) { return COUNTRY[x] || x; }).join(', ');
    return t.replace(TOKEN, function (tok) { return spell(tok, names || []); });
  }
  function labels(list, names) {
    var out = [];
    for (var i = 0; i < (list || []).length; i++) { var x = label(list[i], names); if (out.indexOf(x) < 0) out.push(x); }
    return out;
  }

  /* ------------------------------------------------------------------ the document */
  /* an issuer written in lower-case Latin words only is the extractor's note that the document names none
     («unknown», «not given …», «a price catalogue of …»), not a name; so is a part of a number that starts with a
     lower-case Latin word («calc …», «temp. …») and a parenthesis holding one («(prices)», «(second digit …)») */
  var NOTE = /^[a-z][a-z\s(),.;:'"«»-]*$/;
  var NOTE_PAREN = /\s*\([^()]*[a-z]{3}[^()]*\)/g;
  var NOTE_PART = /^[a-z]{2,}\.?(\s|$)/;

  /** Cut at a word, with «…». */
  function cut(s, max) {
    if (s.length <= max) return s;
    var c = s.slice(0, max), sp = c.lastIndexOf(' ');
    return (sp > max * 0.6 ? c.slice(0, sp) : c).replace(/[\s,;:«(—–-]+$/, '') + '…';
  }
  /** Who issued the document, without the extractor's notes; '' when it names nobody. */
  function issuerText(src) {
    var t = src && src.issuer ? String(src.issuer) : '';
    t = t.replace(/\s*\(.*$/, '').replace(/\s+[—–]\s+[a-z].*$/, '').replace(/\s+/g, ' ').trim();
    if (!t || NOTE.test(t)) return '';
    return cut(t, 80);
  }
  /** The document's number, without the extractor's notes; '' when none is left. */
  function docNoText(src) {
    var t = src && src.doc_no ? String(src.doc_no) : '';
    t = t.replace(NOTE_PAREN, '').split(/\s*;\s*/).filter(function (p) { return p && !NOTE_PART.test(p); }).join('; ');
    t = t.replace(/\s+/g, ' ').trim();
    return t && !NOTE.test(t) ? cut(t, 60) : '';
  }

  /** «ООО … № …», «биржа», «каталог: <завод>», or the document type: never a source id. */
  function sourceLabel(src, group, plant, basis) {
    if (basis === 'exchange-spot' || basis === 'exchange-forward' || group === 'exchange') return 'биржа';
    if (group === 'catalogue' && plant) return 'каталог: ' + plant;
    var t = issuerText(src);
    if (!t) t = (src && RU.DOC[src.doc_type]) || 'документ';
    var no = docNoText(src);
    if (no) t += (/^№/.test(no) ? ' ' : ' № ') + no;
    return t;
  }

  function evidence(l, ctx) {
    var ev = [];
    var names = [l.name || '', (ctx && ctx.queryName) || ''];
    var drop = labels(l.drop, names), changed = labels(l.changed, names);
    if (l.how === 'wage') {
      ev.push(['таблица ставок', regionName(ctx, l.region), quarter(l.price_date), l.published ? 'опубл. ' + ruDate(l.published) : '']
        .filter(function (x) { return x; }).join(' · '));
    } else if (has(l.flags, 'document-states-more')) ev.push('то же изделие; документ указывает больше' + (drop.length ? ': ' + drop.join(', ') : ''));
    else if (l.how === 'exact-key') ev.push('то же наименование');
    else if (l.how === 'family') ev.push('те же характеристики');
    else if (l.how === 'family-relaxed') {
      ev.push('близкие характеристики' + (changed.length ? '; отличается: ' + changed.join(', ') : drop.length ? '; без: ' + drop.join(', ') : ''));
    } else if (l.how === 'fuzzy') ev.push('похожее наименование' + (typeof l.sim === 'number' ? ' (сходство ' + dec(l.sim, 2) + ')' : ''));
    else if (l.how === 'tariff') ev.push('тариф т·км по полосе расстояния');
    else if (l.how === 'tariff-other-vehicle') ev.push('тариф т·км другой машины' + (drop.length ? '; ' + drop.join(', ') : ''));
    if (l.range && l.range.n) ev.push('документы расходятся: ' + lines(l.range.n) + ', ' + money(l.range.min) + ' – ' + money(l.range.max));
    return ev;
  }

  function ageText(asof, d) {
    if (!asof || !d) return '';
    var days = Math.round((Date.parse(asof) - Date.parse(d)) / 86400000);
    if (!isFinite(days)) return '';
    if (days < 0) return 'после даты';
    if (days < 14) return days === 0 ? 'на эту дату' : days + ' дн. назад';
    if (days < 63) return Math.round(days / 7) + ' нед. назад';
    return Math.round(days / 30.44) + ' мес. назад';
  }

  /** «за 1 м», but «за 100 м» for a unit that carries its own multiplier (never «за 1 100 м»). */
  function per(u) {
    var s = String(u || '?').trim();
    var m = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(s);
    return m ? 'за ' + m[1] + (m[2] ? ' ' + m[2] : '') : 'за 1 ' + s;
  }
  function convText(l, unit) {
    var raw = l.raw;
    // a median line has no single conversion: its components carry their own documents
    if (l.summary || !raw || raw.factor === 1 || raw.factor == null) return '';
    var t = whole(raw.price) + ' ' + per(raw.unit) + ' → ' + money(l.price) + ' ' + per(unit || l.unit);
    if (has(l.flags, 'derived-unit') || l.tier === 'estimate') t += ' (по данным изделия)';
    return t;
  }

  /* the line names its source family (sfam): «exchange…», «catalogue|<plant>|<region>», else group|issuer|region */
  function groupOf(l) {
    var f = String(l.sfam || '');
    if (/^exchange/.test(f)) return { group: 'exchange', plant: null };
    var m = /^catalogue\|([^|]*)\|/.exec(f);
    if (m) return { group: 'catalogue', plant: m[1] && m[1] !== '?' ? m[1] : null };
    return { group: null, plant: null };
  }

  function sourceText(l, ctx, src) {
    var g = groupOf(l);
    var parts = [sourceLabel(src, g.group, g.plant, l.basis)];
    var docDate = src ? (src.issue_date || src.as_of_date) : null;
    if (docDate) parts.push('документ от ' + ruDate(docDate));
    if (l.price_date) parts.push('цена на ' + ruDate(l.price_date));
    var reg = regionName(ctx, l.region);
    if (reg) parts.push(reg);
    return parts.join(' · ');
  }

  function component(c, ctx) {
    var src = srcOf(ctx, c.src);
    return {
      price: money(c.price),
      name: c.name || '',
      evidence: evidence(c, ctx),
      source: sourceText({ basis: c.basis, price_date: c.price_date, region: c.region }, ctx, src),
      date: ruDate(c.price_date)
    };
  }

  function view(line, ctx) {
    var c = ctx || {};
    var l = line;
    var src = l.summary ? null : srcOf(c, l.src);
    var flags = [];
    for (var i = 0; i < (l.flags || []).length; i++) {
      if (l.summary && /^median-of-/.test(l.flags[i])) continue;   // the summary says how many lines and documents
      var t = flagText(l.flags[i]);
      if (t && flags.indexOf(t) < 0) flags.push(t);
    }
    var out = {
      price: money(l.price),
      badge: RU.TIER[l.tier] || 'Похожий',
      summary: '',
      flags: flags,
      name: l.name || '',
      evidence: evidence(l, c),
      source: l.summary ? 'несколько документов' : sourceText(l, c, src),
      conv: convText(l, c.unit),
      basis: RU.BASIS[l.basis] || '',
      age: ageText(c.asof, l.price_date),
      vsSmeta: '',
      components: []
    };
    if (l.summary && l.components) {
      // lines of one document count once: «Медиана: 4 строки из 2 документов», «Медиана: 3 документа»
      var seen = {}, nd = 0, n = l.components.length;
      for (var j = 0; j < n; j++) {
        var sk = l.components[j].src ? 's:' + l.components[j].src : 'i:' + j;
        if (!seen[sk]) { seen[sk] = true; nd++; }
      }
      out.summary = 'Медиана: ' + (nd < n ? lines(n) + ' из ' + plural(nd, 'документа', 'документов', 'документов')
        : plural(n, 'документ', 'документа', 'документов')) + (l.spread ? ' (разброс ×' + dec(l.spread, 2) + ')' : '');
      out.components = l.components.map(function (x) { return component(x, c); });
    }
    if (c.smetaPrice > 0 && l.price > 0) {
      var d = (l.price / c.smetaPrice - 1) * 100;
      out.vsSmeta = 'к сметной цене: ' + (d > 0 ? '+' : d < 0 ? '−' : '') + dec(Math.abs(d), 1) + ' %';
    }
    return out;
  }

  R.RU = RU;
  R.view = view;
  R.viewParts = { money: money, ruDate: ruDate, sourceLabel: sourceLabel, regionName: regionName, ageText: ageText,
    issuerText: issuerText, docNoText: docNoText, label: label, per: per };
})(S);
