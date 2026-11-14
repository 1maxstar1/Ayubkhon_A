/*
 * What a smeta file looks like, without what it says (src/lib/ml/layout.js, docs/format-reja.md).
 *
 * Held here:
 *   - a cell becomes one character — the kind of thing in it, never the thing;
 *   - the sample of a workbook carries what the rules read (the header row, the columns, the kind of each row) and
 *     the trace quantity × price = sum leaves in the columns;
 *   - **no name and no price of the estimate is in the sample** — it is what leaves the page to be learnt from;
 *   - two files of one format share a signature, whatever they say and however many sheets they have; another
 *     layout has another; a file the rules did not read still has one;
 *   - the arithmetic check counts the lines whose sum is their quantity × price;
 *   - the hash is SHA-256 (the file's identity on the server).
 *
 * Names and numbers are invented.
 *
 *   node test/ml-layout.cjs
 */
'use strict';
const crypto = require('crypto');
const { load } = require('./load.cjs');
const books = require('./compare-books.cjs');

const S = load(load.PIPELINE, 'volumes', 'ml-layout');
const L = S.ml.layout;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/** A workbook as the reader gives it: written to .xlsx and read back. */
const through = (wb) => S.readXlsx(new Uint8Array(books.xlsx(S, wb)));
const read = (wb) => { const w = through(wb); return { wb: w, objects: S.smeta.parseWorkbook(w, 'a.xlsx') }; };

/* ------------------------------------------------------------------ a cell */
const C = (v, f) => L.code(f ? { v, f } : { v });
check(L.code(null) === '.' && C('') === '.' && C('   ') === '.', 'an empty cell');
check(C(7) === '0' && C(42) === '1' && C(123456) === '5' && C(0) === '0', 'a whole number, by its digits');
check(C(0.25) === 'a' && C(12.5) === 'b' && C(98765.4) === 'e', 'a number with a fraction, by the digits of its whole part');
check(C(300, 'E5*F5') === 'C' && C(12.5, 'SUM(A1:A3)') === 'L', 'a number a formula gives');
check(C('12') === '1' && C('1 234,5') === 'd' && C('1.1') === 'a', 'a number written as text is a number');
check(C('ТЕСТОВЫЙ КРАН') === 'x' && C('ТЕСТОВЫЙ КРАН НА ГУСЕНИЧНОМ ХОДУ 25 Т') === 'y' && C('—') === 'z', 'text: short, long, without letters');
check(['М3', 'м2', 'ШТ', 'шт.', 'ЧЕЛ.-Ч', 'маш.-ч', 'Т', 'ТН', '100 М2', '1000М3', 'т/км', 'компл.', '1000 М3 ГРУНТА'].every((u) => C(u) === 'u'),
  'a unit of measure, with its multiplier and what it is of');
check(C('№ п/п') === '#' && C('N п.п.') === '#' && C('Наименование ресурсов') === '@' && C('Ед. изм.') === '%' && C('Единица измерения') === '%',
  'header words: the number, the name, the unit');
check(C('Кол-во') === '*' && C('Количество единиц') === '*' && C('Цена за ед.') === '$' && C('на единицу') === '$' &&
  C('Сумма (сум)') === '+' && C('общая') === '+' && C('Всего') === '+' && C('Шифр ресурсов') === '&',
  'header words: the quantity, the price, the sum, the code');
check(C('ИТОГО ПРЯМЫЕ ЗАТРАТЫ') === '=' && C('Всего по смете') === '=' && C('Раздел 1. Земляные работы') === '!' &&
  C('СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ') === '^' && C('Примечание') === '~' && C('СУМ') === ':', 'a total, a section, a band, a remark, the money unit');

/* ------------------------------------------------------------------ a sample */
// form 4А: two local estimates on one sheet (the first with eleven lines), read by the rules
const a = read(books.book(1));
const sa = L.sample(a.wb, a.objects);
check(a.objects.length === 2 && sa.v === L.VERSION && sa.total === 1 && sa.sheets.length === 1, 'one sheet, two estimates on it');
const sh = sa.sheets[0];
const b0 = sh.b[0].L, lay = a.objects[0].layout;
check(sh.b.length === 2 && ['no', 'name', 'unit', 'qty', 'price', 'sum', 'code', 'headerRow', 'subRow', 'numRow'].every((k) => (b0[k] || 0) === (lay[k] || 0)),
  'the blocks carry the layout the rules read by (' + JSON.stringify(b0) + ')');
