/*
 * Work volumes — «Сопоставительная таблица №1» (the owner's request, 2026-11-14).
 *
 * The expert checks the volumes of the works as well as the prices of the resources: a volume that the working
 * project does not support is marked «Необходимо обосновать объем в проекте», and sometimes the volume of the
 * project is written beside the estimate's. The works and their volumes stand in the local resource statement of
 * form 5 («ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ», sheet 01_ЛРВ and the like):
 *
 *   N п.п. | Шифр номера нормативов и коды ресурсов | Наименование работ и затрат | Единица измерения | Количество
 *                                                                                                    | на ед. измерения | по проектным данным
 *   РАЗДЕЛ 1. …                                  a section
 *   1   | Е0101-031-02 | РАЗРАБОТКА ГРУНТА … | 1000М3 | 0,27552            a work and its volume
 *   1.1 | 3            | ЗАТРАТЫ ТРУДА МАШИНИСТОВ | ЧЕЛ.-Ч | 11 | 3,0307   a resource: per unit of the work, in all
 *   ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ:       the end (a summary of the resources follows)
 *
 *   S.volumes.parseSheet(sheet)      → { sheet, title, number, work, works: [work…] } | null
 *   S.volumes.parseWorkbook(wb)      → [statement…] (visible sheets only)
 *   S.volumes.list(statements, file) → every work, each with its stable key (the file keeps two files apart)
 *   S.volumes.parseReply(wb)         → { entries: [{ no, name, unit, smeta, project, note, sheet }], sheet } | null
 *                                      the «объем» sheet of a reply: Наименование работ и затрат · Ед.изм. ·
 *                                      Объемы работ (по локальной ресурсной смете | по рабочему проекту) · Примечание
 *   S.volumes.match(entries, works)  → { set: key → { v, note }, found: [{ entry, key }], missing: [entry] }
 *   S.volumes.deltas(works, vol)     → name+unit key → the change of that resource's quantity
 *   S.volumes.NOTE                   the remark the expert writes most
 *
 *   work: { key, no, code, name, unit, volume, section, sheet, resources: [{ code, name, unit, norm, qty }] }
 *   vol:  key → { v: the volume by the project | null, note: '' } — what the expert decided
 *
 * A work's key is its name, unit, code and volume (and, for an identical work met again, its place among them):
 * the same file read again gives the same keys, so what was decided comes back. A resource's quantity follows its
 * work: per unit × volume — a new volume changes it by per unit × (new − old).
 * Pure — no page, no server.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';

  var NOTE = 'Необходимо обосновать объем в проекте';
  var LETTER = /[A-Za-z\u0400-\u04FF]/;

  function txt(c) { return c && c.v != null ? String(c.v) : ''; }
  function up(s) { return S.nameKey(s); }
  function num(c) { return c ? S.num(c.v) : null; }
  function noOf(c) {
    if (!c || c.v == null) return '';
    var t = typeof c.v === 'number' ? String(c.v) : String(c.v).trim();
    return /^\d+(\.\d+)?$/.test(t) ? t : '';
  }

  /** The header of form 5: name of the works, unit, quantity (per unit | by the project's data on the next row). */
  function header(rows) {
    for (var r = 1; r < Math.min(rows.length, 40); r++) {
      var cells = rows[r];
      if (!cells) continue;
      var H = {};
      for (var c = 1; c < cells.length; c++) {
        var raw = txt(cells[c]), u = up(raw);
        if (!u) continue;
        if (u.indexOf('НАИМЕНОВАНИЕ РАБОТ') === 0) H.name = c;
        else if (u.indexOf('ЕДИНИЦА ИЗМЕРЕНИЯ') === 0 || u === 'ЕД ИЗМ') H.unit = c;
        else if (u.indexOf('ШИФР') === 0) H.code = c;
        else if (/^N П П$/.test(u) || /^\s*№/.test(raw)) H.no = c;
        else if (u.indexOf('КОЛИЧЕСТВО') === 0) H.qty = c;
      }
      if (!H.name || !H.qty) continue;
      var sub = rows[r + 1] || [];
      for (var k = 1; k < sub.length; k++) {
        var s = up(txt(sub[k]));
        if (s.indexOf('НА ЕД') === 0) H.per = k;
        else if (s.indexOf('ПО ПРОЕКТНЫМ') === 0) H.all = k;
      }
      if (!H.per) continue;
      H.row = r;
      if (!H.no) H.no = 1;
      if (!H.unit) H.unit = H.name + 1;
      return H;
    }
    return null;
  }

  function labelled(cells) {
    var first = 0;
    for (var c = 1; c < cells.length; c++) {
      var t = txt(cells[c]).trim();
      if (!t) continue;
      if (!first) { first = c; continue; }
      return t;
    }
    return '';
  }

  function parseSheet(sheet) {
    var rows = sheet.rows || [], H = header(rows);
    if (!H) return null;
    var title = '', number = '', workTitle = '';
    for (var t = 1; t < H.row; t++) {
      var cs = rows[t];
      if (!cs) continue;
      var first = '';
      for (var c = 1; c < cs.length && !first; c++) first = txt(cs[c]).trim();
      if (!first) continue;
      var u = up(first);
      if (u.indexOf('ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ') === 0) number = labelled(cs);
      else if (u === 'НА') workTitle = labelled(cs);
      else if (!title && first.charAt(0) !== '(' && u.indexOf('ФОРМА') !== 0 && u.indexOf('ОСНОВАНИЕ') !== 0) title = first;
    }
    var works = [], section = '', cur = null;
    for (var r = H.row + 2; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells) continue;
      var head = '';
      for (var c2 = 1; c2 <= H.name && !head; c2++) head = txt(cells[c2]).trim();
      var uh = up(head);
      if (uh.indexOf('ИТОГО ПО ЛОКАЛЬНОЙ') === 0 || uh.indexOf('ВСЕГО ПО ЛОКАЛЬНОЙ') === 0) break;
      var no = noOf(cells[H.no]), name = txt(cells[H.name]).replace(/\s+/g, ' ').trim();
      if (!no && head && !name && /^РАЗДЕЛ/.test(uh)) { section = head.replace(/\s+/g, ' ').trim(); cur = null; continue; }
      if (!no || !name || !LETTER.test(name)) continue;                  // the numbering row «1 2 3 4 5 6»
      var per = num(cells[H.per]), all = H.all ? num(cells[H.all]) : null;
      if (/^\d+$/.test(no)) {
        if (per == null) { cur = null; continue; }
        cur = { no: no, code: txt(cells[H.code]).trim(), name: name, unit: txt(cells[H.unit]).trim(), volume: per, section: section,
          sheet: sheet.name, row: r, resources: [] };
        works.push(cur);
      } else if (cur && no.indexOf(cur.no + '.') === 0) {
        cur.resources.push({ code: txt(cells[H.code]).trim(), name: name, unit: txt(cells[H.unit]).trim(), norm: per,
          qty: all != null ? all : (per != null ? per * cur.volume : null) });
      }
    }
    if (!works.length) return null;
    return { sheet: sheet.name, title: title, number: number, work: workTitle, works: works };
  }

  function parseWorkbook(wb) {
    var out = [];
    (wb.sheets || []).forEach(function (sh) {
      if (sh.hidden) return;
      var st = parseSheet(sh);
      if (st) out.push(st);
    });
    return out;
  }

  function round(v) { return Math.round((+v || 0) * 1e6) / 1e6; }
  function baseKey(w) { return [up(w.name), S.unitKey(w.unit || ''), String(w.code || '').replace(/\s+/g, ''), round(w.volume)].join('␟'); }

  /**
   * Every work of the statements, keyed; an identical work met again is the next of its kind. `scope` (the file the
   * statements come from) keeps the same work of two files apart.
   */
  function list(statements, scope) {
    var seen = {}, out = [], pre = scope ? String(scope) + '␞' : '';
    (statements || []).forEach(function (st) {
      (st.works || []).forEach(function (w) {
        var b = pre + baseKey(w);
        seen[b] = (seen[b] || 0) + 1;
        out.push(Object.assign({ key: b + (seen[b] > 1 ? '#' + seen[b] : '') }, w));
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ the «объем» sheet of a reply */
  function replyHeader(rows) {
    for (var r = 1; r < Math.min(rows.length, 40); r++) {
      var cells = rows[r];
      if (!cells) continue;
      var H = {};
      for (var c = 1; c < cells.length; c++) {
        var raw = txt(cells[c]), u = up(raw);
        if (!u) continue;
        if (u.indexOf('НАИМЕНОВАНИЕ РАБОТ') === 0) H.name = c;
        else if (/^ЕД/.test(u) && u.indexOf('ИЗМ') > 0) H.unit = c;
        else if (u.indexOf('ОБЬЕМ') === 0 || u.indexOf('ОБЪЕМ') === 0) H.vol = c;
        else if (u.indexOf('ПРИМЕЧАНИЕ') === 0) H.note = c;
        else if (/^N П П$|^П П$/.test(u) || /^\s*№/.test(raw)) H.no = c;
      }
      if (!H.name || !H.vol) continue;
      var sub = rows[r + 1] || [];
      for (var k = 1; k < sub.length; k++) {
        var s = up(txt(sub[k]));
        if (s.indexOf('ПО ЛОКАЛЬНОЙ') === 0 || s.indexOf('ПО СМЕТЕ') === 0) H.smeta = k;
        else if (s.indexOf('ПО РАБОЧЕМУ') === 0 || s.indexOf('ПО ПРОЕКТУ') === 0) H.project = k;
      }
      if (!H.smeta) H.smeta = H.vol;
      H.row = r;
      return H;
    }
    return null;
  }

  function parseReply(wb) {
    var sheets = wb.sheets || [];
    for (var i = 0; i < sheets.length; i++) {
      var rows = sheets[i].rows || [], H = replyHeader(rows);
      if (!H) continue;
      var entries = [];
      for (var r = H.row + 1; r < rows.length; r++) {
        var cells = rows[r];
        if (!cells) continue;
        var name = txt(cells[H.name]).replace(/\s+/g, ' ').trim();
        if (up(name) === 'КОЛИЧЕСТВО РЕСУРСОВ') break;                // our own table: the resources after the works
        var smeta = num(cells[H.smeta]);
        if (!name || !LETTER.test(name) || smeta == null) continue;   // a section title, the numbering row, an empty line
        entries.push({ no: txt(cells[H.no]).trim(), name: name, unit: H.unit ? txt(cells[H.unit]).trim() : '', smeta: smeta,
          project: H.project ? num(cells[H.project]) : null, note: H.note ? txt(cells[H.note]).replace(/\s+/g, ' ').trim() : '',
          sheet: sheets[i].name });
      }
      if (entries.length) return { entries: entries, sheet: sheets[i].name };
    }
    return null;
  }

  function same(a, b) { return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-6); }

  /** Each line of a reply on the work it names: name and unit, and the estimate's volume when several share them. */
  function match(entries, works) {
    var out = { set: {}, found: [], missing: [] }, taken = {};
    (entries || []).forEach(function (e) {
      var nk = up(e.name), uk = S.unitKey(e.unit || '');
      var cand = works.filter(function (w) { return up(w.name) === nk && (!uk || S.unitKey(w.unit) === uk); });
      var exact = cand.filter(function (w) { return same(w.volume, e.smeta); });
      if (exact.length) cand = exact;
      else if (cand.length > 1) cand = [];                     // several works of that name, none of this volume
      var free = cand.filter(function (w) { return !taken[w.key]; });
      var w = (free.length ? free : cand)[0];
      if (!w) { out.missing.push(e); return; }
      taken[w.key] = 1;
      out.set[w.key] = { v: e.project != null && !same(e.project, w.volume) ? e.project : null, note: e.note || '' };
      out.found.push({ entry: e, key: w.key });
    });
    return out;
  }

  /** What new volumes do to the resources: name+unit key → the change of the quantity (per unit × (new − old)). */
  function deltas(works, vol) {
    var out = {};
    (works || []).forEach(function (w) {
      var d = vol && vol[w.key];
      if (!d || d.v == null || !isFinite(d.v)) return;
      var dv = d.v - w.volume;
      if (!dv) return;
      w.resources.forEach(function (r) {
        if (r.norm == null) return;
        var k = S.nameUnitKey(r.name, r.unit);
        out[k] = (out[k] || 0) + r.norm * dv;
      });
    });
    return out;
  }

  /**
   * «СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №1» as rows for the workbook writer (S.buildWorkbook draws it like the owner's own):
   * only what the expert decided — a work with a remark or a volume of the project, by section; then the resources
   * whose quantity he changed by hand («Количество ресурсов»).
   *   works: S.volumes.list(…) · vol: key → { v, note } · res: [{ name, unit, smeta, expert, note }] · opts: { object, stamp }
   * → { rows, merges, cols, count } — count 0: nothing to write, no sheet.
   */
  function table(works, vol, res, opts) {
    var o = opts || {}, rows = [], merges = [], n = 0;
    function row(kind, cells, ht) { rows.push({ kind: kind, cells: cells, ht: ht }); return rows.length; }
    row('vstamp', { 6: { v: o.stamp || 'Приложение №1 к экспертному заключению\nот "____" ________________ г.\n№__________________________' } }, 45);
    var t = row('vtitle', { 1: { v: 'СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №1' } }, 20.25);
    merges.push('A' + t + ':F' + t);
    var s = row('vintro', { 1: { v: 'объёмов работ рабочего проекта с локальной ресурсной ведомостью по объекту:' + (o.object ? '\n«' + String(o.object).replace(/^«+|»+$/g, '') + '»' : '') } }, 36);
    merges.push('A' + s + ':F' + s);
    row('blank', {});
    var h1 = row('vheader', { 1: { v: '№\nп/п' }, 2: { v: 'Наименование работ и затрат' }, 3: { v: 'Ед.изм.' }, 4: { v: 'Объемы работ' }, 6: { v: 'Примечание' } }, 18);
    row('vheader', { 4: { v: 'по локальной ресурсной смете' }, 5: { v: 'по рабочему проекту' } }, 30);
    merges.push('A' + h1 + ':A' + (h1 + 1), 'B' + h1 + ':B' + (h1 + 1), 'C' + h1 + ':C' + (h1 + 1), 'D' + h1 + ':E' + h1, 'F' + h1 + ':F' + (h1 + 1));
    row('vnum', { 1: { v: 1 }, 2: { v: 2 }, 3: { v: 3 }, 4: { v: 4 }, 5: { v: 5 }, 6: { v: 6 } });
    var section = null;
    (works || []).forEach(function (w) {
      var d = vol && vol[w.key];
      if (!d || (d.v == null && !d.note)) return;
      if (w.section !== section) { section = w.section; if (section) row('vsection', { 2: { v: section } }); }
      var cells = { 1: { v: ++n }, 2: { v: w.name }, 3: { v: w.unit }, 4: { v: w.volume }, 6: { v: d.note || '' } };
      if (d.v != null) cells[5] = { v: d.v };
      row('vitem', cells);
    });
    var rs = (res || []).filter(function (r) { return r && r.expert != null; });
    if (rs.length) {
      row('vsection', { 2: { v: 'Количество ресурсов' } });
      rs.forEach(function (r) { row('vitem', { 1: { v: ++n }, 2: { v: r.name }, 3: { v: r.unit }, 4: { v: r.smeta }, 5: { v: r.expert }, 6: { v: r.note || '' } }); });
    }
    return { rows: rows, merges: merges, count: n,
      cols: [{ min: 1, max: 1, width: 6 }, { min: 2, max: 2, width: 70 }, { min: 3, max: 3, width: 14 }, { min: 4, max: 5, width: 16 }, { min: 6, max: 6, width: 42 }] };
  }

  S.volumes = { NOTE: NOTE, table: table, parseSheet: parseSheet, parseWorkbook: parseWorkbook, list: list, parseReply: parseReply, match: match,
    deltas: deltas, key: baseKey };
})(S);
