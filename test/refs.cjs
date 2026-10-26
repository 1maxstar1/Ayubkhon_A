/*
 * Reference prices (src/lib/refs/): units, family parsers, the package format, the engine, the cache, the Russian
 * view and the query. Synthetic data only (test/refs-fixture.cjs); no real record, price or document.
 *
 *   node test/refs.cjs
 *
 * The measurement of these tables against the real data is test/refs-parity.cjs (needs the private kit).
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, ROOT } = require('./load.cjs');

let fail = 0, n = 0;
function ok(cond, what) {
  n++;
  if (cond) console.log('ok   ' + what);
  else { fail++; console.log('FAIL ' + what); }
}
function near(a, b, eps) { return a != null && b != null && Math.abs(a - b) <= (eps || 1e-9) * Math.max(1, Math.abs(b)); }
function section(t) { console.log('\n# ' + t); }

const S = load(load.CORE, 'regions', load.REFS);
const F = require('./refs-fixture.cjs');
const R = S.refs;
const U = R.units;

/* ------------------------------------------------------------------ units */
section('units');
ok(U.factor('т', 'кг') === 0.001, 'т → кг ×0.001');
ok(U.factor('км', 'м') === 0.001, 'км → м ×0.001');
ok(U.factor('1000шт', 'шт') === 0.001, '1000шт → шт ×0.001');
ok(near(U.factor('10м2', 'м2'), 0.1), '10м2 → м2 ×0.1');
ok(near(U.factor('6м', 'м'), 1 / 6), '6м → м ×1/6');
ok(U.factor('м', 'м') === 1, 'same unit ×1');
ok(U.factor('т', 'м') === null, 'т → м without item data: not convertible');
ok(near(U.factor('т', 'м', { kg_per_m: 5 }), 0.005), 'т → м with 5 kg/m: ×0.005');
ok(U.factor('абв', 'м') === null, 'unknown unit: null');
ok(U.norm('тн') === 'т' && U.norm('маш.час') === 'маш-ч' && U.norm('чел.-ч') === 'чел-ч' && U.norm('т.км') === 'т-км', 'norm: spellings of т, маш-ч, чел-ч, т-км');
ok(U.norm('100 м') === '100м', 'norm keeps a multiplier: 100 м → 100м (never merged with м)');

/* ------------------------------------------------------------------ families */
section('families');
const fp = (name, unit, sec) => R.famParse(R.families, name, unit, sec || 'materials');
ok(R.families.map((f) => f.id).join(',') === 'machines,cable,steel,mineral,electro', 'five families, most specific first');
const c1 = fp('Кабель ВВГ 3х2,5', 'м'), c2 = fp('КАБЕЛЬ ВВГ 3Х2.5', 'м'), c3 = fp('Кабель силовой ВВГ 3*2,5 мм2', 'м');
ok(c1 && c2 && c3 && c1.key === c2.key && c2.key === c3.key, 'cable: spelling variants share one key');
const p1 = fp('Труба стальная электросварная 57х3,5', 'т'), p2 = fp('Труба электросварная 57*3.5 мм', 'т');
ok(p1 && p2 && p1.key === p2.key && p1.family === 'steel', 'pipe: spelling variants share one key');
const m8 = fp('Анкер М8', 'шт'), m5 = fp('Анкер М5', 'шт');
ok(m8 && m5 && m8.key !== m5.key, 'АНКЕР М5 ≠ АНКЕР М8 (digits are never lost)');
ok(!!R.familyMod('steel').conflict(m8, m5), 'М5 and М8 conflict: never matched, even relaxed');
const z1 = fp('Знак дорожный 4.1.1', 'шт'), z2 = fp('Знак дорожный 4.11', 'шт');
ok(z1 && z2 && z1.key !== z2.key, 'знак 4.1.1 ≠ 4.11 (a separator between digits is kept)');
const lsz = fp('Кабель ВВГнг(А)-LS 3х2,5-0,66', 'м');
const lvl = lsz && lsz.levels.filter((l) => c1.levels.some((m) => m.key === l.key))[0];
ok(lvl && lvl.drop.length > 0, 'a relaxed level reaches the plain mark and names what it dropped');
ok(!!R.familyMod('cable').conflict(c1, fp('Кабель АВВГ 3х2,5', 'м')), 'copper and aluminium cables conflict');
ok(!!R.familyMod('cable').conflict(c1, fp('Кабель ВВГ 3х4', 'м')), 'another section conflicts');
const bt = fp('Бетон тяжелый, класс В15', 'м3');
ok(bt && bt.family === 'mineral' && bt.key === fp('Бетон тяжёлый В15', 'м3').key, 'concrete: ё/е and «, класс» do not change the key');
ok(fp('Экскаватор одноковшовый 0,65 м3', 'маш-ч', 'machines').family === 'machines', 'a machine-hour name goes to machines');
// overlap resolution: by order, and by the head word printed first
const st = {};
const wire = R.famParse(R.families, 'Проволока АМ 4 мм', 'кг', 'materials', null, st);
ok(wire && wire.id === 'cable' && wire.also && wire.also[0] === 'steel' && st.overlaps === 1, 'cable + steel overlap goes to the narrower family (cable), counted');
const heads = [{ id: 'mineral', attrs: { head: 'КАМЕРА' }, _rank: 3 }, { id: 'electro', attrs: { head: 'ТЕЛЕФОН' }, _rank: 4 }];
const ph = R.resolve('КАМЕРА ТЕЛЕФОН', heads), ph2 = R.resolve('ТЕЛЕФОН КАМЕРА', heads);
ok(ph.pick.id === 'mineral' && ph2.pick.id === 'electro' && ph2.rule === 'head-first', 'two head words: the one printed first wins');

