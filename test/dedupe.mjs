/*
 * One application number = one record, upload after upload.
 *  - the weekly re-upload of the same registry adds nothing, it updates;
 *  - a number repeated inside one file collapses to a single record;
 *  - /api/admin/dedupe repairs a database that already holds a copy (an
 *    install predating the unique index), moving the work onto the survivor.
 *
 *   node test/dedupe.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8109, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_test');

execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'ignore' });
execSync('node test/registry.cjs --json server/pb_data_test/rows.json', { cwd: root, stdio: 'ignore' });

let server = start();
function start() {
  const s = spawn('sh', ['server/run.sh'], {
    cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore'
  });
  process.on('exit', () => s.kill());
  return s;
}
async function waitUp() {
  for (let i = 0; i < 20; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}
await waitUp();

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const api = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, {
    ...opts, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}), ...(opts.headers || {}) }
  });
  return r.json();
};
let su = (await api('/api/collections/_superusers/auth-with-password', {
  method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' })
})).token;
const count = async (coll, filter = '') =>
  (await api(`/api/collections/${coll}/records?perPage=1&filter=${encodeURIComponent(filter)}`, {}, su)).totalItems;

const rows = JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8'));

/* --------------------------------------- the weekly re-upload ----------- */
const first = await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
check(first.added === rows.length && first.updated === 0, `first upload adds everything: +${first.added}`);
const second = await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
check(second.added === 0 && second.updated === rows.length, `same file again: nothing new, updated ${second.updated}`);
check((await count('applications')) === rows.length + 1, 'no second copy in the database (400 + the smoke probe)');

// A registry a week later: same rows plus one new application.
const next = rows.slice(0, 50).concat([{ number: '990001', org_name: 'Новая MChJ', inn: '777777777', project_title: 'Неделя спустя' }]);
const third = await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows: next }) }, su);
check(third.added === 1 && third.updated === 50, `next week: 1 new, ${third.updated} already there`);

/* --------------------------------------- a number twice in one file ----- */
const twice = [
  { number: '990002', org_name: 'Первая строка', project_title: 'Старое название' },
  { number: '990002', org_name: 'Вторая строка', project_title: 'Новое название' }
];
const dup = await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows: twice }) }, su);
check(dup.duplicates === 1 && dup.added === 1, `repeated number in the file collapses: duplicates=${dup.duplicates}, added=${dup.added}`);
check((await count('applications', "number='990002'")) === 1, 'only one record for the repeated number');
const kept = (await api(`/api/collections/applications/records?filter=${encodeURIComponent("number='990002'")}`, {}, su)).items[0];
check(kept.project_title === 'Новое название', 'the later row wins (newest state of the application)');

/* --------------------------------------- repairing an old database ------ */
// Seed what an install without the unique index could hold: the same number twice.
server.kill();
await new Promise((r) => setTimeout(r, 700));
const db = new DatabaseSync(join(DATA, 'data.db'));
const app = db.prepare("SELECT * FROM applications WHERE number = '990001'").get();
const cols = db.prepare('PRAGMA table_info(applications)').all().map((c) => c.name);
db.exec('DROP INDEX IF EXISTS idx_applications_number');
const copyId = 'dupdupdupdup001';
db.prepare(`INSERT INTO applications (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
  .run(...cols.map((c) => (c === 'id' ? copyId : app[c])));
check(db.prepare("SELECT COUNT(*) c FROM applications WHERE number='990001'").get().c === 2, 'seeded a duplicate row');
db.close();

server = start();
await waitUp();
su = (await api('/api/collections/_superusers/auth-with-password', {
  method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' })
})).token;
const me = (await api(`/api/collections/users/records?filter=${encodeURIComponent("email='test@example.com'")}`, {}, su)).items[0];
// work sits on the original, a price correction on the copy
const ws = await api('/api/collections/workspaces/records', {
  method: 'POST', body: JSON.stringify({ application: app.id, region: 'fargona', status: 'in_progress', opened_by: me.id, updated_by: me.id })
}, su);
const corr = await api('/api/collections/corrections/records', {
  method: 'POST', body: JSON.stringify({ workspace: ws.id, application: copyId, res_key: 'k1', name: 'Bolt', smeta_price: 10, market_price: 12 })
}, su);
check(!!ws.id && !!corr.id, 'seeded a workspace on one copy and a correction on the other');

const ekspert = (await api('/api/collections/users/request-otp', { method: 'POST', body: JSON.stringify({ email: 'test@example.com' }) })).otpId;
await new Promise((r) => setTimeout(r, 600));
const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
const tok = (await api('/api/collections/users/auth-with-otp', { method: 'POST', body: JSON.stringify({ otpId: ekspert, password: code }) })).token;
const denied = await fetch(BASE + '/api/admin/dedupe', { method: 'POST', headers: { Authorization: tok } });
check(denied.status === 403, 'an ekspert may not run the repair');

const fixed = await api('/api/admin/dedupe', { method: 'POST' }, su);
check(fixed.groups === 1 && fixed.removed === 1, `repair: groups=${fixed.groups}, removed=${fixed.removed}`);
check((await count('applications', "number='990001'")) === 1, 'one record left for the number');
const survivor = (await api(`/api/collections/applications/records?filter=${encodeURIComponent("number='990001'")}`, {}, su)).items[0];
check(survivor.id === app.id, 'the record the work points at is the one kept');
const movedCorr = await api(`/api/collections/corrections/records/${corr.id}`, {}, su);
check(movedCorr.application === app.id, 'the correction moved onto the surviving application');
const again = await api('/api/admin/dedupe', { method: 'POST' }, su);
check(again.groups === 0 && again.removed === 0, 'a clean database reports nothing to repair');

server.kill();
console.log(fail ? `FAILED (${fail})` : 'dedupe OK');
process.exit(fail ? 1 : 0);
