/*
 * UZEX weekly quotes as a price source of their own: one stored week, handed to the program's own suggester.
 * Pure (runs in node: test/uzex.cjs). The page part is src/ui/uzex.js, its worker src/uzex-worker.js, the server
 * part server/pb_hooks/uzex.pb.js.
 *
 * The quotes are matched to the smeta's resources by the same engine the reference packages use (S.refs: its family
 * parsers, its unit conversions, its tiers) — measured on a real smeta, plain name similarity finds a quote for one
 * resource in ninety, the engine for one in eleven. Nothing of src/lib/refs is changed for it: a week is written as
 * a package of the engine's own format (smeta-refs v1) that lives only in memory — it is never stored, never
 * uploaded, and never meets the package of the price documents, which has its own worker and its own cache.
 *
 *   S.uzex.packageOf(imp, quotes, o) → { pkg, used, left: { currency, forward, old, empty } }
 *       imp     the stored week (uzex_imports): import_id, period_from, period_to
 *       quotes  its rows (uzex_quotes)
 *       o.forward   also forward and futures contracts (off: spot quotes only)
 *       o.onlyWeek  only quotes dated the week itself: a week's table also carries the last quote of goods that
 *                   did not trade in it
 *       A quote that is not in sums (dollars, roubles, the unnamed currency of the export table) is never offered
 *       as a price in sums: it is left out here, whatever is asked.
 *       The exchange quotes its prices with VAT; the smeta is checked without it. The package therefore carries
 *       S.uzex.net(price, date) — the quote less the VAT of its date — while the stored quote stays as printed.
 *   S.uzex.vatRate(date) → the rate of VAT in Uzbekistan on that day (0.12 since 2023)
 *   S.uzex.net(price, date) → the price without VAT, to the tiyin
 *   S.uzex.sourceOf(importId, line) → corrections.source of a price applied from a line: «uzex:<week>:<row>», or
 *       «uzex:<week>:median:<row>,<row>…» for a line that is a median of several quotes
 *   S.uzex.parseSource(s) → { import_id, rows: [row…] } | null
 *   S.uzex.period(from, to) → «02.11–06.11.2026»
 */
(function (S) {
  'use strict';

  var FIELDS = ['rid', 'name', 'name_raw', 'unit', 'unit_raw', 'section', 'price', 'price_date', 'avail', 'avail_src',
    'region', 'src', 'group', 'basis', 'delivery', 'plant', 'code', 'flags', 'attrs'];
  var MAX_SOURCE = 190;

  function srcId(imp) { return 'uzex-w' + imp.import_id; }

  /* VAT in Uzbekistan: 12 % from 01.01.2023, 15 % from 01.10.2019, 20 % before. */
  function vatRate(date) {
    var d = String(date || '');
    return d && d < '2019-10-01' ? 0.20 : d && d < '2023-01-01' ? 0.15 : 0.12;
  }
  /* half a tiyin goes up: the division leaves …62,4999999 where the arithmetic says …62,5 */
  function net(price, date) { return Math.round(price / (1 + vatRate(date)) * 100 + 1e-6) / 100; }

  function packageOf(imp, quotes, o) {
    o = o || {};
    var out = { pkg: null, used: 0, left: { currency: 0, forward: 0, old: 0, empty: 0 } };
    var src = srcId(imp), rows = [], dmin = null, dmax = null, last = 0;
    (quotes || []).slice().sort(function (a, b) { return a.row_no - b.row_no; }).forEach(function (q) {
      if (q.currency !== 'UZS') { out.left.currency++; return; }
      if (q.is_forward && !o.forward) { out.left.forward++; return; }
      if (o.onlyWeek && (q.date_from !== imp.period_from || q.date_to !== imp.period_to)) { out.left.old++; return; }
      var item = q.item || q.name;
      var price = q.price > 0 ? net(q.price, q.date_to) : 0;
      if (!(price > 0) || !item || !q.unit || !q.date_to || !(q.row_no > last)) { out.left.empty++; return; }
      last = q.row_no;
      var row = [q.row_no, item, q.name && q.name !== item ? q.name : null, q.unit, q.unit, 'materials', price, q.date_to,
        null, null, 'national', src, 'exchange', q.is_forward ? 'exchange-forward' : 'exchange-spot'];
      if (q.is_forward) row.push(null, null, null, ['forward']);
      rows.push(row);
      if (!dmin || q.date_to < dmin) dmin = q.date_to;
      if (!dmax || q.date_to > dmax) dmax = q.date_to;
    });
    out.used = rows.length;
    if (!rows.length) return out;
    out.pkg = {
      format: 'smeta-refs', version: 1, full: true, package_id: 'uzex-' + imp.import_id,
      created: new Date().toISOString(), tool: 'src/lib/uzex.js',
      rid_min: rows[0][0], rid_max: rows[rows.length - 1][0], counts: { records: rows.length, sources: 1 },
      date_min: dmin, date_max: dmax,
      sources: [{ id: src, doc_type: 'exchange-quotes', issuer: 'UZEX', customer: null, doc_no: String(imp.import_id),
        issue_date: imp.period_to, as_of_date: null, region: 'national', ships_nationally: true, vat_default: true, method: 'weekly-quotes' }],
      fields: FIELDS, rows: rows
    };
    return out;
  }

  /** The rows of the week a suggestion line stands on: one quote, or the quotes of a median. */
  function rowsOf(line) {
    if (!line) return [];
    if (line.rid != null) return [line.rid];
    if (line.rids && line.rids.length) return line.rids.slice();
    var out = [];
    (line.components || []).forEach(function (c) { (c.rids || (c.rid != null ? [c.rid] : [])).forEach(function (r) { out.push(r); }); });
    return out;
  }

  function sourceOf(importId, line) {
    var rows = rowsOf(line);
    if (rows.length <= 1) return 'uzex:' + importId + ':' + (rows.length ? rows[0] : 0);
    var head = 'uzex:' + importId + ':median:', s = head + rows.join(',');
    while (s.length > MAX_SOURCE && rows.length > 1) { rows.pop(); s = head + rows.join(',') + '…'; }
    return s;
  }

  function parseSource(s) {
    var m = /^uzex:(\d{1,9}):(?:(\d{1,6})|median:(\d{1,6}(?:,\d{1,6})*)…?)$/.exec(String(s || ''));
    if (!m) return null;
    return { import_id: +m[1], rows: (m[2] || m[3]).split(',').map(Number) };
  }

  /** «2026-11-02», «2026-11-06» → «02.11–06.11.2026» (both years written when they differ). */
  function period(from, to) {
    function d(s, year) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + (year ? '.' + s.slice(0, 4) : '') : ''; }
    if (!from || !to) return d(from || to, true);
    return d(from, from.slice(0, 4) !== to.slice(0, 4)) + '–' + d(to, true);
  }

  S.uzex = { vatRate: vatRate, net: net, packageOf: packageOf, rowsOf: rowsOf, sourceOf: sourceOf, parseSource: parseSource, period: period, srcId: srcId };
})(S);