check(sh.g[lay.headerRow - 1].replace(/\./g, '') === '#&@%*+' && /\$\+$/.test(sh.g[lay.subRow - 1]), 'the header rows as characters (' + sh.g[lay.headerRow - 1] + ' / ' + sh.g[lay.subRow - 1] + ')');
const kindsOf = (o) => o.rows.map((r) => ({ item: 'i', section: 's', total: 't', header: 'h', numbering: 'n', extra: 'e', blank: 'b' })[r.kind] || 'e');
check(a.objects.every((o) => o.rows.every((r, i) => sh.k[r.r - 1] === kindsOf(o)[i])), 'every row is labelled with the kind the rules gave it');
check(sh.k.split('').filter((c) => c === 'i').length === 13, 'thirteen resource lines');
check(sh.rel[0].slice(0, 3).join() === [lay.qty, lay.price, lay.sum].join() && sh.rel[0][3] >= 10,
  'the columns that multiply: quantity × price = sum (' + JSON.stringify(sh.rel[0]) + ')');
check(a.objects[0].rows.filter((r) => r.kind === 'item').every((r) => sh.rr[r.r - 1] === '0'), 'and each resource line holds it');

// nothing of what the estimate says: a sheet with names and prices that cannot be mistaken for anything else
const priv = { sheets: [books.sheet('РЕСУРС', [
  ['Ведомость ресурсов ЗАГАДОЧНЫЙ ОБЪЕКТ'],
  ['№ п/п', 'Наименование', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Сумма (сум)'],
  [null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
  [1, 'ВЫМЫШЛЕННЫЙ КИРПИЧ ЗЕЛЁНЫЙ', 'ШТ', 3.75, 48563.26, 3.75 * 48563.26],
  [2, 'НЕСУЩЕСТВУЮЩАЯ ПЛИТА ПЕРЕКРЫТИЯ', 'М3', 2, 91357.5, 2 * 91357.5],
  [3, 'ПРИДУМАННЫЙ РАСТВОР', 'Т', 4, 77123, 4 * 77123],
  [null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, 3.75 * 48563.26 + 2 * 91357.5 + 4 * 77123]
])] };
const p = read(priv);
const dp = L.describe(new Uint8Array(books.xlsx(S, priv)), p.wb, p.objects);
const json = JSON.stringify(dp);
check(p.objects.length === 1 && dp.read && dp.items === 3, 'an ordinary resource sheet, read by its header');
check(!/[Ѐ-ӿ]/.test(json), 'the sample has no letter of the estimate in it');
check(['48563', '91357', '77123', '182112', '308492', '673319'].every((n) => !json.includes(n)), 'and none of its prices or sums');
check(!/РЕСУРС|a\.xlsx/.test(json), 'nor the name of a sheet or of the file');

/* ------------------------------------------------------------------ which format */
const b = read(books.book(2));
const sb = L.sample(b.wb, b.objects);
check(L.signature(sa) === L.signature(sb) && /^[0-9a-f]{16}$/.test(L.signature(sa)), 'two versions of one estimate are one format (' + L.signature(sa) + ')');
const three = read(books.bookOf([
  { works: 'ПЕРВЫЕ РАБОТЫ', no: 1, direct: 20, rows: [[null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], books.line(1, 'ТЕСТОВЫЙ ГВОЗДЬ', 'КГ', 4, 5)] },
  { works: 'ВТОРЫЕ РАБОТЫ', no: 2, direct: 12, rows: [[null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], books.line(1, 'ТЕСТОВЫЙ БОЛТ', 'ШТ', 2, 6)] },
  { works: 'ТРЕТЬИ РАБОТЫ', no: 3, direct: 9, rows: [[null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'], books.line(1, 'ТЕСТОВЫЙ ШУРУП', 'КГ', 3, 3)] }
]));
check(three.objects.length === 3 && L.signature(L.sample(three.wb, three.objects)) === L.signature(sa),
  'three estimates of that form in another file — the same format');
check(dp.signature !== L.signature(sa), 'an ordinary resource sheet is another format');
// the works of form 5 beside the resources do not change the format of the resource sheet
const w = read(books.bookWithWorks());
check(L.signature(L.sample(w.wb, w.objects)) === L.signature(sa), 'a sheet the rules do not read as resources does not change the format');
const sw = L.sample(w.wb, w.objects);
check(sw.sheets.length === 2 && sw.sheets[0].b && !sw.sheets[1].b && sw.sheets[1].g.length > 5, 'it is in the sample all the same, unlabelled, after the read ones');

// a file the rules do not read
const odd = { sheets: [books.sheet('Лист1', [
  ['Какая-то таблица'],
  ['Позиция', 'Описание', 'Стоимость'],
  ['А', 'нечто', 5], ['Б', 'нечто иное', 7]
]), books.sheet('Лист2', [['№', 'Наименование', 'Ед. изм.', 'Было', 'Стало'], [1, 'нечто', 'шт', 1, 2]])] };
const o = read(odd);
const d0 = L.describe(new Uint8Array(books.xlsx(S, odd)), o.wb, o.objects);
check(o.objects.length === 0 && !d0.read && d0.items === 0 && d0.score === null, 'a workbook with no resource sheet is not read');
check(d0.sample.sheets.length === 2 && d0.sample.sheets.every((s) => !s.b && !s.k), 'its sample has the sheets, with no labels');
check(/^[0-9a-f]{16}$/.test(d0.signature) && d0.signature !== dp.signature, 'and a signature of its own');
const odd2 = JSON.parse(JSON.stringify(odd));
odd2.sheets[0].rows[3][3].v = 11; odd2.sheets[1].rows[2][2].v = 'другое';
const o2 = read(odd2);
check(L.describe(new Uint8Array(books.xlsx(S, odd2)), o2.wb, o2.objects).signature === d0.signature, 'the same unread layout with other contents — the same signature');
// a file that could not be opened at all
const junk = L.describe(new Uint8Array([1, 2, 3, 4]), null, null);
check(!junk.read && junk.sample === null && junk.signature === '' && junk.size === 4 && /^[0-9a-f]{64}$/.test(junk.hash), 'a file that cannot be opened is still told apart by its hash');

/* ------------------------------------------------------------------ the arithmetic */
const ck = L.check(p.objects);
check(ck.items === 3 && ck.rows === 3 && ck.ok === 3 && ck.score === 1, 'every line agrees: quantity × price = sum');
check(ck.totals === 1 && ck.totalsOk === 1, 'and the band total is the sum of its lines');
const bad = JSON.parse(JSON.stringify(priv));
bad.sheets[0].rows[5][6].v = 5;                 // one sum typed over
const pb = read(bad);
const ckb = L.check(pb.objects);
check(ckb.rows === 3 && ckb.ok === 2 && Math.abs(ckb.score - 0.6667) < 1e-9 && ckb.totalsOk === 0, 'a sum typed over is counted (' + ckb.ok + ' of ' + ckb.rows + ')');
check(L.check([]).score === null, 'nothing read — nothing to score');

/* ------------------------------------------------------------------ the hash */
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const samples = [new Uint8Array(0), new Uint8Array([97, 98, 99]), new Uint8Array(55).fill(7), new Uint8Array(56).fill(7), new Uint8Array(64).fill(1),
  new Uint8Array(books.xlsx(S, books.book(1)))];
check(samples.every((x) => L.sha256(x) === sha(x)), 'SHA-256, as node computes it (empty, short, at the padding edges, a workbook)');
check(dp.hash === sha(Buffer.from(books.xlsx(S, priv))) && dp.size === books.xlsx(S, priv).length, 'the description carries the file\'s hash and size');

/* ------------------------------------------------------------------ limits */
const many = { sheets: [] };
for (let i = 0; i < L.MAX_SHEETS + 5; i++) many.sheets.push(books.sheet('Л' + i, [['Пусто', i]]));
const tall = [];
for (let r = 0; r < L.MAX_ROWS + 50; r++) tall.push([r + 1, 'строка', 2, 3, 6]);
many.sheets.push(books.sheet('Длинный', tall));
const m = read(many);
const sm = L.sample(m.wb, m.objects);
check(sm.total === L.MAX_SHEETS + 6 && sm.sheets.length === L.MAX_SHEETS, 'a workbook of many sheets: the first ' + L.MAX_SHEETS + ' are sampled, the count says how many there were');
const longOnly = read({ sheets: [books.sheet('Длинный', tall)] });
const sl = L.sample(longOnly.wb, longOnly.objects).sheets[0];
check(sl.g.length === L.MAX_ROWS && sl.rows === L.MAX_ROWS + 50, 'a long sheet: the first ' + L.MAX_ROWS + ' rows, and how many there were');

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
