/*
 * Which backups are kept: the newest fourteen, then one a week for eight weeks, then one a month for a year.
 *
 * The folder is pruned every time a copy is added, so the rule is tried the way it is used — a copy a day for
 * two years, pruning after each — and not only on a finished pile of files.
 *
 *   node test/backup-prune.cjs
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { plan, stamp } = require('../server/backup-prune.cjs');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const nameOf = (t) => { const d = new Date(t); return 'pb_backup_' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + '071113.zip'; };
const start = Date.UTC(2025, 0, 6);        // a Monday

check(stamp('pb_backup_20261111070400.zip') === Date.UTC(2026, 10, 11, 7, 4, 0), 'a copy is dated by the digits in its name');
check(stamp('notes.zip') === null, 'a name without a date has none');

// a finished pile: 40 daily copies
let names = [];
for (let i = 0; i < 40; i++) names.push(nameOf(start + i * DAY));
let p = plan(names, {});
check(p.keep.slice(0, 14).join() === names.slice(-14).reverse().join(), 'the newest fourteen are kept');
check(p.keep.length + p.drop.length === 40 && p.keep.length > 14 && p.keep.length <= 14 + 8, 'older ones thin out to one a week (' + p.keep.length + ' kept of 40)');
const olderKept = p.keep.slice(14);
check(olderKept.every((n) => new Date(stamp(n)).getUTCDay() === 0), 'the one kept of a week is its last, the Sunday copy (' + olderKept.length + ' of them)');

// the way it is used: a copy a day for two years, pruned after each
let have = [];
let lost = 0;
for (let i = 0; i < 730; i++) {
  have.push(nameOf(start + i * DAY));
  const q = plan(have, {});
  // nothing kept yesterday may vanish unless a later copy of the same week or month took its place
  have = q.keep.slice();
  if (i > 0 && !have.includes(nameOf(start + i * DAY))) lost++;
}
check(lost === 0, 'the copy just made is never the one dropped');
check(have.length <= 14 + 8 + 12 && have.length >= 14 + 8 + 10, 'after two years of daily copies ' + have.length + ' are held (14 + 8 weekly + up to 12 monthly)');
const ages = have.map((n) => Math.round((start + 729 * DAY - stamp(n)) / DAY)).sort((a, b) => a - b);
check(ages[0] === 0 && ages[13] === 13, 'the last two weeks day by day');
check(ages.some((a) => a > 60 && a < 75) && ages.some((a) => a > 300), 'and copies from two months and from most of a year ago are still there (oldest: ' + ages[ages.length - 1] + ' days)');
check(ages[ages.length - 1] < 500, 'while nothing older than the year and a bit is hoarded');
const months = new Set(have.slice(22).map((n) => n.slice(10, 16)));
check(months.size === have.slice(22).length, 'one copy per month among the oldest');

// the command: a real folder, real files; a file that is not a .zip is left alone
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
names.forEach((n) => fs.writeFileSync(path.join(dir, n), 'x'));
fs.writeFileSync(path.join(dir, 'README.txt'), 'x');
const script = path.join(__dirname, '..', 'server', 'backup-prune.cjs');
const dry = execFileSync('node', [script, dir, '--dry']).toString().trim().split('\n');
check(dry.filter((l) => /^keep /.test(l)).length === p.keep.length && fs.readdirSync(dir).length === 41, '--dry says what it would do and removes nothing');
execFileSync('node', [script, dir]);
const left = fs.readdirSync(dir).sort();
check(left.filter((n) => /\.zip$/.test(n)).sort().join() === p.keep.slice().sort().join() && left.includes('README.txt'),
  'the command removes exactly the copies the plan drops, and nothing that is not a copy');
execFileSync('node', [script, dir, '3', '0', '0']);
check(fs.readdirSync(dir).filter((n) => /\.zip$/.test(n)).length === 3, 'the counts can be given: 3 0 0 keeps the newest three');
check(execFileSync('node', [script, path.join(dir, 'nowhere')]).toString() === '', 'a folder that is not there is not an error');
fs.rmSync(dir, { recursive: true, force: true });

console.log(fail ? '\nFAILED: ' + fail : '\nall passed');
process.exit(fail ? 1 : 0);
