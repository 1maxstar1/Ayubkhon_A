/*
 * A synthetic world for the learning tests (docs/ai-reja.md, phase 3): an invented reference package, and a simulated
 * expert with a planted preference who «finishes» applications on it. Everything is drawn from a seeded generator —
 * no name, document, price or date here comes from anywhere real, and no price is written as a number in this file.
 *
 *   const W = require('./ml-synth.cjs');
 *   const w = W.world(S, { seed, items, apps, perApp, noise });
 *   w.pkg                the package (format smeta-refs v1): `items` invented goods, each priced by several invented
 *                        suppliers of different regions, dates and price bases
 *   w.sug                the suggester over it (policy p3 — what the program shows today)
 *   w.rows               price_memory rows of `apps` finished applications: what the simulated expert did
 *   w.truth              how many of each kind he produced, and the preference he was given
 *
 * The expert's planted preference, for a resource whose reference lines he looks at: a line of his own region first,
 * then the newest price, and a «declared» price only when there is nothing else (PREFER). With probability `noise`
 * he takes another line at random. A line folded inside a summary («медиана N строк») cannot be applied on screen —
 * he types its price instead, as a person would; now and then he takes the summary itself. Besides taking a line he sometimes types a price near one, types one no line has,
 * leaves the smeta price (below every line, or above some), applies a blanket percent, or strikes the resource out.
 */
'use strict';

const REGION = 'xorazm', OTHER = 'toshkent_sh';
const BASES = ['offer', 'list', 'declared'];
const UNITS = ['шт', 'м', 'кг', 'м2'];
const WORDS = ['Изделие', 'Деталь', 'Элемент', 'Комплект', 'Заготовка', 'Профиль'];
const PREFER = { same_region: 3, newer: 2, declared: -4 };

function iso(day) { return new Date(Date.UTC(2025, 0, 1) + day * 86400000).toISOString().slice(0, 10); }

