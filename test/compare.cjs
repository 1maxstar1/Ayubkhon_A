/*
 * «Сравнение версий»: the first smeta, the smeta the sender returned after our comparison
 * table, and what the table asked for. Every status, the pairing of lines when the sender
 * inserted or deleted one, what counts as «asked» (the report's own mode and threshold), and
 * the .xlsx of the comparison. Then (audit 4, D1–D3): sheets inserted, deleted or renumbered,
 * lines moved to another band or estimate, М5 never renamed to М8, prices judged over the
 * line's sum, whole-estimate totals not recalculated, and «Наш ответ» read sheet by sheet.
 *
 * Both versions are invented and tiny (names, numbers and prices), built as the parser sees a
 * sheet, so no real estimate or price is needed.
 *
 *   node test/compare.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'xlsx-write',
  'smeta', 'assemble', 'report', 'export', 'compare', 'reply');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const { book, bookOf, line, prices: pricesFor, xlsx, replyBook, replyBook2, replySmeta, sheet, estimate } = require('./compare-books.cjs');

const v1 = S.smeta.parseWorkbook(book(1), 'v1.xlsx');
const v2 = S.smeta.parseWorkbook(book(2), 'v2.xlsx');
check(v1.length === 2 && v2.length === 2, 'both versions read as two estimates');

// our table: market prices on the first version, the report's own mode and threshold
const k = (nm, unit, p) => S.resKey(nm, unit, p);
const prices = pricesFor(S);
const proj = { id: 'p1', name: 'T', title: 'T', objects: v1, enabled: true };
const model = S.assemble([proj], prices);
const opts = { mode: 'changed', minDiff: 1, equipNote: 'НУЖНЫ ДВА КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЯ', equipLimit: 20, autoNote: true, noteText: 'X' };
const req = S.compare.requested(model, opts);
check(Object.keys(req).length === 6, 'asked: the five prices over the threshold and the equipment note (' + Object.keys(req).length + ')');
check(!req[k('ТЕСТОВЫЙ ГВОЗДЬ', 'КГ', 5)], 'a price under the report threshold was never asked');
check(req[k('ТЕСТОВЫЙ ЩИТ', 'ШТ', 29)] && req[k('ТЕСТОВЫЙ ЩИТ', 'ШТ', 29)].note, 'the equipment note is asked without a price');
const known = {};
model.resources.forEach((r) => { if (!req[r.key] && Math.abs(r.market - r.price) >= 0.25) known[r.key] = r.market; });

const res = S.compare.versions(v1, v2, req, known);
const rowOf = (nm, oi) => res.objects[oi || 0].rows.find((r) => r.nm === nm);
const st = (nm, oi) => (rowOf(nm, oi) || {}).st;
check(st('ТЕСТОВЫЙ КРАН 10 Т') === 'fixed', 'price brought to ours: fixed');
check(st('ТЕСТОВЫЙ АНКЕР М5') === 'fixed' && st('ТЕСТОВЫЙ АНКЕР М5', 1) === 'notfixed',
  'one resource, two estimates: fixed in one, left in the other');
check(st('ТЕСТОВЫЙ АНКЕР М8') === 'partial', 'lowered, but not to ours: partial');
check(st('ТЕСТОВЫЙ БОЛТ') === 'worse', 'raised although we asked to lower it: worse');
check(st('ТЕСТОВЫЙ ГВОЗДЬ') === 'lowered' && rowOf('ТЕСТОВЫЙ ГВОЗДЬ').ours === 4.5 && rowOf('ТЕСТОВЫЙ ГВОЗДЬ').market == null,
  'not asked and lowered: lowered, with our unsent price shown for reference only');
check(st('ТЕСТОВЫЙ ШУРУП') === 'raised', 'not asked and raised: raised');
check(st('ТЕСТОВАЯ ДОСКА') === 'qtyup', 'same price, more quantity: qtyup');
check(st('ТЕСТОВЫЙ КЛЕЙ') === 'added', 'a line only in the new version: added');
check(st('ТЕСТОВЫЙ ДЮБЕЛЬ') === 'removed', 'a line only in the first version: removed');
check(st('ТЕСТОВЫЙ ЦЕМЕНТ') === 'same' && st('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ') === 'same',
  'the inserted and deleted lines do not shift the pairing of the lines after them');
check(st('ТЕСТОВЫЙ ЩИТ', 1) === 'note', 'equipment with only a note, unchanged: note');
check(rowOf('ТЕСТОВЫЙ АНКЕР М5') !== rowOf('ТЕСТОВЫЙ АНКЕР М8'), 'М5 and М8 are two lines');
const film = res.objects[0].rows.find((r) => r.nm === 'ТЕСТОВАЯ ПЛЁНКА');
check(film && film.st === 'renamed' && film.nm2 === 'ТЕСТОВАЯ ПЛЁНКА 0,2 ММ',
  'a line renamed by the sender is one renamed line, not removed + added');
check(!res.objects[0].rows.some((r) => r.st === 'added' && /ПЛЁНКА/.test(r.nm)), 'the new name is not counted as a new line');

// lines that carry an amount but are not resources
const am = res.objects[0].amounts;
const amt = (re) => am.find((x) => re.test(x.label1 || x.label2));
check(amt(/^ТРАНСПОРТНЫЕ/).st === 'label' && amt(/^ТРАНСПОРТНЫЕ/).label2 === 'ТРАНСПОРТНЫЕ УСЛУГИ=7%',
  'an overhead whose percentage changed (5 % → 7 %) is paired and flagged');
check(amt(/^ИТОГО СТРОИТЕЛЬНЫЕ/).st === 'gap' && amt(/^ИТОГО СТРОИТЕЛЬНЫЕ/).gap === 12,
  'a band total typed over (200 while its lines sum to 188) is flagged with its gap');
check(amt(/^ИТОГО ПРЯМЫЕ/).st === 'amount', '«ИТОГО ПРЯМЫЕ ЗАТРАТЫ» that moves with its lines (325 → 320) is only a changed amount');
check(res.objects[1].amounts.find((x) => /^ИТОГО ПРЯМЫЕ/.test(x.label1)).st === 'same', 'and is unchanged where its lines are (63)');
check(res.totals.amountFlags === 2, 'two sheet total lines need attention (' + res.totals.amountFlags + ')');
// a gap both versions share was already there: not flagged
const v1gap = S.smeta.parseWorkbook(book(1), 'v1.xlsx'), v2same = S.smeta.parseWorkbook(book(1), 'v1.xlsx');
v1gap[0].rows.concat(v2same[0].rows).forEach((r) => { if (/^ИТОГО СТРОИТЕЛЬНЫЕ/.test(r.nm || r.noTxt || '')) r.sum = 150; });
check(S.compare.versions(v1gap, v2same, {}, {}).objects[0].amounts.every((x) => x.st === 'same'),
  'a total that never matched its lines, in both versions alike, is left alone');

// what our table did not mention
const un = res.objects.flatMap((o) => o.rows).filter(S.compare.unasked).map((r) => r.nm).sort();
check(un.join(',') === 'ТЕСТОВАЯ ДОСКА,ТЕСТОВАЯ ПЛЁНКА,ТЕСТОВЫЙ ГВОЗДЬ,ТЕСТОВЫЙ КЛЕЙ,ТЕСТОВЫЙ ШУРУП',
  'changes nobody asked about: plank, film, nail, glue, screw (' + un.join(',') + ')');
// plank +4, glue +9, screw +1 up; nail −1 down
check(res.totals.unaskedUp === 14 && res.totals.unaskedDown === 1, 'their amounts: up 14, down 1 (' + res.totals.unaskedUp + ', ' + res.totals.unaskedDown + ')');

const g5 = res.resources.find((g) => g.nm === 'ТЕСТОВЫЙ АНКЕР М5');
check(g5 && g5.st === 'partial' && g5.rows === 2 && g5.counts.fixed === 1 && g5.counts.notfixed === 1,
  'the resource is partial: one line fixed, one left');
check(/не исправлено: 1/.test(S.compare.statusText(g5)), 'its status names the line left (' + S.compare.statusText(g5) + ')');
check(res.resources[0].st === 'worse', 'the resource list starts with the worst');

const T = res.totals;
// asked: КРАН 2×(13−11)=4, М5 (4+2)×(17−15)=12, М8 3×(19−16)=9, БОЛТ 2×(7−6)=2, ДЮБЕЛЬ 5×0.5=2.5
check(T.askedSaving === 29.5, 'asked saving is the quantity × (smeta − ours) of every asked line (' + T.askedSaving + ')');
// got: КРАН 4, М5 8 (+0), М8 3, БОЛТ −2, ДЮБЕЛЬ deleted 5
check(T.gotSaving === 18, 'got saving is what those lines lost in the new version (' + T.gotSaving + ')');
check(T.leftRows === 2, 'lines left at the old price or above: the М5 line and the bolt (' + T.leftRows + ')');
const sum = (objs) => objs.reduce((s, o) => s + o.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + r.qty * r.price, 0), 0);
check(Math.abs(T.oldSum - sum(v1)) < 1e-9 && Math.abs(T.newSum - sum(v2)) < 1e-9, 'totals are line by line sums of both versions');

// alignment on its own: a sender who reorders nothing but inserts in the middle
const A = [{ nm: 'A', unit: 'ШТ' }, { nm: 'B', unit: 'ШТ' }, { nm: 'C', unit: 'ШТ' }];
const B = [{ nm: 'A', unit: 'ШТ' }, { nm: 'X', unit: 'ШТ' }, { nm: 'B', unit: 'ШТ' }, { nm: 'C', unit: 'ШТ' }];
check(JSON.stringify(S.compare.align(A, B)) === '[[0,0],[-1,1],[1,2],[2,3]]', 'align pairs around an insertion');
check(JSON.stringify(S.compare.align(A, A)) === '[[0,0],[1,1],[2,2]]', 'align pairs identical lists in place');

// the workbook: two sheets, one line per changed resource / changed line, readable again
const bytes = S.compare.workbook(res, { oldLabel: 'v1.xlsx', newLabel: 'v2.xlsx' });
const back = S.readXlsx(bytes);
const names = back.sheets.map((s) => s.name);
check(names.join('|') === 'По ресурсам|По строкам|Итоги листов', 'the comparison workbook has its three sheets (' + names.join('|') + ')');
const amtRows = back.sheets[2].rows.filter((r, i) => r && i > 5 && r[2] && r[2].v).map((r) => String(r[2].v) + ' | ' + String((r[7] && r[7].v) || ''));
check(amtRows.some((s) => /ТРАНСПОРТНЫЕ УСЛУГИ=5%.*Изменён текст/.test(s)) && amtRows.some((s) => /ИТОГО СТРОИТЕЛЬНЫЕ.*расхождение 12/.test(s)),
  'the sheet totals sheet carries the changed percentage and the typed total');
const named = back.sheets[1].rows.filter((r, i) => r && i > 5 && r[3]).map((r) => String(r[3].v));
check(named.includes('ТЕСТОВАЯ ПЛЁНКА  →  ТЕСТОВАЯ ПЛЁНКА 0,2 ММ'), 'a renamed line shows both names in the lines sheet');
const asked = back.sheets[1].rows.filter((r, i) => r && i > 5 && r[3] && r[14]).map((r) => r[3].v + ':' + r[14].v);
check(asked.includes('ТЕСТОВЫЙ БОЛТ:да') && asked.includes('ТЕСТОВЫЙ ШУРУП:нет'), 'each line says whether our table asked about it');
const changedRes = res.resources.filter((g) => g.st !== 'same').length;
const resRows = back.sheets[0].rows.filter((r, i) => r && i > 5 && r[2] && r[2].v).length;
check(resRows === changedRes, 'one row per resource that changed (' + resRows + ' of ' + changedRes + ')');
const changedLines = res.objects.reduce((n, o) => n + o.rows.filter((r) => r.st !== 'same').length, 0);
const lineRows = back.sheets[1].rows.filter((r, i) => r && i > 5 && r[3] && r[3].v).length;
check(lineRows === changedLines, 'one row per line that changed (' + lineRows + ' of ' + changedLines + ')');
const statusCol = back.sheets[0].rows.filter((r, i) => r && i > 5 && r[11]).map((r) => r[11].v);
check(statusCol.some((s) => /Не исправлено|частично/i.test(s)), 'the status is written out in words');

// «Было» as a file, with no table: only what changed, nothing judged as a request
const plain = S.compare.versions(v1, v2, {}, {});
check(plain.totals.askedSaving === 0 && plain.objects[0].rows.find((r) => r.nm === 'ТЕСТОВЫЙ КРАН 10 Т').st === 'lowered',
  'without our table a lowered price is «lowered», never «fixed»');

// «Наш ответ» as a spreadsheet: a plain table (a PDF reply turned into Excel)
const rp = S.reply.parse(replyBook());
check(rp.entries.length === 7 && rp.cols.price === 4 && rp.cols.market === 5, 'the reply table is found by its header; the band row is skipped (' + rp.entries.length + ')');
const rm = S.reply.match(rp.entries, v1);
check(rm.found.length === 6 && rm.missing.length === 1 && /КОТОРОГО НЕТ/.test(rm.missing[0].name), 'six lines found in the smeta, one is not');
check(rm.prices[k('ТЕСТОВЫЙ АНКЕР М8', 'ШТ', 19)] === 16, 'a name broken differently («АНКЕР  М 8») still lands on its line');
check(rm.prices[k('ТЕСТОВЫЙ ДЮБЕЛЬ', 'ШТ', 1)] === 0.5, 'a small price change is a change (1 → 0,5)');
check(!rm.prices[k('ТЕСТОВЫЙ ЩИТ', 'ШТ', 29)] && rm.requested[k('ТЕСТОВЫЙ ЩИТ', 'ШТ', 29)].note, 'an unchanged price with a note is the note only');
check(!rm.prices[k('ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 15)], 'the reply never prices a line it does not name');
const viaReply = S.compare.versions(v1, v2, rm.requested, {});
const stR = (nm, oi) => (viaReply.objects[oi || 0].rows.find((r) => r.nm === nm) || {}).st;
check(stR('ТЕСТОВЫЙ КРАН 10 Т') === 'fixed' && stR('ТЕСТОВЫЙ АНКЕР М5', 1) === 'notfixed' && stR('ТЕСТОВЫЙ БОЛТ') === 'worse',
  'judged against the reply file: crane fixed, М5 left in the second estimate, bolt raised');
check(stR('ТЕСТОВЫЙ ГВОЗДЬ') === 'lowered', 'what the reply does not mention is «без нашего замечания»');
// our own export read back as a reply gives back exactly the prices it was made from
const ownModel = S.assemble([{ id: 'p1', name: 'T', title: 'T', objects: v1, enabled: true }], rm.prices);
const own = S.reply.parse(S.readXlsx(S.buildWorkbook(ownModel, { mode: 'changed', minDiff: 0, autoNote: true, noteText: 'X' })));
const ownM = S.reply.match(own.entries, v1);
check(own.entries.length > 0 && ownM.missing.length === 0 &&
  Object.keys(rm.prices).every((kk) => ownM.prices[kk] === rm.prices[kk]), 'our own export (321.xlsx sheet) read back gives the same prices');

// each estimate's resource lines add up to that estimate's own line sums, before and after
const itemSum = (o) => o.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + r.qty * r.price, 0);
check(res.objects.every((o, i) => Math.abs(o.oldSum - itemSum(v1[i])) < 1e-9 && Math.abs(o.newSum - itemSum(v2[i])) < 1e-9),
  'each sheet\'s «Строки ресурсов (сумма)» is the sum of its own lines');

/* ------------------------------------------------- pairing sheets and lines (audit 4, D1) */