/* ------------------------------------------------------------------ stamp */
section('stamp');
ok(R.KEYS === 'dev', 'without a build stamp S.refs.KEYS is «dev»');
{
  const files = ['src/lib/normalize.js', 'src/lib/match.js', 'src/lib/util.js', 'src/lib/refs/units.js',
    'src/lib/refs/families/machines.js', 'src/lib/refs/families/cable.js', 'src/lib/refs/families/steel.js',
    'src/lib/refs/families/mineral.js', 'src/lib/refs/families/electro.js', 'src/lib/refs/index.js'];
  const src = "self.REFS_KEYS = 'x';\n" + files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const ctx = vm.createContext({ Intl, Map, Set, Math, JSON, Date, RegExp, String, Number, Array, Object, Error });
  ctx.self = ctx;
  vm.runInContext(src, ctx);
  ok(ctx.S.refs.KEYS === 'x', 'a worker source that starts with self.REFS_KEYS gives S.refs.KEYS');
  ok(ctx.Units === undefined && ctx.CableFamily === undefined && ctx.S.refs.families.length === 5,
    'index.js collects the parsers and removes their globals');
}

/* ------------------------------------------------------------------ package */
section('package');
{
  const A = load('util', 'refs-package');
  ok(A.refs && A.refs.pkg && A.refs.pkg.FLAGS_READ.length === 5 && A.refs.pkg.ATTRS_READ.indexOf('km') >= 0 && !A.refs.derive,
    'package.js loads alone (as on the admin page) and carries the read-lists');
}
const P = R.pkg;
const fixture = F.makePackage();
const v0 = P.validate(fixture, { bytes: 1000 });
ok(v0.ok && v0.rows === F.RECORDS.length && v0.sources === F.SOURCES.length, 'the fixture package validates (' + v0.rows + ' rows, ' + v0.sources + ' documents)');
function corrupt(label, field, mutate, opts) {
  const p = JSON.parse(JSON.stringify(fixture));
  mutate(p);
  const r = P.validate(p, opts || {});
  const hit = r.errors.filter((e) => e.field === field || e.field.indexOf(field + '.') === 0 || e.field.indexOf(field + '[') === 0);
  ok(!r.ok && hit.length > 0 && hit.every((e) => typeof e.msg === 'string' && e.msg.length > 0), 'refused: ' + label + ' (field ' + field + ')');
  return r;
}
const row = (p, rid) => p.rows.filter((r) => r[0] === rid)[0];
corrupt('another format', 'format', (p) => { p.format = 'other'; });
const vr = corrupt('version 2', 'version', (p) => { p.version = 2; });
ok(/Версия пакета 2 не поддерживается/.test(vr.errors[0].msg), 'version 2 says the program must be updated');
corrupt('a delta package', 'full', (p) => { p.full = false; });
corrupt('rids not increasing', 'rid', (p) => { p.rows[3][0] = 2; });
corrupt('price ≤ 0', 'price', (p) => { row(p, 4)[6] = 0; });
corrupt('price NaN', 'price', (p) => { row(p, 4)[6] = NaN; });
corrupt('a bad date', 'price_date', (p) => { row(p, 4)[7] = '2025-02-30'; });
corrupt('avail before price_date', 'avail', (p) => { row(p, 13)[8] = '2025-09-01'; });
corrupt('an unknown section', 'section', (p) => { row(p, 4)[5] = 'stuff'; });
corrupt('an unknown document', 'src', (p) => { row(p, 4)[11] = 'fake-src-9999'; });
corrupt('an attribute the engine does not read', 'attrs', (p) => { row(p, 15)[18] = { km: 10, colour: 'x' }; });
corrupt('a flag the engine does not read', 'flags', (p) => { row(p, 9)[17] = ['vat_inferred', 'something'];  });
corrupt('an unknown region', 'region', (p) => { row(p, 4)[10] = 'atlantis'; });
corrupt('an empty name', 'name', (p) => { row(p, 4)[1] = '  '; });
corrupt('counts that do not match', 'counts.records', (p) => { p.counts.records = 99; });
corrupt('too many rows', 'rows', (p) => { p.rows = new Array(P.LIMITS.rows + 1); p.counts.records = p.rows.length; });
corrupt('over 500 MB unpacked', 'size', () => {}, { bytes: P.LIMITS.bytes + 1 });
ok(P.checkDecoded(0, 1000) && P.checkDecoded(10, 1000) && P.checkDecoded(1000, 1000) === null && P.checkDecoded(400, 1000) === null,
  'a decoded text of length 0 or below bytes/3 is refused');
{
  const lens = [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 1000, 4097];
  let good = 0;
  for (const n of lens) {
    const b = crypto.randomBytes(n);
    if (P.sha256(new Uint8Array(b)) === crypto.createHash('sha256').update(b).digest('hex')) good++;
  }
  ok(good === lens.length, 'sha256 equals node crypto on ' + lens.length + ' boundary lengths');
  const gz = F.gzip(fixture);
  const s = P.sha256Stream();
  for (let i = 0; i < gz.length; i += 77) s.update(new Uint8Array(gz.subarray(i, i + 77)));
  ok(s.hex() === crypto.createHash('sha256').update(gz).digest('hex') && P.sha256(new Uint8Array(gz)) === s.hex(),
    'sha256 of the fixture .json.gz, whole and in slices, equals node crypto');
  const m = P.manifest(fixture);
  ok(!m.rows && m.sources.length === F.SOURCES.length && m.package_id === fixture.package_id, 'the manifest is the head without rows');
}
const asyncChecks = new Promise((resolve) => {
  let progress = 0;
  P.validateAsync(fixture, { slice: 5, progress: () => { progress++; } }, (r) => {
    ok(r.ok && progress === Math.ceil(F.RECORDS.length / 5), 'validateAsync checks in slices with progress (' + progress + ' slices)');
    resolve();
  });
});

