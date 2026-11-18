'use strict';
/*
 * Small PDF files made for the tests of src/lib/pdf-read.js — only invented text, nothing from a real reply.
 *
 * A page is drawn in the coordinates of the sheet as it is shown (points, from the top-left corner) and written the
 * way the programs that print our reply write it:
 *   style 'print'  — like Windows' «Microsoft: Print To PDF»: the page flipped by «0.75 0 0 -0.75 0 H cm», every text
 *                    run «1 0 0 -1 x y Tm», a two-byte font (Type0, Identity-H) with a ToUnicode map, the table's
 *                    borders as thin filled rectangles;
 *   style 'plain'  — a simple font (Cyrillic through /Differences glyph names), «x y Td … Tj», borders stroked;
 *   style 'turned' — the page kept portrait and turned by /Rotate 90, the text run sideways on it.
 * Options of the file: compress (Flate), objstm (objects in an object stream, a cross-reference stream), encrypt (an
 * /Encrypt entry), form (the page drawn inside a form XObject), noUnicode (a Type0 font with no ToUnicode map),
 * scan (a page that is only a picture).
 *
 *   const { Page, makePdf } = require('./pdf-make.cjs');
 *   const pg = new Page(842, 595); pg.text(40, 40, 'Заголовок'); pg.table(40, 60, [30, 200, 60], rows);
 *   const bytes = makePdf([pg], { style: 'print', compress: true });
 */
const zlib = require('zlib');

const SIZE = 9;
/** The advance of a glyph in thousandths of an em: the same in every font made here. */
const adv = (ch) => (ch === ' ' ? 250 : 500);
const width = (str, size) => [...str].reduce((w, ch) => w + adv(ch), 0) / 1000 * size;

class Page {
  constructor(w, h) { this.w = w; this.h = h; this.runs = []; this.hl = []; this.vl = []; }
  /** One run of text, its baseline at y. */
  text(x, y, str, size) { this.runs.push({ x, y, size: size || SIZE, parts: [String(str)] }); }
  /** One run of several pieces, moved apart by kerning (thousandths of an em; negative moves right) — one TJ. */
  tj(x, y, parts, size) { this.runs.push({ x, y, size: size || SIZE, parts }); }
  hline(x1, x2, y) { this.hl.push({ x1, x2, y }); }
  vline(x, y1, y2) { this.vl.push({ x, y1, y2 }); }
  /**
   * A table with its borders drawn per cell, as Excel draws them. `rows` are arrays of cell texts (null: empty);
   * o.merge [{ r, c, rs, cs }] cells spanning others (the spanned cells give null); o.tj: indices of rows written
   * as one TJ run across all their cells (the numbering row of our table). Long texts wrap at spaces and after a
   * hyphen. Returns the y of the bottom border.
   */
  table(x0, y0, widths, rows, o) {
    o = o || {};
    const size = o.size || SIZE, pad = 2, lh = size * 1.25, merge = o.merge || [];
    const span = (r, c) => merge.find((m) => m.r === r && m.c === c) || { r, c, rs: 1, cs: 1 };
    const inside = (r, c) => merge.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs && !(r === m.r && c === m.c));
    const xs = [x0];
    widths.forEach((w) => xs.push(xs[xs.length - 1] + w));
    const cellW = (r, c) => { const m = span(r, c); return xs[c + m.cs] - xs[c]; };
    const wrapped = rows.map((row, r) => row.map((v, c) => (v == null || inside(r, c) ? [] : wrap(String(v), cellW(r, c) - 2 * pad, size))));
    const heights = rows.map((row, r) => Math.max(1, ...wrapped[r].map((ls, c) => (span(r, c).rs === 1 ? ls.length : 1))) * lh + 2 * pad);
    const ys = [y0];
    heights.forEach((h) => ys.push(ys[ys.length - 1] + h));
    // borders: a segment per cell side, none through a merged cell
    for (let i = 0; i < ys.length; i++) {
      for (let c = 0; c < widths.length; c++) {
        if (i > 0 && i < rows.length && merge.some((m) => c >= m.c && c < m.c + m.cs && i > m.r && i < m.r + m.rs)) continue;
        this.hline(xs[c], xs[c + 1], ys[i]);
      }
    }
    for (let j = 0; j < xs.length; j++) {
      for (let r = 0; r < rows.length; r++) {
        if (j > 0 && j < widths.length && merge.some((m) => r >= m.r && r < m.r + m.rs && j > m.c && j < m.c + m.cs)) continue;
        this.vline(xs[j], ys[r], ys[r + 1]);
      }
    }
    rows.forEach((row, r) => {
      if ((o.tj || []).includes(r)) {
        // one run over the whole row: each piece moved to its cell by kerning
        const parts = [];
        let at = null;
        row.forEach((v, c) => {
          if (v == null) return;
          const x = xs[c] + pad;
          if (at == null) at = x;
          else parts.push(-Math.round((x - at) / size * 1000));
          parts.push(String(v));
          at = x + width(String(v), size);
        });
        this.tj(xs[row.findIndex((v) => v != null)] + pad, ys[r] + (heights[r] + size * 0.7) / 2, parts, size);
        return;
      }
      row.forEach((v, c) => {
        const ls = wrapped[r][c];
        if (!ls.length) return;
        const m = span(r, c), top = ys[r], bottom = ys[r + m.rs], block = ls.length * lh;
        ls.forEach((l, k) => this.text(xs[c] + pad, top + (bottom - top - block) / 2 + k * lh + size * 0.95, l, size));
      });
    });
    return ys[ys.length - 1];
  }
}

