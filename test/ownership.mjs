/*
 * Who did what is decided by the server, not by the browser.
 *
 * A workspace carries its opener, a price correction and an export their
 * author. Those fields used to arrive from the page, which could send any user
 * id at all — so an expert could sign a colleague's name to a price they
 * changed, and the «кто последний работал» warning could name the wrong
 * person.
 *
 * What this does NOT change is who may do what: any expert may open any
 * application, and two may work on one. That is the product's own rule
 * («при одновременной работе побеждает последнее сохранение») and it is
 * checked here too, so a later tightening cannot break it unnoticed.
 *
 *   node test/ownership.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8112, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_test');

execSync('node build.mjs --serve', { cwd: root, stdio: 'ignore' });
execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'ignore' });
execSync('node test/registry.cjs --json server/pb_data_test/rows.json', { cwd: root, stdio: 'ignore' });

const server = spawn('sh', ['server/run.sh'], {
  cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore'
});
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const api = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, {
    ...opts, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}), ...(opts.headers || {}) }
  });
  return r.status === 204 ? {} : r.json();
};
const su = (await api('/api/collections/_superusers/auth-with-password', {
  method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' })
})).token;

/* two experts, and one application each of them may open */
const rows = JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8')).slice(0, 2);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const appOf = async (n) => (await api(`/api/collections/applications/records?filter=${encodeURIComponent(`number='${n}'`)}`, {}, su)).items[0];
const a1 = await appOf(rows[0].number);

const alice = (await api(`/api/collections/users/records?filter=${encodeURIComponent("email='test@example.com'")}`, {}, su)).items[0];
const bob = await api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'bob@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Bob', role: 'ekspert', active: true, emailVisibility: true })
}, su);
check(!!bob.id && !!alice.id, 'two experts exist');

async function signIn(email) {
  const otpId = (await api('/api/collections/users/request-otp', { method: 'POST', body: JSON.stringify({ email }) })).otpId;
  await new Promise((r) => setTimeout(r, 600));
  const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n')
    .filter((l) => l.includes(' ' + email + ' ')).pop().match(/code=(\d+)/)[1];
  return (await api('/api/collections/users/auth-with-otp', { method: 'POST', body: JSON.stringify({ otpId, password: code }) })).token;
}
const aliceTok = await signIn('test@example.com');
const bobTok = await signIn('bob@example.com');
check(!!aliceTok && !!bobTok, 'both can sign in');

/* ------------------------------------------- a workspace signs its opener */
// Alice opens it, but tells the server it was Bob.
const ws = await api('/api/collections/workspaces/records', {
  method: 'POST',
  body: JSON.stringify({ application: a1.id, region: 'fargona', status: 'in_progress', opened_by: bob.id, updated_by: bob.id })
}, aliceTok);
check(!!ws.id, 'Alice opens a workspace');
check(ws.opened_by === alice.id, `and it is recorded as hers, not the id she sent (${ws.opened_by === alice.id ? 'alice' : 'bob'})`);
check(ws.updated_by === alice.id, 'the last-editor field too');

/* ------------------------------------------ a correction signs its author */
const corr = await api('/api/collections/corrections/records', {
  method: 'POST',
  body: JSON.stringify({ workspace: ws.id, application: a1.id, res_key: 'k1', name: 'БЕТОН', unit: 'М3', smeta_price: 100, market_price: 120, by: bob.id })
}, aliceTok);
check(corr.by === alice.id, 'a price correction is signed by whoever sent it');

/* --------------------------------- and an update cannot re-sign somebody else */
const edited = await api(`/api/collections/corrections/records/${corr.id}`, {
  method: 'PATCH', body: JSON.stringify({ market_price: 130, by: bob.id })
}, aliceTok);
check(edited.by === alice.id, 'editing it does not move the signature either');

/* ------------------------------------- two experts on one application still work */
// The program tells the user that the last save wins; that is a feature, and it
// must keep working. Bob saves over Alice's workspace.
const bobSave = await api(`/api/collections/workspaces/records/${ws.id}`, {
  method: 'PATCH', body: JSON.stringify({ changed: 7 })
}, bobTok);
check(bobSave.changed === 7, 'a second expert can still save the same workspace');
check(bobSave.updated_by === bob.id, 'and the record now says it was Bob who did');
check(bobSave.opened_by === alice.id, 'while the opener stays the one who opened it');

const bobCorr = await api('/api/collections/corrections/records', {
  method: 'POST',
  body: JSON.stringify({ workspace: ws.id, application: a1.id, res_key: 'k2', name: 'ЩЕБЕНЬ', unit: 'М3', smeta_price: 50, market_price: 60 })
}, bobTok);
check(bobCorr.by === bob.id, 'a second expert may add corrections to it');

/* --------------------------------------------- the admin path is untouched */
// The installer, the tests and the maintenance endpoints create records for
// other people, and have no user record of their own to be stamped with.
const suWs = await api('/api/collections/workspaces/records', {
  method: 'POST',
  body: JSON.stringify({ application: (await appOf(rows[1].number)).id, region: 'buxoro', status: 'in_progress', opened_by: bob.id, updated_by: bob.id })
}, su);
check(suWs.opened_by === bob.id, 'a superuser can still open a workspace on somebody else\'s behalf');

server.kill();
console.log(fail ? `FAILED (${fail})` : 'ownership OK');
process.exit(fail ? 1 : 0);
