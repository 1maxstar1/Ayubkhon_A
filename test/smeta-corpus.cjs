/*
 * The reader against every estimate the owner has sent — the proof that a change to the rules (src/lib/smeta.js)
 * leaves all the other files read exactly as they were.
 *
 * The files are the owner's and never enter the repository. They stand in a private folder:
 *
 *   $SMETA_KIT/files/*.xlsx      the estimates, read or refused
 *   $SMETA_KIT/golden.json       how each was read when last recorded
 *
 *   SMETA_KIT=<kit> node test/smeta-corpus.cjs             compare with the record; a file read differently fails
 *   SMETA_KIT=<kit> node test/smeta-corpus.cjs --record    write the record (after looking at what changed and why)
 *
 * A reading is fingerprinted whole: every row's kind, section, number, name, unit, quantity, price and sum, and the
 * layout the sheet was read by. Per file it also says how many objects and resource lines were found and how well
 * the arithmetic holds (quantity × price = sum) — a file that reads nothing, or reads with sums that do not agree,
 * is the to-do list.
 *
 * Without SMETA_KIT there is nothing to measure: exit 77 (SKIP), as test/refs-parity.cjs does.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { load } = require('./load.cjs');

const KIT = process.env.SMETA_KIT || '';
const RECORD = process.argv.includes('--record');
if (!KIT || !fs.existsSync(path.join(KIT, 'files'))) {
  console.log('SMETA_KIT berilmagan — egasining smetalari kerak (maxfiy, repoda emas)');
  process.exit(77);
}

const S = load(load.PIPELINE);
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

/** How one workbook is read: the counts, the arithmetic and the fingerprint of the whole reading. */
function reading(bytes) {
  let objs;
  try { objs = S.smeta.parseWorkbook(S.readXlsx(new Uint8Array(bytes)), 'x.xlsx'); }
  catch (e) { return { error: String(e && e.message || e).slice(0, 80), objects: 0, items: 0, checked: 0, agree: 0, fp: 'error' }; }
  let items = 0, checked = 0, agree = 0;
  const slim = objs.map((o) => {
    o.rows.forEach((r) => {
      if (r.kind !== 'item') return;
      items++;
      if (r.qty == null || r.price == null || r.sum == null) return;
      checked++;
      if (Math.abs(r.sum - r.qty * r.price) <= Math.max(0.51, Math.abs(r.sum) * 0.001)) agree++;
    });
    return { n: o.name, t: o.title, s: o.subtitle, L: o.layout, mc: o.maxCol,
      rows: o.rows.map((r) => [r.r, r.kind, r.section, r.no, r.nm, r.unit, r.qty, r.price, r.sum]) };
  });
  return { objects: objs.length, items, checked, agree, fp: sha(JSON.stringify(slim)).slice(0, 16) };
}

const dir = path.join(KIT, 'files'), goldenPath = path.join(KIT, 'golden.json');
const names = fs.readdirSync(dir).filter((n) => /\.(xlsx|xlsm)$/i.test(n)).sort();
const golden = fs.existsSync(goldenPath) ? JSON.parse(fs.readFileSync(goldenPath, 'utf8')) : { files: {} };

const now = {}, changed = [], fresh = [], lines = [];
let full = 0, doubt = 0, none = 0;
for (const n of names) {
  const bytes = fs.readFileSync(path.join(dir, n));
  const r = reading(bytes);
  r.sha = sha(bytes).slice(0, 16);
  now[n] = r;
  const pct = r.checked ? Math.round(r.agree / r.checked * 1000) / 10 : null;
  const state = !r.items ? 'NONE' : (pct != null && pct < 90) ? 'DOUBT' : 'FULL';
  if (state === 'NONE') none++; else if (state === 'DOUBT') doubt++; else full++;
  const was = golden.files[n];
  let mark = '';
  if (!was) { fresh.push(n); mark = '  NEW'; }
  else if (was.sha !== r.sha) { fresh.push(n); mark = '  NEW (another file under this name)'; }
  else if (was.fp !== r.fp) { changed.push(n); mark = '  CHANGED (was ' + was.objects + ' objects, ' + was.items + ' lines)'; }
  lines.push(n.padEnd(14) + state.padEnd(6) + String(r.objects).padStart(3) + ' objects ' + String(r.items).padStart(5) + ' lines  ' +
    (pct == null ? 'arithmetic  —   ' : 'arithmetic ' + String(pct).padStart(5) + '%') + '  ' + r.fp + (r.error ? '  ' + r.error : '') + mark);
}
const gone = Object.keys(golden.files).filter((n) => !now[n]);

console.log(lines.join('\n'));
console.log('\nfiles ' + names.length + ': read ' + full + ', read with sums that do not agree ' + doubt + ', not read ' + none +
  (gone.length ? ' · recorded but no longer in the folder: ' + gone.join(', ') : ''));

if (RECORD) {
  fs.writeFileSync(goldenPath, JSON.stringify({ version: 1, recorded: new Date().toISOString(), files: now }, null, 1));
  console.log('recorded: ' + names.length + ' files' + (changed.length ? ' · read differently than before: ' + changed.join(', ') : '') +
    (fresh.length ? ' · new: ' + fresh.length : ''));
  process.exit(0);
}
if (!Object.keys(golden.files).length) {
  console.log('nothing recorded yet — run with --record');
  process.exit(77);
}
if (changed.length) {
  console.log('\nFAILED: ' + changed.length + ' file(s) are read differently than recorded: ' + changed.join(', ') +
    '\n(if the change is meant — look at each, then --record)');
  process.exit(1);
}
if (fresh.length) console.log('not recorded yet (not compared): ' + fresh.join(', ') + ' — run with --record');
console.log('all recorded files are read as recorded');
process.exit(0);
