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


/* the date a price is for: its application's date, not the day it was finished */
check(S.memory.dateOf({ asof: '2025-03-01', finished: '2031-05-01T10:00:00.000Z' }) === '2025-03-01' && S.memory.dateOf({ finished: '2031-05-01T10:00:00.000Z' }) === '2031-05-01' &&
  S.memory.dateOf({ asof: '2031-06-01', finished: '2031-05-01' }) === '2031-05-01' && S.memory.dateOf({ asof: 'вчера', finished: '2031-05-01' }) === '2031-05-01' && S.memory.dateOf({}) === '',
  'a price is dated by its application (or by its finishing day when that is earlier or the only date)');
{
  const oldApp = (o) => row(Object.assign({ asof: '2029-01-10', finished: TODAY }, o));
  const r1 = rank([oldApp({ id: 'o1', contragent: 'B', final_price: 77 })]);
  check(r1.prices.length === 0, 'a corrected price of an application three years old is not offered, even when it was finished today');
  const r2 = rank([oldApp({ kind: 'checked', contragent: 'B', smeta_price: 50, final_price: 50 }), oldApp({ kind: 'checked', contragent: 'C', smeta_price: 50, final_price: 50 })]);
  check(r2.ceiling === null, 'nor is an old acceptance a ceiling because it was put in today');
}
/* ------------------------------------------------------------- fewer than two independent applications: a hint, «▲» only */
let h = rank([marked({ contragent: 'B', final_price: 100 })]);
check(h.ceiling === null && h.hint && h.hint.price === 100 && h.hint.apps === 1, 'one application accepted a price: no ceiling, a hint (' + JSON.stringify(h.hint && { p: h.hint.price, a: h.hint.apps }) + ')');
check(S.memory.hintVerdict(120, h.hint) === 'above' && S.memory.hintVerdict(100, h.hint) === '' && S.memory.hintVerdict(90, h.hint) === '' &&
  S.memory.hintVerdict(100.0000001, h.hint) === '' && S.memory.hintVerdict(0, h.hint) === '' && S.memory.hintVerdict(120, null) === '',
  'a smeta price above it is «above»; at or below it nothing — a hint never says «accepted»');
h = rank([marked({ contragent: 'B', final_price: 100 }), left({ contragent: 'B', final_price: 130 })]);
check(h.hint.price === 130 && h.hint.apps === 1, 'one contragent twice: one application, its highest price');
check(rank([marked({ contragent: 'A', final_price: 100 })]).hint.price === 100, 'the contragent\'s own price gives a hint too («above» is a fact, not a confirmation)');
check(rank([left({ contragent: 'B' })]).hint && rank([marked({ contragent: 'B', finished: '2030-05-01' })]).hint === null,
  'a price merely left gives a hint; one older than twelve months does not');
check(rank([marked({ contragent: 'B' }), marked({ contragent: 'C' })]).hint === null && rank([row({ contragent: 'B' })]).hint === null,
  'with a ceiling there is no hint; a corrected price is never one');

/* ------------------------------------------------------------- haulage: by the distance band, not by the name */
const H = (n, u) => S.memory.haul(n, u === undefined ? 'тн/км' : u);
const hk = (n, u) => { const h = H(n, u); return h ? h.band + ':' + h.mat + ':' + h.km : 'null'; };
check(hk('Перевозка Гравийно-песчаная смесь- 5 км ') === '1:ГПС:5' && hk('Перевозка  ГПС  км 20 ', 'тн-км') === '2:ГПС:20' && hk('Перевозка ПГС - 7 км') === '1:ГПС:7',
  'ГПС, ПГС and «Гравийно-песчаная смесь» are one material; «- 5 км» and «км 20» are distances');
check(hk('Перевозка  а-б  км 19', 'тн-км') === '2:АСФАЛЬТОБЕТОН:19' && hk('Перевозка Асфальт - 11 км') === '2:АСФАЛЬТОБЕТОН:11' &&
  hk('Перевозка Асфальтобетонная смесь - 19  км') === '2:АСФАЛЬТОБЕТОН:19' && hk('Перевозка Бетон (всех марок) - 59 км') === '3:БЕТОН:59',
  '«а-б», «Асфальт», «Асфальтобетонная смесь» are one material; concrete is another');
