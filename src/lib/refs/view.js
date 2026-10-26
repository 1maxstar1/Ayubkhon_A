/*
 * Reference prices: what a suggestion line says to the expert, in Russian.
 *
 *   S.refs.RU = { TIER, FLAG, BASIS, DOC }      one table for the engine's `label` and the popover
 *   S.refs.view(line, ctx) → { price, badge, summary, flags[], name, evidence[], source, conv, basis, age, vsSmeta,
 *                              components[] }
 *   ctx: { sources: { id: { doc_type, issuer, doc_no, issue_date, as_of_date, region } } | Map,
 *          asof: 'YYYY-MM-DD', smetaPrice: number, unit: the smeta unit, regionLabel: function (key) → label }
 *
 * Everything shown is built from the structured fields of the line (tier, flags, name, how, sim, drop, changed,
 * range, raw, published, price_date, src → ctx.sources, region → a region label, components). The engine's `why`
 * texts are for measurement only and are never shown: they hold internal family keys and file ids. Neither is a
 * source id or a raw region key ever printed — a source without an issuer shows its document type.
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
  function flagText(f) {
    if (RU.FLAG[f]) return RU.FLAG[f];
    var m = /^median-of-(\d+)-lines$/.exec(f);
    if (m) return 'медиана ' + m[1] + ' строк';
    m = /^median-of-(\d+)$/.exec(f);
    if (m) return 'медиана ' + m[1] + ' записей';
    return null;
  }
  /** 1 строка, 2 строки, 5 строк */
  function lines(n) {
    var m10 = n % 10, m100 = n % 100;
    var w = m10 === 1 && m100 !== 11 ? 'строка' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'строки' : 'строк';
    return n + ' ' + w;
  }
  function quarter(d) { return d ? d.slice(0, 4) + ', ' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1) + ' кв.' : ''; }

  /* an issuer written in lower-case Latin words only is the extractor's note that the document names none
     («unknown», «not stated …»), not a name */
  var NOTE = /^[a-z][a-z\s(),.;:-]*$/;

  /** «ООО … № …», «биржа», «каталог: <завод>», or the document type: never a source id. */
  function sourceLabel(src, group, plant, basis) {
    if (basis === 'exchange-spot' || basis === 'exchange-forward' || group === 'exchange') return 'биржа';
    if (group === 'catalogue' && plant) return 'каталог: ' + plant;
    var t = src && src.issuer && !NOTE.test(String(src.issuer).trim()) ? String(src.issuer).replace(/\s*\(.*$/, '').slice(0, 80) : '';
    if (!t) t = (src && RU.DOC[src.doc_type]) || 'документ';
    if (src && src.doc_no) t += (/^№/.test(src.doc_no) ? ' ' : ' № ') + src.doc_no;
    return t;
  }

  function evidence(l, ctx) {
    var ev = [];
    var drop = l.drop || [], changed = l.changed || [];
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

  function convText(l, unit) {
    var raw = l.raw;
    // a median line has no single conversion: its components carry their own documents
    if (l.summary || !raw || raw.factor === 1 || raw.factor == null) return '';
    var t = whole(raw.price) + ' за 1 ' + (raw.unit || '?') + ' → ' + money(l.price) + ' за 1 ' + (unit || l.unit || '?');
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
    for (var i = 0; i < (l.flags || []).length; i++) { var t = flagText(l.flags[i]); if (t && flags.indexOf(t) < 0) flags.push(t); }
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
      out.summary = 'Медиана ' + l.components.length + ' документов' + (l.spread ? ' (разброс ×' + dec(l.spread, 2) + ')' : '');
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
  R.viewParts = { money: money, ruDate: ruDate, sourceLabel: sourceLabel, regionName: regionName, ageText: ageText };
})(S);
