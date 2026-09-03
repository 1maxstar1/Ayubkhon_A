/*
 * Full walkthrough on a fresh database with the real files, capturing a
 * screenshot at every step. Produces test/walkthrough/*.png and a JSON summary.
 *
 *   node test/walkthrough.mjs <Report_1.xls> <smeta1.xlsx> <smeta2.xlsx>
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [registry, ...smetas] = process.argv.slice(2);
if (!registry || smetas.length < 2) { console.error('usage: node test/walkthrough.mjs Report_1.xls a.xlsx b.xlsx'); process.exit(1); }
for (const f of [registry, ...smetas]) if (!existsSync(f)) { console.error('missing ' + f); process.exit(1); }

const PORT = 8100, BASE = `http://127.0.0.1:${PORT}`;
const DATA = join(root, 'server/pb_data_walk');
const SHOTS = join(root, 'test/walkthrough');
const steps = [];
let n = 0;
const shot = async (page, title, note, full) => {
  const file = join(SHOTS, String(++n).padStart(2, '0') + '.png');
  await page.screenshot({ path: file, fullPage: !!full });
  steps.push({ n, title, note, file });
  console.log(`  [${n}] ${title} — ${note}`);
};

rmSync(DATA, { recursive: true, force: true });
console.log('setup…');
execSync('sh server/setup.sh', { cwd: root, stdio: 'ignore', env: { ...process.env, PB_DATA_DIR: 'pb_data_walk', PB_ADMIN_EMAIL: 'admin@example.com', PB_ADMIN_PASS: 'adminpass1234', PB_SETUP_PORT: '8101' } });
execSync('node build.mjs --serve', { cwd: root, stdio: 'ignore' });
const server = spawn('sh', ['server/run.sh'], { cwd: root, env: { ...process.env, PB_DATA_DIR: 'pb_data_walk', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '1' }, stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (p, o = {}, t) => (await fetch(BASE + p, { ...o, headers: { 'content-type': 'application/json', ...(t ? { Authorization: t } : {}) } })).json();
const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' }) })).token;
for (const u of [
  { email: 'boss@firma.uz', name: 'Rahbar', role: 'admin' },
  { email: 'ekspert@firma.uz', name: 'Ekspert Xodim', role: 'ekspert' }
]) await api('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ ...u, password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', active: true, emailVisibility: true }) }, su);

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const timings = {};
const code = () => readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n').pop().match(/code=(\d+)/)[1];
async function signIn(email) {
  // the admin session carries over between pages — sign out before switching user
  if (await page.$('#signOut')) {
    await page.click('#signOut');
    await page.waitForSelector('#screen-login:not([hidden])');
  }
  await page.fill('#loginEmail', email);
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await page.fill('#loginCode', code());
  await page.click('#loginBtn');
  await page.waitForSelector('#who');
}

try {
/* 1-2. sign-in ---------------------------------------------------------- */
console.log('sign-in…');
await page.goto(BASE + '/');
await shot(page, 'Kirish ekrani', 'Parol yo\'q — faqat ish pochtasi');
await page.fill('#loginEmail', 'ekspert@firma.uz');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await page.fill('#loginCode', code());
await shot(page, 'Bir martalik kod', 'Pochtaga 8 xonali kod ketadi, 5 daqiqa amal qiladi');

/* 3. admin: full registry ------------------------------------------------ */
console.log('registry upload…');
await page.goto(BASE + '/admin.html');
await signIn('boss@firma.uz');
let t = Date.now();
await page.setInputFiles('#regFile', registry);
await page.waitForFunction(() => document.getElementById('regStat').textContent.includes('qator'), null, { timeout: 15 * 60000 });
timings.registryFirst = Math.round((Date.now() - t) / 1000);
await page.fill('#uEmail', 'yangi@firma.uz');
await page.fill('#uName', 'Yangi Xodim');
await page.click('#userForm button[type=submit]');
await page.waitForFunction(() => document.body.textContent.includes('yangi@firma.uz'));
await shot(page, 'Administrator sahifasi', `Haqiqiy reyestr (28 337 qator) ${timings.registryFirst} soniyada yuklandi`, true);
t = Date.now();
await page.setInputFiles('#regFile', registry);
await page.waitForFunction(() => document.getElementById('regStat').textContent.includes('yangilandi 2'), null, { timeout: 15 * 60000 });
timings.registrySecond = Math.round((Date.now() - t) / 1000);
timings.registryStat2 = await page.textContent('#regStat');
await shot(page, 'Reyestrni qayta yuklash', `Bir xil fayl ikkinchi marta: ${timings.registryStat2}`, true);

