/*
 * Reference-price packages on the server (collection ref_packages, server/pb_hooks/refs.pb.js), through the API,
 * with the synthetic package of test/refs-fixture.cjs:
 *   an administrator uploads a package (the first becomes active), the same file again is refused by its hash,
 *   a manifest that does not describe the fields is refused, a file over 50 MB is refused, an expert can read but
 *   not create, change or delete, the content of an uploaded package never changes, the active package cannot be
 *   deleted, «activate» leaves exactly one active, and the file is protected (no file token, no file).
 *
 *   node test/refs-api.mjs
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const F = require('./refs-fixture.cjs');
const { load } = require('./load.cjs');
const S = load('util', 'refs-package');

const PORT = 8121;
const pb = await startServer({ port: PORT });
const { api } = pb;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

await api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
}, pb.su);
const boss = await pb.signIn('boss@example.com');
const expert = await pb.signIn('test@example.com');

/** The form the admin page sends: the file as is, plus the head of the package. */
function form(pkg, bytes, over) {
  const fd = new FormData();
  const m = S.refs.pkg.manifest(pkg);
  const fields = Object.assign({
    package_id: pkg.package_id, sha256: createHash('sha256').update(bytes).digest('hex'), manifest: JSON.stringify(m),
    records: String(pkg.counts.records), sources: String(pkg.counts.sources), date_min: pkg.date_min, date_max: pkg.date_max
  }, over || {});
  for (const k of Object.keys(fields)) fd.append(k, fields[k]);
  fd.append('file', new Blob([bytes], { type: 'application/gzip' }), pkg.package_id + '.json.gz');
  return fd;
}
async function create(fd, token) {
  const r = await fetch(pb.base + '/api/collections/ref_packages/records', { method: 'POST', headers: token ? { Authorization: token } : {}, body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function call(method, path, token, body) {
  const r = await fetch(pb.base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: r.status === 204 ? {} : await r.json().catch(() => ({})) };
}

const p1 = F.makePackage();
const g1 = F.gzip(p1);
const sha1 = createHash('sha256').update(g1).digest('hex');
check(S.refs.pkg.sha256(new Uint8Array(g1)) === sha1, 'the page computes the same sha256 as node');

/* ------------------------------------------------------------- upload */
const a = await create(form(p1, g1), boss);
check(a.status === 200 && a.body.active === true && a.body.sha256 === sha1 && a.body.records === p1.counts.records,
  `an administrator uploads the first package: it becomes active (${a.status})`);
check(a.body.by && a.body.date_min === p1.date_min && a.body.manifest && !a.body.manifest.rows, 'the server stores the author, the date range and the manifest without rows');
const again = await create(form(p1, g1), boss);
check(again.status === 400 && /sha256|package_id/.test(JSON.stringify(again.body.data || {})), `the same file again is refused by its hash and number (${again.status})`);

const p2 = F.makePackage({ id: 'fake-20260101-2' });
const g2 = F.gzip(p2);
const wrong = await create(form(p2, g2, { records: '99' }), boss);
check(wrong.status === 400, `a manifest that does not match the fields is refused (${wrong.status})`);
const v2 = Object.assign({}, p2, { version: 2 });
const vbad = await create(form(v2, g2), boss);
check(vbad.status === 400 && /не поддерживается/.test(vbad.body.message || ''), `a version 2 package says the program must be updated (${vbad.status})`);
const b = await create(form(p2, g2), boss);
check(b.status === 200 && b.body.active === false, 'a second package waits inactive');

const big = new Uint8Array(50 * 1024 * 1024 + 1024);
const huge = await create(form(F.makePackage({ id: 'fake-20260101-3' }), big), boss);
check(huge.status === 400 || huge.status === 413, `a file over 50 MB is refused (${huge.status})`);

/* ------------------------------------------------------------- experts */
const list = await call('GET', '/api/collections/ref_packages/records?filter=' + encodeURIComponent('active=true'), expert);
check(list.status === 200 && list.body.items.length === 1 && list.body.items[0].id === a.body.id, 'an expert sees the active package');
const ec = await create(form(F.makePackage({ id: 'fake-20260101-4' }), F.gzip(F.makePackage({ id: 'fake-20260101-4' }))), expert);
check(ec.status === 400 || ec.status === 403, `an expert cannot upload (${ec.status})`);
const eu = await call('PATCH', '/api/collections/ref_packages/records/' + b.body.id, expert, { note: 'x' });
check(eu.status === 404 || eu.status === 403, `an expert cannot change a package (${eu.status})`);
const ed = await call('DELETE', '/api/collections/ref_packages/records/' + b.body.id, expert);
check(ed.status === 404 || ed.status === 403, `an expert cannot delete a package (${ed.status})`);
const ea = await call('POST', '/api/refs/' + b.body.id + '/activate', expert);
check(ea.status === 403, `an expert cannot activate a package (${ea.status})`);
const anon = await call('GET', '/api/collections/ref_packages/records');
check(anon.status === 200 && anon.body.items.length === 0, 'nobody signed out sees a package');

/* ------------------------------------------------------------- the file is protected */
const fileUrl = pb.base + '/api/files/ref_packages/' + a.body.id + '/' + a.body.file;
const noTok = await fetch(fileUrl);
check(noTok.status === 404 || noTok.status === 403 || noTok.status === 401, `the file needs a file token (${noTok.status})`);
const ft = (await call('POST', '/api/files/token', expert)).body.token;
const withTok = await fetch(fileUrl + '?token=' + ft);
const back = Buffer.from(await withTok.arrayBuffer());
check(withTok.status === 200 && createHash('sha256').update(back).digest('hex') === sha1, 'with a file token an expert downloads exactly the uploaded bytes');

/* ------------------------------------------------------------- changing and activating */
const note = await call('PATCH', '/api/collections/ref_packages/records/' + b.body.id, boss, { note: 'проверено' });
check(note.status === 200 && note.body.note === 'проверено', 'the note of a package may be edited');
const fix = await call('PATCH', '/api/collections/ref_packages/records/' + b.body.id, boss, { records: 1 });
check(fix.status === 400, `the content of an uploaded package never changes (${fix.status})`);
const act = await call('PATCH', '/api/collections/ref_packages/records/' + b.body.id, boss, { active: true });
check(act.status === 400, `«active» is not set by an edit (${act.status})`);
const delActive = await call('DELETE', '/api/collections/ref_packages/records/' + a.body.id, boss);
check(delActive.status === 400, `the active package cannot be deleted (${delActive.status})`);
const sw = await call('POST', '/api/refs/' + b.body.id + '/activate', boss);
check(sw.status === 200, 'an administrator makes the second package active');
const actives = (await call('GET', '/api/collections/ref_packages/records?filter=' + encodeURIComponent('active=true'), boss)).body.items;
check(actives.length === 1 && actives[0].id === b.body.id, 'exactly one package is active');
const nf = await call('POST', '/api/refs/nosuchpackage12/activate', boss);
check(nf.status === 404, `activating a package that does not exist (${nf.status})`);
const delOld = await call('DELETE', '/api/collections/ref_packages/records/' + a.body.id, boss);
check(delOld.status === 204, `an inactive package can be deleted (${delOld.status})`);

pb.stop();
console.log(fail ? `FAILED (${fail})` : 'refs-api OK');
process.exit(fail ? 1 : 0);