const LAB = [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'], MAT = [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'];
const EQP = [null, null, 'ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ'];
const labour = (q) => line(1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', q, 11);
const parse = (ests) => S.smeta.parseWorkbook(bookOf(ests), 'x.xlsx');
const one = (rows, direct) => parse([{ no: 1, works: 'ТЕСТОВЫЕ РАБОТЫ', rows, direct }]);
const allRows = (r) => r.objects.flatMap((o) => o.rows);
const rowsNamed = (r, nm) => allRows(r).filter((x) => x.nm === nm);
// an estimate of its own: the labour line nearly every estimate has, and two materials of its own
const WORDS = { А: ['ПЕСОК', 'ГЛИНА'], Б: ['ЩЕБЕНЬ', 'ГРАВИЙ'], В: ['КИРПИЧ', 'ИЗВЕСТЬ'], Н: ['ГИПС', 'МЕЛ'],
                П: ['ЛАК', 'КРАСКА'], Q: ['ОЛИФА', 'ГРУНТ'] };
const est = (no, w, works) => ({ no, works: works || 'РАБОТЫ ' + w, rows: [LAB, labour(10), MAT,
  line(1, 'ТЕСТОВЫЙ ' + WORDS[w][0], 'Т', 2, 5), line(2, 'ТЕСТОВЫЙ ' + WORDS[w][1], 'КГ', 3, 7)] });
const objOf = (r, w) => r.objects.find((o) => (o.oldName || o.newName).includes('РАБОТЫ ' + w + ' —'));
const allSame = (o) => o && o.rows.length > 0 && o.rows.every((x) => x.st === 'same');

// (a) a new estimate inserted in the middle, and the ones after it renumbered
const r1 = S.compare.versions(parse([est(1, 'А'), est(2, 'Б'), est(3, 'В')]),
  parse([est(1, 'А'), est(2, 'Н'), est(3, 'Б'), est(4, 'В')]), {}, {});
check(objOf(r1, 'Б') && objOf(r1, 'Б').newName.includes('РАБОТЫ Б') && objOf(r1, 'В') && objOf(r1, 'В').newName.includes('РАБОТЫ В') &&
  allSame(objOf(r1, 'Б')) && allSame(objOf(r1, 'В')),
  'an estimate inserted in the middle does not steal the pair of the ones after it, renumbered or not');
const n1 = r1.objects.find((o) => o.newName.includes('РАБОТЫ Н'));
check(n1 && n1.only === 'new' && !n1.oldName && n1.rows.every((x) => x.st === 'added') && r1.totals.counts.renamed === 0,
  'the inserted estimate is a sheet without a pair: its lines are new, nothing is «renamed»');
// one deleted at the front, one added at the back
const r2 = S.compare.versions(parse([est(1, 'П'), est(2, 'А')]), parse([est(1, 'А'), est(2, 'Q')]), {}, {});
const a2 = objOf(r2, 'А');
check(a2 && a2.oldName.includes('РАБОТЫ А') && a2.newName.includes('РАБОТЫ А') && allSame(a2), 'the estimate in both versions finds its pair by its title');
check((objOf(r2, 'П') || {}).only === 'old' && (r2.objects.find((o) => o.newName.includes('РАБОТЫ Q')) || {}).only === 'new',
  'the deleted and the added estimates are sheets without a pair, not one estimate rewritten');
// a book of one estimate is the same estimate, whatever its new title and lines
const r3 = S.compare.versions(parse([est(1, 'А')]), parse([est(1, 'Q')]), {}, {});
check(r3.objects.length === 1 && !r3.objects[0].only, 'a book of one estimate pairs it, title changed or not');
// two estimates with the same lines, both titles changed: their order decides
const r4 = S.compare.versions(parse([est(1, 'А', 'БЛОК 1'), est(2, 'А', 'БЛОК 2')]),
  parse([est(1, 'А', 'БЛОК 1 ИЗМ'), est(2, 'А', 'БЛОК 2 ИЗМ')]), {}, {});
check(r4.objects.length === 2 && r4.objects[0].newName.includes('БЛОК 1 ИЗМ') && r4.objects[1].newName.includes('БЛОК 2 ИЗМ'),
  'two estimates alike in their lines keep their order');
const wb2 = S.readXlsx(S.compare.workbook(r2, {}));
check(wb2.sheets[2].rows.some((r) => r && r[1] && /РАБОТЫ П.*лист без пары/.test(String(r[1].v))),
  'the workbook names a sheet without a pair');

// (b) digits are never lost: М5 renamed to М8 is not one line renamed
const nail = line(1, 'ТЕСТОВЫЙ ГВОЗДЬ', 'КГ', 1, 5), shield = line(1, 'ТЕСТОВЫЙ ЩИТ', 'ШТ', 1, 29);
const cable = line(2, 'ТЕСТОВЫЙ КАБЕЛЬ', 'М', 2, 3), plank = line(3, 'ТЕСТОВАЯ ДОСКА', 'М3', 2, 9);
const m5 = (p) => line(2, 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 4, p || 17);
const r5 = S.compare.versions(one([MAT, nail, m5()]), one([MAT, nail, line(2, 'ТЕСТОВЫЙ АНКЕР М8', 'ШТ', 4, 17)]), {}, {});
check((rowsNamed(r5, 'ТЕСТОВЫЙ АНКЕР М5')[0] || {}).st === 'removed' && (rowsNamed(r5, 'ТЕСТОВЫЙ АНКЕР М8')[0] || {}).st === 'added' &&
  r5.totals.counts.renamed === 0, 'М5 → М8 at the same price and quantity is a line removed and a line added');

// (c) a line moved to another band, or another estimate, is the same line
const askM5 = {};
askM5[k('ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17)] = { market: 15 };
const band1 = one([MAT, nail, m5(), EQP, shield]), band2 = (p) => one([MAT, nail, EQP, shield, m5(p)]);
const r6 = S.compare.versions(band1, band2(17), askM5, {});
const x6 = rowsNamed(r6, 'ТЕСТОВЫЙ АНКЕР М5');
check(x6.length === 1 && x6[0].st === 'notfixed' && x6[0].moved && x6[0].section === 'equipment' && x6[0].section1 === 'materials',
  'an asked line moved to another band at its old price is one line, not fixed (' + x6.map((x) => x.st).join(',') + ')');
check(r6.totals.askedSaving === 8 && r6.totals.gotSaving === 0,
  'and the move is no saving: asked 8, got 0 (' + r6.totals.askedSaving + ', ' + r6.totals.gotSaving + ')');
const r6b = S.compare.versions(band1, band2(17), {}, {});
check(rowsNamed(r6b, 'ТЕСТОВЫЙ АНКЕР М5').map((x) => x.st).join() === 'moved' && r6b.totals.counts.moved === 1 &&
  r6b.totals.unaskedUp === 0 && r6b.totals.unaskedDown === 0, 'moved and nothing else changed: «moved», with no money');
const r6c = S.compare.versions(band1, band2(15), askM5, {});
check(rowsNamed(r6c, 'ТЕСТОВЫЙ АНКЕР М5').map((x) => x.st + (x.moved ? '+moved' : '')).join() === 'fixed+moved' && r6c.totals.gotSaving === 8,
  'moved and brought to our price: fixed, saving 8');
// to another estimate
const est2 = (a, b) => parse([{ no: 1, works: 'РАБОТЫ А', rows: a }, { no: 2, works: 'РАБОТЫ Б', rows: b }]);
const mv1 = est2([MAT, nail, m5(), plank], [EQP, shield, cable]), mv2 = est2([MAT, nail, plank], [EQP, shield, cable, m5()]);
const r7 = S.compare.versions(mv1, mv2, askM5, {});
const x7 = rowsNamed(r7, 'ТЕСТОВЫЙ АНКЕР М5');
check(x7.length === 1 && x7[0].st === 'notfixed' && x7[0].from === r7.objects[0].name && r7.objects[1].rows.includes(x7[0]),
  'a line moved to another estimate is shown there, with the estimate it came from');
check(r7.totals.askedSaving === 8 && r7.totals.gotSaving === 0, 'and is no saving either (' + r7.totals.gotSaving + ')');
check(r7.objects.every((o, i) => Math.abs(o.oldSum - itemSum(mv1[i])) < 1e-9 && Math.abs(o.newSum - itemSum(mv2[i])) < 1e-9),
  'each sheet still sums its own lines: the moved line counts where it was, and where it is');
const wb7 = S.readXlsx(S.compare.workbook(r7, {}));
check(wb7.sheets[1].rows.some((r) => r && r[3] && r[3].v === 'ТЕСТОВЫЙ АНКЕР М5' && r[1] &&
  r[1].v === r7.objects[0].name + ' → ' + r7.objects[1].name), 'the workbook says where the line came from: «A → B»');
// a reorder inside one band
const r8 = S.compare.versions(one([MAT, nail, m5(), cable]), one([MAT, m5(), nail, cable]), {}, {});
check(r8.totals.counts.moved === 1 && r8.totals.counts.removed === 0 && r8.totals.counts.added === 0,
  'lines reordered inside one band: one line moved, nothing removed or added');
// a move is looked for before a rename: М5 went to the equipment, БОЛТ is new
const r9 = S.compare.versions(one([MAT, nail, m5(), EQP, shield, cable]),
  one([MAT, nail, line(2, 'ТЕСТОВЫЙ БОЛТ', 'ШТ', 4, 17), EQP, shield, cable, m5()]), {}, {});
check((rowsNamed(r9, 'ТЕСТОВЫЙ АНКЕР М5').map((x) => x.st).join() === 'moved') && (rowsNamed(r9, 'ТЕСТОВЫЙ БОЛТ')[0] || {}).st === 'added' &&
  r9.totals.counts.renamed === 0, 'a line moved is found before a rename is guessed: М5 moved, БОЛТ new');
// across estimates a line moves only with its quantity: one labour line deleted, another added
const r10 = S.compare.versions(est2([LAB, labour(10), MAT, nail], [EQP, shield]), est2([MAT, nail], [LAB, labour(12), EQP, shield]), {}, {});
const lab10 = rowsNamed(r10, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ').map((x) => x.st).sort().join();
check(lab10 === 'added,removed' && r10.totals.counts.moved === 0, 'labour deleted in one estimate and added in another with another quantity: removed + added (' + lab10 + ')');

/* -------------------------------------------- sums judged by the line, not the unit (D3) */

const steel = (q, p1, p2, ask) => {
  const rq = {};
  if (ask != null) rq[k('ТЕСТОВЫЙ ПРОКАТ', 'Т', p1)] = { market: ask };
  return S.compare.versions(one([MAT, line(1, 'ТЕСТОВЫЙ ПРОКАТ', 'Т', q, p1)]), one([MAT, line(1, 'ТЕСТОВЫЙ ПРОКАТ', 'Т', q, p2)]), rq, {});
};
const s1 = steel(1e6, 1000.9, 1000);
check(rowsNamed(s1, 'ТЕСТОВЫЙ ПРОКАТ')[0].st === 'lowered' && Math.abs(s1.totals.unaskedDown - 0.9 * 1e6) < 1e-3,
  '0,9 sum less on a million tonnes is lowered by 0,9 × a million, not «unchanged» (' + s1.totals.unaskedDown + ')');
check(rowsNamed(steel(10, 12345.68, 12346), 'ТЕСТОВЫЙ ПРОКАТ')[0].st === 'same', 'a price rounded to the sum on a small quantity is unchanged');
check(rowsNamed(steel(1e6, 1100, 1000.9, 1000), 'ТЕСТОВЫЙ ПРОКАТ')[0].st === 'partial',
  'asked 1000, returned 1000,9 on a million: partial, the rest is 0,9 × a million');
check(rowsNamed(steel(100, 9000, 8929, 8928.57), 'ТЕСТОВЫЙ ПРОКАТ')[0].st === 'fixed',
  'our fractional price (8 928,57) typed as a whole number is fixed');
// a direct-cost total that does not follow its lines
const lines2 = (p) => [MAT, line(1, 'ТЕСТОВЫЙ ПРОКАТ', 'Т', 2, p), line(2, 'ТЕСТОВЫЙ ЛИСТ', 'Т', 1, 50)];
const direct = (r) => r.objects[0].amounts.find((x) => /ПРЯМЫЕ/.test(x.label1));
const t1 = S.compare.versions(one(lines2(100), 250), one(lines2(90), 250), {}, {});
check(direct(t1).st === 'typed' && t1.totals.amountFlags === 1, 'lines lowered by 20, «ИТОГО ПРЯМЫЕ» left at 250: not recalculated, flagged');
const t2 = S.compare.versions(one(lines2(100), 250), one(lines2(100), 260), {}, {});
check(direct(t2).st === 'typed' && t2.totals.amountFlags === 1, '«ИТОГО ПРЯМЫЕ» raised by 10 with nothing changed under it: flagged');
const t3 = S.compare.versions(one(lines2(100), 250), one(lines2(90), 230), {}, {});
check(direct(t3).st === 'amount' && t3.totals.amountFlags === 0, 'a total that follows its lines (250 → 230) is only a changed amount');
const wbT = S.readXlsx(S.compare.workbook(t1, {}));
check(wbT.sheets[2].rows.some((r) => r && r[7] && /Итог не пересчитан по строкам/.test(String(r[7].v))),
  'the sheet totals sheet says the total was not recalculated');

/* ------------------------------------------------ «Наш ответ» read carefully (D2) */

const rsm = S.smeta.parseWorkbook(replySmeta(), 'r.xlsx');
const rp2 = S.reply.parse(replyBook2());
check((rp2.sheets || []).join('|') === 'A|B' && rp2.entries.some((e) => e.sheet === 'B' && e.name === 'ТЕСТОВАЯ ТРУБА 120'),
  'every sheet with a table is read, and each line knows its sheet');
const rm2 = S.reply.match(rp2.entries, rsm);
check(!rm2.prices[k('ТЕСТОВАЯ ПРОВОЛОКА', 'КГ', 10)] && !rm2.prices[k('ТЕСТОВАЯ ПРОВОЛОКА', 'М', 10)] &&
  (rm2.ambiguous || []).length === 1 && rm2.ambiguous[0].units.join('/') === 'КГ/М',
  'a line without a unit, for a resource in КГ and in М, prices neither and is listed as not applied');
check(!rm2.prices[k('ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17)] && rm2.missing.some((e) => e.name === 'ТЕСТОВЫЙ АНКЕР М8'),
  'АНКЕР М8 never prices АНКЕР М5, however alike the names: it is not found');
check(!rm2.prices[k('ТЕСТОВАЯ ПЛИТА 4.1.1', 'ШТ', 40)] && rm2.missing.some((e) => e.name === 'ТЕСТОВАЯ ПЛИТА 4.11'),
  '«ПЛИТА 4.11» never prices ПЛИТА 4.1.1');
check(rm2.prices[k('ТЕСТОВАЯ ТРУБА 120', 'М', 9)] === 6 && rm2.missing.some((e) => e.name === 'ТЕСТОВАЯ ТРУБА 1 20'),
  '«ТРУБА 1 20» never prices ТРУБА 120; sheet B does (6)');
check(rm2.prices[k('ТЕСТОВЫЙ КАБЕЛЬ', 'М', 1234.5)] === 1000.25, 'numbers typed as text are read («1 234,50» → «1 000,25»)');
check((rm2.conflicts || []).length === 1 && rm2.conflicts[0].kept === 1000.25 && rm2.conflicts[0].entry.market === 1100,
  'the same line priced again differently: the first price stays, the second is listed');
check((rp2.unread || []).length === 1 && rp2.unread[0].name === 'ТЕСТОВЫЙ ЩЕБЕНЬ' && rp2.unread[0].text === '7 500 сум' &&
  rp2.unread[0].sheet === 'A', 'a price that cannot be read («7 500 сум») is listed, not dropped');
check(rm2.missing.length === 3 && rm2.missing.every((e) => e.sheet === 'A'), 'what is not found says which sheet it came from');
// lines answered without a price of our own — «-», «обоснов», or the note alone (equipment: «должна быть обоснована»):
// asked all the same, with the note and no price; a price written with figures («7 500 сум») is still a price not read
const rp3 = S.reply.parse({ sheets: [sheet('C', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'Цены по ПСД', 'Рыночные цены', 'Примечание'], [1, 2, 3, 4, 5, 6],
  ['Строительные материалы'],
  [1, 'ТЕСТОВАЯ ТРУБА 120', 'М', 9, 7, 'Пересмотреть стоимость ресурса'],
  [2, 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17, '-', 'По технологии не требуется'],
  [3, 'ТЕСТОВАЯ ПЛИТА 4.1.1', 'ШТ', 40, 'обоснов', 'Пересмотреть стоимость ресурса'],
  ['Оборудование'],
  [1, 'ТЕСТОВЫЙ КАБЕЛЬ', 'М', 1234.5, null, 'Стоимость ресурса должна быть обоснована'],
  [2, 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'М3', 9990, '7 500 сум', '']])] });
const notes3 = rp3.entries.filter((e) => e.market == null);
check(rp3.entries.length === 4 && notes3.length === 3 && notes3.map((e) => e.note).join(' | ') ===
  'По технологии не требуется | обоснов — Пересмотреть стоимость ресурса | Стоимость ресурса должна быть обоснована',
  'lines answered with «-», «обоснов» or a note alone are read: a note, no price (' + notes3.map((e) => e.name + ': ' + e.note).join('; ') + ')');
check(rp3.unread.length === 1 && rp3.unread[0].text === '7 500 сум', 'a price written with figures that is no number is still listed as not read');
const rm3 = S.reply.match(rp3.entries, rsm);
check(Object.keys(rm3.prices).length === 1 && rm3.prices[k('ТЕСТОВАЯ ТРУБА 120', 'М', 9)] === 7 && rm3.missing.length === 0,
  'only the priced line sets a price; every line is found');
check(['ТЕСТОВЫЙ АНКЕР М5|ШТ|17', 'ТЕСТОВАЯ ПЛИТА 4.1.1|ШТ|40', 'ТЕСТОВЫЙ КАБЕЛЬ|М|1234.5'].every((t) => {
  const [n, u, p] = t.split('|'); const r = rm3.requested[k(n, u, +p)]; return r && r.market == null && r.note;
}), 'the note lines are asked: «Сравнение версий» judges them as asked, not as changes nobody asked for');
check(S.compare.classify({ price: 17, qty: 4 }, { price: 17, qty: 4 }, rm3.requested[k('ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17)]) === 'note',
  'a note line left as it was is «примечание»');

// another expert's table: the units «МАШ-ЧАС» / «ЧЕЛ-ЧАС» for the smeta's «маш.-ч» / «чел.-ч»; a name written another way
// («… 99 КВТ /135 Л.С/» for «… 99 (135) кВт (л.с.)»), tied by «Цены по ПСД» — the smeta's price under another name; and a
// «%» line («Прочие затраты подрядчика | % | 17»), which is no resource
const rp4 = S.reply.parse({ sheets: [sheet('цены', [['СРАВНИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'Цены по ПСД', 'Среднерыночная стоимость', 'Примечание'], [1, 2, 3, 4, 5, 6],
  [1, 'ЗАТРАТЫ ТРУДА ТЕСТОВЫХ РАБОЧИХ', 'ЧЕЛ-ЧАС', 30, null, 'Рекомендуется принять согласно ШНК'],
  [2, 'ТЕСТОВЫЕ АВТОГРЕЙДЕРЫ СРЕДНЕГО ТИПА 99 КВТ /135 Л.С/', 'МАШ-ЧАС', 380, 327, 'Пересмотреть указанную цену'],
  [3, 'ТЕСТОВЫЕ АВТОГРЕЙДЕРЫ СРЕДНЕГО ТИПА 99 КВТ /135 Л.С/', 'МАШ-ЧАС', 410, 327, 'Пересмотреть указанную цену'],
  [4, 'Прочие затраты подрядчика', '%', 17, null, 'Рекомендуется принять согласно ШНК']])] });
check(rp4.entries.length === 3 && !rp4.entries.some((e) => e.unit === '%') && rp4.entries[1].psd === 380,
  'a «%» line is no resource; «Цены по ПСД» is read beside the line (' + rp4.entries.map((e) => e.name + ' ' + e.unit + ' ' + e.psd).join('; ') + ')');
const sm4 = [{ rows: [
  { kind: 'item', nm: 'Затраты труда тестовых рабочих', unit: 'чел.-ч', price: 30 },
  { kind: 'item', nm: 'Тестовые автогрейдеры среднего типа 99 (135) кВт (л.с.)', unit: 'маш.-ч', price: 380 },
  { kind: 'item', nm: 'Тестовые автогрейдеры среднего типа 99 (135) кВт (л.с.)', unit: 'маш.-ч', price: 395 }] }];
const rm4 = S.reply.match(rp4.entries, sm4);
const grK = S.resKey('Тестовые автогрейдеры среднего типа 99 (135) кВт (л.с.)', 'маш.-ч', 380);
check(rm4.prices[grK] === 327 && Object.keys(rm4.prices).length === 1,
  '«МАШ-ЧАС» is «маш.-ч», and the name written another way is found by its «Цены по ПСД» (380): that line only, not the one at 395');
check(rm4.requested[S.resKey('Затраты труда тестовых рабочих', 'чел.-ч', 30)] && rm4.missing.length === 1 && rm4.missing[0].psd === 410,
  '«ЧЕЛ-ЧАС» is «чел.-ч»; a line whose «Цены по ПСД» (410) is no price of the smeta is not put on the nearest name (' + rm4.missing.map((e) => e.name + ' ' + e.psd).join('; ') + ')');

// ПСД in a header is a price only when the header says price: «Наименование ресурсов по ПСД» is the name, «Ед.изм. по ПСД»
// the unit, «Кол-во по ПСД» no price at all — the «Цены по ПСД» beside it is
const e5a = S.reply.parse({ sheets: [sheet('A', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурсов по ПСД', 'Ед.изм.', 'Сметная цена', 'Рыночная цена', 'Примечание'],
  [1, 'ТЕСТОВАЯ ТРУБА 120', 'М', 9, 7, 'Пересмотреть стоимость ресурса']])] });
check(e5a.sheets.length === 1 && e5a.entries.length === 1 && e5a.entries[0].name === 'ТЕСТОВАЯ ТРУБА 120' && e5a.entries[0].price === 9,
  '«Наименование ресурсов по ПСД» is the name column: the table is read (' + JSON.stringify(e5a.cols) + ')');
const e5b = S.reply.parse({ sheets: [sheet('B', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм. по ПСД', 'Кол-во по ПСД', 'Цены по ПСД', 'Рыночная цена', 'Примечание'],
  [1, 'ТЕСТОВАЯ ТРУБА 120', 'М', 100, 9, 7, 'Пересмотреть стоимость ресурса']])] });
check(e5b.entries.length === 1 && e5b.entries[0].unit === 'М' && e5b.entries[0].psd === 9,
  '«Ед.изм. по ПСД» is the unit, and «Цены по ПСД» the price beside the line, not «Кол-во по ПСД» (' + JSON.stringify(e5b.cols) + ')');
// «Цена за ед. изм. по ПСД» is the price, not the unit (it says «ед. изм.» too); «По ПСД» alone, the lower row of a
// two-row header, is the price as well
const e5c = S.reply.parse({ sheets: [sheet('B2', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'Цена за ед. изм. по ПСД', 'Рыночная цена', 'Примечание'],
  [1, 'ТЕСТОВАЯ ТРУБА 120', 'М', 9, 7, 'Пересмотреть стоимость ресурса']])] });
const e5d = S.reply.parse({ sheets: [sheet('B3', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], ['', '', '', 'Цена', ''],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'По ПСД', 'Рыночная', 'Примечание'],
  [1, 'ТЕСТОВАЯ ТРУБА 120', 'М', 9, 7, 'Пересмотреть стоимость ресурса']])] });
check(e5c.cols && e5c.cols.psd === 4 && e5c.cols.unit === 3 && e5c.entries[0].unit === 'М' && e5c.entries[0].psd === 9 &&
  e5d.cols && e5d.cols.psd === 4 && e5d.entries[0].psd === 9,
  '«Цена за ед. изм. по ПСД» is the price and «Ед.изм.» the unit; «По ПСД» alone is the price (' +
  JSON.stringify(e5c.cols) + ' ' + JSON.stringify(e5d.cols) + ')');

// a line answered with a bare dash and no note is a line answered without a price, like «-» with a note: asked, not
// a price that could not be read. The third line holds two minus signs (U+2212, what Excel writes for a typed minus)
const e6minus = String.fromCharCode(0x2212);
const e6 = S.reply.parse({ sheets: [sheet('C', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'Цены по ПСД', 'Рыночные цены', 'Примечание'],
  [1, 'ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17, '-', ''],
  [2, 'ТЕСТОВАЯ ПЛИТА 4.1.1', 'ШТ', 40, '—', null],
  [3, 'ТЕСТОВЫЙ КАБЕЛЬ', 'М', 30, e6minus + ' ' + e6minus, '']])] });
