/*
 * What the program keeps to learn from (docs/ai-reja.md, phase 1): the journal of decisions and the prices of
 * finished applications. Server mode, a real browser, synthetic package and estimate only (test/refs-fixture.cjs).
 *
 *   - applying a reference line, typing a price, putting the estimate's price back, «Автоподбор» and «Применить %»
 *     each leave the right journal row: the action, the line taken, the lines shown (features, never a name), the
 *     region and keys the server filled in;
 *   - a journal the server does not take never gets in the way: the price is saved all the same, nothing is said;
 *   - «✓ Завершить» asks first, with the counts; every resource is written with its kind; «Вернуть в работу» keeps
 *     the rows; a second finish replaces them; «не учитывать в обучении» removes them;
 *   - the contractor's «Исправлено» marks exactly the corrected rows named;
 *   - the routes hold their limits (events per request, lines per event, the size of a row), fill region and author
 *     themselves, refuse a stranger, and the counts are the administrator's;
 *   - a workspace cleared by the administrator takes its journal and memory with it;
 *   - the saved state of the workspace carries nothing new (an older page still opens it).
 *
 *   node test/learning.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOpts } from './chromium.mjs';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const F = require('./refs-fixture.cjs');
const { load } = require('./load.cjs');
const S = load('util', 'refs-package');

const pb = await startServer({ port: 8162, build: true, registry: true });
const { api, su } = pb;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const SEC = 1000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (method, path, token, body) => {
  const r = await fetch(pb.base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: r.status === 204 ? {} : await r.json().catch(() => ({})) };
};
const all = async (coll, filter) => (await api(`/api/collections/${coll}/records?perPage=500&sort=created${filter ? '&filter=' + encodeURIComponent(filter) : ''}`, {}, su)).items;

await api('/api/collections/users/records', { method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true }) }, su);
const boss = await pb.signIn('boss@example.com');

// the reference package, as the admin page sends it
const pkg = F.makePackage(), gz = F.gzip(pkg);
const fd = new FormData();
const head = { package_id: pkg.package_id, sha256: createHash('sha256').update(gz).digest('hex'), manifest: JSON.stringify(S.refs.pkg.manifest(pkg)),
  records: String(pkg.counts.records), sources: String(pkg.counts.sources), date_min: pkg.date_min, date_max: pkg.date_max };
for (const k of Object.keys(head)) fd.append(k, head[k]);
fd.append('file', new Blob([gz], { type: 'application/gzip' }), pkg.package_id + '.json.gz');
const up = await fetch(pb.base + '/api/collections/ref_packages/records', { method: 'POST', headers: { Authorization: boss }, body: fd });
check(up.status === 200, 'the synthetic reference package is in place (' + up.status + ')');

const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const dir = mkdtempSync(join(tmpdir(), 'learning-'));
const smetaFile = join(dir, 'smeta-test.xlsx');
writeFileSync(smetaFile, F.makeSmeta());

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let answer = true, promptText = '-10';
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); if (d.type() === 'prompt') d.accept(promptText); else if (answer) d.accept(); else d.dismiss(); });

const rowSel = (name) => `#priceScroll .vrow:has(.c[title="${name}"])`;
const only = async (name) => {
  await page.fill('#q', name);
  await page.waitForFunction((t) => { const r = document.querySelectorAll('#priceScroll .vrow'); return r.length === 1 && r[0].querySelector('.c[title="' + t + '"]'); }, name);
};
const saved = () => page.waitForFunction(() => !S.Sync.dirty && !Object.keys(S.Sync.pend).length && document.getElementById('wsSave').textContent === '✓', null, { timeout: 30 * SEC });
/** Everything decided so far is in the journal on the server. */
const journaled = async () => {
  await page.evaluate(() => S.Journal.commit());
  await page.waitForFunction(() => !S.Journal.busy && !S.Journal.q.length && !Object.keys(S.Journal.pend).length, null, { timeout: 15 * SEC });
};
const keyOf = (name) => page.evaluate((n) => app.model.resources.find((r) => r.name === n).key, name);

