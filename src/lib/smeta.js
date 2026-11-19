/*
 * Recognises the "resource sheet" layout used by the smeta workbooks and turns
 * each such sheet into a list of typed rows, keeping the raw cells so the
 * assembler can copy them (formulas included) without losing anything.
 *
 * Expected layout, located by its header text rather than by fixed columns:
 *
 *   row 1   project title
 *   row 2   object / street title
 *   row 4   N п/п | НАИМЕНОВАНИЕ | ЕД. ИЗМ. | КОЛ-ВО | ЦЕНА ЗА ЕД. | СУММА (сум)
 *   row 5   1 | 2 | 3 | 4 | 5 | 6
 *   row 6+  ЗАТРАТЫ ТРУДА / СТРОИТЕЛЬНЫЕ МАШИНЫ … sections, items, ИТОГО lines
 *
 * and the local resource estimate of form 4А (АВС-4), many of them stacked on
 * one sheet, each under its own title block:
 *
 *   № п/п | Шифр ресурсов | Наименование | Единица измерения | Количество единиц | Сметная стоимость
 *                                                                                | на единицу | общая
 *   1 | 2 | 3 | 4 | 5 | 6 | 7
 *   ТРУДОВЫЕ РЕСУРСЫ / СТРОИТЕЛЬНЫЕ МАШИНЫ … in the name column, numbered items,
 *   «В Т.Ч. …» lines, ИТОГО lines, ИТОГО ПРЯМЫЕ ЗАТРАТЫ
 *
 * and the statement of required resources («ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ»), one per object sheet:
 *
 *   N п/п | Шифр (обоснование) | Код АВС | Наименование ресурса | Единица измерения | Сметная потребность | Сметная стоимость, СУМ
 *                                                                                                          | в текущем уровне
 *                                                                                                          | единицы | всего
 *   bands (Затраты труда, Строительные машины и механизмы, Строительные материалы…, Перевозка…) in the first
 *   column, items numbered «1.», «2.» …, «Итого по …» in the name column
 *
 * and the haulage sheet («Транспортные расходы на перевозимые грузы»), one line per material:
 *
 *   № п/п | Наименование материалов | Единица измерения | Количество | Удельный вес | Общая тонна | … км | тн/км |
 *   Стоимость за один тн/км | Всего
 *   each line is the resource «Транспортировка <материал> <N> км» in т/км — as the expert's replies name it
 */
