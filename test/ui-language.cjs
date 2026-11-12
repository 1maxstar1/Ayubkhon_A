/*
 * The interface speaks one language: Russian (CLAUDE.md, the owner's request of 2026-09-04).
 *
 * Words in Uzbek crept into it one section at a time — the whole UZEX admin panel, «Ichki/Eksport» in the price
 * check, a sidebar tooltip «Лист1 A ustuni», «Faqat administrator» from the server — because nothing looked. This
 * looks: every string literal in src/ui/*.js, src/lib/pb.js and the server hooks, and the visible text of
 * src/*.html, is scanned for marks of Uzbek written in Latin letters (o' / g' in a word, the word «va», and a few
 * roots this program's own Uzbek used). English the server says is S.pbErr's business (test/pb-err.cjs).
 *
 * The export document is not the interface: its headers are Russian and Uzbek like the 321.xlsx sample, and so is
 * the file name of the price book. Those few lines are allowed by what they contain, below — a new Uzbek string
 * anywhere else fails.
 *
 *   node test/ui-language.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

// marks of Latin-script Uzbek; none of them occurs in Russian or in the English of the code
const UZ = /(?:^|[^A-Za-z])[oOgG]['ʻ’`][a-z]{2}|[A-Za-z][oOgG]['ʻ’`][a-z]|\b(?:va|Ichki|Eksport)\b|\b(?:yangila|hafta|ustun|saqla|qiling|kerak|topilma|bo'yicha|obyekt|narx|[Ff]aqat|[Kk]irish)/;

// the export texts and the price-book file name: Uzbek on purpose, matched by what they say
const ALLOW = [
  /xulosaga[\s\S]*qo'yilma/,                         // app.js DEFAULTS.stamp — the document's stamp
  /obyekti bo'yicha loyiha-smeta hujjatlarida/,      // app.js introFrom — the document's lead line
  /narx parametrlarini o'rganish natijalariga/,      // its continuation
  /^\(или «Bozor ma'lumotlariga ko'ra»\)$/,          // compare.js — names the document's own column header
  /narx_kitobi/                                      // the price book's file name
];

/** String literals of a JavaScript file, with their line numbers; comments are left out. */
function literals(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const z = src.indexOf('*/', i + 2);
      const end = z < 0 ? n : z + 2;
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end; continue;
    }
    if (c === '/') {
      // a regular expression, not a division: what comes before it cannot end a value
      let k = i - 1;
      while (k >= 0 && /\s/.test(src[k])) k--;
      if (k < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(src[k]) || /\b(?:return|typeof|case|in|of)$/.test(src.slice(Math.max(0, k - 6), k + 1))) {
        let cls = false; i++;
        while (i < n && src[i] !== '\n' && (cls || src[i] !== '/')) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
          i++;
        }
        i++; continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      const at = line; let s = ''; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }   // «qo\'yilma» is qo'yilma
        if (src[i] === '\n') line++;
        s += src[i++];
      }
      i++;
      out.push({ line: at, text: s });
      continue;
    }
    i++;
  }
  return out;
}

const hits = [];
const files = fs.readdirSync(path.join(ROOT, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => 'src/ui/' + f);
files.push('src/lib/pb.js');
// the server's messages reach the page as they are (S.pbErr passes a hook's Russian text on)
for (const d of ['server/pb_hooks', 'server/pb_hooks/lib']) {
  for (const f of fs.readdirSync(path.join(ROOT, d))) if (f.endsWith('.js')) files.push(d + '/' + f);
}
for (const f of files) {
  for (const l of literals(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
    if (UZ.test(l.text) && !ALLOW.some((a) => a.test(l.text))) hits.push(`${f}:${l.line}  ${l.text.slice(0, 100)}`);
  }
}
const html = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.html')).map((f) => 'src/' + f);
for (const f of html) {
  // what a person sees: the text between tags and the title / placeholder / aria-label / alt attributes; line
  // breaks are kept where they were, so a hit names its line
  const doc = fs.readFileSync(path.join(ROOT, f), 'utf8')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/<[^>]*>/g, (tag) => ' ' + (tag.match(/(?:title|placeholder|aria-label|alt)="[^"]*"/g) || []).join(' ') + ' ' +
      tag.replace(/[^\n]/g, ''));
  doc.split('\n').forEach((seen, k) => {
    if (UZ.test(seen) && !ALLOW.some((a) => a.test(seen))) hits.push(`${f}:${k + 1}  ${seen.trim().slice(0, 100)}`);
  });
}
for (const h of hits) console.log('     ' + h);
check(hits.length === 0, `no Uzbek in the interface's strings (${files.length} scripts, ${html.length} pages)`);

// the scanner itself: it finds what it is for, and leaves Russian and the allowed export lines alone
check(UZ.test("UZEX dan yangilash") && UZ.test("Qayta o'qish") && UZ.test('Лист1 A ustuni') && UZ.test('Ichki') && UZ.test('Eksport') && UZ.test('x va y'),
  'it recognises the Uzbek this test was written after');
check(UZ.test('Faqat administrator') && UZ.test('Kirish kerak') && !UZ.test('Недельные котировки UZEX') && !UZ.test("data-act='del'") && !UZ.test('Value must be unique'),
  'and not Russian, markup or English');
check(literals("var a = 'x'; // Qayta o'qish\n/* va */ var b = \"y\";").map((l) => l.text).join() === 'x,y', 'comments are not strings');

console.log(fail ? `FAILED (${fail})` : 'ui-language OK');
process.exit(fail ? 1 : 0);
