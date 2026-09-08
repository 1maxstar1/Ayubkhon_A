/*
 * The install script, run the way a release runs it.
 *
 * server/deploy/install.sh stops the service at the top and starts it again
 * only on the success path, so a release that fell over in the middle — a bad
 * schema, an unreachable settings API — left the whole office unable to work,
 * with nothing in the output saying so, and a root-owned PocketBase still
 * holding the setup port and writing to the live pb_data.
 *
 * systemd is not available here, so what is measured is the half that is: the
 * script's own temporary instance must not survive a failure. The service
 * restart shares the same trap.
 *
 * Everything happens in a throwaway copy of server/, on its own port.
 *
 *   node test/install.mjs
 */
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT as root } from './server.mjs';

const PORT = 8117;
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

if (!existsSync(join(root, 'server/pocketbase'))) {
  console.log('ok   skipped: server/pocketbase is not downloaded here');
  console.log('install OK');
  process.exit(0);
}

const APP = mkdtempSync(join(tmpdir(), 'taqqoslash-install-'));
process.on('exit', () => { try { rmSync(APP, { recursive: true, force: true }); } catch (e) { /* gone */ } });
cpSync(join(root, 'server'), join(APP, 'server'), {
  recursive: true,
  filter: (src) => !/pb_data(_test)?$|pb_public$|\.env$/.test(src)
});
execSync('node build.mjs --serve', { cwd: root, stdio: 'ignore' });
cpSync(join(root, 'server/pb_public'), join(APP, 'server/pb_public'), { recursive: true });

const install = (env = {}) => spawnSync('sh', [join(APP, 'server/deploy/install.sh')], {
  cwd: join(APP, 'server'),
  env: {
    ...process.env, APP_DIR: APP, NO_SYSTEMD: '1', PB_TEST_PORT: String(PORT),
    PB_SETUP_PORT: String(PORT + 1), PB_ADMIN_EMAIL: 'admin@example.com', ...env
  },
  encoding: 'utf8'
});
const listening = async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch (e) { return false; }
};
const stop = () => {
  const pidFile = join(APP, 'server/pb_data/serve.pid');
  if (!existsSync(pidFile)) return;
  try { process.kill(Number(readFileSync(pidFile, 'utf8').trim())); } catch (e) { /* already gone */ }
};

/* ------------------------------------------------------------- it installs */
const ok = install();
check(ok.status === 0, `a clean install succeeds (exit ${ok.status})` + (ok.status ? '\n' + ok.stderr : ''));
check(existsSync(join(APP, 'server/.env')), 'and writes an .env with the superuser password in it');
check(/^PB_ADMIN_PASS=.{16,}$/m.test(readFileSync(join(APP, 'server/.env'), 'utf8')),
  'which is generated, not the one from the example file');
await new Promise((r) => setTimeout(r, 500));
check(await listening(), `the instance it leaves for the tests is answering on ${PORT}`);
const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
check(health.code === 200, 'and reports itself healthy');
stop();
await new Promise((r) => setTimeout(r, 800));
check(!await listening(), 'stopped again for the next part');

/* ------------------------------------------- and it cleans up after itself */
// configure.sh is the step most likely to fail on a real server — the settings
// API is not reachable, the mail configuration is refused. Made to fail here.
const conf = join(APP, 'server/deploy/configure.sh');
const real = readFileSync(conf, 'utf8');
writeFileSync(conf, '#!/bin/sh\necho "sozlash yiqildi (test)" >&2\nexit 1\n');
const bad = install();
writeFileSync(conf, real);
check(bad.status !== 0, `a failing step fails the install (exit ${bad.status})`);
await new Promise((r) => setTimeout(r, 800));
check(!await listening(),
  'and the temporary instance is not left behind holding the port and the data directory');

console.log(fail ? `FAILED (${fail})` : 'install OK');
process.exit(fail ? 1 : 0);
