/*
 * What four people actually cost the server. Runs the real API operations of
 * the app concurrently against a database holding the full registry, and
 * reports latency, server memory and CPU.
 *
 *   node test/load4.mjs <Report_1.xls> <smeta.xlsx>
 */
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [registry, smeta] = process.argv.slice(2);
if (!registry || !smeta || !existsSync(registry) || !existsSync(smeta)) {
  console.error('usage: node test/load4.mjs Report_1.xls smeta.xlsx'); process.exit(1);
}
const PORT = 8102, BASE = `http://127.0.0.1:${PORT}`;
const DIR = 'pb_data_load', DATA = join(root, 'server', DIR);

rmSync(DATA, { recursive: true, force: true });
execSync('sh server/setup.sh', { cwd: root, stdio: 'ignore', env: { ...process.env, PB_DATA_DIR: DIR, PB_ADMIN_EMAIL: 'admin@example.com', PB_ADMIN_PASS: 'adminpass1234', PB_SETUP_PORT: '8103' } });
const server = spawn('sh', ['server/run.sh'], { cwd: root, env: { ...process.env, PB_DATA_DIR: DIR, PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) {} await new Promise((r) => setTimeout(r, 500)); }

const pid = Number(execSync(`pgrep -f 'pocketbase serve --http 127.0.0.1:${PORT}'`).toString().trim().split('\n')[0]);
const rss = () => Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024;
const cpu = () => { const p = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' '); return (Number(p[13]) + Number(p[14])) / 100; };

const api = async (p, o = {}, t) => fetch(BASE + p, { ...o, headers: { ...(o.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(t ? { Authorization: t } : {}), ...(o.headers || {}) } });
const json = async (...a) => (await api(...a)).json();
const su = (await json('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' }) })).token;

// full registry
console.log('registry import…');
execSync(`node test/registry.cjs ${registry} --json ${join(DATA, 'rows.json')}`, { cwd: root, stdio: 'ignore' });
const rows = JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8'));
let t0 = Date.now(), rssBefore = rss(), cpuBefore = cpu();
for (let i = 0; i < rows.length; i += 2000) {
  await json('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows: rows.slice(i, i + 2000) }) }, su);
}
const importSec = (Date.now() - t0) / 1000;
console.log(`  ${rows.length} rows in ${importSec.toFixed(1)} s · RSS ${rss().toFixed(0)} MB · CPU ${(cpu() - cpuBefore).toFixed(1)} s`);

// four users
const users = ['a', 'b', 'c', 'd'].map((x) => ({ email: `user-${x}@firma.uz`, name: 'Xodim ' + x.toUpperCase() }));
for (const u of users) await api('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ ...u, password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', role: 'ekspert', active: true, emailVisibility: true }) }, su);
for (const u of users) {
  const { otpId } = await json('/api/collections/users/request-otp', { method: 'POST', body: JSON.stringify({ email: u.email }) });
  await new Promise((r) => setTimeout(r, 400));
  const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
  const r = await json('/api/collections/users/auth-with-otp', { method: 'POST', body: JSON.stringify({ otpId, password: code }) });
  u.token = r.token; u.id = r.record.id;
}
const apps = (await json('/api/collections/applications/records?perPage=8&sort=-registered_at', {}, su)).items;
const bytes = readFileSync(smeta);
const REGIONS = ['fargona', 'andijon', 'buxoro', 'toshkent_sh'];

// a realistic state blob: 1172 resources with prices, project/sheet structure
const state = { projects: [{ file: 'a.xlsx', fileId: null, name: 'Loyiha', intro: 'x'.repeat(200), enabled: true, open: true, objects: Array.from({ length: 14 }, (_, i) => ({ name: 'Varaq ' + i, enabled: true })) }], files: {}, prices: {}, opts: { stamp: 'x'.repeat(120) }, mode: 'changed' };
for (let i = 0; i < 1172; i++) state.prices['РЕСУРС НОМИ ' + i + '␟м3␟' + (1000 + i)] = 12345 + i;
const stateBytes = Buffer.byteLength(JSON.stringify(state));

const stat = {};
const timed = async (name, fn) => { const s = Date.now(); const r = await fn(); (stat[name] = stat[name] || []).push(Date.now() - s); return r; };
const NAMES = Array.from({ length: 40 }, (_, i) => 'РЕСУРС НОМИ ' + i);

