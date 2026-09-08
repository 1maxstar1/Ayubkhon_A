/*
 * «Отключить» has to end the session, not just the next sign-in.
 *
 * The rule that keeps a disabled account out — users.authRule = "active = true"
 * — is read when a token is issued and never again. So an expert who left the
 * firm kept full access for the rest of their token's four hours: the whole
 * registry, any application, writing prices, marking work finished. The admin
 * had pressed the button, watched the row turn to «отключён», and believed
 * access was gone.
 *
 * What is measured here is the same token, before and after.
 *
 *   node test/disable-user.mjs
 */
import { startServer } from './server.mjs';

const PORT = 8115;
const pb = await startServer({ port: PORT, registry: true });
const { api } = pb;
const su = pb.su;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const status = async (path, init = {}, token) => (await fetch(pb.base + path, {
  ...init,
  headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}), ...(init.headers || {}) }
})).status;
/*
 * A list rule is applied as a filter, not as a gate: a request PocketBase no
 * longer recognises is simply anonymous, and «@request.auth.id != ""» is then
 * false for every row — so the honest question about the registry is how many
 * applications came back, not what the status code was.
 */
const sees = async (token) =>
  (await api('/api/collections/applications/records?perPage=1', {}, token)).totalItems;

/* ------------------------------------------------------------ an expert */
const rows = pb.rows().slice(0, 2);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const app1 = (await api(`/api/collections/applications/records?filter=${
  encodeURIComponent(`number='${rows[0].number}'`)}`, {}, su)).items[0];
const ALL = await sees(su);      // what a signed-in account is supposed to see

const leaver = await api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({
    email: 'leaver@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901',
    name: 'Ketgan Ekspert', role: 'ekspert', active: true, emailVisibility: true
  })
}, su);
const tok = await pb.signIn('leaver@example.com');
check(!!tok, 'the expert signs in');

const ws = await api('/api/collections/workspaces/records', {
  method: 'POST',
  body: JSON.stringify({ application: app1.id, region: 'fargona', status: 'in_progress', opened_by: leaver.id, updated_by: leaver.id })
}, su);

check(await sees(tok) === ALL, `and reads the registry (${await sees(tok)} of ${ALL} applications)`);
check(await status(`/api/collections/workspaces/records/${ws.id}`, {}, tok) === 200, 'and open a workspace');

/* --------------------------------- an ordinary edit must not sign them out */
await api(`/api/collections/users/records/${leaver.id}`, {
  method: 'PATCH', body: JSON.stringify({ name: 'Ketgan Ekspert (Fargʻona)' })
}, su);
check(await sees(tok) === ALL, 'renaming the account leaves the session alone');

/* --------------------------------------------------------- and turning off */
const t0 = Date.now();
const off = await status(`/api/collections/users/records/${leaver.id}`, {
  method: 'PATCH', body: JSON.stringify({ active: false })
}, su);
const ms = Date.now() - t0;
// The variant that rotates the key in a second save after the update deadlocks:
// the record is written but the request never returns, so the admin's button
// spins forever. This one answers immediately.
check(off === 200, `«Отключить» is accepted (${off})`);
check(ms < 3000, `and answers at once, not after a deadlock (${ms} ms)`);
check((await api(`/api/collections/users/records/${leaver.id}`, {}, su)).active === false,
  'the account really is off');

check(await sees(tok) === 0, `the token they still hold reads nothing of the registry (${await sees(tok)} applications)`);
const open = await status(`/api/collections/workspaces/records/${ws.id}`, {}, tok);
check(open === 401 || open === 403 || open === 404, `nor opens the workspace (${open})`);
const write = await status('/api/corrections/bulk', {
  method: 'POST',
  body: JSON.stringify({ workspace: ws.id, set: [{ res_key: 'x', name: 'ЦЕМЕНТ', unit: 'ТН', smeta_price: 1, market_price: 2 }] })
}, tok);
check(write === 401 || write === 403, `nor writes a price (${write})`);
check(await pb.count('corrections', `workspace='${ws.id}'`) === 0, 'and nothing of theirs was written');
const refresh = await status('/api/collections/users/auth-refresh', { method: 'POST' }, tok);
check(refresh === 401 || refresh === 403, `nor renews itself (${refresh})`);

/* ----------------------------------------- switching back on is a new start */
await api(`/api/collections/users/records/${leaver.id}`, {
  method: 'PATCH', body: JSON.stringify({ active: true })
}, su);
check(await sees(tok) === 0, 'turning the account back on does not revive the old token');
const fresh = await pb.signIn('leaver@example.com');
check(await sees(fresh) === ALL, 'but they can sign in again');

/* ------------------------------------------ everybody else is undisturbed */
const other = await pb.signIn('test@example.com');
check(await sees(other) === ALL, 'and the other expert never noticed');

pb.stop();
console.log(fail ? `FAILED (${fail})` : 'disable-user OK');
process.exit(fail ? 1 : 0);
