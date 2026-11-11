/*
 * Which backups of a folder are kept.
 *
 *   node server/backup-prune.cjs <folder> [newest] [weeks] [months] [--dry]
 *
 * The launcher used to keep the newest fourteen and nothing else, so a mistake noticed in the third week — a
 * registry upload undone, prices overwritten — had no copy to go back to. Kept now:
 *
 *   the newest `newest` copies (14: about two weeks of daily copies),
 *   then one copy a week for `weeks` more weeks (8),
 *   then one copy a month for `months` more months (12).
 *
 * «One a week» is the last copy of that week, «one a month» the last of that month. The folder is pruned every
 * time a copy is added, and the rule is stable under that: a copy that is kept today is either kept tomorrow
 * or has been replaced by a later copy of the same week or month.
 *
 * A copy is dated by the fourteen digits in its name (pb_backup_YYYYMMDDHHMMSS.zip), or by its file time when
 * the name has none. Only .zip files are looked at; nothing else in the folder is touched.
 *
 * As a module: require('./backup-prune.cjs').plan(names, { newest, weeks, months }) → { keep: [...], drop: [...] }
 * for names that carry their date.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** The moment a copy was made, from its name; null when the name carries none. */
function stamp(name) {
  const m = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(t) ? null : t;
}

/** The Monday that begins the week of `t`, as a day count: every moment of one week gives one number. */
function weekOf(t) {
  const day = Math.floor(t / (24 * 3600 * 1000));          // days since 1970-01-01, a Thursday
  return Math.floor((day + 3) / 7);
}
function monthOf(t) { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }

/**
 * @param {Array<{name:string, t:number}>} files
 * @returns {{keep:string[], drop:string[]}}
 */
function planOf(files, o) {
  const newest = o.newest == null ? 14 : o.newest, weeks = o.weeks == null ? 8 : o.weeks, months = o.months == null ? 12 : o.months;
  const sorted = files.slice().sort((a, b) => b.t - a.t || (a.name < b.name ? 1 : -1));
  const keep = new Set();
  sorted.slice(0, newest).forEach((f) => keep.add(f.name));
  const rest = sorted.slice(newest);
  const seenW = new Set(), seenM = new Set();
  // the weeks the newest copies already cover are not counted again
  sorted.slice(0, newest).forEach((f) => seenW.add(weekOf(f.t)));
  const covered = seenW.size;
  rest.forEach((f) => {
    const w = weekOf(f.t);
    if (seenW.has(w)) return;
    if (seenW.size - covered >= weeks) return;
    seenW.add(w); keep.add(f.name);
  });
  // months: beyond everything kept so far
  sorted.forEach((f) => { if (keep.has(f.name)) seenM.add(monthOf(f.t)); });
  const coveredM = seenM.size;
  rest.forEach((f) => {
    if (keep.has(f.name)) return;
    const m = monthOf(f.t);
    if (seenM.has(m)) return;
    if (seenM.size - coveredM >= months) return;
    seenM.add(m); keep.add(f.name);
  });
  return { keep: sorted.filter((f) => keep.has(f.name)).map((f) => f.name), drop: sorted.filter((f) => !keep.has(f.name)).map((f) => f.name) };
}

function plan(names, o) {
  return planOf(names.map((name) => ({ name, t: stamp(name) })).filter((f) => f.t != null), o || {});
}

function main(argv) {
  const dry = argv.includes('--dry');
  const args = argv.filter((a) => a !== '--dry');
  const dir = args[0];
  if (!dir) { console.error('usage: node server/backup-prune.cjs <folder> [newest] [weeks] [months] [--dry]'); return 2; }
  const num = (s, d) => (s != null && /^\d+$/.test(s) ? +s : d);
  let names;
  try { names = fs.readdirSync(dir).filter((n) => /\.zip$/i.test(n)); } catch (e) { return 0; }      // no folder: nothing to prune
  const files = names.map((name) => {
    let t = stamp(name);
    if (t == null) { try { t = fs.statSync(path.join(dir, name)).mtimeMs; } catch (e) { t = null; } }
    return { name, t };
  }).filter((f) => f.t != null);
  const p = planOf(files, { newest: num(args[1], 14), weeks: num(args[2], 8), months: num(args[3], 12) });
  if (dry) { p.keep.forEach((n) => console.log('keep ' + n)); p.drop.forEach((n) => console.log('drop ' + n)); return 0; }
  p.drop.forEach((n) => { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { /* gone already */ } });
  return 0;
}

module.exports = { plan, stamp };
if (require.main === module) process.exit(main(process.argv.slice(2)));
