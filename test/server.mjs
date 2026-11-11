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
 *
 * A server does not outlive its test, and a test does not start on top of another's server:
 *   - test/pb-smoke.sh, which every start goes through, first ends any server still serving pb_data_test and
 *     waits for it to be gone — a test that was killed leaves one behind, and it used to go on writing into
 *     the directory the next test was removing («Directory not empty», a test failing for no reason of its own);
 *   - a port that still answers after that belongs to something else, and is refused in words;
 *   - a server that exits while it is being waited for is reported at once, with its exit code;
 *   - stop() ends the server and resolves when it is gone; Ctrl-C and a plain kill of the test end it too.
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
 * @param {string}  [opts.laptop]    PB_LAPTOP; '1' also hands the code back to this machine
 * @param {string}  [opts.autologin] PB_AUTOLOGIN; with laptop, '1' signs the page in by itself
 *                                   as PB_AUTOLOGIN_EMAIL (opts.as, the test user by default)
 * @param {object}  [opts.env]       more environment for the server, read again at every (re)start. UZEX_AUTO is
 *                                   '0' unless given here: a test server never calls the exchange's site by itself
 */
export async function startServer(opts) {
  const { port, registry = false, build = false, dev = '1', laptop = '', autologin = '', as = 'test@example.com' } = opts;
  const base = `http://127.0.0.1:${port}`;
  const answers = async () => { try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(1500) }); return true; } catch (e) { return false; } };

  if (build) execSync('node build.mjs --serve', { cwd: ROOT, stdio: 'ignore' });
  execSync('sh test/pb-smoke.sh', { cwd: ROOT, stdio: 'ignore' });
  // pb-smoke.sh has ended every test server there was: whatever answers on the port now is not one of ours
  if (await answers()) throw new Error(`port ${port} is taken by something that is not a test server — the test cannot start on ${base}`);
  if (registry) {
    execSync('node test/registry.cjs --json server/pb_data_test/rows.json', { cwd: ROOT, stdio: 'ignore' });
  }

  let proc = null;
  const spawnOne = () => spawn('sh', ['server/run.sh'], {
    cwd: ROOT,
    env: { ...process.env, UZEX_AUTO: '0', PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${port}`, PB_DEV: dev, PB_LAPTOP: laptop, PB_AUTOLOGIN: autologin, PB_AUTOLOGIN_EMAIL: as, ...(opts.env || {}) },
    stdio: 'ignore'
  });
  const up = async () => {
    for (let i = 0; i < 40; i++) {
      // gone already: there is nothing to wait for, and the reason is its exit code
      if (proc.exitCode != null || proc.signalCode != null) {
        throw new Error(`the server on ${base} exited while starting (code ${proc.exitCode}, signal ${proc.signalCode})`);
      }
      try { if ((await fetch(base + '/api/health')).ok) return true; } catch (e) { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  /** End the server and wait until it is gone: asked first, then made to. */
  const end = (p) => new Promise((resolve) => {
    if (!p || p.exitCode != null || p.signalCode != null) return resolve();
    const hard = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) { /* gone */ } }, 4000);
    p.once('exit', () => { clearTimeout(hard); resolve(); });
    try { p.kill(); } catch (e) { clearTimeout(hard); resolve(); }
  });

  proc = spawnOne();
  process.on('exit', () => { try { proc.kill(); } catch (e) { /* already gone */ } });
  // Ctrl-C, or the suite's own timeout: without these the test went and its server stayed
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sig) => process.once(sig, () => { try { proc.kill(); } catch (e) { /* gone */ } process.exit(130); }));
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
      await end(proc);
      proc = spawnOne();
      if (!await up()) throw new Error('server did not come back');
      pb.su = await auth();
    },
    /** Ends the server; the promise resolves when it is gone (awaiting it is optional: the next start waits too). */
    stop: () => end(proc),
    /** The server's process id — for tests of this helper. */
    pid: () => proc.pid
  };
  return pb;
}