/* 4. application list ---------------------------------------------------- */
console.log('list…');
await page.goto(BASE + '/');
await signIn('ekspert@firma.uz');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length >= 50);
const total = await page.textContent('#appCount');
await shot(page, 'Arizalar ro\'yxati', `Reyestrdagi barcha arizalar: ${total.split('/')[1].trim()}`);
t = Date.now();
await page.fill('#appQ', '67159');
await page.waitForFunction(() => document.querySelectorAll('#appTable tbody tr').length === 1);
timings.search = Date.now() - t;
await shot(page, 'Qidiruv', `Raqam, kontragent, STIR yoki loyiha nomi bo'yicha — ${timings.search} ms`);

/* 5. region + workspace -------------------------------------------------- */
console.log('workspace…');
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
await page.selectOption('#regionSel', 'fargona');
await shot(page, 'Viloyat tanlash', 'Fayl yuklashdan oldin bir marta; ariza matnidan taklif qilinadi');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
t = Date.now();
await page.setInputFiles('#pick', smetas);
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100 && S.Sync.ws.files.length === 2 && !S.Sync.dirty, null, { timeout: 120000 });
timings.load = Math.round((Date.now() - t) / 1000);
const model = await page.evaluate(() => ({ projects: app.projects.length, rows: app.model.rows.length, res: app.model.resources.length }));
await shot(page, 'Narxlarni tekshirish', `${model.projects} ta smeta fayli, ${model.res} ta resurs — ${timings.load} soniyada`);

/* 6. edit a price -------------------------------------------------------- */
const picked = await page.evaluate(() => {
  const rs = app.model.resources.filter((x) => x.price > 5000 && x.qty > 0).slice(0, 3);
  rs.forEach((r) => app.setPrice(r.key, Math.round(r.price * 0.85)));
  return rs.map((r) => ({ key: r.key, nk: r.nk, name: r.name, price: r.price, market: Math.round(r.price * 0.85) }));
});
await page.waitForFunction(() => !S.Sync.dirty && document.getElementById('wsSave').textContent === '✓', null, { timeout: 20000 });
await page.selectOption('#filter', 'changed');
await page.waitForTimeout(300);
await shot(page, 'O\'zgartirilgan narxlar', 'Har tuzatish darhol serverga yoziladi (yuqorida ✓)');
await page.click('.tab[data-pane="sheet"]');
await page.waitForTimeout(400);
await shot(page, 'Yig\'ilgan jadval', 'Barcha ko\'chalar bitta ro\'yxatda, A ustuni raqamlari bilan; narx shu yerda ham tahrirlanadi');
await page.click('.tab[data-pane="report"]');
await page.waitForTimeout(600);
await shot(page, 'Hisobot ko\'rinishi', 'Excel faylga tushadigan TAQQOSLASH JADVALI №2');

/* 7. export -------------------------------------------------------------- */
console.log('export…');
await page.click('.tab[data-pane="prices"]');
t = Date.now();
await page.click('#export');
await page.waitForFunction(() => document.getElementById('toast').textContent.includes('serverda saqlandi'), null, { timeout: 120000 });
timings.export = Math.round((Date.now() - t) / 1000);
await shot(page, 'Excel eksport', `Fayl yuklab olinadi va serverda saqlanadi — ${timings.export} soniya`);
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])');

