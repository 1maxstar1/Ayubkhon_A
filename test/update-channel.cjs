/*
 * The update channel, read without PowerShell (fourth audit, C1 — the short measures):
 *
 *   every release in server/releases.txt names a full 40-character commit, and both Windows scripts that read
 *   the list (laptop.ps1, install-windows.ps1) take nothing shorter;
 *   both look for the list on the branch and, failing that, on HEAD;
 *   the PocketBase archive is checked against a sha256 before it is unpacked, and the sums are the same in
 *   laptop.ps1 and get-pocketbase.sh;
 *   get-pocketbase.sh unpacks an archive whose sum matches, and refuses — leaving nothing behind — one whose
 *   sum does not, and a version whose sum it does not know (all offline: the archive is a local file).
 *
 * test/laptop-windows.sh runs the launcher itself under pwsh; this is what can be checked everywhere, CI included.
 *
 *   node test/update-channel.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

/* ------------------------------------------------------------ releases.txt */
const rel = read('server/releases.txt').split(/\r?\n/).filter((l) => /^\s*v\d/.test(l));
check(rel.length > 0, `server/releases.txt lists releases (${rel.length})`);
const short = rel.filter((l) => !/^\s*v\d+\.\d+\.\d+\s+[0-9a-f]{40}(\s|$)/.test(l));
check(short.length === 0, 'each names a full 40-character commit' + (short.length ? ': ' + short.join(' | ') : ''));