/* ------------------------------------------------------------------ derive, cache */
section('derive and cache');
const recs = R.derive(fixture);
const byRid = (rid) => recs.filter((r) => r.rid === rid)[0];
ok(recs.length === F.RECORDS.length, 'one derived record per row');
ok(recs.every((r) => r.mp === S.matchPair(r.name, F.RECORDS.filter((x) => x.rid === r.rid)[0].unit)), 'mp = S.matchPair(name, unit)');
ok(byRid(2).fam && byRid(2).fam === byRid(3).fam, 'records with one name, unit and section share one family parse object');
ok(byRid(13).avail === '2025-11-15' && byRid(4).avail === byRid(4).price_date && byRid(4).avail_src === 'fake-src-0002',
  'availability: the package date, else price_date; the edition, else src');
ok(byRid(5).ua && byRid(5).ua.kg_per_m > 0, 'a steel pipe gets its mass per metre from the parser');
{
  const heading = F.makePackage();
  heading.rows = [[1, 'Кабели силовые: Кабель ВВГ 3х4', 'Кабель ВВГ 3х4', 'м', 'м', 'materials', F.PRICES.c, '2025-11-20', null, null,
    'toshkent_sh', 'fake-src-0002', 'catalogue', 'catalogue']];
  const hr = R.derive(heading)[0];
  ok(hr.fz === 'Кабель ВВГ 3х4' && hr.name_raw === 'Кабель ВВГ 3х4', 'a catalogue block heading is left out of the fuzzy text');
}
{
  const enc = R.encodeCache(recs);
  const back = R.decodeCache(enc);
  ok(JSON.stringify(back) === JSON.stringify(recs), 'decodeCache(encodeCache(recs)) deep-equals recs');
  ok(back.filter((r) => r.rid === 2)[0].fam === back.filter((r) => r.rid === 3)[0].fam, 'a shared parse stays shared after the cache');
  ok(enc.rid instanceof Int32Array && enc.price instanceof Float64Array && enc.fams.length < recs.length, 'the cache form uses typed arrays and value tables');
}