/* 8. hints in another application of the same region --------------------- */
console.log('hints…');
const other = (await api(`/api/collections/applications/records?perPage=3&filter=${encodeURIComponent('number != "67159"')}`, {}, su)).items[1];
await page.fill('#appQ', other.number);
await page.waitForFunction((num) => { const t = document.querySelector('#appTable tbody'); return t && t.textContent.includes(num); }, other.number);
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForSelector('#screen-region:not([hidden])');
await page.selectOption('#regionSel', 'fargona');
await page.click('#regionForm button[type=submit]');
await page.waitForSelector('#wsBox:not([hidden])');
await page.setInputFiles('#pick', [smetas[0]]);
await page.waitForFunction(() => window.app && window.app.model && !S.Sync.dirty, null, { timeout: 120000 });
await page.waitForFunction(() => Object.keys(S.Hints.map).length > 0, null, { timeout: 30000 });
await page.selectOption('#filter', 'hint');
await page.waitForTimeout(400);
await page.click('#priceScroll .tagh');
await page.waitForSelector('#hintPop:not([hidden])');
await shot(page, 'Narx eslatmalari', 'Shu viloyatdagi oldingi loyihalar narxlari; shu kontragent yuqorida turadi');
await page.click('#wsList');
await page.waitForSelector('#screen-list:not([hidden])');

/* 9. application card ---------------------------------------------------- */
await page.fill('#appQ', '67159');
await page.waitForFunction(() => {
  const rows = document.querySelectorAll('#appTable tbody tr');
  return rows.length === 1 && rows[0].textContent.includes('67159');
});
await page.click('#appTable tbody tr button[data-act=card]');
await page.waitForSelector('#screen-card:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#cardExports li a').length >= 1);
await shot(page, 'Ariza kartochkasi', 'Reyestr maydonlari, yuklangan fayllar va eksportlar tarixi');

/* 10. reopen: everything comes back -------------------------------------- */
console.log('reopen…');
await page.click('#cardClose');
await page.reload();
await page.waitForSelector('#screen-list:not([hidden])');
await page.fill('#appQ', '67159');
await page.waitForFunction(() => {
  const rows = document.querySelectorAll('#appTable tbody tr');
  return rows.length === 1 && rows[0].textContent.includes('67159');
});
t = Date.now();
await page.click('#appTable tbody tr button[data-act=open]');
await page.waitForFunction(() => window.app && window.app.model && window.app.model.rows.length > 100 && !S.Sync.loading, null, { timeout: 180000 });
timings.reopen = Math.round((Date.now() - t) / 1000);
const after = await page.evaluate((p) => ({
  projects: app.projects.length, rows: app.model.rows.length, res: app.model.resources.length,
  prices: p.map((x) => app.prices[x.key]), changed: app.model.resources.filter((r) => !S.near(r.price, r.market)).length
}), picked);
await page.selectOption('#filter', 'changed');
await page.waitForTimeout(300);
await shot(page, 'Qayta ochish', `Fayllar va ${after.changed} ta tuzatilgan narx ${timings.reopen} soniyada tiklandi`);

const counts = {};
for (const c of ['applications', 'contragents', 'workspaces', 'corrections', 'exports', 'registry_imports', 'users']) {
  counts[c] = (await api(`/api/collections/${c}/records?perPage=1`, {}, su)).totalItems;
}
const ok = {
  restored: after.projects === model.projects && after.rows === model.rows && after.res === model.res,
  prices: picked.every((p, i) => after.prices[i] === p.market),
  changed: after.changed === picked.length
};
await browser.close();
server.kill();
writeFileSync(join(SHOTS, 'summary.json'), JSON.stringify({ steps, timings, model, after, ok, counts, errors }, null, 1));
console.log('\ncounts', counts);
console.log('timings', timings);
console.log('restored', ok);
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
console.log(ok.restored && ok.prices && ok.changed && !errors.length ? 'walkthrough OK' : 'WALKTHROUGH PROBLEM');

} catch (err) {
  console.log('\nSTEP FAILED: ' + err.message.split('\n')[0]);
  console.log('page errors:\n' + (errors.join('\n') || '(none)'));
  await page.screenshot({ path: join(SHOTS, 'failure.png'), fullPage: true });
  await browser.close(); server.kill();
  process.exit(1);
}