check(e6.entries.length === 3 && e6.entries.every((e) => e.market == null && e.note) && e6.unread.length === 0,
  'a bare «-», «—» or two minus signs with no note is read: a line asked, no price; nothing listed as not read (' + e6.unread.map((u) => u.name + ': ' + u.text).join('; ') + ')');
const e6m = S.reply.match(e6.entries, rsm);
check(e6m.missing.length === 0 && Object.keys(e6m.prices).length === 0 &&
  S.compare.classify({ price: 17, qty: 4 }, { price: 17, qty: 4 }, e6m.requested[k('ТЕСТОВЫЙ АНКЕР М5', 'ШТ', 17)]) === 'note',
  'the bare-dash line is asked, sets no price, and a line left as it was is «примечание»');

// a name written differently is put on a resource only when nothing else could be meant: by the table's own price at
// similarity 0.9 (0.8 is for «Цены по ПСД» only), never on one of two names as close, and below 0.9 never with a rival
const e7sm = [{ rows: [
  { kind: 'item', nm: 'ТЕСТОВАЯ ГРУНТОВКА ПЕНТАФТАЛЕВАЯ', unit: 'КГ', price: 50 },
  { kind: 'item', nm: 'ТЕСТОВАЯ ГРУНТОВКА ПЕНТАФТАЛЕВАЯ', unit: 'КГ', price: 50.3 },
  { kind: 'item', nm: 'ТЕСТОВАЯ ЭМАЛЬ ПЕНТАФТАЛЕВАЯ', unit: 'КГ', price: 60 },
  { kind: 'item', nm: 'ТЕСТОВАЯ ЭМАЛЬ ГЛИФТАЛЕВАЯ БЕЛАЯ', unit: 'КГ', price: 60 },
  { kind: 'item', nm: 'ТЕСТОВЫЙ БРУС А', unit: 'М3', price: 70 },
  { kind: 'item', nm: 'ТЕСТОВЫЙ БРУС Б', unit: 'М3', price: 70 }] }];
