/*
 * The test server helper itself (test/server.mjs, test/pb-smoke.sh).
 *
 * A test that is killed leaves its server behind, and one that leaves without waiting leaves it for a moment.
 * The next test then removed the data directory under a server still writing into it, and failed — for a
 * reason that had nothing to do with what it tested, and not every time. Held here:
 *   - starting a test ends a server an earlier one left, and gets a clean directory;
 *   - found by the pids test/server.mjs writes down — but only a server of pb_data_test is ever ended: a pocketbase
 *     serving another directory (the owner's own, in laptop mode, from this same checkout) is left alone even when
 *     a stale pid in that file is now its pid, and so is a pid that is no server at all;
 *   - found by its command line whatever form the directory takes (--dir=/absolute/…/pb_data_test) — and another
 *     checkout's «--dir pb_data_test», relative, told apart by its working directory and left alone;
 *   - found without pgrep, too;
 *   - pb-smoke.sh has ended its own server — not only told it to stop — by the time it returns;
 *   - a port something else holds is refused in words, not waited on;
 *   - stop() resolves when the server is gone.
 *
 *   node test/server-helper.mjs
 */
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, appendFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { startServer, DATA, ROOT } from './server.mjs';

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const answers = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch (e) { return false; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PB = join(ROOT, 'server', existsSync(join(ROOT, 'server/pocketbase.exe')) ? 'pocketbase.exe' : 'pocketbase');
const PIDS = join(ROOT, 'test/.servers.pid');
const tmp = mkdtempSync(join(tmpdir(), 'helper-'));

/** A pocketbase started by hand — the way a test that does not use the helper starts one. */
// every process started here is ended when the test ends, however it ends: a server of another directory is never
// ended by pb-smoke.sh, and one left running would hold its port for the next run
const mine = [];
process.on('exit', () => mine.forEach((p) => { try { p.kill('SIGKILL'); } catch (e) { /* gone */ } }));
['SIGINT', 'SIGTERM'].forEach((sig) => process.once(sig, () => process.exit(130)));
async function pocketbase(port, dir) {
  const p = spawn(PB, ['serve', '--http', '127.0.0.1:' + port, dir, '--hooksDir', join(ROOT, 'server/pb_hooks')],
    { stdio: 'ignore', env: { ...process.env, UZEX_AUTO: '0' } });       // a test server never fetches the exchange's quotes by itself
  mine.push(p);
  for (let i = 0; i < 40 && !(await answers(port)); i++) await wait(250);
  return p;
}

const P1 = 8155, P2 = 8156, P3 = 8157, P4 = 8158, P5 = 8159, P6 = 8160;

/* a server left behind by an earlier test */
const first = await startServer({ port: P1 });
const left = first.pid();
await first.api('/api/collections/applications/records', { method: 'POST', body: JSON.stringify({ number: 'left-behind', org_name: 'Probe' }) }, first.su);
check(await answers(P1) && alive(left), 'a server is up, and its test «forgets» it');
const second = await startServer({ port: P2 });
check(!alive(left) && !(await answers(P1)), 'the next start ends it, and waits until it is gone');
const seen = await second.api('/api/collections/applications/records?filter=' + encodeURIComponent("number='left-behind'"), {}, second.su);
check(seen.totalItems === 0, 'and begins with a clean directory: nothing of the earlier test is in it');

/* stop() — before anything else touches the directory, so that what is checked is stop() itself */
const pid2 = second.pid();
await second.stop();
check(!alive(pid2) && !(await answers(P2)), 'stop() resolves when the server is gone');
check(existsSync(join(DATA, 'data.db')) && existsSync(join(DATA, 'dev-otp.txt')), 'its data stays for whoever wants to look');

// pb-smoke.sh by itself, with no server running: the pid of the server it started is the last it wrote down, and that
// server must be gone the moment the script returns. (Told to stop and not waited for, it was still closing its
// database then.)
execSync('sh test/pb-smoke.sh', { cwd: ROOT, stdio: 'ignore' });
const own = +readFileSync(PIDS, 'utf8').trim().split('\n').pop();
check(own > 0 && !alive(own), 'pb-smoke.sh has ended its own server, not only told it to stop, by the time it returns');

/* found by the file, by the command line, and not on the strength of the file alone */
mkdirSync(join(tmp, 'elsewhere'));
const other = await pocketbase(P4, '--dir=' + join(tmp, 'elsewhere'));        // another directory, its pid in the file
appendFileSync(PIDS, other.pid + '\n');                                        // as if a stale pid had been reused by it
const absolute = await pocketbase(P5, '--dir=' + DATA);                          // pb_data_test, written another way: not in the file
// another checkout's server, given its directory the way server/run.sh gives it — relative, «pb_data_test» — and its
// pid in the file: the same command line as one of this checkout's, told apart by its working directory
const clone = join(tmp, 'clone');
mkdirSync(join(clone, 'pb_data_test'), { recursive: true });
const cloned = spawn(PB, ['serve', '--http', '127.0.0.1:' + P1, '--dir', 'pb_data_test', '--hooksDir', join(ROOT, 'server/pb_hooks')],
  { cwd: clone, stdio: 'ignore', env: { ...process.env, UZEX_AUTO: '0' } });
mine.push(cloned);
for (let i = 0; i < 40 && !(await answers(P1)); i++) await wait(250);
appendFileSync(PIDS, cloned.pid + '\n');
const bystander = spawn('sleep', ['60'], { stdio: 'ignore' });                   // in the file, and no server
appendFileSync(PIDS, bystander.pid + '\n');
check(await answers(P4) && await answers(P5) && await answers(P1) && alive(bystander.pid), 'four processes are there: three servers and one that is none');
const third = await startServer({ port: P2 });
check(alive(other.pid) && await answers(P4), 'a pocketbase serving another directory is left alone, though its pid is in the file');
other.kill();
check(alive(cloned.pid) && await answers(P1), 'so is another checkout\'s server given «--dir pb_data_test» relative, as server/run.sh gives it');
cloned.kill();
check(!alive(absolute.pid) && !(await answers(P5)), 'a server of pb_data_test given as --dir=/absolute/path is ended too');
check(alive(bystander.pid), 'a pid in the file that is no server is left alone');
bystander.kill();

/* without pgrep */
const bin = join(tmp, 'bin');
mkdirSync(bin);
const linked = new Set(['pgrep', 'pkill']);
for (const d of (process.env.PATH || '').split(delimiter)) {
  let names = [];
  try { names = readdirSync(d); } catch (e) { continue; }
  for (const n of names) {
    if (linked.has(n)) continue;
    try { if (!statSync(join(d, n)).isFile()) continue; symlinkSync(join(d, n), join(bin, n)); linked.add(n); } catch (e) { /* not ours to link */ }
  }
}
const left3 = third.pid();                                                      // written down
// not written down, found by its command line — only where /proc can be read: without pgrep and without /proc nothing
// would find it, and it would go on serving the directory the next start removes
const PROC = existsSync('/proc/self/cmdline');
const unwritten = PROC ? await pocketbase(P5, '--dir=' + DATA) : null;
if (PROC) check(await answers(P5), 'a server of pb_data_test that the helper did not write down is up');
const PATH = process.env.PATH;
process.env.PATH = bin;
let fourth = null, said3 = '';
try { fourth = await startServer({ port: P6 }); } catch (e) { said3 = e.message; } finally { process.env.PATH = PATH; }
check(!!fourth && !alive(left3), 'without pgrep a server the helper wrote down is still ended' + (said3 ? ' (' + said3.slice(0, 80) + ')' : ''));
if (PROC) {
  check(!alive(unwritten.pid) && !(await answers(P5)), 'and the one it did not write down is found in /proc by its command line');
} else {
  check(true, 'and one it did not write down — not checked: no /proc here, and without pgrep nothing else lists processes');
}
if (fourth) await fourth.stop();

/* a port held by something else */
const holder = http.createServer((rq, rs) => { rs.writeHead(200, { 'content-type': 'application/json' }); rs.end('{}'); });
await new Promise((r) => holder.listen(P3, '127.0.0.1', r));
let said = '';
const t0 = Date.now();
try { await startServer({ port: P3 }); } catch (e) { said = e.message; }
check(/port 8157 still answers after the test servers were ended — something else holds it/.test(said), 'a port something else holds is refused in words (' + said.slice(0, 60) + '…)');
check(Date.now() - t0 < 60 * 1000, 'and at once, not after a long wait');
holder.close();

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'server-helper OK');
process.exit(fail ? 1 : 0);
