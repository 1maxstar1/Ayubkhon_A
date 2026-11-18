/*
 * The memory of finished applications, put to use (docs/ai-reja.md, phase 2): what the rows of price_memory mean for
 * one resource of the application open now. Pure — no page, no server: the page gives the rows and reads the answer.
 *
 *   S.memory.rank(rows, ctx) → { prices: [entry…], ceiling: { price, apps, weight, rows } | null }
 *   S.memory.verdict(smetaPrice, ceiling) → 'accepted' | 'above' | ''
 *   S.memory.dateOf(row) → 'YYYY-MM-DD' | '': the date a price is for — its application's date (`asof`: the date the
 *         reference was asked as of, the registration date unless one was picked), or the day it was finished when
 *         that is earlier or the other is missing. An application of last year finished today is last year's price.
 *   rows: price_memory records of ONE resource (same match key and unit key), same region, other workspaces:
 *         { id, workspace, application, contragent, kind, source, smeta_price, final_price, asof, finished, accepted, number, who }
 *   ctx:  { contragent, today: 'YYYY-MM-DD' }
 *
 * Two kinds of evidence, two meanings (the owner's rule):
 *
 *   A corrected price is the expert's market price — a suggestion. In this order:
 *     1  the same contragent, 2  another contragent; inside each, one the contractor took («Исправлено») first, then
 *     the newest. One line per application. A price «Применить %» set is not one (a blanket discount is not a price
 *     looked up), a price of 0 is a resource struck out — neither is ever offered. Older than PRICE_MONTHS: not shown.
 *
 *   Ages are counted from the application's date (dateOf), not from the day «✓ Завершить» was pressed.
 *
 *   An untouched price is not a market price: by the program's own rule a smeta price below the market is left
 *   alone. It is a CEILING — «accepted up to this price». It counts only when independent applications agree:
 *     - applications are independent when their contragents differ (one contragent's own untouched price, however
 *       often repeated, never confirms itself);
 *     - each counts with a weight: 1 when the resource was marked «проверено» (by hand or at the finish), UNMARKED
 *       when it was merely left; times the age factor — whole for the first half of CEIL_MONTHS, then falling in a
 *       straight line to 0 at CEIL_MONTHS (prices rise: an old acceptance says less);
 *     - the ceiling is the highest price that at least two independent applications — at least one of them not the
 *       contragent of the application open now — accepted at or above, with weights adding up to NEED or more.
 *   A smeta price at or below the ceiling is «ранее принято»; above it, the row is pointed out.
 *
 *   With no ceiling, what was accepted still says something when the smeta price is above it (the owner's rule,
 *   2026-11-18: one application is enough for that): rank() gives a HINT — the highest price any application accepted,
 *   with how many applications — and hintVerdict() says 'above' over it. A hint never makes «ранее принято».
 *
 * Other regions are never read (the query is by region, as «Прежние проекты»).
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';

  var PRICE_MONTHS = 24;      // a corrected price older than this is not offered
  var CEIL_MONTHS = 12;       // an untouched price stops being a ceiling after this (the owner's default)
  var UNMARKED = 0.5;         // the weight of a price merely left, against 1 for one marked «проверено»
  var NEED = 1.5;             // weights that make a ceiling: two marked; one marked and one left; three left
  var DAY = 86400000;

  function months(from, today) {
    var a = Date.parse(String(from || '').slice(0, 10)), b = Date.parse(String(today || '').slice(0, 10));
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, (b - a) / DAY / 30.4375);
  }
  /** 1 for the first half of CEIL_MONTHS, then down to 0 at CEIL_MONTHS. */
  function ageFactor(age) {
    var half = CEIL_MONTHS / 2;
    return age <= half ? 1 : Math.max(0, 1 - (age - half) / (CEIL_MONTHS - half));
  }
  function dateOf(r) {
    var a = /^\d{4}-\d{2}-\d{2}/.test(String(r && r.asof || '')) ? String(r.asof).slice(0, 10) : '';
    var f = /^\d{4}-\d{2}-\d{2}/.test(String(r && r.finished || '')) ? String(r.finished).slice(0, 10) : '';
    return a && f ? (a < f ? a : f) : a || f;
  }
  function near(a, b) { var d = Math.abs(a - b); return d < 1e-6 || d < Math.abs(a) * 1e-9; }

  function rank(rows, ctx) {
    ctx = ctx || {};
    var mine = ctx.contragent || '', today = ctx.today || new Date().toISOString().slice(0, 10);
    var prices = [], seen = {}, groups = {};
    (rows || []).forEach(function (r) {
      if (!r || !(r.final_price > 0)) return;                       // struck out, or nothing
      var age = months(dateOf(r), today);
      if (age == null) return;
      if (r.kind === 'corrected') {
        if (r.source === 'pct' || age > PRICE_MONTHS) return;
        var one = (r.workspace || r.id) + '|' + r.final_price;      // variants of one name in one application: one line
        if (seen[one]) return;
        seen[one] = 1;
        prices.push({ row: r, cls: mine && r.contragent === mine ? 1 : 2, accepted: !!r.accepted, age: age, price: r.final_price });
      } else if (r.kind === 'checked' || r.kind === 'untouched') {
        if (age >= CEIL_MONTHS) return;
        var w = (r.kind === 'checked' ? 1 : UNMARKED) * ageFactor(age);
        // independent = another contragent; an application with none stands for itself
        var g = r.contragent || ('ws:' + (r.workspace || r.id));
        var cur = groups[g];
        // one contragent says one thing: its highest accepted price, at the best weight it was accepted with
        if (!cur) groups[g] = { price: r.final_price, w: w, own: !!mine && r.contragent === mine, rows: [r] };
        else { cur.rows.push(r); if (r.final_price > cur.price) cur.price = r.final_price; if (w > cur.w) cur.w = w; }
      }
    });
    prices.sort(function (a, b) {
      return a.cls - b.cls || (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0) || a.age - b.age || a.price - b.price;
    });

    var list = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.price - a.price; });
    var ceiling = null, w = 0, n = 0, other = false, used = [];
    for (var i = 0; i < list.length && !ceiling; i++) {
      w += list[i].w; n++; other = other || !list[i].own; used.push(list[i]);
      if (n >= 2 && other && w >= NEED - 1e-9) {
        ceiling = { price: list[i].price, apps: n, weight: w, rows: used.reduce(function (o, g) { return o.concat(g.rows); }, []) };
      }
    }
    // no ceiling: the highest price an application accepted, however few — for «выше принятого» only
    var live = list.filter(function (g) { return g.w > 0; });
    var hint = !ceiling && live.length
      ? { price: live[0].price, apps: live.length, rows: live.reduce(function (o, g) { return o.concat(g.rows); }, []) } : null;
    return { prices: prices, ceiling: ceiling, hint: hint };
  }

  /** A smeta price above every price accepted before, when there is no ceiling (rank().hint): 'above', else ''. */
  function hintVerdict(smeta, hint) {
    if (!hint || !(smeta > 0)) return '';
    return smeta > hint.price && !near(smeta, hint.price) ? 'above' : '';
  }

  /** How a smeta price stands to the ceiling: at or below it — accepted before; above — to be looked at. */
  function verdict(smeta, ceiling) {
    if (!ceiling || !(smeta > 0)) return '';
    return smeta <= ceiling.price || near(smeta, ceiling.price) ? 'accepted' : 'above';
  }

  /* ------------------------------------------------------------------ haulage: by its distance, not its name */

  // The price of hauling a tonne a kilometre goes by the distance, in bands (the owner's rule, 2026-11-18: 1–10 km,
  // 11–50 km, 51 km and more) — not by the way an estimator wrote the line. «Перевозка ГПС км 20», «Перевозка
  // Гравийно-песчаная смесь - 20 км» and «Перевозка Щебень - 5 км» never share a name key, and an earlier price of
  // one was never offered for another. For «Перевозка» lines in т·км only, an earlier corrected price of any
  // «Перевозка» line of the same band is offered: the same material first, then the others; each says the line it was
  // set for. Nothing else is matched this way.
  var HAUL_BANDS = [10, 50];
  var HAUL_UNIT = /^\s*т(?:н|онн?|онна|онно)?\.?\s*[\/\-·.*×x•]?\s*км\.?\s*$/i;
  // what is hauled, as one word: the abbreviations estimators use and the full names
  var HAUL_MAT = [
    [/(^|[^А-ЯЁ])(ГПС|ПГС)([^А-ЯЁ]|$)|ГРАВИЙНО|ПЕСЧАНО[\s-]*ГРАВ/, 'ГПС'],
    [/(^|[^А-ЯЁ])А\s*-?\s*Б([^А-ЯЁ]|$)|АСФАЛЬТ/, 'АСФАЛЬТОБЕТОН'],
    [/ЩЕБ[ЕЁ]?Н/, 'ЩЕБЕНЬ'],
    [/БИТУМ/, 'БИТУМ'],
    [/ЦЕМЕНТ/, 'ЦЕМЕНТ'],
    [/БЕТОН/, 'БЕТОН'],
    [/ПЕС[ОК]К|ПЕСОК|ПЕСКА/, 'ПЕСОК'],
    [/ГРУНТ/, 'ГРУНТ'],
    [/ГРАВИЙ/, 'ГРАВИЙ']
  ];
  /**
   * A «Перевозка» line in т·км: { km, band, mat } — band 1, 2, 3 by HAUL_BANDS; mat the material in one word (or the
   * rest of the name, folded). Anything else — another unit, no distance in the name, «Доставка …» — null.
   */
  function haul(name, unit) {
    var nm = String(name || '').replace(/\s+/g, ' ').trim();
    if (!/^ПЕРЕВОЗК/i.test(nm) || !HAUL_UNIT.test(String(unit || ''))) return null;
    // («\b» is no boundary next to a Cyrillic letter: the end of «км» is told by the letter that does not follow)
    var m = /(\d+(?:[.,]\d+)?)\s*км(?![А-Яа-яЁё])/i.exec(nm) || /(?:^|[^А-Яа-яЁё])км\.?\s*(\d+(?:[.,]\d+)?)/i.exec(nm);
    if (!m) return null;
    var km = parseFloat(m[1].replace(',', '.'));
    if (!(km > 0)) return null;
    var band = 1;
    while (band <= HAUL_BANDS.length && km > HAUL_BANDS[band - 1]) band++;
    var rest = nm.replace(/^ПЕРЕВОЗК\S*\s*/i, '').replace(m[0], ' ').toUpperCase().replace(/Ё/g, 'Е');
    var mat = '';
    for (var i = 0; i < HAUL_MAT.length && !mat; i++) if (HAUL_MAT[i][0].test(rest)) mat = HAUL_MAT[i][1];
    if (!mat) mat = rest.replace(/[^А-ЯA-Z0-9]+/g, ' ').trim();
    return { km: km, band: band, mat: mat };
  }
  /**
   * The earlier prices of «Перевозка» lines for one such line (`me` = haul(name, unit)): rows are price_memory records
   * with their name and unit, of other workspaces of the region. Corrected prices only, as rank() offers them (no
   * «Применить %», no 0, at most PRICE_MONTHS old); the same band only; the same material first, then the same
   * contragent, one the contractor took, the newest. One line per application and price. Each entry carries the line
   * it was set for (haul: { km, mat, name }).
   */
  function haulRank(rows, ctx, me) {
    ctx = ctx || {};
    if (!me) return [];
    var mine = ctx.contragent || '', today = ctx.today || new Date().toISOString().slice(0, 10);
    var out = [], seen = {};
    (rows || []).forEach(function (r) {
      if (!r || r.kind !== 'corrected' || r.source === 'pct' || !(r.final_price > 0)) return;
      var h = haul(r.name, r.unit);
      if (!h || h.band !== me.band) return;
      var age = months(dateOf(r), today);
      if (age == null || age > PRICE_MONTHS) return;
      out.push({ row: r, cls: mine && r.contragent === mine ? 1 : 2, accepted: !!r.accepted, age: age, price: r.final_price,
        same: h.mat === me.mat, haul: { km: h.km, mat: h.mat, name: String(r.name || '').replace(/\s+/g, ' ').trim() } });
    });
    out.sort(function (a, b) {
      return (b.same ? 1 : 0) - (a.same ? 1 : 0) || a.cls - b.cls || (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0) || a.age - b.age || a.price - b.price;
    });
    return out.filter(function (p) {
      var one = (p.row.workspace || p.row.id) + '|' + p.price;
      if (seen[one]) return false;
      seen[one] = 1;
      return true;
    });
  }

  S.memory = { rank: rank, verdict: verdict, hintVerdict: hintVerdict, ageFactor: ageFactor, dateOf: dateOf, haul: haul, haulRank: haulRank, HAUL_BANDS: HAUL_BANDS,
    PRICE_MONTHS: PRICE_MONTHS, CEIL_MONTHS: CEIL_MONTHS, UNMARKED: UNMARKED, NEED: NEED };
})(S);