/* ------------------------------------------------------------ the two readers */
const ps1 = read('server/laptop.ps1');
const inst = read('server/install-windows.ps1');
for (const [name, src] of [['laptop.ps1', ps1], ['install-windows.ps1', inst]]) {
  const res = [...src.matchAll(/\[regex\]::Match\(\$line, '([^']+)'\)/g)].map((m) => m[1]);
  const rels = res.filter((r) => r.includes('v(\\d+\\.\\d+\\.\\d+)'));
  check(rels.length > 0, `${name} reads the list with a pattern`);
  check(rels.every((r) => r.includes('([0-9a-fA-F]{40})\\b')), `${name} takes a full 40-character commit only`);
  // the pattern itself, the way .NET would apply it to the lines (the syntax is the same here)
  const re = new RegExp(rels[0]);
  check(re.test('v2.10.2 ae308c26a7b5cbc0836ef0c5d613c26988aecf5c note'), `${name}: a full commit is a release`);
  check(!re.test('v2.10.2 ae308c2 note'), `${name}: a short one is not`);
  check(!re.test('v2.10.2 ae308c26a7b5cbc0836ef0c5d613c26988aecf5c0 note'), `${name}: nor one too long`);
  check(src.includes('/claude/excel-price-validation-5ehbvb/server/releases.txt') && src.includes('/HEAD/server/releases.txt'),
    `${name} looks for the list on the branch, then on HEAD`);
}
check(/catch \{\s*\r?\n\s*if \(-not \$ReleaseListAlt\) \{ throw \}/.test(ps1), 'laptop.ps1 turns to HEAD only when the branch cannot be read');

/* ------------------------------------------------------------ PocketBase sums */
const pbVer = (ps1.match(/\$PbVersion = '([\d.]+)'/) || [])[1];
const shVer = (read('server/get-pocketbase.sh').match(/V="\$\{PB_VERSION:-([\d.]+)\}"/) || [])[1];
check(pbVer && pbVer === shVer, `one PocketBase version in both launchers (${pbVer})`);
const psSums = Object.fromEntries([...ps1.matchAll(/'([\d.]+)\/(\w+)' = '([0-9a-f]{64})'/g)].map((m) => [`${m[1]}_windows_${m[2]}`, m[3]]));
const sh = read('server/get-pocketbase.sh');
const shSums = Object.fromEntries([...sh.matchAll(/pocketbase_([\d.]+_\w+?)\.zip\)\s+echo ([0-9a-f]{64})/g)].map((m) => [m[1], m[2]]));
check(Object.keys(psSums).length === 2, 'laptop.ps1 knows the sums of both Windows archives');
check(Object.entries(psSums).every(([k, v]) => shSums[k] === v), 'and they are the ones get-pocketbase.sh knows');
check(['darwin_amd64', 'darwin_arm64', 'linux_amd64', 'linux_arm64'].every((a) => shSums[`${pbVer}_${a}`]),
  'get-pocketbase.sh knows the Mac and Linux archives of that version');
check(/Get-FileHash -Algorithm SHA256 -LiteralPath \$zip/.test(ps1) &&
  ps1.indexOf('Get-FileHash -Algorithm SHA256') < ps1.indexOf('Expand-Archive -Path $zip -DestinationPath $tmp'),
  'laptop.ps1 checks the archive before it unpacks it');

/* ------------------------------------------------------------ get-pocketbase.sh, offline */
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'getpb-'));
try {
  const plat = (() => {
    const o = os.platform() === 'darwin' ? 'darwin' : 'linux';
    const a = { x64: 'amd64', arm64: 'arm64' }[os.arch()] || os.arch();
    return `${o}_${a}`;
  })();
  const V = '9.9.9';
  const dl = path.join(T, 'dl', `v${V}`);
  fs.mkdirSync(dl, { recursive: true });
  const work = path.join(T, 'work');
  fs.mkdirSync(work);
  fs.copyFileSync(path.join(root, 'server/get-pocketbase.sh'), path.join(work, 'get-pocketbase.sh'));
  // an archive holding a «pocketbase» that only answers --version
  const src = path.join(T, 'src');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'pocketbase'), '#!/bin/sh\necho "pocketbase version fake"\n', { mode: 0o755 });
  const zip = path.join(dl, `pocketbase_${V}_${plat}.zip`);
  const z = spawnSync('zip', ['-qj', zip, path.join(src, 'pocketbase')]);
  if (z.status !== 0) {
    check(false, 'zip is needed to make the test archive');
  } else {
    const sum = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    const run = (env) => spawnSync('sh', [path.join(work, 'get-pocketbase.sh')],
      { env: { ...process.env, PB_VERSION: V, PB_DOWNLOAD_BASE: 'file://' + path.join(T, 'dl'), ...env }, encoding: 'utf8' });
    const bin = path.join(work, 'pocketbase');

    let r = run({});
    check(r.status !== 0 && /no sha256 known/.test(r.stderr), 'a version with no known sum is refused');
    check(!fs.existsSync(bin), 'and nothing is unpacked');

    r = run({ PB_SHA256: sum.replace(/^./, (c) => (c === '0' ? '1' : '0')) });
    check(r.status !== 0 && /sha256 mismatch/.test(r.stderr), 'an archive whose sum does not match is refused');
    check(!fs.existsSync(bin) && !fs.existsSync(path.join(work, 'pb.zip')), 'and nothing of it is left behind');

    r = run({ PB_SHA256: 'abc' });
    check(r.status !== 0 && /64 hex/.test(r.stderr), 'a sum that is not one is refused');

    r = run({ PB_SHA256: sum.toUpperCase() });
    check(r.status === 0 && fs.existsSync(bin) && /pocketbase version fake/.test(r.stdout),
      'an archive whose sum matches is unpacked and answers' + (r.status ? ': ' + r.stderr : ''));
  }
} finally {
  fs.rmSync(T, { recursive: true, force: true });
}

