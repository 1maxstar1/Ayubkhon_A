/*
 * UZEX weekly quotes on the server (collections uzex_imports / uzex_quotes / uzex_settings, server/pb_hooks/uzex.pb.js),
 * through the API, against the stand-in site of test/uzex-site.mjs:
 *   only an administrator may sync; the listed weeks are stored whole, with every name told apart (unit, packing,
 *   forward, import, currency); a second sync fetches nothing, a forced one rewrites without duplicates; a site that
 *   is down, answers in another language, shows another week than asked or sends a broken row changes nothing and
 *   says why; a new week is added while the old ones stay; an administrator deletes a week with its quotes; the
 *   reference packages are never touched; the daily job follows the «Avtomatik yangilash» switch; and a price can
 *   be marked as taken from a stored week (corrections.source = uzex:<week>:<row>), not from one that is not there.
 *
 *   node test/uzex-api.mjs
 */
import { startServer } from './server.mjs';
import { startSite, week, sampleRows } from './uzex-site.mjs';

const site = await startSite(8145);
const env = { UZEX_BASE: site.base, UZEX_AUTO: '0' };
const pb = await startServer({ port: 8143, registry: true, env });
const { api } = pb;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

await api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
}, pb.su);
const boss = await pb.signIn('boss@example.com');
const expert = await pb.signIn('test@example.com');
const call = async (method, path, token, body) => {
  const r = await fetch(pb.base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: r.status === 204 ? {} : await r.json().catch(() => ({})) };
};
const quotes = async (importId) => {
  const imp = (await api(`/api/collections/uzex_imports/records?filter=${encodeURIComponent('import_id = ' + importId)}`, {}, expert)).items[0];
  if (!imp) return { imp: null, rows: [] };
  const rows = (await api(`/api/collections/uzex_quotes/records?perPage=500&sort=row_no&filter=${encodeURIComponent(`import = "${imp.id}"`)}`, {}, expert)).items;
  return { imp, rows };
};

