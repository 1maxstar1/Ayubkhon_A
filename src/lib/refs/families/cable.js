/*
 * Family parser «cable» (ES5 plain script; sets the global `CableFamily`): power, control and communication cables,
 * installation wires and cords, self-supporting insulated wire, bare overhead wire, winding wire, LAN and optical
 * cable.
 *
 *   owns(name, unit, section)  -> true when the name is a cable or wire sold by length or mass
 *   parse(name, unit, section) -> { family: 'cable', key, attrs, levels } | null
 *   conflict(a, b)             -> null | reason: never match, even at a relaxed level
 *
 * key = exact identity: every number the name prints stays in it (cores, section, extra cores, screen, pairs, wire
 * diameter, voltage, category, fibre count); `levels` are relaxed keys, each listing what it dropped. A different
 * section, core count or construction never shares a level. Mark tables are generic cable vocabulary.
 * Comments that named where an entry was seen are kept privately in the reference kit; the code is unchanged from
 * the measured version and changes only with the parity measurement (test/refs-parity.cjs).
 */
(function (root) {
  'use strict';

  var MARKS = {
    power: [
      'ВВГ', 'ВВГ-П', 'ВВГЗ', 'ВВГЭ', 'ВББШВ', 'ВБВ', 'ВВБ', 'ВВБГ', 'ВБЛ',
      'ПВВГ', 'ПВВ', 'ПВП', 'ПВПУ', 'ПВПУ2Г', 'ПВП2Г', 'ПВПГ', 'ПВБВ', 'ПВБП', 'ПВБПУ', 'ПВКП',
      'СБ', 'СБГ', 'СБШВ', 'СБЛ', 'СШВ', 'СГ',
      'КГ', 'КГЭ', 'КГН', 'КГТП', 'КГХЛ', 'РПШ', 'РПШЭ',
      'ППГ', 'ППГЭ', 'ППСТВМ', 'ППСРВМ', 'ПВЭВ',
      'NYM', 'NYM-J', 'NYM-O'
    ],
    control: [
      'КВВГ', 'КВВГЭ', 'КВВГЗ', 'КВББШВ', 'КВПББШВ', 'КВПБШВ', 'КРВГ', 'КРВГЭ', 'КВВ',
      'КППГ', 'КГВВ', 'КУГВВ',
      'МКЭШ', 'МКЭШВ', 'МКШ', 'МКЭКШ'
    ],
    wire: [
      'ПВ1', 'ПВ2', 'ПВ3', 'ПВ4', 'ПВ5', 'ПУВ', 'ПУГВ', 'ПУВ-3', 'АПВ', 'АПУВ', 'АПУГВ',
      'ПВВП', 'ПУНП', 'АПУНП', 'ПУГНП', 'ПУН', 'АПУН', 'ППВ', 'АППВ', 'ППБН', 'АППБН',
      'ВПП', 'ВПВ', 'ВП', 'ГСП', 'ППС', 'ПКСВ', 'РКГМ', 'ПРКА', 'ПВКВ', 'ПВКФ', 'ТРБН',
      'PV1-F', 'H07RN-F',
      'ПВ',
      'ПВС', 'ШВВП', 'ШВЛ', 'ШРО', 'ПРС'
    ],
    sip: ['СИП-1', 'СИП-1А', 'СИП-2', 'СИП-2А', 'СИП-3', 'СИП-4', 'СИП-5', 'СИП'],
    comm: [
      'ТППЭП', 'ТППЭПЗ', 'ТППЭПЗПС', 'ТППЭПББШП', 'ТППЭПБ', 'ТПП', 'ТПВ', 'ТСВ', 'ТРП', 'ТРВ',
      'КСПВ', 'КСПВЭ', 'КСВВ', 'КСВВЭ', 'КСПП', 'ККВ', 'ККВЭ', 'ККВ-В', 'ККВГ',
      'КВСПВ', 'КВСПВЭ', 'КВСПП', 'КВСППЭ', 'КВСППТ', 'КВСППЭТ',
      'ЗКП', 'ЗКПМ', 'КС', 'МКС', 'СБПУ', 'СБЗПУ', 'СБЗПУЭ', 'ПРППМ', 'ПРППМОК',
      'РК', 'RG-6', 'RG-59', 'RG-11', 'КПСВВ', 'КПСВЭВ', 'КПСЭ', 'КСРВ', 'КСРЭВ'
    ],
    winding: [
      'ПЭТВ-2', 'ПЭТВ-1', 'ПЭТВ', 'ПЭТ-155', 'ПЭТ-200', 'ПЭЭА-130', 'ПЭЭА-155', 'ПЭВ-1', 'ПЭВ-2',
      'ПЭТВМ', 'ПЭЛ', 'ПСД', 'ПСДКТ', 'ПЭТД', 'ПВДП', 'ПВДПО', 'ППО'
    ],
    bare: ['АС', 'АСК', 'АСКП', 'АСКС', 'АН', 'АЖ', 'А', 'АТ', 'АМ', 'М', 'МГ', 'МГЭ', 'МФ', 'МТ', 'ПС', 'ПСО', 'ПМС']
  };
  var AL_PREFIX_KINDS = { power: 1, control: 1 };

  var MARK_SYN = {
    'ВБШВ': 'ВББШВ',
    'АВБШВ': 'АВББШВ',
    'КВБШВ': 'КВББШВ',
    'АКВБШВ': 'АКВББШВ',
    'ПВ-1': 'ПВ1', 'ПВ-2': 'ПВ2', 'ПВ-3': 'ПВ3', 'ПВ-4': 'ПВ4', 'ПВ-5': 'ПВ5',
    'ПВЗ': 'ПВ3',
    'ПВ-З': 'ПВ3',
    'СИП1': 'СИП-1', 'СИП2': 'СИП-2', 'СИП3': 'СИП-3', 'СИП4': 'СИП-4', 'СИП5': 'СИП-5', 'СИП2А': 'СИП-2А',
    'ВВГП': 'ВВГ-П', 'АВВГП': 'АВВГ-П',
    'NYM-О': 'NYM-O', 'NYMO': 'NYM-O', 'NYMJ': 'NYM-J',
    'PV-1F': 'PV1-F', 'PV1F': 'PV1-F', 'SOLARPV-1F': 'PV1-F'
  };

  var MARK_CLASS = {
    'ПВ1': 'W1-CU', 'ПУВ': 'W1-CU',
    'ПВ3': 'W3-CU', 'ПУГВ': 'W3-CU', 'ПУВ-3': 'W3-CU',
    'АПВ': 'W1-AL', 'АПУВ': 'W1-AL'
  };

  var KIND_OF = {};
  var AL_MARK = {};
  var ALL = [];
  (function () {
    var k, i, m;
    for (k in MARKS) {
      if (!MARKS.hasOwnProperty(k)) continue;
      for (i = 0; i < MARKS[k].length; i++) {
        m = MARKS[k][i];
        KIND_OF[m] = k; ALL.push(m);
        if (AL_PREFIX_KINDS[k] && m.charAt(0) !== 'А' && /^[А-Я]/.test(m)) {
          KIND_OF['А' + m] = k; AL_MARK['А' + m] = true; ALL.push('А' + m);
        }
      }
    }
    var al = ['АПВ', 'АПУВ', 'АПУГВ', 'АПУНП', 'АПУН', 'АППВ', 'АППБН', 'АС', 'АСК', 'АСКП', 'АСКС', 'АН', 'АЖ', 'А', 'АТ', 'АМ',
      'ААБЛ', 'ААШВ', 'ААБ2Л', 'ААБЛГ', 'ААШП'];
    for (i = 0; i < al.length; i++) AL_MARK[al[i]] = true;
    var aa = ['ААБЛ', 'ААШВ', 'ААБ2Л', 'ААБЛГ', 'ААШП'];
    for (i = 0; i < aa.length; i++) { KIND_OF[aa[i]] = 'power'; ALL.push(aa[i]); }
    for (m in MARK_SYN) if (MARK_SYN.hasOwnProperty(m)) { ALL.push(m); KIND_OF[m] = KIND_OF[MARK_SYN[m]]; if (AL_MARK[MARK_SYN[m]]) AL_MARK[m] = true; }
    ALL.sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
  })();
  var STEEL_MARK = { 'ПС': 1, 'ПСО': 1, 'ПМС': 1 };

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'); }

  var MARK_RE = new RegExp(
    '(^|[^А-ЯA-Z0-9])(' + ALL.filter(function (m) { return !/^(А|АС|АСК|АСКП|АСКС|АН|АЖ|АТ|АМ|М|МГ|МГЭ|МФ|МТ|ПС|ПСО|ПМС)$/.test(m); })
      .map(esc).join('|') + ')' +
    '(-?П(?=НГ|-?НГ|[^А-Я]|$))?' +
    '(\\s?-?НГ(?:\\s?\\((?:А|В|С|Д)\\))?)?' +
    '(?:\\s?-?\\s?(FRLS|FRHF|LSLTX|LS|HF|LTX|FR)(?![A-Z]))?' +
    '(-?П(?![А-Я]))?' +
    '(-?ХЛ|-Т(?![А-Я]))?' +
    '(?![А-ЯA-Z])', 'g');

  var HOMO_L2C = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
  var LATIN_KEEP = { CAT: 1, PE: 1, PVC: 1, UTP: 1, FTP: 1, STP: 1, SFTP: 1, NYM: 1, TV: 1, KV: 1, LS: 1, HF: 1, FRLS: 1, FRHF: 1, LTX: 1 };

  function fixToken(t) {
    var hasCyr = /[А-Я]/.test(t), letters = t.replace(/[^A-ZА-Я]/g, '');
    if (!hasCyr) {
      if (!letters || LATIN_KEEP[letters] || /[^ABCEHKMOPTXY]/.test(letters.replace(/[А-Я]/g, ''))) return t;
      if (letters.length > 4) return t;
    }
    var keep = [];
    t = t.replace(/FRLS|FRHF|LSLTX|LS|HF|LTX|CAT|PVC|PE(?![A-Z])/g, function (m) { keep.push(m); return '\u0001' + (keep.length - 1) + '\u0002'; });
    t = t.replace(/[ABCEHKMOPTXY]/g, function (c) { return HOMO_L2C[c]; });
    return t.replace(/\u0001(\d+)\u0002/g, function (m, i) { return keep[+i]; });
  }

  function prep(name) {
    var s = String(name == null ? '' : name).toUpperCase().replace(/Ё/g, 'Е');
    s = s.replace(/[–—−]/g, '-').replace(/²/g, '2').replace(/ /g, ' ');
    s = s.replace(/(\d),(?=\d)/g, '$1.');
    s = s.replace(/(\d)\s*\(\s*(ОК|ОЖ|МК|МС|МЖ|ОС)\s*\)\s*[XХ×*]\s*(?=\d)/g, '$1x');
    s = s.replace(/(\d)\s*[XХ×*]\s*(?=\d|\()/g, '$1x');
    s = s.replace(/\)\s*[XХ×*]\s*(?=\d)/g, ')x');
    s = s.replace(/\s+/g, ' ').trim();
    var parts = s.split(' '), i;
    for (i = 0; i < parts.length; i++) parts[i] = fixToken(parts[i]);
    s = parts.join(' ');
    s = s.replace(/(\d)\s*[XХ]\s*(?=\d|\()/g, '$1x');
    s = s.replace(/NYM\s*-?\s*(J|O|О)(?![A-ZА-Я])/g, function (m, c) { return 'NYM-' + (c === 'J' ? 'J' : 'O'); });
    s = s.replace(/(?:SOLAR\s*)?PV\s*-?\s*1\s*-?\s*F(?![A-Z])/g, 'PV1-F');
    s = s.replace(/(^|[^А-Я])СИП\s*-?\s*(\d)(А?)(?![\dx.])/g, '$1СИП-$2$3');
    s = s.replace(/(^|[^А-Я])(А?)П\s*В\s*-?\s*З(?![А-Я])/g, '$1$2ПВ3');
    s = s.replace(/(^|[^А-Я])ПВ\s+([1-5])\s+(?=\d)/g, '$1ПВ$2 ');
    s = s.replace(/МАРКИ(?=[А-ЯA-Z])/g, 'МАРКИ ');
    s = s.replace(/(^|[^А-Я])(А?ВВГ)\s+-\s*П(?=НГ|[^А-Я]|$)/g, '$1$2-П');
    return s;
  }

  var HEAD_RE = /^(КАБЕЛЬ|КАБЕЛИ|КАБЕЛЯ|ПРОВОД|ПРОВОДА|ШНУР|СИП|КАБЕЛ)$/;
  var NOT_CABLE_RE = /КАБЕЛЬ\s*-?\s*КАНАЛ(?![А-Я])|КАБЕЛЬНЫЙ\s+КАНАЛ|КАНАЛ\s+КАБЕЛЬН|ПАТЧ|ПИГТЕЙЛ|PIGTAIL|С ВИЛКОЙ|ВИЛКОЙ|РОЗЕТК|POWER CORD|ПЕРЕХОДНИК|НАКОНЕЧНИК|МУФТ|ЗАЖИМ|КРОНШТЕЙН|ХОМУТ|ЛОТОК|ОРГАНАЙЗЕР|СТЯЖК|БИРК|ТЕСТЕР|ТРЕКЕР|ДЕФЕКТОСКОП|ГИЛЬЗ|КОЛОДЕЦ|УКАЗАТЕЛ/;
  var ELECTRIC_CORD_RE = /ШНУР\s+(ШВВП|ПВС|ШВЛ|ШРО|ПРС|СЕТЕВ|ПИТАН|ЭЛЕКТР|СОЕДИН)/;
  var UNIT_OK = { 'м': 1, 'км': 1, 'кг': 1, 'т': 1, 'г': 1 };
  var SECTION_NO = { labor: 1, machines: 1, transport: 1 };

  function unitOk(unit) {
    if (unit == null || unit === '') return true;
    var u = String(unit).toLowerCase().replace(/[\s.]/g, '');
    if (UNIT_OK[u]) return true;
    if (/^\d+(м|км)$/.test(u)) return true;
    if (/^(метр|пм|погм|километр|тн|тонна|килограмм)$/.test(u)) return true;
    return false;
  }

  function words(s) { return s.split(/[^А-ЯA-Z0-9\-]+/).filter(function (w) { return w; }); }

  var NF_WIRE_RE = /ПРОВОЛОК[А-Я]*\s+(?:ИЗ\s+)?(?:МЕДН|АЛЮМИН|(?:АТ|АМ|ММ|МТ)\s*\d)|ПРОВОЛОК[А-Я]*[А-Я ,]*ЭЛЕКТРОТЕХНИЧ/;
  var STEEL_WIRE_RE = /СТАЛ|СТ\.|ОЦИНК|СВАРОЧ|ВЯЗАЛ|ПОРОШК|КАНАТ|ЛЕГИРОВ|НИЗКОУГЛЕРОД/;
  function nfWire(s) { return /^\S*\s*ПРОВОЛОК|^ПРОВОЛОК/.test(s) && NF_WIRE_RE.test(s) && !STEEL_WIRE_RE.test(s); }

  function parseWire(s) {
    var m = /(?:ПРОВОЛОК[А-Я]*|ЭЛЕКТРОТЕХНИЧЕСК[А-Я]*|МАРКИ)\s+(АТ|АМ|ММ|МТ)(?![А-Я])/.exec(s);
    var mark = m ? m[1] : null;
    var material = /МЕДН/.test(s) || mark === 'ММ' || mark === 'МТ' ? 'CU' : (/АЛЮМИН/.test(s) || mark === 'АТ' || mark === 'АМ' ? 'AL' : null);
    if (!material) return null;
    var d = /(\d+(?:\.\d+)?)\s*(?:ММ)?\s*-\s*(\d+(?:\.\d+)?)\s*ММ/.exec(s) || /ДИАМЕТР[А-Я]*\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/.exec(s) ||
      /(\d+(?:\.\d+)?)\s*ММ(?![А-Я0-9])/.exec(s);
    if (!d) return null;
    var size = 'D' + num(d[1]) + (d[2] ? '-' + num(d[2]) : '');
    var key = 'CABLE|' + (mark || 'WIRE-' + material) + '|' + size;
    var levels = mark ? [{ key: 'CABLE|WIRE-' + material + '|' + size, drop: ['марка (' + mark + ')'] }] : [];
    return { key: key, levels: levels, attrs: { kind: 'bare', group: 'B', mark: mark, material: material, d: num(d[1]), range_hi: d[2] ? num(d[2]) : null } };
  }

  function cableText(s) {
    if (NOT_CABLE_RE.test(s)) return false;
    if (nfWire(s)) return true;
    var w = words(s), i, n = Math.min(w.length, 4);
    for (i = 0; i < n; i++) {
      if (HEAD_RE.test(w[i])) {
        if (w[i] === 'ШНУР' && !ELECTRIC_CORD_RE.test(s)) return false;
        return true;
      }
    }
    MARK_RE.lastIndex = 0;
    var m = MARK_RE.exec(s);
    if (m && m.index === 0 && /\d/.test(s)) return true;
    if (/^(U\/UTP|F\/UTP|UTP|FTP|SFTP|S\/FTP)\b/.test(s)) return true;
    return false;
  }

  function cablePart(s) {
    var k = s.lastIndexOf(': ');
    if (k > 0) {
      var tail = s.slice(k + 2);
      if (cableText(tail)) return { text: tail, from: 'tail' };
    }
    return cableText(s) ? { text: s, from: 'name' } : null;
  }

  var memoName = null, memoPart = null;
  function partOf(name) {
    var n = String(name == null ? '' : name);
    if (n !== memoName) { memoName = n; memoPart = cablePart(prep(n)); }
    return memoPart;
  }

  function owns(name, unit, section) {
    if (section && SECTION_NO[section]) return false;
    if (!unitOk(unit)) return false;
    return !!partOf(name);
  }

  function num(x) {
    var v = parseFloat(String(x).replace(',', '.'));
    if (!isFinite(v)) return null;
    return String(Math.round(v * 10000) / 10000);
  }

  var KV_OK = { '0.25': 1, '0.3': 1, '0.38': 1, '0.4': 1, '0.45': 1, '0.5': 1, '0.6': 1, '0.66': 1, '0.69': 1, '0.75': 1,
    '1': 1, '1.5': 1, '3': 1, '4': 1, '6': 1, '10': 1, '15': 1, '20': 1, '30': 1, '35': 1, '110': 1 };
  var VOLT_OK = { '380': 1, '400': 1, '450': 1, '500': 1, '660': 1, '750': 1, '1000': 1, '3000': 1, '6000': 1, '10000': 1 };

  function kvValue(a, b, c, unit) {
    var u = num(b != null && b !== '' ? b : a);
    if (u === null) return null;
    if (unit === 'В') {
      if (!VOLT_OK[u] || (b != null && b !== '')) return null;
      u = num(+u / 1000);
      return KV_OK[u] ? { spec: u, cls: u } : null;
    }
    if (!KV_OK[u]) return null;
    var spec = (b != null && b !== '') ? num(a) + '/' + u : u;
    if (c != null && c !== '') spec += '(' + num(c) + ')';
    return { spec: spec, cls: u };
  }

  var NUM = '(\\d+(?:\\.\\d+)?)';
  var KV_FREE_RE = new RegExp(NUM + '(?:\\s*\\/\\s*' + NUM + ')?(?:\\s*\\(' + NUM + '\\))?\\s*(КВ|KV)(?![А-ЯA-Z])', 'g');
  var VOLT_FREE_RE = /(\d{3,5})\s*В(?![А-ЯA-Z])/g;
  var KV_AFTER_RE = new RegExp('^\\s*-\\s*' + NUM + '(?:\\s*\\/\\s*' + NUM + ')?(?:\\s*\\(' + NUM + '\\))?\\s*(КВ|KV|В)?(?![А-ЯA-Z0-9x])');
  var KV_MARK_RE = new RegExp('^\\s*-?\\s*' + NUM + '(?:\\s*\\/\\s*' + NUM + ')?\\s*(КВ|KV|В)?(?![0-9x.])');
  var TAIL_RE = /^\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?![\d.x])/;

  function kvFree(s) {
    var m, out = [];
    KV_FREE_RE.lastIndex = 0;
    while ((m = KV_FREE_RE.exec(s))) { var v = kvValue(m[1], m[2], m[3], 'КВ'); out.push(v || { bad: m[0] }); }
    VOLT_FREE_RE.lastIndex = 0;
    while ((m = VOLT_FREE_RE.exec(s))) { var w = kvValue(m[1], null, null, 'В'); if (w) out.push(w); }
    return out;
  }

  var SHAPE_RE = /^\s*(?:\(\s*)?(ОЖ|ОК|МЖ|МК|МС|ОС|СЖ|СК)(?![А-Я])(?:\s*\))?/;
  var SHAPE_SYN = { 'ОЖ': 'ОК', 'ОК': 'ОК', 'МЖ': 'МК', 'МК': 'МК', 'МС': 'МС', 'ОС': 'ОС', 'СЖ': 'СЖ', 'СК': 'СК' };
  var ROLE_RE = /^\s*\(\s*(N|РЕ|PE|N\s*,\s*(?:РЕ|PE)|N\s*,\s*PE|ПЕ|З|ЗЕМЛ)\s*\)|^\s*(?:РЕ|PE)(?![А-ЯA-Z])/;
  var UNIT_DECOR_RE = /^\s*(?:ММ2|ММ\.?\s*КВ\.?|КВ\.?\s*ММ|ММ)(?![А-Я])\.?/;

  var TERM = new RegExp('^' + NUM + 'x(?:\\(\\s*' + NUM + 'x' + NUM + '\\s*\\)(Э)?|' + NUM + '(?:x' + NUM + ')?)');
  var SCREEN_RE = new RegExp('^\\s*\\/\\/?\\s*(?:(ОК|МК|МС|ОЖ|МЖ)\\s*)?' + NUM + '(?![.\\d]*x)');
  var SCREEN2_RE = new RegExp('^\\s*\\/\\s*' + NUM + '(?![.\\d]*x)');

  function readSize(s, i) {
    var terms = [], shapes = [], roles = [], screen = null, pos = i, m, re;
    for (;;) {
      re = TERM.exec(s.slice(pos));
      if (!re) break;
      var t = { n: num(re[1]), shapes: [], roles: [] };
      if (re[2] != null) { t.a = num(re[2]); t.b = num(re[3]); t.paren = true; }
      else { t.a = num(re[5]); if (re[6] != null) t.b = num(re[6]); }
      pos += re[0].length;
      for (var guard = 0; guard < 6; guard++) {
        var rest = s.slice(pos);
        if ((m = SHAPE_RE.exec(rest))) { t.shapes.push(SHAPE_SYN[m[1]]); shapes.push(SHAPE_SYN[m[1]]); pos += m[0].length; continue; }
        if ((m = ROLE_RE.exec(rest))) {
          var role = (m[1] || 'PE').replace(/\s/g, '').replace(/РЕ|ПЕ/g, 'PE');
          t.roles.push(role); roles.push(role); pos += m[0].length; continue;
        }
        if ((m = UNIT_DECOR_RE.exec(rest))) { pos += m[0].length; continue; }
        if ((m = /^Э(?![А-Я])/.exec(rest)) && t.b != null) { t.e = true; pos += m[0].length; continue; }
        if ((m = /^[,.](\d+)(?![\d.x])/.exec(rest))) { t.stray = (t.stray || '') + ',' + m[1]; pos += m[0].length; continue; }
        break;
      }
      if (terms.length === 0 && (m = SCREEN_RE.exec(s.slice(pos)))) {
        screen = num(m[2]); pos += m[0].length;
        while ((m = UNIT_DECOR_RE.exec(s.slice(pos))) || (m = SHAPE_RE.exec(s.slice(pos)))) pos += m[0].length;
        if ((m = SCREEN2_RE.exec(s.slice(pos)))) {
          if (num(m[1]) !== screen) screen = screen + '/' + num(m[1]);
          pos += m[0].length;
        }
      }
      terms.push(t);
      if ((m = /^\s*[+\-]\s*(?=\d+(?:\.\d+)?x\d)/.exec(s.slice(pos)))) { pos += m[0].length; continue; }
      break;
    }
    if (!terms.length) return null;
    return { terms: terms, screen: screen, shapes: shapes, roles: roles, start: i, end: pos };
  }

  function termText(t, withShape) {
    return t.n + 'x' + t.a + (t.b != null ? 'x' + t.b : '') + (t.stray || '') +
      (withShape && t.shapes.length ? t.shapes.join('') : '') + (withShape && t.roles.length ? '(' + t.roles.join(',') + ')' : '');
  }
  function sizeText(sz, withScreen, withShape) {
    var out = [], i;
    for (i = 0; i < sz.terms.length; i++) out.push(termText(sz.terms[i], withShape));
    return out.join('+') + (withScreen && sz.screen ? '/' + sz.screen : '');
  }

  function findSize(s, from) {
    var re = /\d+(?:\.\d+)?x[\d(]/g, m;
    re.lastIndex = from || 0;
    while ((m = re.exec(s))) {
      var prev = m.index > 0 ? s.charAt(m.index - 1) : ' ', prev2 = m.index > 1 ? s.charAt(m.index - 2) : ' ';
      if (/[0-9]/.test(prev) || (prev === '.' && /[0-9]/.test(prev2))) continue;
      var sz = readSize(s, m.index);
      if (sz) return sz;
    }
    return null;
  }

  function canonMark(m) {
    m = m.replace(/\s+/g, '');
    return MARK_SYN[m] || m;
  }

  function fireCanon(ng, word) {
    var f = '';
    if (ng) f = 'НГ' + (/\(([А-Я])\)/.test(ng) ? '(' + /\(([А-Я])\)/.exec(ng)[1] + ')' : '');
    if (word) f += (f ? '-' : '-') + word;
    return f;
  }

  function findMarks(s) {
    var out = [], m;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(s))) {
      var start = m.index + m[1].length, raw = m[2];
      var mark = canonMark(raw);
      var end = m.index + m[0].length;
      if (/^КВСП|^КСП/.test(mark)) {
        var cat = /^-(\d)([ЕEАA]?)(?![\dx.А-ЯA-Z])/.exec(s.slice(end));
        if (cat) { mark += '-' + cat[1] + (cat[2] ? (/[ЕE]/.test(cat[2]) ? 'Е' : 'А') : ''); end += cat[0].length; }
      }
      var flat = !!(m[3] || m[6]);
      if (flat) {
        if (KIND_OF[mark + '-П'] || /^(А?ВВГ|А?ВВГЗ)$/.test(mark)) mark = mark + '-П';
        else flat = false;
      }
      var fire = fireCanon(m[4], m[5]);
      out.push({ mark: mark, kind: KIND_OF[canonMark(raw)] || KIND_OF[mark] || 'power', fire: fire,
        env: m[7] ? 'ХЛ' : '', start: start, end: end, raw: raw });
      if (MARK_RE.lastIndex === m.index) MARK_RE.lastIndex++;
    }
    return out;
  }

  var LAN_RE = /(U\/UTP|F\/UTP|SF\/UTP|S\/FTP|U\/FTP|F\/FTP|SFTP|UTP|FTP|STP)/;
  function parseLan(s) {
    var m = LAN_RE.exec(s);
    if (!m) return null;
    var scr = m[1];
    if (scr === 'U/UTP') scr = 'UTP';
    if (scr === 'F/UTP') scr = 'FTP';
    var cat = null, c;
    if ((c = /CAT\.?\s*-?\s*(\d)\s*([EЕAА])?(?![A-ZА-Я0-9])/.exec(s)) ||
        (c = /(\d)\s*([EЕAА])?\s*-?\s*(?:CAT|КАТ)(?![A-ZА-Я])/.exec(s)) ||
        (c = /(?:КАТ|КАТЕГОРИ[ИЯ])\.?\s*(\d)\s*([EЕAА])?(?![A-ZА-Я0-9])/.exec(s))) {
      cat = c[1] + (c[2] ? (/[EЕ]/.test(c[2]) ? 'E' : 'A') : '');
    }
    var pairs = null, d = null, p;
    if ((p = /(\d+)x2x(\d+(?:\.\d+)?)/.exec(s))) { pairs = num(p[1]); d = num(p[2]); }
    else if ((p = /(\d+)\s*ПАР/.exec(s))) pairs = num(p[1]);
    var jacket = null;
    if (/(^|[^A-Z])PVC(?![A-Z])|ПВХ/.test(s)) jacket = 'PVC';
    else if (/(^|[^A-ZА-Я])(PE|РЕ)(?![A-ZА-Я])|ПОЛИЭТИЛЕН/.test(s)) jacket = 'PE';
    else if (/ВНЕШН|НАРУЖН/.test(s)) jacket = 'OUT';
    else if (/ВНУТР/.test(s)) jacket = 'IN';
    if (!cat && !pairs) return null;
    var key = ['CABLE', 'LAN', scr, 'CAT' + (cat || '?'), (pairs || '?') + 'P', d || '-', jacket || '-'].join('|');
    var levels = [];
    if (jacket) levels.push({ key: ['CABLE', 'LAN', scr, 'CAT' + (cat || '?'), (pairs || '?') + 'P', d || '-', '-'].join('|'), drop: ['оболочка'] });
    if (d) levels.push({ key: ['CABLE', 'LAN', scr, 'CAT' + (cat || '?'), (pairs || '?') + 'P', '-', '-'].join('|'), drop: ['оболочка', 'диаметр жилы'] });
    levels.push({ key: ['CABLE', 'LAN', 'CAT' + (cat || '?'), (pairs || '?') + 'P'].join('|'), drop: ['экран', 'оболочка', 'диаметр жилы'] });
    return { key: key, levels: levels, attrs: { kind: 'lan', screen: scr, cat: cat, pairs: pairs, d: d, jacket: jacket, group: 'C' } };
  }

  var OPTIC_RE = /ОПТИЧ|ОПТИК|ВОЛОКОН|FTTH|FTTX|ADSS|(^|[^А-Я])(ОКЛ|ОКГ|ОКБ|ОКСН|ОКК)(?![А-Я])/;
  function parseOptic(s) {
    if (!OPTIC_RE.test(s)) return null;
    var n = null, m, extra = '';
    if ((m = /ADSS-(\d+(?:\.\d+)?)-(\d+)/.exec(s))) { n = num(m[2]); extra = m[1] + 'KN'; }
    else if ((m = /(\d+)\s*-?\s*(?:Х\s*)?(?:ВОЛОК|ВОК(?![А-Я])|ОВ(?![А-Я])|F(?![A-Z])|ВОЛ\.)/.exec(s))) n = num(m[1]);
    else if ((m = /ВОЛОК[А-Я]*\s*[:\-]?\s*(\d+)/.exec(s))) n = num(m[1]);
    if (!n) return null;
    var type = '-';
    if (/КАНАЛИЗАЦ/.test(s)) type = 'DUCT';
    else if (/ADSS|ПОДВЕСН|САМОНЕСУЩ/.test(s)) type = 'AERIAL';
    else if (/FTTH|FTTX|АБОНЕНТ|МИКРО/.test(s)) type = /МИКРО/.test(s) ? 'DROP-MICRO' : 'DROP';
    var w = /ПРОВОЛОК[А-Я]*\s*(\d+(?:\.\d+)?)\s*ММ/.exec(s);
    if (w) extra = (extra ? extra + '+' : '') + 'W' + num(w[1]) + 'MM';
    else if (/ГРУНТ|БРОНИР/.test(s)) type = 'ARMOUR';
    else if (/ДИЭЛЕКТР|УНИВЕРСАЛ/.test(s)) type = 'DIEL';
    else if (/РАСПРЕДЕЛИТ/.test(s)) type = 'DISTR';
    var key = ['CABLE', 'OPTIC', type, n + 'F', extra || '-'].join('|');
    var levels = [];
    if (extra) levels.push({ key: ['CABLE', 'OPTIC', type, n + 'F', '-'].join('|'), drop: ['прочность'] });
    levels.push({ key: ['CABLE', 'OPTIC', n + 'F'].join('|'), drop: ['тип прокладки', 'прочность'] });
    return { key: key, levels: levels, attrs: { kind: 'optic', fibres: n, type: type, group: 'O' } };
  }

  function group(kind) {
    if (kind === 'comm' || kind === 'lan') return 'C';
    if (kind === 'bare') return 'B';
    if (kind === 'winding') return 'W';
    if (kind === 'optic') return 'O';
    return 'E';
  }

  var BARE_RE = /(^|[^А-ЯA-Z0-9])(АСКП|АСКС|АСК|АС|АН|АЖ|АТ|АМ|А|МГЭ|МГ|МФ|МТ|М|ПСО|ПС|ПМС)(?:\s*,?\s*СЕЧЕНИЕМ\s*,?\s*(?:ММ2)?\s*:)?\s*-?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?(?:\s*(?:ММ2|ММ)?\s*-\s*(\d+(?:\.\d+)?)\s*(?:ММ2|ММ)?)?(?![\d.x])/;
  function parseBare(s) {
    if (!/ПРОВОД|НЕИЗОЛИР|^\s*(АС|А|М)(?![А-Я])/.test(s)) return null;
    var m = BARE_RE.exec(s);
    if (!m) return null;
    var mark = m[2], a = num(m[3]), steel = m[4] ? num(m[4]) : null, hi = m[5] ? num(m[5]) : null;
    var rest = s.slice(m.index + m[0].length), c;
    if ((c = /СЕЧ[А-Я]*\.?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/.exec(rest))) {
      if (num(c[1]) !== a) return { conflict: 'section ' + a + ' vs ' + num(c[1]) };
      if (c[2]) { if (steel && steel !== num(c[2])) return { conflict: 'steel ' + steel + ' vs ' + num(c[2]) }; steel = num(c[2]); }
    }
    var dia = /^(АТ|АМ)$/.test(mark) || /\d\s*ММ\s*-/.test(m[0]);
    var size = (dia ? 'D' : 'S') + a + (hi ? '-' + hi : '') + (steel ? '/' + steel : '');
    var material = STEEL_MARK[mark] ? 'ST' : (AL_MARK[mark] ? 'AL' : 'CU');
    var key = 'CABLE|' + mark + '|' + size;
    var levels = [], dropped = [];
    function L(k, add) { dropped = dropped.concat(add); levels.push({ key: k, drop: dropped.slice() }); }
    var gr = /(\d+)\s*ГРУПП/.exec(s);
    if (gr) { L(key, ['группа оцинковки (' + gr[1] + ')']); key += '|ГР' + num(gr[1]); }
    if (steel) L('CABLE|' + mark + '|' + (dia ? 'D' : 'S') + a + (hi ? '-' + hi : ''), ['сечение стального сердечника']);
    if (dia) L('CABLE|WIRE-' + material + '|' + size, ['марка (' + mark + ')']);
    return { key: key, levels: levels, attrs: { kind: 'bare', mark: mark, material: material, mm2: dia ? null : a, d: dia ? a : null,
      range_hi: hi, steel_mm2: steel, group: 'B' } };
  }

  function nearestMark(marks, sz, s) {
    var best = null, bd = 1e9, i, mk, d;
    for (i = 0; i < marks.length; i++) {
      mk = marks[i];
      if (mk.end <= sz.start) {
        d = sz.start - mk.end;
        var gap = s.slice(mk.end, sz.start);
        var g = gap.replace(/\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(КВ|KV|В)?(?![А-Я])/g, '').replace(/СЕЧЕНИЕМ|СЕЧЕНИЕ|СЕЧ|МАРКИ|МАРКА|ММ2|ММ|НА НАПРЯЖЕНИЕ|ДО/g, '');
        if (/[А-ЯA-Z]{2,}/.test(g)) d += 1000;
      } else if (mk.start >= sz.end) {
        d = mk.start - sz.end + 50;
        if (/[А-ЯA-Z]{3,}/.test(s.slice(sz.end, mk.start).replace(/ММ2|ММ/g, ''))) d += 1000;
      } else continue;
      if (d < bd) { bd = d; best = mk; }
    }
    return best;
  }

  function singleNumber(s, mk) {
    var after = s.slice(mk.end), m;
    if ((m = /СЕЧ[А-Я]*\.?\s*(\d+(?:\.\d+)?)\s*(?:ММ2|ММ|КВ\.?ММ)?(?![\d.x\/])/.exec(s))) return { n: num(m[1]), how: 'sech', start: m.index, end: m.index + m[0].length };
    if ((m = /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:ММ2|КВ\.?\s*ММ)(?![А-Я])/.exec(s))) return { n: num(m[1]), how: 'mm2', start: m.index, end: m.index + m[0].length };
    if ((m = /^\s*-?\s*(\d+(?:\.\d+)?)(?:\s*(?:ММ2|ММ))?(?![\d.xХX,\/])/.exec(after)) && !/^\s*-?\s*\d+(?:\.\d+)?\s*(КВ|KV|В)(?![А-Я])/.test(after)) {
      return { n: num(m[1]), how: 'after-mark', end: mk.end + m[0].length };
    }
    return null;
  }

  function windingSize(s, mk) {
    var m = /^\s*,?\s*(?:РАЗМЕР|ДИАМЕТР(?:ОМ)?|Д|D|Ø)?\s*-?\s*(\d+(?:\.\d+)?)(?:\s*(?:ММ)?\s*-\s*(\d+(?:\.\d+)?))?(?:\s*ММ)?(?![\d.x])/.exec(s.slice(mk.end));
    if (!m) return null;
    return { size: 'D' + num(m[1]) + (m[2] ? '-' + num(m[2]) : ''), d: num(m[1]), end: mk.end + m[0].length };
  }

  var KV_NODASH = { '0.38': 1, '0.4': 1, '0.66': 1, '0.69': 1, '1': 1, '6': 1, '10': 1, '20': 1, '35': 1 };

  function parseText(s) {
    if (nfWire(s)) return parseWire(s);
    var lan = parseLan(s);
    if (lan) return lan;
    var opt = parseOptic(s);
    if (opt) return opt;

    var marks = findMarks(s);
    var sz = findSize(s, 0);
    var mk = null, size = null, cores = null, mm2 = null, d = null, sizeHow = null, sizeEnd = null, oneAt = null, i;

    if (sz) {
      mk = nearestMark(marks, sz, s);
      if (!mk) return parseBare(s);
      sizeEnd = sz.end;
    } else {
      if (!marks.length) return parseBare(s);
      mk = marks[0];
      for (i = 0; i < marks.length; i++) if (/^\s*[-,]?\s*\d/.test(s.slice(marks[i].end))) { mk = marks[i]; break; }
      if (mk.kind === 'winding') {
        var ws = windingSize(s, mk);
        if (!ws) return null;
        size = ws.size; d = ws.d; sizeHow = 'diameter'; sizeEnd = ws.end;
      } else if (mk.kind === 'comm' && /^(RG-|РК$)/.test(mk.mark)) {
        var rk = /^\s*-?\s*(\d+(?:-\d+(?:\.\d+)?){1,3})/.exec(s.slice(mk.end));
        size = rk ? rk[1] : '-'; sizeHow = 'coax'; sizeEnd = rk ? mk.end + rk[0].length : null;
      } else {
        var one = singleNumber(s, mk);
        if (!one) return parseBare(s);
        mm2 = one.n; sizeEnd = one.end; oneAt = one.how !== 'after-mark' ? one.start : null;
        if (mk.kind === 'wire' || /^(ПВ\d?|ПУВ|ПУГВ|АПВ|АПУВ|ВПП|ВПВ|ПУВ-3|PV1-F|ПУН|АПУН)$/.test(mk.mark)) { cores = '1'; size = '1x' + mm2; sizeHow = 'single-wire'; }
        else if (/^А?ПВ(П|ПУ|В|БП|БПУ|БВ|ПУ2Г|П2Г)$/.test(mk.mark) && /(^|[^\d.])(6|10|15|20|35)\s*(КВ|KV)/.test(s)) {
          cores = '1'; size = '1x' + mm2; sizeHow = 'single-core-mv';
        }
        else { cores = '?'; size = '?x' + mm2; sizeHow = 'cores-unknown'; }
      }
    }

    var kind = mk.kind;
    var mark = mk.mark;
    var screen = null, extraTerms = 0, pairs = null, variant = null, lead = null;
    var sizeNoShape = size, core = size;
    if (sz) {
      var vc = /\((\d)-Х\s*ЖИЛЬН[А-Я]*(\s*\/\s*БРОНИРОВАНН[А-Я]*)?\)/.exec(s);
      if (vc && sz.terms.length === 1 && sz.terms[0].n === '1' && sz.terms[0].b == null) {
        sz.terms[0].n = vc[1]; variant = vc[1] + '-core';
        if (vc[2]) { var arm = /^(А?ПВ)(.*)$/.exec(mark); if (arm) { mark = arm[1] + 'Б' + arm[2]; variant += ' armoured'; } else return null; }
      }
      var lm = /(^|\s)(\d+)-$/.exec(s.slice(0, sz.start));
      lead = lm ? lm[2] + '-' : '';
      size = lead + sizeText(sz, true, true);
      sizeNoShape = lead + sizeText(sz, true, false);
      core = lead + sizeText(sz, false, false);
      screen = sz.screen;
      var t0 = sz.terms[0];
      cores = t0.n;
      if (t0.b != null) { pairs = t0.n; d = t0.b; } else mm2 = t0.a;
      extraTerms = sz.terms.length - 1;
      sizeHow = 'construction';
    }

    var kv = null, kvHow = null, odd = null, mm;
    if (sizeEnd != null) {
      var after = s.slice(sizeEnd);
      if ((mm = TAIL_RE.exec(after))) odd = num(mm[1]) + '-' + num(mm[2]);
      else if ((mm = KV_AFTER_RE.exec(after))) {
        kv = kvValue(mm[1], mm[2], mm[3], mm[4] === 'В' ? 'В' : 'КВ');
        if (kv) kvHow = 'after-size';
        else odd = mm[0].replace(/[^\d.\/()]/g, '').replace(/^0(?=\d)/, '0');
      } else if ((mm = /^\s*(\d+(?:\.\d+)?)\s*(?:КВ|KV)?(?=\s*$|\s*[,;)]|\s+[А-ЯA-Z(])/.exec(after)) && KV_NODASH[num(mm[1])]) {
        kv = kvValue(mm[1], null, null, 'КВ'); kvHow = 'after-size-nodash';
      }
    }
    var gapEnd = sz ? sz.start : oneAt;
    if (!kv && !odd && gapEnd != null && mk.end <= gapEnd && !lead) {
      mm = KV_MARK_RE.exec(s.slice(mk.end, gapEnd));
      if (mm) {
        var kvm = kvValue(mm[1], mm[2], null, mm[3] === 'В' ? 'В' : 'КВ');
        if (kvm && (mm[3] || /^(0\.66|0\.38|0\.4|1|1\.0|0\.6|6|10|35)$/.test(mm[1]))) { kv = kvm; kvHow = 'after-mark'; }
      }
    }
    var fr = kvFree(s);
    if (!kv && !odd) for (i = 0; i < fr.length; i++) if (!fr[i].bad) { kv = fr[i]; kvHow = 'text'; break; }
    if (kv) for (i = 0; i < fr.length; i++) if (fr[i].cls !== kv.cls) return { conflict: 'voltage ' + kv.spec + ' vs ' + (fr[i].spec || fr[i].bad) };

    var glued = /^\d+/.exec(s.slice(mk.end));
    if (glued && kvHow !== 'after-mark' && !(sz && sz.start === mk.end) && sizeHow !== 'single-wire' && sizeHow !== 'cores-unknown' && sizeHow !== 'diameter') mark += glued[0];
    else if (glued && sizeHow === 'single-wire' && oneAt != null && kvHow !== 'after-mark') mark += glued[0];
    var markFull = mark + (mk.fire || '') + (mk.env ? '-' + mk.env : '');
    var material = STEEL_MARK[mark] ? 'ST' : (AL_MARK[mark] ? 'AL' : (/^(СИП|АС|А)/.test(mark) ? 'AL' : 'CU'));
    var vclass = null;
    if (kv) vclass = (+kv.cls >= 3) ? 'MV' : 'LV';
    else if (screen) vclass = 'MV';
    else if (kind === 'wire' || kind === 'control' || kind === 'comm') vclass = 'LV';
    else if (kind === 'sip') vclass = /СИП-3/.test(mark) ? 'MV' : (mark === 'СИП' ? null : 'LV');
    else if (kind === 'power' && /^А?(ВВГ|ВББШВ|КГ|КГЭ|NYM|ППГ|ВВГЗ|ВВГ-П|ВВГЭ)/.test(mark)) vclass = 'LV';

    var spec = kv ? kv.spec : (odd ? '~' + odd : '-'), cls = kv ? kv.cls : null;
    var key = 'CABLE|' + markFull + '|' + size + '|' + spec;
    var dropKv = kv ? 'kV' : (odd ? 'число после сечения (' + odd + ')' : 'kV не указан');
    var dropShape = 'форма/назначение жил' + (sz && (sz.shapes.length || sz.roles.length) ? ' (' + sz.shapes.concat(sz.roles).join(',').toLowerCase() + ')' : '');
    var fireNoClass = (mk.fire || '').replace(/\([А-Я]\)/, '');
    var hasShape = size !== sizeNoShape, hasFire = !!(mk.fire || mk.env);
    var fireDrop = [mk.fire ? 'нг/LS' : '', mk.env ? 'ХЛ' : ''].filter(function (x) { return x; });
    var levels = [], dropped = [];
    function L(k, add) {
      for (var j = 0; j < add.length; j++) if (dropped.indexOf(add[j]) < 0) dropped = dropped.concat([add[j]]);
      levels.push({ key: k, drop: dropped.slice() });
    }
    var base = 'CABLE|' + markFull + '|';
    var kvSlot = spec;
    if (hasShape) L(base + sizeNoShape + '|' + spec, [dropShape]);
    if (cls && spec !== cls) { kvSlot = cls; L(base + sizeNoShape + '|' + cls, ['U0/Um (' + spec + ')']); }
    if (core !== sizeNoShape) L(base + core + '|' + kvSlot, ['экран']);
    L(base + core, [dropKv]);
    if (mk.fire && fireNoClass !== mk.fire) L('CABLE|' + mark + fireNoClass + '|' + core, ['класс нг (' + /\(([А-Я])\)/.exec(mk.fire)[1] + ')']);
    if (hasFire) L('CABLE|' + mark + '|' + core, fireDrop);
    var cmark = MARK_CLASS[mk.mark] ? 'CABLE~CLASS|' + MARK_CLASS[mk.mark] : 'CABLE|' + mark;
    if (MARK_CLASS[mk.mark]) L(cmark + '|' + core, ['марка (' + mark + ')']);
    if (vclass && cores !== '?' && sizeHow !== 'coax') L('CABLE~ANY|' + group(kind) + '|' + material + '|' + vclass + '|' + core, ['марка (' + markFull + ')']);
    var seen = {}, lv = [];
    seen[key] = 1;
    for (i = 0; i < levels.length; i++) {
      if (seen[levels[i].key]) continue;
      seen[levels[i].key] = 1; lv.push(levels[i]);
    }
    var attrs = { kind: kind, group: group(kind), mark: mark, fire: mk.fire || null, env: mk.env || null, material: material,
      size: size, size_how: sizeHow, cores: cores, mm2: mm2, pairs: pairs, d: d, screen_mm2: screen,
      extra_terms: extraTerms, kv: kv ? kv.cls : null, kv_spec: kv ? kv.spec : null, kv_how: kvHow, vclass: vclass };
    if (odd) attrs.after_size = odd;
    if (variant) attrs.variant = variant;
    if (sz && sz.shapes.length) attrs.conductor = sz.shapes.join(',');
    if (sz && sz.roles.length) attrs.roles = sz.roles.join(',');
    return { key: key, levels: lv, attrs: attrs };
  }

  function parse(name, unit, section) {
    if (section && SECTION_NO[section]) return null;
    if (!unitOk(unit)) return null;
    var part = partOf(name);
    if (!part) return null;
    var r = parseText(part.text);
    if (!r || r.conflict || !r.key) return null;
    r.family = 'cable';
    r.attrs.from = part.from;
    return { family: 'cable', key: r.key, attrs: r.attrs, levels: r.levels };
  }

  function conflict(a, b) {
    var x = a && a.attrs, y = b && b.attrs;
    if (!x || !y) return null;
    if (x.group && y.group && x.group !== y.group) return 'kind ' + x.group + ' vs ' + y.group;
    if (x.material && y.material && x.material !== y.material) return 'conductor ' + x.material + ' vs ' + y.material;
    if (x.cores && y.cores && x.cores !== '?' && y.cores !== '?' && x.cores !== y.cores) return 'cores ' + x.cores + ' vs ' + y.cores;
    if (x.mm2 && y.mm2 && x.mm2 !== y.mm2) return 'section ' + x.mm2 + ' vs ' + y.mm2;
    if (x.pairs && y.pairs && x.pairs !== y.pairs) return 'pairs ' + x.pairs + ' vs ' + y.pairs;
    if (x.d && y.d && x.d !== y.d) return 'diameter ' + x.d + ' vs ' + y.d;
    if (x.extra_terms != null && y.extra_terms != null && x.cores !== '?' && y.cores !== '?' && x.extra_terms !== y.extra_terms) return 'construction';
    if (x.vclass && y.vclass && x.vclass !== y.vclass) return 'voltage class ' + x.vclass + ' vs ' + y.vclass;
    if (x.fibres && y.fibres && x.fibres !== y.fibres) return 'fibres ' + x.fibres + ' vs ' + y.fibres;
    if (x.cat && y.cat && x.cat !== y.cat) return 'category ' + x.cat + ' vs ' + y.cat;
    if (x.vclass === 'MV' && y.vclass === 'MV' && x.kv && y.kv && String(x.kv) !== String(y.kv)) return 'kV ' + x.kv + ' vs ' + y.kv;
    if (x.screen_mm2 && y.screen_mm2 && Number(y.screen_mm2) < Number(x.screen_mm2)) return 'screen ' + y.screen_mm2 + ' < ' + x.screen_mm2;
    return null;
  }

  var api = {
    id: 'cable',
    version: '1',
    owns: owns,
    parse: parse,
    conflict: conflict,
    _prep: prep,
    _cablePart: cablePart,
    _marks: { MARKS: MARKS, MARK_SYN: MARK_SYN, MARK_CLASS: MARK_CLASS }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CableFamily = api;
})(this);
