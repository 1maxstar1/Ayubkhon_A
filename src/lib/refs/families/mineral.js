/*
 * Family parser «mineral» (ES5 plain script; sets the global `MineralFamily`): concrete and mortar, precast
 * concrete items, asphalt, cement, aggregates, bitumen, bricks and blocks.
 *
 *   owns(name, unit, section)  -> true when the name is one of these materials
 *   parse(name, unit, section) -> { family: 'mineral', key, attrs, levels } | null
 *   conflict(a, b)             -> null | reason
 *
 * The key keeps the kind, class / grade and every number that identifies the item (precast codes stay whole);
 * relaxed levels say what they dropped. Grade and kind tables are generic vocabulary from the standards.
 * Comments that named where an entry was seen are kept privately in the reference kit; the code is unchanged from
 * the measured version and changes only with the parity measurement (test/refs-parity.cjs).
 */
(function (root) {
  'use strict';

  var VERSION = 'mineral-2026-10-25.3';

  var LOOK = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

  var UZ = [
    [/(\d{2,3})\s*-?\s*MARKALI/g, 'МАРКА $1'],
    [/TAYYORLASH/g, ' '],
    [/XISOBOT\s*№/g, 'ОТЧЕТ №'],
    [/ШУ\s+ЖУМЛАДАН/g, 'В ТОМ ЧИСЛЕ'],
    [/YUQORI\s*G'OVAK(?:DOR|LI)?(?:LI)?/g, 'ВЫСОКОПОРИСТАЯ'],
    [/ЮҚОРИ\s*ҒОВАК(?:ДОР|ЛИ)?/g, 'ВЫСОКОПОРИСТАЯ'],
    [/G'OVAK(?:DOR|LI)?(?:LI)?(?:\s*KO'RINISHLI)?/g, 'ПОРИСТАЯ'],
    [/ҒОВАК(?:ДОР|ЛИ)?/g, 'ПОРИСТАЯ'],
    [/(?:ISSIQ|QAYNOQ)/g, 'ГОРЯЧАЯ'],
    [/(?:ИССИҚ|ҚАЙНОҚ)/g, 'ГОРЯЧАЯ'],
    [/MAYDA\s*DON(?:A|)LI/g, 'МЕЛКОЗЕРНИСТАЯ'],
    [/МАЙДА\s*ДОН(?:А|)ЛИ/g, 'МЕЛКОЗЕРНИСТАЯ'],
    [/YIRIK\s*DON(?:A|)LI/g, 'КРУПНОЗЕРНИСТАЯ'],
    [/ЙИРИК\s*ДОН(?:А|)ЛИ/g, 'КРУПНОЗЕРНИСТАЯ'],
    [/QUMLI/g, 'ПЕСЧАНАЯ'], [/ҚУМЛИ/g, 'ПЕСЧАНАЯ'],
    [/ZICH(?:LI)?/g, 'ПЛОТНАЯ'], [/ЗИЧ(?:ЛИ)?(?=[^А-Я]|$)/g, 'ПЛОТНАЯ'],
    [/CHAQIQ\s*TOSHLI/g, 'ЩЕБЕНОЧНАЯ'], [/ЧАҚИҚ\s*ТОШЛИ/g, 'ЩЕБЕНОЧНАЯ'],
    [/CHAQIQ\s*TOSH\s*-\s*QUM\s+ARALASHMASI/g, 'ЩЕБЕНОЧНО-ПЕСЧАНАЯ СМЕСЬ'],
    [/CHAQIQ\s*TOSH/g, 'ЩЕБЕНЬ'], [/ЧАҚИҚ\s*ТОШ/g, 'ЩЕБЕНЬ'],
    [/SHAG'AL-?MASTIKLI/g, 'ЩЕБЕНОЧНО-МАСТИЧНАЯ'],
    [/SHEBIN\s*MASTIKA/g, 'ЩЕБЕНОЧНО-МАСТИЧНАЯ'],
    [/QUM[-\s]*SHAG'AL/g, 'ПЕСЧАНО-ГРАВИЙНАЯ'],
    [/QSHA/g, 'ПГС'],
    [/YUVILGAN\s*QUM/g, 'ПЕСОК МЫТЫЙ'],
    [/(^|[^A-Z'])QUM(?=[^A-Z']|$)/g, '$1ПЕСОК'], [/(^|[^А-Я])ҚУМ(?=[^А-Я]|$)/g, '$1ПЕСОК'],
    [/SHAG'AL/g, 'ГРАВИЙ'], [/ШАҒАЛ/g, 'ГРАВИЙ'],
    [/ASFAL?T(?:O)?\s*-?\s*BETO?N/g, 'АСФАЛЬТОБЕТОН'],
    [/ASFALTO(?=\s)/g, 'АСФАЛЬТОБЕТОН'],
    [/(?:QORISHMA|ARALASHMA)(?:SI(?:NI)?)?/g, 'СМЕСЬ'],
    [/(?:ҚОРИШМА|АРАЛАШМА)(?:СИ(?:НИ)?)?/g, 'СМЕСЬ'],
    [/(^|[^A-Z])BETON(?=[^A-Z]|$)/g, '$1БЕТОН'],
    [/SEMENT/g, 'ЦЕМЕНТ'], [/СЕМЕНТ/g, 'ЦЕМЕНТ'],
    [/(^|[^A-Z])SUV(?=[^A-Z]|$)/g, '$1ВОДА'], [/(^|[^А-Я])СУВ(?=[^А-Я]|$)/g, '$1ВОДА'],
    [/BITUM/g, 'БИТУМ'], [/EMULSIYA/g, 'ЭМУЛЬСИЯ'],
    [/SHEBEN\s+(?:ARALASHMASI|СМЕСЬ)/g, 'ЩЕБЕНОЧНАЯ СМЕСЬ'],
    [/SHCHEBEN|SHEBEN|SHEBIN/g, 'ЩЕБЕНЬ'],
    [/Щ\s*EBENOCHNO-PESCHANAYA\s+SMES/g, 'ЩЕБЕНОЧНО-ПЕСЧАНАЯ СМЕСЬ'], [/Щ\s*EBEN/g, 'ЩЕБЕНЬ'], [/FRAKSII/g, 'ФРАКЦИИ'], [/PESOK/g, 'ПЕСОК'],
    [/(^|[^A-Z])SHGPS(?=[^A-Z]|$)/g, '$1ЩГПС'], [/(^|[^A-Z])GPS(?=[^A-Z]|$)/g, '$1ГПС'], [/ELANGAN/g, 'ПРОСЕЯННЫЙ'],
    [/(^|[^A-Z])S\s*-\s*(\d)/g, '$1С-$2'], [/Щ\s+PS(?=[^A-Z]|$)/g, 'ЩПС'], [/MARKA(?=\s*\()/g, 'МАРКИ'], [/№\s*\d+\s*\/\s*TKKM/g, ' '], [/-?SONLI/g, ' '], [/RETSIP/g, ' '],
    [/№\s*\d+\s*\/\s*TKKM(?:-?SONLI)?/g, ' '], [/(^|\s)(?:BO'YICHA|RETSEPT|-?SONLI|UCHUN|ASOSIDA|TAYYORLANGAN|QO'SHIMCHASI|QO'SHILGAN|BILAN|YO'L|QOPLAMALARINING|USTKI|QATLAMLARI|ISHLAB|CHIQARISH)(?=[\s,.)]|$)/g, '$1'],
    [/(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:У|Й|YIL|Y)?(?=[^А-ЯA-Z]|$)/g, ' '],
    [/MINERAL\s*POROSHOK(?:\s*BILAN)?/g, 'С МИНЕРАЛЬНЫМ ПОРОШКОМ'],
    [/POLIMER/g, 'ПОЛИМЕР'],
    [/MARKA\s*-?\s*([12I]{1,3})(?![0-9])/g, 'МАРКА $1'],
    [/([12I]{1,3})\s*MARKALI/g, 'МАРКА $1'],
    [/(^|[^A-Z])([ABVGD])\s*-?\s*(?:TURDAGI|TURLI|TIP)(?=[^A-Z]|$)/g, '$1ТИП $2'],
    [/(^|[^A-Z])TIP\s*-?\s*([ABVGD])(?=[^A-Z]|$)/g, '$1ТИП $2'],
    [/G'ISHT/g, 'КИРПИЧ'], [/ГИШТ/g, 'КИРПИЧ'],
    [/ТЕШИКЛИ/g, 'ПУСТОТЕЛЫЙ'], [/ПИШГАН/g, 'ОБОЖЖЕННЫЙ'],
    [/OHAK/g, 'ИЗВЕСТЬ'], [/ОҲАК/g, 'ИЗВЕСТЬ']
  ];
  var UZ_TYPE = { A: 'А', B: 'Б', V: 'В', G: 'Г', D: 'Д' };
  var HAS_UZ = /[A-Z]{3}|[ҚҒЎҲ]|ГИШТ|ТЕШИКЛИ|СЕМЕНТ|СУВ/;

  function foldToken(tok) {
    if (!/[A-Z]/.test(tok)) return tok;
    var i, c, out = '';
    for (i = 0; i < tok.length; i++) { c = tok.charAt(i); if (c >= 'A' && c <= 'Z' && !LOOK[c]) return tok; }
    for (i = 0; i < tok.length; i++) { c = tok.charAt(i); out += LOOK[c] || c; }
    return out;
  }

  function prep(name) {
    var s = String(name == null ? '' : name).toUpperCase();
    s = s.replace(/Ё/g, 'Е').replace(/[ІӀ]/g, 'I').replace(/[ \t\r\n]+/g, ' ').replace(/[«»“”„]/g, '"').replace(/[‘’`ʻʼ]/g, "'")
      .replace(/([GOgo])'\s+(?=[A-Za-z])/g, "$1'");
    if (HAS_UZ.test(s)) {
      for (var i = 0; i < UZ.length; i++) s = s.replace(UZ[i][0], UZ[i][1]);
      s = s.replace(/ТИП ([ABVGD])/g, function (m, l) { return 'ТИП ' + UZ_TYPE[l]; });
    }
    s = s.replace(/(^|[^A-Z])EB([AK])(?=[^A-Z]|$|-|\d)/g, function (m, p, l) { return p + 'ЭБ' + (l === 'A' ? 'А' : 'К'); });
    s = s.replace(/(^|[^A-Z])P(?:SH|SCH)MA/g, '$1ПЩМА').replace(/(^|[^A-Z])(?:SH|SCH)MA/g, '$1ЩМА');
    s = s.replace(/[A-ZА-Я0-9]+/g, foldToken);
    s = s.replace(/ЩЕБЕНЬ\s*\(ЩЕБЕНЬ\s*ФРАКСИИ\)/g, 'ЩЕБЕНЬ ФРАКЦИИ');
    s = s.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return s;
  }

  function tailOf(s) {
    var i = s.lastIndexOf(': ');
    if (i <= 0) return s;
    var head = s.slice(0, i), tail = s.slice(i + 2);
    var words = tail.match(/[А-ЯA-Z]{3,}/g) || [];
    var adj = 0;
    for (var w = 0; w < words.length; w++) if ((/(?:ИЙ|ЫЙ|ОЙ|АЯ|ЯЯ|ОЕ|ЕЕ|ЫЕ|ИЕ)$/.test(words[w]) && !/^(?:ЩЕБЕНЬ|КАМЕНЬ|БЕТОН)$/.test(words[w])) || /^SBS$/.test(words[w])) adj++;
    var valueLike = !words.length || adj === words.length ||
      /(?:МАРК[А-Я]*|ФРАКЦИ[ЯИ]|ММ|КЛАСС[А-Я]*|СОСТАВ|ТИП[А]?)\s*,?\s*$/.test(head);
    if (valueLike) return s.slice(0, i) + ' ' + tail;
    var q = '';
    if (/ДЛЯ\s+ДРУГИХ\s+ОРГАНИЗАЦИ/.test(head) && !/ДЛЯ\s+ДРУГИХ\s+ОРГАНИЗАЦИ/.test(tail)) q += ' (ДЛЯ ДРУГИХ ОРГАНИЗАЦИЙ)';
    return tail + q;
  }

  function W(src) { return new RegExp('(?:^|[^А-ЯA-Z0-9])(?:' + src + ')'); }
  function WE(src) { return new RegExp('(?:^|[^А-ЯA-Z0-9])(?:' + src + ')(?=[^А-ЯA-Z0-9]|$)'); }

  function num(s) { return String(s).replace(',', '.').replace(/^0+(?=\d)/, ''); }

  function Work(t) { this.w = ' ' + t + ' '; this.ign = []; }
  Work.prototype.take = function (re) {
    var m = re.exec(this.w);
    if (!m) return null;
    this.w = this.w.slice(0, m.index) + ' ' + this.w.slice(m.index + m[0].length);
    return m;
  };
  Work.prototype.has = function (re) { return re.test(this.w); };
  Work.prototype.drop = function (re, why) {
    var m, n = 0;
    while ((m = re.exec(this.w))) {
      if (why && /\d/.test(m[0])) this.ign.push(m[0].replace(/^\s+|\s+$/g, ''));
      this.w = this.w.slice(0, m.index) + ' ' + this.w.slice(m.index + m[0].length);
      if (re.global) re.lastIndex = m.index;
      if (++n > 40) break;
    }
    re.lastIndex = 0;
  };

  var IGN = [
    /(?:ГОСТ|ГОСТУ|GOST|ОСТ|СТ\s*СЭВ|[OО]'?\s*Z\s*DST|ОЗДСТ|РСТ\s*УЗ|РСТУЗ|УЗДСТ|ТУ|СНИП|КМК|ШНК)\s*[-№]?\s*[\d.,:\s\/-]*\d(?:\s*-\s*\d+)?/g,
    /(?:СЕР(?:ИИ|ИЯ)?|СЕРИЯ)\.?\s*[А-Я]{0,4}\s*[\d.,\s\/-]*\d[\dА-Я\/.-]*(?:\s*ВЫП\.?\s*\d+)?/g,
    /\(\s*1\s*(?:КОМПЛ?|ШТ)\.?\s*-\s*\d+(?:[.,]\d+)?\s*КГ\s*\)/g,
    /\(\s*\d+\s*-\s*ШТ\s*\)/g,
    /ИН\.?\s*№\s*\d+[-\d]*/g,
    /ОТЧЕТ\s*№\s*\d+/g,
    /\(?\s*(?:НА|ЗА)?\s*(?:^|[^\d,.])1\s*(?:ТН|ТОНН[АУ]|М3)\.?\s*\)?(?=[^А-ЯA-Z0-9]|$)/g,
    /АРХ\.?\s*N?\s*[\d.\-]*\d/g
  ];

  function takeDelivery(wk) {
    var out = [];
    var m;
    wk.take(/\(?\s*САМОВЫВОЗ\s*\)?/);
    if ((m = wk.take(/\(?\s*(?:С\s+)?ДОСТАВК[А-Я]*\s*(?:НА\s*)?(\d+)\s*КМ\s*\)?/))) out.push('ДОСТ' + m[1] + 'КМ');
    if ((m = wk.take(/\(?\s*(?:С\s+)?ДОСТАВК[А-Я]*\s+(?:В\s+ДРУГИЕ\s+РАЙОНЫ|ЗА\s+ПРЕДЕЛАМИ\s+ГОРОДА(?:\s+[А-Я]+)?|ПО\s+ГОРОДУ[А-Я ]*|ПО\s+Г\.?\s*[А-Я]+)\s*\)?/))) out.push(/ДРУГ/.test(m[0]) ? 'ДОСТ-РАЙОН' : /ПРЕДЕЛ/.test(m[0]) ? 'ДОСТ-ЗАГОРОД' : 'ДОСТ-ГОРОД');
    if ((m = wk.take(/\(\s*(?:ЗА\s+ПРЕДЕЛАМИ\s+ГОРОДА|ПО\s+ГОРОДУ)[А-Я ]*\)/))) out.push(/ПРЕДЕЛ/.test(m[0]) ? 'ДОСТ-ЗАГОРОД' : 'ДОСТ-ГОРОД');
    if ((m = wk.take(/\(?\s*С\s+ДОСТАВКОЙ\s*\)?/))) out.push('ДОСТ');
    if ((m = wk.take(/\(\s*Ж\/Д\s*\)/))) out.push('ДОСТ-ЖД');
    var ext = !!wk.take(/\(?\s*ДЛЯ\s+ДРУГИХ\s+ОРГАНИЗАЦИ[ЙИ]\s*\)?/);
    return { dlv: out.join('+') || null, ext: ext };
  }

  var STOP = makeSet([
    'И', 'ИЛИ', 'С', 'В', 'ВО', 'НА', 'ИЗ', 'ПО', 'ДЛЯ', 'ПРИ', 'ОТ', 'ДО', 'К', 'ТИП', 'ТИПА', 'МАРКИ', 'МАРКА', 'МАРКОЙ', 'МАРК',
    'КЛАСС', 'КЛАССА', 'КЛАССОВ', 'ММ', 'М', 'СМ', 'ШТ', 'ГОТОВЫЙ', 'ГОТОВАЯ', 'ГОТОВЫЕ', 'ГОТОВОЕ', 'СТРОИТЕЛЬНЫЙ', 'СТРОИТЕЛЬНАЯ',
    'СТРОИТЕЛЬНЫЕ', 'СТРОИТЕЛЬНЫХ', 'РАБОТ', 'ОБЩЕСТРОИТЕЛЬНОГО', 'ОБЩЕСТРОИТЕЛЬНЫЙ', 'НАЗНАЧЕНИЯ', 'СПЕЦИАЛЬНОГО', 'ПРОЕКТУ', 'ПРОЕКТ',
    'СОСТАВ', 'ПРОЧИЕ', 'МАТЕРИАЛЫ', 'МАТЕРИАЛ', 'ИНЕРТНЫЕ', 'ПРОДУКЦИЯ', 'ИЗДЕЛИЯ', 'ИЗДЕЛИЙ', 'ВКЛ', 'НДС', 'ЦЕНА', 'СОРТА',
    'ТЕХНИЧЕСКАЯ', 'ПРОИЗВОДСТВА', 'ПР-ВО', 'УЗБЕКИСТАН', 'ПЛ', 'ПЛОЩАДКА', 'ФАКТ', 'ТОМ', 'ЧИСЛЕ'
  ]);
  function makeSet(a) { var o = {}; for (var i = 0; i < a.length; i++) o[a[i]] = 1; return o; }

  function residual(wk, known) {
    var toks = wk.w.replace(/(\d),(?=\d)/g, '$1\u0001').replace(/["'()\[\],;:+]/g, ' ').replace(/\u0001/g, ',')
      .replace(/([А-ЯA-Z])\.(?=[А-ЯA-Z])/g, '$1 ').split(/\s+/);
    var out = [], digits = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].replace(/^[-.\/*]+|[-.\/*]+$/g, '');
      if (!t) continue;
      if (/\d/.test(t)) { out.push(t); digits.push(t); continue; }
      if (t.length < 2 || STOP[t]) continue;
      if (known && known.test(t)) continue;
      out.push(t);
    }
    out.sort();
    var uniq = [];
    for (var j = 0; j < out.length; j++) if (!j || out[j] !== out[j - 1]) uniq.push(out[j]);
    digits.sort();
    return { x: uniq.length ? uniq.join(' ') : null, xnum: digits.length ? digits.join(' ') : null };
  }

  function render(kind, schema, f) {
    var parts = [kind];
    for (var i = 0; i < schema.length; i++) {
      var v = f[schema[i][0]];
      if (v === null || v === undefined || v === false || v === '') continue;
      parts.push(schema[i][1] + (v === true ? '' : v));
    }
    return parts.join('|');
  }
  function build(kind, schema, steps, f, attrs) {
    var key = render(kind, schema, f), levels = [], drop = [], cur = clone(f), last = key;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i], label = null;
      if (typeof st === 'function') label = st(cur);
      else if (cur[st[0]] !== null && cur[st[0]] !== undefined && cur[st[0]] !== false && cur[st[0]] !== '') {
        label = typeof st[1] === 'function' ? st[1](cur[st[0]], cur) : st[1] + ' ' + cur[st[0]];
        cur[st[0]] = null;
      }
      if (!label) continue;
      drop.push(label);
      var k = render(kind, schema, cur);
      if (k === last) continue;
      levels.push({ key: k, drop: drop.slice() });
      last = k;
    }
    attrs.kind = kind;
    for (var p in f) if (f.hasOwnProperty(p) && f[p] !== null && f[p] !== undefined && f[p] !== false && !(p in attrs)) attrs[p] = f[p];
    return { family: 'mineral', key: key, attrs: attrs, levels: levels };
  }
  function clone(o) { var c = {}; for (var p in o) if (o.hasOwnProperty(p)) c[p] = o[p]; return c; }

  var CLASS_MARK = {
    '3.5': ['50'], '5': ['75'], '7.5': ['100'], '10': ['150'], '12.5': ['150'], '15': ['200'], '20': ['250'],
    '22.5': ['300'], '25': ['350'], '27.5': ['350'], '30': ['400'], '35': ['450'], '40': ['500', '550'],
    '45': ['600'], '50': ['600', '700'], '55': ['700'], '60': ['800']
  };
  var MARK_CLASS = {};
  (function () {
    for (var c in CLASS_MARK) if (CLASS_MARK.hasOwnProperty(c)) for (var i = 0; i < CLASS_MARK[c].length; i++) {
      var m = CLASS_MARK[c][i];
      (MARK_CLASS[m] || (MARK_CLASS[m] = [])).push(c);
    }
  })();

  function strength(cls, mark) {
    if (cls && !CLASS_MARK[cls] && mark) return { s: 'B' + cls + '/M' + mark, cls: cls, mark: mark, bad: true };
    if (cls && mark) {
      var ok = CLASS_MARK[cls] && CLASS_MARK[cls].indexOf(mark) >= 0;
      if (!ok) return { s: 'B' + cls + '/M' + mark, cls: cls, mark: mark, bad: true };
      return { s: 'B' + cls + (CLASS_MARK[cls].length > 1 ? 'M' + mark : ''), cls: cls, mark: mark };
    }
    if (cls) return { s: 'B' + cls, cls: cls, mark: null };
    if (mark) {
      var cs = MARK_CLASS[mark];
      if (cs && cs.length === 1 && CLASS_MARK[cs[0]].length === 1) return { s: 'B' + cs[0], cls: cs[0], mark: mark, cls_from_mark: true };
      return { s: 'M' + mark, cls: null, mark: mark };
    }
    return null;
  }
  function strengthCompatible(a, b) {
    if (a.s === b.s) return true;
    if (a.bad || b.bad) return false;
    if (a.cls && b.cls && !a.cls_from_mark && !b.cls_from_mark) return a.cls === b.cls && (!a.mark || !b.mark || a.mark === b.mark);
    var ma = a.mark || (a.cls && CLASS_MARK[a.cls].length === 1 ? CLASS_MARK[a.cls][0] : null);
    var mb = b.mark || (b.cls && CLASS_MARK[b.cls].length === 1 ? CLASS_MARK[b.cls][0] : null);
    if (ma && mb) return ma === mb && (!a.cls || !b.cls || a.cls === b.cls || a.cls_from_mark || b.cls_from_mark);
    if (ma && b.cls) return CLASS_MARK[b.cls].indexOf(ma) >= 0;
    if (mb && a.cls) return CLASS_MARK[a.cls].indexOf(mb) >= 0;
    return false;
  }

  var CONC_KNOWN = /^(БЕТОН[А-Я]*|СМЕС[А-Я]*|ТЯЖЕЛ[А-Я]*|БСТ|БСЛ|БСМ|ТОВАРН[А-Я]*|МОНОЛИТН[А-Я]*|КЛАСС[А-Я]*|ФРАКЦИ[А-Я]*|ФР|МАРК[А-Я]*|ЦЕМЕНТ[А-Я]*|СУЛЬФАТ[А-Я]*|МОРОЗОСТОЙК[А-Я]*|ВОДОНЕПРОНИЦАЕМ[А-Я]*|МПА|БОЛЕЕ|СВЫШЕ|ЦВЕТА|ТЕЛЕ|ПЛОТНОМ|ПОРИСТОМ|МИКСЕРН[А-Я]*|ТЯЖЕЛОГО|ЖЕСТК[А-Я]*|МАЛОЦЕМЕНТН[А-Я]*|ТОЩ[А-Я]*|УКАТЫВАЕМ[А-Я]*|ДОРОЖН[А-Я]*|ГИДРОТЕХНИЧЕСК[А-Я]*|МЕЛКОЗЕРНИСТ[А-Я]*|ПЕСКОБЕТОН[А-Я]*|ОБРАБОТАНН[А-Я]*|ЦЕМЕНТОМ|ЛЕГК[А-Я]*|БЕТОНОНАСОС[А-Я]*|ОК)$/;

  function parseConc(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    if (wk.take(/МИКСЕРН\S*/)) f.dlv = (f.dlv ? f.dlv + '+' : '') + 'МИКСЕР';
    if (wk.has(/ПОЛИМЕРБЕТОН/)) f.t = 'ПОЛИМ';
    else if (wk.has(/ЖЕСТК|ТОЩ|МАЛОЦЕМЕНТ|УКАТЫВ|ОБРАБОТАНН\S*\s+ЦЕМЕНТ/)) f.t = 'ТОЩ';
    else if (wk.has(/ПЕСКОБЕТОН|МЕЛКОЗЕРНИСТ/)) f.t = 'МЕЛК';
    else if (wk.has(/ЛЕГК[ИО]|КЕРАМЗИТОБЕТОН|(?:^|[^А-Я])БСЛ/)) f.t = 'ЛЕГ';
    else f.t = 'ТЯЖ';
    if (wk.has(/ОБРАБОТАНН/)) f.base = wk.has(W('ГПС|ПГС')) ? 'ГПС' : wk.has(/ЩПС|ПЩС|ЩЕБЕНОЧНО-ПЕСЧ/) ? 'ЩПС' : null;
    wk.drop(/ГПС|ПГС|ЩЕБЕНОЧНО-ПЕСЧАН\S*|ЩПС|ПЩС|СМЕСЬ\s*,?\s*ОБРАБОТАНН\S*|ОБРАБОТАНН\S*/g);
    f.sr = wk.has(/СУЛЬФАТ[ОА]СТОЙК|С\/С\s*ЦЕМЕНТ|ССПЦ/) || wk.has(WE('СС')) ? true : null;
    wk.drop(/(?:НА\s+)?(?:СУЛЬФАТ[ОА]СТОЙК\S*|С\/С)(?:\s+ЦЕМЕНТ\S*)?/g);
    if ((m = wk.take(/В\s*ТВ\s*-?\s*(\d+(?:[.,]\d+)?)/))) f.btb = num(m[1]);
    if ((m = wk.take(/ОК\.?\s*(\d+)\s*-\s*(\d+)/))) f.ok = m[1] + '-' + m[2];
    if ((m = wk.take(/(?:^|[^А-ЯA-Z])П\s*-?\s*([1-5])(?![\d,.])/))) f.pk = 'П' + m[1];
    if ((m = wk.take(/(?:^|[^А-ЯA-Z])F\s*-?\s*(\d{2,3})(?![\d])/))) f.fr_ = num(m[1]);
    else if ((m = wk.take(/МОРОЗОСТОЙК\S*\s+(\d{2,3})(?![\d.,])/))) f.fr_ = num(m[1]);
    if ((m = wk.take(/(?:^|[^А-ЯA-Z])W\s*-?\s*(\d{1,2})(?![\d])/))) f.w = num(m[1]);
    else if ((m = wk.take(/ВОДОНЕПРОНИЦАЕМ\S*\s*(\d+[.,]\d+)\s*МПА/))) f.w = String(Math.round(parseFloat(num(m[1])) * 10));
    if ((m = wk.take(/ФРАКЦИ[ЯИ]\s*,?\s*(?:ММ\s*:?)?\s*(БОЛЕЕ|СВЫШЕ)\s*(\d+)\s*(?:ММ)?/))) f.fra = '>' + m[2];
    else if ((m = wk.take(/(?:ФРАКЦИ[ЯИ]|ФР\.?)\s*,?\s*(?:ММ\s*:?)?\s*(\d+(?:[.,]\d+)?)\s*[-Х]\s*(\d+(?:[.,]\d+)?)\s*(?:ММ)?/))) f.fra = num(m[1]) + '-' + num(m[2]);
    if ((m = wk.take(/(КРАСН|ЖЕЛТ|СЕР|ЧЕРН|БЕЛ|ЗЕЛЕН|КОРИЧН)[А-Я]*\s+ЦВЕТА|ЦВЕТН[А-Я]*/))) f.color = (m[1] || 'ЦВ');
    if ((m = wk.take(/В\s+(ПЛОТНОМ|ПОРИСТОМ)\s+ТЕЛЕ/))) f.telo = m[1] === 'ПЛОТНОМ' ? 'ПЛ' : 'ПОР';
    wk.drop(/\(?\s*В\s+(?:ПЛОТНОМ|ПОРИСТОМ)\s+ТЕЛЕ\s*\)?/g);
    if (wk.take(/ДЛЯ\s+БЕТОНОНАСОСА|ДЛЯ\s+НАСОСА/)) f.pump = true;
    if (wk.has(/ДОРОЖН/)) f.q = 'ДОР'; else if (wk.has(/ГИДРОТЕХН/)) f.q = 'ГТ';
    var cls = null, mark = null;
    if ((m = wk.take(/(?:КЛАСС[А-Я]*\s*)?(?:^|[^А-ЯA-Z])[В]\s*-?\s*(\d{1,2}(?:[.,]\d)?)(?![\d.,]*\s*МПА)(?![\d])/))) cls = num(m[1]);
    if ((m = wk.take(/(?:^|[^А-ЯA-Z])(?:Б?М|МАРК[А-Я]*\s*М?)\s*[-.:]?\s*(\d{2,3})(?![\d])(?:\s*\(\s*(\d{1,2}(?:[.,]\d)?)\s*\))?/))) {
      mark = m[1];
      if (!cls && m[2]) cls = num(m[2]);
    } else if ((m = wk.take(/ТОВАРН\S*\s+(\d{2,3})(?![\d])/))) mark = m[1];
    if (!cls && (m = wk.take(/\(\s*[В]\s*-?\s*(\d{1,2}(?:[.,]\d)?)\s*\)/))) cls = num(m[1]);
    if (!cls && (m = wk.take(/(?:^|[^А-Я])БС[ТЛ]\s*-?\s*(\d{1,2}(?:[.,]\d)?)(?![\d])/))) cls = num(m[1]);
    if (mark) wk.drop(new RegExp('(?:^|[^А-ЯA-Z])(?:Б?М|МАРК[А-Я]*\\s*М?)\\s*[-.:]?\\s*' + mark + '(?![\\d])', 'g'));
    var st = strength(cls, mark);
    f.s = st ? st.s : null;
    if (st) { a.cls = st.cls; a.mark = st.mark; if (st.bad) a.strength_conflict = true; if (st.cls_from_mark) a.cls_from_mark = true; }
    a.st = st;
    wk.drop(/КЛАСС[А-Я]*|МАРК[А-Я]*|ПО\s+ПРОЕКТУ/g);
    var r = residual(wk, CONC_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['t', ''], ['base', ''], ['sr', 'СС'], ['s', ''], ['btb', 'ВТВ'], ['fra', 'ФР'], ['fr_', 'F'], ['w', 'W'], ['ok', 'ОК'], ['pk', ''],
      ['telo', 'ТЕЛО'], ['color', 'ЦВ:'], ['q', ''], ['pump', 'НАСОС'], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }],
      ['pump', function () { return 'для бетононасоса'; }], ['color', 'цвет'], ['ok', 'подвижность ОК'], ['pk', 'подвижность'], ['telo', function (v) { return 'в ' + (v === 'ПЛ' ? 'плотном' : 'пористом') + ' теле'; }],
      ['w', 'W'], ['fr_', 'F'], ['q', function (v) { return v === 'ДОР' ? 'дорожный' : 'гидротехнический'; }], ['fra', 'фракция'],
      function (c) {
        if (!c.s || !st || !st.mark || !st.cls || st.cls_from_mark || c.s === 'B' + st.cls) return null;
        c.s = 'B' + st.cls; return 'марка М' + st.mark + (st.bad ? ' (не по таблице класс↔марка)' : '');
      },
      function (c) {
        if (!c.s || !st || !st.cls) return null;
        var mk = st.mark || (CLASS_MARK[st.cls] && CLASS_MARK[st.cls].length === 1 ? CLASS_MARK[st.cls][0] : null);
        if (!mk || !MARK_CLASS[mk] || MARK_CLASS[mk].length < 2) return null;
        c.s = 'M' + mk; return 'класс В' + st.cls + ' → марка М' + mk + ' (по таблице)';
      },
      ['s', function (v) { return 'класс/марка ' + v.replace(/^B/, 'В').replace(/M/g, 'М'); }]];
    return build('CONC', schema, steps, f, a);
  }

  var MORT_KNOWN = /^(РАСТВОР[А-Я]*|ТЯЖЕЛ[А-Я]*|ГОТОВ[А-Я]*|СМЕС[А-Я]*|МАРК[А-Я]*|ЦЕМЕНТН[А-Я]*|ИЗВЕСТКОВ[А-Я]*|КЛАДОЧН[А-Я]*|ОТДЕЛОЧН[А-Я]*|СУХ[А-Я]*|РАСТВОРН[А-Я]*|ПЕСКОЦЕМЕНТН[А-Я]*|ПЕСЧАН[А-Я]*|ЦЕМЕН?ТНО|ПЕСКО|ЦЕМЕНТНЫЙ|МОНТАЖН[А-Я]*)$/;

  function parseMort(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    if (wk.has(/АСБО?ЦЕМЕНТ|АСБЕСТОЦЕМЕНТ/)) f.b = 'АЦ';
    else if (wk.has(/ЦЕМЕНТНО-ИЗВЕСТК|ИЗВЕСТКОВО-ЦЕМЕНТ/)) f.b = 'ЦИ';
    else if (wk.has(/ЦЕМЕНТНО-ГЛИН/)) f.b = 'ЦГ';
    else if (wk.has(/ИЗВЕСТК/)) f.b = 'И';
    else if (wk.has(/ГИПС/)) f.b = 'Г';
    else if (wk.has(/ЦЕМЕН?Т|ПЕСКО-?ЦЕМЕНТ/)) f.b = 'Ц';
    wk.drop(/АСБО?ЦЕМЕНТН\S*|АСБЕСТОЦЕМЕНТН\S*|ЦЕМЕНТНО-ИЗВЕСТКОВ\S*|ИЗВЕСТКОВО-ЦЕМЕНТН\S*|ЦЕМЕНТНО-ГЛИНЯН\S*|ИЗВЕСТКОВ\S*|ГИПСОВ\S*/g);
    if (wk.has(/ПЕСКО-?ЦЕМЕНТН|ЦЕМЕН?Т?НО-ПЕСЧ|ЦЕМЕНО-ПЕСЧ/)) { f.cps = true; f.b = f.b || 'Ц'; }
    wk.drop(/ПЕСКО-?ЦЕМЕНТН\S*|ЦЕМЕН?Т?НО-ПЕСЧ\S*|ЦЕМЕНО-ПЕСЧ\S*/g);
    if (wk.has(/СУХ(?:АЯ|ИЕ|ОЙ)/)) f.dry = true;
    if (wk.has(/КЛАДОЧН/)) f.p = 'КЛ'; else if (wk.has(/ОТДЕЛОЧН|ШТУКАТУР/)) f.p = 'ОТД'; else if (wk.has(/МОНТАЖН/)) f.p = 'МОНТ';
    wk.drop(/КЛАДОЧН\S*|ОТДЕЛОЧН\S*|ШТУКАТУРН\S*|МОНТАЖН\S*/g);
    if ((m = wk.take(/(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)(?:\s*:\s*(\d+(?:[.,]\d+)?))?/))) f.g = num(m[1]) + ':' + num(m[2]) + (m[3] ? ':' + num(m[3]) : '');
    else if ((m = wk.take(/(?:^|[^А-ЯA-Z])(?:М|МАРК[А-Я]*\s*:?\s*М?)\s*[-.:]?\s*(\d{1,3})(?![\d])/))) f.g = 'M' + m[1];
    wk.drop(/МАРК[А-Я]*|ПО\s+ПРОЕКТУ/g);
    var r = residual(wk, MORT_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['b', ''], ['g', ''], ['p', ''], ['cps', 'ЦПС'], ['dry', 'СУХ'], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }],
      ['dry', function () { return 'сухая смесь'; }], ['cps', function () { return 'пескоцементная смесь'; }],
      ['p', function (v) { return { 'КЛ': 'кладочный', 'ОТД': 'отделочный', 'МОНТ': 'монтажный' }[v]; }],
      function (c) { if (c.b !== 'Ц') return null; c.b = null; return 'вяжущее: цементный'; },
      ['g', function (v) { return 'марка/состав ' + v.replace('M', 'М'); }]];
    return build('MORT', schema, steps, f, a);
  }

  var ROMAN = { '1': 'I', '2': 'II', '3': 'III', 'I': 'I', 'II': 'II', 'III': 'III', 'П': 'II', 'Ш': 'III' };
  var ASPH_KNOWN = /^(АСФАЛЬТ[А-Я]*|АСФАЛЬТО-БЕТОНН[А-Я]*|АСФАЛЬТБЕТОН[А-Я]*|СМЕС[А-Я]*|ГОРЯЧ[А-Я]*|ЩЕБЕНОЧН[А-Я]*|ЩЕБ[ЕЁ]НОЧН[А-Я]*|МАРК[А-Я]*|ТИП[А-Я]*|ДОРОЖН[А-Я]*|ДОБАВК[А-Я]*|ПОЛИМЕР[А-Я]*|ВЯЖУЩ[А-Я]*|БИТУМН[А-Я]*|МАКСИМАЛЬН[А-Я]*|РАЗМЕР[А-Я]*|ЗЕР[ЕН]*|ЗЕРН|МАСТИЧН[А-Я]*|ЩЕБЕНОЧНО-МАСТИЧН[А-Я]*|ПРИМЕНЕНИЕМ|МОДИФИЦИРОВАНН[А-Я]*|БИТУМА|МИНЕРАЛЬН[А-Я]*|ПОРОШК[А-Я]*|ВЕРХН[А-Я]*|СЛО[ЯЙ]|ПОКРЫТИ[ЙЯ]|ТЕПЛ[А-Я]*|КАЧЕСТВ[А-Я]*)$/;

  function parseAsph(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    if ((m = wk.take(/(?:^|[^А-Я0-9])А\s?(\d{2})\s?(НТ|ОТ|ВН|ВТ|НН|ОН|ВЧ)(?=[^А-Я]|$)/))) { f.k = 'SP'; f.sp = 'А' + m[1] + m[2]; }
    wk.drop(/(?:РЕЦЕПТ\S*\s*)?№\s*\d+(?![\d\/])/g, true);
    if ((m = wk.take(/(П?)ЩМА\s*-?\s*(\d{1,2})?(?![\d])/))) {
      if (m[2]) wk.drop(new RegExp('\\(?\\s*П?ЩМА\\s*-?\\s*' + m[2] + '(?![\\d])\\s*\\)?', 'g'));
      f.k = 'ЩМА'; f.shma = m[2] || null; if (m[1]) f.poly = 'П';
    } else if (wk.has(/ЩЕБЕНОЧНО-МАСТИЧН/)) f.k = 'ЩМА';
    wk.drop(/ЩЕБЕНОЧНО-МАСТИЧН\S*/g);
    if (wk.has(/ЛИТ(ОЙ|АЯ)/)) f.k = 'ЛИТ';
    if (!f.k) f.k = 'АБ';
    if (wk.has(/ХОЛОДН/)) f.temp = 'Х'; else if (wk.has(/ТЕПЛ(АЯ|ЫЕ|ОЙ)/) && !wk.has(/ГОРЯЧ/)) f.temp = 'Т';
    if (wk.has(/ГРАВИЙН/)) f.mix = 'ГРАВ';
    if (wk.has(/ПЕСЧАН/)) f.gr = 'П';
    else if (wk.has(/КРУПНОЗЕРНИСТ/)) f.gr = 'К';
    else if (wk.has(/МЕЛКОЗЕРНИСТ/)) f.gr = 'М';
    var vp = wk.has(/В[ЫИ]СОК\S*\s*-?\s*ПО?Р[ИЫ]СТ|ВЫСОКОПО?ПОР[ИЫ]СТ|ВЫСОКО-ПОР/), pl = wk.has(/ПЛОТН/), pr = wk.has(/ПОР[ИЫ]СТ/);
    if (vp) f.dn = 'ВПОР'; else if (pl && pr) f.dn = 'ПЛ/ПОР'; else if (pr) f.dn = 'ПОР'; else if (pl) f.dn = wk.has(/ВЫСОКОПЛОТН/) ? 'ВПЛ' : 'ПЛ';
    wk.drop(/В[ЫИ]СОК\S*\s*-?\s*ПО?Р[ИЫ]СТ\S*|ВЫСОКОПО?ПОР[ИЫ]СТ\S*|ПОР[ИЫ]СТ\S*|ВЫСОКОПЛОТН\S*|ПЛОТН\S*|ПЕСЧАН\S*|КРУПНОЗЕРНИСТ\S*|МЕЛКОЗЕРНИСТ\S*|ХОЛОДН\S*|ГОРЯЧ\S*|ТЕПЛ(?:АЯ|ЫЕ|ОЙ)|ГРАВИЙН\S*|ЛИТ(?:ОЙ|АЯ)/g);
    if ((m = wk.take(/(?:^|[^А-Я])ТИП(?:А|Е)?\s*[-"']?\s*([АБВГД])(?=[^А-Я]|$)/)) || (m = wk.take(/(?:^|[^А-Я])([АБВГД])\s*-?\s*ТИП(?=[^А-Я]|$)/))) f.ty = m[1];
    if ((m = wk.take(/(?:МАРК[А-Я]*|МАР\.|(?:^|[^А-Я])М)\s*[-.]?\s*(III|II|I|Ш|П|[123])(?![\dА-ЯA-Z])/))) f.mk = ROMAN[m[1]];
    else if ((m = wk.take(/(?:^|[^А-Я0-9])М\s*КА\s*([123])(?![\d])/))) f.mk = ROMAN[m[1]];
    if (wk.has(/SBS/)) f.poly = 'SBS';
    else if (wk.has(/ПОЛИМЕР|МОДИФИЦИР/)) f.poly = f.poly || 'П';
    wk.drop(/SBS|С\s+ПОЛИМЕР\S*(?:\s+ДОБАВК\S*)?|ПОЛИМЕРНО-ДИСПЕРСНО-АРМИРОВАНН\S*|ПОЛИМЕРН\S*|ПОЛИМЕР\S*|МОДИФИЦИРОВАНН\S*/g);
    if (wk.take(/С\s+МИНЕРАЛЬН\S*\s+ПОРОШК\S*/)) f.mp = true;
    if (wk.take(/\(?\s*(?:ТРОТУАР|ТРАТУАР)\S*\s*\)?/)) f.use = 'ТРОТ';
    if ((m = wk.take(/(БНД|БН|БМП|ВМР|ПМБ|ПБВ)\s*-?\s*(\d{2,3})\s*\/\s*(\d{2,3})/))) f.bnd = (m[1] === 'ВМР' ? 'БМП' : m[1]) + m[2] + '/' + m[3];
    if ((m = wk.take(/(?:МАКСИМАЛЬН\S*\s+РАЗМЕР\S*\s+ЗЕР\S*|РАЗМЕР\S*\s+ЗЕР\S*)\s*(\d+(?:[.,]\d+)?)\s*ММ/))) {
      f.mx = num(m[1]);
      if (!f.gr && f.k === 'АБ') f.gr = parseFloat(f.mx) <= 20 ? 'М' : 'К';
    }
    if (f.ty && !f.dn && f.k === 'АБ') { f.dn = 'ПЛ'; a.dn_from_type = true; }
    if (f.ty && !f.gr && f.k === 'АБ' && (f.ty === 'Г' || f.ty === 'Д')) { f.gr = 'П'; a.gr_from_type = true; }
    wk.drop(/ТИП(?:А|Е)?|МАРК[А-Я]*/g);
    var r = residual(wk, ASPH_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['k', ''], ['sp', ''], ['shma', ''], ['temp', 'T:'], ['mix', ''], ['gr', 'З:'], ['dn', ''], ['ty', 'ТИП'], ['mk', 'М'],
      ['poly', 'ПОЛ:'], ['mp', 'МП'], ['bnd', ''], ['mx', 'D'], ['use', ''], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }], ['use', function () { return 'тротуарная'; }], ['bnd', 'вяжущее'],
      ['mx', 'макс. зерно, мм'], ['mp', function () { return 'с минеральным порошком'; }], ['poly', function (v) { return v === 'SBS' ? 'с полимером SBS' : 'с полимером'; }],
      ['mix', function () { return 'гравийная'; }], ['mk', 'марка'], ['ty', 'тип'], ['dn', function (v) { return { 'ПЛ': 'плотная', 'ПОР': 'пористая', 'ВПОР': 'высокопористая', 'ВПЛ': 'высокоплотная', 'ПЛ/ПОР': 'плотная/пористая' }[v]; }],
      ['gr', function (v) { return { 'К': 'крупнозернистая', 'М': 'мелкозернистая', 'П': 'песчаная' }[v]; }], ['shma', 'ЩМА-']];
    return build('ASPH', schema, steps, f, a);
  }

  var PEN_CLASSES = { 'БНД': 1, 'БНК': 1, 'БМД': 1, 'ПМБ': 1, 'ПБВ': 1, 'БМП': 1, 'МГ': 1, 'СГ': 1, 'МГО': 1, 'СГО': 1, '?': 1 };
  var BIT_KNOWN = /^(БИТУМ[А-Я]*|БИТУМНО-ПОЛИМЕРН[А-Я]*|ГОССИПОЛ[А-Я]*|НЕФТЯН[А-Я]*|ДОРОЖН[А-Я]*|СТРОИТЕЛЬН[А-Я]*|КРОВЕЛЬН[А-Я]*|ИЗОЛЯЦИОНН[А-Я]*|ВЯЗК[А-Я]*|ЖИДК[А-Я]*|ЖИДКИМ|РАЗЖИЖЕНН[А-Я]*|СОРТ[А-Я]*|ПЕРВЫЙ|ВТОРОЙ|ВЫСШИЙ|МОДИФИЦИРОВАНН[А-Я]*|ПОЛИМЕРН[А-Я]*|МАСТИК|МАРК[А-Я]*|КЛАСС|ВЯЖУЩ[А-Я]*)$/;

  function parseBit(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv;
    if (wk.has(/ГОССИПОЛ/)) f.c = 'ГОССИП';
    if (wk.has(/ДОРОЖН/)) f.dom = 'ДОР'; else if (wk.has(/КРОВЕЛЬН/)) f.dom = 'КРОВ'; else if (wk.has(/ИЗОЛЯЦИОН/)) f.dom = 'ИЗОЛ'; else if (wk.has(/СТРОИТЕЛЬН/)) f.dom = 'СТР';
    if ((m = wk.take(/РБ\s*-?\s*([123])(?![\d])/))) { f.c = 'РБ'; f.g = m[1]; }
    else if ((m = wk.take(/(БНД|БНК|БНМ|БМД|ПМБ|ПБВ|БМП|МГО|СГО|БН|МГ|СГ)\s*-?\s*(\d{2,3})\s*\/\s*(\d{1,3})/))) { f.c = m[1]; f.g = m[2] + '/' + m[3]; }
    else if ((m = wk.take(/БНИ\s*-?\s*((?:IV-3|IV|V|I)(?:\s*,\s*БНИ\s*-?\s*(?:IV-3|IV|V))*)/))) { f.c = 'БНИ'; f.g = m[1].replace(/БНИ\s*-?\s*/g, '').replace(/\s+/g, ''); }
    else if ((m = wk.take(/(?:^|[^А-Я])(МГ|СГ|МГО)\s+И\s+(МГ|СГ|МГО)(?=[^А-Я]|$)/))) f.c = m[1] + '/' + m[2];
    else if ((m = wk.take(/(?:^|[^А-Я])(МГО|СГО|МГ|СГ|БНД|БН)(?=[^А-Я]|$)/))) f.c = m[1];
    if (!f.g && (m = wk.take(/(\d{2,3})\s*\/\s*(\d{1,3})/))) f.g = m[1] + '/' + m[2];
    if (f.g && /^\d+\/\d+$/.test(f.g) && PEN_CLASSES[f.c || '?'] && (f.c || f.dom === 'ДОР')) {
      var p = f.g.split('/');
      if (+p[0] > +p[1]) { f.g = p[1] + '/' + p[0]; a.grade_reversed = true; }
    }
    if (/^(МГ|СГ|МГО|СГО|РБ)/.test(f.c || '') || wk.has(/ЖИДК|РАЗЖИЖЕН/)) f.st = 'Ж';
    else if (f.g && /^\d+\/\d+$/.test(f.g)) f.st = 'В';
    else if (/^(БНД|БН|БНК|БНИ|БНМ|БМД|ПМБ|ПБВ|БМП)/.test(f.c || '') || wk.has(/ВЯЗК/)) f.st = 'В';
    if (wk.has(/ПОЛИМЕРН|МОДИФИЦИР/) && !f.c) f.c = 'ПМБ?';
    if ((m = wk.take(/(ПЕРВЫЙ|ВТОРОЙ|ВЫСШИЙ|1|2)\s*СОРТ/))) f.sort = m[1] === 'ПЕРВЫЙ' ? '1' : m[1] === 'ВТОРОЙ' ? '2' : m[1] === 'ВЫСШИЙ' ? 'В' : m[1];
    wk.drop(/(?:БНИ|БНД|БНК|БНМ|БМД|ПМБ|ПБВ|БМП|МГО|СГО|БН|МГ|СГ|РБ)(?=[^А-Я]|$)/g);
    var r = residual(wk, BIT_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['st', ''], ['dom', ''], ['c', ''], ['g', ''], ['sort', 'СОРТ'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['sort', 'сорт'], ['dom', function (v) { return { 'ДОР': 'дорожный', 'СТР': 'строительный', 'КРОВ': 'кровельный', 'ИЗОЛ': 'изоляционный' }[v]; }],
      ['c', 'марка'], ['g', 'марка'], ['st', function (v) { return v === 'Ж' ? 'жидкий' : 'вязкий'; }]];
    return build('BIT', schema, steps, f, a);
  }

  var BEM_KNOWN = /^(ЭМУЛЬСИ[А-Я]*|БИТУМН[А-Я]*|БИТУМНО-ДОРОЖН[А-Я]*|ДОРОЖН[А-Я]*|КАТИОНН[А-Я]*|АНИОНН[А-Я]*|МАРК[А-Я]*|КЛАСС[А-Я]*|БИТУМ)$/;
  function parseBem(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv;
    if ((m = wk.take(/ЭБ([АК])\s*-?\s*([123])?(?![\d])/))) { f.ch = m[1]; f.cl = m[2] || null; }
    if (!f.ch) { if (wk.has(/КАТИОН/)) f.ch = 'К'; else if (wk.has(/АНИОН/)) f.ch = 'А'; }
    if (!f.cl && (m = wk.take(/КЛАСС[А-Я]*\s*([123])(?![\d])/))) f.cl = m[1];
    wk.drop(/КАТИОНН\S*|АНИОНН\S*|КАТИОННЫЙ/g);
    var r = residual(wk, BEM_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['ch', ''], ['cl', ''], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['cl', 'класс'], ['ch', function (v) { return v === 'К' ? 'катионная' : 'анионная'; }]];
    return build('BEM', schema, steps, f, a);
  }

  var CEM_MARK_CLASS = { '300': '22.5', '400': '32.5', '500': '42.5', '550': '52.5', '600': '52.5' };
  var CEM_KNOWN = /^(ПОРТЛАНДЦЕМЕНТ[А-Я]*|ЦЕМЕНТ[А-Я]*|ОБЩЕСТРОИТЕЛЬН[А-Я]*|СПЕЦИАЛЬН[А-Я]*|НАЗНАЧЕНИЯ|БЕЗДОБАВОЧН[А-Я]*|СУЛЬФАТОСТОЙК[А-Я]*|МЕШК[А-Я]*|МЕШКАХ|НАВАЛ|НАВАЛОМ|МАРК[А-Я]*|КЛАСС[А-Я]*|ПЦ|ЦЕМ|КЛ|ПУЦЦОЛАНОВ[А-Я]*|ТАМПОНАЖН[А-Я]*|БЕЛ[А-Я]*|ПОРТЛАНДЦЕМЕНТН[А-Я]*|КЛИНКЕР[А-Я]*|ШЛАКОПОРТЛАНДЦЕМЕНТ[А-Я]*|УПАКОВК[А-Я]*|БИГ-?БЕГ[А-Я]*|ТАР[А-Я]*)$/;
  function parseCem(t) {
    t = t.replace(/(^|[^A-ZА-Я])(I{1,3}|IV|V)\s*\/?\s*([ABАВ])(?=\s*-)/g, function (x, p, r, l) { return p + r + '/' + (l === 'A' || l === 'А' ? 'А' : 'В'); })
      .replace(/\(\s*N-LI\s*\)/g, ' ');
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv;
    if ((m = wk.take(/\(?\s*(?:В\s+)?(МЕШК[А-Я]*|НАВАЛ[А-Я]*|БИГ-?БЕГ[А-Я]*)\s*(?:ПО\s*(\d+)\s*КГ)?\s*\)?/))) f.pk = /НАВАЛ/.test(m[1]) ? 'НАВ' : /БИГ/.test(m[1]) ? 'БИГ' : 'МЕШ' + (m[2] || '');
    if (wk.has(/КЛИНКЕР/)) f.k = 'КЛИНКЕР';
    else if (wk.has(/ГИПСОГЛИНОЗЕМ/)) f.k = 'ГГРЦ';
    else if (wk.has(/ГЛИНОЗЕМ/)) f.k = 'ГЦ';
    else if (wk.has(/ШЛАКОПОРТЛАНД|ШПЦ/)) f.k = 'ШПЦ';
    else if (wk.has(/ПУЦЦОЛАН|ППЦ/)) f.k = 'ППЦ';
    else if (wk.has(/БЕЛЫЙ|ПЦБ|(?:^|[^A-Z])OPS(?=[^A-Z]|$)/)) f.k = 'ПЦБ';
    else if (wk.has(/ТАМПОНАЖ|ПЦТ/)) f.k = 'ПЦТ';
    else if (wk.has(/НАПРЯГАЮЩ|НЦ-/)) f.k = 'НЦ';
    else if (wk.has(/ПОРТЛАНД|(?:^|[^А-Я])ПЦ|(?:^|[^А-Я])ЦЕМ\s+[IV]/)) f.k = 'ПЦ';
    else f.k = 'Ц';
    f.sr = wk.has(WE('СС')) || wk.has(/СУЛЬФАТОСТОЙК|ССПЦ|СУЛЬФАТОСТ/) ? true : null;
    wk.drop(/ССПЦ|СУЛЬФАТОСТОЙК\S*|ГИПСОГЛИНОЗЕМИСТ\S*|ГЛИНОЗЕМИСТ\S*|РАСШИРЯЮЩ\S*|ПУЦЦОЛАНОВ\S*|ТАМПОНАЖН\S*|НАПРЯГАЮЩ\S*|БЕЛЫЙ/g);
    wk.drop(/(?:^|[^А-Я])СС(?=[^А-Я]|$)/g);
    if ((m = wk.take(/(?:ПЦБ|OPS|ПЦТ)\s*(I{1,3})-(\d{1,3})(?:\s*-?\s*(\d{3})(?=\s*[\/\s]|$))?/))) { f.code = m[1] + '-' + m[2]; if (m[3]) f.m = m[3]; }
    if ((m = wk.take(/(22|32|42|52)[.,]5\s*([НБ])?(?![А-Я\d])/))) { f.c = m[1] + '.5'; f.rt = m[2] || null; }
    if ((m = wk.take(/(?:М|МАРК[А-Я]*|ПЦ|ССПЦ)\s*[-.:]?\s*(300|400|500|550|600)(?![\d])/)) || (m = wk.take(/(?:^|[^\d\/])(300|400|500|550|600)(?=\s*\/|\s+КЛ|\s|$)/))) f.m = f.m || m[1];
    if (f.m) wk.drop(new RegExp('(?:^|[^\\d,.])' + f.m + '(?![\\d,.])', 'g'));
    if ((m = wk.take(/Д\s*-?\s*(0|5|20)(?![\d])/))) f.ty = 'Д' + m[1];
    else if (wk.has(/БЕЗДОБАВОЧН/)) f.ty = 'Д0';
    else if ((m = wk.take(/(?:^|[^А-Я])ПЦ\s+0(?![\d,.])/))) f.ty = 'Д0';
    if ((m = wk.take(/(?:^|[^А-ЯA-Z])(?:ПЦ|ЦЕМ)?\s*(I{1,3}|IV|V)?\s*\/?\s*([АВ])\s*-\s*(СЛ|МК|[КПШИЗГТ])(?:\s*[-(]?\s*((?:[КПШИЗГТ]\s*-\s*)+[КПШИЗГТ])\s*\)?)?(?=[^А-Я]|$)/))) {
      f.ty = f.ty || (m[1] || 'II'); f.sub = m[2];
      f.ad = m[3] + (m[4] ? '(' + m[4].replace(/\s+/g, '').split('-').sort().join('-') + ')' : '');
    } else if ((m = wk.take(/(?:^|[^А-ЯA-Z])(?:ПЦ|ЦЕМ)?\s*(I{1,3}|IV|V)\s+([КПШИЗ])\s*-(?=\s|\d|$)/))) { f.ty = m[1]; f.ad = m[2]; }
    else if ((m = wk.take(/(?:^|[^А-ЯA-Z])(?:ПЦ|ЦЕМ)?\s*(I{1,3}|IV|V)(?=[^А-ЯA-Z]|$)/))) f.ty = f.ty || m[1];
    if (f.ty === 'Д0') { f.ty = 'I'; a.type_from = 'Д0'; }
    wk.drop(/(?:^|[^А-Я])(?:ПЦ|ЦЕМ|КЛ)(?=[^А-Я]|$)/g);
    var r = residual(wk, CEM_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['k', ''], ['sr', 'СС'], ['code', ''], ['ty', ''], ['sub', '/'], ['ad', '-'], ['c', ''], ['rt', ''], ['m', 'М'], ['pk', ''], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['pk', function (v) { return v === 'НАВ' ? 'навалом' : 'в мешках'; }],
      function (c) { if (c.c && c.m) { var v = c.m; c.m = null; return 'марка М' + v; } return null; },
      ['rt', function (v) { return v === 'Б' ? 'быстротвердеющий' : 'нормальнотвердеющий'; }],
      function (c) { if (!c.c && c.m && CEM_MARK_CLASS[c.m]) { var v = c.m; c.c = CEM_MARK_CLASS[v]; c.m = null; return 'марка М' + v + ' → класс ' + c.c.replace('.', ',') + ' (по таблице)'; } return null; },
      ['ad', 'добавка'], ['sub', 'подтип'], ['ty', 'тип'],
      ['c', 'класс прочности'], ['m', 'марка']];
    return build('CEM', schema, steps, f, a);
  }

  var LIME_KNOWN = /^(ИЗВЕСТЬ|ИЗВЕСТИ|СТРОИТЕЛЬН[А-Я]*|ВОЗДУШН[А-Я]*|КАЛЬЦИЕВ[А-Я]*|МАГНЕЗИАЛЬН[А-Я]*|СОРТ[А-Я]*|МЕШК[А-Я]*|НАВАЛ|БЫСТРОГАС[А-Я]*|МЕДЛЕННОГАС[А-Я]*)$/;
  function parseLime(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv;
    if (wk.has(/ХЛОРН/)) f.k = 'ХЛОР';
    if (wk.has(/НЕГАШ/)) f.h = 'НЕГ'; else if (wk.has(/ГАШЕН|ПУШОНК|ГИДРАТН/)) f.h = 'ГАШ';
    if (wk.has(/КОМОВ/)) f.fm = 'КОМ'; else if (wk.has(/МОЛОТ|ПОРОШКООБРАЗН|ПУШОНК/)) f.fm = 'ПОР'; else if (wk.has(/ТЕСТО/)) f.fm = 'ТЕСТО';
    if ((m = wk.take(/(\d)\s*-?\s*(?:ГО\s*)?СОРТ|СОРТ\S*\s*(\d)/))) f.sort = m[1] || m[2];
    if ((m = wk.take(/\(?\s*(?:В\s+)?(МЕШК[А-Я]*|НАВАЛ[А-Я]*)\s*\)?/))) f.pk = /НАВАЛ/.test(m[1]) ? 'НАВ' : 'МЕШ';
    if ((m = wk.take(/МАРК[А-Я]*\s*([А-Я])(?=[^А-Я]|$)/))) f.mk = m[1];
    wk.drop(/ХЛОРН\S*|НЕГАШ\S*|ГАШЕН\S*|КОМОВ\S*|МОЛОТ\S*|ПОРОШКООБРАЗН\S*|ПУШОНК\S*|ГИДРАТН\S*|ТЕСТО/g);
    var r = residual(wk, LIME_KNOWN);
    f.x = r.x; a.xnum = r.xnum;
    var schema = [['k', ''], ['h', ''], ['fm', ''], ['mk', 'М'], ['sort', 'СОРТ'], ['pk', ''], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['pk', 'упаковка'], ['sort', 'сорт'], ['mk', 'марка'], ['fm', 'вид'], ['h', 'гашение']];
    return build('LIME', schema, steps, f, a);
  }

  var GYPS_KNOWN = /^(ГИПС[А-Я]*|ВЯЖУЩ[А-Я]*|СТРОИТЕЛЬН[А-Я]*|АЛЕБАСТР|МАРК[А-Я]*)$/;
  function parseGyps(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    if ((m = wk.take(/Г\s*-\s*(\d{1,2})(?![\d])/))) f.g = 'Г' + m[1];
    if ((m = wk.take(/(?:^|[^А-Я])([АБВ])\s*-?\s*(I{1,3})(?=[^А-ЯA-Z]|$)/))) f.g2 = m[1] + m[2];
    var r = residual(wk, GYPS_KNOWN);
    f.x = r.x; a.xnum = r.xnum;
    return build('GYPS', [['g', ''], ['g2', ''], ['x', '~']], [['x', 'прочее:'], ['g2', 'помол/схватывание'], ['g', 'марка']], f, a);
  }

  var AGG_KNOWN = /^(ЩЕБЕН[А-Я]*|ЩЕБЕНЬ|ПЕСОК|ПЕСКА|ГРАВИ[ЙЯ]|ГРАВИЙН[А-Я]*|СМЕС[А-Я]*|ПЕСЧАН[А-Я]*|ПЕСЧАНН[А-Я]*|ПЕЧАНН[А-Я]*|ЩЕБЕНОЧН[А-Я]*|ПРИРОДН[А-Я]*|ЕСТЕСТВЕНН[А-Я]*|КАМН[ЯЕ]|ПОРОД[А-Я]*|ГОРН[А-Я]*|ПЛОТН[А-Я]*|ФРАКЦИ[А-Я]*|ФР|РАБОТ|СТРОИТЕЛЬН[А-Я]*|РАСТВОРОВ|БЕТОНОВ|МАРК[А-Я]*|СМЕСИ|СМЕСЕЙ|КЛАСС[А-Я]*|ДРОБЛЕНИ[ЯЕ]|ОТСЕВОВ|ИЗ|МЕЛКОЗЕРНИСТ[А-Я]*|ИНЕРТН[А-Я]*|ДОРОЖН[А-Я]*|АСФАЛЬТОБЕТОНН[А-Я]*|ОРГАНОМИНЕРАЛЬН[А-Я]*|ОРГАНОМИНЕРАЛ|АСФАЛЬТОБЕТОН|НАВАЛ|ГОСТ)$/;

  function fractionOf(wk) {
    var out = [], m, guard = 0;
    while (guard++ < 4) {
      if ((m = wk.take(/(?:ФРАКЦИ[ЯИ]|ФР\.?)\s*,?\s*(?:ММ\s*:?)?\s*\(?\s*(?:БОЛЕЕ|СВЫШЕ|СВ\.?|ОТ)\s*(\d+(?:[.,]\d+)?)(?![\d.,])\s*(?:ММ|СМ)?\s*\)?(?!\s*[-+Х]\s*\d)/))) { out.push('>' + num(m[1])); continue; }
      if ((m = wk.take(/(?:(?:ФРАКЦИ[ЯИ]|ФР\.?)\s*,?\s*(?:ММ\s*:?)?\s*\(?\s*(?:СВ\.?|СВЫШЕ)?\s*)?(\d+(?:[.,]\d+)?(?:\(\d+\))?)\s*(?:-|\+|Х(?=\s*\d)|ДО)\s*(\d+(?:[.,]\d+)?)\s*(?:ММ)?\s*\)?/))) {
        out.push(num(m[1]) + '-' + num(m[2])); continue;
      }
      if ((m = wk.take(/(?:ФРАКЦИ[ЯИ]|ФР\.?)\s*,?\s*(?:ММ\s*:?)?\s*(\d+(?:[.,]\d+)?)\s*ММ/))) { out.push(num(m[1])); continue; }
      break;
    }
    out.sort();
    return out.length ? out.join(',') : null;
  }

  function parseAgg(t, kind) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    wk.drop(/(?:КАРЬЕР[А-Я]*\s*)?(?:ООО\s*)?"[^"]{2,40}"(?:\s*\([А-Я]+\))?/g, true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    f.k = kind;
    wk.drop(/\(\s*ВКЛЮЧАЯ[^)]*\)/g);
    if (kind === 'ЩЕБ') {
      if (wk.has(/ГРАНИТ/)) f.rk = 'ГРАН'; else if (wk.has(/ИЗВЕСТНЯК|ИЗВЕСТЯНК/)) f.rk = 'ИЗВ'; else if (wk.has(/БАЗАЛЬТ/)) f.rk = 'БАЗ';
      else if (wk.has(/ИЗ\s+ГРАВИ|ГРАВИЙН/)) f.rk = 'ГРАВ'; else if (wk.has(/ШЛАК/)) f.rk = 'ШЛАК';
      if (wk.has(/МЕЛКИЙ/)) f.sz = 'МЕЛК';
    } else if (kind === 'ПЕС') {
      if (wk.has(/КВАРЦ/)) f.o = 'КВАРЦ'; else if (wk.has(/ОТСЕВ|ДРОБЛЕН/)) f.o = 'ДРОБ'; else if (wk.has(/ПРИРОДН|РЕЧН|КАРЬЕРН|ОВРАЖН/)) f.o = 'ПРИР';
      if (wk.has(/РЕЧН/)) f.rk = 'РЕЧ'; else if (wk.has(/ТРАВЕРТИН/)) f.rk = 'ТРАВ';
      if (wk.has(/ОЧЕНЬ\s+МЕЛК/)) f.md = 'ОЧМЕЛК'; else if (wk.has(/ПОВЫШ\S*\s+КРУПН/)) f.md = 'ПОВКР'; else if (wk.has(/КРУПН/)) f.md = 'КРУП';
      else if (wk.has(/СРЕДН/)) f.md = 'СРЕД'; else if (wk.has(/МЕЛК/)) f.md = 'МЕЛК';
      if (wk.has(/ОБОГАЩ/)) f.ob = true;
      if (wk.has(/РАСТВОРН/)) f.use = 'РАСТВ';
      if ((m = wk.take(/(?:^|[^А-Я])(I{1,2}|L|[12])\s*-?\s*КЛАСС\S*|КЛАСС\S*\s*(I{1,2}|[12])(?![\d])/))) f.cl = (m[1] || m[2]).replace('II', '2').replace(/^[IL]$/, '1');
      wk.drop(/ОТСЕВ\S*\s*ДРОБЛЕНИ\S*|ИЗ\s+ОТСЕВ\S*|ОТСЕВ\S*|ДРОБЛЕН\S*|КВАРЦЕВ\S*|ПРИРОДН\S*|РЕЧН\S*|КАРЬЕРН\S*|ТРАВЕРТИН\S*|ОЧЕНЬ|ПОВЫШ\S*|КРУПНОСТ\S*|КРУПН\S*|СРЕДН\S*|МЕЛК\S*|ОБОГАЩ\S*|РАСТВОРН\S*/g);
    } else if (kind === 'КАМ') {
      if (wk.has(/БУТ/)) f.k = 'БУТ';
      if (wk.has(/ГОРН/)) f.rk = 'ГОРН';
      if ((m = wk.take(/(?:ДИАМЕТРОМ|РАЗМЕРОМ)?\s*(БОЛЕЕ|>|СВЫШЕ)?\s*(\d+)\s*СМ/))) f.sz = (m[1] ? '>' : '') + m[2] + 'СМ';
    }
    if (wk.has(/МЫТ(ЫЙ|АЯ)/) && !wk.has(/НЕ\s+МЫТ/)) f.wash = true;
    if (wk.has(/НЕ\s+МЫТ/)) f.wash = 'НЕМЫТ';
    wk.drop(/\(?\s*(?:НЕ\s+)?МЫТ(?:ЫЙ|АЯ)\s*\)?|ГРАНИТ\S*|ИЗВЕСТНЯК\S*|ИЗВЕСТЯНК\S*|БАЗАЛЬТ\S*|ИЗ\s+ГРАВИ\S*|ШЛАКОВ\S*|МЕТАЛЛУРГИЧ\S*|ШЛАК\S*|МЕЛКИЙ|ГОРН\S*|БУТОВ\S*/g);
    if ((m = wk.take(/(?:МАРК[А-Я]*|(?:^|[^А-Я])М)\s*[-.]?\s*(\d{3,4})(?:\s*[-,]\s*(\d{3,4}))?(?![\d])/))) {
      var ms = [m[1]]; if (m[2]) ms.push(m[2]); ms.sort(function (x, y) { return x - y; }); f.mk = ms.join('-');
    }
    var gs = [];
    while ((m = wk.take(/(?:^|[^А-Я])С\s*-?\s*(\d{1,2})(?![\d.,])/))) gs.push(+m[1]);
    if (gs.length) { gs.sort(function (x, y) { return x - y; }); f.gd = 'С' + gs.join(',С'); }
    if (kind === 'МП' && (m = wk.take(/МП\s*-?\s*(\d)/))) f.gd = 'МП-' + m[1];
    if (kind === 'МП') { if (wk.has(/НЕ\s*АКТИВ/)) f.act = 'НЕАКТ'; else if (wk.has(/АКТИВИР/)) f.act = 'АКТ'; wk.drop(/(?:НЕ\s*)?АКТИВИР\S*|МИНЕРАЛЬН\S*|ПОРОШ\S*/g); }
    if (kind === 'ДОЛОМИТ' && (m = wk.take(/ДК\s*-?\s*(\d+)\s*-\s*(\d+(?:[.,]\d+)?)/))) f.gd = 'ДК' + m[1] + '-' + num(m[2]);
    if (kind === 'КЕРАМЗИТ' && (m = wk.take(/(?:^|[^А-Я])(?:М|МАРК[А-Я]*)\s*-?\s*(\d{3})(?![\d])/))) f.mk = m[1];
    f.fr = fractionOf(wk);
    if (wk.has(/КУСКОВ/)) f.sz = 'КУСК';
    wk.drop(/МАРК[А-Я]*|КУСКОВ\S*|ДОЛОМИТ\S*|КЕРАМЗИТ\S*|КЛИНЕЦ|ДРЕСВ\S*|ГЛИН\S*|ПЕМЗ\S*|ПОРИСТ\S*|ЩГПС|ПГС|ГПС|ЩПС|ПЩС|БУТ/g);
    wk.drop(/(?:ЩЕБ[ЕЁ]НОЧНО|ПЕСЧАНО|ГРАВИЙНО|ПЕСЧАННО)-(?:ГРАВИЙНО-)?(?:ПЕСЧАНН?|ГРАВИЙН|ЩЕБ[ЕЁ]НОЧН|ПЕЧАНН)\S*|ПЕСЧАНО-ЩЕБ\S*|(?:^|[^А-Я])(?:КАМЕНЬ|КАМНИ|ОТСЕВ\S*)(?=[^А-Я]|$)|\(?\s*ШАГАЛ\s*\)?/g);
    var r = residual(wk, AGG_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['k', ''], ['o', ''], ['gd', ''], ['fr', 'ФР'], ['sz', ''], ['rk', ''], ['md', 'МК:'], ['cl', 'КЛ'], ['mk', 'М'], ['act', ''],
      ['ob', 'ОБОГ'], ['use', ''], ['wash', 'МЫТ'], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }],
      ['wash', function (v) { return v === true ? 'мытый' : 'немытый'; }], ['use', function () { return 'растворный'; }], ['ob', function () { return 'обогащенный'; }],
      ['act', function (v) { return v === 'АКТ' ? 'активированный' : 'неактивированный'; }], ['mk', 'марка по прочности М'],
      ['cl', 'класс'], ['md', 'модуль крупности'], ['rk', 'порода'], ['o', function (v) { return { 'ПРИР': 'природный', 'ДРОБ': 'из отсевов дробления', 'КВАРЦ': 'кварцевый' }[v]; }],
      ['sz', 'размер'], ['gd', 'марка смеси'], ['fr', 'фракция']];
    return build('AGG', schema, steps, f, a);
  }

  var BRICK_KNOWN = /^(КИРПИЧ[А-Я]*|СТРОИТЕЛЬН[А-Я]*|ОДИНАРН[А-Я]*|ОБЫКНОВЕНН[А-Я]*|РЯДОВ[А-Я]*|НАРУЖНЫХ|СТЕН|РАЗМЕР|ФОРМАТ[А-Я]*|ОТ|ПРОИЗВОДИТЕЛЯ|СТАНДАРТ[А-Я]*)$/;
  function parseBrick(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    var ker = wk.has(/КЕРАМИЧ|ГЛИНЯН|ЖЖЕН|ОБОЖЖ|ЖЖЕНН/), sil = wk.has(/СИЛИКАТН/);
    if (wk.has(/ОГНЕУПОР|(?:^|[^А-Я])Ш[АЦ][УБ]?\s*[-№]?\s*\d/)) f.mt = 'ОГН';
    else if (wk.has(/ГИПЕРПРЕСС/)) f.mt = 'ГП';
    else if (ker && sil) f.mt = null;
    else if (ker) f.mt = 'КЕР'; else if (sil) f.mt = 'СИЛ';
    if (wk.has(/(?:^|[^А-Я])ИЛИ(?=[^А-Я])/)) { f.mt = null; a.alternatives = true; }
    if (wk.has(/ПУСТОТЕЛ|ЩЕЛЕВ/)) f.h = a.alternatives ? null : 'ПУСТ'; else if (wk.has(/ПОЛНОТЕЛ/)) f.h = 'ПОЛН';
    if (wk.has(/ЛИЦЕВ|ОБЛИЦОВ/)) f.face = true;
    if ((m = wk.take(/(Ш[АЦ][УБ]?)\s*[-№]?\s*(\d+)/))) f.code = m[1] + m[2];
    if ((m = wk.take(/(\d{2,3})\s*[ХX*]\s*(\d{2,3})\s*[ХX*]\s*(\d{2,3}(?:[.,]\d+)?)/))) f.dim = m[1] + 'x' + m[2] + 'x' + num(m[3]);
    if (!f.dim) { if (wk.has(/ПОЛТОРА|ПОЛУТОРН/)) f.fmt = '1.4НФ'; else if (wk.has(/ДВОЙН/)) f.fmt = '2.1НФ'; }
    if ((m = wk.take(/(?:^|[^А-Я])(?:М|МАРК[А-Я]*)\s*-?\s*(\d{2,3})(?![\d])/))) f.mk = m[1];
    wk.drop(/КЕРАМИЧ\S*|ГЛИНЯН\S*|ЖЖЕНН?\S*|ОБОЖЖЕНН?\S*|СИЛИКАТН\S*|ОГНЕУПОРН\S*|ГИПЕРПРЕСС\S*|ПУСТОТЕЛ\S*|ЩЕЛЕВ\S*|ПОЛНОТЕЛ\S*|ЛИЦЕВ\S*|ОБЛИЦОВ\S*|ПОЛТОРА|ПОЛУТОРН\S*|ДВОЙН\S*|ПОЛОВИНКА|ПРЯМОЙ|МАРК[А-Я]*|ИЛИ|ПО\s+ПРОЕКТУ|№/g);
    var r = residual(wk, BRICK_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    var schema = [['mt', ''], ['code', ''], ['h', ''], ['dim', ''], ['fmt', ''], ['face', 'ЛИЦ'], ['mk', 'М'], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }], ['face', function () { return 'лицевой'; }], ['mk', 'марка М'], ['h', function (v) { return v === 'ПУСТ' ? 'пустотелый' : 'полнотелый'; }],
      ['fmt', 'формат'], ['dim', 'размер'], ['mt', 'материал']];
    return build('BRICK', schema, steps, f, a);
  }

  var BLOCK_KNOWN = /^(БЛОК[А-Я]*|БЛОКИ|СТЕНОВ[А-Я]*|КАМЕН[ЬЯ]|БЕТОНН[А-Я]*|ПЕРЕГОРОДОЧН[А-Я]*|АВТОКЛАВН[А-Я]*)$/;
  function parseBlock(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    if (wk.has(/ГАЗО/)) f.mt = 'ГАЗ'; else if (wk.has(/ПЕНО/)) f.mt = 'ПЕНО'; else if (wk.has(/ШЛАКО/)) f.mt = 'ШЛАК'; else if (wk.has(/КЕРАМЗИТО/)) f.mt = 'КЕРАМЗ'; else f.mt = 'БЕТ';
    if (!/БЛОК|КАМЕН/.test(t)) f.mass = true;
    if ((m = wk.take(/(\d{2,4})\s*[ХX*]\s*(\d{2,4})\s*[ХX*]\s*(\d{2,4})/))) f.dim = m[1] + 'x' + m[2] + 'x' + m[3];
    if ((m = wk.take(/(?:^|[^А-ЯA-Z])D\s*-?\s*(\d{3,4})/))) f.dens = 'D' + m[1];
    wk.drop(/ГАЗО\S*|ПЕНО\S*|ШЛАКО\S*|КЕРАМЗИТО\S*/g);
    var r = residual(wk, BLOCK_KNOWN);
    f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    return build('BLOCK', [['mt', ''], ['mass', 'МАССИВ'], ['dim', ''], ['dens', ''], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']],
      [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }], ['dens', 'плотность'], ['dim', 'размер'],
        ['mass', function () { return 'материал / блок'; }]], f, a);
  }

  function parseWater(t) {
    var f = {}, a = {};
    if (/ОБЕССОЛ|ДЕМИНЕРАЛ|ДИСТИЛЛ/.test(t)) f.q = 'ДЕМИН'; else if (/ПИТЬЕВ/.test(t)) f.q = 'ПИТ';
    var wk = new Work(t);
    wk.drop(/ВОДА|ТЕХНИЧЕСК\S*|ГЛУБОКО\S*|ОБЕССОЛ\S*|ДЕМИНЕРАЛ\S*|ДИСТИЛЛ\S*|ПИТЬЕВ\S*|ВОДОПРОВОДН\S*|ДЛЯ|СТРОИТЕЛЬН\S*|НУЖД|ЦЕЛЕЙ/g);
    var r = residual(wk, null);
    f.x = r.x; a.xnum = r.xnum;
    return build('WATER', [['q', ''], ['x', '~']], [['x', 'прочее:']], f, a);
  }

  var CODE_SYN = {
    'КЦ': 'КС',
    'КЦП': 'ПП',
    'КЦД': 'ПД',
    'КЦО': 'КО'
  };
  var ROMAN_PREFIX = { 'I': '1', 'II': '2', 'П': '2', 'III': '3', 'Ш': '3' };
  var NOT_CODE = makeSet(['ДЛИНОЙ', 'ДЛ', 'ВЕСОМ', 'ВЕС', 'ТИП', 'ТИПА', 'МАРКИ', 'МАРКА', 'МАРКОЙ', 'НА', 'ПО', 'ДО', 'ИЗ', 'ДЛЯ', 'ОТ',
    'РАЗМЕРОМ', 'РАЗМЕР', 'РАЗМЕРЫ', 'ДИАМ', 'ДИАМЕТРОМ', 'ГАБАРИТНЫЕ', 'ВЫСОТОЙ', 'ТОЛЩ', 'ТОЛЩИНОЙ', 'ОТВЕРСТИЕМ', 'СЕЧЕНИЕМ',
    'БЕЗ', 'ПЛИТА', 'ПЛИТЫ', 'БЛОК', 'БЛОКИ', 'БЛОКОВ', 'КОЛЬЦА', 'КОЛЬЦО', 'СВАИ', 'СВАЯ', 'ЛОТОК', 'ЛОТКИ', 'БАЛКА', 'БАЛКИ',
    'ТРУБЫ', 'ТРУБА', 'ОПОРА', 'ОПОРЫ', 'СТОЙКА', 'СТОЙКИ', 'ММ', 'СМ', 'М', 'Т', 'КГ', 'ШТ', 'ВЫП', 'СЕР', 'КОЛОДЕЦ', 'ИЛИ',
    'И', 'С', 'В', 'К', 'У', 'О', 'Н', 'L', 'ДНИЩА', 'БРУСЬЯ', 'ЗВЕНЬЯ', 'ЛЕЖНИ', 'СТ', 'ШАГ', 'ОБ', 'ОКОЛО', 'Х', 'X', 'Д', 'ОЙ', 'ГО']);
  var GLUE_OK = makeSet(['ОТ', 'СМ', 'К', 'С', 'В', 'О', 'Н', 'У', 'Т', 'Д']);
  var LETTER_CODES = makeSet(['ПТМ', 'ПТП', 'ПТК']);

  function toks(s) {
    var re = /([А-ЯA-Z]+)|(\d+(?:,\d+)?)|(\s*[.\-\/]\s*|\s+)|([^А-ЯA-Z0-9.\-\/\s]+)/g, m, out = [];
    while ((m = re.exec(s))) {
      if (m[1]) out.push({ t: 'L', v: m[1], raw: m[0] });
      else if (m[2]) out.push({ t: 'N', v: m[2], raw: m[0] });
      else if (m[3] !== undefined && m[3] !== '') out.push({ t: 'S', v: m[3].replace(/\s+/g, ' '), raw: m[0] });
      else if (m[4]) out.push({ t: 'P', v: m[4], raw: m[0] });
      else break;
    }
    return out;
  }

  function findCode(s) {
    var tk = toks(s), i, j;
    for (i = 0; i < tk.length; i++) {
      if (tk[i].t !== 'L') continue;
      var L = tk[i].v;
      if (L.length > 5) continue;
      if ((L === 'Х' || L === 'X') && i >= 1 && tk[i - 1].t === 'N') continue;
      j = i + 1;
      var glued = j < tk.length && tk[j].t === 'N';
      if (j < tk.length && tk[j].t === 'S' && /^[ .\-]$|^ ?- ?$/.test(tk[j].v)) j++;
      if (j >= tk.length || tk[j].t !== 'N') continue;
      if (L.length >= 4 && /[АЕИОУЫЭЮЯ]{1}[^АЕИОУЫЭЮЯ]*[АЕИОУЫЭЮЯ]/.test(L)) continue;
      var pre = '', start = i;
      if (i >= 1 && tk[i - 1].t === 'N' && /^\d$/.test(tk[i - 1].v) && (i < 2 || tk[i - 2].t !== 'N')) { pre = tk[i - 1].v; start = i - 1; }
      else if (i >= 2 && tk[i - 1].t === 'S' && tk[i - 1].v === ' ' && tk[i - 2].t === 'N' && /^\d$/.test(tk[i - 2].v) && (i < 3 || (tk[i - 3].t === 'P' && /\($/.test(tk[i - 3].v)) || tk[i - 3].t === 'S' && (tk[i - 3].v !== ' ' || i < 4 || tk[i - 4].t === 'L' || tk[i - 4].t === 'P'))) { pre = tk[i - 2].v; start = i - 2; }
      else if (i >= 2 && tk[i - 1].t === 'S' && tk[i - 1].v === ' ' && tk[i - 2].t === 'L' && ROMAN_PREFIX[tk[i - 2].v] && (i < 3 || tk[i - 3].t !== 'L')) { pre = ROMAN_PREFIX[tk[i - 2].v]; start = i - 2; }
      if (NOT_CODE[L]) {
        var prevNum = i >= 1 && (tk[i - 1].t === 'N' || (tk[i - 1].t === 'S' && i >= 2 && tk[i - 2].t === 'N'));
        var multi = !glued && tk[j + 1] && tk[j + 1].t === 'S' && /^[.\-]$/.test(tk[j + 1].v) && tk[j + 2] && tk[j + 2].t === 'N';
        if (!glued && tk[i + 1] && tk[i + 1].t === 'S' && tk[i + 1].v === '-') multi = true;
        var ok = (GLUE_OK[L] && (pre || ((glued || multi) && !prevNum))) || (L === 'СМ' && !prevNum);
        if (!ok) continue;
      }
      if (/^З(П|ОТ|РП)$/.test(L)) { pre = '3'; L = L.slice(1); }
      L = CODE_SYN[L] || L;
      var code = pre + L, k = j, lastNum = -1, nNum = 0, prevT = 'L', dimMode = false;
      while (k < tk.length) {
        var x = tk[k];
        if (x.t === 'N') { code += (prevT === 'N' ? '-' : '') + x.v; prevT = 'N'; lastNum = code.length; nNum++; k++; continue; }
        if (x.t === 'S') {
          var y = tk[k + 1], z = tk[k + 2];
          if (!y) break;
          if (y.t === 'N' && x.v === ' ' && z && z.t === 'L' && (z.v === 'Х' || z.v === 'X') && tk[k + 3] && tk[k + 3].t === 'N') break;
          if (y.t === 'N') { k++; continue; }
          if (x.v === ' ' && y.t === 'L' && y.v === 'Т' && z && z.t === 'S' && z.v === ' ' && tk[k + 3] && tk[k + 3].t === 'N' && /^\d$/.test(tk[k + 3].v)) { k++; continue; }
          if (x.v === ' ' && y.t === 'L' && y.v.length <= 2 && !/^(?:Х|X|L|Д|ДО|НА|ПО|ВР)$/.test(y.v) && z && (z.t === 'N' || (z.t === 'S' && z.v !== ' ' && tk[k + 3] && tk[k + 3].t === 'N'))) { k++; continue; }
          if (x.v === ' ' && y.t === 'L' && y.v.length === 1 && !NOT_CODE[y.v] && z && z.t === 'S' && z.v === ' ' && tk[k + 3] && tk[k + 3].t === 'N') { k++; continue; }
          if (x.v !== ' ' && y.t === 'L' && y.v.length <= 2) { k++; continue; }
          break;
        }
        if (x.t === 'L') {
          if (x.v.length > 3 && prevT !== 'N') break;
          var Lv = x.v === 'ТЗ' ? 'Т3' : x.v;
          if (Lv === 'Т3') { code += 'Т3'; prevT = 'N'; lastNum = code.length; k++; continue; }
          if (Lv.length > 3) break;
          if ((Lv === 'Х' || Lv === 'X') && prevT === 'N') {
            if ((nNum === 1 || dimMode) && tk[k + 1] && tk[k + 1].t === 'N') { dimMode = true; code += '-'; prevT = 'L'; k++; continue; }
            break;
          }
          if (/^З$/.test(Lv) && prevT === 'L') Lv = '3';
          code += Lv; prevT = /\d$/.test(Lv) ? 'N' : 'L'; if (prevT === 'N') lastNum = code.length; k++; continue;
        }
        break;
      }
      if (!nNum) continue;
      var main = code.slice(0, lastNum), tailLetters = code.slice(lastNum).replace(/^(?:ММ|СМ|М)$/, '');
      var variant = tailLetters, q = k;
      while (q < tk.length) {
        if (tk[q].t === 'S' && tk[q].v === ' ' && tk[q + 1] && tk[q + 1].t === 'L' && /^[СДУАКНПТ]$/.test(tk[q + 1].v) &&
          (!tk[q + 2] || tk[q + 2].t !== 'S' || tk[q + 2].v !== ' ' || !tk[q + 3] || tk[q + 3].t !== 'L' || /^[СДУАКНПТ]$/.test(tk[q + 3].v))) {
          variant += tk[q + 1].v; q += 2; continue;
        }
        if (tk[q].t === 'S' && /-/.test(tk[q].v) && tk[q + 1] && tk[q + 1].t === 'L' && /^[СДУАКНПТ]$/.test(tk[q + 1].v) && (!tk[q + 2] || tk[q + 2].t !== 'N')) {
          variant += tk[q + 1].v; q += 2; continue;
        }
        break;
      }
      var cm = /^(\d?[А-ЯA-Z]+(?:\d+(?:,\d+)?)(?:-\d+(?:,\d+)?)*)/.exec(main);
      return { code: main, core: cm ? cm[1] : main, variant: variant || null, letters: L, nNum: nNum, start: start, end: q, tokens: tk };
    }
    for (i = 0; i < tk.length; i++) {
      if (tk[i].t === 'L' && LETTER_CODES[tk[i].v]) return { code: tk[i].v, core: tk[i].v, variant: null, letters: tk[i].v, nNum: 0, start: i, end: i + 1, tokens: tk };
    }
    return null;
  }

  var ZHBI_HEADS = [
    ['ПЛИТ', /ПЛИТ[АЫ]?|ПЛИТЕ/], ['БЛОК', /БЛОК|БЛ\.ПР\.ТР/], ['КОЛЬЦО', /КОЛЬЦ|КОЛЦ/], ['ЛОТОК', /ЛОТ(?:ОК|КИ|КОВ|КА)/], ['СВАЯ', /СВА[ИЯЙ]/],
    ['БАЛКА', /БАЛК|БАЛОК|БАЛОЧН|ПРОЛЕТН\S*\s+СТРОЕН/], ['БОРДЮР', /БОРДЮР|БАРДЮР|БОРТОВ/], ['ПЕРЕМЫЧКА', /ПЕРЕМЫЧ/], ['ОПОРА', /ОПОР[АЫ]/], ['СТОЙКА', /СТОЙК/],
    ['СТОЛБИК', /СТОЛБ/], ['РИГЕЛЬ', /РИГЕЛ/], ['КОЛОННА', /КОЛОНН/], ['ФУНДАМЕНТ', /ФУНДАМЕНТ/], ['ЛЕЖЕНЬ', /ЛЕЖН|ЛИЖН|ЛЕЖЕН/],
    ['КРЫШКА', /КРЫШК/], ['ПАНЕЛЬ', /ПАНЕЛ/], ['МАРШ', /МАРШ/], ['СТУПЕНЬ', /СТУПЕН/], ['ТРУБА', /ТРУБ[АЫ]?(?=[^А-Я]|$)|ЗВЕНЬ|ЗВЕНЕВ/], ['БРУС', /БРУС(?!ЧАТ)/],
    ['БАШМАК', /БАШМАК/], ['КОЛОДЕЦ', /КОЛОД[ЕЦ]/], ['ДНИЩЕ', /ДНИЩ/], ['СТАКАН', /СТАКАН/], ['НАСАДКА', /НАСАДК/], ['КАРНИЗ', /КАРНИЗ/],
    ['ГАЛЕРЕЯ', /ГАЛЕРЕ|ГОЛОРЕ/], ['КОСОУР', /КОСОУР/], ['РАСПОРКА', /РАСПОРК/], ['КАМЕРА', /КАМЕР[АЫ]/], ['ТРАП', /ТРАП(?=[^А-Я]|$)/]
  ];
  var ZHBI_CODES = /(?:^|[^А-Я0-9])(?:\d?(?:ФБС|ФБ|ФЛ|БР|БРУ|БРС|БРН|БУ|ПТМ|ПТП|ПТК|ПН|ПДО|ПД|ПП|ППК|ПС|ПК|ПБ|ПГ|КС|КЦ|КЦП|КЦД|КЦО|КО|КПД|ККС|КЛК|ККД|КД|КБ|БДО|ОТ|РП|ЛК|ЛП|ЛИ|ЛР|ЛРВ|ЛД|ЛМП|ЛС|ЛКР|ЛСР|СМ|БК|БПС|БПО|СПО|СС|ОЖ|СВ|СК|БО|ЗТП|ТР|РТ|БИ|БЛ|ДП|СДБ|ОП|УБ|ПСУ|АО|ФО|СЛМ|БС|П|Б|Г|К|Л|Ф)|\dПР)\s*[-.]?\s*\d/;
  var ZHBI_NOT = new RegExp('(?:МЕТАЛЛИЧ|СТАЛЬН|(?:^|[^А-Я])СТАЛ[ЬИ](?=[^А-Я]|$)|НЕРЖАВ|АЛЮМИН|ПВХ|ПЛАСТИК|ПОЛИМЕРН|ПОЛИЭТИЛ|ПОЛИПРОПИЛ|HDPE|ПЕРФОРИР|IEK|ESCA|ДЕРЕВ|ГИПС|ПЕНОПЛ|' +
    'ПОЛИСТИР|ТЕПЛОИЗОЛ|(?:^|[^А-Я])ВАТ[АЫ]|МИНЕРАЛОВАТ|БАЗАЛЬТОВ|КЕРАМИЧ|ГРАНИТ|МРАМОР|ТРАВЕРТИН|ДВЕРН|ОКОНН|ПИТАНИЯ|ИСПЫТАТ|БОЛТ|АНКЕРН|ЧУГУН|' +
    'ЛЕСТНИЧН\\S* ЛОТ|ЛОТК\\S* ЛЕСТНИЧН|КАБЕЛ|ПРОВОД|ДСП|ОСП|МДФ|ФАНЕР|СТЕКЛ|АСБЕСТ|ХРИЗОТИЛ|ГОФР|ДРЕНАЖН|ГЕОТЕКС|ПОЛИКАРБ|САЙДИНГ|ЛЕКСАН|' +
    'АЛЮКОБОНД|АЛЮПАН|БРУСЧАТ|ТАКТИЛ|ВИБРОПРЕСС|ПАРКЕТ|ЛАМИНАТ|ЭЛЕКТРО(?!ПЕРЕДАЧ)|СВЕТИЛЬН|(?:^|[^А-Я])ЗНАК(?:И|А)?(?=[^А-Я]|$)|КОНСОЛ|СВЕТОФОР|' +
    'СВЕТОВОР|ВЕНТИЛ|НАСОС|ПЕРЕВОЗК|УСТАНОВК|(?:^|[^А-Я])МОНТАЖ|ДЕМОНТАЖ|РЕМОНТ|КРАСК|ЭМАЛ|ГРУНТОВК|(?:^|[^А-Я])ЛАК(?=[^А-Я]|$)|РЕЗИН|УПЛОТН|' +
    'ПРОКЛАДК|ХОМУТ|ФЛАНЕЦ|ФЛАНЦ|ЗАДВИЖК|КЛАПАН|(?:^|[^А-Я])КРАН|ВОДОМЕР|СЧЕТЧИК|РЕШЕТК|ТРОС|КАНАТ|ПРОФИЛ|(?:^|[^А-Я])ЛИСТ(?:Ы|А)?(?=[^А-Я]|$)|' +
    'ШВЕЛЛЕР|УГОЛОК|ДВУТАВР|АРМАТУР|СЕТК|ПРОВОЛ|ГВОЗД|(?:^|[^А-Я])ВИНТ|ШУРУП|ДЮБЕЛ|САМОРЕЗ|ГАЙК|ШАЙБ|ПАНЕЛЬНЫЙ ЩИТ|(?:^|[^А-Я])ЩИТ(?:Ы|А)?(?=[^А-Я]|$)|' +
    'ШКАФ|БОКС|КОРОБ|ТРУБОПРОВОД|ВЫКЛЮЧАТ|ВАКУУМ|ОБСЛУЖИВАН|ПОРУЧ|ГРАНН|КОНИЧЕСК|ОБОЛОЧК|ТЕРМОМЕТР|ТРУБК|ТЕПЛОВ\\S* (?:БЛОК|УСТАНОВ)|КОТЛ|ГОРЕЛК|' +
    'ИНЖЕКЦ|ОТОПИТ|РАДИАТОР|КОНСТРУКЦИ[ЯИ]\\s*-?\\s*№|(?:^|[^A-Z])[WH]\\d|КРОНШТЕЙН|СИГНАЛЬН\\S* СТОЙК|' +
    'ХВОЙН|ЛИСТВЕН|ПИЛОМАТЕР|ЛЕСОМАТЕР|ОБРЕЗН|(?:^|[^А-Я])ДОСК|БРУСК|(?:^|[^А-Я])СОРТ[АУ]?(?=[^А-Я]|$)|СТОЙК\\S* МОСТОВ|БЛОК\\S* ИСПЫТАТ|EKF|БЛОК-КОНТАКТ)');
  var ZHBI_NOT_HARD = /ПВХ|ПЛАСТИК|ПОЛИЭТИЛ|ПОЛИПРОПИЛ|HDPE|ПЕРФОРИР|IEK|EKF|ДЕРЕВ|ПЕНОПЛ|ПОЛИСТИР|ДВЕРН|ОКОНН|КАБЕЛ|ХВОЙН|ПИЛОМАТЕР|ЛЕСОМАТЕР|ОПАЛУБК|ЗАКЛАДН|ПЕРЕВОЗК|КАРКАС|АРМАТУРН\S* СЕТК/;
  var ZHBI_STRONG = /Ж\s*\/\s*Б|(?:^|[^А-Я])Ж\.\s*Б\.?(?=[^А-Я]|$)|(?:^|[^А-Я])ЖБИ?(?=[^А-Я]|$)|ЖЕЛЕЗОБЕТОН|ЖЕЛЕЗОБ\.|Ж\/БЕТОН|НА\s+(?:СУЛЬФАТ[ОА]СТОЙКОМ\s+)?ЦЕМЕНТЕ|ИЗ\s+БЕТОНА/;
  var ZHBI_MARK = /Ж\s*\/\s*Б|(?:^|[^А-Я])Ж\.\s*Б\.?(?=[^А-Я]|$)|(?:^|[^А-Я])ЖБ(?:И)?(?=[^А-Я]|$)|ЖЕЛЕЗОБЕТОН|ЖЕЛЕЗОБ\.|Ж\/БЕТОН|ЖЕЛ\.?\s*БЕТ|СБОРН|БЕТОНН\S*\s+(?:ИЗДЕЛ|КАМН|БЛОК|КОЛЬЦ|ЛОТ|ПЛИТ|БОРДЮР|БОРТ|КРЫШК|ТРУБ)|БЕЗНАПОР|БЛ\.\s*ПР\.\s*ТР|ДОРОЖН\S*\s+ОГРАЖ|КОЛЕСООТБО|ПРОЛЕТН\S*\s+СТРОЕН|ГАЛЕРЕ|ГОЛОРЕ/;

  var ZHBI_HEADS_W = [];
  (function () {
    for (var i = 0; i < ZHBI_HEADS.length; i++) ZHBI_HEADS_W.push([ZHBI_HEADS[i][0], new RegExp('(?:^|[^А-ЯA-Z])(?:' + ZHBI_HEADS[i][1].source + ')')]);
  })();
  function headIndex(h) { for (var i = 0; i < ZHBI_HEADS_W.length; i++) if (ZHBI_HEADS_W[i][0] === h) return i; return -1; }
  function zhbiHead(t) {
    var h = headText(t), i;
    for (i = 0; i < ZHBI_HEADS_W.length; i++) if (ZHBI_HEADS_W[i][1].test(h)) return ZHBI_HEADS_W[i][0];
    for (i = 0; i < ZHBI_HEADS_W.length; i++) if (ZHBI_HEADS_W[i][1].test(t)) return ZHBI_HEADS_W[i][0];
    return null;
  }

  function ownsZhbi(t, unit) {
    if (ZHBI_STRONG.test(t) ? ZHBI_NOT_HARD.test(t) : ZHBI_NOT.test(t)) return false;
    var head = zhbiHead(t), mark = ZHBI_MARK.test(t), code = ZHBI_CODES.test(t);
    if (mark && (head || code || unit === 'м3')) return true;
    if (head && unit === 'м3') return true;
    if (head === 'ТРУБА') return false;
    if (head && code) return true;
    if (!head && /^(?:\d|I{1,3}\s|[А-Я]{1,4}\s*[-.]?\s*\d)/.test(t) && code && !/[А-Я]{6,}/.test(t.replace(/\(.*?\)/g, '')) &&
      !/\d\s*[ХX]\s*\d+[,.]\d/.test(t)) return true;
    return false;
  }

  var ZHBI_KNOWN = new RegExp('^(' + 'Ж|Б|ЖБ|ЖБИ|ЖЕЛЕЗОБЕТОНН[А-Я]*|ЖЕЛЕЗОБ|СБОРН[А-Я]*|ИНДИВИДУАЛЬН[А-Я]*|БЕТОНН[А-Я]*|ИЗДЕЛИ[ЯЙ]|МАРКИ|МАРКА|ДЛЯ|ПЛИТ[А-Я]*|БЛОК[А-Я]*|КОЛ[Ь]?Ц[А-Я]*|ЛОТ[КО][А-Я]*|СВА[ИЯЙ]|БАЛ[КО][А-Я]*|БОРДЮР[А-Я]*|БАРДЮР[А-Я]*|БОРТОВ[А-Я]*|КАМН[ИЯЕ]|КАМЕНЬ|ПЕРЕМЫЧК[А-Я]*|ОПОР[А-Я]*|СТОЙК[А-Я]*|СТОЛБ[А-Я]*|РИГЕЛ[А-Я]*|КОЛОНН[А-Я]*|ФУНДАМЕНТ[А-Я]*|ЛЕЖН[А-Я]*|ЛЕЖЕН[А-Я]*|ЛИЖН[А-Я]*|КРЫШК[А-Я]*|ПАНЕЛ[А-Я]*|МАРШ[А-Я]*|СТУПЕН[А-Я]*|ТРУБ[А-Я]*|ЗВЕН[А-Я]*|БРУС[А-Я]*|БАШМАК[А-Я]*|КОЛОД[А-Я]*|ДНИЩ[А-Я]*|СТАКАН[А-Я]*|НАСАД[А-Я]*|КАРНИЗ[А-Я]*|КОСОУР[А-Я]*|РАСПОРК[А-Я]*|КАМЕР[А-Я]*|ПЕРЕКРЫТИ[ЯЙ]|ПЕРЕКР|ПОКРЫТИ[ЯЙ]|ДНИЩА|СТЕНОВ[А-Я]*|ОПОРН[А-Я]*|ДОРОЖН[А-Я]*|ДОРОЖ|ДОР|ОГРАЖДЕНИ[ЯЕ]|ОГРАЖД|ОГРАЖ|ОГР|ОГРАЖДАЮЩ[А-Я]*|ТРОТУАРН[А-Я]*|ТРОТУАРОВ|ТРОТ|ТРОТ\.|РАЗД|ПОЛОСЫ|РАЗДЕЛИТЕЛЬН[А-Я]*|ПЕРЕХОДН[А-Я]*|ПРОЛЕТН[А-Я]*|СТРОЕНИ[ЯЙ]|КОЛЕСООТБО[А-Я]*|ПЕРИЛЬН[А-Я]*|КЮВЕТН[А-Я]*|ПРИКРОМОЧН[А-Я]*|ПРИКОРМОЧН[А-Я]*|ИРРИГАЦИОНН[А-Я]*|ОРОСИТЕЛЬН[А-Я]*|СИСТЕМ|ПАРАБОЛИЧЕСК[А-Я]*|СИГНАЛЬН[А-Я]*|ЗНАКОВ|ВОДОПРОПУСКН[А-Я]*|ВОДОПРОВОДН[А-Я]*|КАНАЛИЗАЦИОНН[А-Я]*|СЕТЕЙ|КРУГЛ[А-Я]*|ПРЯМОУГОЛЬН[А-Я]*|БЕЗНАПОР[А-Я]*|РАСТРУБН[А-Я]*|КАНАЛОВ|ДЕКОРАТИВН[А-Я]*|СОВМЕЩЕНН[А-Я]*|ПОДПОРН[А-Я]*|СТЕН|НАСАДОК|ПОД|НАСЫП[А-Я]*|АВТОМОБИЛЬН[А-Я]*|ДОРОГ|ДОРОГАХ|ПЕШЕХОДН[А-Я]*|МОСТОВ|МОСТОВ[А-Я]*|ИСКУССТВЕНН[А-Я]*|СООРУЖЕНИ[ЙЯ]|ДОРОЖНОГО|СТРОИТЕЛЬСТВА|ПЛОСКИ[ЕХ]|РЕБРИСТ[А-Я]*|МНОГОПУСТОТН[А-Я]*|ПУСТОТН[А-Я]*|ПРЕДВАРИТЕЛЬНО|НАПРЯЖЕНН[А-Я]*|ВИБРИРОВАНН[А-Я]*|ЦЕНТРИФУГИРОВАНН[А-Я]*|ЛЕСТНИЧН[А-Я]*|ЛЕСНИЧН[А-Я]*|ТИПА|ТИП|ОДНООЧКОВ[А-Я]*|ОТВЕРСТИЕМ|ПРЯМОУГ|ЦЕМЕНТЕ|НА|ЭЛ|ПЕРЕДАЧ|ЭЛЕКТРОПЕРЕДАЧ|ЛЭП|СЕРИИ|ГОСТ|КРАЙН[А-Я]*|СРЕДН[А-Я]*|КРАЕН[А-Я]*|СТРОЕНИЙ|ГАЛЕРЕ[А-Я]*|ГОЛОРЕ[А-Я]*|КВАДРАТН[А-Я]*|ЛЮК|УГЛОВ[А-Я]*|РЯДОВ[А-Я]*|ПРЯМ[А-Я]*|ДНИЩ|ВЫГРЕБОМ|КОВЕР|ОПАЛУБК[А-Я]*|НЕСЪЕМН[А-Я]*|ОДНОСКАТН[А-Я]*|ДВУСКАТН[А-Я]*|СТРОПИЛЬН[А-Я]*|ПОКРЫТИЙ|ЗАБОРА|ЗАБОР|ЭЛЕМЕНТ[А-Я]*|УПОРА|УПОР|ТЕЛЕСКОПИЧЕСК[А-Я]*|ТРУБЫ|РЕЗЕРВУАР[А-Я]*|ВОДЫ|КРУГЛЫХ|КОЛОДЦЕВ|ПЕРЕКРЫТИЙ|ФАКТ|АРМИРОВАНН[А-Я]*|ОБЫЧН[А-Я]*' +
    '|КАНАЛИЗАЦИ[ИЯ]|СТОЧНЫХ|ВОД|ТЕПЛОТРАСС|ЗДАНИЙ|ПОДВАЛОВ|ТЕЛЕФОНН[А-Я]*|ВОДОПРОВОДА|ГОРЛОВИН[А-Я]*|РАБОЧЕЙ|ПРОИЗВОДСТВЕНН[А-Я]*|ОГРАЖДЕНИЙ|СТЕНКИ|ВОЗДУШН[А-Я]*|ЛИНИ[ИЙЯ]|ВЫСОКОВОЛЬТН[А-Я]*|ЖИЛЬЯ|МАЛООБЕСПЕЧЕНН[А-Я]*|СЕМЕЙ|ОДНОЭТАЖН[А-Я]*|ПЕРИЛЬН[А-Я]*|ЖЕЛЕЗН[А-Я]*|СПЛОШН[А-Я]*|КОЛЕСО|ОТБОЯ|ПРЯМОУГОЛЬН[А-Я]*|СЕЧЕНИ[ЯЕ]|КОНСТРУКЦИ[ИЯЙ]|Г-ОБРАЗН[А-Я]*|СОСТАВН[А-Я]*|ВОДОСНАБЖЕНИЯ|ГАЗОСНАБЖЕНИЯ|ТЕПЛОСНАБЖЕНИЯ|ФУНД|КРОВЛЕЙ|ПЛОСКОЙ|СКАТНОЙ|РАЗМЕРЫ|КАТЕГОРИИ|ЦИЛИНДРИЧЕСК[А-Я]*|СТРОПИЛЬН[А-Я]*|ЛОТК[А-Я]*|ПАРАБОЛИЧЕСК[А-Я]*)$');

  function parseZhbi(t) {
    var wk = new Work(t), m, f = {}, a = {};
    for (var i = 0; i < IGN.length; i++) wk.drop(IGN[i], true);
    var d = takeDelivery(wk);
    f.dlv = d.dlv; f.ext = d.ext || null;
    var head = zhbiHead(t);
    a.head = head;
    wk.drop(/БЛ\.\s*ПР\.\s*ТР\.?/g);
    wk.drop(/Ж\s*\/\s*Б(?:ЕТОНН?\S*)?|(?:^|[^А-Я])Ж\.\s*Б\.?(?=[^А-Я]|$)|ЖЕЛЕЗОБ\.|ЖЕЛ\.?\s*БЕТ\S*/g);
    if (wk.has(/СУЛЬФАТ[ОА]СТОЙК|С\/С\s*ЦЕМЕНТ/)) f.sr = true;
    wk.drop(/(?:НА\s+(?:ОСНОВЕ\s+)?)?СУЛЬФАТ[ОА]СТОЙК\S*(?:\s+ЦЕМЕНТ\S*)?|С\/С\s*ЦЕМЕНТ\S*/g);
    if ((m = wk.take(/\(\s*(СРЕДНЯЯ|КРАЙНЯЯ)\s*\)/)) || (m = wk.take(/(?:^|[^А-Я])(СРЕДНИ[ЕЙ]|КРАЙНИ[ЕЙ]|КРАЕНИЕ)(?=[^А-Я])/))) f.pos = /СРЕД/.test(m[1]) ? 'СР' : 'КР';
    if ((m = wk.take(/№\s*(\d+(?:\s*\/\s*\d+)?)/))) f.no = m[1].replace(/\s+/g, '');
    wk.w = wk.w.replace(/\(\s*\)/g, ' ');
    if ((m = wk.take(/\(\s*(\d+(?:[.,]\d+)?)\s*М3\s*(?:[\/-]\s*1\s*ШТ)?\s*\)/))) f.vol = num(m[1]);
    if ((m = wk.take(/\(?\s*(?:ВЕСОМ|ВЕС)\s*(?:ОДНОЙ\s+[А-Я]+\s*)?[-:]?\s*(?:ДО\s*)?(\d+(?:[.,]\d+)?)\s*Т(?=[^А-Я]|$)\s*\)?/)) || (m = wk.take(/\(\s*(\d+(?:[.,]\d+)?)\s*Т\s*\)/))) f.wt = num(m[1]);
    wk.w = wk.w.replace(/\(\s*\)/g, ' ');
    if ((m = wk.take(/,?\s*НАГРУЗК[А-Я]*\s*[-:]?\s*(\d+(?:,\d+)?)/))) f.load = m[1];
    if ((m = wk.take(/,?\s*ВЫСОТ[А-Я]*\s*[-:]?\s*(\d+(?:,\d+)?)\s*ММ/))) f.hgt = m[1];
    if ((m = wk.take(/\(\s*ДЛЯ\s+([^)]*\d[^)]*)\)/))) f.pur = m[1].replace(/\s+/g, '');
    if ((m = wk.take(/(?:ДЛИНОЙ|ДЛ\.?|L\s*[-=]?|L±|Н±|H±)\s*(?:ДО\s*)?(\d+(?:[.,]\d+)?)\s*М(?=[^А-Я0-9]|$)/))) f.len = num(m[1]);
    else if ((m = wk.take(/(?:^|[\s,(])(\d+(?:[.,]\d+)?)\s*(?:М|МЕТР[А-Я]*)(?=[\s)]|$)/))) f.len = num(m[1]);
    wk.drop(/(?:ДЛИНОЙ|ВЫСОТОЙ|Н±|H±)\s*(?:ДО\s*)?\d+(?:[.,]\d+)?\s*М(?=[^А-Я0-9]|$)/g, true);
    wk.drop(/\(?\s*ГАБАРИТНЫЕ\s+РАЗМЕРЫ[^)]*\)?/g, true);
    wk.drop(/\(\s*РАЗМЕРЫ?\s*[-:]?[^)]*\)/g, true);
    wk.drop(/\(\s*ДЛИНА\s*[ХX]\s*ШИРИНА[^)]*\)/g, true);
    wk.drop(/\(?\s*V\s*=\s*\d+(?:[.,]\d+)?\s*М3\s*\)?|,?\s*V\s*-\s*\d+(?:[.,]\d+)?\s*М3/g, true);
    wk.drop(/,?\s*ОБЪЕМ\s+БЕТОНА\s*\d+(?:[.,]\d+)?\s*М3/g, true);
    wk.drop(/ДИАМ\.?\s*\d+\s*ММ|ДИАМЕТРОМ\s*\d+(?:[.,]\d+)?\s*М{1,2}|Д\s*±\s*\d+\s*ММ/g, true);
    if (!f.no && (m = wk.take(/(?:МАРКИ\s+)?(?:^|[^А-Я])Б\s*(\d{2,3})\s+(?=[З3]П\s*\d)/))) f.no = m[1];
    var c = findCode(wk.w);
    if (c) {
      f.code = c.code; a.core = c.core; a.nNum = c.nNum;
      if (c.variant) f.v = c.variant;
      var weak = c.letters.length <= 1 && c.nNum <= 1;
      if (weak || c.letters === 'L' || c.nNum === 0) f.h = head;
      var p0 = 0, p1 = 0, tk = c.tokens;
      for (var q = 0; q < c.end; q++) { if (q < c.start) p0 += tk[q].raw.length; p1 += tk[q].raw.length; }
      wk.w = wk.w.slice(0, p0) + ' ' + wk.w.slice(p1);
      wk.drop(/\(\s*(?:КЦ|КЦП|КЦД|КЦО|КС|ПП|ПД)\s*[-.]?\s*\d[\d.,\-\s]*\)/g, true);
      if ((m = wk.take(/(?:^|[^A-ZА-Я])([AА])?\s*(III|IV|II)\s*([BВ][TТ]?|[TТ])?(?:\s*-?\s*([CС])\s*(\d+))?(?=[^A-ZА-Я0-9]|$)/))) {
        f.arm = 'А' + m[2] + (m[3] ? m[3].replace('B', 'В').replace('T', 'Т') : '') + (m[5] ? '-С' + m[5] : '');
      }
      if (!f.arm && (m = wk.take(/(?:^|[^A-ZА-Я])[CС]\s*(\d)(?![\d,.])/))) f.arm = 'С' + m[1];
      if ((m = wk.take(/(?:^|[^А-Я])ВР\s*-?\s*(\d{3,4})(?![\d])/))) f.arm = (f.arm ? f.arm + '+' : '') + 'ВР' + m[1];
      if (c.nNum >= 2) wk.drop(/\d+(?:[.,]\d+)?\s*[ХX*]\s*\d+(?:[.,]\d+)?\s*[ХX*]\s*\d+(?:[.,]\d+)?(?:\s*ММ)?/g, true);
      if ((m = /(\d+(?:,\d+)?)\s*-?\s*(?:ОЙ|ГО)\s+НАГРУЗК\S*/.exec(wk.w))) {
        if (('-' + c.code + '-').indexOf('-' + m[1] + '-') >= 0 || c.code.slice(-m[1].length) === m[1]) wk.drop(/(\d+(?:,\d+)?)\s*-?\s*(?:ОЙ|ГО)\s+НАГРУЗК\S*/g, true);
        else { f.load = m[1]; wk.drop(/(\d+(?:,\d+)?)\s*-?\s*(?:ОЙ|ГО)\s+НАГРУЗК\S*/g); }
      }
    } else if (head === 'ТРУБА' && (m = wk.take(/(?:^|[^А-Я])(?:Д|D|ДУ|Ø|ДИАМЕТРОМ)\s*[-=.]?\s*(\d+(?:[.,]\d+)?)\s*(ММ|М)?(?=[^А-Я0-9]|Х|$)/))) {
      f.h = head; f.dia = num(m[1]) + (m[2] ? m[2] : '');
    } else if ((m = wk.take(/(\d{2,4})\s*[ХX*]\s*(\d{2,4})\s*[ХX*]\s*(\d{2,4})/))) {
      f.h = head; f.dim = m[1] + 'x' + m[2] + 'x' + m[3];
    } else if (f.no) {
      f.h = head;
    } else if (f.len && head === 'БАЛКА') {
      f.h = head;
    } else if (head) {
      f.h = head; f.gen = true;
      wk.drop(/СБОРН\S*|ЖЕЛЕЗОБЕТОНН\S*|БЕТОНН\S*|ИЗДЕЛИ[ЯЙ]/g);
      wk.drop(new RegExp(ZHBI_HEADS_W[headIndex(head)][1].source + '[А-Я]*', 'g'));
      var rg = residual(wk, null);
      f.x = rg.x; a.xnum = rg.xnum; a.ign = wk.ign.length ? wk.ign : undefined;
    } else {
      return null;
    }
    if (head === 'БОРДЮР' && c && c.nNum <= 1) {
      if (/ДОРОЖН/.test(t)) f.use = 'ДОР'; else if (/ТРОТУАР/.test(t)) f.use = 'ТРОТ';
      if (/РАДИУС|КРИВОЛИН/.test(t)) f.shape = 'РАД'; else if (/УГЛОВ/.test(t)) f.shape = 'УГЛ'; else if (/ВЪЕЗД|ПОНИЖ/.test(t)) f.shape = 'ВЪЕЗД';
    }
    if (!f.gen) { var r = residual(wk, ZHBI_KNOWN); f.x = r.x; a.xnum = r.xnum; a.ign = wk.ign.length ? wk.ign : undefined; }
    var schema = [['h', ''], ['gen', 'ГЕН'], ['code', ''], ['dia', 'Д'], ['dim', ''], ['no', '№'], ['v', 'V:'], ['arm', ''], ['load', 'НАГР'], ['hgt', 'H'], ['use', ''], ['shape', ''], ['pur', 'ДЛЯ:'], ['sr', 'СС'], ['pos', ''],
      ['len', 'L'], ['vol', 'V'], ['wt', 'M'], ['ext', 'ДЛЯ-ДР'], ['dlv', ''], ['x', '~']];
    var steps = [['x', 'прочее:'], ['dlv', 'доставка'], ['ext', function () { return 'цена для других организаций'; }], ['vol', 'объем, м3'], ['wt', 'масса, т'],
      function (cur) { if (!cur.len || !cur.code) return null; var v = cur.len; cur.len = null; return 'длина, м ' + v; },
      ['pos', function (v) { return v === 'СР' ? 'средняя' : 'крайняя'; }],
      ['arm', 'класс арматуры'], ['hgt', 'высота, мм'], ['shape', 'форма'], ['use', function (v) { return v === 'ДОР' ? 'дорожный' : 'тротуарный'; }], ['load', 'нагрузка'], ['pur', 'для'], ['v', 'вариант'], ['no', 'каталожный №'],
      function (cur) { if (cur.code && a.core && cur.code !== a.core) { var v = cur.code; cur.code = a.core; return 'код ' + v + ' → ' + a.core; } return null; },
      function (cur) {
        var mm = cur.code && /^(.*\d)-(\d+(?:,\d+)?)$/.exec(cur.code);
        if (!mm || (cur.code.match(/-/g) || []).length < 2) return null;
        var v = cur.code; cur.code = mm[1]; return 'неполный код ' + v + ' → ' + mm[1];
      }];
    return build('ZHBI', schema, steps, f, a);
  }

  var NOT_MINE = new RegExp('(?:^|[^А-ЯA-Z0-9])(?:' + [
    'ДАВАЛЬЧ',
    'ГРУНТОВК', 'КРАСК', 'ЭМАЛ[ЬИ]', 'ЛАК(?:И|А)?(?=[^А-Я]|$)', 'МАСТИК', 'ШПАТЛ', 'КЛЕ[ЙЯ]', 'ГЕРМЕТ', 'ПРАЙМЕР', 'ПРОПИТ', 'ГИДРОИЗОЛ',
    'РУЛОН', 'МЕМБРАН', 'ХИМИЧЕСК\\S* ДОБАВК', 'ДОБАВК[АИ] (?:ДЛЯ|В|К)', 'ПЛАСТИФИК', 'СМАЗК', 'ЭМУЛЬСОЛ', 'РАСТВОРИТЕЛ', 'РАСТВОРЕНН', 'РАСТВОРИМ',
    'РАСТВОРОМЕШ', 'ВОДОРАСТВОР', 'ПАКЛ', 'ГИПСОКАРТ', 'ГКЛ', 'ГСП', 'ПЕРЕВОЗК', 'ПОГРУЗК', 'РАЗГРУЗК', 'УСЛУГ', 'ВОДОЭМУЛЬС', 'ШТУКАТУРК', 'ОЧИСТИТ',
    'ГИДРОФОБ', 'НАЛИВН', 'РЕМОНТН', 'ГЕОСЕТК', 'ПЕНОПОЛИСТ', 'ПЕНОПЛ', 'ПЛИТК', 'ТАКТИЛ', 'БРУСЧАТ', 'ВИБРОПРЕСС', 'АЛЮКОБОНД', 'АЛЮПАН', 'ЛЕКСАН',
    'УДОБРЕН', 'КОРМ', 'САХАР', 'МУКА', 'АММИА', 'СЕЛИТР', 'МОЧЕВИН', 'ХЛОРИД', 'СУЛЬФИД', 'НАТР', 'ADBLUE', 'УГОЛЬ', 'ЭЛЕКТРОД', 'СВЕРЛ',
    'ЩЕТК', 'АГРЕГАТ', 'НАСОС', 'МИКСЕР(?=[^Н])', 'АВТОБЕТОН', 'БЕТОНОСМЕС', 'БЕТОНОНАСОС(?:Ы|А)?(?=[^А-Я]|$)', 'ВИБРАТОР', 'КОТЕЛ', 'ГЕНЕРАТОР', 'ФИЛЬТР',
    'ГИДРОЦИКЛОН', 'ПЕСКОСТРУЙ', 'ПЕСОЧНИЦ', 'АППАРАТ', 'УСТАНОВК', 'ЗАВОД', 'ТЕРМОС', 'ЦИСТЕРН', 'ПРОВОЛОК', 'ПРОВОД(?:А|Ы)?(?=[^А-Я]|$)', 'КАБЕЛ',
    'ПРОКАТ', 'АРМАТУР', 'КАРТОН', 'ПЕНОИЗОЛ', 'ЖИДКОЕ СТЕКЛО', 'КРОШК', 'ДЕКОРАТИВН\\S* ШТУКАТ',
    '(?:СМЕСЬ\\s+СУХАЯ|СУХАЯ\\s+СМЕСЬ|СУХИЕ\\s+СМЕСИ)(?!\\s+(?:РАСТВОРН|ЦЕМЕНТН))',
    'ТРАНСПОРТ', 'ИСПЫТАН', 'ЛАБОРАТОР',
    'ЦИНК', 'НИТРАТ', 'АММОНИ', 'ПАРОНИТ', 'РЕЗИН', 'АНТИФРИЗ', 'КОРОБК', 'БЛОКНОТ', 'КОНТАКТ'
  ].join('|') + ')');

  function headText(t) {
    t = t.replace(/\(\s*ВКЛЮЧАЯ[^)]*\)/g, ' ');
    var i = t.search(/\s(?:ДЛЯ|ПОД)\s/);
    return i > 0 ? t.slice(0, i) : t;
  }

  function kindOf(t, unit) {
    var h = headText(t);
    var u = unit || '';
    if (/^ВОДА(?=[^А-Я]|$)/.test(h) && !/АММИАЧ|МИНЕРАЛЬН\S* ВОДА|ГАЗИР/.test(t)) return 'WATER';
    if (/ПОРОШОК\s+МИНЕРАЛЬН|МИНЕРАЛЬН\S*\s+ПОРОШОК|(?:^|[^А-Я])МП\s*-\s*\d/.test(h)) return 'AGG:МП';
    if ((/АСФАЛЬТ\S*\s*БЕТОН|АСФАЛЬТОБЕТОН|(?:^|[^А-Я])А\/Б\s+СМЕС|(?:^|[^А-Я])П?ЩМА(?=[^А-Я]|$)|ЩЕБЕНОЧНО-МАСТИЧН/.test(h)) && !/ЭМУЛЬСИ/.test(h)) return 'ASPH';
    if (/ЭМУЛЬСИ/.test(h) && /БИТУМ|ДОРОЖН|КАТИОН|АНИОН|ЭБ[АК]/.test(h) && !/CAPAROL|RAL|ВОДОЭМУЛЬС/.test(h)) return 'BEM';
    if (/КАТИОНН\S*\s+БИТУМ/.test(h)) return 'BEM';
    if (/(?:^|[^А-Я])БИТУМ(?:Ы|А)?(?=[^А-Я]|$)|БИТУМНО-ПОЛИМЕРН\S*\s+(?:МОДИФИЦ|ВЯЖУЩ)|(?:^|[^А-Я])(?:ПМБ|ПБВ|БНД)\s*-?\s*\d/.test(h) && !/РУЛОН|ПОЛИИЗОЛ|ГОССИПОЛ\S* СМОЛ/.test(h)) return 'BIT';
    if (/(?:^|[^А-Я])РАСТВОР(?:Ы|А)?(?=[^А-Я]|$)|ПЕСКО-?ЦЕМЕНТН|ЦЕМЕН?Т?НО-ПЕСЧ|ЦЕМЕНО-ПЕСЧ|(?:СМЕСЬ|СМЕСИ)\s+(?:СУХАЯ\s+)?РАСТВОРН|СУХАЯ\s+(?:РАСТВОРН|ЦЕМЕНТН)/.test(h) &&
      !/АЗОТН|КИСЛОТ|ВОДН\S*\s+РАСТВОР|ЩЕЛОЧ|КОЛЛОИД|ЖЕЛЕЗО|АЛЮМИНИЕВ|АЦЕТИЛЕН|РАСТВОРО-/.test(h)) return 'MORT';
    if (/(?:^|[^А-Я])(?:БЕТОН|БЕТОНЫ)(?=[^А-Я]|$)|БЕТОННАЯ\s+СМЕСЬ|СМЕС[ЬИ]\s+БЕТОНН|ПЕСКОБЕТОН|ПОЛИМЕРБЕТОН|(?:^|[^А-Я])БСТ(?=[^А-Я])/.test(h) &&
      !/Ж\s*\/\s*Б|ЖЕЛЕЗОБЕТОН|(?:^|[^А-Я])(?:ПЛИТ|БЛОК|КОЛЬЦ|ЛОТ[КО]|СВА[ИЯЙ]|БОРД|КАМЕН|КРЫШК|ПАНЕЛ|ОПОР[АЫ]|СТОЙК|ТРУБ|БАЛК|ИЗДЕЛ|КОНСТРУКЦ|ПЛОЩАДК|ПОКРЫТИ\S* ИЗ|ДОРОЖК)/.test(h)) return 'CONC';
    if (/ГПС\s+ОБРАБОТАНН|ОБРАБОТАНН\S*\s+ЦЕМЕНТОМ/.test(h)) return 'CONC';
    if (/ПОРТЛАНДЦЕМЕНТ|ШЛАКОПОРТЛАНД|КЛИНКЕР\s+ПОРТЛАНД|(?:^|[^А-Я])ЦЕМЕНТ(?=[^А-Я]|$)|(?:^|[^А-Я])(?:ПЦ|ССПЦ|ПЦТ|ПЦБ|ШПЦ)\s*[-\dIV]|(?:^|[^А-Я])ЦЕМ\s+[IV]/.test(h) &&
      !/АСБЕСТ|ХРИЗОТИЛ|ФИБРО|СТРУЖК|ЦЕМЕНТНО|ЦЕМЕНТН\S*\s+(?:ШТУКАТ|СМЕС)/.test(h)) return 'CEM';
    if (/(?:^|[^А-Я])ИЗВЕСТЬ|ИЗВЕСТЬ-ПУШОНКА|ИЗВЕСТКОВОЕ ТЕСТО/.test(h) && !/РАСТВОР|ПОБЕЛ/.test(h)) return 'LIME';
    if (/ГИПС\S*\s+(?:ВЯЖУЩ|СТРОИТЕЛЬН)|(?:^|[^А-Я])ГИПС\s+Г\s*-\s*\d|АЛЕБАСТР|(?:^|[^А-Я])ГИПС(?=$)/.test(h)) return 'GYPS';
    var aggUnit = !u || /^(м3|т|кг|1000м3|100м3|10м3|л)$/.test(u);
    if (aggUnit) {
      if (/(?:^|[^А-Я])(?:ЩЕБЕНОЧНО|ЩЕБ[ЕЁ]НОЧНО)-(?:ПЕСЧАН|ПЕЧАН)|ПЕСЧАНО-ЩЕБЕНОЧН|(?:^|[^А-Я])(?:ЩПС|ПЩС)(?=[^А-Я]|$)/.test(h)) return 'AGG:ЩПС';
      if (/(?:^|[^А-Я])ЩЕБЕНОЧНАЯ\s+СМЕСЬ/.test(h)) return 'AGG:ЩС';
      if (/(?:^|[^А-Я0-9])ЩГПС(?=[^А-Я]|$)|ЩЕБЕНОЧНО-ГРАВИЙНО-ПЕСЧАН/.test(h)) return 'AGG:ЩГПС';
      if (/ПЕСЧАНО-ГРАВИЙН|ГРАВИЙНО-ПЕСЧАН|(?:^|[^А-Я0-9])(?:ПГС|ГПС)(?=[^А-Я]|$)/.test(h) && !/ПЕРЕМЫЧ|ТИП\s+ПГС/.test(t)) return 'AGG:ПГС';
      if (/(?:^|[^А-Я])ЩЕБ[ЕЁ]Н[ЬЯ]?(?=[^А-Я]|$)|(?:^|[^А-Я])ЩЕБЕНЬ/.test(h) && !/ПЕМЗА/.test(h)) return 'AGG:ЩЕБ';
      if (/ПЕМЗА\s+ШЛАК/.test(h)) return 'AGG:ЩЕБ';
      if (/(?:^|[^А-Я])ОТСЕВ|КЛИНЕЦ/.test(h) && !/ПЕСОК/.test(h)) return 'AGG:ОТСЕВ';
      if (/(?:^|[^А-Я])ПЕС(?:ОК|КА)(?=[^А-Я]|$)/.test(h) && !/САХАР/.test(h)) return 'AGG:ПЕС';
      if (/КЕРАМЗИТ(?!О)/.test(h)) return 'AGG:КЕРАМЗИТ';
      if (/(?:^|[^А-Я])ГРАВИ[ЙЯ](?=[^А-Я]|$)/.test(h)) return 'AGG:ГРАВ';
      if (/(?:^|[^А-Я])(?:БУТ|КАМЕНЬ|КАМНИ)(?=[^А-Я]|$)/.test(h) && !/БОРТОВ|БОРДЮР|БЕТОНН|УГОЛ|ИСКУССТВ|ДЕКОР|ОБЛИЦ|СТЕНОВ|ПОДОКОН|ГРАНИТН|МРАМОР|ПРИРОДН\S* КАМЕНЬ ДЛЯ|ЖЕРНОВ|ТОЧИЛ|ШЛИФ|ИЗВЕСТНЯК/.test(h)) return 'AGG:КАМ';
      if (/(?:^|[^А-Я])ГЛИНА(?=[^А-Я]|$)/.test(h)) return 'AGG:ГЛИНА';
      if (/(?:^|[^А-Я])ДОЛОМИТ/.test(h) && !/МУКА/.test(h)) return 'AGG:ДОЛОМИТ';
      if (/(?:^|[^А-Я])ДРЕСВА/.test(h)) return 'AGG:ДРЕСВА';
    }
    if (/КИРПИЧ/.test(h) && !/ОБЛИЦОВОЧН\S* ПЛИТ|КЛАДК|ПЕЧН\S* ЛИТЬ/.test(h)) return 'BRICK';
    if (/ГАЗОБЕТОН|ГАЗОБЛОК|ПЕНОБЕТОН|ПЕНОБЛОК|ГАЗОСИЛИКАТ|ПЕНОСИЛИКАТ|ШЛАКОБЛОК|КЕРАМЗИТОБЕТОН\S*\s+БЛОК/.test(h)) return 'BLOCK';
    if (/КАМЕН\S*\s+БЕТОНН\S*\s+СТЕНОВ|БЕТОНН\S*\s+СТЕНОВ\S*\s+КАМ/.test(h)) return 'BLOCK';
    if (ownsZhbi(t, u)) return 'ZHBI';
    return null;
  }

  var QUICK = /GPS|ОГРАЖ|НАДОЛБ|БЕТОН|РАСТВОР|ЦЕМЕН|АСФАЛЬТ|А\/Б|ЩМА|БИТУМ|ЭМУЛЬС|ЩЕБ|ГРАВИ|ПЕС[ОК]|ПЕСЧ|ПГС|ГПС|ЩПС|ПЩС|ОТСЕВ|КЛИНЕЦ|КЕРАМЗИТ|ПОРОШ|ИЗВЕСТ|ГИПС|АЛЕБАСТР|КИРПИЧ|БЛОК|ВОДА|КАМЕН|КАМНИ|БУТ|ГЛИНА|ДОЛОМИТ|ДРЕСВА|ПЕМЗА|Ж\/Б|ЖБ|Ж\.Б|ЖЕЛЕЗОБ|ЖЕЛ\.|СБОРН|ПЛИТ|КОЛЬЦ|КОЛЦ|ЛОТ[КО]|СВА[ИЯЙ]|БАЛК|БОРД|БАРДЮР|БОРТ|ПЕРЕМЫЧ|ОПОР|СТОЙК|СТОЛБ|ФУНДАМ|ЛЕЖН|ЛИЖН|КРЫШК|ПАНЕЛ|МАРШ|СТУПЕН|ТРУБ|ЗВЕН|БРУС|БАШМАК|КОЛОД|ДНИЩ|СТАКАН|НАСАДК|КАРНИЗ|ГАЛЕРЕ|ГОЛОРЕ|КОСОУР|РАСПОРК|КАМЕР|РИГЕЛ|КОЛОНН|ТРАП|ПЦ|ЦЕМ|ПМБ|БНД|ФБС|БР\s?\d|ПТМ|ПН[-\s]?\d|КС[-\s]?\d|КЦ|БДО|ОТ[-\s]?\d|РП|КД\s|ГИШТ|QUM|SHEBEN|BETON|ASFALT|SEMENT|SUV|BITUM|SHMA|CHAQIQ|ҚУМ|ЧАҚИҚ|ҚОРИШМА|QORISHMA/;

  function prepared(name, unit) {
    var full = prep(name);
    var t = tailOf(full);
    return t;
  }

  function owns(name, unit, section) {
    if (section === 'machines' || section === 'labor' || section === 'transport') return false;
    if (unit === 'маш-ч' || unit === 'чел-ч' || unit === 'т-км') return false;
    var raw = String(name == null ? '' : name).toUpperCase();
    if (!QUICK.test(raw) && !ZHBI_CODES.test(raw) && !/БЛ\.\s*ПР/.test(raw)) return false;
    var t = prepared(name, unit);
    if (NOT_MINE.test(headText(t))) return false;
    return kindOf(t, unit) !== null;
  }

  function parse(name, unit, section) {
    if (!owns(name, unit, section)) return null;
    var t = prepared(name, unit);
    var k = kindOf(t, unit);
    var p = null;
    if (k === 'CONC') p = parseConc(t);
    else if (k === 'MORT') p = parseMort(t);
    else if (k === 'ASPH') p = parseAsph(t);
    else if (k === 'BIT') p = parseBit(t);
    else if (k === 'BEM') p = parseBem(t);
    else if (k === 'CEM') p = parseCem(t);
    else if (k === 'LIME') p = parseLime(t);
    else if (k === 'GYPS') p = parseGyps(t);
    else if (k === 'BRICK') p = parseBrick(t);
    else if (k === 'BLOCK') p = parseBlock(t);
    else if (k === 'WATER') p = parseWater(t);
    else if (k === 'ZHBI') p = parseZhbi(t);
    else if (k && k.indexOf('AGG:') === 0) p = parseAgg(t, k.slice(4));
    return p;
  }

  var HARD = {
    CONC: ['t', 'base', 'sr', 'btb'],
    MORT: ['b'],
    ASPH: ['k', 'sp', 'shma', 'temp', 'gr', 'dn', 'ty'],
    BIT: ['st', 'dom', 'c', 'g'],
    BEM: ['ch', 'cl'],
    CEM: ['k', 'sr', 'code', 'c'],
    LIME: ['k', 'h'],
    GYPS: ['g'],
    AGG: ['k', 'o', 'fr', 'gd', 'sz'],
    BRICK: ['mt', 'code', 'dim', 'fmt'],
    BLOCK: ['mt', 'dim'],
    WATER: ['q'],
    ZHBI: ['code', 'h', 'dim', 'v', 'dia', 'gen']
  };
  function codePrefix(x, y) {
    if (!x || !y) return false;
    var s = x.length < y.length ? x : y, l = x.length < y.length ? y : x;
    return l.indexOf(s + '-') === 0;
  }
  var ZHBI_HEAD_APART = (function () {
    var o = {}, pairs = [['КОЛОДЕЦ', 'КОЛЬЦО'], ['КОЛОДЕЦ', 'ПЛИТ'], ['КОЛОДЕЦ', 'ДНИЩЕ'], ['КОЛОДЕЦ', 'КРЫШКА'], ['КРЫШКА', 'ЛОТОК'], ['КРЫШКА', 'КОЛЬЦО'],
      ['СВАЯ', 'СТОЙКА'], ['ЛОТОК', 'ПЛИТ']];
    for (var i = 0; i < pairs.length; i++) { o[pairs[i][0] + '/' + pairs[i][1]] = 1; o[pairs[i][1] + '/' + pairs[i][0]] = 1; }
    return o;
  })();
  function conflict(a, b) {
    if (!a || !b) return null;
    if (a.family !== 'mineral' || b.family !== 'mineral') return 'другое семейство';
    var A = a.attrs || {}, B = b.attrs || {};
    if (A.kind !== B.kind) return 'другой материал: ' + A.kind + ' / ' + B.kind;
    var hard = HARD[A.kind] || [];
    for (var i = 0; i < hard.length; i++) {
      var k = hard[i];
      if (A[k] !== undefined && B[k] !== undefined && A[k] !== null && B[k] !== null && String(A[k]) !== String(B[k])) {
        if (A.kind === 'ZHBI' && k === 'code' && (A.core === B.core || codePrefix(A.core, B.core)) && (A.code === A.core || B.code === B.core)) continue;
        return k + ': ' + A[k] + ' ≠ ' + B[k];
      }
    }
    if (A.kind === 'CONC' && A.st && B.st && !strengthCompatible(A.st, B.st)) return 'класс/марка: ' + A.st.s + ' ≠ ' + B.st.s;
    if ((A.kind === 'CONC' || A.kind === 'CEM' || A.kind === 'ZHBI') && !!A.sr !== !!B.sr) return 'сульфатостойкий ≠ обычный';
    if (A.kind === 'AGG' && (A.o === 'КВАРЦ') !== (B.o === 'КВАРЦ')) return 'кварцевый ≠ строительный песок';
    if (A.kind === 'MORT' && A.g && B.g && A.g !== B.g) return 'марка/состав: ' + A.g + ' ≠ ' + B.g;
    if (A.kind === 'CEM' && A.m && B.m && A.m !== B.m) return 'марка: ' + A.m + ' ≠ ' + B.m;
    if (A.kind === 'CEM' && !A.c && !B.c && A.m && B.m && A.m !== B.m) return 'марка';
    if (A.kind === 'CEM') {
      var ca = A.c || (A.m && CEM_MARK_CLASS[A.m]), cb = B.c || (B.m && CEM_MARK_CLASS[B.m]);
      if (ca && cb && ca !== cb) return 'класс прочности: ' + ca + ' ≠ ' + cb;
    }
    if (A.kind === 'ZHBI' && A.core && B.core && A.core !== B.core && !codePrefix(A.core, B.core)) return 'код: ' + A.core + ' ≠ ' + B.core;
    if (A.kind === 'ZHBI' && A.head && B.head && A.head !== B.head && ZHBI_HEAD_APART[A.head + '/' + B.head]) return 'изделие: ' + A.head + ' ≠ ' + B.head;
    if (A.kind === 'ZHBI' && A.no && B.no && A.no !== B.no) return '№: ' + A.no + ' ≠ ' + B.no;
    if (A.xnum && B.xnum && A.xnum !== B.xnum) return 'другие числа: ' + A.xnum + ' ≠ ' + B.xnum;
    return null;
  }

  var api = {
    id: 'mineral',
    version: VERSION,
    owns: owns,
    parse: parse,
    conflict: conflict,
    _prep: prep,
    _kindOf: function (name, unit) { return kindOf(prepared(name, unit), unit); },
    _findCode: findCode,
    CLASS_MARK: CLASS_MARK,
    CEM_MARK_CLASS: CEM_MARK_CLASS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MineralFamily = api;
})(this);