(function (S) {
  'use strict';

  var SECTIONS = [
    'ЗАТРАТЫ ТРУДА',
    'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ',
    'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ',
    'ОБОРУДОВАНИЕ'
  ];

  function txt(cell) {
    if (!cell) return '';
    var v = cell.v;
    return typeof v === 'string' ? v : (v == null ? '' : String(v));
  }
  function up(s) { return S.nameKey(s); }

  function isTotal(t) {
    var u = up(t);
    return u.indexOf('ИТОГО') === 0 || u.indexOf('ВСЕГО') === 0;
  }
  // The four bands, as they are actually written in the wild: Russian, and
  // Uzbek in both alphabets.
  var LABOR = /^(ЗАТРАТЫ ТРУДА|ТРУДОЗАТРАТЫ|ТРУДОВЫЕ РЕСУРСЫ|МЕҲНАТ|MEHNAT|ISHCHILAR)/;
  var MACH = /^((СТРОИТЕЛЬНЫЕ )?МАШИНЫ|МЕХАНИЗМЫ|(ҚУРИЛИШ )?МАШИНА|МЕХАНИЗМ|(QURILISH )?MASHINA|MEXANIZM)/;
  var MAT = /^((СТРОИТЕЛЬНЫЕ )?МАТЕРИАЛЫ|(ҚУРИЛИШ )?МАТЕРИАЛ|(QURILISH )?MATERIAL)/;
  var EQUIP = /^(ОБОРУДОВАНИ|УСКУНА|ЖИҲОЗ|ЖИХОЗ|USKUNA|JIHOZ|ASBOB)/;
  // A band that names equipment anywhere in its title is an equipment band
  // too: «ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ», «ИНЖЕНЕРНОЕ ОБОРУДОВАНИЕ», «… JIHOZLAR».
  var EQUIP_WORD = /(^|\s)(ОБОРУДОВАНИЕ|ЖИҲОЗ\S*|ЖИХОЗ\S*|JIHOZ\S*)(\s|$)/;

  function isSection(t) {
    var u = up(t);
    for (var i = 0; i < SECTIONS.length; i++) if (u === SECTIONS[i]) return true;
    return LABOR.test(u) || MACH.test(u) || MAT.test(u) || EQUIP.test(u) || EQUIP_WORD.test(u);
  }
  function sectionOf(t) {
    var u = up(t);
    if (LABOR.test(u)) return 'labor';
    if (MACH.test(u)) return 'machines';
    if (MAT.test(u)) return 'materials';
    if (EQUIP.test(u) || EQUIP_WORD.test(u)) return 'equipment';
    return 'other';
  }

  /**
   * A resource line needs a name, not just a number in the name column.
   * Spelled out rather than \W, which is ASCII-only and would reject every
   * Cyrillic name.
   */
  var LETTER = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/;
  /** A band of haulage — «ПЕРЕВОЗКА», «Транспортировка…», «Доставка…» — and a name that already says it. */
  // only the words that mean haulage: «ТРАНСПОРТНЫЕ СРЕДСТВА», «ТРАНСПОРТНЫЕ МАШИНЫ И МЕХАНИЗМЫ», «ТРАНСПОРТНОЕ ОБОРУДОВАНИЕ»
  // are resource bands, «ТРАНСПОРТНЫЕ РАСХОДЫ / УСЛУГИ / ЗАТРАТЫ» and «ТРАНСПОРТИРОВКА …» are haulage
  var HAUL = /^(ПЕРЕВОЗК|ДОСТАВК|ТАШИШ|TASHISH|ТРАНСПОРТИРОВК|ТРАНСПОРТ\s*$|ТРАНСПОРТН(ЫЕ|АЯ|ЫЙ)\s+(РАСХОД|УСЛУГ|ЗАТРАТ))/;
  /** A haulage band: a haulage word, even when the band names equipment too («ТРАНСПОРТИРОВКА (ОБОРУДОВАНИЕ)»). */
  function haulBand(t) { var u = up(t); return HAUL.test(u) && (!isSection(t) || /^(ПЕРЕВОЗК|ДОСТАВК|ТАШИШ|TASHISH|ТРАНСПОРТИРОВК)/.test(u)); }
  // the same above the first line of a sheet read by its shape, where the row may as well be the sheet's own title
  // («ТРАНСПОРТНАЯ УЛИЦА»): only the words that can mean nothing but haulage
  var HAUL_OPEN = /^(ПЕРЕВОЗК|ДОСТАВК|ТАШИШ|TASHISH|ТРАНСПОРТИРОВК|ТРАНСПОРТ\s*$|ТРАНСПОРТНЫЕ\s+(РАСХОД|УСЛУГ|ЗАТРАТ))/;
  /** The unit of haulage: «ТН/КМ», «т.км», «тонна км». */
  var TKM = /^(ТН|Т|ТОН|ТОНН|ТОННА) ?КМ$/;
  /** «1.», «12.» — how the statement of required resources numbers its items. */
  var NUMBERED = /^\s*\d+\.\s*$/;
  /** A line priced in sums («СУМ»): a money line of the statement (5 % of the materials…), not a resource. */
  function money(cell) { return /^СУМ$/.test(up(txt(cell))); }
  /**
   * A line without a number of its own on a sheet with a code column, priced the way a resource is: a unit that is not
   * money, quantity × price = sum, and not the name of a summary line (form 4А's «В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ» and
   * closing «ЗАТРАТЫ ТРУДА РАБОЧИХ» carry a quantity and are not resources). Estimators add such lines by hand at the
   * end of a band — «<разъединитель> | комплект | 1 | <цена> | <сумма>», no number, above an «ИТОГО ПО СТРОИТЕЛЬНЫМ
   * МАТЕРИАЛАМ» whose SUM counts them — and they were left out (2026-11-17). Money is every spelling of the currency,
   * not only money()'s «СУМ»: a «ТРАНСПОРТНЫЕ РАСХОДЫ | сўм | 0.03 | 186 | 5.58» (a percentage × its base) also has
   * quantity × price = sum, and it is a money line, not a line added by hand. The statement of required resources still
   * goes by money(): its rule is older than this one and was not what went wrong here.
   */
  var MONEY = /^((ТЫС|ТЫСЯЧ|Т|МЛН|МЛРД|МИНГ|MING|MLN|1000) ?)?(СУМ|СЎМ|SO ?M|SUM|РУБ|РУБЛЕЙ|RUB|UZS)$/;
  var SUMMARY_LINE = /^(В ?Т ?Ч|В ТОМ ЧИСЛЕ|ЗАТРАТЫ ТРУДА|ИТОГО|ВСЕГО)( |$)/;
  function pricedLine(cells, L, nm, qty, price, sum) {
    if (!(qty > 0 && price > 0 && sum > 0)) return false;
    var unit = txt(cells[L.unit]).trim();
    if (!unit || MONEY.test(up(unit)) || unit.indexOf('%') >= 0 || SUMMARY_LINE.test(up(nm))) return false;
    return Math.abs(qty * price - sum) <= Math.max(1, sum * 0.002);
  }

  /** The band of what the customer gets back: «ВОЗВРАТ МАТЕРИАЛОВ ЗАКАЗЧИКА». */
  var RETURN_BAND = /^ВОЗВРАТ/;

  /**
   * The row that numbers the columns of the table («1 | 2 | 3 | 4 | 5 | 6»): the cells of the layout's columns that are
   * filled hold whole numbers one more each than the one before, at least four of them.
   */
  function countsColumns(cells, L) {
    var cols = [L.no, L.name, L.unit, L.qty, L.price, L.sum].filter(function (c) { return c; });
    var seen = 0, prev = null;
    for (var i = 0; i < cols.length; i++) {
      var cell = cells[cols[i]];
      if (!cell || cell.v == null || String(cell.v).trim() === '') continue;
      var v = S.num(cell.v);
      if (v == null || v !== Math.round(v) || (prev != null && v !== prev + 1)) return false;
      prev = v; seen++;
    }
    return seen >= 4;
  }

  /**
   * A share of a cost: «Перевозка материалов 5 % от стоимости» priced 0,05 — its «quantity» is the cost it is a share
   * of. A money line, whatever unit stands beside it: estimators copy the «тн/км» of the haulage lines above it, and it
   * was read as a resource of 0,05 a т·км, hundreds of millions of them, offered a market price (2026-11-18). Only a
   * name that says the percentage and a price that is that very share: a material named with a percentage («РАСТВОР
   * 5 %») has a price of its own.
   */
  function shareLine(nm, price) {
    var m = /(\d+(?:[.,]\d+)?)\s*%/.exec(nm);
    if (!m || price == null || !(price > 0) || price > 1) return false;
    return Math.abs(price - parseFloat(m[1].replace(',', '.')) / 100) < 1e-9;
  }

  /**
   * The header row at r and the six meaningful columns, or null.
   *
   * Two spellings of the header are known. The resource sheets: НАИМЕНОВАНИЕ ·
   * КОЛ-ВО · ЦЕНА · СУММА on one row. The local resource estimate of form 4А
   * (АВС-4): «Шифр ресурсов» between № and the name, «Количество единиц», and
   * «Сметная стоимость» split on the next row into «на единицу» and «общая».
   *
   * `folded` also accepts the header as the name key leaves it. The key folds the hyphen of «КОЛ-ВО» and the
   * slash of «N п/п» to spaces, so the two tests below that spell them with their punctuation have never
   * matched, and an ordinary resource sheet has always been read by the shape of its lines (inferLayout).
   * That reading stays as it is — see byHeader() for when the header is asked instead.
   */
  function layoutAt(rows, r, folded) {
    var cells = rows[r];
    if (!cells) return null;
    var L = null, noRaw = 0;
    for (var c = 1; c < cells.length; c++) {
      var raw = txt(cells[c]);
      var u = up(raw);
      if (!u) continue;
      // the number column by its raw header: «№ …», or «N п/п» / «N п.п.» (a code column such as «Код АВС» may stand
      // between it and the name: the bands in the number column are then seen)
      if (!noRaw && (/^\s*№/.test(raw) || /^\s*[NН]\s*п\s*[\/.]?\s*п\.?\s*$/i.test(raw))) noRaw = c;
      if (u.indexOf('НАИМЕНОВАНИЕ') >= 0) { L = L || {}; L.name = c; }
      else if (/^N\s*П\/П$|^№/.test(u) || u === 'N П/П' || (folded && u === 'N П П')) { L = L || {}; L.no = c; }
      else if (u.indexOf('ЕД') === 0 && u.indexOf('ИЗМ') > 0) { L = L || {}; L.unit = c; }
      else if (u.indexOf('КОЛ-ВО') >= 0 || u.indexOf('КОЛВО') >= 0 || u.indexOf('КОЛИЧЕСТВО') === 0 ||
               (folded && u.indexOf('КОЛ ВО') >= 0)) { L = L || {}; L.qty = c; }
      // «Сметная потребность» (the key splits the hyphenated «потреб-ность»): the statement of required resources
      else if (/^СМЕТНАЯ ПОТРЕБ/.test(u)) { L = L || {}; L.qty = c; L.need = true; }
      else if (u.indexOf('ЦЕНА') >= 0) { L = L || {}; if (!L.price) L.price = c; }
      else if (u.indexOf('СУММА') >= 0) { L = L || {}; if (!L.sum) L.sum = c; }
      else if (u.indexOf('ШИФР') === 0) { L = L || {}; L.code = c; }
    }
    if (!L || !L.name || !L.qty) return null;
    var sub = rows[r + 1] || [];
    // «Количество» over two columns — «на единицу измерения» (the norm of one unit of the work) and «по проектным
    // данным» (the quantity): the second is the quantity, and the first is neither the quantity nor the price (the
    // local resource statement, «ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ», where the works and their resources stand together).
    // Looked for whatever the header row itself names: with «Цена» and «Сумма» written there, the quantity was read
    // from the norm column
    for (var kq = 1; kq < sub.length; kq++) {
      if (!/^ПО ПРОЕКТНЫМ/.test(up(txt(sub[kq])))) continue;
      if (kq > L.qty && kq <= L.qty + 2 && up(txt(sub[L.qty])).indexOf('НА ЕДИНИЦУ') === 0) { L.unitQty = L.qty; L.qty = kq; }
      break;
    }
    if (!L.price || !L.sum) {
      for (var k = 1; k < sub.length; k++) {
        var s = up(txt(sub[k]));
        if (!L.price && s.indexOf('НА ЕДИНИЦУ') === 0 && k !== L.unitQty) L.price = k;
        else if (!L.sum && (s === 'ОБЩАЯ' || s === 'ВСЕГО')) L.sum = k;
      }
      L.subRow = r + 1;
      // the statement of required resources: «в текущем уровне» first, then «единицы | всего»
      if (L.need && (!L.price || !L.sum)) {
        var sub2 = rows[r + 2] || [];
        for (var k2 = 1; k2 < sub2.length; k2++) {
          var s2 = up(txt(sub2[k2]));
          if (!L.price && (s2 === 'ЕДИНИЦЫ' || s2.indexOf('НА ЕДИНИЦУ') === 0)) L.price = k2;
          else if (!L.sum && (s2 === 'ВСЕГО' || s2 === 'ОБЩАЯ')) L.sum = k2;
        }
        L.subRow = r + 2;
      }
      // «Сметная стоимость» over two levels: «в базисном уровне | в текущем (прогнозном)», then «на ед. изм. | общая»
      // under each — the prices are the current ones (the base columns of such a sheet are often «--»)
      if (!L.price || !L.sum) {
        var cur = 0, sub3 = rows[r + 2] || [], p3 = 0, s3c = 0;
        for (var k4 = 1; k4 < sub.length && !cur; k4++) if (/^В ТЕКУЩ/.test(up(txt(sub[k4])))) cur = k4;
        for (var k3 = cur || 1; k3 < sub3.length; k3++) {
          var s3 = up(txt(sub3[k3]));
          if (!p3 && (/^НА ЕД/.test(s3) || s3 === 'ЕДИНИЦЫ')) p3 = k3;
          else if (p3 && !s3c && (s3 === 'ОБЩАЯ' || s3 === 'ВСЕГО')) s3c = k3;
        }
        if (p3 && s3c) {
          // The current columns of some books stay «--» on every line and the prices stand in the base ones, while
          // the sheet says «Составлен В ТЕКУЩИХ ЦЕНАХ» (68106): read from the current columns, every price was empty.
          // The base pair is taken only when the current one holds no price on any line and the base one prices the
          // lines (quantity × price = sum on at least three); a sheet with current prices is read as it always was.
          var bas = 0, bp = 0, bs = 0;
          for (var kb = 1; kb < sub.length && !bas; kb++) if (/^В БАЗИСН/.test(up(txt(sub[kb])))) bas = kb;
          if (bas && bas < cur) {
            for (var kc = bas; kc < cur && kc < sub3.length; kc++) {
              var sb = up(txt(sub3[kc]));
              if (!bp && (/^НА ЕД/.test(sb) || sb === 'ЕДИНИЦЫ')) bp = kc;
              else if (bp && !bs && (sb === 'ОБЩАЯ' || sb === 'ВСЕГО')) bs = kc;
            }
          }
          if (bp && bs && !L.price && !L.sum && basePriced(rows, r + 3, L.name, L.qty, p3, s3c, bp, bs)) { p3 = bp; s3c = bs; L.level = 'base'; }
          L.price = L.price || p3; L.sum = L.sum || s3c; L.subRow = r + 2;
        }
      }
      if (!L.price || !L.sum) return null;
    }
    // with the price and the sum named in the header row itself, the row below holds the two quantity columns alone:
    // the header's second line all the same, and the «1 2 3 …» row is the one under it. (Set here, after the price and
    // the sum, and only when nothing above has set it: a statement read so far keeps its layout key for key, in the
    // same order — test/smeta-corpus.cjs fingerprints the layout as it is written out)
    if (L.unitQty && !L.subRow) L.subRow = r + 1;
    // «№ п/п» folds to «П П», so the number column is found by its raw «№» — with a code column in between, or any
    // other («Обоснование»): never guessed as the one left of the name when the header says where it is. A header
    // with «№» right before the name gives the same column as the guess did.
    // a «№ …» header to the right of the name («№ сертификата», «№ позиции по смете») is not the line number
    if (!L.no) L.no = noRaw && noRaw !== L.code && noRaw < L.name ? noRaw : (L.code ? (L.code - 1 || 1) : (L.name - 1 || 1));
    if (!L.unit) L.unit = L.name + 1;
    L.headerRow = r;
    // The "1 2 3 4 5 6" row directly beneath the header, when present.
    var nr = (L.subRow || r) + 1, nxt = rows[nr];
    L.numRow = nxt && S.num(nxt[L.name] && nxt[L.name].v) != null ? nr : 0;
    L.lastCol = Math.max(L.sum, L.price, L.qty, L.unit, L.name, L.no);
    return L;
  }

  /**
   * The lines below a two-level header: no price in the current columns on any of them, and quantity × price = sum in
   * the base columns on three or more.
   */
  function basePriced(rows, from, nm, q, cp, cs, bp, bs) {
    var cur = 0, base = 0;
    for (var r = from; r < Math.min(rows.length, from + 400); r++) {
      var row = rows[r];
      // no line: an empty row, or the «1 2 3 …» row that numbers the columns
      if (!row || S.num(row[nm] && row[nm].v) != null) continue;
      var val = function (c) { return S.num(row[c] && row[c].v); };
      if (val(cp) || val(cs)) cur++;
      var qty = val(q), pr = val(bp), sm = val(bs);
      if (qty && pr && sm && Math.abs(qty * pr - sm) <= Math.max(2, Math.abs(sm) * 0.005)) base++;
    }
    return cur === 0 && base >= 3;
  }

  /** Locate the header row and the six meaningful columns. */
  function findLayout(rows, folded) {
    for (var r = 1; r < Math.min(rows.length, 40); r++) {
      var L = layoutAt(rows, r, folded);
      if (L) return L;
    }
    return null;
  }

  /** Every row of the sheet that repeats the header found first. */
  function headerRows(rows, L) {
    var out = [];
    for (var r = L.headerRow; r < rows.length; r++) {
      var M = rows[r] && layoutAt(rows, r);
      if (M && M.name === L.name && M.qty === L.qty) out.push(r);
    }
    return out;
  }

  /**
   * Some object sheets (the "ПЕРЕВОЗКА" ones) carry no header band at all — they
   * open straight on a section title. Infer the six columns from the shape of
   * the first item line instead.
   */
  function inferLayout(rows) {
    for (var r = 1; r < Math.min(rows.length, 60); r++) {
      var cells = rows[r];
      if (!cells) continue;
      for (var c = 1; c < cells.length - 4; c++) {
        if (S.num(cells[c] && cells[c].v) == null) continue;
        var nm = txt(cells[c + 1]), un = txt(cells[c + 2]);
        if (nm.length < 4 || !un || un.length > 12) continue;
        if (S.num(cells[c + 3] && cells[c + 3].v) == null) continue;
        var priced = cells[c + 4] && (S.num(cells[c + 4].v) != null || cells[c + 4].f);
        var summed = cells[c + 5] && (S.num(cells[c + 5].v) != null || cells[c + 5].f);
        if (!priced || !summed) continue;
        return {
          no: c, name: c + 1, unit: c + 2, qty: c + 3, price: c + 4, sum: c + 5,
          headerRow: 0, numRow: 0, lastCol: c + 5, guessed: true
        };
      }
    }
    return null;
  }

  function firstBodyRow(rows, L) {
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells) continue;
      var noTxt = txt(cells[L.no]);
      if (noTxt && isSection(noTxt)) return r;
      if (txt(cells[L.name]) && S.num(cells[L.qty] && cells[L.qty].v) != null) return r;
    }
    return 1;
  }

  /** Whether a row has anything in it. */
  function lastFilled(cells) {
    for (var c = 1; c < cells.length; c++) { var cell = cells[c]; if (cell && (cell.v != null && cell.v !== '' || cell.f != null)) return true; }
    return false;
  }

  function lastContentRow(rows) {
    for (var r = rows.length - 1; r > 0; r--) {
      var cells = rows[r];
      if (!cells) continue;
      for (var c = 1; c < cells.length; c++) {
        var cell = cells[c];
        if (cell && (cell.v != null || cell.f != null)) return r;
      }
    }
    return 0;
  }

  /** The last ИТОГО / ВСЕГО line in rows a..b, or 0. */
  function lastTotalRow(rows, L, a, b) {
    for (var r = b; r >= a; r--) {
      var cells = rows[r];
      // some programs write the totals in the code column («ИТОГО ПО СТРОИТЕЛЬНЫМ МАШИНАМ:» under «Шифр»)
      if (cells && (isTotal(txt(cells[L.name])) || isTotal(txt(cells[L.no])) || (L.code && isTotal(txt(cells[L.code]))))) return r;
    }
    return 0;
  }

  /** Nothing on the row but the cell in column c. */
  function alone(cells, c) {
    for (var k = 1; k < cells.length; k++) if (k !== c && cells[k] && ((cells[k].v != null && cells[k].v !== '') || cells[k].f != null)) return false;
    return true;
  }

  /**
   * The text of the code column when it is a name, not a code: a line the program wrote whole into «Шифр»
   * («ПЕРЕВОЗКА АСФАЛЬТОБЕТОНА НА 80 КМ ПО А/Д», «ИТОГО ПО СТРОИТЕЛЬНЫМ МАШИНАМ:») while the name column stays empty.
   * A code («С212-202», «000163», «Е2703-008-04») has no two words of letters.
   */
  function nameInCode(cell) {
    var t = txt(cell).replace(/\s+/g, ' ').trim();
    return t.length >= 10 && /[A-Za-zА-Яа-яЁё]{3,}[^A-Za-zА-Яа-яЁё]+[A-Za-zА-Яа-яЁё]{2,}/.test(t) ? t : '';
  }

  /** The text after the first filled cell of a row: «Наименование объекта - | ПАССАЖИРСКИЙ ЛИФТ». */
  function labelled(cells) {
    var first = 0;
    for (var c = 1; c < cells.length; c++) {
      var t = txt(cells[c]).replace(/^\s+|\s+$/g, '');
      if (!t) continue;
      if (!first) { first = c; continue; }
      return t;
    }
    return '';
  }

  /**
   * The title block above one local estimate of form 4А: the construction
   * («Наименование стройки»), the estimate number («ЛОКАЛЬНЫЙ РЕСУРСНЫЙ СМЕТНЫЙ
   * РАСЧЕТ | № 06-05-01»), the works («на | ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ») and the
   * object («Наименование объекта»).
   */
  function blockMeta(rows, a, b) {
    var m = { stroika: '', number: '', work: '', object: '' };
    for (var r = a; r <= b; r++) {
      var cells = rows[r];
      if (!cells) continue;
      var head = '';
      for (var c = 1; c < cells.length && !head; c++) head = up(txt(cells[c]));
      if (!head) continue;
      if (head.indexOf('НАИМЕНОВАНИЕ СТРОЙКИ') === 0) m.stroika = filled(labelled(cells)) || (caption(cells) ? lineAbove(rows, r, a) : '');
      else if (head.indexOf('НАИМЕНОВАНИЕ ОБ') === 0) m.object = filled(labelled(cells)) || (caption(cells) ? lineAbove(rows, r, a) : '');
      else if (head.indexOf('ЛОКАЛЬНЫЙ') === 0) m.number = filled(labelled(cells));
      else if (head === 'НА') m.work = filled(labelled(cells));
    }
    return m;
  }

  /** A label left blank on the form («на ,» — a comma where the works should be) says nothing. */
  function filled(t) { return /[0-9A-Za-zА-Яа-яЁё]/.test(t) ? t : ''; }

  /** «(наименование стройки)» — the caption printed under the line it names, not a label before it. */
  function caption(cells) {
    for (var c = 1; c < cells.length; c++) { var t = txt(cells[c]).trim(); if (t) return t.charAt(0) === '('; }
    return false;
  }

  /** The nearest line above row r (not above row a) with words in it: the text a caption names. */
  function lineAbove(rows, r, a) {
    for (var u = r - 1; u >= a; u--) {
      var cells = rows[u] || [];
      for (var c = 1; c < cells.length; c++) {
        var t = txt(cells[c]).replace(/\s+/g, ' ').trim();
        if (LETTER.test(t) && t.charAt(0) !== '(' && !/^#[A-Z\/0]+[!?]?$/.test(t)) return t;   // not «#VALUE!»
      }
    }
    return '';
  }

  /**
   * Rows a..b stand between two headers of one sheet. The second header opens another estimate — not the next printed
   * page of the same one — when a title line stands among them, also one written whole in a single cell («ЛОКАЛЬНЫЙ
   * РЕСУРСНЫЙ СМЕТНЫЙ РАСЧЕТ № 01-01-02», «ЛОКАЛЬНАЯ СМЕТА № 2», «ВЕДОМОСТЬ …», «Наименование объекта - …»), or
   * when the estimate above has already come to its last total («ИТОГО ПРЯМЫЕ ЗАТРАТЫ», «ВСЕГО …»).
   */
  var TITLE_LINE = /^(ЛОКАЛЬН|ВЕДОМОСТЬ|НАИМЕНОВАНИЕ ОБ|НАИМЕНОВАНИЕ СТРОЙКИ)/, LAST_TOTAL = /^(ИТОГО\s+ПРЯМ|ВСЕГО)/;
  function startsAnew(rows, a, b) {
    for (var r = a; r <= b; r++) {
      var cells = rows[r];
      if (!cells) continue;
      for (var c = 1; c < cells.length; c++) {
        var t = up(txt(cells[c]));
        if (t && (TITLE_LINE.test(t) || LAST_TOTAL.test(t))) return true;
      }
    }
    return false;
  }

  /**
   * @returns {?{name, title, subtitle, layout, rows: Array<Row>, maxCol:number}}
   *   Row = {r, kind, section, no, nm, unit, qty, price, sum, cells}
   */
  function parseRange(sheet, L, start, last, meta) {
    if (last <= start) return null;

    var title = '', subtitle = '';
    if (meta) {
      title = meta.stroika;
      var obj = meta.object && meta.object.length > 3 && meta.object !== meta.work ? meta.object : '';
      subtitle = [meta.number, meta.work, obj].filter(function (t) { return t; }).join(' — ');
    } else {
      for (var r0 = 1; r0 < start; r0++) {
        var cs = sheet.rows[r0];
        if (!cs) continue;
        var t = '';
        for (var c0 = 1; c0 <= L.lastCol; c0++) { t = txt(cs[c0]); if (t) break; }
        if (!t) continue;
        if (!title) title = t; else if (!subtitle) subtitle = t;
      }
    }

    var out = [], section = '', band = '', work = '', items = 0, sections = 0, wide = L.lastCol;
    // the number of the first numbered line below row r, as text ('' when there is none): the local resource
    // statement tells by it whether a line is itself a work (see below)
    var nextNo = function (r) {
      for (var n = r + 1; n <= last; n++) { var t = txt((sheet.rows[n] || [])[L.no]).trim(); if (t) return t; }
      return '';
    };
    // A sheet read by its shape starts at its first resource band or line, below a «ПЕРЕВОЗКА» band that opens it:
    // that band still names the lines under it (the reading itself — where it starts — stays as it was)
    if (!L.headerRow) {
      for (var u = start - 1; u >= 1; u--) {
        var above = sheet.rows[u] || [], t = txt(above[L.no]) || txt(above[L.name]);
        if (!t) { if (lastFilled(above)) break; continue; }
        if (HAUL_OPEN.test(up(t)) && !isSection(t)) band = t;
        break;
      }
    }
    for (var r = start; r <= last; r++) {
      var cells = sheet.rows[r] || [];
      var nm = txt(cells[L.name]);
      // the name written into the code column (see nameInCode): read as the name, and carried into the name cell so
      // that the document — which leaves the code column out — still says what the line is
      if (!nm && L.code && r !== L.headerRow && r !== L.subRow) {
        var inCode = nameInCode(cells[L.code]);
        if (inCode) { nm = inCode; cells = cells.slice(); cells[L.name] = { v: inCode }; }
      }
      var noCell = cells[L.no];
      var noTxt = txt(noCell);
      var qty = S.num(cells[L.qty] && cells[L.qty].v);
      var price = S.num(cells[L.price] && cells[L.price].v);
      var sum = S.num(cells[L.sum] && cells[L.sum].v);
      var kind;

      if (r === L.headerRow || r === L.subRow) kind = 'header';
      else if (r === L.numRow) kind = 'numbering';
      // the row that numbers the columns («1 2 3 4 5 6») on a sheet read by its shape: part of the header, not a line
      // (it went into the document as one, «2 | 3 | 4 | 5 | 6»)
      else if (!L.numRow && countsColumns(cells, L)) kind = 'numbering';
      else if (isTotal(noTxt) || isTotal(nm)) kind = 'total';
      else if (noTxt && isSection(noTxt) && qty == null) { kind = 'section'; section = sectionOf(noTxt); sections++; }
      // Form 4А writes its bands in the name column, and its resources are the
      // numbered lines only: «В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ» and the closing
      // «ЗАТРАТЫ ТРУДА РАБОЧИХ» carry a quantity but are not resources.
      else if (L.code && !noTxt && nm && qty == null && isSection(nm)) { kind = 'section'; section = sectionOf(nm); sections++; }
      // the local resource statement: a work («РАЗРАБОТКА ГРУНТА …», 1000 М3) has no norm of one unit — only its
      // resources below it have one; the work is not a resource, its resources are. A line numbered under the work
      // above it («1.4» under «1») is that work's resource even with nothing per unit — a material the project names,
      // its norm left blank, «-» or a word. Only the number of that very work counts: «1.2» after a work «1.1» is the
      // next work, and where the numbering says nothing (no number, or a number of its own) the norm decides alone.
      // And only a line priced as a resource is (not a money, «%» or «В Т.Ч. …» line), and one with nothing numbered
      // under it: «1.1» followed by «1.1.1» is a work of its own, not a resource of «1»
      else if (L.unitQty && nm && qty != null && S.num(cells[L.unitQty] && cells[L.unitQty].v) == null &&
        !(work && noTxt.trim().indexOf(work + '.') === 0 && pricedLine(cells, L, nm, qty, price, sum) &&
          nextNo(r).indexOf(noTxt.trim() + '.') !== 0)) { kind = 'extra'; work = noTxt.trim(); }
      // a share of a cost (see shareLine): a money line, numbered or not, whatever its unit
      else if (nm && qty != null && shareLine(nm, price)) kind = 'extra';
      // a line in money with no price of its own («ТРАНСПОРТНЫЕ РАСХОДЫ | СУМ | 5 | | 31 995 849» — 5 % of the
      // materials above it): a money line; a resource has a price for its unit. On a sheet read by its shape it was
      // taken for a resource with no price (2026-11-18)
      else if (nm && qty != null && price == null && MONEY.test(up(txt(cells[L.unit])))) kind = 'extra';
      // what the customer gets back («ВОЗВРАТ МАТЕРИАЛОВ ЗАКАЗЧИКА»: the used pipes taken out): bought by nobody, priced
      // by nobody — no resource of the estimate
      else if (nm && RETURN_BAND.test(up(band))) kind = 'extra';
      // a т·км line under a haulage band with its price but its quantity left empty (and so its sum 0): a line of the
      // estimate all the same — numbered or not — read with the quantity 0, so that nothing on the sheet goes unseen
      else if (qty == null && !sum && price != null && nm && LETTER.test(nm) && haulBand(band) && TKM.test(up(txt(cells[L.unit])))) { kind = 'item'; qty = 0; items++; }
      else if (L.need && nm && LETTER.test(nm) && qty != null && !money(cells[L.unit]) && (S.num(noCell && noCell.v) != null || NUMBERED.test(noTxt) || price != null)) { kind = 'item'; items++; }
      else if (!L.need && nm && LETTER.test(nm) && qty != null &&
        (!L.code || S.num(noCell && noCell.v) != null || (!noTxt && pricedLine(cells, L, nm, qty, price, sum)))) { kind = 'item'; items++; }
      // «ПЕРЕВОЗКА» written in the name column (form 4А, or a sheet without bands in the № column): a band with no number on
      // it — the lines under it are haulage
      // (a title alone on its row: a money line «ТРАНСПОРТНЫЕ РАСХОДЫ 5 % | СУМ | …» is a line, whatever its sum)
      else if (nm && !noTxt && qty == null && price == null && sum == null && haulBand(nm) && alone(cells, L.name)) { kind = 'section'; section = 'other'; }
      else if (nm) kind = 'extra';
      else if (noTxt && L.need) { kind = 'section'; section = sectionOf(noTxt); }
      else if (noTxt) {
        kind = 'section';
        // «Перевозка материалов» in the number column: its lines are haulage, not the machines of the band above
        // (the statement of required resources gives such a band «other» the same way — sectionOf)
        if (haulBand(noTxt)) section = 'other';
      }
      else kind = 'blank';

      if (kind === 'section') band = noTxt || nm;
      // a line under «ПЕРЕВОЗКА» is the haulage of a material, not the material: the same name under
      // «Строительные материалы» is another resource with another price (the owner, 2026-11-14)
      // … but not under a resource band whose title happens to begin so («ТРАНСПОРТНОЕ ОБОРУДОВАНИЕ» is equipment)
      if (kind === 'item' && haulBand(band) && !HAUL.test(up(nm))) nm = (nm === nm.toUpperCase() ? 'ПЕРЕВОЗКА ' : 'Перевозка ') + nm;
      for (var w = cells.length - 1; w > wide; w--) {
        if (cells[w] && (cells[w].v != null || cells[w].f != null)) { wide = w; break; }
      }

      out.push({
        r: r, kind: kind, section: section, sub: r === L.subRow,
        no: S.num(noCell && noCell.v), noTxt: noTxt,
        nm: nm, unit: txt(cells[L.unit]),
        qty: qty, price: price, sum: sum,
        cells: cells
      });
    }
    // A sheet with a proper header row (НАИМЕНОВАНИЕ + КОЛ-ВО + ЦЕНА + СУММА)
    // is a resource sheet, section bands or not. When the layout had to be
    // guessed, at least one band is required — that is what keeps the summary
    // ("свод") sheets out, since they carry no header of their own.
    if (!items || (L.guessed && !sections)) return null;

    return {
      name: sheet.name, title: title, subtitle: subtitle || sheet.name,
      layout: L, rows: out, items: items, sections: sections,
      maxCol: Math.min(wide, L.sum + 8)
    };
  }

  /**
   * A sheet that names its own columns — N п/п · НАИМЕНОВАНИЕ · ЕД. ИЗМ. · КОЛ-ВО · ЦЕНА · СУММА — and still
   * could not be read by the shape of its lines: its bands are written in the name column, or it has none, or
   * a column stands between the six. Such a sheet was refused with «листы ресурсов не найдены», and the advice
   * under that message is to add the very header it already had.
   *
   * The header gives the columns; the rows are then read exactly as on every other ordinary sheet (from the
   * first line of the table, the header itself left out), so the document looks the same whichever way a
   * sheet was recognised. A sheet the shape reading accepts never comes here: every document made so far was
   * read that way and must come out as it did.
   *
   * Only an estimate's header counts: one quantity, one price, one sum. A table with «Кол-во было | Кол-во
   * стало» or with a smeta price and a market price side by side — the program's own comparison and its own
   * document among them — is somebody's report about an estimate, not an estimate.
   */
  function byHeader(sheet) {
    var rows = sheet.rows;
    var H = findLayout(rows, true);
    if (!H || H.code) return null;
    var head = rows[H.headerRow], qtys = 0, prices = 0, sums = 0;
    for (var c = 1; c < head.length; c++) {
      var u = up(txt(head[c]));
      if (u.indexOf('КОЛ ВО') >= 0 || u.indexOf('КОЛИЧЕСТВО') === 0) qtys++;
      else if (u.indexOf('ЦЕНА') >= 0) prices++;
      else if (u.indexOf('СУММА') >= 0) sums++;
    }
    if (qtys !== 1 || prices !== 1 || sums !== 1) return null;
    var first = (H.subRow || H.headerRow) + 1;
    H.headerRow = 0; H.subRow = 0; H.numRow = 0;
    for (var r = first; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells) continue;
      var noTxt = txt(cells[H.no]);
      if ((noTxt && isSection(noTxt)) || (txt(cells[H.name]) && S.num(cells[H.qty] && cells[H.qty].v) != null)) {
        return parseRange(sheet, H, r, lastContentRow(rows), null);
      }
    }
    return null;
  }

  /**
   * The haulage sheet: material, unit, quantity, density, tonnes, the distance in km, the т·км, the price of one т·км
   * and the sum. Each material's line is a resource of its own — «Транспортировка <материал> <N> км», т/км, its
   * т·км as the quantity — named the way the expert's replies name it, so that a reply's haulage price lands on it.
   * Only a sheet no other reading took comes here (it used to be left out), and only by its header: a material
   * name, a km column, a т·км column, a price of one т·км and a sum.
   * The row keeps only the columns the comparison table has (№, name, unit, т·км, price, sum): the material's own
   * quantity, density, tonnes and km stand where the table's own columns are and are not copied.
   */
  function transportSheet(sheet) {
    var rows = sheet.rows, H = null, r;
    function headOf(cells, h) {
      for (var c = 1; c < cells.length; c++) {
        var raw = txt(cells[c]), u = up(raw);
        if (!u && !/^\s*№/.test(raw)) continue;
        // «Наименование материалов», or a bare «МАТЕРЯЛЫ» / «Материалы»; «ЕД ИЗ» as well as «Ед. изм.»; «ТОН/КМ» as well as «тн/км»
        // a material's own price («Стоимость мат-ов без перевозки»): such a sheet adds the haulage to the material's
        // price, which the resource sheet already carries — it is a calculation of prices, not a cost of its own
        if (/^СТОИМОСТЬ? МАТ/.test(u)) h.matPrice = c;
        // «Наименование работ и затрат, характеристика …» on a «Расчёт стоимости перевозки» sheet names the materials too
        else if (/^НА?И?МЕНОВАНИЕ МАТЕРИАЛ|^МАТЕР[ИЬ]?[АЯ]ЛЫ?$|^НАИМЕНОВАНИЕ РАБОТ И ЗАТРАТ/.test(u)) h.name = c;
        else if (/^ЕД( |$)/.test(u) && u.indexOf('ИЗ') > 0) h.unit = c;
        else if (/^ЕД/.test(u) && u.indexOf('ИЗМ') > 0) h.unit = c;
        else if (/^СТОИМОСТЬ ЗА/.test(u)) h.price = c;           // «Стоимость за один тн/км» — before the km test
        else if (/^НА Т(Н|ОН)? ?КМ$/.test(u)) h.price = c;       // «на тн/км» under «автотр расход»
        else if (/^(ТН|Т|ТОН|ТОНН) КМ$/.test(u)) h.tkm = c;
        // «… км», or «Расст» / «расс-т» / «Расст-е» alone: «Расст-е на перев-у» is the rail distance (under «расход ж/д
        // перевозки»), which must not be taken for the road km wherever it stands
        else if (/(^| )КМ$/.test(u) || /^РАСС ?Т( ?Е)?$/.test(u)) h.km = c;
        // read for the checks below only: the material's own quantity, its specific weight, the tonnes
        else if (/^КОЛ(ИЧЕСТВ|И ЧЕСТВО|ВО$)|^ПОТРЕБНОСТ/.test(u)) h.amount = c;
        else if (/^(УДЕЛЬ? ?НЫЙ|ОБ[ЪЬ]?ЕМ ?НЫЙ) ВЕС/.test(u)) h.weight = c;     // «Удельный», «Удель- ный», «Объем- ный»
        else if (/^(ОБЩ|ОБШ)(ИЙ|АЯ)? ?(ТОНН|ВЕС)/.test(u)) h.tons = c;
        else if (/^ОБЩАЯ ЦЕНА/.test(u)) h.sum = c;          // «Общая цена» — the whole cost, beside a «Всего» of one unit
        // a later «Всего» is the sum over an earlier «Сумма …» / «Итого» / «Всего», as it always was — but not over «Общая
        // цена» (a «Всего» beside it is the cost of one unit)
        else if ((u === 'ВСЕГО' && !(h.sum && /^ОБЩАЯ ЦЕНА/.test(up(txt(cells[h.sum]))))) || u.indexOf('СУММА') === 0 ||
          /^СТОИМОСТЬ ГРУЗОПЕРЕВОЗ/.test(u) || (u === 'ИТОГО' && !h.sum)) h.sum = c;
        else if (/^\s*№/.test(raw) || /^N П П$/.test(u)) h.no = c;
      }
      return h;
    }
    // the т·км is a column of its own, or — on a sheet without one — the tonnes × the km of the line
    // or — on a sheet with neither — the quantity × the specific weight × the km («Расчёт стоимости перевозки»)
    function whole(h) { return h.name && h.km && (h.tkm || h.tons || (h.amount && h.weight)) && h.price && h.sum && !h.matPrice; }
    for (r = 1; r < Math.min(rows.length, 20) && !H; r++) {
      if (!rows[r]) continue;
      var h = headOf(rows[r], {});
      // a header over two rows («Автомобил» above «Автотранспортная км | Стоимость за один т/км | Итого»): the row
      // below fills in what the first one left out — never what it already named; a row below that is a whole header
      // by itself is the header (the next turn of the loop takes it), as it always was
      if (!whole(h) && rows[r + 1]) {
        var h2 = headOf(rows[r + 1], {});
        if (!whole(h2)) Object.keys(h2).forEach(function (k) { if (h[k] == null && Object.keys(h).every(function (j) { return h[j] !== h2[k]; })) h[k] = h2[k]; });
      }
      if (whole(h)) { H = h; H.headerRow = r; }
    }
    if (!H) return null;
    var computed = !H.tkm;              // т·км = tonnes × km, written into the tonnes' place
    var byAmount = !H.tkm && !H.tons;   // т·км = quantity × specific weight × km, written into the quantity's place
    var L = { no: H.no || 1, name: H.name, unit: H.unit || H.name + 1, qty: H.tkm || H.tons || H.amount, price: H.price, sum: H.sum,
      headerRow: H.headerRow, subRow: 0, numRow: 0, lastCol: H.sum, transport: true };
    var keep = [L.no, L.name, L.unit, L.qty, L.price, L.sum];
    function slim(cells, over) {
      var out = [];
      keep.forEach(function (c) { if (cells && cells[c]) out[c] = cells[c]; });
      Object.keys(over || {}).forEach(function (c) { out[c] = over[c]; });
      return out;
    }
    function km(v) { return Math.round(v) === v ? String(v) : String(+v.toFixed(3)).replace('.', ','); }
    // the name under a header merged over two columns («Наименование …» over B:C) is written in either of them
    function nameAt(cs) {
      var t = txt(cs[L.name]).replace(/\s+/g, ' ').trim();
      if (!t && L.unit > L.name + 1) t = txt(cs[L.name + 1]).replace(/\s+/g, ' ').trim();
      return t;
    }
    H.nameAt = nameAt;
    var title = '', subtitle = '';
    for (r = 1; r < L.headerRow; r++) {
      var t = '';
      for (var c0 = 1; c0 <= L.lastCol && rows[r]; c0++) { t = txt(rows[r][c0]); if (t) break; }
      if (!t) continue;
      if (!title) title = t; else if (!subtitle) subtitle = t;
    }
    var out = [], items = 0, last = lastContentRow(rows), fits = 0, misfits = 0;
    for (r = L.headerRow; r <= last; r++) {
      var cs = rows[r] || [];
      var name = nameAt(cs);
      var noCell = cs[L.no], noTxt = txt(noCell);
      var tkm = S.num(cs[L.qty] && cs[L.qty].v), price = S.num(cs[L.price] && cs[L.price].v), sum = S.num(cs[L.sum] && cs[L.sum].v);
      var dist = S.num(cs[H.km] && cs[H.km].v);
      if (byAmount) {
        var wt = S.num(cs[H.weight] && cs[H.weight].v);
        tkm = tkm != null && wt != null && dist != null ? tkm * wt * dist : null;
      } else if (computed) tkm = tkm != null && dist != null ? tkm * dist : null;
      var row = { r: r, kind: 'blank', section: 'other', sub: false, no: S.num(noCell && noCell.v), noTxt: noTxt, nm: name, unit: txt(cs[L.unit]),
        qty: tkm, price: price, sum: sum, cells: slim(cs) };
      if (r === L.headerRow) row.kind = 'header';
      else if (!L.numRow && S.num(cs[L.name] && cs[L.name].v) != null) {
        // the sheet numbers its own twelve columns; the table it lands in has six
        row.kind = 'numbering'; L.numRow = r;
        row.cells = []; keep.forEach(function (c, i) { row.cells[c] = { v: i + 1 }; });
      }
      else if (r < (L.numRow || 0)) { row.kind = 'header'; row.sub = true; if (!L.subRow) L.subRow = r; }
      else if (isTotal(name) || isTotal(noTxt)) row.kind = 'total';
      else if (name && LETTER.test(name) && tkm != null && tkm > 0 && price != null && dist != null && dist > 0) {
        row.kind = 'item'; items++;
        // «Расчёт стоимости перевозки»: its whole cost is the т·км × the price of one т·км. A sheet where no line's cost
        // is («Общая цена» = the material's own price + its haulage, per unit) is a calculation of prices, whatever its
        // header calls the material's price: the resource sheet already carries that price. A line off on a sheet whose
        // other lines agree is the estimator's slip: the sheet is read, and the line keeps the sum the sheet gives it
        if (byAmount && sum != null) { if (Math.abs(tkm * price - sum) <= Math.max(1, sum * 0.002)) fits++; else misfits++; }
        row.nm = 'Транспортировка ' + name + ' ' + km(dist) + ' км';
        row.unit = 'т/км';
        row.cells = slim(cs, (function () {
          var o = {}; o[L.name] = { v: row.nm }; o[L.unit] = { v: row.unit };
          // computed т·км: the value, and the sum as the sheet has it (its formula names the km and tonnes, left out here)
          if (computed) { o[L.qty] = { v: tkm }; o[L.sum] = { v: sum }; }
          return o;
        })());
      } else if (name) row.kind = 'extra';
      out.push(row);
    }
    // the header's own second line («тн» under «Удельный вес») sits before the numbering
    out.forEach(function (x) { if (x.r > L.headerRow && L.numRow && x.r < L.numRow && x.kind === 'blank') { x.kind = 'header'; x.sub = true; if (!L.subRow) L.subRow = x.r; } });
    if (!items || (misfits && !fits)) return null;
    return { name: sheet.name, title: title, subtitle: subtitle || sheet.name, layout: L, rows: out, items: items, sections: 0, maxCol: L.sum,
      checks: haulChecks(rows, out, H) };
  }

  /**
   * What a haulage sheet gets wrong, as the expert would point it out (nothing is changed — the estimate is read as it is):
   *   weight  a material counted in tonnes carries a specific weight other than 1: its tonnes, its т·км and its sum
   *           are that many times what they are («АСФАЛЬТОБЕТОННАЯ СМЕСЬ», ТН, weight 2);
   *   total   the sheet's «ВСЕГО» is not the sum of its lines — a line left out of the SUM (SUM(J8:J12) above a line 13);
   *           a money line («3% от стоимости материалов») may be in the total or out of it, both are the estimate's own way.
   * Each: { kind, r, nm, unit, …, text } — `text` in the page's language, ready to show.
   */
  var TONNES = /^(Т|ТН|ТОН|ТОННА|ТОНН|ТОННЫ)$/;
  function haulChecks(rows, out, H) {
    var checks = [], lines = 0, linesN = 0, items = [];
    function fmt(v) { return S.money ? S.money(v) : String(Math.round(v)); }
    out.forEach(function (x) {
      if (x.kind !== 'item') return;
      var cs = rows[x.r] || [], name = H.nameAt ? H.nameAt(cs) : txt(cs[H.name]).replace(/\s+/g, ' ').trim(), unit = txt(cs[H.unit]);
      items.push({ r: x.r, nm: name, sum: x.sum });
      if (x.sum != null) { lines += x.sum; linesN++; }
      var w = H.weight ? S.num(cs[H.weight] && cs[H.weight].v) : null;
      if (w != null && w > 0 && Math.abs(w - 1) > 1e-9 && TONNES.test(up(unit))) {
        var fixedTkm = x.qty != null ? x.qty / w : null, fixedSum = x.sum != null ? x.sum / w : null;
        checks.push({ kind: 'weight', r: x.r, nm: name, unit: unit, weight: w, tkm: x.qty, tkmFixed: fixedTkm, sum: x.sum, sumFixed: fixedSum,
          text: '«' + name + '» (' + unit + '): удельный вес ' + String(w).replace('.', ',') + ', а для материала в тоннах он равен 1 — тонны, т·км и сумма ' +
            'завышены в ' + String(+w.toFixed(3)).replace('.', ',') + ' раза' + (fixedSum != null ? ' (сумма ' + fmt(x.sum) + ' вместо ' + fmt(fixedSum) + ')' : '') });
      }
    });
    var tot = null;
    for (var i = out.length - 1; i >= 0 && !tot; i--) if (out[i].kind === 'total' && out[i].sum != null) tot = out[i];
    // a money line above the total — «На остальные материалы 3% от стоимости материалов» — is not haulage of a material
    // (no т·км, no km), so not a resource. Estimates put it either way: inside the «ИТОГО», or outside it (SUM over the
    // materials only — the owner's own corrected file leaves it so, 2026-11-16). Neither is a mistake to point out: the
    // materials read here are what the estimate charges in both. Only a total that is neither is said.
    var extras = 0;
    if (tot) out.forEach(function (x) { if (x.kind === 'extra' && x.r < tot.r && x.sum != null) extras += x.sum; });
    function near(a, b) { return Math.abs(a - b) <= Math.max(1, Math.abs(a) * 1e-6); }
    if (tot && linesN && !near(lines, tot.sum) && !near(lines + extras, tot.sum)) {
      // the line (or lines) whose sum is the difference: the ones left out — with the money line in the total, or out of it
      var all = lines + extras;
      var missIn = items.filter(function (it) { return it.sum != null && near(it.sum, all - tot.sum); });
      var missOut = extras ? items.filter(function (it) { return it.sum != null && near(it.sum, lines - tot.sum); }) : [];
      var shown = missIn.length || !missOut.length ? all : lines, miss = missIn.length ? missIn : missOut, diff = shown - tot.sum;
      checks.push({ kind: 'total', r: tot.r, total: tot.sum, lines: shown, diff: diff, missing: miss.map(function (m) { return m.nm; }),
        text: '«' + (tot.nm || 'ВСЕГО') + '» ' + fmt(tot.sum) + ' не равно сумме строк ' + fmt(shown) +
          (miss.length ? ' — не учтена строка «' + miss[0].nm + '» (' + fmt(miss[0].sum) + ')' : ' (разница ' + fmt(diff) + ')') });
    }
    return checks;
  }

  /**
   * Every resource object on one sheet. Usually one; a form 4А export stacks
   * many local estimates on a single sheet, each with its own title block and
   * header, and each becomes an object of its own («РА · 1», «РА · 2» …) that
   * ends at its last ИТОГО line, so the «СОСТАВИЛ» signature and the next
   * estimate's title block stay out.
   */
  function parseSheetObjects(sheet) {
    var rows = sheet.rows;
    var L = findLayout(rows) || inferLayout(rows);
    // Only form 4А is split: an ordinary resource sheet that repeats its header
    // on every printed page stays one object, as it always was.
    if (!L || !L.code) {
      var one = L ? parseRange(sheet, L, L.headerRow || firstBodyRow(rows, L), lastContentRow(rows), null) : null;
      if (!one) one = byHeader(sheet);
      if (!one) one = transportSheet(sheet);
      return one ? [one] : [];
    }
    // A header repeated on a new printed page inside one estimate is not a new estimate: only a header with a title of
    // its own above it (number, works, object, «ЛОКАЛЬНЫЙ…») starts one. Split there, the lines between the last
    // ИТОГО and the repeated header were lost, and the band above them with them.
    var heads = headerRows(rows, L).filter(function (h, i, all) {
      if (!i) return true;
      var m = blockMeta(rows, all[i - 1] + 1, h - 1);
      return !!(m.number || m.work || m.object || m.stroika) || startsAnew(rows, all[i - 1] + 1, h - 1);
    });
    var out = [], last = lastContentRow(rows), prevEnd = 0, stroika = '';
    for (var i = 0; i < heads.length; i++) {
      var Li = layoutAt(rows, heads[i]);
      var limit = i + 1 < heads.length ? heads[i + 1] - 1 : last;
      var end = lastTotalRow(rows, Li, heads[i], limit) || limit;
      var meta = blockMeta(rows, prevEnd + 1, heads[i] - 1);
      if (!stroika) stroika = meta.stroika;
      var o = parseRange(sheet, Li, heads[i], end, meta);
      // a local estimate «на ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ»: every line of it counts as equipment for the report's note
      if (o) o.equipTitle = EQUIP_WORD.test(up(meta.work)) || EQUIP.test(up(meta.work));
      prevEnd = end;
      if (o) out.push(o);
    }
    out.forEach(function (o, k) {
      if (!o.title) o.title = stroika;
      if (out.length > 1) o.name = sheet.name + ' · ' + (k + 1);
      if (o.subtitle === sheet.name) o.subtitle = o.name;
    });
    return out;
  }

  /** The first resource object of a sheet, or null. */
  function parseSheet(sheet) {
    return parseSheetObjects(sheet)[0] || null;
  }

  /**
   * The objects of a book that only add up other objects of the same book: the summary statement of resources
   * («Ресурс», «Сводная ведомость»), each line the quantity of one resource summed over the object sheets (SUMIF over
   * them). Usually hidden, and a hidden sheet is not read; a book sent back with it shown is the same book, and read
   * with its objects it counted every resource twice — the comparison of two versions took its every line for a new
   * one (2026-11-18). Told by the figures alone, no formula needed: an object is such a sum when, for one set of at
   * least two other objects, nine lines in ten (by count and by sum) carry the quantity of the same resource (name,
   * unit, price) on those objects added together. An object that merely shares resources with the others — the same
   * lines, quantities of its own — is no sum of them.
   *
   * @returns {Array<{i: number, of: number[]}>}  the sums (index in `objects`) and the objects each adds up
   */
  function sumsOfOthers(objects) {
    var out = [];
    if (objects.length < 3) return out;
    var r3 = function (v) { return v == null ? '' : String(Math.round(v * 1000) / 1000); };
    var bags = objects.map(function (o) {
      var q = {}, value = {};
      (o.rows || []).forEach(function (r) {
        if (r.kind !== 'item') return;
        var k = S.nameKey(r.nm || '') + '\u241f' + S.unitKey(r.unit || '') + '\u241f' + r3(r.price);
        q[k] = (q[k] || 0) + (r.qty || 0);
        value[k] = (value[k] || 0) + Math.abs(r.sum || 0);
      });
      return { q: q, value: value, keys: Object.keys(q) };
    });
    var near = function (a, b) { return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-4); };
    bags.forEach(function (me, i) {
      if (me.keys.length < 10) return;
      var others = [];
      bags.forEach(function (b, j) { if (j !== i && b.keys.length) others.push(j); });
      if (others.length < 2) return;
      var total = me.keys.reduce(function (t, k) { return t + me.value[k]; }, 0);
      var adds = function (set) {
        var lines = 0, value = 0;
        me.keys.forEach(function (k) {
          var e = set.reduce(function (t, j) { return t + (bags[j].q[k] || 0); }, 0);
          if (near(me.q[k], e)) { lines++; value += me.value[k]; }
        });
        return lines >= 0.9 * me.keys.length && value >= 0.9 * total;
      };
      // the sets a summary is made of, as books have them: every other object, or every other object whose resources
      // are all among these (a summary of some of the objects) — a few lines the estimator changed on the summary alone
      // do not stand in the way
      var inside = others.filter(function (j) { return bags[j].keys.every(function (k) { return k in me.q; }); });
      var tried0 = [others, inside.length >= 2 && inside.length < others.length ? inside : null];
      for (var t0 = 0; t0 < tried0.length; t0++) {
        if (tried0[t0] && adds(tried0[t0])) { out.push({ i: i, of: tried0[t0] }); return; }
      }
      // else any set of the others whose lines add up to these: tried by the sum of what each holds of these resources
      // first (every subset of at most 16 objects), then line by line
      var held = others.map(function (j) {
        return me.keys.reduce(function (t, k) { return t + (bags[j].q[k] || 0) * (me.q[k] ? me.value[k] / me.q[k] : 0); }, 0);
      });
      var want = me.keys.reduce(function (t, k) { return t + (me.q[k] ? me.value[k] : 0); }, 0);
      if (others.length > 16) return;
      var n = others.length, sums = [0], tried = 0;
      for (var mask = 1; mask < (1 << n) && tried < 64; mask++) {
        var low = mask & -mask, bit = 0;
        while ((1 << bit) !== low) bit++;
        sums[mask] = sums[mask ^ low] + held[bit];
        if (low === mask || !near(sums[mask], want)) continue;
        tried++;
        var set = others.filter(function (j, b) { return mask & (1 << b); });
        if (adds(set)) { out.push({ i: i, of: set }); return; }
      }
    });
    return out;
  }

  /**
   * Every resource object of a workbook, in file order. A hidden sheet is not read, nor an object that only adds up
   * others of the book (sumsOfOthers); `left`, when given, is told of each such object: { name, of: [names] }.
   */
  function parseWorkbook(wb, fileName, left) {
    var objects = [];
    for (var i = 0; i < wb.sheets.length; i++) {
      var sh = wb.sheets[i];
      if (sh.hidden) continue;
      var list = parseSheetObjects(sh);
      for (var k = 0; k < list.length; k++) {
        list[k].file = fileName; list[k].index = i;
        objects.push(list[k]);
      }
    }
    var sums = sumsOfOthers(objects);
    if (!sums.length) return objects;
    var drop = {};
    sums.forEach(function (s) {
      drop[s.i] = 1;
      if (left) left.push({ name: objects[s.i].name, of: s.of.map(function (j) { return objects[j].name; }) });
    });
    return objects.filter(function (o, i) { return !drop[i]; });
  }

  S.smeta = {
    parseSheet: parseSheet, parseWorkbook: parseWorkbook,
    SECTIONS: SECTIONS, sectionOf: sectionOf
  };
})(S);