try {
  await page.goto(pb.base + '/');
  await page.fill('#loginEmail', 'test@example.com');
  await page.click('#loginBtn');
  await page.waitForSelector('#codeBox:not([hidden])');
  await wait(700);
  await page.fill('#loginCode', pb.lastCode('test@example.com'));
  await page.click('#loginBtn');
  await page.waitForSelector('#screen-list:not([hidden])');
  await page.fill('#appQ', rows[0].number);
  await page.waitForFunction((n) => [...document.querySelectorAll('#appTable tbody tr')].some((t) => t.textContent.includes(n)), rows[0].number);
  await page.click(`#appTable tbody tr:has-text("${rows[0].number}") button[data-act=open]`);
  await page.waitForSelector('#screen-region:not([hidden])');
  await page.selectOption('#regionSel', 'xorazm');
  await page.click('#regionForm button[type=submit]');
  await page.waitForSelector('#wsBox:not([hidden])');
  await page.setInputFiles('#pick', [smetaFile]);
  await page.waitForFunction(() => window.app && app.model && app.model.resources.length > 60 && S.Sync.ws.files.length === 1 && !S.Sync.loading, null, { timeout: 60 * SEC });
  await page.waitForFunction(() => S.Refs.state === 'ready' && !Object.keys(S.Refs.batches).length && /справочных \d+/.test(document.getElementById('priceCount').textContent),
    null, { timeout: 60 * SEC });
  const ws = await page.evaluate(() => S.Sync.ws.id);
  await saved();
  const stateKeys0 = Object.keys((await api('/api/collections/workspaces/records/' + ws, {}, su)).state).sort();
  check((await all('suggest_events')).length === 0 && (await all('price_memory')).length === 0, 'opening an application and loading its estimate writes nothing down');

  /* ------------------------------------------------------------- a reference line applied */
  await only('Анкер М8');
  await page.click(rowSel('Анкер М8') + ' .tagr');
  await page.waitForSelector('#refPop:not([hidden])');
  await page.click('#refPop .rp-line button[data-i]');
  const anchorKey = await keyOf('Анкер М8');
  const anchorPrice = await page.evaluate((k) => app.prices[k], anchorKey);
  await journaled();
  let ev = await all('suggest_events', `workspace='${ws}'`);
  let e = ev[ev.length - 1];
  check(ev.length === 1 && e.action === 'applied' && e.chosen === 0 && /^ref:/.test(e.source) && e.opened === true && e.final_price === anchorPrice,
    `«Применить» on a reference line: one row, the action, the line taken, where from (${e && e.action}, ${e && e.chosen}, ${e && e.source})`);
  check(e.region === 'xorazm' && e.application && e.match_key && e.match_key !== '-' && e.section === 'materials' && /^\d{4}-\d\d-\d\d$/.test(e.asof) && e.by,
    'the server fills in the region, the application, the keys and the author; the page gives the section and the date asked');
  check(Array.isArray(e.lines) && e.lines.length >= 1 && e.lines[0].k === 'ref' && e.lines[0].p === 0 && e.lines[0].tier && e.lines[0].price > 0 &&
    e.lines.every((l) => !('name' in l) && !('why' in l) && !('raw' in l)), 'the lines shown are kept as features — level, price, place — never a name');
  check(e.schema === 1 && /^v\d+\.\d+\.\d+$/.test(e.app_version), `with the journal's schema and the program's version (${e.schema}, ${e.app_version})`);
  check(!('smeta_price' in e) && !('smeta' in e), 'the journal has no field for the estimate\'s price');

  /* ------------------------------------------------------------- a price typed, then put back */
  await only('Кабель ВВГ 3х2,5');
  const box = page.locator(rowSel('Кабель ВВГ 3х2,5') + ' .pin');
  await box.click();
  await page.keyboard.type('777');
  await page.keyboard.press('Tab');
  await journaled();
  ev = await all('suggest_events', `workspace='${ws}'`); e = ev[ev.length - 1];
  check(ev.length === 2 && e.action === 'typed' && e.chosen === -1 && e.source === 'typed' && e.final_price === 777 && e.lines.length >= 1 && e.opened === false,
    `a typed price: «typed», no line taken, the lines it had are kept (${e.action}, ${e.chosen}, ${e.lines.length} lines)`);
  await journaled();
  check((await all('suggest_events', `workspace='${ws}'`)).length === 2, 'the same decision is not written twice');
  await box.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await journaled();
  ev = await all('suggest_events', `workspace='${ws}'`); e = ev[ev.length - 1];
  check(ev.length === 3 && e.action === 'reset' && e.chosen === -1, 'the estimate\'s price put back: «reset»');

  /* ------------------------------------------------------------- «Автоподбор» and «Применить %» */
  await page.fill('#q', '');
  await page.waitForFunction(() => app.prices_ui.view.length > 60);
  const before = ev.length;
  const picked = await page.evaluate(() => { const was = Object.assign({}, app.prices); S.Refs.autoApply();
    return app.model.resources.filter((r) => app.prices[r.key] != null && app.prices[r.key] !== was[r.key]).map((r) => r.key); });
  await journaled();
  ev = await all('suggest_events', `workspace='${ws}'`);
  const auto = ev.slice(before);
  check(picked.length >= 1 && auto.length === picked.length && auto.every((x) => x.action === 'autopick' && x.chosen === 0 && /^ref:/.test(x.source)),
    `«Автоподбор»: one «autopick» row for each resource it set, the top line taken (${auto.length} of ${picked.length})`);
  const before2 = ev.length;
  // a percentage on a part of the list only: the rest stays as the estimate has it
  await page.fill('#q', 'вспомогательный 1');
  await page.waitForFunction(() => app.prices_ui.view.length > 1 && app.prices_ui.view.length < 20);
  await page.click('#pctBtn');
  await page.waitForFunction(() => Object.keys(app.pct).length > 0, null, { timeout: 10 * SEC });
  const pctN = await page.evaluate(() => Object.keys(app.pct).length);
  await journaled();
  ev = await all('suggest_events', `workspace='${ws}'`);
  const bulk = ev.slice(before2);
  check(bulk.length === pctN && bulk.every((x) => x.action === 'bulk' && x.chosen === -1 && x.source === 'typed'),
    `«Применить %»: «bulk» rows, no line taken (${bulk.length} of ${pctN})`);
  check(bulk.length > 0 && bulk.every((x) => x.lines.length === 0), 'a decision on a resource with no suggestions is kept too, with no lines');

  /* ------------------------------------------------------------- the journal never gets in the way */
  const J = (u) => new URL(u).pathname === '/api/journal/events';
  await page.route(J, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"no"}' }));
  await only('Кабель ВВГ 3х4');
  const box2 = page.locator(rowSel('Кабель ВВГ 3х4') + ' .pin');
  await box2.click();
  await page.keyboard.type('555');
  await page.keyboard.press('Tab');
  await page.evaluate(() => S.Journal.commit());
  await saved();
  const cableKey = await keyOf('Кабель ВВГ 3х4');
  const corr = await all('corrections', `workspace='${ws}' && res_key='${cableKey.replace(/'/g, "\\'")}'`);
  check(corr.length === 1 && corr[0].market_price === 555, 'a journal the server refuses: the price is saved all the same');
  const said = await page.evaluate(() => [...document.querySelectorAll('#toast .toast-item')].map((t) => t.className + ': ' + t.textContent).filter((t) => /err/.test(t) && !/сумма не равна/.test(t)));
  check(!said.length, 'and nothing is said about it' + (said.length ? ' — ' + said.join(' | ') : ''));
  await page.unroute(J);
  await page.waitForFunction(() => !S.Journal.busy);
  check(errors.length === 0, 'no page errors so far' + (errors.length ? ': ' + errors.join(' | ') : ''));

  /* ------------------------------------------------------------- «✓ Завершить» */
  await page.fill('#q', '');
  const zeroKey = await page.evaluate(() => { const r = app.model.resources.find((x) => /вспомогательный 7$/.test(x.name)); app.setPrice(r.key, 0); return r.key; });
  const markKey = await page.evaluate(() => { const r = app.model.resources.find((x) => /вспомогательный 9$/.test(x.name)); app.setPrice(r.key, r.price); delete app.pct[r.key];
    app.setChecked([r.key], true); return r.key; });
  await saved();
  const want = await page.evaluate(() => { const c = S.Journal.survey(null); return { corrected: c.corrected, zeroed: c.zeroed, untouched: c.untouched, checked: c.checked,
    total: app.model.resources.filter((r) => r.price > 0 || r.market > 0).length }; });
  await page.click('#wsDone');
  await page.waitForSelector('#finishBox:not([hidden])');
  const shown = await page.evaluate(() => ({ changed: +document.getElementById('finChanged').textContent, left: +document.getElementById('finLeft').textContent,
    checked: +document.getElementById('finChecked').textContent, assume: !!document.getElementById('finAssume') && document.getElementById('finAssume').checked,
    skip: document.getElementById('finSkip').checked }));
  check(shown.changed === want.corrected + want.zeroed && shown.left === want.untouched && shown.checked === want.checked,
    `the finish dialog says what it found: changed ${shown.changed}, left ${shown.left}, marked ${shown.checked}`);
  check(shown.assume === (want.untouched > want.checked) && shown.skip === false, 'counting the rest as checked is offered and pre-selected; «не учитывать» is not');
  check((await api('/api/collections/workspaces/records/' + ws, {}, su)).status === 'in_progress', 'nothing is finished before the answer');
  await page.click('#finCancel');
  await wait(300);
  check(await page.isHidden('#finishBox') && (await api('/api/collections/workspaces/records/' + ws, {}, su)).status === 'in_progress' &&
    (await all('price_memory')).length === 0, '«Отмена» finishes nothing and writes nothing');
  await page.click('#wsDone');
  await page.waitForSelector('#finishBox:not([hidden])');
  await page.click('#finOk');
  await page.waitForFunction(() => document.querySelector('#wsBox .done'), null, { timeout: 30 * SEC });
  let mem = await all('price_memory', `workspace='${ws}'`);
  const kinds = (list) => list.reduce((o, r) => { o[r.kind] = (o[r.kind] || 0) + 1; return o; }, {});
  let k = kinds(mem);
  check(mem.length === want.total && k.corrected === want.corrected && k.zeroed === want.zeroed && k.checked === want.untouched && !k.untouched,
    `every resource is written with its kind (${mem.length}: ${JSON.stringify(k)})`);
  const mAnchor = mem.find((r) => r.res_key === anchorKey), mZero = mem.find((r) => r.res_key === zeroKey), mMark = mem.find((r) => r.res_key === markKey);
  check(mAnchor.kind === 'corrected' && /^ref:/.test(mAnchor.source) && mAnchor.final_price === anchorPrice && mAnchor.smeta_price > 0 && mAnchor.accepted === false,
    'a price applied from the reference: corrected, with where it came from');
  check(mZero.kind === 'zeroed' && mZero.final_price === 0, 'a price set to 0 is its own kind, not a price');
  check(mMark.kind === 'checked' && mMark.source === 'mark' && mem.some((r) => r.kind === 'checked' && r.source === 'finish'),
    'a marked resource is «checked» by its mark; the others by the answer at the finish');
  check(mem.some((r) => r.kind === 'corrected' && r.source === 'pct') && mem.some((r) => r.kind === 'corrected' && r.source === 'typed'),
    'a price «Применить %» set is told apart from a typed one');
  check(mem.every((r) => r.region === 'xorazm' && r.match_key && r.finished && r.section && r.by && r.name), 'each row has its region, keys, section, date and author');
  const finished1 = mem[0].finished;

  // «Вернуть в работу» keeps the rows; a second finish replaces them
  await page.click('#wsReopen');
  await page.waitForSelector('#wsDone', { timeout: 10 * SEC });
  check((await all('price_memory', `workspace='${ws}'`)).length === mem.length, '«Вернуть в работу» keeps what was remembered');
  await page.evaluate((key) => app.setPrice(key, 123), markKey);
  await saved();
  const want2 = await page.evaluate(() => { const c = S.Journal.survey(null); return { corrected: c.corrected, untouched: c.untouched, checked: c.checked }; });
  await wait(1100);
  await page.click('#wsDone');
  await page.waitForSelector('#finishBox:not([hidden])');
  await page.uncheck('#finAssume');
  await page.click('#finOk');
  await page.waitForFunction(() => document.querySelector('#wsBox .done'), null, { timeout: 30 * SEC });
  mem = await all('price_memory', `workspace='${ws}'`); k = kinds(mem);
  check(mem.length === want.total && mem.every((r) => r.finished > finished1), `a second finish replaces the rows, it does not add to them (${mem.length})`);
  check(k.corrected === want.corrected + 1 && want2.corrected === k.corrected && k.untouched === want2.untouched - want2.checked && (k.checked || 0) === want2.checked &&
    mem.filter((r) => r.kind === 'checked').every((r) => r.source === 'mark') && mem.find((r) => r.res_key === markKey).final_price === 123,
    `with the answer unticked the unmarked rest is «untouched»; the price changed in between is the new one (${JSON.stringify(k)})`);

  /* ------------------------------------------------------------- «Исправлено» of the contractor */
  const expert = await page.evaluate(() => S.pb.authStore.token);
  const untouchedKey = mem.find((r) => r.kind === 'untouched').res_key;
  let acc = await call('POST', '/api/memory/accepted', expert, { workspace: ws, keys: [anchorKey, untouchedKey, 'no-such-key'] });
  mem = await all('price_memory', `workspace='${ws}'`);
  check(acc.status === 200 && acc.body.marked === 1 && mem.filter((r) => r.accepted).length === 1 && mem.find((r) => r.res_key === anchorKey).accepted,
    'the contractor\'s «Исправлено» marks the corrected row named, and no other');
  acc = await call('POST', '/api/memory/accepted', expert, { workspace: ws, keys: [] });
  check((await all('price_memory', `workspace='${ws}'`)).every((r) => !r.accepted), 'and a later comparison without it takes the mark away');

  /* ------------------------------------------------------------- the routes */
  const lineOf = (i) => ({ k: 'ref', p: i, tier: 'document', how: 'exact', sim: 0.123456789, price: 10 + i, name: 'СЕКРЕТ', flags: ['x'.repeat(100)], rids: Array.from({ length: 50 }, (_, j) => j) });
  const evOf = (o) => Object.assign({ res_key: 'k-' + Math.random(), name: 'ТЕСТ ТРУБА 57', unit: 'м', section: 'materials', asof: '2031-01-02', lines: [], opened: false,
    action: 'typed', chosen: -1, source: 'typed', final_price: 5, schema: 1, app_version: 'v0.0.0' }, o || {});
  const n0 = (await all('suggest_events')).length;
  let r = await call('POST', '/api/journal/events', expert, { workspace: ws, region: 'andijon', by: 'someone', events: [
    evOf({ lines: Array.from({ length: 30 }, (_, i) => lineOf(i)), chosen: 25 }), evOf({ action: 'hacked' }), evOf({ source: 'ref:no-such-package:1', action: 'applied', section: 'weird' })] });
  ev = (await all('suggest_events')).slice(n0);
  check(r.status === 200 && r.body.saved === 2 && ev.length === 2, 'an unknown action is not written; the others are (' + r.status + ', ' + r.body.saved + ')');
  check(ev[0].lines.length === 12 && ev[0].chosen === -1 && ev[0].lines.every((l) => !('name' in l) && l.flags[0].length === 30 && l.rids.length === 20) && ev[0].lines[0].sim === 0.1235,
    'at most twelve lines, each cut to its features; a taken line beyond them is «none»');
  check(ev[0].region === 'xorazm' && ev[0].by !== 'someone' && ev[1].source === 'typed' && ev[1].section === 'other',
    'region and author are the server\'s; a source that names no package is «typed»; an unknown section is «other»');
  r = await call('POST', '/api/journal/events', expert, { workspace: ws, events: Array.from({ length: 201 }, () => evOf()) });
  check(r.status === 400, 'more than two hundred decisions in one request are refused (' + r.status + ')');
  r = await call('POST', '/api/journal/events', expert, { workspace: ws, events: [evOf({ lines: Array.from({ length: 12 }, (_, i) =>
    Object.assign(lineOf(i), { flags: Array.from({ length: 12 }, () => 'я'.repeat(30)), rids: Array.from({ length: 20 }, () => 1e12 - 1) })) })] });
  ev = await all('suggest_events'); e = ev[ev.length - 1];
  check(r.status === 200 && JSON.stringify(e.lines).length <= 20 * 1024, `a row never outgrows its limit (${JSON.stringify(e.lines).length} characters)`);
  r = await call('POST', '/api/journal/events', null, { workspace: ws, events: [evOf()] });
  const r2 = await call('POST', '/api/memory/finish', null, { workspace: ws, part: 0, rows: [] });
  check(r.status === 401 && r2.status === 401, 'a stranger writes neither (' + r.status + ', ' + r2.status + ')');
  r = await call('POST', '/api/collections/suggest_events/records', expert, { workspace: ws, res_key: 'x', action: 'typed' });
  const r3 = await call('POST', '/api/collections/price_memory/records', expert, { workspace: ws, res_key: 'x', kind: 'corrected' });
  check(r.status >= 400 && r3.status >= 400, 'and nothing is written past the routes (' + r.status + ', ' + r3.status + ')');
  r = await call('POST', '/api/memory/finish', expert, { workspace: ws, part: 0, record: true, rows: Array.from({ length: 3001 }, (_, i) => ({ res_key: 'r' + i, kind: 'untouched' })) });
  check(r.status === 400 && (await all('price_memory', `workspace='${ws}'`)).length === want.total, 'too many rows are refused, and what was remembered stays');

  /* ------------------------------------------------------------- the counts are the administrator's */
  const st = await call('GET', '/api/learning/stats', boss);
  const evAll = await all('suggest_events');
  const byAction = evAll.reduce((o, x) => { o[x.action] = (o[x.action] || 0) + 1; return o; }, {});
  check(st.status === 200 && JSON.stringify(st.body.events) === JSON.stringify(Object.keys(st.body.events).reduce((o, a) => { o[a] = byAction[a]; return o; }, {})) &&
    Object.keys(byAction).every((a) => st.body.events[a] === byAction[a]) && st.body.memory.corrected === want.corrected + 1 && st.body.finished === 1 && st.body.memory_applications === 1,
    'the counts match what was written (' + JSON.stringify(st.body.events) + ')');
  check(!/[А-Яа-яЁё]/.test(JSON.stringify(st.body)) && Object.values(st.body).every((v) => typeof v === 'number' || Object.values(v).every((x) => typeof x === 'number')),
    'they are numbers only: no name, no price');
  check((await call('GET', '/api/learning/stats', expert)).status === 403, 'and not for an expert');

  /* ------------------------------------------------------------- «не учитывать в обучении» */
  await page.click('#wsReopen');
  await page.waitForSelector('#wsDone', { timeout: 10 * SEC });
  await page.click('#wsDone');
  await page.waitForSelector('#finishBox:not([hidden])');
  await page.check('#finSkip');
  await page.click('#finOk');
  await page.waitForFunction(() => document.querySelector('#wsBox .done'), null, { timeout: 30 * SEC });
  check((await all('price_memory', `workspace='${ws}'`)).length === 0, '«не учитывать в обучении»: the application is finished and nothing of it is remembered');

  /* ------------------------------------------------------------- an older page still opens it */
  await saved();
  const w = await api('/api/collections/workspaces/records/' + ws, {}, su);
  const stateKeys1 = Object.keys(w.state).sort();
  const known = ['book', 'checked', 'cmp', 'files', 'keys', 'mode', 'notes', 'opts', 'pct', 'prices', 'prices2', 'projects', 'refs', 'uzex'];
  check(stateKeys1.every((x) => stateKeys0.includes(x) || known.includes(x)), 'the saved state of the workspace carries nothing new (' + stateKeys1.filter((x) => !stateKeys0.includes(x)).join(', ') + ')');

  /* ------------------------------------------------------------- the admin page */
  const ap = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  ap.on('pageerror', (er) => errors.push('admin pageerror: ' + er.message));
  await ap.goto(pb.base + '/admin.html');
  await ap.fill('#loginEmail', 'boss@example.com');
  await ap.click('#loginBtn');
  await ap.waitForSelector('#codeBox:not([hidden])');
  await wait(700);
  await ap.fill('#loginCode', pb.lastCode('boss@example.com'));
  await ap.click('#loginBtn');
  await ap.waitForSelector('#adminMain:not([hidden])');
  await ap.waitForFunction(() => document.querySelectorAll('#learnTable tbody tr').length > 5, null, { timeout: 15 * SEC });
  const cell = (key) => ap.$eval(`#learnTable tbody tr[data-k="${key}"] td.num`, (t) => +t.textContent);
  check(await cell('events') === evAll.length && await cell('events.applied') === byAction.applied && await cell('finished') === 1 && await cell('memory') === 0,
    '«Обучение» on the admin page shows the counts');
  const copied = await ap.evaluate(() => S.LearningAdmin.text());
  check(/^events = \d+$/m.test(copied) && !/[А-Яа-яЁё]/.test(copied), '«Скопировать числа» gives counts only, safe to pass on');
  await ap.close();

  /* ------------------------------------------------------------- a cleared workspace takes them with it */
  check((await all('suggest_events', `workspace='${ws}'`)).length > 0, '(the journal of the workspace is there)');
  r = await call('POST', `/api/admin/workspaces/${ws}/clear`, boss);
  check(r.status === 200 && (await all('suggest_events', `workspace='${ws}'`)).length === 0 && (await all('price_memory', `workspace='${ws}'`)).length === 0,
    'a workspace cleared by the administrator takes its journal and its memory with it');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  check(false, 'the run stopped: ' + String(e && e.message || e).split('\n')[0]);
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await browser.close();
  await pb.stop();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `FAILED (${fail})` : 'learning OK');
process.exit(fail ? 1 : 0);