const e7own = S.reply.parse({ sheets: [sheet('D', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'Сметная цена', 'Рыночная цена', 'Примечание'],
  [1, 'ТЕСТОВАЯ ГРУНТОВКА ГЛИФТАЛЕВАЯ', 'КГ', 50, 40, 'Пересмотреть стоимость ресурса'],
  [2, 'ТЕСТОВЫЙ БРУС', 'М3', 70, 55, 'Пересмотреть стоимость ресурса']])] });
const e7m = S.reply.match(e7own.entries, e7sm);
check(Object.keys(e7m.prices).length === 0 && e7m.missing.length === 2,
  'by the table\'s own price: «ГРУНТОВКА ГЛИФТАЛЕВАЯ» (0.84) is not put on «ГРУНТОВКА ПЕНТАФТАЛЕВАЯ», «БРУС» not on «БРУС А» or «БРУС Б» (' +
  Object.keys(e7m.prices).join('; ') + ')');
const e7psd = S.reply.parse({ sheets: [sheet('E', [['СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №2'], [],
  ['№ п/п', 'Наименование ресурса', 'Ед.изм.', 'Цены по ПСД', 'Рыночная цена', 'Примечание'],
  [1, 'ТЕСТОВАЯ ЭМАЛЬ ГЛИФТАЛЕВАЯ', 'КГ', 60, 45, 'Пересмотреть стоимость ресурса']])] });