/* ------------------------------------------------------------ laptop.ps1's own check, under PowerShell */
// The function as it stands in laptop.ps1, with the download replaced by a local file: the archive that does
// not match is refused and nothing of it is left; the one that matches is unpacked. Runs where PowerShell is
// (PWSH=<path>, or pwsh on PATH — releases are made there); elsewhere the text checks above are all there is.
const pwsh = process.env.PWSH || (spawnSync('sh', ['-c', 'command -v pwsh'], { encoding: 'utf8' }).stdout || '').trim();
const fn = (ps1.match(/^function Ensure-PocketBase \{\r?\n[\s\S]*?^\}/m) || [])[0];
const table = (ps1.match(/^\$PbSha256 = @\{\r?\n[\s\S]*?^\}/m) || [])[0];
check(!!fn && !!table, 'laptop.ps1 has the download function and the table of sums');
if (!pwsh || !fs.existsSync(pwsh)) {
  console.log('skip the function under PowerShell (no pwsh here)');
} else if (fn && table) {
  const P = fs.mkdtempSync(path.join(os.tmpdir(), 'pbps-'));
  try {
    const src = path.join(P, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'pocketbase.exe'), 'not a program, a stand-in\n');
    const zip = path.join(P, 'fake.zip');
    const z = spawnSync('zip', ['-qj', zip, path.join(src, 'pocketbase.exe')]);
    check(z.status === 0, 'zip makes the stand-in archive');
    const sum = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    const script = path.join(P, 'case.ps1');
    fs.writeFileSync(script, [
      "$ErrorActionPreference = 'Stop'",
      '$AppHome = $env:T_HOME',
      "$Pb = Join-Path $AppHome 'pocketbase.exe'",
      "$PbVersion = '" + pbVer + "'",
      table,
      'if ($env:T_VERSION) { $PbVersion = $env:T_VERSION }',
      'if ($env:T_SUM) { $PbSha256[$env:T_KEY] = $env:T_SUM }',
      'function Say($m) { }',
      'function Invoke-WebRequest { param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile, $TimeoutSec)',
      '  $script:Asked = $Uri; Copy-Item -LiteralPath $env:T_ZIP -Destination $OutFile }',
      fn,
      "$threw = ''",
      'try { Ensure-PocketBase } catch { $threw = $_.Exception.Message }',
      '"THREW=$threw"',
      '"PB=" + (Test-Path $Pb)',
      "\"ZIP=\" + (Test-Path (Join-Path $AppHome 'pocketbase.zip'))",
      "\"TMP=\" + (Test-Path (Join-Path $AppHome 'pocketbase-unzip'))",
      '"URI=$script:Asked"',
    ].join('\n') + '\n');
    let n = 0;
    const ps = (env) => {
      const home = path.join(P, 'home' + (n++));
      fs.mkdirSync(home);
      const r = spawnSync(pwsh, ['-NoProfile', '-File', script],
        { env: { ...process.env, PROCESSOR_ARCHITECTURE: '', T_HOME: home, T_ZIP: zip, T_VERSION: '', T_SUM: '', T_KEY: '', ...env }, encoding: 'utf8' });
      const out = {};
      for (const l of (r.stdout || '').split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m) out[m[1]] = m[2]; }
      out.raw = (r.stdout || '') + (r.stderr || '');
      return out;
    };
    const none = (o) => o.PB === 'False' && o.ZIP === 'False' && o.TMP === 'False';

    let o = ps({});
    check(/tekshiruvdan o'tmadi/.test(o.THREW || '') && o.THREW.includes(sum), 'under PowerShell: an archive that is not the published one is refused' + (o.THREW ? '' : ': ' + o.raw.slice(0, 200)));
    check(none(o), 'and nothing of it is left behind');
    check(/_windows_amd64\.zip$/.test(o.URI || ''), 'it asks for the Windows archive of this processor (' + (o.URI || '').split('/').pop() + ')');

    o = ps({ T_KEY: pbVer + '/amd64', T_SUM: sum });
    check(o.THREW === '' && o.PB === 'True' && o.ZIP === 'False' && o.TMP === 'False', 'an archive whose sum matches is unpacked, and the download is cleared away' + (o.THREW ? ': ' + o.THREW : ''));

    o = ps({ PROCESSOR_ARCHITECTURE: 'ARM64', T_KEY: pbVer + '/amd64', T_SUM: sum });
    check(/tekshiruvdan o'tmadi/.test(o.THREW || '') && none(o) && /_windows_arm64\.zip$/.test(o.URI || ''), 'on ARM64 the other archive is asked for and checked against its own sum');

    o = ps({ T_VERSION: '9.9.9' });
    check(/kutilgani ''/.test(o.THREW || '') && none(o), 'a version whose sum is not in the table is refused');
  } finally {
    fs.rmSync(P, { recursive: true, force: true });
  }
}

console.log(fail ? `\nupdate-channel: ${fail} failed` : '\nupdate-channel: all ok');
process.exit(fail ? 1 : 0);