/* ------------------------------------------------------------------ suggest */
section('suggest');
function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }
const frozen = deepFreeze(R.derive(fixture));
const handle = R.open(frozen);
const sugOf = (policy) => { const s = R.create({ policy }); s.init({ handle, sources: fixture.sources }); return s; };
const sp3 = sugOf('p3'), sp1 = sugOf('p1');
const Q = (name, unit, section, asof) => ({ id: 'q', name, unit, section, region: 'xorazm', asof: asof || '2026-06-30', exclude_src: [] });
const ridsOf = (l) => (l.rids || [l.rid]);
const all = [];
function sug(s, q) { const L = s.suggest(q); all.push({ q, L }); return L; }

const lab = sug(sp3, Q('Затраты труда рабочих-строителей', 'чел-ч', 'labor', '2026-01-10'));
ok(lab.length && lab[0].tier === 'exact' && lab[0].rid === 13 && lab[0].published === '2025-11-15',
  'labour: the newest quarter PUBLISHED by the as-of date (a quarter dated before it but published after it is absent)');
ok(lab.every((l) => l.rid !== 14), 'a record whose availability date is after as-of never appears, although its price_date is before');
const lab2 = sug(sp3, Q('Затраты труда рабочих-строителей', 'чел-ч', 'labor'));
ok(lab2[0].rid === 14 && lab2[1].rid === 13 && lab2[1].flags.indexOf('older-quarter') >= 0, 'later: the new quarter first, the older one flagged');
ok(sug(sp3, Q('Затраты труда машинистов', 'чел-ч', 'labor')).length === 0, 'machinists have no wage-table rate: no line');

const cab = sug(sp3, Q('Кабель ВВГ 3х2,5', 'м', 'materials'));
ok(cab.length === 1 && cab[0].summary && cab[0].rids.join(',') === '2,3' && near(cab[0].price, (F.PRICES.a + F.PRICES.g) / 2),
  'cable: the newest edition per source family (the older edition of the same issuer is gone), the median of two agreeing documents');
ok(cab[0].components.length === 2 && cab[0].components.every((c) => c.name && c.rids.length), 'the median line carries its components, each with its own name and records');
const cabOld = sug(sp3, Q('Кабель ВВГ 3х2,5', 'м', 'materials', '2026-01-31'));
ok(cabOld[0].rids.indexOf(1) >= 0 && cabOld[0].rids.indexOf(2) < 0, 'an as-of date before the newest edition gives the older edition');
ok(cabOld[0].components.filter((c) => c.rids[0] === 1)[0].price === F.PRICES.b, 'the older edition per km is converted to the query unit (÷1000)');

const pipe = sug(sp3, Q('Труба стальная электросварная 57х3,5', 'т', 'materials'));
ok(pipe.length === 1 && near(pipe[0].price, (F.PRICES.d + F.PRICES.f) / 2) && pipe[0].spread < 1.5, 'pipe: two documents within ×1.5 give their median');
ok(!pipe.slice(1).some((l) => ridsOf(l).some((r) => r === 5 || r === 6)), 'components are not repeated below the median');
const pipeM = sug(sp3, Q('Труба стальная электросварная 57х3,5', 'м', 'materials'));
ok(pipeM[0].tier === 'estimate' && pipeM[0].raw.factor !== 1, 'per metre from per tonne needs item data: tier «estimate», with the factor');

