/*
 * Writing a whole estimate's prices at once.
 *
 * «Применить процент» changes every resource of a project in one gesture, and
 * a thousand resources is an ordinary project. Written one record at a time
 * that is a thousand HTTP creates, and the server this is deployed on allows
 * forty of them per five seconds from one address — an address a whole office
 * shares. So all but the first forty came back 429 and were dropped: the
 * document was still right, but the price memory the next project's hints are
 * built from kept almost nothing.
 *
 * The rate limit is deliberately switched on here, at exactly the numbers
 * server/deploy/configure.sh sets, so the test measures the thing that
 * actually happens on the real server rather than on a loopback with no
 * limits.
 *
 *   node test/corrections-bulk.mjs
 */
import { createRequire } from 'node:module';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, DATA, ROOT as root } from './server.mjs';

const PORT = 8114;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api } = pb;
let su = pb.su;

// The keys the server writes must be the keys the page computes.
const cjs = join(DATA, 'nlp-bulk.cjs');
copyFileSync(join(root, 'server/pb_hooks/lib/nlp.js'), cjs);
const N = createRequire(import.meta.url)(cjs);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const raw = async (path, body, token) => {
  const r = await fetch(pb.base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

/* ------------------------------------------------------ an open workspace */
const rows = pb.rows().slice(0, 2);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const app1 = (await api(`/api/collections/applications/records?filter=${
  encodeURIComponent(`number='${rows[0].number}'`)}`, {}, su)).items[0];
const me = (await api(`/api/collections/users/records?filter=${
  encodeURIComponent("email='test@example.com'")}`, {}, su)).items[0];
const ws = await api('/api/collections/workspaces/records', {
  method: 'POST',
  body: JSON.stringify({ application: app1.id, region: 'buxoro', status: 'in_progress', opened_by: me.id, updated_by: me.id })
}, su);
const tok = await pb.signIn('test@example.com');

const NAMES = ['ЦЕМЕНТ М400', 'ГОРЯЧЕКАТАННАЯ СТАЛЬ ДИАМ. 16 ММ', 'КИРПИЧ КЕРАМИЧЕСКИЙ', 'ПЕСОК СТРОИТЕЛЬНЫЙ'];
const resource = (i) => ({
  res_key: 'k' + i,
  name: NAMES[i % NAMES.length] + ' №' + i,
  unit: i % 2 ? 'М3' : 'ТН',
  smeta_price: 1000 + i,
  market_price: 2000 + i,
  note: 'из справочника'
});

/* ------------------------------------------------------------ who may ask */
const anon = await raw('/api/corrections/bulk', { workspace: ws.id, set: [resource(0)] });
check(anon.status === 401 || anon.status === 403, `an anonymous request is refused (${anon.status})`);
const nowhere = await raw('/api/corrections/bulk', { workspace: 'nosuchrecord12', set: [resource(0)] }, tok);
check(nowhere.status === 404, `a workspace that does not exist is refused (${nowhere.status})`);

/* ------------------------------------ the rate limit the server really has */
await api('/api/settings', {
  method: 'PATCH',
  body: JSON.stringify({
    rateLimits: {
      enabled: true,
      rules: [
        { label: '*:auth', audience: '', duration: 3, maxRequests: 4 },
        { label: '*:create', audience: '', duration: 5, maxRequests: 40 },
        { label: '/api/', audience: '', duration: 10, maxRequests: 400 }
      ]
    }
  })
}, su);

// What used to happen: one create per resource, as an ordinary expert.
let written = 0, refused = 0;
for (let i = 0; i < 60; i++) {
  const r = await fetch(pb.base + '/api/collections/corrections/records', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: tok },
    body: JSON.stringify({ workspace: ws.id, res_key: 'old' + i, name: 'ЦЕМЕНТ', market_price: 1, smeta_price: 2 })
  });
  if (r.ok) written++; else if (r.status === 429) refused++;
}
check(refused > 0, `one request per resource hits the limit: ${written} written, ${refused} refused with 429`);

/* --------------------------------------------------- the whole lot at once */
const many = [];
for (let i = 0; i < 300; i++) many.push(resource(i));
const t0 = Date.now();
const bulk = await raw('/api/corrections/bulk', { workspace: ws.id, set: many }, tok);
const ms = Date.now() - t0;
check(bulk.status === 200, `300 corrections in one request are accepted (${bulk.status})`);
check(bulk.body.saved === 300, `and all 300 are written (${bulk.body.saved}) in ${ms} ms`);
check(await pb.count('corrections', `workspace='${ws.id}' && res_key~'k%'`) === 300,
  'the server agrees they are all there');
