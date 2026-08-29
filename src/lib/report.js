/*
 * Per-project report sheet — "TAQQOSLASH JADVALI №2".
 *
 * Column layout (A and the sum columns are hidden on the printed sheet, exactly
 * as in the reference workbook):
 *
 *   A  Лист1 row (traceability)   G  smeta unit price
 *   B  № t/r                      H  smeta sum          (hidden)
 *   C  Asos (resurs kodi)         I  market unit price
 *   D  Ishning nomi               J  market sum         (hidden)
 *   E  O'lchov birligi            K  difference         (hidden)
 *   F  КОЛ-ВО            (hidden) L  Eslatma
 *
 * Three modes:
 *   full    — every line of the project, differing lines sorted alphabetically
 *             inside the slots they already occupy. This is what you get from
 *             AutoFilter-on-difference + sort-by-name in Excel.
 *   changed — only re-priced resources, one line per distinct name+price pair,
 *             quantities summed across every street. This is the "clean" list.
 *   dedup   — like `changed`, but unchanged resources are kept too.
 */
(function (S) {
  'use strict';

  var R_IDX = 1, R_NO = 2, R_CODE = 3, R_NAME = 4, R_UNIT = 5, R_QTY = 6,
      R_PRICE = 7, R_SUM = 8, R_MPRICE = 9, R_MSUM = 10, R_DIFF = 11, R_NOTE = 12,
      R_EXTRA = 12;

  var UZ_HEAD = ['№\nt/r', 'Asos\n(resurs kodi)', 'Ishning va xarajatlarning nomi ',
    "O'lchov birligi", 'ЕД.ИЗМ', "Loyiha smeta ma'lumotlari birligi yig'indisiga ko'ra",
    'общая', "Bozor ma'lumotlariga ko'ra birlik. so'm", 'общая'];
  var RU_HEAD = ['N\nп/п', null, 'НАИМЕНОВАНИЕ', 'ЕД.\nИЗМ.', 'КОЛ-ВО',
    'ЦЕНА\n ЗА ЕД.', 'СУММА \n(сум)', 'ЦЕНА\n ЗА ЕД.', 'СУММА \n(сум)'];

  var SECTION_TITLES = {
    labor: 'ЗАТРАТЫ ТРУДА',
    machines: 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ',
    materials: 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ',
    equipment: 'ОБОРУДОВАНИЕ',
    other: 'БОШҚА РЕСУРСЛАР'
  };
  var SECTION_ORDER = ['labor', 'machines', 'materials', 'equipment', 'other'];

  /** Лист1 column -> report column. */
  function colMap(nExtra) {
    return function (c) {
      switch (c) {
        case 1: return R_IDX;
        case 2: return R_NO;
        case 3: return R_NAME;
        case 4: return R_UNIT;
        case 5: return R_QTY;
        case 6: return R_PRICE;
        case 7: return R_SUM;
        case 8: return R_MPRICE;
        case 9: return R_MSUM;
        case 10: return R_DIFF;
        default: return c >= 11 ? R_EXTRA + (c - 11) : c;
      }
    };
  }

  function head(opts, project) {
    return [
      { kind: 'stamp', ht: 60, cells: cell(R_NOTE, opts.stamp) },
      { kind: 'intro', ht: 60, cells: cell(R_NO, project.intro || project.title || '') },
      { kind: 'bigtitle', ht: 21, cells: cell(R_IDX, opts.docTitle || 'TAQQOSLASH JADVALI  №2') },
      { kind: 'bigtitle2', cells: {} },
      { kind: 'blank', cells: {} }
    ];
  }

  function cell(c, v) { var o = {}; o[c] = { v: v }; return o; }

  function headerRows() {
    var uz = {}, uzn = {}, ru = {}, run = {};
    for (var i = 0; i < UZ_HEAD.length; i++) uz[R_NO + i] = { v: UZ_HEAD[i] };
    uz[R_NOTE] = { v: 'Eslatma' };
    var nums = [1, 2, 3, 4, 4, 5, '7', 6, '7'];
    for (var j = 0; j < nums.length; j++) uzn[R_NO + j] = { v: nums[j] };
    uzn[R_IDX] = { v: 11 };
    uzn[R_NOTE] = { v: 7 };
    for (var k = 0; k < RU_HEAD.length; k++) if (RU_HEAD[k] != null) ru[R_NO + k] = { v: RU_HEAD[k] };
    var rn = [1, null, 2, 3, 4, 5, 6, 5, 6];
    for (var l = 0; l < rn.length; l++) if (rn[l] != null) run[R_NO + l] = { v: rn[l] };
    return [
      { kind: 'uzhead', ht: 63.75, cells: uz },
      { kind: 'uznum', cells: uzn },
      { kind: 'blank', cells: {} },
      { kind: 'header', ht: 25.5, cells: ru },
      { kind: 'numbering', cells: run }
    ];
  }

  function nameCmp(a, b) {
    var x = a.nm || '', y = b.nm || '';
    return x < y ? -1 : x > y ? 1 : 0;
  }

  /* ------------------------------------------------------------ full mode */

  function buildFull(model, span, opts) {
    var src = model.rows.slice(span.from - 1, span.to);
    // Drop the project/street banner and the first header block: the report has
    // its own title block. Everything from the first section header stays.
    var start = 0;
    for (var i = 0; i < src.length; i++) {
      if (src[i].kind === 'section') { start = i; break; }
    }
    var body = src.slice(start);

    if (opts.sortChanged !== false) {
      var slots = [], moving = [];
      for (var j = 0; j < body.length; j++) {
        var r = body[j];
        if (r.kind === 'item' && !S.near(r.price, r.market)) { slots.push(j); moving.push(r); }
      }
      moving.sort(nameCmp);
      for (var k = 0; k < slots.length; k++) body[slots[k]] = moving[k];
    }

    var rows = head(opts, span.project).concat(headerRows());
    var firstBody = rows.length + 1;
    var rowOf = new Map();
    body.forEach(function (r, idx) { rowOf.set(r.r, firstBody + idx); });

    var map = colMap(model.nExtra);
    var mapRow = function (n) { return rowOf.get(n) || null; };

    body.forEach(function (r) {
      var cells = {};
      for (var c in r.cells) {
        var v = r.cells[c];
        var tc = map(+c);
        if (v.f) {
          var f = S.formula.translateMap(v.f, map, mapRow);
          cells[tc] = f ? { f: f } : { v: null };
        } else cells[tc] = { v: v.v };
      }
      cells[R_IDX] = { v: r.r };
      var moved = r.kind === 'item' && !S.near(r.price, r.market);
      // The note column doubles as the sheet's first helper column, exactly as
      // in the reference workbook — never overwrite a value carried across.
      if (moved && opts.autoNote && opts.noteText && !cells[R_NOTE]) cells[R_NOTE] = { v: opts.noteText };
      rows.push({
        kind: r.kind, section: r.section, nm: r.nm, unit: r.unit,
        key: r.key, price: r.price, market: r.market, qty: r.qty,
        changed: moved,
        cells: cells
      });
    });

    return finish(rows, firstBody, model, opts, span);
  }

  /* --------------------------------------------------- changed / dedup mode */

  function buildDedup(model, span, opts) {
    var onlyChanged = opts.mode !== 'dedup';
    var groups = {};
    SECTION_ORDER.forEach(function (s) { groups[s] = new Map(); });

    for (var i = span.from - 1; i < span.to; i++) {
      var r = model.rows[i];
      if (r.kind !== 'item') continue;
      var changed = !S.near(r.price, r.market);
      if (onlyChanged && !changed) continue;
      var sec = groups[r.section] ? r.section : 'other';
      var g = groups[sec];
      // "One line when name and price are the same; every line when the name
      // repeats with a different price."
      var k = r.key + '|' + r.price + '|' + r.market;
      var rec = g.get(k);
      if (!rec) {
        rec = { nm: r.nm, unit: r.unit, key: r.key, price: r.price, market: r.market,
                qty: 0, count: 0, changed: changed, note: '' };
        g.set(k, rec);
      }
      rec.qty += r.qty || 0;
      rec.count++;
    }

    var rows = head(opts, span.project).concat(headerRows());
    var firstBody = rows.length + 1;
    var totalRefs = [];

    SECTION_ORDER.forEach(function (sec) {
      var list = Array.from(groups[sec].values());
      if (!list.length) return;
      list.sort(nameCmp);
      rows.push({ kind: 'section', section: sec, cells: cell(R_NO, SECTION_TITLES[sec]) });
      var from = rows.length + 1;
      list.forEach(function (rec, n) {
        var rr = rows.length + 1;
        var cells = {};
        cells[R_IDX] = { v: rec.count };
        cells[R_NO] = { v: n + 1 };
        cells[R_NAME] = { v: rec.nm };
        cells[R_UNIT] = { v: rec.unit };
        cells[R_QTY] = { v: rec.qty };
        cells[R_PRICE] = { v: rec.price };
        cells[R_SUM] = { f: '=F' + rr + '*G' + rr };
        cells[R_MPRICE] = { v: rec.market };
        cells[R_MSUM] = { f: '=F' + rr + '*I' + rr };
        cells[R_DIFF] = { f: '=+H' + rr + '-J' + rr };
        if (opts.autoNote && rec.changed && opts.noteText) cells[R_NOTE] = { v: opts.noteText };
        rows.push({ kind: 'item', section: sec, nm: rec.nm, unit: rec.unit, key: rec.key,
                    price: rec.price, market: rec.market, qty: rec.qty,
                    changed: rec.changed, cells: cells });
      });
      var to = rows.length;
      var tr = rows.length + 1;
      var tc = {};
      tc[R_NO] = { v: 'ИТОГО ' };
      tc[R_UNIT] = { v: 'СУМ' };
      tc[R_SUM] = { f: '=SUM(H' + from + ':H' + to + ')' };
      tc[R_MSUM] = { f: '=SUM(J' + from + ':J' + to + ')' };
      tc[R_DIFF] = { f: '=SUM(K' + from + ':K' + to + ')' };
      rows.push({ kind: 'total', section: sec, cells: tc });
      totalRefs.push(tr);
      rows.push({ kind: 'blank', cells: {} });
    });

    if (totalRefs.length) {
      var gr = rows.length + 1;
      var gc = {};
      gc[R_NO] = { v: 'ЖАМИ / ВСЕГО' };
      gc[R_UNIT] = { v: 'СУМ' };
      gc[R_SUM] = { f: '=' + totalRefs.map(function (t) { return 'H' + t; }).join('+') };
      gc[R_MSUM] = { f: '=' + totalRefs.map(function (t) { return 'J' + t; }).join('+') };
      gc[R_DIFF] = { f: '=' + totalRefs.map(function (t) { return 'K' + t; }).join('+') };
      rows.push({ kind: 'grandtotal', ht: 24.75, cells: gc });
    }

    return finish(rows, firstBody, model, opts, span);
  }

  function finish(rows, firstBody, model, opts, span) {
    var last = rows.length;
    var nExtra = model.nExtra || 0;
    return {
      name: span.project.name,
      rows: rows,
      firstBody: firstBody,
      lastRow: last,
      nExtra: nExtra,
      merges: ['B2:L2', 'A3:L4'],
      autoFilter: 'A10:K' + Math.max(last, 11),
      printTitles: '$6:$7',
      cols: reportCols(opts, nExtra),
      mode: opts.mode
    };
  }

  function reportCols(opts, nExtra) {
    var wide = opts.noteWidth || 48;
    var cols = [
      { min: R_IDX, max: R_IDX, width: 0, hidden: true },
      { min: R_NO, max: R_NO, width: 8.14 },
      { min: R_CODE, max: R_CODE, width: 10.14 },
      { min: R_NAME, max: R_NAME, width: 63.85 },
      { min: R_UNIT, max: R_UNIT, width: 9.29 },
      { min: R_QTY, max: R_QTY, width: 10.43, hidden: opts.hideQty !== false },
      { min: R_PRICE, max: R_PRICE, width: 19.57 },
      { min: R_SUM, max: R_SUM, width: 14.29, hidden: opts.hideSums !== false },
      { min: R_MPRICE, max: R_MPRICE, width: 17.71 },
      { min: R_MSUM, max: R_DIFF, width: 14.29, hidden: opts.hideSums !== false },
      { min: R_NOTE, max: R_NOTE, width: wide }
    ];
    if (nExtra > 1) cols.push({ min: R_EXTRA + 1, max: R_EXTRA + nExtra * 2, width: 11.86, hidden: true });
    return cols;
  }

  /* ----------------------------------------------------------- contents */

  /**
   * "Mundarija" — which column A numbers belong to which project and object.
   * This is the note that used to live in a paper notebook: 1-3000 Marg'ilon,
   * 3001-6140 Farg'ona.
   */
  function contents(model, opts) {
    var rows = [
      { kind: 'bigtitle', ht: 20.25, cells: cell(1, opts.contentsTitle || 'MUNDARIJA — «Лист1» qator raqamlari') },
      { kind: 'blank', cells: {} }
    ];
    var head = {};
    ['№', 'Loyiha', "Obyekt / ko'cha", 'A ustuni: dan', 'gacha', 'Qatorlar',
     'Resurs qatorlari', 'Smeta summasi', 'Bozor summasi', 'Farq']
      .forEach(function (h, i) { head[i + 1] = { v: h }; });
    rows.push({ kind: 'header', ht: 25.5, cells: head });

    var n = 0, gs = 0, gm = 0, gi = 0;
    model.spans.forEach(function (sp) {
      n++;
      var pc = {};
      pc[1] = { v: n };
      pc[2] = { v: sp.project.name };
      pc[3] = { v: sp.project.title || '' };
      pc[4] = { v: sp.from };
      pc[5] = { v: sp.to };
      pc[6] = { v: sp.to - sp.from + 1 };
      pc[7] = { v: sp.items };
      pc[8] = { v: sp.smetaSum };
      pc[9] = { v: sp.marketSum };
      pc[10] = { v: sp.smetaSum - sp.marketSum };
      rows.push({ kind: 'total', cells: pc });
      gs += sp.smetaSum; gm += sp.marketSum; gi += sp.items;

      sp.objects.forEach(function (o, i) {
        var oc = {};
        oc[2] = { v: '' };
        oc[3] = { v: (i + 1) + '. ' + o.name };
        oc[4] = { v: o.from };
        oc[5] = { v: o.to };
        oc[6] = { v: o.to - o.from + 1 };
        oc[7] = { v: o.items };
        oc[8] = { v: o.smetaSum };
        oc[9] = { v: o.marketSum };
        oc[10] = { v: o.smetaSum - o.marketSum };
        rows.push({ kind: 'item', cells: oc });
      });
      rows.push({ kind: 'blank', cells: {} });
    });

    var tc = {};
    tc[3] = { v: 'JAMI' };
    tc[4] = { v: 1 };
    tc[5] = { v: model.rows.length };
    tc[6] = { v: model.rows.length };
    tc[7] = { v: gi };
    tc[8] = { v: gs };
    tc[9] = { v: gm };
    tc[10] = { v: gs - gm };
    rows.push({ kind: 'grandtotal', ht: 24.75, cells: tc });

    return {
      rows: rows,
      cols: [
        { min: 1, max: 1, width: 5.5 },
        { min: 2, max: 2, width: 18 },
        { min: 3, max: 3, width: 52 },
        { min: 4, max: 5, width: 12 },
        { min: 6, max: 7, width: 14 },
        { min: 8, max: 10, width: 19 }
      ]
    };
  }

  function build(model, span, opts) {
    opts = opts || {};
    return opts.mode === 'full' ? buildFull(model, span, opts) : buildDedup(model, span, opts);
  }

  S.report = {
    build: build,
    contents: contents,
    cols: { IDX: R_IDX, NO: R_NO, CODE: R_CODE, NAME: R_NAME, UNIT: R_UNIT, QTY: R_QTY,
            PRICE: R_PRICE, SUM: R_SUM, MPRICE: R_MPRICE, MSUM: R_MSUM, DIFF: R_DIFF,
            NOTE: R_NOTE, EXTRA: R_EXTRA },
    SECTION_TITLES: SECTION_TITLES
  };
})(S);