check(hk('Перевозка песок км 20', 'тн-км') === '2:ПЕСОК:20' && hk('Перевозка Битум км 53', 'тн-км') === '3:БИТУМ:53' && hk('Перевозка Щебень - 5 км') === '1:ЩЕБЕНЬ:5' &&
  hk('ПЕРЕВОЗКА ЦЕМЕНТА - 25 КМ', 'ТН/КМ') === '2:ЦЕМЕНТ:25' && hk('Перевозка грунта 3км', 'т.км') === '1:ГРУНТ:3',
  'sand, bitumen, crushed stone, cement, soil — in any case, with or without a space before «км»');
check(['10', '10,5', '11', '50', '51'].map((k) => H('Перевозка Щебень - ' + k + ' км').band).join() === '1,2,2,2,3',
  'the bands: 1–10 km, 11–50 km, 51 km and more (10 → 1, 10,5 → 2, 50 → 2, 51 → 3)');
check(['тн/км', 'тн-км', 'т·км', 'ткм', 'т.км', 'т/км', 'тонно-км', 'ТН/КМ'].every((u) => H('Перевозка Щебень - 5 км', u)),
  'every spelling of т·км');
check(H('Перевозка Щебень - 5 км', 'т') === null && H('Перевозка Щебень - 5 км', 'м3') === null && H('Доставка Щебень - 5 км') === null &&
  H('Перевозка Щебень') === null && H('Щебень фр. 5-20 мм') === null && H('Транспортные расходы 5 км') === null,
  'only «Перевозка» in т·км with a distance: per tonne, another word, no distance — none');

let hn = 0;
const hrow = (name, price, o) => Object.assign({ id: 'h' + (++hn), workspace: 'hw' + hn, contragent: 'B', name, unit: 'тн/км', kind: 'corrected', source: 'typed',
  smeta_price: 2000, final_price: price, finished: '2031-05-01T10:00:00.000Z', accepted: false }, o);
const hrows = [
  hrow('Перевозка Щебень - 5 км', 111),
  hrow('Перевозка Гравийно-песчаная смесь - 3 км', 222, { contragent: 'A' }),
  hrow('Перевозка ГПС - 8 км', 333),
  hrow('Перевозка Щебень - 20 км', 444),
  hrow('Перевозка Битум - 75 км', 555),
  hrow('Перевозка Песок - 7 км', 666, { source: 'pct' }),
  hrow('Перевозка Песок - 6 км', 0, { kind: 'zeroed' }),
  hrow('Перевозка Песок - 9 км', 777, { finished: '2028-01-01' }),
  hrow('Перевозка Песок - 4 км', 888, { kind: 'checked', source: 'mark' }),
  hrow('Перевозка Песок - 2 км', 999, { unit: 'т' })
];
const hr = (name, unit, contragent) => S.memory.haulRank(hrows, { contragent: contragent === undefined ? 'A' : contragent, today: TODAY }, H(name, unit));
let hp = hr('Перевозка ГПС км 9', 'тн-км');
check(hp.map((p) => p.price).join() === '222,333,111' && hp[0].same && hp[1].same && !hp[2].same,
  'a haulage line of 1–10 km: the same material first (its own contragent before another), then the others of the band (' + hp.map((p) => p.price).join() + ')');
check(hp[0].haul.name === 'Перевозка Гравийно-песчаная смесь - 3 км' && hp[0].haul.km === 3 && hp[0].cls === 1,
  'each entry names the line its price was set for');
check(hr('Перевозка Битум км 53', 'тн-км').map((p) => p.price).join() === '555' && hr('Перевозка а-б км 19', 'тн-км').map((p) => p.price).join() === '444',
  'another band is never offered: 51+ km gets 51+ km, 11–50 km gets 11–50 km');
check(!hp.some((p) => [666, 777, 888, 999, 0].indexOf(p.price) >= 0),
  'never offered: «Применить %», a price of 0, older than two years, a price left alone, a line per tonne');
check(S.memory.haulRank([hrow('Перевозка Щебень - 5 км', 50, { workspace: 'one' }), hrow('Перевозка Бетон - 8 км', 50, { workspace: 'one' }),
  hrow('Перевозка ГПС - 2 км', 60, { workspace: 'one' })], { today: TODAY }, H('Перевозка Щебень - 3 км')).map((p) => p.price).join() === '50,60',
  'one line per application and price — the same material\'s kept');
check(S.memory.haulRank(hrows, { today: TODAY }, null).length === 0, 'a line that is no haulage gets nothing this way');

console.log(fail ? `FAILED (${fail})` : 'memory OK');
process.exit(fail ? 1 : 0);