/** Words onto lines no wider than `w`; a word may break after its hyphen («КРАСНО-» / «КОРИЧНЕВАЯ»). */
function wrap(str, w, size) {
  const pieces = [];
  str.split(/\s+/).filter(Boolean).forEach((word) => {
    const bits = word.split(/(?<=-)/);
    bits.forEach((b, i) => pieces.push({ t: b, glue: i > 0 }));
  });
  const out = [];
  let cur = '';
  pieces.forEach((p) => {
    const next = cur ? cur + (p.glue ? '' : ' ') + p.t : p.t;
    if (cur && width(next, size) > w) { out.push(cur); cur = p.t; } else cur = next;
  });
  if (cur) out.push(cur);
  return out;
}

/* ------------------------------------------------------------------ fonts */

function hex(n, len) { return n.toString(16).toUpperCase().padStart(len, '0'); }

/** A two-byte font: every character used gets a glyph number, in the order first seen. */
function type0(chars, unicode) {
  const gid = new Map();
  chars.forEach((ch) => { if (!gid.has(ch)) gid.set(ch, gid.size + 3); });
  const enc = (str) => '<' + [...str].map((ch) => hex(gid.get(ch), 4)).join('') + '>';
  const list = [...gid.entries()];
  // the map: one range for the digits when they came in order, single codes for the rest
  let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  const digits = '0123456789'.split('').map((d) => gid.get(d));
  const inRow = digits.every((g, i) => g != null && g === digits[0] + i);
  const single = list.filter(([ch]) => !(inRow && /[0-9]/.test(ch)));
  if (inRow) cmap += '1 beginbfrange\n<' + hex(digits[0], 4) + '> <' + hex(digits[9], 4) + '> <0030>\nendbfrange\n';
  for (let i = 0; i < single.length; i += 100) {
    const part = single.slice(i, i + 100);
    cmap += part.length + ' beginbfchar\n' + part.map(([ch, g]) => '<' + hex(g, 4) + '> <' + hex(ch.charCodeAt(0), 4) + '>').join('\n') + '\nendbfchar\n';
  }
  cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  const W = '[' + list.map(([ch, g]) => g + ' [' + adv(ch) + ']').join(' ') + ']';
  return {
    enc,
    objects: (num) => {
      // num(name) gives an object its number; returns the font dictionary's own objects
      const out = [
        { id: num('font'), dict: '<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEE+TestSans /Encoding /Identity-H /DescendantFonts [' +
          num('cid') + ' 0 R]' + (unicode ? ' /ToUnicode ' + num('tounicode') + ' 0 R' : '') + ' >>' },
        { id: num('cid'), dict: '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEE+TestSans /CIDSystemInfo << /Registry (Adobe) ' +
          '/Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + num('desc') + ' 0 R /DW 1000 /W ' + W + ' /CIDToGIDMap /Identity >>' },
        { id: num('desc'), dict: '<< /Type /FontDescriptor /FontName /ABCDEE+TestSans /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 ' +
          '/Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>' }
      ];
      if (unicode) out.push({ id: num('tounicode'), stream: Buffer.from(cmap, 'latin1') });
      return out;
    }
  };
}

/** A simple font: ASCII as it is, every other character a code from 128 on, named by /Differences (uniXXXX). */
function simple(chars) {
  const code = new Map();
  chars.forEach((ch) => { if (ch.charCodeAt(0) >= 128 && !code.has(ch)) code.set(ch, 128 + code.size); });
  if (code.size > 127) throw new Error('pdf-make: too many letters for a simple font');
  const enc = (str) => '(' + [...str].map((ch) => {
    const c = ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : code.get(ch);
    if (c === 40 || c === 41 || c === 92) return '\\' + String.fromCharCode(c);
    return c >= 128 ? '\\' + c.toString(8) : String.fromCharCode(c);
  }).join('') + ')';
  const diffs = [...code.entries()].map(([ch, c], i) => (i === 0 ? c + ' ' : '') + '/uni' + hex(ch.charCodeAt(0), 4)).join(' ');
  const widths = [];
  for (let c = 32; c <= 255; c++) widths.push(c === 32 ? 250 : 500);
  return {
    enc,
    objects: (num) => [
      { id: num('font'), dict: '<< /Type /Font /Subtype /TrueType /BaseFont /TestSerif /FirstChar 32 /LastChar 255 /Widths [' + widths.join(' ') +
        '] /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding' + (code.size ? ' /Differences [' + diffs + ']' : '') + ' >> >>' }
    ]
  };
}

/* ----------------------------------------------------------------- a page */

const f = (n) => (Math.round(n * 1000) / 1000).toString();

/** The content stream of one page. */
function content(pg, style, font) {
  const out = [];
  if (style === 'print') {
    const k = 0.75;
    out.push(f(k) + ' 0 0 ' + f(-k) + ' 0 ' + f(pg.h) + ' cm');
    pg.hl.forEach((l) => out.push('q ' + f(l.x1 / k) + ' ' + f(l.y / k - 0.5) + ' m ' + f(l.x2 / k) + ' ' + f(l.y / k - 0.5) + ' l ' +
      f(l.x2 / k) + ' ' + f(l.y / k + 0.5) + ' l ' + f(l.x1 / k) + ' ' + f(l.y / k + 0.5) + ' l h f* Q'));
    pg.vl.forEach((l) => out.push('q ' + f(l.x / k - 0.5) + ' ' + f(l.y1 / k) + ' ' + f(1) + ' ' + f((l.y2 - l.y1) / k) + ' re f Q'));
    pg.runs.forEach((r) => out.push('q BT 0 Tr /F1 ' + f(r.size / k) + ' Tf 1 0 0 -1 ' + f(r.x / k) + ' ' + f(r.y / k) + ' Tm [' +
      r.parts.map((p) => (typeof p === 'number' ? String(p) : font.enc(p))).join('') + '] TJ ET Q'));
  } else if (style === 'plain') {
    out.push('0.5 w');
    pg.hl.forEach((l) => out.push(f(l.x1) + ' ' + f(pg.h - l.y) + ' m ' + f(l.x2) + ' ' + f(pg.h - l.y) + ' l S'));
    pg.vl.forEach((l) => out.push(f(l.x) + ' ' + f(pg.h - l.y1) + ' m ' + f(l.x) + ' ' + f(pg.h - l.y2) + ' l S'));
    pg.runs.forEach((r) => out.push('BT /F1 ' + f(r.size) + ' Tf ' + f(r.x) + ' ' + f(pg.h - r.y) + ' Td ' +
      (r.parts.length === 1 ? font.enc(r.parts[0]) + ' Tj' : '[' + r.parts.map((p) => (typeof p === 'number' ? String(p) : font.enc(p))).join(' ') + '] TJ') + ' ET'));
  } else if (style === 'turned') {
    // the sheet as shown is pg.w × pg.h; the page itself is pg.h wide and pg.w tall, turned by /Rotate 90:
    // a point (X, Y from the top) as shown is (Y, X) on the page
    out.push('0.5 w');
    pg.hl.forEach((l) => out.push(f(l.y) + ' ' + f(l.x1) + ' m ' + f(l.y) + ' ' + f(l.x2) + ' l S'));
    pg.vl.forEach((l) => out.push(f(l.y1) + ' ' + f(l.x) + ' m ' + f(l.y2) + ' ' + f(l.x) + ' l S'));
    pg.runs.forEach((r) => out.push('BT /F1 ' + f(r.size) + ' Tf 0 1 -1 0 ' + f(r.y) + ' ' + f(r.x) + ' Tm [' +
      r.parts.map((p) => (typeof p === 'number' ? String(p) : font.enc(p))).join('') + '] TJ ET'));
  }
  return out.join('\n') + '\n';
}

/* ----------------------------------------------------------------- a file */

/**
 * pages: Page[]; o.style 'print' | 'plain' | 'turned'; o.compress; o.objstm; o.encrypt; o.form; o.noUnicode; o.scan.
 * Returns the file's bytes.
 */
function makePdf(pages, o) {
  o = o || {};
  const style = o.style || 'print';
  const ids = new Map();
  const num = (name) => { if (!ids.has(name)) ids.set(name, ids.size + 1); return ids.get(name); };
  num('catalog'); num('pages');
  const chars = [];
  pages.forEach((pg) => pg.runs.forEach((r) => r.parts.forEach((p) => { if (typeof p === 'string') chars.push(...p); })));
  const font = style === 'plain' ? simple(chars) : type0(chars, !o.noUnicode);
  const objs = [];
  objs.push({ id: num('catalog'), dict: '<< /Type /Catalog /Pages ' + num('pages') + ' 0 R >>' });
  const kids = pages.map((pg, i) => num('page' + i));
  // the plain style keeps its resources and size on the page tree's node, for the pages to take from it
  const res = '<< /Font << /F1 ' + num('font') + ' 0 R >>' + (o.form ? ' /XObject << /Fm1 ' + num('form0') + ' 0 R >>' : '') + ' >>';
  const shared = style === 'plain' ? ' /Resources ' + res + ' /MediaBox [0 0 ' + f(pages[0].w) + ' ' + f(pages[0].h) + ']' : '';
  objs.push({ id: num('pages'), dict: '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + pages.length + shared + ' >>' });
  pages.forEach((pg, i) => {
    let body = content(pg, style, font);
    let pageRes = res;
    if (o.scan) {
      pageRes = '<< /XObject << /Im' + i + ' ' + num('img' + i) + ' 0 R >> >>';
      body = 'q ' + f(pg.w) + ' 0 0 ' + f(pg.h) + ' 0 0 cm /Im' + i + ' Do Q\n';
      objs.push({ id: num('img' + i), streamDict: '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8',
        stream: Buffer.from([0, 255, 255, 0]) });
    } else if (o.form) {
      // the page draws one form, and the form draws the page (moved by its /Matrix and back by the page)
      objs.push({ id: num('form' + i), streamDict: '/Type /XObject /Subtype /Form /BBox [0 0 ' + f(pg.w * 2) + ' ' + f(pg.h * 2) + '] /Matrix [1 0 0 1 10 0] ' +
        '/Resources << /Font << /F1 ' + num('font') + ' 0 R >> >>', stream: Buffer.from(body, 'latin1') });
      if (i > 0) pageRes = '<< /XObject << /Fm1 ' + num('form' + i) + ' 0 R >> >>';
      body = 'q 1 0 0 1 -10 0 cm /Fm1 Do Q\n';
    }
    const box = style === 'turned' ? '[0 0 ' + f(pg.h) + ' ' + f(pg.w) + '] /Rotate 90' : '[0 0 ' + f(pg.w) + ' ' + f(pg.h) + ']';
    objs.push({ id: num('page' + i), dict: '<< /Type /Page /Parent ' + num('pages') + ' 0 R' +
      (style === 'plain' && !o.scan && !(o.form && i > 0) ? '' : ' /MediaBox ' + box + ' /Resources ' + pageRes) + ' /Contents ' + num('content' + i) + ' 0 R >>' });
    objs.push({ id: num('content' + i), stream: Buffer.from(body, 'latin1') });
  });
  font.objects(num).forEach((x) => objs.push(x));
  if (o.encrypt) objs.push({ id: num('encrypt'), dict: '<< /Filter /Standard /V 1 /R 2 /O (0123456789abcdef0123456789abcdef) /U (0123456789abcdef0123456789abcdef) /P -4 >>' });
  return write(objs, ids.size, o);
}

function write(objs, count, o) {
  const parts = [], offsets = {};
  let at = 0;
  const put = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parts.push(buf); at += buf.length; };
  const streamObj = (x) => {
    let data = x.stream, filter = '';
    if (o.compress && !/\/Image/.test(x.streamDict || '')) { data = zlib.deflateSync(data); filter = ' /Filter /FlateDecode'; }
    return { head: '<< ' + (x.streamDict ? x.streamDict + ' ' : '') + '/Length ' + data.length + filter + ' >>\nstream\n', data };
  };
  put('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
  const packed = o.objstm ? objs.filter((x) => x.dict && !/\/Standard/.test(x.dict)) : [];
  const loose = objs.filter((x) => !packed.includes(x));
  loose.forEach((x) => {
    offsets[x.id] = at;
    if (x.stream) { const s = streamObj(x); put(x.id + ' 0 obj\n' + s.head); put(s.data); put('\nendstream\nendobj\n'); }
    else put(x.id + ' 0 obj\n' + x.dict + '\nendobj\n');
  });
  if (!o.objstm) {
    const xref = at;
    let t = 'xref\n0 ' + (count + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= count; i++) t += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
    put(t + 'trailer\n<< /Size ' + (count + 1) + ' /Root 1 0 R' + (o.encrypt ? ' /Encrypt ' + objs.find((x) => /\/Standard/.test(x.dict || '')).id + ' 0 R' : '') +
      ' >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Uint8Array(Buffer.concat(parts));
  }
  // the objects without a stream packed in one object stream; a cross-reference stream says where everything is
  const stmId = count + 1, xrefId = count + 2;
  let head = '', body = '';
  packed.forEach((x) => { head += x.id + ' ' + body.length + ' '; body += x.dict + '\n'; });
  const stm = streamObj({ streamDict: '/Type /ObjStm /N ' + packed.length + ' /First ' + head.length, stream: Buffer.from(head + body, 'latin1') });
  offsets[stmId] = at;
  put(stmId + ' 0 obj\n' + stm.head); put(stm.data); put('\nendstream\nendobj\n');
  const rows = [];
  for (let i = 0; i <= xrefId; i++) {
    const k = packed.findIndex((x) => x.id === i);
    if (i === 0) rows.push([0, 0, 65535]);
    else if (k >= 0) rows.push([2, stmId, k]);
    else rows.push([1, i === xrefId ? at : offsets[i] || 0, 0]);
  }
  const data = Buffer.alloc(rows.length * 7);
  rows.forEach((r, i) => { data[i * 7] = r[0]; data.writeUInt32BE(r[1], i * 7 + 1); data.writeUInt16BE(r[2], i * 7 + 5); });
  const xs = streamObj({ streamDict: '/Type /XRef /Size ' + (xrefId + 1) + ' /W [1 4 2] /Root 1 0 R' +
    (o.encrypt ? ' /Encrypt ' + objs.find((x) => /\/Standard/.test(x.dict || '')).id + ' 0 R' : ''), stream: data });
  const xref = at;
  put(xrefId + ' 0 obj\n' + xs.head); put(xs.data); put('\nendstream\nendobj\nstartxref\n' + xref + '\n%%EOF\n');
  return new Uint8Array(Buffer.concat(parts));
}

/** A number as our table prints it: «1 234,50». */
const money = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ');

/**
 * The first sheet of a book (rows[r][c] = { v }, as test/compare-books.cjs makes them) printed the way our reply is
 * printed: the rows above the header as the title, then the table — its header, a numbering row, the lines with their
 * numbers as «1 234,50» — `o.perPage` lines a page (12), the header again on every page.
 */
function bookPdf(wb, o) {
  o = o || {};
  const rows = wb.sheets[0].rows.slice(1).map((r) => (r || []).slice(1).map((c) => (c && c.v !== '' && c.v != null ? c.v : null)));
  const at = rows.findIndex((r) => r.filter((v) => v != null).length >= 3);
  const head = rows[at].map((v) => (v == null ? null : String(v)));
  const lines = rows.slice(at + 1).map((r) => r.map((v, c) => (v == null ? null : typeof v === 'number' && c > 2 ? money(v) : String(v))));
  const widths = head.map((h, c) => Math.max(28, Math.min(160, Math.max(width(h || '', SIZE), ...lines.map((l) => width(l[c] || '', SIZE))) + 6)));
  const per = o.perPage || 12, pages = [];
  for (let i = 0; i < Math.max(1, lines.length); i += per) {
    const pg = new Page(842, 595);
    let y = 36;
    if (!i) rows.slice(0, at).forEach((r) => { if (r[0] != null) { pg.text(40, y, String(r[0]), 11); y += 16; } });
    pg.table(40, y + 4, widths, [head, head.map((h, k) => String(k + 1)), ...lines.slice(i, i + per)], { tj: [1] });
    pages.push(pg);
  }
  return makePdf(pages, Object.assign({ style: 'print', compress: true }, o));
}

module.exports = { Page, makePdf, bookPdf, money, wrap, width };
