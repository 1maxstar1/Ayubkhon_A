// Single-file bundler: concatenates the app into one self-contained HTML file.
// No runtime dependencies, no network — the output opens by double-click.
import { readFileSync, writeFileSync, mkdirSync, watch, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

// Stamped into every page. The point is not bookkeeping: when a release turns
// out to be wrong and the server is put back on the previous one, this is how
// anybody can tell, at a glance, which one they are actually looking at.
const VERSION = 'v' + JSON.parse(read('package.json')).version;

// Order matters: plain scripts sharing one global namespace, cheapest possible
// startup (no module graph, no dynamic import) for a file served from file://.
// Name normalisation and the matching layer come first and are shared with the
// worker and with the PocketBase hooks, so there is exactly one definition of
// "these two names are the same resource" in the whole system.
const CORE = [
  'src/vendor/fflate.umd.js',
  'src/lib/normalize.js',
  'src/lib/match.js',
  'src/lib/sections.js',
  'src/lib/util.js',
];
const SCRIPTS = [
  ...CORE,
  'src/lib/formula.js',
  'src/lib/xlsx-read.js',
  'src/lib/xlsx-write.js',
  'src/lib/smeta.js',
  'src/lib/assemble.js',
  'src/lib/report.js',
  'src/lib/export.js',
  'src/ui/grid.js',
  'src/ui/prices.js',
  'src/ui/app.js',
];
const REST = SCRIPTS.slice(CORE.length);

// Files the worker needs; inlined again inside the worker blob so parsing runs
// off the main thread without a second network/file fetch.
const WORKER_LIBS = [
  ...CORE,
  'src/lib/formula.js',
  'src/lib/xlsx-read.js',
  'src/lib/smeta.js',
  'src/lib/assemble.js',
];

// Server mode adds the PocketBase client in front and the sign-in / registry /
// sync screens behind; files that a later phase has not written yet are skipped.
const SERVER_SCRIPTS = [
  'src/vendor/pocketbase.umd.js',
  ...CORE,
  'src/lib/pb.js',
  'src/lib/regions.js',
  ...REST,
  'src/ui/auth.js',
  'src/ui/apps-admin.js',
  'src/ui/registry.js',
  'src/ui/sync.js',
  'src/ui/hints.js',
  // reference prices: the main thread only shows the lines (Russian texts) and keeps the as-of date; the pool, the
  // parsers and the suggester run in their own worker (REFS_WORKER_LIBS below)
  'src/lib/refs/view.js',
  'src/lib/refs/query.js',
  'src/ui/refs.js',
].filter((p) => existsSync(join(root, p)));

// The reference-price worker of the server page (src/refs-worker.js): the whole-country pool, the family parsers and
// the suggester, off the main thread. Never in the single-file page — it has no server to take a package from.
const REFS_FAMILIES = ['machines', 'cable', 'steel', 'mineral', 'electro'].map((f) => `src/lib/refs/families/${f}.js`);
const REFS_WORKER_LIBS = [
  'src/vendor/fflate.umd.js',
  'src/lib/normalize.js',
  'src/lib/match.js',
  'src/lib/sections.js',
  'src/lib/util.js',
  'src/lib/refs/package.js',
  'src/lib/refs/units.js',
  ...REFS_FAMILIES,
  'src/lib/refs/index.js',
  'src/lib/refs/view.js',
  'src/lib/refs/query.js',
  'src/lib/refs/pool.js',
  'src/lib/refs/retrieve.js',
  'src/lib/refs/suggest.js',
  'src/lib/refs/cache.js',
];
// Everything a derived pool record depends on. Its hash is the stamp the worker's IndexedDB cache is kept under, so a
// release that changes how keys are derived derives them again by itself, once.
const REFS_KEYS_FILES = [
  'src/lib/normalize.js', 'src/lib/match.js', 'src/lib/refs/package.js', 'src/lib/refs/units.js', ...REFS_FAMILIES,
  'src/lib/refs/index.js', 'src/lib/refs/pool.js', 'src/lib/refs/cache.js',
];
function refsWorkerSrc() {
  if (!existsSync(join(root, 'src/refs-worker.js'))) return null;
  const keys = createHash('sha256').update(REFS_KEYS_FILES.map(read).join('\n;\n')).digest('hex').slice(0, 16);
  // first line: `S` does not exist yet here (index.js copies the stamp into S.refs.KEYS)
  return "self.REFS_KEYS = '" + keys + "';\n" + REFS_WORKER_LIBS.map(read).join('\n;\n') + '\n;\n' + read('src/refs-worker.js');
}

function page(scripts, server) {
  const css = read('src/app.css');
  const workerSrc = WORKER_LIBS.map(read).join('\n;\n') + '\n;\n' + read('src/worker.js');
  const js = scripts.map(read).join('\n;\n');
  const refs = server ? refsWorkerSrc() : null;
  return read('src/index.html')
    .replace('/*__VERSION__*/', () => VERSION)
    .replace('/*__CSS__*/', () => css)
    .replace('<!--__SCREENS__-->', () => (server && existsSync(join(root, 'src/screens.html')) ? read('src/screens.html') : ''))
    .replace('/*__WORKER__*/', () => JSON.stringify(workerSrc))
    // the single-file page carries no reference-price code at all, not even the empty slot
    .replace(/<script>window\.__REFS_WORKER_SRC__ = \/\*__REFS_WORKER__\*\/;<\/script>\n?/, () =>
      (refs ? '<script>window.__REFS_WORKER_SRC__ = ' + JSON.stringify(refs) + ';</script>\n' : ''))
    .replace('/*__JS__*/', () => js);
}

function emit(name, html) {
  writeFileSync(join(root, 'dist', name), html);
  console.log(`built dist/${name}  ${(html.length / 1024).toFixed(0)} KB  ${VERSION}`);
}

// The hooks need the very same normalisation the page uses — a match key
// computed one way in the browser and another way on the server would quietly
// stop matching. Generated, never edited by hand.
const HOOK_LIB = ['src/lib/normalize.js', 'src/lib/match.js'];
function hookLib() {
  return '/* GENERATED by build.mjs from ' + HOOK_LIB.join(', ') + ' — do not edit. */\n' +
    HOOK_LIB.map(read).join('\n;\n') + '\nmodule.exports = S;\n';
}

function build() {
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'server/pb_hooks/lib'), { recursive: true });
  writeFileSync(join(root, 'server/pb_hooks/lib/nlp.js'), hookLib());
  emit('smeta-taqqoslash.html', page(SCRIPTS, false));   // offline, double-click
  emit('index.html', page(SERVER_SCRIPTS, true));         // served by PocketBase
  if (existsSync(join(root, 'src/admin.html'))) {
    const admin = read('src/admin.html')
      .replace('/*__VERSION__*/', () => VERSION)
      .replace('/*__CSS__*/', () => read('src/app.css'))
      .replace('<!--__SCREENS__-->', () => read('src/screens.html'))
      // the reference-price importer checks a package in the browser before it uploads it: fflate when the browser
      // has no DecompressionStream, the package format and its validator, and the Russian document labels
      .replace('/*__JS__*/', () => ['src/vendor/pocketbase.umd.js', 'src/vendor/xlsx.full.min.js', 'src/vendor/fflate.umd.js',
        'src/lib/normalize.js', 'src/lib/match.js', 'src/lib/util.js', 'src/lib/pb.js', 'src/lib/regions.js', 'src/lib/registry-parse.js',
        'src/lib/refs/package.js', 'src/lib/refs/view.js',
        'src/ui/auth.js', 'src/ui/apps-admin.js', 'src/ui/admin.js', 'src/ui/refs-admin.js']
        .filter((p) => existsSync(join(root, p))).map(read).join('\n;\n'));
    emit('admin.html', admin);
  }
  if (process.argv.includes('--serve')) {
    mkdirSync(join(root, 'server/pb_public'), { recursive: true });
    for (const f of ['index.html', 'admin.html']) {
      if (existsSync(join(root, 'dist', f))) copyFileSync(join(root, 'dist', f), join(root, 'server/pb_public', f));
    }
    console.log('copied to server/pb_public/');
  }
}

build();
if (process.argv.includes('--watch')) {
  watch(join(root, 'src'), { recursive: true }, () => { try { build(); } catch (e) { console.error(e.message); } });
  console.log('watching src/…');
}
