// Single-file bundler: concatenates the app into one self-contained HTML file.
// No runtime dependencies, no network — the output opens by double-click.
import { readFileSync, writeFileSync, mkdirSync, watch, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

// Order matters: plain scripts sharing one global namespace, cheapest possible
// startup (no module graph, no dynamic import) for a file served from file://.
const SCRIPTS = [
  'src/vendor/fflate.umd.js',
  'src/lib/util.js',
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

// Files the worker needs; inlined again inside the worker blob so parsing runs
// off the main thread without a second network/file fetch.
const WORKER_LIBS = [
  'src/vendor/fflate.umd.js',
  'src/lib/util.js',
  'src/lib/formula.js',
  'src/lib/xlsx-read.js',
  'src/lib/smeta.js',
  'src/lib/assemble.js',
];

// Server mode adds the PocketBase client in front and the sign-in / registry /
// sync screens behind; files that a later phase has not written yet are skipped.
const SERVER_SCRIPTS = [
  'src/vendor/pocketbase.umd.js',
  ...SCRIPTS.slice(0, 2),      // fflate, util (defines the S namespace)
  'src/lib/pb.js',
  'src/lib/regions.js',
  ...SCRIPTS.slice(2),
  'src/ui/auth.js',
  'src/ui/registry.js',
  'src/ui/sync.js',
  'src/ui/hints.js',
].filter((p) => existsSync(join(root, p)));

function page(scripts, screens) {
  const css = read('src/app.css');
  const workerSrc = WORKER_LIBS.map(read).join('\n;\n') + '\n;\n' + read('src/worker.js');
  const js = scripts.map(read).join('\n;\n');
  return read('src/index.html')
    .replace('/*__CSS__*/', () => css)
    .replace('<!--__SCREENS__-->', () => (screens && existsSync(join(root, 'src/screens.html')) ? read('src/screens.html') : ''))
    .replace('/*__WORKER__*/', () => JSON.stringify(workerSrc))
    .replace('/*__JS__*/', () => js);
}

function emit(name, html) {
  writeFileSync(join(root, 'dist', name), html);
  console.log(`built dist/${name}  ${(html.length / 1024).toFixed(0)} KB`);
}

function build() {
  mkdirSync(join(root, 'dist'), { recursive: true });
  emit('smeta-taqqoslash.html', page(SCRIPTS, false));   // offline, double-click
  emit('index.html', page(SERVER_SCRIPTS, true));         // served by PocketBase
  if (existsSync(join(root, 'src/admin.html'))) {
    const admin = read('src/admin.html')
      .replace('/*__CSS__*/', () => read('src/app.css'))
      .replace('<!--__SCREENS__-->', () => read('src/screens.html'))
      .replace('/*__JS__*/', () => ['src/vendor/pocketbase.umd.js', 'src/vendor/xlsx.full.min.js',
        'src/lib/util.js', 'src/lib/pb.js', 'src/lib/regions.js', 'src/lib/registry-parse.js', 'src/ui/auth.js', 'src/ui/admin.js']
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
