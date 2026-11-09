/*
 * «Сравнение версий»: the first smeta, the smeta the sender returned after our comparison
 * table, and what the table asked for. Every status, the pairing of lines when the sender
 * inserted or deleted one, what counts as «asked» (the report's own mode and threshold), and
 * the .xlsx of the comparison.
 *
 * Both versions are invented and tiny (names, numbers and prices), built as the parser sees a
 * sheet, so no real estimate or price is needed.
 *
 *   node test/compare.cjs
 */
'use strict';
const { load } = require('./load.cjs');

const S = load('fflate', 'normalize', 'match', 'sections', 'util', 'formula', 'xlsx-read', 'xlsx-write',
  'smeta', 'assemble', 'report', 'compare');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const { book, prices: pricesFor, xlsx } = require('./compare-books.cjs');

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
check(names.join('|') === 'По ресурсам|По строкам', 'the comparison workbook has its two sheets (' + names.join('|') + ')');
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

console.log(fail ? '\nFAILED: ' + fail : '\nall compare checks passed');
process.exit(fail ? 1 : 0);