const conc = sug(sp3, Q('Бетон тяжёлый В15', 'м3', 'materials'));
ok(conc[0].flags.indexOf('wide-spread') >= 0 && conc[0].rid === 9 && conc[0].range && conc[0].range.n === 3 &&
  conc[0].range.min === F.PRICES.c && conc[0].range.max === F.PRICES.h, 'documents that disagree by more than ×1.5: the p1 line, flagged, with the range');
ok(sug(sp1, Q('Бетон тяжёлый В15', 'м3', 'materials'))[0].rid === 9, 'p1: same region first, then the newest');

const anchor = sug(sp3, Q('Анкер М8', 'шт', 'materials'));
ok(anchor.length === 1 && anchor[0].rid === 10 && !anchor.some((l) => ridsOf(l).indexOf(11) >= 0), 'Анкер М8 never gets the М5 line');
const relaxed = sug(sp3, Q('Кабель ВВГнг(А)-LS 3х2,5', 'м', 'materials'));
ok(relaxed.length && relaxed[0].tier === 'similar' && relaxed[0].how === 'family-relaxed' && relaxed[0].drop.length > 0,
  'a relaxed family match is «similar» and says what it dropped');
const mach = sug(sp3, Q('Экскаватор 0,65 м3', 'маш-ч', 'machines'));
ok(mach.length === 1 && mach[0].rid === 12 && mach[0].tier === 'document', 'machines: the national machine-hour list');
const tk = sug(sp3, Q('Перевозка грузов 20 т 15 км', 'т-км', 'transport'));
ok(tk.length === 1 && tk[0].rid === 16 && tk[0].tier === 'document', 'transport: the band at or above the distance (20 km for 15 km)');
const tk40 = sug(sp3, Q('Перевозка грузов 40 т 15 км', 'т-км', 'transport'));
ok(tk40.length === 1 && tk40[0].tier === 'similar' && tk40[0].drop.length === 1, 'transport: another capacity is «similar» and named');
ok(sug(sp3, Q('Совсем другой ресурс', 'шт', 'materials')).length === 0, 'an unknown resource gets no line');
ok(all.every((x) => x.L.length <= 6), 'never more than 6 lines');
ok(JSON.stringify(sugOf('p3').suggest(Q('Бетон тяжёлый В15', 'м3', 'materials'))) === JSON.stringify(conc), 'deterministic: two runs are equal');
ok(all.every((x) => x.L.every((l) => typeof l.label === 'string' && l.label.indexOf('undefined') < 0)), 'every line has a Russian label');
ok(lab2[0].label.indexOf('Ставка по таблице') === 0, 'the wage-table tier reads «Ставка по таблице»');

/* ------------------------------------------------------------------ view */
section('view');
const ctx = { sources: new Map(fixture.sources.map((x) => [x.id, x])), asof: '2026-06-30', smetaPrice: F.PRICES.typed, unit: 'м' };
const REGION_KEYS = P.REGIONS;
let views = 0;
const leaks = [];
function strings(v) {
  const out = [];
  (function walk(x) { if (typeof x === 'string') out.push(x); else if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k]); })(v);
  return out;
}
for (const x of all) {
  for (const l of x.L) {
    const v = R.view(l, ctx);
    views++;
    if (!v.name) leaks.push('no name');
    for (const s of strings(v)) {
      if (s.indexOf('|') >= 0) leaks.push('family key');
      if (/\b[0-9a-f]{12}\b/.test(s)) leaks.push('hex id');
      if (/fake-src-/.test(s)) leaks.push('source id');
      for (const k of REGION_KEYS) if (new RegExp('(^|[^a-z_])' + k + '([^a-z_]|$)').test(s)) leaks.push('region key');
    }
    if (l.summary && !(v.components.length && v.components.every((c) => c.name && c.source))) leaks.push('component without name');
  }
}
ok(views > 15 && !leaks.length, 'every line of ' + views + ' shows the record name and never a family key, a hex id, a source id or a region key' + (leaks.length ? ': ' + leaks.join(', ') : ''));
const vLab = R.view(lab2[0], ctx);
ok(vLab.badge === 'Ставка по таблице' && /таблица ставок · Хорезмская область · 2026, 1 кв\. · опубл\. 15\.01\.2026/.test(vLab.evidence[0]),
  'the wage line: «Ставка по таблице», table, region label, quarter, publication date');
