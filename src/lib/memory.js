/*
 * The memory of finished applications, put to use (docs/ai-reja.md, phase 2): what the rows of price_memory mean for
 * one resource of the application open now. Pure — no page, no server: the page gives the rows and reads the answer.
 *
 *   S.memory.rank(rows, ctx) → { prices: [entry…], ceiling: { price, apps, weight, rows } | null }
 *   S.memory.verdict(smetaPrice, ceiling) → 'accepted' | 'above' | ''
 *   rows: price_memory records of ONE resource (same match key and unit key), same region, other workspaces:
 *         { id, workspace, application, contragent, kind, source, smeta_price, final_price, finished, accepted, number, who }
 *   ctx:  { contragent, today: 'YYYY-MM-DD' }
 *
 * Two kinds of evidence, two meanings (the owner's rule):
 *
 *   A corrected price is the expert's market price — a suggestion. In this order:
 *     1  the same contragent, 2  another contragent; inside each, one the contractor took («Исправлено») first, then
 *     the newest. One line per application. A price «Применить %» set is not one (a blanket discount is not a price
 *     looked up), a price of 0 is a resource struck out — neither is ever offered. Older than PRICE_MONTHS: not shown.
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
  function near(a, b) { var d = Math.abs(a - b); return d < 1e-6 || d < Math.abs(a) * 1e-9; }

  function rank(rows, ctx) {
    ctx = ctx || {};
    var mine = ctx.contragent || '', today = ctx.today || new Date().toISOString().slice(0, 10);
    var prices = [], seen = {}, groups = {};
    (rows || []).forEach(function (r) {
      if (!r || !(r.final_price > 0)) return;                       // struck out, or nothing
      var age = months(r.finished, today);
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
    return { prices: prices, ceiling: ceiling };
  }

  /** How a smeta price stands to the ceiling: at or below it — accepted before; above — to be looked at. */
  function verdict(smeta, ceiling) {
    if (!ceiling || !(smeta > 0)) return '';
    return smeta <= ceiling.price || near(smeta, ceiling.price) ? 'accepted' : 'above';
  }

  S.memory = { rank: rank, verdict: verdict, ageFactor: ageFactor, PRICE_MONTHS: PRICE_MONTHS, CEIL_MONTHS: CEIL_MONTHS, UNMARKED: UNMARKED, NEED: NEED };
})(S);