async function session(u, i) {
  const app = apps[i];
  const region = REGIONS[i % REGIONS.length];
  // 1. list + search, as the app does on the list screen
  await timed('ro\'yxat (50 ta ariza)', () => json('/api/collections/applications/records?perPage=50&sort=-registered_at,-number&expand=contragent', {}, u.token));
  await timed('qidiruv', () => json(`/api/collections/applications/records?perPage=50&expand=contragent&filter=${encodeURIComponent(`(number ~ "${app.number}" || org_name ~ "Buxoro" || project_title ~ "Buxoro")`)}`, {}, u.token));
  await timed('ish maydonlari ro\'yxati', () => json('/api/collections/workspaces/records?perPage=200&expand=updated_by', {}, u.token));
  // 2. open a workspace
  const ws = await timed('ish maydonini yaratish', () => json('/api/collections/workspaces/records', { method: 'POST', body: JSON.stringify({ application: app.id, region, status: 'in_progress', changed: 0, opened_by: u.id, updated_by: u.id, state: {} }) }, u.token));
  // 3. upload a smeta file
  const fd = new FormData();
  fd.append('files+', new Blob([bytes]), 'smeta.xlsx');
  const up = await timed(`fayl yuklash (${(bytes.length / 1048576).toFixed(1)} MB)`, () => json(`/api/collections/workspaces/records/${ws.id}`, { method: 'PATCH', body: fd }, u.token));
  // 4. autosave the assembled state, as the user works
  for (let k = 0; k < 8; k++) {
    await timed(`avtosaqlash (${(stateBytes / 1024).toFixed(0)} KB)`, () => json(`/api/collections/workspaces/records/${ws.id}`, { method: 'PATCH', body: JSON.stringify({ state, changed: k * 5, updated_by: u.id }) }, u.token));
  }
  // 5. corrections, one per changed price
  for (let k = 0; k < 25; k++) {
    await timed('narx tuzatish', () => json('/api/collections/corrections/records', { method: 'POST', body: JSON.stringify({ workspace: ws.id, application: app.id, region, res_key: 'K' + k + '␟' + i, name: 'РЕСУРС НОМИ ' + k, name_key: 'РЕСУРС НОМИ ' + k, unit: 'м3', unit_key: 'М3', smeta_price: 1000 + k, market_price: 900 + k, by: u.id }) }, u.token));
  }
  // 6. price hints — the heaviest read the app makes
  for (let c = 0; c < 3; c++) {
    const ors = NAMES.map((n) => `name_key = "${n}"`).join(' || ');
    await timed('narx eslatmalari', () => json(`/api/collections/corrections/records?perPage=500&sort=-updated&expand=application,contragent,by&filter=${encodeURIComponent(`region = "${region}" && workspace != "${ws.id}" && (${ors})`)}`, {}, u.token));
  }
  // 7. reopen: download the files again
  const f = up.files[0];
  await timed(`fayl yuklab olish (${(bytes.length / 1048576).toFixed(1)} MB)`, async () => (await api(`/api/files/workspaces/${ws.id}/${f}`, {}, u.token)).arrayBuffer());
  // 8. export stored on the server
  const ex = new FormData();
  ex.append('workspace', ws.id); ex.append('application', app.id); ex.append('mode', 'changed'); ex.append('by', u.id);
  ex.append('file', new Blob([bytes.subarray(0, 600000)]), 'export.xlsx');
  await timed('eksportni saqlash (0.6 MB)', () => json('/api/collections/exports/records', { method: 'POST', body: ex }, u.token));
}

console.log('4 users, concurrent…');
rssBefore = rss(); cpuBefore = cpu(); t0 = Date.now();
await Promise.all(users.map((u, i) => session(u, i)));
const wall = (Date.now() - t0) / 1000;
const cpuUsed = cpu() - cpuBefore;
const dbSize = statSync(join(DATA, 'data.db')).size / 1048576;
const storage = execSync(`du -sm ${join(DATA, 'storage')}`).toString().split('\t')[0];

const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`\nwall ${wall.toFixed(1)} s · CPU ${cpuUsed.toFixed(1)} s (${(cpuUsed / wall * 100).toFixed(0)}% of one core) · RSS ${rssBefore.toFixed(0)} -> ${rss().toFixed(0)} MB`);
console.log(`db ${dbSize.toFixed(1)} MB · storage ${storage} MB\n`);
console.log('operatsiya'.padEnd(34), 'n'.padStart(4), 'p50'.padStart(7), 'p95'.padStart(7), 'max'.padStart(7));
for (const [k, v] of Object.entries(stat)) {
  console.log(k.padEnd(34), String(v.length).padStart(4), (pct(v, .5) + ' ms').padStart(7), (pct(v, .95) + ' ms').padStart(7), (Math.max(...v) + ' ms').padStart(7));
}
server.kill();
