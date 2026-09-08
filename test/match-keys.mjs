/*
 * The server half of resource matching.
 *
 *  - the hint lookup finds a correction whose name was typed in the other
 *    alphabet, because both sides key it the same way;
 *  - a correction saved before the match key existed is healed, on demand
 *    from the admin page and once by itself at start-up;
 *  - only an admin may ask for that.
 *
 * The key is computed by server/pb_hooks/lib/nlp.js, which build.mjs
 * generates from the very files the page uses — this test is what proves the
 * two sides agree.
 *
 *   node test/match-keys.mjs
 */
import { createRequire } from 'node:module';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, DATA, ROOT as root } from './server.mjs';

const PORT = 8111, BASE = `http://127.0.0.1:${PORT}`;
const pb = await startServer({ port: PORT, registry: true, build: true });
const { api, count } = pb;
let su = pb.su;

// The page's own copy of the matching layer, loaded the way the hooks load it.
const cjs = join(DATA, 'nlp-under-test.cjs');
copyFileSync(join(root, 'server/pb_hooks/lib/nlp.js'), cjs);
const S = createRequire(import.meta.url)(cjs);

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/* ---------------------------------------- a workspace to hang corrections on */
const rows = pb.rows().slice(0, 3);
await api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, su);
const appOf = async (number) =>
  (await api(`/api/collections/applications/records?filter=${encodeURIComponent(`number='${number}'`)}`, {}, su)).items[0];
const me = (await api(`/api/collections/users/records?filter=${encodeURIComponent("email='test@example.com'")}`, {}, su)).items[0];
const a1 = await appOf(rows[0].number), a2 = await appOf(rows[1].number);
const mkWs = async (app) => api('/api/collections/workspaces/records', {
  method: 'POST',
  body: JSON.stringify({ application: app.id, region: 'fargona', status: 'in_progress', opened_by: me.id, updated_by: me.id })
}, su);
const ws1 = await mkWs(a1), ws2 = await mkWs(a2);

const correction = (ws, app, name, unit, price, extra = {}) => api('/api/collections/corrections/records', {
  method: 'POST',
  body: JSON.stringify({
    workspace: ws.id, application: app.id, region: 'fargona', res_key: name + '|' + unit,
    name, unit, name_key: S.nameKey(name), unit_key: S.unitKey(unit),
    match_key: S.matchKey(name), match_unit_key: S.matchUnitKey(unit),
    smeta_price: price - 5, market_price: price, by: me.id, ...extra
  })
}, su);

/* ---------------------------------------- the same tree, the other alphabet */
await correction(ws1, a1, 'КАШТАН', 'ШТ', 120000);
const found = await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`region='fargona' && workspace!='${ws2.id}' && match_key='${S.matchKey('Kashtan')}'`)}`, {}, su);
check(found.totalItems === 1, `«Kashtan» finds the price saved as «КАШТАН» (${found.totalItems})`);
check(found.items[0] && found.items[0].market_price === 120000, 'and it is the price that was saved');

const byName = await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`region='fargona' && name_key='${S.nameKey('Kashtan')}'`)}`, {}, su);
check(byName.totalItems === 0, 'the identity key alone would have missed it — that is why the match key exists');

/* ---------------------------------------- a homoglyph and a stray separator */
await correction(ws1, a1, 'ГОРЯЧЕКАТАННАЯ СТАЛЬ ДИАМ. 16 ММ', 'ТН', 9500);
const variants = ['ГОРЯЧЕКАТАННАЯ CТАЛЬ ДИАМ.16 ММ', 'горячекатанная сталь диам . 16 мм'];
for (const v of variants) {
  const r = await api(`/api/collections/corrections/records?filter=${
    encodeURIComponent(`region='fargona' && match_key='${S.matchKey(v)}'`)}`, {}, su);
  check(r.totalItems === 1, `«${v}» finds it too`);
}
const other = await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`region='fargona' && match_key='${S.matchKey('ГОРЯЧЕКАТАННАЯ СТАЛЬ ДИАМ. 22 ММ')}'`)}`, {}, su);
check(other.totalItems === 0, 'a different diameter does not');

/* ---------------------------------------- the prefix query the page uses */
const prefix = S.matchKey('ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ Д-110ММ').slice(0, 4);
await correction(ws1, a1, 'ТРОЙНИК ПОЛИЭТИЛЕНОВЫЕ Д-110ММ', 'ШТ', 41000);
const near = await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`region='fargona' && match_key~'${prefix}%'`)}`, {}, su);
check(near.totalItems >= 1, `the prefix «${prefix}%» reaches the neighbouring name (${near.totalItems})`);
const scored = S.bestMatches('ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ Д-110ММ', 'ШТ',
  near.items.map((c) => ({ name: c.name, unit: c.unit, price: c.market_price })));
check(scored.length === 1 && scored[0].score >= 0.8,
  `and it is offered as a suggestion (${scored.length ? scored[0].score : 'none'})`);

/* ---------------------------------------- healing what the old page wrote */
const old = await correction(ws1, a1, 'ЛИПА МЕЛКОЛИСТНАЯ', 'ШТ', 88000, { match_key: '', match_unit_key: '' });
check(old.match_key === '', 'seeded a correction the way the old page saved it');

const tok = await pb.signIn('test@example.com');
const denied = await fetch(BASE + '/api/admin/backfill-keys', { method: 'POST', headers: { Authorization: tok } });
check(denied.status === 403, 'an ekspert may not run the backfill');

const filled = await api('/api/admin/backfill-keys', { method: 'POST' }, su);
check(filled.filled === 1, `the backfill repaired the one row it had to (${filled.filled})`);
const healed = await api(`/api/collections/corrections/records/${old.id}`, {}, su);
check(healed.match_key === S.matchKey('ЛИПА МЕЛКОЛИСТНАЯ'), 'the key the server wrote is the key the page computes');
check(healed.match_unit_key === S.matchUnitKey('ШТ'), 'the unit key too');
const lipa = await api(`/api/collections/corrections/records?filter=${
  encodeURIComponent(`region='fargona' && match_key='${S.matchKey('LIPA MELKOLISTNAYA')}'`)}`, {}, su);
check(lipa.totalItems === 1, 'and the healed row is now reachable from the Latin spelling');
const again = await api('/api/admin/backfill-keys', { method: 'POST' }, su);
check(again.filled === 0, 'running it a second time changes nothing');

/* ---------------------------------------- and it heals itself on start-up */
const old2 = await correction(ws2, a2, 'СИРЕНЬ ОБЫКНОВЕННАЯ', 'ШТ', 54000, { match_key: '', match_unit_key: '' });
await pb.restart();
su = pb.su;
const booted = await api(`/api/collections/corrections/records/${old2.id}`, {}, su);
check(booted.match_key === S.matchKey('СИРЕНЬ ОБЫКНОВЕННАЯ'), 'a restart fills in what an upgrade left empty');

pb.stop();
console.log(fail ? `FAILED (${fail})` : 'match-keys OK');
process.exit(fail ? 1 : 0);