try {
  const refsBefore = await pb.count('ref_packages');

  /* ------------------------------------------------------------- who may */
  check((await call('POST', '/api/uzex/sync', null)).status === 401, 'nobody syncs without signing in');
  check((await call('POST', '/api/uzex/sync', expert)).status === 403, 'an expert may not sync');
  check(Object.keys(site.hits).length === 0, 'and the site was not called for either');

  /* ------------------------------------------------------------- first sync */
  const a = (await call('POST', '/api/uzex/sync', boss)).body;
  check(a.ok === true && a.listed === 4 && a.added.length === 4 && a.kept === 0, `the four listed weeks are stored (${JSON.stringify(a).slice(0, 200)})`);
  check(await pb.count('uzex_imports') === 4 && await pb.count('uzex_quotes') === 10 + 2 + 10 + 1, 'four weeks, every row of each');
  const w = await quotes(204);
  check(w.imp.period_from === '2031-03-10' && w.imp.period_to === '2031-03-14' && w.imp.market === 'internal' && w.imp.lang === 'ru' &&
    w.imp.row_count === 10 && /Внутренние/.test(w.imp.label), 'the week keeps its period, market, language and label');
  const by = (name) => w.rows.find((r) => r.name === name) || {};
  const plain = by('Тестовый битум ТБ 90/60');
  check(plain.price === 1234.5 && plain.change === -65.5 && plain.change_pct < 0 && plain.unit === 'т' && plain.unit_assumed === true &&
    plain.currency === 'UZS' && plain.date_from === '2031-03-10', 'a name without a unit is per tonne, assumed; numbers with spaces and a comma are read');
  const fwd = by('Тестовый битум ТБ 40/60 (Форвард)');
  check(fwd.is_forward === true && fwd.item === 'Тестовый битум ТБ 40/60' && fwd.unit === 'т', '«(Форвард)» is a forward, not part of the item');
  const bag = by('Тестовый цемент ТЦ-400 (в мешках)');
  check(bag.packing === 'в мешках' && bag.unit === 'т' && bag.unit_assumed === true && bag.date_from === '2031-03-03' && bag.date_to === '2031-03-07',
    '«(в мешках)» is packing, the unit stays the tonne; the row keeps its own, older, dates');
  check(by('Тестовое масло ТМ-8 (литр)').unit === 'л' && by('Тестовое масло ТМ-8 (литр)').unit_assumed === false &&
    by('Тестовая труба ТТ 57х3 (метр)').unit === 'м', '«(литр)» and «(метр)» are units');
  const grade = by('Тестовый лист 5х1500 ст.Т1 (ТЕСТ 321)');
  check(grade.item === 'Тестовый лист 5х1500 ст.Т1 (ТЕСТ 321)' && grade.unit === 'т', 'any other bracket is part of the name');
  const usd = by('Тестовый растворитель ТР-4 (литр) (импорт) (доллар США)');
  check(usd.currency === 'USD' && usd.is_import === true && usd.unit === 'л' && usd.item === 'Тестовый растворитель ТР-4',
    'several brackets are read together: unit, import, dollars');
  check(by('Тестовый газ (импорт) (доллар США) (Форвард)').currency === 'USD' && by('Тестовый газ (импорт) (доллар США) (Форвард)').is_forward === true,
    'dollars and forward on one row');
  check(w.rows.every((r) => r.name_norm && r.name_norm === r.name_norm.toUpperCase()), 'every row has its match key');
  const ex = await quotes(205);
  check(ex.imp.market === 'export' && ex.rows.every((r) => r.currency === 'VAL'), 'export quotes are in foreign currency, named or not');

  /* ------------------------------------------------------------- again, and forced */
  const hits = site.hits['204'];
  const b = (await call('POST', '/api/uzex/sync', boss)).body;
  check(b.ok && b.added.length === 0 && b.kept === 4 && site.hits['204'] === hits, 'a second sync fetches no week again');
  const c = (await call('POST', '/api/uzex/sync?force=1', boss)).body;
  check(c.ok && c.added.length === 4 && await pb.count('uzex_imports') === 4 && await pb.count('uzex_quotes') === 23, 'a forced sync rewrites, without duplicates');
  check((await quotes(204)).imp.id === w.imp.id, 'and the week keeps its record (prices already applied still name it)');

  /* ------------------------------------------------------------- failures keep the data */
  site.mode = 'down';
  const d = (await call('POST', '/api/uzex/sync?force=1', boss)).body;
  check(d.ok === false && /не ответил/.test(d.message) && await pb.count('uzex_quotes') === 23, `a site that is down: an error, the data stays (${d.message})`);
  const st = (await call('GET', '/api/uzex/status', expert)).body;
  check(st.last_sync_status === 'error' && /не ответил/.test(st.last_sync_message) && st.auto === true, 'the status says so, and the switch is on by default');
  site.mode = 'uz';
  const e = (await call('POST', '/api/uzex/sync?force=1', boss)).body;
  check(e.ok === false && /русском/.test(e.message) && await pb.count('uzex_quotes') === 23, `another language is refused whole (${e.message})`);
  site.mode = 'stuck';
  const f = (await call('POST', '/api/uzex/sync?force=1', boss)).body;
  check(f.ok === false && f.added.length === 1 && f.errors.length === 3 && /вместо/.test(f.message) && await pb.count('uzex_quotes') === 23,
    'a site that answers with another week than asked: only the week it really shows is taken');
  site.mode = 'broken';
  const g = (await call('POST', '/api/uzex/sync?force=1', boss)).body;
  check(g.ok === false && g.errors.some((x) => x.import_id === 204 && /ячеек/.test(x.message)) && (await quotes(204)).rows.length === 10,
    'a week with a broken row is not written at all; what was stored for it stays');
  site.mode = 'ok';

  /* ------------------------------------------------------------- a new week */
  site.weeks.unshift(week(208, '2031-03-17', '2031-03-21', 'internal', sampleRows().slice(0, 4)));
  const h = (await call('POST', '/api/uzex/sync', boss)).body;
  check(h.ok && h.added.length === 1 && h.added[0].import_id === 208 && h.kept === 4 && await pb.count('uzex_imports') === 5, 'a newly published week is added, the others stay');
  site.weeks.pop();                                   // the site drops its oldest week
  const i = (await call('POST', '/api/uzex/sync', boss)).body;
  check(i.ok && await pb.count('uzex_imports') === 5, 'a week the site no longer lists stays in the database');

  /* ------------------------------------------------------------- rules */
  const w201 = (await quotes(201)).imp;
  check((await call('DELETE', '/api/collections/uzex_imports/records/' + w201.id, expert)).status >= 400, 'an expert cannot delete a week');
  check((await call('POST', '/api/collections/uzex_quotes/records', boss, { import: w201.id, row_no: 99, name: 'x' })).status >= 400, 'nobody writes a quote through the records API');
  check((await call('PATCH', '/api/collections/uzex_imports/records/' + w201.id, boss, { row_count: 5 })).status >= 400, 'or changes a stored week');
  check((await call('GET', '/api/collections/uzex_settings/records', boss)).body.items === undefined ||
    (await call('GET', '/api/collections/uzex_settings/records', boss)).body.items.length === 0, 'the settings are not readable as records');
  const del = await call('DELETE', '/api/collections/uzex_imports/records/' + w201.id, boss);
  check(del.status === 204 && await pb.count('uzex_imports') === 4 && (await quotes(201)).rows.length === 0 &&
    await pb.count('uzex_quotes', `import = "${w201.id}"`) === 0, 'an administrator deletes a week, and its quotes go with it');
  check(await pb.count('ref_packages') === refsBefore, 'the reference packages were never touched');

  /* ------------------------------------------------------------- a price marked as taken from a week */
  const rows = pb.rows().slice(0, 1);
  await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, pb.su);
  const appRec = (await api(`/api/collections/applications/records?filter=${encodeURIComponent(`number = "${rows[0].number}"`)}`, {}, expert)).items[0];
  const ws = await api('/api/collections/workspaces/records', { method: 'POST', body: JSON.stringify({ application: appRec.id, region: 'fargona', status: 'in_progress' }) }, expert);
  const bulk = await call('POST', '/api/corrections/bulk', expert, { workspace: ws.id, set: [
    { res_key: 'k1', name: 'ТЕСТОВЫЙ БИТУМ ТБ 90/60', unit: 'т', smeta_price: 1500, market_price: 1234.5, source: 'uzex:204:1', source_price: 1234.5 },
    { res_key: 'k2', name: 'ТЕСТОВАЯ ПРОВОЛОКА', unit: 'т', smeta_price: 6000, market_price: 5000, source: 'uzex:999:1', source_price: 5000 },
    { res_key: 'k3', name: 'ТЕСТОВЫЙ ЦЕМЕНТ ТЦ-400', unit: 'т', smeta_price: 900, market_price: 675, source: 'uzex:204:median:3,4', source_price: 675 },
    { res_key: 'k4', name: 'ТЕСТОВЫЙ ЛИСТ', unit: 'т', smeta_price: 9500, market_price: 9000, source: 'uzex:204:7; drop table', source_price: 9000 }
  ], del: [] });
  const corr = (await api(`/api/collections/corrections/records?filter=${encodeURIComponent(`workspace = "${ws.id}"`)}`, {}, expert)).items;
  const src = (k) => (corr.find((x) => x.res_key === k) || {}).source;
  check(bulk.status === 200 && src('k1') === 'uzex:204:1', 'a price applied from a stored week keeps its source (' + src('k1') + ')');
  check(src('k2') === 'typed', 'a week that is not stored is no source: the price counts as typed');
  check(src('k3') === 'uzex:204:median:3,4' && src('k4') === 'typed', 'a median of quotes is a source too; anything of another shape is typed');

  /* ------------------------------------------------------------- by itself */
  const crons = await api('/api/crons', {}, pb.su);
  check(Array.isArray(crons) && crons.some((j) => j.id === 'uzex-daily' && j.expression === '0 4 * * *') && crons.some((j) => j.id === 'uzex-catchup'),
    'the daily job (09:00 Tashkent = 04:00 UTC) and the catch-up after a start are registered');
  site.weeks.unshift(week(212, '2031-03-24', '2031-03-28', 'internal', sampleRows().slice(0, 3)));
  await call('POST', '/api/crons/uzex-daily', pb.su);
  await new Promise((r) => setTimeout(r, 1500));
  check(await pb.count('uzex_imports', 'import_id = 212') === 0, 'with UZEX_AUTO=0 the job does nothing');
  env.UZEX_AUTO = '1';
  await pb.restart();
  await call('POST', '/api/crons/uzex-daily', pb.su);
  for (let n = 0; n < 20 && await pb.count('uzex_imports', 'import_id = 212') === 0; n++) await new Promise((r) => setTimeout(r, 500));
  check(await pb.count('uzex_imports', 'import_id = 212') === 1, 'the daily job fetches the new week by itself');
  const st2 = (await call('GET', '/api/uzex/status', expert)).body;
  check(st2.last_sync_status === 'ok' && st2.last_new_weeks === 1 && !!st2.last_sync_at, 'and records when, how it went and how many weeks were new');
  check((await call('POST', '/api/uzex/auto', expert, { on: false })).status === 403, 'an expert cannot turn the switch');
  const off = await call('POST', '/api/uzex/auto', boss, { on: false });
  check(off.status === 200 && off.body.auto === false, 'an administrator turns «Avtomatik yangilash» off');
  site.weeks.unshift(week(216, '2031-03-31', '2031-04-04', 'internal', sampleRows().slice(0, 3)));
  await call('POST', '/api/crons/uzex-daily', pb.su);
  await new Promise((r) => setTimeout(r, 1500));
  check(await pb.count('uzex_imports', 'import_id = 216') === 0, 'switched off, the job leaves the site alone');
  const man = (await call('POST', '/api/uzex/sync', boss)).body;
  check(man.ok && man.added.length === 1 && man.added[0].import_id === 216, 'the button still works');
  check((await call('POST', '/api/uzex/auto', boss, { on: true })).body.auto === true, 'and the switch goes back on');

  // A page that lists far more new weeks than the site ever keeps: one sync takes the newest twelve and says
  // how many wait, the next takes the rest — it used to fetch and store every one of them in a single request.
  const before = await pb.count('uzex_imports', 'id != ""');
  for (let i = 0; i < 15; i++) site.weeks.unshift(week(300 + i, '2031-05-05', '2031-05-09', 'internal', sampleRows().slice(0, 2)));
  const many = (await call('POST', '/api/uzex/sync', boss)).body;
  check(many.added.length === 12 && many.waiting === 3 && /ещё недель: 3/.test(many.message) && Math.min(...many.added.map((a) => a.import_id)) === 303,
    'a sync takes the twelve newest of fifteen new weeks and says three are waiting (' + many.added.length + ', «' + many.message + '»)');
  const rest = (await call('POST', '/api/uzex/sync', boss)).body;
  check(rest.added.length === 3 && !rest.waiting && await pb.count('uzex_imports', 'id != ""') === before + 15, 'the next sync takes the rest');
  // and a week whose page is not a week's page leaves nothing behind
  site.weeks.unshift(week(400, '2031-05-12', '2031-05-16', 'internal', Array.from({ length: 5001 }, (_, i) => ['Тестовый товар ' + i, 10, 0])));
  const big = (await call('POST', '/api/uzex/sync', boss)).body;
  check(!big.ok && big.errors.length === 1 && /больше, чем запрошено/.test(big.errors[0].message) && await pb.count('uzex_imports', 'import_id = 400') === 0,
    'a week of more rows than were asked for is refused whole (' + (big.errors[0] && big.errors[0].message) + ')');
} catch (err) {
  check(false, 'the run stopped: ' + (err && err.stack || err));
} finally {
  pb.stop();
  site.stop();
}
console.log(fail ? `FAILED (${fail})` : 'uzex-api OK');
process.exit(fail ? 1 : 0);