const vRel = R.view(relaxed[0], ctx);
ok(/близкие характеристики; (без|отличается): /.test(vRel.evidence[0]) && vRel.badge === 'Похожий', 'a relaxed line says what was dropped or changed');
const vConc = R.view(conc[0], ctx);
ok(vConc.evidence.some((e) => /документы расходятся: 3 строки, 98 765,43 – 248 228,91/.test(e)), 'a wide spread names the range');
ok(vConc.source.indexOf('ООО «Тест-Поставщик-6» № ТЕСТ-6') === 0 && /цена на 01\.12\.2025/.test(vConc.source), 'the source: issuer, document number, dates');
ok(/^к сметной цене: \+/.test(vConc.vsSmeta), 'the difference to the smeta price of this line');
const vCabOld = R.view(cabOld[0], ctx);
ok(vCabOld.summary === 'Медиана: 2 документа (разброс ×1,12)' && vCabOld.conv === '' && !vCabOld.flags.some((f) => /медиана/.test(f)),
  'a median line: «Медиана: N документа», no single conversion, no second «медиана» flag');
{
  // two lines of one document are one document (review: «Медиана 4 документов» built from 2)
  const one = Object.assign({}, cabOld[0], { components: cabOld[0].components.map((c) => Object.assign({}, c, { src: cabOld[0].components[0].src })) });
  ok(R.view(one, ctx).summary === 'Медиана: 2 строки из 1 документа (разброс ×1,12)', 'lines of one document count once: «Медиана: 2 строки из 1 документа»');
}
{
  // a smeta unit that carries its own multiplier: «за 100 м», never «за 1 100 м» (which reads as 1 100 metres)
  const line = (raw, unit) => R.view({ price: 1250, tier: 'document', name: 'x', how: 'exact-key', flags: [], raw }, Object.assign({}, ctx, { unit }));
  ok(line({ price: 12.5, unit: 'м', factor: 100 }, '100 м').conv === '13 за 1 м → 1 250 за 100 м', 'conversion to «100 м»: «за 100 м»');
  ok(line({ price: 1250, unit: '1000шт', factor: 0.001 }, 'шт').conv === '1 250 за 1000 шт → 1 250 за 1 шт', 'and from «1000шт»: «за 1000 шт»');
}
{
  // the parsers' tokens shown as the names spell them (review: «НУUNDАI», «ПЕСКОСТРУЙН», «страна RU»)
  const v = R.view({ price: 1, tier: 'similar', name: 'Самосвал QWERTAX QX-270, дизельный', how: 'family-relaxed', flags: [],
    drop: ['марка (QWЕRТАХ)', 'модель (QХ270)', 'исполнение (ДИЗЕЛ)', 'признаки кроме «ПЕСКОСТРУЙН» (ОБОРУДОВАН)', 'модель (УGW600)', 'страна CN/RU'] },
    Object.assign({}, ctx, { queryName: 'ПЕСКОСТРУЙНОЕ ОБОРУДОВАНИЕ ТЕСТ' }));
  const e = v.evidence[0];
  ok(/марка \(QWERTAX\)/.test(e) && /модель \(QX-270\)/.test(e), 'a mixed-script brand and model read as the record spells them: ' + e);
  ok(/исполнение \(дизельный\)/.test(e) && /кроме «ПЕСКОСТРУЙНОЕ» \(ОБОРУДОВАНИЕ\)/.test(e), 'a word stem reads as the whole word of the name');
  ok(/модель \(YGW600\)/.test(e), 'a token no name holds is put in one script (a Latin-only letter makes it Latin)');
  ok(/страна Китай, Россия/.test(e) && !/[A-Za-z][А-Яа-яЁё]|[А-Яа-яЁё][A-Za-z]/.test(e), 'country codes are named; no word mixes the scripts');
}
{
  // the extractor's notes never reach the expert (review: English notes in the issuer and in brackets after a document number)
  const V = R.viewParts;
  ok(V.issuerText({ issuer: 'not given on this sheet (the row cites «Тест-Документ»)' }) === '', 'an issuer that is a note with a Russian quote in brackets names nobody');
  ok(V.issuerText({ issuer: 'price catalogue of a region (screenshot of block «1. ТЕСТ»)' }) === '', 'so does «price catalogue of a region (…)»');
  ok(V.issuerText({ issuer: 'ООО «Тест-Альфа» (dealer of ООО «Тест-Бета»)' }) === 'ООО «Тест-Альфа»', 'a note in brackets after a name goes');
  ok(V.issuerText({ issuer: '«TEST QURILISH» MCHJ — per the cover letter on p.3' }) === '«TEST QURILISH» MCHJ', 'and a trailing English note');
  ok(V.docNoText({ doc_no: 'ТЕСТ-1/2026 (prices); ТЕСТ-2/2026 (other costs 1 %)' }) === 'ТЕСТ-1/2026; ТЕСТ-2/2026', 'English notes in brackets leave a number');
  ok(V.docNoText({ doc_no: 'calc «Тест расчёт»; temp. calc тест; с/ф №1 (01.01.2026)' }) === 'с/ф №1 (01.01.2026)', 'parts that are notes («calc …», «temp. …») leave it');
  const long = 'Тестовое государственное унитарное предприятие по проверке длинных названий организаций Тестовой области';
  const t = V.issuerText({ issuer: long });
  ok(t.length <= 81 && /…$/.test(t) && long.indexOf(t.slice(0, -1)) === 0 && long.charAt(t.length - 1) === ' ', 'a long issuer is cut at a word, with «…»: ' + t);
}
const vPipe = R.view(sug(sp1, Q('Труба стальная электросварная 57х3,5', 'м', 'materials'))[0], ctx);
ok(/за 1 т → .* за 1 м \(по данным изделия\)/.test(vPipe.conv), 'a converted line shows raw → normalised «по данным изделия»');
ok(R.view({ price: 1, tier: 'document', name: 'x', src: 'fake-src-9999', region: 'nowhere', how: 'exact-key', flags: [] }, ctx).source.indexOf('fake-src') < 0,
  'an unknown source shows its document type or «документ», never its id');
{
  const noted = new Map([['fake-src-0004', Object.assign({}, fixture.sources[3], { issuer: 'unknown (no header)' })]]);
  const v = R.view(lab2[0], Object.assign({}, ctx, { sources: noted }));
  ok(/^таблица ставок( № \S+)? · /.test(v.source) && v.source.indexOf('unknown') < 0, 'an issuer that is only the extractor\'s note («unknown …») shows the document type');
}

