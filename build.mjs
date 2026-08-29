// Single-file bundler: concatenates the app into one self-contained HTML file.
// No runtime dependencies, no network — the output opens by double-click.
import { readFileSync, writeFileSync, mkdirSync, watch } from 'node:fs';
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

function build() {
  const css = read('src/app.css');
  const workerSrc = WORKER_LIBS.map(read).join('\n;\n') + '\n;\n' + read('src/worker.js');
  const js = SCRIPTS.map(read).join('\n;\n');
  const html = read('src/index.html')
    .replace('/*__CSS__*/', () => css)
    .replace('/*__WORKER__*/', () => JSON.stringify(workerSrc))
    .replace('/*__JS__*/', () => js);
  mkdirSync(join(root, 'dist'), { recursive: true });
  const out = join(root, 'dist/smeta-taqqoslash.html');
  writeFileSync(out, html);
  console.log(`built dist/smeta-taqqoslash.html  ${(html.length / 1024).toFixed(0)} KB`);
}

build();
if (process.argv.includes('--watch')) {
  watch(join(root, 'src'), { recursive: true }, () => { try { build(); } catch (e) { console.error(e.message); } });
  console.log('watching src/…');
}
