/*
 * «Обучение» → «Набор для обучения» in a real browser (docs/ai-reja.md, phase 3). Server mode; the synthetic reference
 * package (test/refs-fixture.cjs) and invented finished prices — no real name, price or document.
 *
 *   - with no finished price, and then with no active package, the page says so and builds nothing;
 *   - «Собрать и измерить» asks the reference again for every finished price, in the reference worker, and shows
 *     counts and today's metrics — the same numbers test/ml.cjs computes under Node;
 *   - while it builds, the browser only reads from the server: nothing is sent out;
 *   - neither the table, nor «Скопировать числа», nor the saved file carries a name, a price or a document;
 *   - the numbers of the last run are shown again after a reload;
 *   - a hand-labelled list (JSON or a table) is kept in this browser, measured apart, and can be removed.
 *
 *   node test/e2e-dataset.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { load } = require('./load.cjs');
const F = require('./refs-fixture.cjs');
const S = load(load.CORE, load.REFS, load.ML, 'xlsx');
const P = F.PRICES, REGION = 'xorazm', ASOF = '2026-06-30';

const pb = await startServer({ port: 8166, build: true, registry: true });
const { api, su } = pb;
const boss = await api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
}, su);
const regRows = pb.rows();
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows: regRows }) }, su);
const dir = mkdtempSync(join(tmpdir(), 'e2e-dataset-'));

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const SEC = 1000;
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
const sent = [];
page.on('request', (r) => { if (r.method() !== 'GET') sent.push(r.method() + ' ' + new URL(r.url()).pathname); });

/* five finished applications with the same eight prices each, and a sixth name in the newest (as test/ml.cjs) */
let n = 0;
const row = (name, unit, over) => Object.assign({ region: REGION, name, unit, section: 'materials', match_key: S.matchKey(name), match_unit_key: S.matchUnitKey(unit),
  res_key: 'r' + (++n), kind: 'corrected', source: 'typed', smeta_price: 0, final_price: 0, asof: ASOF, accepted: false }, over || {});
const PID = F.makePackage().package_id;
const eight = () => [
  row('Бетон тяжёлый В15', 'м3', { source: 'ref:' + PID + ':9', final_price: P.g, smeta_price: P.h, accepted: true }),
  row('Кабель ВВГ 3х2,5', 'м', { source: 'typed', final_price: P.a, smeta_price: P.b }),
  row('Анкер М8', 'шт', { source: 'typed', final_price: P.typed, smeta_price: P.d }),
  row('Экскаватор одноковшовый 0,65 м3', 'маш-ч', { section: 'machines', kind: 'untouched', source: '', smeta_price: P.e * 1.5, final_price: P.e * 1.5 }),
  row('Затраты труда рабочих-строителей', 'чел-ч', { section: 'labor', kind: 'checked', source: '', smeta_price: P.a * 0.9, final_price: P.a * 0.9 }),
  row('Краска масляная белая МА-15', 'кг', { source: 'typed', final_price: P.typed, smeta_price: P.a }),
  row('Кабель ВВГ 3х4', 'м', { source: 'pct', final_price: P.c * 0.9, smeta_price: P.c }),
  row('Труба стальная электросварная 57х3,5', 'т', { kind: 'zeroed', source: '', final_price: 0, smeta_price: P.f })
];
async function seed() {
  const days = ['2026-03-01', '2026-03-05', '2026-04-01', '2026-05-01', '2026-06-01'];
  const withInn = regRows.filter((r) => r.inn).slice(0, days.length);
  for (let i = 0; i < days.length; i++) {
    const app = (await api('/api/collections/applications/records?perPage=1&filter=' + encodeURIComponent(`number='${withInn[i].number}'`), {}, su)).items[0];
    const ws = await api('/api/collections/workspaces/records', { method: 'POST',
      body: JSON.stringify({ application: app.id, region: REGION, status: 'done', opened_by: boss.id, updated_by: boss.id }) }, su);
    const rows = eight();
    if (i === days.length - 1) rows.push(row('Перевозка грузов 20 т 15 км', 'т-км', { source: 'typed', final_price: P.a / 1000, smeta_price: P.c }));
    for (const r of rows) {
      const made = await api('/api/collections/price_memory/records', { method: 'POST',
        body: JSON.stringify(Object.assign({}, r, { workspace: ws.id, application: app.id, finished: days[i], by: boss.id })) }, su);
      if (!made.id) throw new Error('price_memory row not created: ' + JSON.stringify(made));
    }
  }
}
async function upload() {
  const pkg = F.makePackage(), bytes = F.gzip(pkg), fd = new FormData();
  const fields = { package_id: pkg.package_id, sha256: createHash('sha256').update(bytes).digest('hex'), manifest: JSON.stringify(S.refs.pkg.manifest(pkg)),
    records: String(pkg.counts.records), sources: String(pkg.counts.sources), date_min: pkg.date_min, date_max: pkg.date_max };
  for (const k of Object.keys(fields)) fd.append(k, fields[k]);
  fd.append('file', new Blob([bytes], { type: 'application/gzip' }), pkg.package_id + '.json.gz');
  const r = await fetch(pb.base + '/api/collections/ref_packages/records', { method: 'POST', headers: { Authorization: await pb.signIn('boss@example.com') }, body: fd });
  if (r.status !== 200) throw new Error('package not uploaded: ' + r.status);
}
const built = () => page.waitForFunction(() => !S.DatasetAdmin.busy && !document.getElementById('dsBuild').disabled &&
  (!document.getElementById('dsErr').hidden || !document.getElementById('dsTable').hidden), null, { timeout: 90 * SEC });