const e7pm = S.reply.match(e7psd.entries, e7sm);
check(Object.keys(e7pm.prices).length === 0 && e7pm.missing.length === 1,
  'by «Цены по ПСД»: «ЭМАЛЬ ГЛИФТАЛЕВАЯ» is near both «ЭМАЛЬ ПЕНТАФТАЛЕВАЯ» (0.82) and «ЭМАЛЬ ГЛИФТАЛЕВАЯ БЕЛАЯ» (0.81): neither (' +
  Object.keys(e7pm.prices).join('; ') + ')');
// one name at two prices that differ by rounding is one resource, not a rival of itself: a name written differently is
// put on both its keys — by the table's own price at 0.96, and by «Цены по ПСД» at 0.84 (ГРУНТОВКА at 50 and 50.3) — and
// with no unit, a name the smeta has in М and in КМ is `ambiguous`, not a guess and not «не найдено»
const e7two = [{ rows: [
  { kind: 'item', nm: 'ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИЙ', unit: 'М', price: 1234.5678 },
  { kind: 'item', nm: 'ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИЙ', unit: 'М', price: 1234.6 },
  { kind: 'item', nm: 'ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИЙ', unit: 'КМ', price: 70 },
  { kind: 'item', nm: 'ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИЙ', unit: 'М', price: 70 }] }];