function world(S, opts) {
  const o = Object.assign({ seed: 7, items: 60, apps: 12, perApp: 30, noise: 0.05 }, opts || {});
  const rand = S.ml.metrics.rng(o.seed);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const R = S.refs;

  /* ---- the package: 9 suppliers (own region, another, national) × three kinds of price */
  const sources = [];
  for (let i = 0; i < 9; i++) {
    sources.push({ id: 'synth-src-' + String(i + 1).padStart(4, '0'), doc_type: 'supplier-offer', issuer: 'ООО «Синтез-' + (i + 1) + '»',
      customer: null, doc_no: 'СИН-' + (i + 1), issue_date: null, as_of_date: null, region: i % 3 === 0 ? REGION : i % 3 === 1 ? OTHER : 'national',
      ships_nationally: i % 3 === 2, vat_default: false, method: 'synthetic', basis: BASES[Math.floor(i / 3)] });
  }
  const records = [];
  let rid = 0;
  const items = [];
  for (let i = 0; i < o.items; i++) {
    const item = { name: pick(WORDS) + ' синтетическое ' + String.fromCharCode(1040 + (i % 20)) + '-' + (100 + i), unit: pick(UNITS),
      base: Math.round((50 + rand() * 950) * 100) / 100 * (rand() < 0.5 ? 1 : 100) };
    items.push(item);
    const n = 1 + Math.floor(rand() * 5);                                  // 1…5 suppliers price it
    const who = sources.slice().sort(() => rand() - 0.5).slice(0, n);
    for (const s of who) {
      const day = Math.floor(rand() * 420);                                // 2025-01-01 … early 2026
      const price = Math.round(item.base * (0.75 + rand() * 0.6) * 100) / 100;
      records.push({ rid: ++rid, name: item.name, unit: item.unit, unit_raw: item.unit, section: 'materials', price, price_date: iso(day),
        region: s.region, src: s.id, group: 'synthetic', basis: s.basis });
    }
  }
  const FIELDS = R.pkg.FIELDS;
  const dates = records.map((r) => r.price_date).sort();
  const pkg = { format: 'smeta-refs', version: 1, full: true, package_id: 'synth-' + o.seed, created: '2026-01-01T00:00:00Z', tool: 'test/ml-synth.cjs',
    rid_min: 1, rid_max: rid, counts: { records: records.length, sources: sources.length }, date_min: dates[0], date_max: dates[dates.length - 1],
    sources: sources.map((s) => { const c = Object.assign({}, s); delete c.basis; return c; }), fields: FIELDS.slice(),
    rows: records.map((r) => { const row = FIELDS.map((f) => (r[f] === undefined ? null : r[f])); while (row.length && row[row.length - 1] === null) row.pop(); return row; }) };
  const sug = R.create({ policy: 'p3' });
  sug.init({ handle: R.open(R.derive(pkg)), sources: pkg.sources });

  /* ---- the expert */
  const utility = (l, q) => PREFER.same_region * (l.rec.region === q.region ? 1 : 0) +
    PREFER.newer * (1 - Math.min(1, (Date.parse(q.asof) - Date.parse(l.rec.price_date)) / 86400000 / 420)) +
    PREFER.declared * (l.rec.basis === 'declared' ? 1 : 0);
  const sourceOf = (l) => {
    const rids = Array.from(new Set(l.recs.map((r) => r.rid)));
    return rids.length === 1 ? 'ref:' + pkg.package_id + ':' + rids[0] : 'ref:' + pkg.package_id + ':median:' + rids.join(',');
  };
  const rows = [], truth = { prefer: PREFER, took: 0, random: 0, folded: 0, summary: 0, typed_near: 0, typed_far: 0, left_above: 0, left_lower: 0, pct: 0, zeroed: 0, empty: 0 };
  for (let a = 0; a < o.apps; a++) {
    const finished = iso(430 + a * 9), asof = finished, ws = 'ws' + String(a + 1).padStart(13, '0');
    const mine = items.slice().sort(() => rand() - 0.5).slice(0, o.perApp);
    mine.forEach((it, n) => {
      const row = { workspace: ws, application: 'ap' + a, contragent: 'ct' + (a % 4), region: REGION, name: it.name, unit: it.unit, section: 'materials',
        match_key: S.matchKey(it.name), match_unit_key: S.matchUnitKey(it.unit), res_key: 'k' + n, asof, finished, accepted: false,
        kind: 'corrected', source: 'typed', smeta_price: 0, final_price: 0 };
      const q = R.queryOf({ name: it.name, unit: it.unit, section: 'materials' }, { region: REGION, asof });
      const lines = sug.gather(q).lines;
      const shown = lines.length ? sug.choose(lines, q) : [];
      const lo = lines.length ? Math.min(...lines.map((l) => l.price)) : it.base, hi = lines.length ? Math.max(...lines.map((l) => l.price)) : it.base;
      const u = rand();
      if (!lines.length) { truth.empty++; row.smeta_price = it.base; row.final_price = it.base * 0.9; }
      else if (u < 0.55) {                                                 // takes the line he prefers
        let best = lines.slice().sort((x, y) => utility(y, q) - utility(x, q) || x.rec.rid - y.rec.rid)[0];
        if (rand() < o.noise && lines.length > 1) { best = pick(lines.filter((l) => l !== best)); truth.random++; } else truth.took++;
        // as on screen: a line folded inside «медиана N строк» has no «Применить» — he types its price
        const folded = shown[0].isMedian && shown[0].medianLines.indexOf(best) >= 0;
        if (folded) truth.folded++;
        row.source = folded ? 'typed' : sourceOf(best); row.final_price = best.price; row.smeta_price = hi * 1.3;
        row.accepted = rand() < 0.3;
      } else if (u < 0.6 && shown[0].isMedian) {                           // takes the summary as it is
        row.source = sourceOf(shown[0]); row.final_price = shown[0].price; row.smeta_price = hi * 1.3; truth.summary++;
      } else if (u < 0.65) { const l = pick(lines); row.final_price = l.price * (1 + (rand() - 0.5) * 0.02); row.smeta_price = hi * 1.3; truth.typed_near++; }
      else if (u < 0.75) { row.final_price = lo * 0.6; row.smeta_price = hi * 1.3; truth.typed_far++; }
      else if (u < 0.85) { row.kind = rand() < 0.5 ? 'checked' : 'untouched'; row.source = ''; row.smeta_price = lo * 0.9; row.final_price = row.smeta_price; truth.left_above++; }
      else if (u < 0.92) { row.kind = rand() < 0.5 ? 'checked' : 'untouched'; row.source = ''; row.smeta_price = hi * 1.2; row.final_price = row.smeta_price; truth.left_lower++; }
      else if (u < 0.96) { row.source = 'pct'; row.smeta_price = hi; row.final_price = hi * 0.9; truth.pct++; }
      else { row.kind = 'zeroed'; row.source = ''; row.smeta_price = hi; row.final_price = 0; truth.zeroed++; }
      rows.push(row);
    });
  }
  return { pkg, sug, rows, truth, region: REGION, items };
}

module.exports = { world, PREFER, REGION };
