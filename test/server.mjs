/*
 * Starting a throwaway PocketBase for a test, and talking to it.
 *
 * Eight tests each carried their own copy of this: reset the data directory,
 * spawn the server, poll /api/health until it answers, define an api() that
 * adds the content-type and the token, sign in as the superuser. The copies
 * had drifted — different waits, one of them parsing a 204 as JSON — so a test
 * could fail for a reason that had nothing to do with what it was testing.
 *
 *   import { startServer } from './server.mjs';
 *   const pb = await startServer({ port: 8109, registry: true });
 *   const rows = pb.rows();                       // the parsed sample registry
 *   await pb.api('/api/registry/import', { method: 'POST', body: … }, pb.su);
 *   pb.stop();
 *
 * Every test gets its own port; they share server/pb_data_test, so they must
 * not run at the same time — test/all.sh runs them one after another.
 */
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DATA = join(ROOT, 'server/pb_data_test');

/**
 * @param {object} opts
 * @param {number} opts.port      each test needs its own
 * @param {boolean} [opts.registry]  also parse the sample registry into rows.json
 * @param {boolean} [opts.build]     rebuild dist and pb_public first
 * @param {string}  [opts.dev]       PB_DEV; '1' writes sign-in codes to a file
 */
export async function startServer(opts) {
  const { port, registry = false, build = false, dev = '1' } = opts;
  const base = `http://127.0.0.1:${port}`;

  if (build) execSync('node build.mjs --serve', { cwd: ROOT, stdio: 'ignore' });
  execSync('sh test/pb-smoke.sh', { cwd: ROOT, stdio: 'ignore' });
  if (registry) {
    execSync('node test/registry.cjs --json server/pb_data_test/rows.json', { cwd: ROOT, stdio: 'ignore' });
  }

  let proc = null;
  const spawnOne = () => spawn('sh', ['server/run.sh'], {
    cwd: ROOT,
    env: { ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${port}`, PB_DEV: dev },
    stdio: 'ignore'
  });
  const up = async () => {
    for (let i = 0; i < 20; i++) {
      try { if ((await fetch(base + '/api/health')).ok) return true; } catch (e) { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  proc = spawnOne();
  process.on('exit', () => { try { proc.kill(); } catch (e) { /* already gone */ } });
  if (!await up()) throw new Error(`server did not start on ${base}`);

  /** A request. Returns {} for the 204 a DELETE answers with. */
  const api = async (path, init = {}, token) => {
    const r = await fetch(base + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: token } : {}),
        ...(init.headers || {})
      }
    });
    return r.status === 204 ? {} : r.json();
  };

  const auth = async () => (await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST', body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' })
  })).token;

  const pb = {
    base,
    port,
    api,
    su: await auth(),
    /** How many records match, without fetching them. */
    count: async (coll, filter = '') =>
      (await api(`/api/collections/${coll}/records?perPage=1&filter=${encodeURIComponent(filter)}`, {}, pb.su)).totalItems,
    /** The sample registry, parsed by test/registry.cjs. */
    rows: () => JSON.parse(readFileSync(join(DATA, 'rows.json'), 'utf8')),
    /** The newest sign-in code written by the dev-otp hook, for `email` if given. */
    lastCode: (email) => {
      const lines = readFileSync(join(DATA, 'dev-otp.txt'), 'utf8').trim().split('\n');
      const line = email ? lines.filter((l) => l.includes(' ' + email + ' ')).pop() : lines.pop();
      return line.match(/code=(\d+)/)[1];
    },
    /** Sign a user in with a one-time code and return their token. */
    signIn: async (email) => {
      const otpId = (await api('/api/collections/users/request-otp', {
        method: 'POST', body: JSON.stringify({ email })
      })).otpId;
      await new Promise((r) => setTimeout(r, 600));
      return (await api('/api/collections/users/auth-with-otp', {
        method: 'POST', body: JSON.stringify({ otpId, password: pb.lastCode(email) })
      })).token;
    },
    /** Stop and start again, keeping the data — for testing what happens at boot. */
    restart: async () => {
      proc.kill();
      await new Promise((r) => setTimeout(r, 700));
      proc = spawnOne();
      if (!await up()) throw new Error('server did not come back');
      pb.su = await auth();
    },
    stop: () => { try { proc.kill(); } catch (e) { /* already gone */ } }
  };
  return pb;
}