/* ------------------------------------------------------------------ query */
section('query');
const res = (name, unit, sec) => ({ name, unit, section: sec, mk: S.matchPair(name, unit) });
const qc = { region: 'xorazm', registered_at: '2026-03-05 10:20:00.000Z' };
ok(R.queryOf(res('Монтажник', 'чел-ч', 'materials'), qc).section === 'labor', 'чел-ч → labor whatever the band');
ok(R.queryOf(res('Кран', 'маш.час', 'other'), qc).section === 'machines', 'маш-ч → machines');
ok(R.queryOf(res('Перевозка', 'т.км', 'other'), qc).section === 'transport', 'т-км → transport');
ok(R.queryOf(res('Шкаф', 'шт', 'equipment'), qc).section === 'equipment', 'otherwise the band of the row');
ok(R.queryOf(res('Экскаватор одноковшовый', 'маш-ч', 'other'), qc).section === 'machines', 'band «other»: the classifier or the unit');
ok(R.queryOf(res('Нечто', 'шт', 'other'), qc).section === 'materials', 'nothing known: materials');
const q1 = R.queryOf(res('Кабель ВВГ 3х2,5', 'м', 'materials'), qc);
ok(q1.asof === '2026-03-05' && q1.region === 'xorazm' && q1.exclude_src.length === 0, 'as-of: the date part of the application registration');
ok(R.queryOf(res('Кабель ВВГ 3х2,5', 'м', 'materials'), { region: 'xorazm', asof: '2026-06-30', registered_at: '2026-03-05' }).asof === '2026-06-30', 'an as-of chosen by the expert wins');
ok(/^\d{4}-\d{2}-\d{2}$/.test(R.queryOf(res('Кабель', 'м', 'materials'), { region: 'xorazm' }).asof), 'no date at all: today');
ok(!('price' in q1) && Object.keys(q1).sort().join(',') === 'asof,exclude_src,id,name,region,section,unit', 'the query carries no smeta price');
ok(q1.id === R.queryOf(res('КАБЕЛЬ ВВГ 3Х2,5', 'м', 'materials'), qc).id, 'two spellings of one name and unit ask once');