check(Object.keys(bulk.body.ids || {}).length === 300, 'and the page is told the id of each one');

/* ------------------------------------------ the server decides who and where */
const one = (await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`workspace='${ws.id}' && res_key='k1'`)}`, {}, su)).items[0];
check(one.region === 'buxoro' && one.application === app1.id,
  'region and application are taken from the workspace');
check(one.contragent === app1.contragent, 'the contragent comes from the application');
check(one.by === me.id, 'and the author from the token');
check(one.name_key === N.nameKey(one.name) && one.match_key === N.matchKey(one.name),
  'the lookup keys are the ones the page computes');
check(one.unit_key === N.unitKey(one.unit) && one.match_unit_key === N.matchUnitKey(one.unit),
  'the unit keys too');

// A lying request cannot attribute the work to somebody else or move it.
const liar = await raw('/api/corrections/bulk', {
  workspace: ws.id,
  set: [{ ...resource(1), region: 'andijon', by: '0000000000000000', application: 'aaaaaaaaaaaaaaa' }]
}, tok);
check(liar.status === 200, 'a request carrying its own region and author is accepted');
const after = (await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`workspace='${ws.id}' && res_key='k1'`)}`, {}, su)).items[0];
check(after.region === 'buxoro' && after.by === me.id && after.application === app1.id,
  'and none of it is believed');

/* ------------------------------------------------- writing the same twice */
const again = await raw('/api/corrections/bulk', {
  workspace: ws.id, set: [{ ...resource(2), market_price: 99999 }]
}, tok);
check(again.status === 200, 'the same resource can be written again');
check(await pb.count('corrections', `workspace='${ws.id}' && res_key='k2'`) === 1,
  'it updates the row rather than adding a second one');
const upd = (await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`workspace='${ws.id}' && res_key='k2'`)}`, {}, su)).items[0];
check(upd.market_price === 99999, 'and the new price is the one stored');

/* ----------------------------------- a row the page does not know it has */
/*
 * Two experts may work on one application — the program says so, and
 * test/ownership.mjs locks it in. A's price for ЦЕМЕНТ lands first; B, whose
 * picture of the corrections was taken when they opened the application, then
 * prices the same resource. Written record by record that was a create, and
 * the unique (workspace, res_key) index refused it with no branch to recover
 * from: for the rest of B's session that resource could not be priced at all.
 */
const theirs = await api('/api/collections/corrections/records', {
  method: 'POST',
  body: JSON.stringify({
    workspace: ws.id, res_key: 'shared', name: 'ЦЕМЕНТ М400', unit: 'ТН',
    smeta_price: 900000, market_price: 950000
  })
}, su);
const mine = await raw('/api/corrections/bulk', {
  workspace: ws.id,
  set: [{ res_key: 'shared', name: 'ЦЕМЕНТ М400', unit: 'ТН', smeta_price: 900000, market_price: 1000000 }]
}, tok);
check(mine.status === 200, `a second expert pricing the same resource is accepted (${mine.status})`);
check(await pb.count('corrections', `workspace='${ws.id}' && res_key='shared'`) === 1,
  'and there is still one row for it, not a refused create');
const shared = (await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`workspace='${ws.id}' && res_key='shared'`)}`, {}, su)).items[0];
check(shared.id === theirs.id && shared.market_price === 1000000,
  'it is the row that was already there, carrying the newer price');
check(mine.body.ids.shared === theirs.id, 'and the page is told which row it now holds');

/* ------------------------------------------------------------- and removing */
const gone = await raw('/api/corrections/bulk', { workspace: ws.id, set: [], del: ['k2', 'k3', 'nosuchkey'] }, tok);
check(gone.body.deleted === 2, `only the two that existed are removed (${gone.body.deleted})`);
check(await pb.count('corrections', `workspace='${ws.id}' && res_key='k2'`) === 0, 'k2 is gone');
check(await pb.count('corrections', `workspace='${ws.id}' && res_key='k1'`) === 1, 'and k1 is untouched');

/* ------------------------------------------------------- a request too big */
const huge = [];
for (let i = 0; i < 3001; i++) huge.push(resource(i));
const big = await raw('/api/corrections/bulk', { workspace: ws.id, set: huge }, tok);
check(big.status === 400, `a request of 3001 corrections is refused, not held open (${big.status})`);

pb.stop();
console.log(fail ? `FAILED (${fail})` : 'corrections-bulk OK');
process.exit(fail ? 1 : 0);
