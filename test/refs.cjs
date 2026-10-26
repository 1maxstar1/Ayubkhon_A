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

const S = load(load.CORE, load.REFS);
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
  ok(files.length >= 7 && !bad.length, 'no ES2015+ syntax in ' + files.length + ' files' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

console.log('\n' + (n - fail) + ' / ' + n + ' ok' + (fail ? ', FAILED ' + fail : ''));
process.exit(fail ? 1 : 0);
