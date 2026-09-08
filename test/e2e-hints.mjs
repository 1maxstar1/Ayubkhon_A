/*
 * Price hints across workspaces: prices set for one application appear as
 * hints in another application of the same region (other contragent), and
 * do not appear in a different region. Needs node build.mjs --serve.
 *
 *   node test/e2e-hints.mjs [a.xlsx]
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const UP = '/root/.claude/uploads/8af525ef-a19a-5966-9772-c57eec709e1c/';
const smeta = process.argv[2] || UP + 'f668c710-_____________4______27_12_2024__4_2022_2________.xlsx';
if (!existsSync(smeta)) { console.error('smeta file not found; pass an .xlsx path'); process.exit(1); }
const PORT = 8097, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_test');

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
const api = async (path, opts = {}, token) => (await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) } })).json();
const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' }) })).token;
const rows = JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8'));
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
// three applications: A (first), B (other contragent), C (same contragent as A, if any)
const A = rows[0];
const B = rows.find((r) => r.inn && r.inn !== A.inn);
const C = rows.find((r) => r.inn === A.inn && r.number !== A.number);
console.log('applications:', A.number, B.number, C ? C.number : '(no second application for the same contragent)');

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/*
 * The hint queries ask for only the columns the popover reads. Without that
 * projection every row arrives carrying a full copy of its application, its
 * contragent and its author — the same twenty applications repeated a thousand
 * times each. Measured against a region holding 18 000 corrections: 30.2 MB
 * before, 7.5 MB after, over an office connection to a VPS.
 */
const hintQueries = [];
page.on('response', async (r) => {
  if (!/\/api\/collections\/corrections\/records/.test(r.url())) return;
  try { hintQueries.push({ url: r.url(), body: await r.json() }); } catch (e) { /* page moved on */ }
});

async function openApp(number, region) {
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', number);
  await page.waitForFunction((n) => { const tr = document.querySelector('#appTable tbody tr'); return tr && tr.textContent.includes(n) && document.querySelectorAll('#appTable tbody tr').length >= 1; }, number);
  await page.click(`#appTable tbody tr:has-text("${number}") button[data-act=open]`);
  if (region) {
    await page.waitForSelector('#screen-region:not([hidden])');
    await page.selectOption('#regionSel', region);
    await page.click('#regionForm button[type=submit]');
  }
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.setInputFiles('#pick', [smeta]);
  await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 50 && S.Sync.ws.files.length === 1 && !S.Sync.loading, null, { timeout: 90000 });
}
async function closeApp() {
  await page.click('#wsList');
  await page.waitForSelector('#screen-list:not([hidden])');
}

await page.goto(BASE + '/');
await page.fill('#loginEmail', 'test@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
const code = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
await page.fill('#loginCode', code);
await page.click('#loginBtn');

// A: set two prices
await openApp(A.number, 'fargona');
const picked = await page.evaluate(() => {
  const rs = app.model.resources.filter((x) => x.price > 1000).slice(0, 2);
  rs.forEach((r) => app.setPrice(r.key, Math.round(r.price * 1.2)));
  return rs.map((r) => ({ key: r.key, nk: r.nk, mk: r.mk, name: r.name, price: r.price, market: Math.round(r.price * 1.2) }));
});
await page.evaluate(() => S.Sync.q);
await page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 15000 });
check(await page.evaluate(() => Object.keys(S.Hints.map).length === 0), 'no hints inside the first workspace');
await closeApp();

// B: same region, other contragent -> hints
await openApp(B.number, 'fargona');
try {
  await page.waitForFunction(() => Object.keys(S.Hints.map).length > 0, null, { timeout: 20000 });
} catch (e) {
  console.log('DEBUG toast:', await page.textContent('#toast'), '| fetched:', await page.evaluate(() => Object.keys(S.Hints.fetched).length),
    '| ws:', await page.evaluate(() => S.Sync.ws && S.Sync.ws.region), '| corrections:', (await api('/api/collections/corrections/records?perPage=1', {}, su)).totalItems);
  console.log(errors.join('\n'));
  throw e;
}
const hb = await page.evaluate((p) => p.map((x) => S.Hints.for(x.mk)), picked);
check(hb.every((h) => h.length === 1), 'one hint per resource in the same region');
check(hb.every((h, i) => h[0].price === picked[i].market), 'hint price is the market price set in A');
check(hb.every((h) => h[0].same === false), 'other contragent -> not marked as the same');
check(hb[0][0].number === A.number, 'hint comes from application A');

const projected = hintQueries.filter((q) => /fields=/.test(q.url));
check(projected.length === hintQueries.length && projected.length > 0,
  `every corrections query names the columns it wants (${projected.length} of ${hintQueries.length})`);
const one = projected.map((q) => (q.body.items || []).find((i) => i.expand && i.expand.application)).find(Boolean);
check(!!one, 'one of them brought an application along');
const need = ['id', 'name', 'unit', 'region', 'contragent', 'market_price', 'smeta_price', 'note', 'updated'];
check(need.every((k) => k in one),
  'and the row still carries everything the popover reads' +
  (need.every((k) => k in one) ? '' : ': missing ' + need.filter((k) => !(k in one)).join(', ')));
check(!('number' in one) && Object.keys(one.expand.application).length <= 3,
  `the application it carries is a couple of columns, not the whole record (${Object.keys(one.expand.application).join(', ')})`);