const build = async () => { await page.click('#dsBuild'); await page.waitForFunction(() => S.DatasetAdmin.busy || !document.getElementById('dsErr').hidden); await built(); };
const cell = (k) => page.evaluate((key) => { const tr = document.querySelector('#dsTable tr[data-k="' + key + '"]'); return tr ? tr.lastElementChild.textContent : null; }, k);
const secret = (s) => Object.keys(P).some((k) => s.indexOf(String(P[k])) >= 0 || s.indexOf(String(Math.round(P[k]))) >= 0 || s.indexOf(String(Math.floor(P[k]))) >= 0) ||
  /fake-src|Бетон|Кабель|Анкер|Экскаватор|Перевозка|Краска|Труба|Тест-Поставщик/.test(s);

try {
  await page.goto(pb.base + '/admin.html');
  await page.fill('#loginEmail', 'boss@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await new Promise((r) => setTimeout(r, 700));
  await page.fill('#loginCode', pb.lastCode('boss@example.com'));
  await page.click('#loginBtn');
  await page.waitForSelector('#adminMain:not([hidden])');
  check(await page.isVisible('#dsBuild') && await page.isDisabled('#dsCopy') && await page.isDisabled('#dsSave') && await page.isHidden('#dsTable'),
    '«Обучение» has «Собрать и измерить»; nothing to copy or save yet');

  /* nothing finished; then no package */
  await build();
  check(/нет ни одной завершённой заявки/.test(await page.textContent('#dsErr')) && await page.isHidden('#dsTable'), 'with no finished price it says so');
  await seed();
  await build();
  check(/Нет активного справочника/.test(await page.textContent('#dsErr')) && await page.isHidden('#dsTable') && await page.isHidden('#dsProgress'),
    'with no active reference package it says so, and the progress bar is gone');
  await upload();

  /* the build */
  sent.length = 0;
  await build();
  check(await page.isHidden('#dsErr') && await page.isVisible('#dsTable') && /Готово/.test(await page.textContent('#dsStat')), 'with a package and finished prices it builds and measures');
  check(sent.every((s) => s === 'POST /api/files/token') && sent.length <= 2, 'while it builds the browser only reads (one file token asked): ' + (sent.join(', ') || 'no writes'));
  const want = { rows: '41', applications: '5', 'applications.train': '4', 'applications.test': '1', queries: '21', 'queries.ref': '5', 'queries.near': '6', 'queries.none': '5', 'queries.left': '5',
    'queries.accepted_by_contractor': '5', 'skipped.above': '5', 'skipped.pct': '5', 'skipped.zeroed': '5', 'skipped.empty': '5', 'skipped.lost': '0',
    'p3.train.n_pos': '8', 'p3.train.n_none': '4', 'p3.test.n_pos': '3', 'p3.rank': '6 5 0 0 0 0 | lower 0 | not shown 0', schema: S.ml.features.HASH };
  const got = {};
  for (const k of Object.keys(want)) got[k] = await cell(k);
  check(JSON.stringify(got) === JSON.stringify(want), 'the counts are those of the seeded prices' + (JSON.stringify(got) === JSON.stringify(want) ? '' : ' — ' + JSON.stringify(got)));
  check(/^0\.500 \[/.test(await cell('p3.train.p1')) && /^1 \[/.test(await cell('p3.train.r3')) && /^0\.750 \[/.test(await cell('p3.train.mrr')) && /^0 \[/.test(await cell('p3.train.abstention')),
    'today\'s rules on the training part: first line right in half, always within three, never silent — as under Node');
  const labels = await page.evaluate(() => [...document.querySelectorAll('#dsTable tbody tr')].map((tr) => tr.firstElementChild.textContent));
  check(labels.every((l) => /[А-Яа-я]/.test(l) && !/^Прочее/.test(l)) && labels.some((l) => /проверочная часть/.test(l)) && !(await page.$('#dsTable tr[data-k^="lift."]')) &&
    !(await page.$('#dsTable tr[data-k^="price.w."]')), 'every row of the table is named in Russian; the per-feature lines stay out of the table');
  // the price model is fitted and measured in the same run, and only measured
  const pm = {};
  for (const k of ['price.rows', 'price.applications', 'price.applications.test', 'price.items', 'price.items.corrected', 'price.items.accepted', 'price.skipped.struck', 'price.skipped.pct',
    'price.model.test.n', 'price.model.tau', 'price.schema']) pm[k] = await cell(k);
  check(pm['price.rows'] === '41' && pm['price.applications'] === '5' && pm['price.applications.test'] === '1' && +pm['price.items'] > 20 && +pm['price.items.corrected'] >= 10 &&
    +pm['price.items.accepted'] >= 10 && pm['price.skipped.struck'] === '5' && pm['price.skipped.pct'] === '5' && +pm['price.model.test.n'] > 0 && +pm['price.model.tau'] > 0 &&
    pm['price.schema'] === S.ml.pricedata.HASH, 'the price model is fitted on the same finished prices and measured on the newest application (' + JSON.stringify(pm) + ')');
  const sel = [await cell('price.ref.selected'), await cell('price.anchor.selected'), await cell('price.model.selected')];
  check(sel.filter((v) => v === '1').length === 1 && /Модель цен · с обученной поправкой · из отмеченных/.test(labels.join('\n')) && /Пока это только измерение/.test(await page.textContent('#learnPanel')),
    'one of the three ways is selected, the rows are named, and the page says the model is only measured (' + sel.join('/') + ')');
  const text = await page.evaluate(() => S.DatasetAdmin.text());
  const panel = await page.evaluate(() => document.getElementById('learnPanel').innerText);
  check(!secret(text) && !/[А-Яа-я]/.test(text) && /^schema = f\d+-[0-9a-f]{8}$/m.test(text) && /^lift\.same_region = /m.test(text) && /^p3\.test\.p1 = /m.test(text) &&
    /^price\.model\.test\.precision = /m.test(text) && /^price\.w\.[a-z_]+ = /m.test(text),
    '«Скопировать числа» gives keys and numbers only — no name, no price, no document (' + text.split('\n').length + ' lines)');
  check(!secret(panel), 'the panel shows no name, price or document either');
  check(await page.isEnabled('#dsCopy') && await page.isEnabled('#dsSave'), 'the numbers can be copied and the dataset saved');

  /* the saved file */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dsSave')]);
  const file = join(dir, 'saved.json');
  await dl.saveAs(file);
  const raw = readFileSync(file, 'utf8'), ds = JSON.parse(raw);
  check(/\.dataset\.json$/.test(dl.suggestedFilename()) && ds.format === 'smeta-ml-dataset' && ds.schema.hash === S.ml.features.HASH && ds.queries.length === 21 &&
    ds.queries.every((q) => q.x.length === q.y.length && q.x.every((x) => x.length === S.ml.features.NAMES.length)),
    'the saved file is the dataset: ' + ds.queries.length + ' questions with feature numbers and labels (' + dl.suggestedFilename() + ')');
  check(!secret(raw) && !/[А-Яа-я]/.test(raw), 'and it carries no name, no price and no document');
  check(/сохранён в файл/.test(await page.textContent('#dsStat')), 'the page says where it went and to keep it outside the program\'s folder');

  /* a reload shows the last numbers */
  await page.reload();
  await page.waitForSelector('#adminMain:not([hidden])');
  await page.waitForSelector('#dsTable:not([hidden])');
  check((await cell('queries')) === '21' && /Последний расчёт/.test(await page.textContent('#dsStat')) && await page.isEnabled('#dsCopy'), 'after a reload the numbers of the last run are shown again');

  /* a hand-labelled list: JSON, then a table */
  const goldJson = join(dir, 'gold.json');
  writeFileSync(goldJson, JSON.stringify([{ name: 'Бетон тяжёлый В15', unit: 'м3', region: REGION, asof: ASOF, rid: 8 }, { name: 'Анкер М8', unit: 'шт', region: REGION, asof: ASOF, none: true },
    { name: 'Кабель ВВГ 3х4', unit: 'м', region: REGION, asof: ASOF, price: P.c }, { name: 'без региона', unit: 'шт', asof: ASOF, price: 5 }]));
  await page.setInputFiles('#dsGold', goldJson);
  await page.waitForFunction(() => /Проверочный список: 3 строк/.test(document.getElementById('dsGoldStat').textContent));
  check(/пропущено 1/.test(await page.textContent('#dsStat')) && await page.isVisible('#dsGoldDrop'), 'a JSON list is taken: three rows, the one without a region is skipped and counted');
  await build();
  check((await cell('queries.ref.gold')) === '1' && (await cell('p3.gold.n_pos')) === '2' && (await cell('p3.gold.n_none')) === '1' && (await cell('applications')) === '5' &&
    (await cell('p3.train.n_pos')) === '8', 'the list is measured apart: the applications and the training part are as before');
  const X = S.__XLSX, wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Проверочный список'], ['Наименование', 'Ед. изм.', 'Регион', 'Дата', 'Цена'],
    ['Бетон тяжёлый В15', 'м3', 'Хорезмская область', '30.06.2026', P.g], ['Анкер М8', 'шт', 'xorazm', '2026-06-30', P.typed]]), 'Лист1');
  const goldX = join(dir, 'gold.xlsx');
  writeFileSync(goldX, X.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await page.setInputFiles('#dsGold', goldX);
  await page.waitForFunction(() => /Проверочный список: 2 строк/.test(document.getElementById('dsGoldStat').textContent));
  await build();
  check((await cell('queries.near.gold')) === '1' && (await cell('queries.none.gold')) === '1' && (await cell('queries.ref.gold')) === null,
    'a table with a header row is taken too: the region by its name, the date as written');
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"not":"a list"}');
  await page.setInputFiles('#dsGold', bad);
  await page.waitForFunction(() => !document.getElementById('dsErr').hidden);
  check(/список строк/.test(await page.textContent('#dsErr')) && /Проверочный список: 2 строк/.test(await page.textContent('#dsGoldStat')), 'a file that is not a list is refused in words; the list kept stays');
  await page.click('#dsGoldDrop');
  await page.waitForFunction(() => document.getElementById('dsGoldDrop').hidden);
  await build();
  check((await cell('p3.gold.n_pos')) === null && (await cell('queries')) === '21' && (await page.evaluate(() => localStorage.getItem('smeta.ml.gold'))) === null, 'removed, it is gone from the browser and from the numbers');

  check((await pb.count('price_memory')) === 41 && (await pb.count('suggest_events')) === 0, 'the server holds what it held: nothing was written by any of it');
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
} catch (e) {
  check(false, 'the test ran to the end: ' + (e && e.stack || e));
} finally {
  await browser.close();
  await pb.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `\ne2e-dataset: ${fail} FAILED` : '\ne2e-dataset: all passed');
process.exit(fail ? 1 : 0);