const e7tm = S.reply.match([{ name: 'ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИ', unit: 'М', price: 1235, psd: null, market: 900, note: '' },
  { name: 'ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИ', unit: '', price: 70, psd: null, market: 50, note: '' }], e7two);
const e7tp = S.reply.match([{ name: 'ТЕСТОВАЯ ГРУНТОВКА ГЛИФТАЛЕВАЯ', unit: 'КГ', price: null, psd: 50, market: 40, note: '' }], e7sm);
check(e7tm.prices[k('ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИЙ', 'М', 1234.5678)] === 900 && e7tm.prices[k('ТЕСТОВЫЙ ПРОВОД МЕДНЫЙ ГИБКИЙ', 'М', 1234.6)] === 900 &&
  Object.keys(e7tm.prices).length === 2 && e7tm.ambiguous.length === 1 && e7tm.missing.length === 0 &&
  e7tp.prices[k('ТЕСТОВАЯ ГРУНТОВКА ПЕНТАФТАЛЕВАЯ', 'КГ', 50)] === 40 && e7tp.prices[k('ТЕСТОВАЯ ГРУНТОВКА ПЕНТАФТАЛЕВАЯ', 'КГ', 50.3)] === 40 &&
  e7tp.missing.length === 0,
  'one name at two prices is no rival of itself: priced on both keys (own price, «Цены по ПСД»); with no unit, `ambiguous` (' +
  Object.keys(e7tm.prices).concat(Object.keys(e7tp.prices)).join('; ') + ' | ambiguous ' + e7tm.ambiguous.length + ', missing ' +
  (e7tm.missing.length + e7tp.missing.length) + ')');

// a haulage line written in the table as the sheet writes it («Асфальт - 11 км»): the reader names a line under a haulage
// band «Перевозка …», so the name alone did not find it and the line was «не найдено»; a material of the same name in
// another unit stays the material
const e8sm = [{ rows: [
  { kind: 'item', nm: 'Перевозка ТЕСТОВЫЙ АСФАЛЬТ - 11 км', unit: 'тн/км', price: 1337 },
  { kind: 'item', nm: 'ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', unit: 'М3', price: 120 },
  { kind: 'item', nm: 'Перевозка ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', unit: 'тн/км', price: 1419 }] }];
const e8m = S.reply.match([
  { name: 'ТЕСТОВЫЙ АСФАЛЬТ - 11 км', unit: 'тн/км', price: null, psd: 1337, market: 965, note: '' },
  { name: 'ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', unit: 'тн/км', price: null, psd: 1419, market: 985, note: '' },
  { name: 'ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', unit: 'М3', price: 120, psd: null, market: 100, note: '' }], e8sm);
check(e8m.missing.length === 0 && e8m.prices[k('Перевозка ТЕСТОВЫЙ АСФАЛЬТ - 11 км', 'тн/км', 1337)] === 965 &&
  e8m.prices[k('Перевозка ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', 'тн/км', 1419)] === 985 && e8m.prices[k('ТЕСТОВЫЙ ЩЕБЕНЬ - 5 км', 'М3', 120)] === 100 &&
  Object.keys(e8m.prices).length === 3,
  'a haulage line named without «Перевозка» is put on the haulage line; the material of that name stays the material (' +
  Object.keys(e8m.prices).join('; ') + ' | missing ' + e8m.missing.length + ')');

// our own export of two projects: one report sheet each, both read back
const proj2 = S.smeta.parseWorkbook(replySmeta(), 'r.xlsx');
const p2 = Object.assign({}, rm.prices);
p2[k('ТЕСТОВАЯ ТРУБА 120', 'М', 9)] = 6;
p2[k('ТЕСТОВЫЙ КАБЕЛЬ', 'М', 1234.5)] = 1000.25;
const twoModel = S.assemble([{ id: 'p1', name: 'T1', title: 'T1', objects: v1, enabled: true },
  { id: 'p2', name: 'T2', title: 'T2', objects: proj2, enabled: true }], p2);
const twoBack = S.reply.parse(S.readXlsx(S.buildWorkbook(twoModel, { mode: 'changed', minDiff: 0, autoNote: true, noteText: 'X' })));
const twoM = S.reply.match(twoBack.entries, v1.concat(proj2));
check(twoModel.spans.length === 2 && (twoBack.sheets || []).length === 2 && Object.keys(p2).every((kk) => twoM.prices[kk] === p2[kk]),
  'our own export of two projects read back gives the prices of both report sheets (' + (twoBack.sheets || []).join('|') + ')');
check((twoBack.unread || []).length === 0 && twoM.missing.length === 0 && (twoM.conflicts || []).length === 0,
  'and its header rows are not taken for prices that cannot be read');

// «did we ask» exactly as the table: a price less than a sum below the estimate's, on a large quantity, is a line of
// the table, so it is a request — kept by requested(), judged as one, and read back from our reply
const bigQ = 50 * 1000, bigP = 2345.67, bigM = 2345;
const bigV1 = one([MAT, line(1, 'ТЕСТОВЫЙ ПРОКАТ', 'Т', bigQ, bigP)]);
const bigKey = k('ТЕСТОВЫЙ ПРОКАТ', 'Т', bigP), bigPrices = {}; bigPrices[bigKey] = bigM;
const bigModel = S.assemble([{ id: 'p1', name: 'T', title: 'T', objects: bigV1, enabled: true }], bigPrices);
const bigReq = S.compare.requested(bigModel, { mode: 'changed', minDiff: 1 });
check(bigReq[bigKey] && bigReq[bigKey].market === bigM, 'a small price change on a large quantity is a request, as the table has it');
const cl = (p2) => S.compare.classify({ price: bigP, qty: bigQ }, { price: p2, qty: bigQ }, { market: bigM });
check(cl(bigP) === 'notfixed' && cl(bigM) === 'fixed' && cl(bigM - 5) === 'fixed',
  'left as it was it is «не исправлено», at our price it is «исправлено» (' + [cl(bigP), cl(bigM)].join(', ') + ')');
