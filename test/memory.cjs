/*
 * The memory of finished applications (src/lib/memory.js), on invented rows: which earlier prices are offered and in
 * which order, and when prices that were left alone become a ceiling.
 *
 *   node test/memory.cjs
 */
'use strict';
const { load } = require('./load.cjs');
const S = load('normalize', 'memory');
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const TODAY = '2031-06-15';
let n = 0;
const row = (o) => Object.assign({ id: 'r' + (++n), workspace: 'w' + n, contragent: 'A', kind: 'corrected', source: 'typed', smeta_price: 120, final_price: 100,
  finished: '2031-05-01T10:00:00.000Z', accepted: false }, o);
const rank = (rows, contragent) => S.memory.rank(rows, { contragent: contragent === undefined ? 'A' : contragent, today: TODAY });
const ids = (r) => r.prices.map((p) => p.row.id);

/* ------------------------------------------------------------- corrected prices: what is offered, in which order */
const own = row({ id: 'own', contragent: 'A', final_price: 90, finished: '2031-03-01' });
const ownNew = row({ id: 'ownNew', contragent: 'A', final_price: 95, finished: '2031-05-20' });
const other = row({ id: 'other', contragent: 'B', final_price: 80, finished: '2031-06-01' });
const otherAcc = row({ id: 'otherAcc', contragent: 'C', final_price: 85, finished: '2031-01-10', accepted: true });
let r = rank([other, own, otherAcc, ownNew]);
check(ids(r).join() === 'ownNew,own,otherAcc,other', 'the same contragent first (newest first), then the others — one the contractor took before a newer one (' + ids(r).join() + ')');
check(r.prices[0].cls === 1 && r.prices[2].cls === 2 && r.prices[2].accepted, 'each line says its class and whether it was accepted');
r = rank([own, row({ id: 'ownAcc', contragent: 'A', final_price: 70, finished: '2030-12-01', accepted: true })]);
check(ids(r).join() === 'ownAcc,own', 'inside a class an accepted price comes before a newer one');
r = rank([row({ id: 'pct', source: 'pct' }), row({ id: 'zero', kind: 'zeroed', final_price: 0 }), row({ id: 'zero2', final_price: 0 }),
  row({ id: 'old', finished: '2029-05-01' }), row({ id: 'nodate', finished: '' }), row({ id: 'ok', source: 'ref:p:1' })]);
check(ids(r).join() === 'ok', 'never offered: a price «Применить %» set, a price of 0, a price older than two years, a row without a date');
r = rank([row({ id: 'v1', workspace: 'same', final_price: 50 }), row({ id: 'v2', workspace: 'same', final_price: 50 }), row({ id: 'v3', workspace: 'same', final_price: 60 })]);
check(r.prices.length === 2, 'variants of one name in one application give one line per price (' + r.prices.length + ')');
r = rank([row({ id: 'x', contragent: 'B' })], '');
check(r.prices[0].cls === 2, 'an application without a contragent has no «own» prices');

/* ------------------------------------------------------------- left alone: a ceiling only when independent applications agree */
const left = (o) => row(Object.assign({ kind: 'untouched', source: '', final_price: 100, smeta_price: 100 }, o));
const marked = (o) => left(Object.assign({ kind: 'checked', source: 'mark' }, o));
check(rank([marked({ contragent: 'B' })]).ceiling === null, 'one application, even marked, is no ceiling');
check(rank([marked({ contragent: 'A' }), marked({ contragent: 'A' }), marked({ contragent: 'A' })]).ceiling === null,
  'a contragent\'s own price left alone, however often, never confirms itself');
check(rank([marked({ contragent: 'B' }), marked({ contragent: 'B' })]).ceiling === null, 'nor does another contragent repeated: independent means different contragents');
r = rank([marked({ contragent: 'A', final_price: 110 }), marked({ contragent: 'B', final_price: 100 })]);
check(r.ceiling && r.ceiling.price === 100 && r.ceiling.apps === 2, 'its own and another\'s: a ceiling, at the price both accepted (the lower of the two)');
r = rank([marked({ contragent: 'B', final_price: 130 }), marked({ contragent: 'C', final_price: 120 }), marked({ contragent: 'D', final_price: 90 })]);
check(r.ceiling.price === 120, 'the highest price two independent applications accepted at or above (' + r.ceiling.price + ')');
check(rank([left({ contragent: 'B' }), left({ contragent: 'C' })]).ceiling === null, 'two prices merely left weigh too little');
check(rank([left({ contragent: 'B' }), left({ contragent: 'C' }), left({ contragent: 'D' })]).ceiling.apps === 3 &&
  rank([left({ contragent: 'B', finished: '2030-11-15' }), left({ contragent: 'C', finished: '2030-11-15' }), left({ contragent: 'D', finished: '2030-11-15' })]).ceiling === null,
  'three left make one while fresh; seven months old they no longer do (the weight falls with age)');
r = rank([marked({ contragent: 'B', finished: TODAY }), left({ contragent: 'C', finished: TODAY })]);
check(r.ceiling && Math.abs(r.ceiling.weight - 1.5) < 1e-9, 'one marked and one left are enough');
check(rank([marked({ contragent: 'B', finished: '2030-06-01' }), marked({ contragent: 'C', finished: '2030-06-10' })]).ceiling === null, 'older than twelve months: no ceiling');
check(rank([marked({ contragent: 'B', finished: '2030-10-15' }), marked({ contragent: 'C', finished: '2030-10-15' })]).ceiling === null &&
  rank([marked({ contragent: 'B', finished: '2030-11-15' }), marked({ contragent: 'C', finished: '2030-11-15' })]).ceiling !== null,
  'two marked eight months old no longer weigh enough; seven months old they still do');
check(S.memory.ageFactor(0) === 1 && S.memory.ageFactor(6) === 1 && Math.abs(S.memory.ageFactor(9) - 0.5) < 1e-9 && S.memory.ageFactor(12) === 0 && S.memory.ageFactor(30) === 0,
  'the weight of age: whole for six months, half at nine, nothing from twelve');
r = rank([marked({ contragent: 'B', workspace: 'wb', final_price: 100 }), marked({ contragent: 'B', workspace: 'wb2', final_price: 140 }), marked({ contragent: 'C', final_price: 150 })]);
check(r.ceiling.price === 140, 'one contragent says one thing: its highest accepted price');
r = rank([marked({ contragent: '', workspace: 'w-a' }), marked({ contragent: '', workspace: 'w-b' })], 'A');
check(r.ceiling && r.ceiling.apps === 2, 'applications without a contragent stand each for itself');
r = rank([row({ contragent: 'B', kind: 'zeroed', final_price: 0 }), marked({ contragent: 'C' }), row({ contragent: 'D', final_price: 100 })]);
check(r.ceiling === null && r.prices.length === 1, 'a corrected price is a suggestion, not a ceiling; a struck-out resource is neither');

/* ------------------------------------------------------------- the smeta price against the ceiling */
const c = rank([marked({ contragent: 'B', final_price: 100 }), marked({ contragent: 'C', final_price: 100 })]).ceiling;
check(S.memory.verdict(100, c) === 'accepted' && S.memory.verdict(80, c) === 'accepted' && S.memory.verdict(100.0000001, c) === 'accepted',
  'a smeta price at or below the ceiling was accepted before');
check(S.memory.verdict(100.5, c) === 'above' && S.memory.verdict(100, null) === '' && S.memory.verdict(0, c) === '', 'above it is pointed out; no ceiling, no word');

console.log(fail ? `FAILED (${fail})` : 'memory OK');
process.exit(fail ? 1 : 0);
