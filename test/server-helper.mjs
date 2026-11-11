/*
 * The test server helper itself (test/server.mjs, test/pb-smoke.sh).
 *
 * A test that is killed leaves its server behind, and one that leaves without waiting leaves it for a moment.
 * The next test then removed the data directory under a server still writing into it, and failed — for a
 * reason that had nothing to do with what it tested, and not every time. Held here:
 *   - starting a test ends a server an earlier one left, and gets a clean directory;
 *   - a port something else holds is refused in words, not waited on;
 *   - stop() resolves when the server is gone.
 *
 *   node test/server-helper.mjs
 */
import http from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, DATA } from './server.mjs';

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const answers = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch (e) { return false; } };

const P1 = 8155, P2 = 8156, P3 = 8157;

/* a server left behind by an earlier test */
const first = await startServer({ port: P1 });
const left = first.pid();
await first.api('/api/collections/applications/records', { method: 'POST', body: JSON.stringify({ number: 'left-behind', org_name: 'Probe' }) }, first.su);
check(await answers(P1) && alive(left), 'a server is up, and its test «forgets» it');
const second = await startServer({ port: P2 });
check(!alive(left) && !(await answers(P1)), 'the next start ends it, and waits until it is gone');
const seen = await second.api('/api/collections/applications/records?filter=' + encodeURIComponent("number='left-behind'"), {}, second.su);
check(seen.totalItems === 0, 'and begins with a clean directory: nothing of the earlier test is in it');

/* stop() */
const pid2 = second.pid();
await second.stop();
check(!alive(pid2) && !(await answers(P2)), 'stop() resolves when the server is gone');
check(existsSync(join(DATA, 'data.db')), 'its data stays for whoever wants to look');

/* a port held by something else */
const other = http.createServer((rq, rs) => { rs.writeHead(200, { 'content-type': 'application/json' }); rs.end('{}'); });
await new Promise((r) => other.listen(P3, '127.0.0.1', r));
let said = '';
const t0 = Date.now();
try { await startServer({ port: P3 }); } catch (e) { said = e.message; }
check(/port 8157 is taken/.test(said), 'a port something else holds is refused in words (' + said.slice(0, 60) + '…)');
check(Date.now() - t0 < 60 * 1000, 'and at once, not after a long wait');
other.close();

console.log(fail ? `FAILED (${fail})` : 'server-helper OK');
process.exit(fail ? 1 : 0);