const bigBack = S.reply.parse(S.readXlsx(S.buildWorkbook(bigModel, { mode: 'changed', minDiff: 1 })));
const bigRm = S.reply.match(bigBack.entries, bigV1);
check(bigRm.prices[bigKey] === bigM && bigRm.requested[bigKey] && bigRm.requested[bigKey].market === bigM,
  'and our own export read back as the reply gives that price back');

/* ------------------------------------------------ an application of several estimates, corrected files chosen together */
{
  // two estimates of one application whose sheets have the same name and title (both «РЕСУРС», as the road and the
  // lighting of one application came), and their corrected files chosen in the other order
  const est = (rows) => S.smeta.parseWorkbook({ sheets: [sheet('РЕСУРС', [[null, null, null, null, null, 'Форма 4А АВС-4'],
    ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...estimate('ТЕСТОВЫЕ РАБОТЫ', rows, { direct: 1 })])] }, 'x.xlsx');
  const MAT = [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'];
  const road = (p) => est([MAT, line(1, 'ТЕСТОВЫЙ АСФАЛЬТ', 'Т', 10, p), line(2, 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'М3', 5, 7), line(3, 'ТЕСТОВЫЙ БИТУМ', 'Т', 1, 13)]);
  const lamp = (p) => est([MAT, line(1, 'ТЕСТОВАЯ ОПОРА', 'ШТ', 4, p), line(2, 'ТЕСТОВЫЙ КАБЕЛЬ', 'М', 100, 3), line(3, 'ТЕСТОВЫЙ СВЕТИЛЬНИК', 'ШТ', 4, 19)]);
  const olds = [{ label: 'дорога.xlsx', objects: road(11) }, { label: 'освещение.xlsx', objects: lamp(23) }];
  const news = [{ label: 'освещение-испр.xlsx', objects: lamp(21) }, { label: 'дорога-испр.xlsx', objects: road(9) }];
  const j = S.compare.join(olds, news);
  check(j.to.join() === '1,0', 'several corrected files: each is paired with its own estimate by the lines they share, in whatever order chosen (' + j.to.join() + ')');
  const res = S.compare.versions(j.olds, j.news, {}, {});
  const all = [].concat(...res.objects.map((o) => o.rows));
  check(res.objects.length === 2 && res.objects.every((o) => !o.only) && res.objects[0].name.startsWith('дорога.xlsx · ') && res.objects[1].name.startsWith('освещение.xlsx · '),
    'their two sheets called «РЕСУРС» are each compared with their own, and say which estimate they are (' + res.objects.map((o) => o.name + (o.only ? ' [' + o.only + ']' : '')).join(' | ') + ')');
  check(all.find((r) => r.nm === 'ТЕСТОВЫЙ АСФАЛЬТ').p2 === 9 && all.find((r) => r.nm === 'ТЕСТОВАЯ ОПОРА').p2 === 21 && !all.some((r) => r.st === 'added' || r.st === 'removed'),
    'every line is found in its corrected file: the two price changes, nothing «added» or «deleted»');
  const crossed = S.compare.versions([].concat(olds[0].objects, olds[1].objects), [].concat(news[0].objects, news[1].objects), {}, {});
  check([].concat(...crossed.objects.map((o) => o.rows)).some((r) => r.moved || r.st === 'added' || r.st === 'removed'),
    '(the sheets put together without the pairing of files are crossed: the road against the lighting, its lines «moved» from the other estimate)');
  const stray = S.compare.join(olds, [news[1], { label: 'чужая.xlsx', objects: est([MAT, line(1, 'ТЕСТОВЫЙ КИРПИЧ', 'ШТ', 100, 2), line(2, 'ТЕСТОВЫЙ РАСТВОР', 'М3', 1, 31)]) }]);
  const sres = S.compare.versions(stray.olds, stray.news, {}, {});
  check(stray.to.join() === '0,-1' && sres.objects.filter((o) => o.only).length === 2,
    'a file sharing nothing with the estimates is none of them: its sheet, and the estimate left without a file, stand without a pair (' + stray.to.join() + ')');
  const one = S.compare.join([olds[0]], [news[1]]);
  check(one.olds === olds[0].objects && one.news === news[1].objects && !one.olds[0].group, 'one file on each side is compared exactly as before: nothing is marked');

  // estimates of one road listing the very same resources (four alike in one application). The lines alone tie, and
  // the files chosen in another order were paired by that order: the 15th compared with the 8th, its quantities «raised»
  const twin = (q, p) => est([MAT, line(1, 'ТЕСТОВЫЙ АСФАЛЬТ', 'Т', q, p), line(2, 'ТЕСТОВЫЙ ЩЕБЕНЬ', 'М3', q * 2, 7), line(3, 'ТЕСТОВЫЙ БИТУМ', 'Т', q / 10, 13)]);
  const NS = [15, 14, 11, 8], ORDER = [8, 15, 14, 11];
  const who = (j, olds) => j.to.map((i) => (i < 0 ? '-' : olds[i].n)).join();
  // by name (the same file sent back; «_» and «-» for « » do not matter) — even with the contents all alike
  const nOld = NS.map((n) => ({ n, label: n + '_Смета_10V0' + n + '_АЙ_68_96_КМ.xls', objects: twin(3, 11) }));
  const nNew = ORDER.map((n) => ({ label: n + ' Смета 10V0' + n + ' АЙ 68-96 КМ.xls', objects: twin(3, 9) }));
  const jn = S.compare.join(nOld, nNew);
  check(who(jn, nOld) === ORDER.join(), 'corrected files of estimates alike are paired by their names first, in whatever order chosen (' + who(jn, nOld) + ')');
  // names that say nothing: by the quantities (a correction of prices leaves them as they were)
  const qOld = NS.map((n) => ({ n, label: 'смета ' + n + '.xls', objects: twin(n, 11) }));
  const qNew = ORDER.map((n, i) => ({ label: 'исправленная ' + 'абвг'[i] + '.xls', objects: twin(n, 9) }));
  const jq = S.compare.join(qOld, qNew);
  check(who(jq, qOld) === ORDER.join(), 'names that differ: the lines alike, paired by their quantities (' + who(jq, qOld) + ')');
  const rq = S.compare.versions(jq.olds, jq.news, {}, {});
  check(!rq.totals.counts.qtyup && !rq.totals.counts.qtydown && !rq.totals.unaskedUp, 'and no quantity is «raised» or «lowered»: only the prices changed');
  // all alike, quantities too: by the nearer name
  const sOld = NS.map((n) => ({ n, label: n + ' Смета 10V0' + n + '.xls', objects: twin(3, 11) }));
  const sNew = ORDER.map((n) => ({ label: n + ' Смета 10V0' + n + ' испр.xls', objects: twin(3, 9) }));
  const js = S.compare.join(sOld, sNew);
  check(who(js, sOld) === ORDER.join(), 'contents alike and names not the same: by the nearer name (' + who(js, sOld) + ')');
  // the sender returned one corrected file of two estimates: the other estimate stands as it was — not «deleted»
  const half = S.compare.join(olds, [news[1]], true);
  const hres = S.compare.versions(half.olds, half.news, {}, {});
  const hall = [].concat(...hres.objects.map((o) => o.rows));
  check(half.to.join() === '0' && half.alone.join() === '1' && half.how.join() === 'lines' && hres.objects.every((o) => !o.only) &&
    !hall.some((r) => r.st === 'removed' || r.st === 'added') && hall.find((r) => r.nm === 'ТЕСТОВАЯ ОПОРА').p2 === 23,
    'an estimate without a corrected file stands unchanged beside the one that came back: nothing «deleted» (alone ' + half.alone.join() + ')');
  check(S.compare.join(olds, [news[1]]).news.length < half.news.length && !S.compare.join(olds, [{ label: 'чужая.xlsx', objects: est([MAT, line(1, 'ТЕСТОВЫЙ КИРПИЧ', 'ШТ', 100, 2)]) }], true).alone.length,
    '(only when asked, and only when some file found its estimate)');
  check(jn.how.every((h) => h === 'name') && jq.how.every((h) => h === 'lines'), 'and each pair says how it was made: by the name, or by the lines');
  // one corrected file against the estimate chosen as «Было»: the estimate it is nearer to is found, to be said
  check(S.compare.nearer(olds, news[0], 0) === 1 && S.compare.nearer(olds, news[0], 1) === -1 && S.compare.nearer(olds, news[1], 0) === -1 &&
    S.compare.nearer(nOld, nNew[0], 0) === -1,
    'a corrected file nearer to another estimate than the chosen one is found; estimates alike are no reason to say so');
  check(S.compare.fileKey('2_Смета_D020_АЙ_68_96_КМ (1).XLS') === S.compare.fileKey('2 смета d020 ай 68-96 км.xls') &&
    S.compare.fileKey('АНКЕР М5.xls') !== S.compare.fileKey('АНКЕР М8.xls') && S.compare.fileKey('4.1.1.xls') !== S.compare.fileKey('4.11.xls'),
    'a file\'s name as a key: case, separators, the extension and a copy\'s «(1)» do not matter; its digits do');
}

/* ------------------------------------------------ a summary file that copies the estimates of the application */
{
  const est = (rows) => S.smeta.parseWorkbook({ sheets: [sheet('РЕСУРС', [[null, null, null, null, null, 'Форма 4А АВС-4'],
    ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...estimate('ТЕСТОВЫЕ РАБОТЫ', rows, { direct: 1 })])] }, 'x.xlsx');
  const MAT = [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'];
  const roadRows = [MAT, ...[1, 2, 3, 4, 5, 6].map((i) => line(i, 'ТЕСТОВЫЙ ДОРОЖНЫЙ МАТЕРИАЛ ' + i, 'Т', i, 10 + i))];
  const lampRows = [MAT, ...[1, 2, 3, 4, 5].map((i) => line(i, 'ТЕСТОВОЕ ИЗДЕЛИЕ ОСВЕЩЕНИЯ ' + i, 'ШТ', i, 20 + i))];
  const proj = (file, objects) => ({ file, objects, enabled: true });
  const road = proj('дорога.xlsx', est(roadRows)), lamp = proj('освещение.xlsx', est(lampRows));
  // the «ОБЩИЙ ИТОГ» book: one visible sheet with both estimates on it, the haulage lines left out of the copy
  const sum = proj('ОБЩИЙ ИТОГ.xlsx', est([...roadRows.slice(0, 6), ...lampRows]));
  const cp = S.copiesOf([road, lamp, sum]);
  check(cp.length === 1 && cp[0].i === 2 && cp[0].of.join() === '0,1', 'a summary book that repeats the estimates line by line is found as their copy (' + JSON.stringify(cp) + ')');
  const twice = S.assemble([road, lamp, sum], {}), once = S.assemble([road, lamp, Object.assign({}, sum, { enabled: false })], {});
  const q = (m) => m.resources.find((r) => r.name === 'ТЕСТОВОЕ ИЗДЕЛИЕ ОСВЕЩЕНИЯ 3').qty;
  check(q(twice) === 6 && q(once) === 3, 'with it on, a resource is counted twice (' + q(twice) + '); switched off, once (' + q(once) + ')');
  check(!S.copiesOf([road, lamp]).length && !S.copiesOf([road, proj('дорога-2.xlsx', est(roadRows))]).length,
    'estimates of their own are no copies; nor is a second version of one estimate — one file is for the person to choose');
}

/* ------------------------------------------------ one estimate twice among the estimates of an application */
{
  const est = (rows) => S.smeta.parseWorkbook({ sheets: [sheet('РЕСУРС', [[null, null, null, null, null, 'Форма 4А АВС-4'],
    ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...estimate('ТЕСТОВЫЕ РАБОТЫ', rows, { direct: 1 })])] }, 'x.xlsx');
  const MAT = [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'];
  const rowsOf = (q, p) => [MAT, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => line(i, 'ТЕСТОВЫЙ МАТЕРИАЛ ' + i, 'Т', q(i), p(i)))];
  const proj = (file, objects, title) => ({ file, objects, title: title == null ? 'ТЕСТОВАЯ СТРОЙКА' : title, enabled: true });
  const road = proj('дорога.xls', est(rowsOf((i) => i, (i) => 10 + i)));
  // the sender's corrected file: the same lines and quantities, two prices lowered
  const fixed = proj('дорога-испр.xls', est(rowsOf((i) => i, (i) => (i <= 2 ? 5 + i : 10 + i))));
  const same = proj('дорога (копия).xls', est(rowsOf((i) => i, (i) => 10 + i)));
  const other = proj('мост.xls', est(rowsOf((i) => i * 3, (i) => 10 + i)));          // the same resources, quantities of its own
  const v = S.versionsOf([road, other, fixed]);
  check(v.length === 1 && v[0].i === 2 && v[0].of === 0 && v[0].prices === 2,
    'a corrected file among the estimates is found as another version of its estimate, with its lines at another price (' + JSON.stringify(v) + ')');
  const c = S.versionsOf([road, same]);
  check(c.length === 1 && c[0].i === 1 && c[0].prices === 0, 'the same file under another name: a repeat, no line at another price (' + JSON.stringify(c) + ')');
  check(!S.versionsOf([road, other]).length, 'two estimates of the same resources with quantities of their own are no versions');
  check(!S.versionsOf([road, proj('дорога-2.xls', same.objects, 'ДРУГОЙ ОБЪЕКТ')]).length, 'nor two alike estimates of objects named otherwise');
  const small = (p) => proj('малая.xls', est([MAT, ...[1, 2, 3].map((i) => line(i, 'ТЕСТОВЫЙ МАТЕРИАЛ ' + i, 'Т', i, p))]));
  check(!S.versionsOf([small(5), small(6)]).length, 'nor two estimates of a few lines');
  const three = S.versionsOf([road, fixed, same]);
  check(three.filter((x) => x.i === 2).map((x) => x.of + ':' + x.prices).join() === '1:2,0:0',
    'every earlier estimate it repeats is named, the nearest first (' + JSON.stringify(three) + ')');
}

/* ------------------------------------------------ a volume cut beside the prices is no sign of files paired wrong */
{
  const est = (rows) => S.smeta.parseWorkbook({ sheets: [sheet('РЕСУРС', [[null, null, null, null, null, 'Форма 4А АВС-4'],
    ['Наименование стройки -', null, 'ТЕСТОВАЯ СТРОЙКА'], [], ...estimate('ТЕСТОВЫЕ РАБОТЫ', rows, { direct: 1 })])] }, 'x.xlsx');
  const MAT = [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'];
  const was = est([MAT, line(1, 'ТЕСТОВЫЙ БЕТОН', 'М3', 10, 100)]);
  const now = est([MAT, line(1, 'ТЕСТОВЫЙ БЕТОН', 'М3', 4, 90)]);               // our price, and the volume cut to 4
  const key = S.resKey('ТЕСТОВЫЙ БЕТОН', 'М3', 100);
  const req = {}; req[key] = { market: 90 };
  const T = S.compare.versions(was, now, req, {}).totals;
  check(T.askedSaving === 100 && T.gotSaving === 640 && T.gotPrice === 100,
    'the saving by the price is told apart from the one a smaller volume makes (asked ' + T.askedSaving + ', got ' + T.gotSaving + ', by the price ' + T.gotPrice + ')');
}

/* ------------------------------------------------ our own Таблица №2 is not an estimate */
{
  const m = S.assemble([{ id: 'p1', name: 'T', title: 'T', objects: v1, enabled: true }], {});
  const ours = S.readXlsx(S.buildWorkbook(m, { mode: 'all' }));
  check(S.isTable2(ours) && S.smeta.parseWorkbook(ours, 'x.xlsx').length > 0,
    'the document this program writes reads as an estimate — and is known for our own Таблица №2');
  const t2 = sheet('цены', [['СРАВНИТЕЛЬНАЯ ТАБЛИЦА №2'], ['№', 'Наименование', 'Ед. изм.', 'Цена по смете', 'Рыночная цена'], [1, 'ТЕСТОВЫЙ КРАН 10 Т', 'МАШ.-Ч', 13, 11]]);
  check(S.isTable2({ sheets: [t2] }) && S.isTable2({ sheets: [t2, sheet('объем', [['объёмы']])] }) && !S.isTable2(book(1)) &&
    !S.isTable2({ sheets: [...book(1).sheets, ...book(2).sheets, t2] }),
    'so is a reply under its Russian title; an estimate is not, nor an estimate book with one comparison sheet among its own');
}

console.log(fail ? '\nFAILED: ' + fail : '\nall compare checks passed');
process.exit(fail ? 1 : 0);