/* ------------------------------------------------------------------ builds */
section('builds');
{
  const single = fs.readFileSync(path.join(ROOT, 'dist/smeta-taqqoslash.html'), 'utf8');
  ok(single.indexOf('S.refs') < 0 && single.indexOf('__REFS_WORKER__') < 0, 'the single-file page carries no reference-price code');
  const pages = ['smeta-taqqoslash.html', 'index.html', 'admin.html'].map((f) => fs.readFileSync(path.join(ROOT, 'dist', f), 'utf8'));
  ok(pages.every((t) => t.indexOf('fake-src-') < 0 && t.indexOf('Тест-Поставщик') < 0), 'no fixture data in any built page');
  ok(pages[2].indexOf('S.refs.pkg') >= 0 || /R\.pkg = \{/.test(pages[2]), 'the admin page carries the package validator');
}

/* ------------------------------------------------------------------ ES5 */
section('ES5 syntax of src/lib/refs');
{
  const dir = path.join(ROOT, 'src/lib/refs');
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p);
    }
  })(dir);
  // the code without comments, strings and regular expressions (a small scanner: enough for these files)
  function codeOnly(src) {
    let out = '', i = 0, prev = '';
    const KW = /(^|[^\w$])(return|typeof|case|in|of|new|delete|void|throw|else|do)$/;
    while (i < src.length) {
      const ch = src[i], nx = src[i + 1];
      if (ch === '/' && nx === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && nx === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; out += ' '; continue; }
      if (ch === "'" || ch === '"') {
        i++;
        while (i < src.length && src[i] !== ch) i += src[i] === '\\' ? 2 : 1;
        i++; out += ch + ch; prev = ch; continue;
      }
      if (ch === '/' && (/[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || prev === '' || KW.test(out.trimEnd()))) {
        i++;
        let cls = false;
        while (i < src.length && (src[i] !== '/' || cls)) {
          if (src[i] === '\\') i++;
          else if (src[i] === '[') cls = true;
          else if (src[i] === ']') cls = false;
          i++;
        }
        i++;
        while (/[a-z]/.test(src[i] || '')) i++;
        out += '/r/'; prev = '/'; continue;
      }
      out += ch;
      if (!/\s/.test(ch)) prev = ch;
      i++;
    }
    return out;
  }
  const bad = [];
  for (const f of files) {
    const code = codeOnly(fs.readFileSync(f, 'utf8'));
    const rules = [[/=>/, 'arrow'], [/\b(let|const|class)\s/, 'let/const/class'], [/`/, 'template'], [/\.\.\.[A-Za-z_$[(]/, 'spread'],
      [/\.includes\(/, 'includes'], [/\bfor\s*\([^;)]*\bof\b/, 'for…of'], [/\.(startsWith|endsWith|padStart|padEnd)\(/, 'ES2015 string method'],
      [/\bObject\.(entries|values|fromEntries)\(/, 'Object.entries/values']];
    for (const [re, what] of rules) if (re.test(code)) bad.push(path.relative(ROOT, f) + ': ' + what);
  }
  ok(files.length >= 14 && !bad.length, 'no ES2015+ syntax in ' + files.length + ' files' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

asyncChecks.then(() => {
  console.log('\n' + (n - fail) + ' / ' + n + ' ok' + (fail ? ', FAILED ' + fail : ''));
  process.exit(fail ? 1 : 0);
});