await page.selectOption('#filter', 'hint');
await page.waitForFunction(() => document.querySelectorAll('#priceScroll .vrow').length === 2);
check(true, 'filter «Eslatmasi borlar» lists exactly the two resources');
check((await page.textContent('#priceCount')).includes('с подсказками 2'), 'status line counts hinted resources');
check(await page.evaluate(() => Object.keys(S.Hints.map).every((k) => k.indexOf('\u241F') > 0)), 'hints are keyed by name and unit together');
await page.click('#priceScroll .tagh');
await page.waitForSelector('#hintPop:not([hidden])');
check((await page.textContent('#hintPop')).includes(A.number), 'popover names the source application');
await page.click('#hintPop button[data-i="0"]');
await page.waitForFunction(() => document.getElementById('hintPop').hidden);
const applied = await page.evaluate((p) => p.map((x) => app.prices[x.key]), picked);
check(applied.includes(picked[0].market) || applied.includes(picked[1].market), 'Qo\'llash applied the hinted price');
await page.evaluate(() => S.Sync.q);
await page.waitForFunction(() => !S.Sync.dirty, null, { timeout: 15000 });
await closeApp();

// C: same contragent as A (when the fixture has one) -> "same" first
if (C) {
  await openApp(C.number, 'fargona');
  await page.waitForFunction(() => Object.keys(S.Hints.map).length > 0, null, { timeout: 20000 });
  const hc = await page.evaluate((mk) => S.Hints.for(mk), picked[0].mk);
  check(hc.length === 2 && hc[0].same === true && hc[0].number === A.number, 'same contragent hint ranks first (' + hc.map((h) => h.number + (h.same ? '*' : '')).join(', ') + ')');
  await closeApp();
}

// The second tier: a name close to one already priced, offered with a score.
await openApp(B.number);          // the region was chosen the first time round
await page.waitForFunction(() => Object.keys(S.Hints.map).length > 0, null, { timeout: 20000 });
const near = await page.evaluate(() => {
  // A long name with one character dropped is the everyday typo. It must still
  // find its resource, and «АНКЕР М5» must still never find «АНКЕР М8».
  const names = app.model.resources.map((r) => r.name).filter((n) => n.length > 25);
  const src = names.sort((a, b) => b.length - a.length)[0];
  const cut = Math.floor(src.length / 2);
  const typo = src.slice(0, cut) + src.slice(cut + 1);
  const cands = [{ name: src, unit: '', price: 1000 }];
  return {
    src: src, typo: typo,
    score: S.similarity(typo, src, S.idfOf([src])),
    best: S.bestMatches(typo, '', cands).length,
    sizes: S.similarity('АНКЕР М5', 'АНКЕР М8', {})
  };
});
check(near.score >= 0.85 && near.best === 1,
  `a mistyped name still finds its resource (${near.score}, ${near.best} suggestion)`);
check(near.sizes === 0, 'and two sizes of one part never do');

/*
 * Scoring a project's unmatched resources against a region's history is the
 * expensive half of the hints. It used to be redone in full on every rebuild —
 * ticking a project, ticking a street, reordering — because a resource that
 * found nothing was never recorded as having found nothing. Measured on a real
 * corpus at ~7.7 s of frozen tab per click. Counted here in calls rather than
 * milliseconds, so the check says what it means: the second pass over the same
 * pool must do no scoring at all.
 */
// The neighbourhood is fetched in the background after the exact matches, so
// wait until there is something to score before counting the scoring.
await page.waitForFunction(() => S.Hints.pool.length > 0, null, { timeout: 20000 });
const scoring = await page.evaluate(() => {
  const open = app.model.resources.filter((r) => !S.Hints.hasRow(r));
  const real = S.bestMatches;
  let calls = 0;
  S.bestMatches = function () { calls++; return real.apply(null, arguments); };
  S.Hints.sim = {}; S.Hints.simAt = {};
  S.Hints.rankSimilar(open);
  const first = calls; calls = 0;
  S.Hints.rankSimilar(open);
  const second = calls;
  const widened = S.Hints.pool.length;
  S.Hints.pool = S.Hints.pool.concat(S.Hints.pool.slice(0, 1));
  S.Hints.rankSimilar(open);
  const afterWiden = calls - second;
  S.Hints.pool.length = widened;
  S.bestMatches = real;
  return { open: open.length, first, second, afterWiden };
});
check(scoring.first === scoring.open,
  `every unmatched resource is scored once (${scoring.first} of ${scoring.open})`);
check(scoring.second === 0, `and not again for the same pool (${scoring.second})`);
check(scoring.afterWiden === scoring.open,
  `but all of them again once the pool widens (${scoring.afterWiden})`);

await closeApp();

// D: other region -> nothing
const D = rows.find((r) => r.inn && r.inn !== A.inn && r.number !== B.number && (!C || r.number !== C.number));
await openApp(D.number, 'andijon');
await new Promise((r) => setTimeout(r, 2500));
check(await page.evaluate(() => Object.keys(S.Hints.map).length === 0), 'different region -> no hints');
await page.screenshot({ path: join(root, 'test/shot-hints.png') });
await closeApp();

await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); fail++; }
console.log(fail ? `FAILED (${fail})` : 'e2e-hints OK');
process.exit(fail ? 1 : 0);
