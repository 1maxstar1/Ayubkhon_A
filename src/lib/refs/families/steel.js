/*
 * Family parser «steel» (ES5 plain script; sets the global `SteelFamily`): steel and plastic pipes and fittings,
 * rolled steel (rebar, sections, sheet), fasteners, wire and mesh, electrodes.
 *
 *   owns(name, unit, section)  -> true when the name is one of these items
 *   parse(name, unit, section) -> { family: 'steel', key, attrs, levels } | null
 *       attrs.kg_per_m: mass per metre from the standard's formula when the name gives the size
 *   conflict(a, b)             -> null | reason
 *
 * The key keeps the kind, material, standard sizes and every number of the name (М5 ≠ М8); relaxed levels say what
 * they dropped, `minor` levels drop no identity. Size tables come from the standards; mark and word tables are
 * generic vocabulary. Comments that named where an entry was seen are kept privately in the reference kit; the code
 * is unchanged from the measured version and changes only with the parity measurement (test/refs-parity.cjs).
 */
(function (root) {
  'use strict';

  var LAT = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

  function squash(s) { return s.replace(/\s+/g, ' ').replace(/^ | $/g, ''); }

  function prep(name) {
    var s = String(name == null ? '' : name).toUpperCase().replace(/Ё/g, 'Е');
    var std = [];
    s = s.replace(/(\d{1,2}[XХ]\d{1,2})N(\d{1,2})S(\d)/g, '$1Н$2С$3').replace(/(\d{1,2}[XХ]\d{1,2})N(\d)/g, '$1Н$2');
    s = s.replace(/ГОСТ\s*(Р\s*)?(ISO\s*)?\d+(\.\d+)*(\s*-\s*\d{2,4})?/g, function (m) { std.push(squash(m)); return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(ISO|DIN|EN|ASTM|ТУ|СТО|ТS|TS|ТС|TC|O'?ZDST|ОZDST|OZ\s?DST)\s*[\dА-ЯA-Z]*[\d][\d.:\/-]*/g, function (m) { std.push(squash(m)); return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])API\s*(SPEC\.?)?\s*5L(?![А-ЯЁІA-Z0-9_])/g, function (m) { std.push('API 5L'); return ' '; });
    var psl = null;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])PSL-?\s?(\d)(?![А-ЯЁІA-Z0-9_])/g, function (m, d1) { std.push(squash(m)); psl = 'PSL' + d1; return ' '; });
    s = s.replace(/[ЕE]\d{2}-\d{2}-\d{3}-\d{2}[^\s,]*/g, ' ').replace(/\/+[РP]\d{5}[^\s,]*/g, ' ');
    s = s.replace(/[ABCEHKMOPTXY]/g, function (c) { return LAT[c]; });
    s = s.replace(/(\d)\s*[Х×*]\s*(?=\d)/g, '$1Х');
    s = s.replace(/(\d)(А\s*-?\s*(?:240|300|400|500|550|600|800)С?)(?![0-9])/g, '$1 $2');
    s = s.replace(/\d{2,}(?:,\d{2,}){2,}/g, function (x) { return x.replace(/,/g, '; '); });
    s = s.replace(/(\d)\.(016|066)(?![\d])/g, '$1 $2');
    s = s.replace(/(\d),(?=\d)/g, '$1.');
    s = s.replace(/±/g, '=').replace(/(\d)\s*["“”]/g, '$1"').replace(/[«»“”]/g, ' ').replace(/(^|[^\d])"/g, '$1 ').replace(/Ø|⌀/g, ' Ø ');
    return { s: squash(s), std: std, psl: psl };
  }

  function num(t) { return parseFloat(String(t).replace(',', '.')); }
  function fmt(x) {
    var n = typeof x === 'number' ? x : num(x);
    if (!isFinite(n)) return String(x);
    return String(Math.round(n * 10000) / 10000);
  }
  function uniq(a) { var o = {}, r = []; for (var i = 0; i < a.length; i++) if (!o[a[i]]) { o[a[i]] = 1; r.push(a[i]); } return r; }
  function sortNum(a) { return a.slice().sort(function (x, y) { return num(x) - num(y); }); }
  function has(s, re) { return re.test(s); }
  function round1(x) { return x >= 1 || x <= 0 ? Math.round(x * 1000) / 1000 : Number(x.toPrecision(4)); }

  var CARBON_NO = { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '08': 1, '10': 1, '15': 1, '20': 1, '25': 1,
    '30': 1, '35': 1, '40': 1, '45': 1, '50': 1, '55': 1, '60': 1, '65': 1, '70': 1 };

  function grades(s0) {
    var s = s0, g = [], ss = false, sc = null, weld = null, m;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])СВ\s*-?\s*0?8\s*(Г2С|ГС|А|АА)?(\s*-\s*О)?(?![А-Я0-9])/g, function (x, a) { weld = 'СВ08' + (a || ''); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])СВО8Г2С(-0)?/g, function (x) { weld = 'СВ08Г2С'; return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])ЕR\s*70\s*S\s*-?\s*(\d)?/g, function (x, d1) { weld = 'ER70S' + (d1 ? '-' + d1 : ''); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])[БВ]?СТ\s*\.?\s*(\d{2})\s+(Г2С|Г1С|ГС|Г2|ХСНД)(?![А-Я0-9])/g, function (x, a, b) { g.push(a + b); return explain(x); });
    s = s.replace(/\b\d{1,2}Х\d{1,2}Н\d{1,2}(?:[А-Я]{1,2}\d?)*/g, function (x) { ss = true; g.push(x); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])АISI\s*-?\s*(\d{3}[А-ЯA-Z]{0,2})/g, function (x, a) { ss = true; g.push('АISI' + a); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])АIS\s*(\d{3}[А-ЯA-Z]{0,2})/g, function (x, a) { ss = true; g.push('АISI' + a); return explain(x); });
    if (/НЕРЖ|ВЫСОКОЛЕГИР|КОРРОЗИОННОСТОЙК/.test(s)) ss = true;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])СТ\.?\s*(304|316|321|310)\s*([А-Я]{1,2})?(?![0-9])/g, function (x, a) { ss = true; g.push('АISI' + a); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(?:СТ\.?\s*)?(09|10|12|14|16|17)\s+Г\s*2\s*С(?![А-Я0-9])/g, function (x, a) { g.push(a + 'Г2С'); return explain(x); });
    s = s.replace(/\b(\d{2})(Г2С|Г1С|ГС|Г2|ХСНД|ГСА|ХГН|ХН3А|ХНЗА|ХН|ХМ|Х|Г)(?![А-Я0-9])/g, function (x, a, b) {
      g.push(a + b.replace('З', '3')); return explain(x);
    });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])[БВ]?СТ\s*\.?\s*(08|10|15|20|25|30|35|40|45|50|55|60|65|70|[0-6]|З)(?![0-9])(\s*(?:Г\s?ПС|ГСП|СП|ПС|КП|Г)(?:\s*[\/.]\s*(?:СП|ПС))?(?:\s*-?\s*\d(?:\s*-\s*\d)*(?![0-9.]))?)?/g,
      function (x, n, k) {
        if (n === 'З') n = '3';
        if (!CARBON_NO[n]) return x;
        var suf = k ? /(Г\s?ПС|ГСП|СП|ПС|КП|Г)/.exec(k)[1].replace(/\s/g, '') : '';
        var cat = k ? (k.replace(/^[^0-9]*/, '').match(/\d/g) || []).join('-') : '';
        g.push('СТ' + n + suf + (cat ? '-' + cat : '')); return explain(x);
      });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])СТАЛ[ЬИ]\s*(МАРКИ\s*)?(08|10|20|35|40|45|60|65|70)(?![0-9.ХА-Я])/g, function (x, a, n) { g.push('СТ' + n); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])МАРК[АИ]\s*(СТАЛИ\s*)?(08|10|20|35|40|45|60|65|70)(?![0-9.ХА-Я])/g, function (x, a, n) { g.push('СТ' + n); return explain(x); });
    s = s.replace(/\b0?8\s*(ПС|КП|Ю)(\s*-?\s*\d)?(?![А-Я])/g, function (x, k, cat) { g.push('08' + k + (cat ? '-' + cat.replace(/[^\d]/g, '') : '')); return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])С\s?(235|245|255|275|285|345|375|390|440)(?![0-9])/g, function (x, n) { sc = 'С' + n; return explain(x); });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])КАТ\.?\s*(\d)(?![0-9])/g, function (x, n) { g.push('КАТ' + n); return explain(x); });
    if (ss) s = s.replace(/(?:^|[^0-9.])(30[14]|31[06]|321|430)(L|TI|ТI|Н)?(?![0-9А-ЯЁІA-Z])/g, function (x, n, k) { g.push('АISI' + n + (k || '').replace('Т', 'T')); return explain(x); });
    return { s: squash(s), grades: uniq(g), ss: ss, sc: sc, weld: weld };
  }

  var DN_VGP = { 6: 10.2, 8: 13.5, 10: 17, 15: 21.3, 20: 26.8, 25: 33.5, 32: 42.3, 40: 48, 50: 60, 65: 75.5, 80: 88.5,
    90: 101.3, 100: 114, 125: 140, 150: 165 };
  var DN_OD = { 15: 21.3, 20: 26.8, 25: 33.5, 32: 42.3, 40: 48, 50: 57, 65: 76, 80: 89, 100: 108, 125: 133, 150: 159,
    175: 194, 200: 219, 250: 273, 300: 325, 350: 377, 400: 426, 450: 480, 500: 530, 600: 630, 700: 720, 800: 820,
    900: 920, 1000: 1020, 1200: 1220, 1400: 1420 };
  var OD_DN = { 21.3: 15, 26.8: 20, 26.9: 20, 33.5: 25, 33.7: 25, 42.3: 32, 42.4: 32, 48: 40, 48.3: 40, 57: 50, 60: 50,
    60.3: 50, 76: 65, 75.5: 65, 76.1: 65, 89: 80, 88.5: 80, 88.9: 80, 108: 100, 114: 100, 114.3: 100, 133: 125,
    139.7: 125, 140: 125, 159: 150, 165: 150, 168.3: 150, 219: 200, 273: 250, 325: 300, 377: 350, 426: 400, 480: 450,
    530: 500, 630: 600, 720: 700, 820: 800, 920: 900, 1020: 1000, 1220: 1200, 1420: 1400 };
  var DN_LIST = { 10: 1, 15: 1, 20: 1, 25: 1, 32: 1, 40: 1, 50: 1, 65: 1, 80: 1, 100: 1, 125: 1, 150: 1, 175: 1, 200: 1,
    250: 1, 300: 1, 350: 1, 400: 1, 450: 1, 500: 1, 600: 1, 700: 1, 800: 1, 900: 1, 1000: 1, 1200: 1, 1400: 1 };

  var SDR_STD = [6, 7.4, 9, 11, 13.6, 17, 17.6, 21, 26, 33, 41];
  var PN_SDR = {
    'ПЭ100': { 4: 41, 5: 33, 6: 26, 6.3: 26, 8: 21, 10: 17, 12.5: 13.6, 16: 11, 20: 9, 25: 7.4 },
    'ПЭ80': { 3.2: 41, 4: 33, 5: 26, 6: 21, 6.3: 21, 8: 17, 10: 13.6, 12.5: 11, 16: 9, 20: 7.4 }
  };

  var CHANNEL_KG = { 5: 4.84, 6.5: 5.9, 8: 7.05, 10: 8.59, 12: 10.4, 14: 12.3, 16: 14.2, 18: 16.3, 20: 18.4, 22: 21,
    24: 24, 27: 27.7, 30: 31.8, 33: 36.5, 36: 41.9, 40: 48.3 };
  var BEAM_KG = { 10: 9.46, 12: 11.5, 14: 13.7, 16: 15.9, 18: 18.4, 20: 21, 22: 24, 24: 27.3, 27: 31.5, 30: 36.5,
    33: 42.2, 36: 48.6, 40: 57, 45: 66.5, 50: 78.5, 55: 92.6, 60: 108 };

  var ELECTRODE_TYPE = { 'МР3': 'Э46', 'АНО4': 'Э46', 'АНО21': 'Э46', 'АНО6': 'Э42', 'АНО': 'Э46', 'ОЗС4': 'Э46',
    'ОЗС12': 'Э46', 'ОЗС6': 'Э46', 'УОНИ1345': 'Э42А', 'УОНИ1355': 'Э50А', 'ЦУ5': 'Э50А', 'ТМУ21У': 'Э50А',
    'J421': 'Э42', 'J422': 'Э42', 'ЦЛ11': 'SS', 'НЖ13': 'SS', 'ОЗЛ8': 'SS', 'ОЗЛ9А': 'SS', 'ЭА3959': 'SS',
    'ЭА395': 'SS', 'ТНА102': 'SS', 'ЦТ15': 'SS' };

  var MINE = [
    ['PIPE', /(^|[^А-Я])ТРУБ(А|Ы|ОЙ)?(?![А-Я])/],
    ['ELBOW', /(^|[^А-Я])(ОТВОД(Ы|А)?|ПОЛУОТВОД(Ы)?|КОЛЕН(О|А)|УГОЛЬНИК(И)?|УГЛЫ ПОЛИПРОПИЛЕН[А-Я]*|УГОЛ-ПЕРЕХОД)(?![А-Я])/],
    ['TEE', /(^|[^А-Я])(ТРОЙНИК(И|А)?|ТРОЙНИКОВОЕ ОТВЕТВЛЕНИЕ|ТРОЙНОЙ ПЕРЕХОДНИК)(?![А-Я])/],
    ['RED', /(^|[^А-Я])(ПЕРЕХОД(Ы)?|ПЕРЕХОДНИК(И)?)(?![А-Я])/],
    ['FLANGE', /(^|[^А-Я])(ФЛАНЕЦ|ФЛАНЦЫ|ФЛАНЦА)(?![А-Я])/],
    ['STUB', /(^|[^А-Я])(ВТУЛК[АИ] ПОД ФЛАН|БУРТ(Ы)?(?![А-Я]))/],
    ['CAP', /(^|[^А-Я])ЗАГЛУШК(А|И)(?![А-Я])/],
    ['COUP', /(^|[^А-Я])МУФТ(А|Ы)(?![А-Я])/],
    ['CROSS', /(^|[^А-Я])КРЕСТОВИН(А|Ы)(?![А-Я])/],
    ['REBAR', /(^|[^А-Я])(АРМАТУР(А|Ы|НАЯ|НЫЙ|НЫЕ|НОЙ)(?![А-Я])(?!\s+(ПРЯД|КАНАТ|СТАЛЬНОЙ КАНАТ))|ПЕРИОДИЧЕСК[А-Я]* ПРОФИЛ[А-Я]*|ПРОКАТ АРМАТУРН[А-Я]*|ПРУТОК(?! КРУГЛ)|ПРУТКИ(?! КРУГЛ))(?![А-Я])/],
    ['ROD', /(^|[^А-Я])КАТАНК(А|И)(?![А-Я])/],
    ['WIRE', /(^|[^А-Я])ПРОВОЛО?К(А|И)(?![А-Я])/],
    ['MESH', /(^|[^А-Я])(АРМО)?СЕТК(А|И)(?![А-Я])/],
    ['ROPE', /(^|[^А-Я])(КАНАТ(Ы)?|ПРЯД(Ь|И))(?![А-Я])/],
    ['ANGLE', /(^|[^А-Я])(УГОЛОК|УГОЛКИ|СТАЛЬ УГЛОВАЯ|УГЛОВАЯ СТАЛЬ)(?![А-Я])/],
    ['CHAN', /(^|[^А-Я])ШВЕЛЛЕР(Ы|А)?(?![А-Я])/],
    ['BEAM', /(^|[^А-Я])(ДВУТАВР(Ы)?|БАЛКА ДВУТАВРОВАЯ|БАЛКИ ДВУТАВРОВЫЕ)(?![А-Я])/],
    ['SHEET', /(^|[^А-Я])(ЛИСТ(Ы)?|ЛИСТОВАЯ СТАЛЬ|СТАЛЬ ЛИСТОВАЯ|СТАЛЬ ТОЛСТОЛИСТОВАЯ|СТАЛЬ ОЦИНКОВАННАЯ ЛИСТОВАЯ|СТАЛЬ ПРОКАТНАЯ ТОЛСТОЛИСТОВАЯ|ПРОКАТ (ПЛОСКИЙ |СТАЛЬНОЙ )?(ЛИСТОВОЙ|ИЗ ЖЕЛЕЗА|ИЗ НЕЛЕГИРОВАННОЙ|ЛЕГИРОВАННАЯ|РУЛОН|ГОРЯЧЕОЦИНК)[А-Я]*|ПРОКАТ ПЛОСКИЙ|ПРОКАТ ЛИСТОВОЙ|ПРОКАТ ГОРЯЧЕОЦИНКОВАННЫЙ)(?![А-Я])/],
    ['STRIP', /(^|[^А-Я])(ПОЛОСА|ПОЛОСЫ|ПОЛОСОВАЯ СТАЛЬ|СТАЛЬ ПОЛОСОВАЯ|ЛЕНТА СТАЛЬНАЯ)(?![А-Я])/],
    ['BAR', /(^|[^А-Я])(КРУГ|КРУГЛАЯ СТАЛЬ|СТАЛЬ КРУГЛАЯ|ПРУТ(ОК|КИ) КРУГЛ[А-Я]*)(?![А-Я])/],
    ['SQBAR', /(^|[^А-Я])(КВАДРАТ СТАЛЬНОЙ|СТАЛЬ КВАДРАТНАЯ)(?![А-Я])/],
    ['BOLT', /(^|[^А-Я])БОЛТ(Ы|А|ОВ)?(?![А-Я])/],
    ['NUT', /(^|[^А-Я])ГАЙК(А|И)(?![А-Я])/],
    ['WASHER', /(^|[^А-Я])ШАЙБ(А|Ы)(?![А-Я])/],
    ['STUD', /(^|[^А-Я])ШПИЛЬК(А|И)(?![А-Я])/],
    ['ANCHOR', /(^|[^А-Я])(АНКЕР(Ы|А)?|АНКЕРН(ЫЙ|ЫЕ|АЯ|ЫХ)|БЛОК АНКЕРН[А-Я]* БОЛТОВ)(?![А-Я])/],
    ['NAIL', /(^|[^А-Я])ГВОЗД(И|Ь|ЕЙ)(?![А-Я])/],
    ['SCREW', /(^|[^А-Я])(ШУРУП(Ы)?|САМОРЕЗ(Ы)?|ВИНТ(Ы)?)(?![А-Я])/],
    ['DOWEL', /(^|[^А-Я])ДЮБЕЛ(Ь|И|Я)(?![А-Я])/],
    ['RIVET', /(^|[^А-Я])ЗАКЛ[ЕЁ]ПК(А|И)(?![А-Я])/],
    ['ELECTRODE', /(^|[^А-Я])(СПЕЦ)?ЭЛЕКТРОД(Ы)?(?![А-Я])/]
  ];
  var NOT_MINE = /(^|[^А-Я])(ЗАДЕЛК|ПОВОРОТ|МЕТАЛЛОКОНСТРУКЦ|КОЛОДЦ|МАНЖЕТ|ХОМУТ|КРАН|ЗАДВИЖК|КЛАПАН|ЗАТВОР|ВЕНТИЛ[ЬИЯ]|ФИЛЬТР|ВОЗДУХОВОД|КАБЕЛ|ПРОВОД(?!ОЛ)|ОПОР[АЫ]|КРОНШТЕЙН|ЗНАК|ОГРАЖДЕН|СВЕТИЛЬН|ЛЮК|РЕШЕТ|ДВЕР|ОКОН|ОКН[АО]|ЩИТ|ШКАФ|КОНСТРУКЦ|ПЛИТ|ПЕРЕМЫЧ|НАСОС|КОТЕЛ|КОТЛ|СЧЕТЧИК|ЗАЗЕМЛ|ИЗДЕЛИ|ЛЕСОМАТЕР|ПИЛОМАТЕР|ДОСК|ТЕРМОУСА|ТРУБК|МЕТАЛЛОРУКАВ|ГИЛЬЗ|НАКОНЕЧНИК|СТРЕМЯНК|МОСТИК|ОПАЛУБК|ПРОКЛАДК|ПОЛОСК|ПРЯЖК|ШЛИФ|ЖЕЛОБ|ЛОТОК|ЛОТК|ЗВЕН|БЛОК(?!\s*АНКЕРН)|ПАНЕЛ|РАДИАТОР|КОНВЕКТОР|СМЕСИТЕЛ|УНИТАЗ|РАКОВИН|МОЙК|ВАНН|ДУШ|СИФОН|ТРАП|РЕВИЗИ|ЗОНТ|ДЕФЛЕКТОР|ГЕРМЕТИК|КЛЕЙ|ЛЕНТА(?! СТАЛЬН)|ИЗОЛЯЦ|КОЖУХ|ЦИЛИНДР|ПАТРУБ|САЛЬНИК|КОМПЕНСАТОР|ЭЛЕМЕНТ|ДЕРЖАТЕЛ|ДЕР\.|ЗАЖИМ|КОНЕКТОР|КОННЕКТОР|ТЕРМИНАЛ|КРЕПЛЕН|ПОДВЕС|ТРАВЕРС|СТОЙК|СТОЛБ|КОЗЫР|НАВЕС|РЕШЁТ|ЛЕСТНИЦ|ПЕРИЛ|ЗАБОР|ВОРОТ|КАЛИТК|ПРОФИЛ(?!Ь\s*ПЕРИОД|Я ПЕРИОД|ЬН[А-Я]*\s+ТРУБ)|ПРОФНАСТИЛ|МЕТАЛЛОЧЕРЕП|ГИПСОКАРТОН|УЗЕЛ|УЗЛЫ|КОМПЛЕКТ|НАБОР|ИНСТРУМЕНТ|ДИСК|СВЕРЛ|КОРОНК|БУР(?![ТА-Я])|ЗУБИЛ|ПИЛ[АЫ]|СТАНОК|АППАРАТ|ДЕРЖАК|ПЕРЧАТ|СТЕКЛ|ТКАН(?!АЯ СЕТК)|ГЕОТЕКСТ|ГЕОСЕТ|ГЕОРЕШ|СТЕРЖЕНЬ СТАЛЬНОЙ ОЦИНК)/;
  var NOT_PIPE_MAT = /((?:^|[^А-ЯЁІA-Z0-9_])ТР\s?\d{3,4}Х|Ж\s*\/\s*Б|ЖБ(?![А-Я])|ЖЕЛЕЗОБЕТОН|БЕТОН|АСБЕСТ|ХРИЗОТИЛ|КЕРАМИЧ|СТЕКЛОПЛАСТИК|ДЕРЕВ|РТ\s?\d|РТБ|ПБТ\s|ТБ\s?\d|ТФ(?![А-Я])|ТРУБЧАТ)/;

  var HEADING_NOT = /ПРОФИЛ(?!Ь ПЕРИОД)|ФУРНИТУР|ПОДОКОН|ДВЕРН|МЕБЕЛ|СПОРТ|ИНВЕНТАР|КАБЕЛЬ-КАНАЛ|ЛОТК|ЩМП|КОРПУС|ВЕНТИЛЯЦ|ВОЗДУХОВОД|СОДК|ОБОРУДОВАН|КОНДИЦИОН|АКСЕССУАР|АККСЕСУАР|АКСЕСУАР|КНАУФ|АКВАПАНЕЛ|МЕТАЛЛОКОНСТРУКЦ|ПЛОЩАДКА|ТЕРМОИЗОЛЯЦ|ГИПСОКАРТОН/;

  var LABEL_END = /(МАТЕРИАЛ|РАЗМЕР[А-Я]*|ДИАМЕТР[А-Я]*(,\s*ММ)?|ММ|ТОЛЩИН[А-Я]*|СТЕНКИ|ДЛИН[А-Я]*|МАРК[АИ]|ТИП|ЦВЕТ|КЛАСС|НАЧАЛО|КОНЕЦ|ПОКРЫТИЕ|(?:^|[^А-ЯЁІA-Z0-9_])ДУ|DN|(?:^|[^А-ЯЁІA-Z0-9_])L)\s*$/;
  var SIZE_START = /^\s*(М\s*\d|\d|L\s*[:=\d]|Ø|Д\.?\s*\d|DN\s*\d)/;
  function splitHeading(s) {
    var i = s.length;
    while (i > 0 && (i = s.lastIndexOf(': ', i - 1)) > 0) {
      var head = s.slice(0, i), item = s.slice(i + 2);
      if (i < s.length - 2 && !LABEL_END.test(head) && !SIZE_START.test(item)) return { item: item, head: head };
    }
    return { item: s, head: '' };
  }

  function headOf(text) {
    var best = null, bpos = 1e9;
    for (var i = 0; i < MINE.length; i++) {
      var m = MINE[i][1].exec(text);
      if (!m) continue;
      var pos = m.index + (m[1] ? m[1].length : 0);
      var before = text.slice(Math.max(0, pos - 5), pos);
      if (/(ДЛЯ|ИЗ|ПОД|НА|К|С|ОТ|ПО) $/.test(before) && MINE[i][0] !== 'STUB') {
        var rest = text.slice(pos + 2), m2 = MINE[i][1].exec(rest);
        if (!m2) continue;
        var p2 = pos + 2 + m2.index + (m2[1] ? m2[1].length : 0);
        var b2 = text.slice(Math.max(0, p2 - 5), p2);
        if (/(ДЛЯ|ИЗ|ПОД|НА|К|С|ОТ|ПО) $/.test(b2)) continue;
        pos = p2;
      }
      if (pos < bpos) { bpos = pos; best = MINE[i][0]; }
    }
    if (!best) return null;
    var nm = NOT_MINE.exec(text);
    if (nm) {
      var np = nm.index + (nm[1] ? nm[1].length : 0);
      if (np < bpos) return null;
    }
    return { sub: best, pos: bpos };
  }

  function classify(P, unit) {
    var parts = splitHeading(P.s);
    var h = headOf(parts.item), ctx = parts.head, s = parts.item;
    if (!h) return null;
    if (ctx && HEADING_NOT.test(ctx)) return null;
    var all = P.s, sub = h.sub;
    if (unit === 'м3' || unit === 'маш-ч' || unit === 'чел-ч' || unit === 'т-км') return null;
    if (sub === 'PIPE' || sub === 'ELBOW' || sub === 'TEE' || sub === 'RED' || sub === 'CAP' || sub === 'COUP' || sub === 'CROSS') {
      if (NOT_PIPE_MAT.test(all)) return null;
      if (/ГОФРИРОВАННЫЙ ШЛАНГ|ЭЛЕКТРОИЗОЛ|ТЕРМОУСАЖ|ТЕРМОУСАД/.test(all)) return null;
    }
    if (sub === 'CAP' && !/(ПЭ|П\/Э|ПНД|ПВД|ПП(?![А-Я])|ППР|ПВХ|ПОЛИЭТИЛЕН|ПОЛИПРОПИЛЕН|СТАЛЬН|ЧУГУН|ДЛЯ ТРУБ|ЭЛЕКТРОСВАРН|ЭЛЕКТРОФУЗ|КОМПРЕСС|РЕЗЬБ|ЛИТЬЕВ|КАНАЛИЗАЦ|ЭЛЛИПТ|ПРИВАРН|ППУ|ФИТИНГ|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?\s*=?\s*\d|(?:^|[^А-ЯЁІA-Z0-9_])D\s*=?\s*\d|(?:^|[^А-ЯЁІA-Z0-9_])ДУ|(?:^|[^А-ЯЁІA-Z0-9_])DN|(?:^|[^А-ЯЁІA-Z0-9_])П\d)/.test(all)) return null;
    if (sub === 'COUP') {
      if (/КАБЕЛ|(?:^|[^А-ЯЁІA-Z0-9_])КВ(?![А-ЯЁІA-Z0-9_])|\d\s*КВ(?![А-Я])|КОНЦЕВ|ОПТИЧ|СИП|ТЕРМОУСАЖ|ИЗОЛЯЦИИ СТЫКА|СОЕДИНИТЕЛЬНАЯ \d|ЭПКВТ|СТП|ПСТ/.test(all)) return null;
      if (!/(ПЭ|П\/Э|ПНД|ПВД|ПП(?![А-Я])|ППР|ПВХ|ПОЛИЭТИЛЕН|ПОЛИПРОПИЛЕН|СТАЛЬН|ЧУГУН|ДЛЯ ТРУБ|ЭЛЕКТРОСВАРН|ЭЛЕКТРОФУЗ|КОМПРЕСС|РЕЗЬБ|ПЕРЕХОДН|КАНАЛИЗАЦ|РЕМОНТН|ЗАЖИМН|ФИТИНГ|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?\s*=?\s*\d|(?:^|[^А-ЯЁІA-Z0-9_])D\s*=?\s*\d|(?:^|[^А-ЯЁІA-Z0-9_])ДУ|(?:^|[^А-ЯЁІA-Z0-9_])DN)/.test(all)) return null;
    }
    if (sub === 'MESH') {
      if (/СТЕКЛО|ФАСАД|ПОЛИМЕР|ПЛАСТИК|ШТУКАТ|МОСКИТ|СЕРПЯНК|ГЕО|БАЗАЛЬТ|ПОЛИПРОП|ПОЛИЭТИЛ|КАПРОН|ЗАЩИТН|СИГНАЛЬН|ТЕПЛОИЗОЛ/.test(all)) return null;
    }
    if (sub === 'ROPE' && /ПОЛИПРОП|ДЖУТ|ПЕНЬК|КАПРОН|СИНТЕТ|ХЛОПЧ/.test(all)) return null;
    if (sub === 'SHEET') {
      if (/ГИПС|ПОЛИКАРБ|ПВХ|АСБЕСТ|ШИФЕР|ХРИЗОТИЛ|ЦСП|ДСП|ДВП|ФАНЕР|ОСБ|OSB|ПРОФИЛИРОВ|ПРОФНАСТ|КРОВЕЛЬН|СТЕКЛ|ПАРОНИТ|РЕЗИН|ВИНИПЛАСТ|ТЕКСТОЛИТ|ПЕНОПЛ|ПЕНОПОЛ|МИНЕРАЛ|ВАТ|ГИДРОИЗ|БИТУМ|РУБЕРОИД|ГРАФИТ|МРАМОР|ГРАНИТ|КЕРАМ|ПЛАСТ|ПОЛИСТИР|ПОЛИМЕР(?!Н[А-Я]* ПОКРЫТ)|ДЕКОРАТ|ЛИСТВЕН|ЛИСТВ|ЛИСТОВКА|ЛИСТОК|ЗАЖИМ|ПРОСЕЧНО/.test(all)) return null;
      if (!/(СТАЛ|РУБЛЕН|МЕТАЛЛ|Г\s?\.\s?К|Х\s?\.\s?К|ГК(?![А-Я])|ХК(?![А-Я])|ГОРЯЧ|ХОЛОДНО|ОЦИНК|РИФЛ|НЕРЖ|ТИТАН|АЛЮМИН|МЕДН|ЛАТУН|Б-ПН|ПРОКАТ|АISI|ЖЕЛЕЗ|ЖЕСТ|РУЛОН|\d+Х\d{3,4}Х\d{3,4})/.test(all) && unit !== 'т' && unit !== 'кг') return null;
    }
    if (sub === 'BAR' && /ОТРЕЗН|ШЛИФ|ЗАЧИСТ|АЛМАЗ|ПОЛИР|ЛЕПЕСТК|ФИБР|КРУГЛЫЕ ЛЕСО|ЗНАК|ВОДЫ|КРУГЛ(ЫЙ|АЯ) (СТОЛ|ЛЮК)/.test(all)) return null;
    if (sub === 'BAR' && !/(СТАЛ|Г\s?\.\s?К|ГК(?![А-Я])|КАЛИБР|Д\s*-?\s*\d|\d\s*ММ|Ø|(?:^|[^А-ЯЁІA-Z0-9_])СТ)/.test(all)) return null;
    if (sub === 'ELECTRODE' && /ГРАФИТ|ЗАЗЕМЛ|УГОЛЬН|ВОЛЬФРАМ|СРАВНЕН|ЭЛЕКТРОДН(ЫЙ|АЯ)|СВАРОЧН[А-Я]* АППАРАТ|FUJIKURA|FUJIKUR|FS[МM]-\d|РХТ|PXT/.test(all)) return null;
    if (sub === 'REBAR' && /ЗАПОРН|ТРУБОПРОВОДН|САНТЕХ|ВОДОПРОВОДН|РЕГУЛИР|ПРЕДОХРАН|ТРУБНАЯ|ГАЗОВ|ОСВЕТИТ|СВЕТИЛЬН|КРАН/.test(all)) return null;
    if (sub === 'ANCHOR' && /ОПОР|СВАЕЙ|КАБЕЛ|НАТЯЖН|ПОДДЕРЖ|ЗАЖИМ/.test(all) && !/БЛОК АНКЕРН|АНКЕРНЫЙ БЛОК|АБ\s*-?\s*\d/.test(all)) return null;
    if (sub === 'STRIP' && /ПОЛОСА ОТВОДА|ПОЛОСЫ ОТВОДА|ДОРОЖН|РАЗМЕТ|ПОЛОСА ДВИЖ|РЕЗИН|ВУЛКАНИЗ|ПАРОНИТ|ПВХ|ПОЛИМЕР(?!Н[А-Я]* ПОКРЫТ)|ПОЛИЭТИЛЕН|ВОЙЛОК|ФЕТР|УПЛОТНИТ/.test(all)) return null;
    if (sub === 'SCREW' && /ВИНТОВ|ДОМКРАТ|СВАИ|СВАЯ|КОНВЕЙЕР|КОМПРЕССОР|НАСОС/.test(all)) return null;
    if (sub === 'FLANGE' && /АДАПТЕР(?! ФЛАН)/.test(s) && !/ФЛАНЦЕВ/.test(s)) return null;
    if (sub === 'REBAR' && /(?:^|[^А-Я])ПРУТ(ОК|КИ)(?![А-Я])/.test(s) && !/АРМАТУР|ПЕРИОДИЧ|(?:^|[^А-ЯЁІA-Z0-9_])А\s*-?\s*(\d{3}|I)/.test(s) && /ТИТАН|ЛАТУН|МЕДН|АЛЮМИН|БРОНЗ|НЕРЖ|КРУГЛ/.test(s)) sub = 'BAR';
    if (sub === 'BAR') { var rcb = rebarClass(s); if (rcb && rcb.cls !== 'А240') sub = 'REBAR'; }
    if (sub === 'BOLT' && /БОЛТ[А-Я]*\s+АНКЕРН/.test(s)) sub = 'ANCHOR';
    return { sub: sub, item: s, ctx: ctx, all: all, pos: h.pos };
  }

  var MAXL = 3;

  function Builder(sub) {
    this.sub = sub; this.slots = []; this.attrs = { sub: sub }; this.pre = []; this.post = [];
  }
  Builder.prototype.put = function (name, val, lvl, label) {
    if (val === null || val === undefined || val === '' || (typeof val === 'number' && !isFinite(val))) return this;
    this.slots.push({ n: name, v: String(val), l: lvl || 0, label: label || (name + '=' + val) });
    return this;
  };
  Builder.prototype.get = function (name) {
    for (var i = 0; i < this.slots.length; i++) if (this.slots[i].n === name) return this.slots[i].v;
    return null;
  };
  Builder.prototype.render = function (k, swap) {
    var parts = [this.sub];
    for (var i = 0; i < this.slots.length; i++) {
      var sl = this.slots[i];
      if (swap && swap[sl.n] !== undefined) {
        if (swap[sl.n] === null) continue;
        parts.push(swap[sl.n]);
        continue;
      }
      if (sl.l === 0 || sl.l > k) parts.push(sl.n + ':' + sl.v);
    }
    return parts.join('|');
  };
  Builder.prototype.droppedAt = function (k) {
    var out = [];
    for (var i = 0; i < this.slots.length; i++) if (this.slots[i].l === k) out.push(this.slots[i].label);
    return out;
  };
  Builder.prototype.special = function (swap, drop, where) {
    (where === 'pre' ? this.pre : this.post).push({ swap: swap, drop: drop, deep: where !== 'pre' });
  };
  var CUR = { text: '', expl: [], origin: null, maker: null, pack: null };

  var ORIGIN = [
    ['RU', /РОССИ(Я|И|ЙСК)|(?:^|[^А-ЯЁІA-Z0-9_])РФ(?![А-ЯЁІA-Z0-9_])/], ['UZ', /УЗБЕКИСТАН/],
    ['CN', /КИТА(Й|Я)|(?:^|[^А-ЯЁІA-Z0-9_])КНР(?![А-ЯЁІA-Z0-9_])/], ['TR', /ТУРЦИ/], ['BY', /БЕЛАРУС|БЕЛОРУС/],
    ['UA', /УКРАИН/], ['KZ', /КАЗАХСТАН/], ['IR', /(?:^|[^А-ЯЁІA-Z0-9_])ИРАН(?![А-ЯЁІA-Z0-9_])/], ['AZ', /АЗЕРБАЙДЖАН/],
    ['PL', /ПОЛЬШ/], ['DK', /(?:^|[^А-ЯЁІA-Z0-9_])ДАНИ[ЯИ](?![А-ЯЁІA-Z0-9_])/], ['FR', /ФРАНЦИ/], ['KG', /КИРГИЗ|КЫРГЫЗ/],
    ['DE', /ГЕРМАНИ/], ['IT', /(?:^|[^А-ЯЁІA-Z0-9_])ИТАЛИ[ЯИ](?![А-ЯЁІA-Z0-9_])/], ['KR', /(?:^|[^А-ЯЁІA-Z0-9_])КОРЕ[ЯИ](?![А-ЯЁІA-Z0-9_])/],
    ['IN', /(?:^|[^А-ЯЁІA-Z0-9_])ИНДИ[ЯИ](?![А-ЯЁІA-Z0-9_])/]
  ];
  function originOf(s) {
    var out = [];
    for (var i = 0; i < ORIGIN.length; i++) if (ORIGIN[i][1].test(s)) out.push(ORIGIN[i][0]);
    return out.length ? out.sort().join('/') : null;
  }
  var MAKER = [
    ['АРСЕНАЛ', /АРСЕНАЛ/], ['ЭКСПЕРТ', /ЭКСПЕРТ/], ['GOODEL', /GOODEL/], ['ЛЭЗ', /(?:^|[^А-ЯЁІA-Z0-9_])ЛЭЗ(?![А-ЯЁІA-Z0-9_])/],
    ['МЭЗ', /(?:^|[^А-ЯЁІA-Z0-9_])МЭЗ(?![А-ЯЁІA-Z0-9_])/], ['IMEX', /IMEX/], ['MONOLIT', /MONOLIT|МОНОЛИТ/],
    ['ЗОЛОТОЙ МОСТ', /ЗОЛОТОЙ МОСТ/], ['БОЛЬШОЙ МОСТ', /БОЛЬШОЙ МОСТ/], ['СПЕЦЭЛЕКТРОД', /СПЕЦЭЛЕКТРОД/],
    ['ПРОМ', /(?:^|[^А-ЯЁІA-Z0-9_])ПРОМ(?=,|\s+Д)/], ['PREMIUM', /PREMIUM/], ['BASIC', /(?:^|[^А-ЯЁІA-Z0-9_])BASIC(?![А-ЯЁІA-Z0-9_])/],
    ['STONE BRIDGE', /STONE BRIDGE/], ['ТАГМЕТ', /ТАГМЕТ/], ['SILVER', /SILVER/], ['GOLD', /(?:^|[^А-ЯЁІA-Z0-9_])GOLD(?![А-ЯЁІA-Z0-9_])/],
    ['VLF', /(?:^|[^А-ЯЁІA-Z0-9_])VLF(?![А-ЯЁІA-Z0-9_])/], ['СКО', /(?:^|[^А-ЯЁІA-Z0-9_])СКО(?![А-ЯЁІA-Z0-9_])/],
    ['BRP', /(?:^|[^А-ЯЁІA-Z0-9_])BRP(?![А-ЯЁІA-Z0-9_])/], ['ESAB', /ESAB/], ['KOBATEK', /KOBATEK/],
    ['МАНДАЛАМА', /МАНДАЛАМА/], ['GENERICA', /GENERICA/], ['АТМ', /(?:^|[^А-ЯЁІA-Z0-9_])ATM(?![А-ЯЁІA-Z0-9_])/],
    ['IEK', /(?:^|[^А-ЯЁІA-Z0-9_])IEK(?![А-ЯЁІA-Z0-9_])/], ['AR PLAST', /AR PLAST/], ['LFT', /(?:^|[^А-ЯЁІA-Z0-9_])LFT(?![А-ЯЁІA-Z0-9_])/], ['EKF', /(?:^|[^А-ЯЁІA-Z0-9_])EKF(?![А-ЯЁІA-Z0-9_])/]
  ];
  function fold(re) {
    var src = re.source, out = '', inCls = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (ch === '\\') { out += ch + src.charAt(i + 1); i++; continue; }
      if (ch === '[') inCls = true; else if (ch === ']') inCls = false;
      out += !inCls && LAT[ch] ? LAT[ch] : ch;
    }
    return new RegExp(out);
  }
  for (var mi = 0; mi < MAKER.length; mi++) MAKER[mi][1] = fold(MAKER[mi][1]);
  function makerOf(s) {
    var out = [];
    for (var i = 0; i < MAKER.length; i++) if (MAKER[i][1].test(s)) out.push(MAKER[i][0]);
    return out.length ? out.join('/') : null;
  }
  function packOf(s) {
    var m = /УПАКОВК[А-Я]*\s*-?\s*(\d+(?:\.\d+)?)\s*(КГ|ШТ|М)/.exec(s) || /В КОРОБКЕ\s*-?\s*(\d+(?:\.\d+)?)\s*(КГ|ШТ|М)/.exec(s) ||
      /БУХТ[А-Я]*\s*-?\s*(\d+(?:\.\d+)?)\s*(КГ|М)/.exec(s) || /\(\s*(\d+)\s*(ШТ)\.?\s*\/\s*КОМП/.exec(s) || /В СВЯЗКЕ\s*(\d+)()/.exec(s) ||
      /\(\s*(\d+)\s*(М)\.?\s*\)/.exec(s) || /\(\s*(\d+)\s*(ШТ)\.?\s*\)/.exec(s);
    return m ? fmt(m[1]) + (m[2] || '') : null;
  }
  function numsIn(s) {
    var out = [], m, re = /\d+(?:\.\d+)?/g;
    while ((m = re.exec(String(s)))) out.push(fmt(m[0]));
    return out;
  }
  function explain(s) { var n = numsIn(s); for (var i = 0; i < n.length; i++) CUR.expl.push(n[i]); return ' '; }
  function attrNums(v, out) {
    if (v === null || v === undefined || typeof v === 'boolean') return out;
    if (typeof v === 'number') { out[fmt(v)] = 1; return out; }
    if (typeof v === 'string') { var n = numsIn(v); for (var i = 0; i < n.length; i++) out[n[i]] = 1; return out; }
    if (typeof v === 'object') for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) attrNums(v[k], out);
    return out;
  }
  function countOf(list) { var o = {}; for (var i = 0; i < list.length; i++) o[list[i]] = (o[list[i]] || 0) + 1; return o; }
  var CLASSLIKE = { cls: 1, wcls: 1, grade: 1, type: 1, brand: 1, str: 1, agr: 1, gc: 1, std: 1, steel: 1, mark: 1, peg: 1, pe_grade: 1 };
  Builder.prototype.residue = function () {
    if (!CUR.text) return;
    var size = {}, cls = {}, k, i;
    var flat = CUR.text.replace(/[\s\-.]+/g, '');
    function printed(val) {
      var t = String(val).replace(/[\s\-.]+/g, ''), n = 0, at = 0;
      if (!t) return 0;
      for (;;) { var j = flat.indexOf(t, at); if (j < 0) break; n++; at = j + t.length; }
      return n;
    }
    for (k in this.attrs) if (Object.prototype.hasOwnProperty.call(this.attrs, k)) {
      if (CLASSLIKE[k]) {
        var vals = Object.prototype.toString.call(this.attrs[k]) === '[object Array]' ? this.attrs[k] : [this.attrs[k]];
        for (var vi = 0; vi < vals.length; vi++) {
          if (vals[vi] === null || vals[vi] === undefined || typeof vals[vi] === 'boolean') continue;
          var times = Math.max(1, printed(vals[vi])), cc = countOf(numsIn(vals[vi]));
          for (var x in cc) cls[x] = Math.max(cls[x] || 0, cc[x] * times);
        }
      } else attrNums(this.attrs[k], size);
    }
    var segs = this.render(0).split('|');
    for (i = 0; i < segs.length; i++) {
      var c = segs[i].indexOf(':'), nm = c > 0 ? segs[i].slice(0, c) : '';
      if (CLASSLIKE[nm]) { var t2 = Math.max(1, printed(segs[i].slice(c + 1))), cc2 = countOf(numsIn(segs[i].slice(c + 1))); for (var y in cc2) cls[y] = Math.max(cls[y] || 0, cc2[y] * t2); }
      else { var sn = numsIn(c > 0 ? segs[i].slice(c + 1) : segs[i]); for (var j = 0; j < sn.length; j++) size[sn[j]] = 1; }
    }
    var ex = countOf(CUR.expl);
    var all = numsIn(CUR.text.replace(/(^|[^А-ЯЁІA-Z_])(ММ|СМ|М|ДМ)[23²³](?![0-9])/g, '$1 ')), res = [];
    var seen = {};
    for (i = 0; i < all.length; i++) {
      var v = all[i];
      if (size[v]) continue;
      seen[v] = (seen[v] || 0) + 1;
      if (seen[v] > Math.max(ex[v] || 0, cls[v] || 0)) res.push(v);
    }
    res = uniq(res);
    if (res.length) { this.put('x', res.join('/'), 2, 'прочие числа ' + res.join(', ')); this.attrs.residue = res; }
  };
  Builder.prototype.done = function () {
    if (CUR.maker) this.put('mk', CUR.maker, 1, 'производитель ' + CUR.maker);
    if (CUR.origin) this.put('orig', CUR.origin, 1, 'страна ' + CUR.origin);
    if (CUR.pack) this.put('pack', CUR.pack, 1, 'упаковка ' + CUR.pack);
    if (CUR.tu) this.put('tu', 'ТУ', 1, 'по ТУ');
    if (CUR.line) { this.put('line', CUR.line, 1, 'серия «' + CUR.line + '»'); this.attrs.line = CUR.line; }
    if (CUR.maker) this.attrs.maker = CUR.maker;
    if (CUR.origin) this.attrs.origin = CUR.origin;
    if (CUR.pack) this.attrs.pack = CUR.pack;
    this.residue();
    var key = this.render(0), seen = {}, levels = [], i, k;
    seen[key] = 1;
    for (i = 0; i < this.pre.length; i++) {
      var pk = this.render(0, this.pre[i].swap);
      if (!seen[pk]) { seen[pk] = 1; levels.push({ key: pk, drop: this.pre[i].drop, minor: true }); }
    }
    var cum = [];
    for (k = 1; k <= MAXL; k++) {
      var d = this.droppedAt(k);
      if (!d.length) continue;
      cum = cum.concat(d);
      var kk = this.render(k);
      if (seen[kk]) continue;
      seen[kk] = 1;
      var lv = { key: kk, drop: cum.slice() };
      if (k === 1) lv.minor = true;
      levels.push(lv);
    }
    for (i = 0; i < this.pre.length; i++) this.post.push({ swap: this.pre[i].swap, drop: this.pre[i].drop, deep: true });
    for (i = 0; i < this.post.length; i++) {
      var sk = this.render(MAXL, this.post[i].swap);
      if (seen[sk]) continue;
      seen[sk] = 1;
      levels.push({ key: sk, drop: uniq(this.post[i].drop.concat(cum)) });
    }
    return { family: 'steel', key: key, attrs: this.attrs, levels: levels };
  };

  function takeLength(s) {
    var len = [], meas = null;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(НЕ)?МЕРН(ОЙ|АЯ|ЫЕ|ЫЙ)\s*(ДЛИН[А-Я]*)?/g, function (x, ne) { meas = ne ? 'НЕМЕРН' : 'МЕРН'; return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])L\s*[=:\-]?\s*(\d+(?:\.\d+)?)\s*(ММ|М)?(?![А-Я0-9])/g, function (x, n, u) { len.push(fmt(n) + (u || '')); return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(?:ПРИ\s+)?ДЛИН(ОЙ|А|ЫЙ|Е)?\s*(ТРУБЫ\s*)?[=:\-]?\s*(\d+(?:\.\d+)?)\s*(ММ|МЕТР[А-Я]*|М|П\.\s?М)?(?![А-Я0-9])/g, function (x, a, b, n, u) { len.push(fmt(n) + (u ? u.replace(/[\s.]/g, '').replace(/^МЕТР[А-Я]*$/, 'М') : '')); return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])Д\s*(\d{4,5})\s*ММ(?![А-Я])/g, function (x, n) { if (num(n) < 2000) return x; len.push(n + 'ММ'); return ' '; });
    s = s.replace(/Х\s*(\d{4,5}(?:\.\d+)?)\s*(ММ|М)?(?![А-Я0-9Х])/g, function (x, n, u) { len.push(fmt(n) + (u || '')); return ' '; });
    s = s.replace(/(?:^|\s)(\d{4,5})\s*ММ(?![А-Я])/g, function (x, n) { if (num(n) < 4000) return x; len.push(n + 'ММ'); return ' '; });
    s = s.replace(/\b(\d{1,2}(?:\.\d+)?)\s*М(?![А-Я0-92³3])(?=[^Х]*$)/g, function (x, n) {
      len.push(fmt(n) + 'М'); return ' ';
    });
    return { s: squash(s), len: uniq(len), meas: meas };
  }

  function pushStd(b, P) {
    if (P.std.length) b.attrs.std = P.std;
  }

  function coatingZn(s) {
    if (/(^|[^А-Я])(ОЦИНК|ОЦ\.|ОЦ(?![А-Я])|ЦИНК|ГОРЯЧЕОЦИНК|ОЦИНКОВАН|ТЕРМОДИФ|Ц(?![А-Я])|1Ц|0-1Ц|О-1Ц)/.test(s)) return 'ZN';
    return null;
  }

  function pipeMat(text) {
    if (/ППУ/.test(text)) return null;
    if (/(ПОЛИЭТИЛЕН|ПЭ\s?-?\s?(80|100|RT)|РЕ\s?-?\s?(80|100)|ПНД|П\/Э|ПЭ(?![А-Я])|ПВД|HDPE|НDРЕ|ПЕНД)/.test(text)) return /ПВД/.test(text) ? 'PELD' : 'PE';
    if (/(ПОЛИПРОПИЛЕН|ППР|ПП-?Р|ППRС|РРR|РР-R|(?:^|[^А-ЯЁІA-Z0-9_])ПП(?![А-Я])|РРRС)/.test(text)) return 'PP';
    if (/(ПВХ|РVС|PVC|НПВХ|ПОЛИВИНИЛХЛОРИД)/.test(text)) return 'PVC';
    if (/(МЕТАЛЛОПЛАСТ|МЕТАЛЛОПОЛИМЕР)/.test(text)) return 'PEXAL';
    if (/ПЛАСТМАСС|ПЛАСТИКОВ/.test(text)) return /SDR|(?:^|[^А-ЯЁІA-Z0-9_])РN|PN/.test(text) ? 'PE' : 'PL';
    if (/(БАЗАЛЬТ)/.test(text)) return 'BAS';
    if (/(ЧУГУН)/.test(text)) return 'CI';
    if (/(МЕДН|МЕДЬ)/.test(text)) return 'CU';
    if (/(НЕРЖ|АISI|\d{1,2}Х\d{1,2}Н\d)/.test(text)) return 'SS';
    if (/(ОЦИНК|ОЦ\.|(?:^|[^А-ЯЁІA-Z0-9_])ОЦ(?![А-ЯЁІA-Z0-9_])|ГОРЯЧЕОЦИНК)/.test(text)) return 'ZN';
    if (/(СТАЛЬН|СТАЛИ|МЕТАЛЛИЧ|МЕТАЛЛ(?![А-Я])|ЭЛЕКТРОСВАРН|ВОДОГАЗОПРОВОДН|ВГП|БЕСШОВН|Б\/Ш|Г\/Д|Х\/Д|Э\/С|СПИРАЛЬН|ПРЯМОШОВН|ОБСАДН|(?:^|[^А-ЯЁІA-Z0-9_])СТ\.|(?:^|[^А-ЯЁІA-Z0-9_])СТ\d|ГОРЯЧЕДЕФОРМ|ХОЛОДНОДЕФОРМ|ПРИВАРН|КРУТОИЗОГН|КРУГЛОИЗОГН|ВОРОТНИКОВ)/.test(text)) return 'ST';
    return null;
  }

  function pipeKg(D, t, zn) {
    if (!(D > 0 && t > 0 && t < D / 2)) return null;
    var kg = 0.0246615 * (D - t) * t;
    if (zn) kg *= 1.03;
    return round1(kg);
  }

  function printedKgM(s) {
    var m = /МАСС[АЫ]\s*(1\s*)?(МЕТРА|М|П\.М)\s*(=|-|:)?\s*(\d+(?:\.\d+)?)\s*КГ/.exec(s);
    return m ? num(m[4]) : null;
  }

  function parsePipe(c, P, unit) {
    var all = c.all, item = c.item;
    var text = item + ' ' + c.ctx;
    var ppu = /ППУ|ПЕНОПОЛИУРЕТАН/.test(all);
    var mat = pipeMat(text);
    if (ppu) mat = 'ST';
    if (!mat && (unit === 'т' || unit === 'кг')) mat = 'ST';
    var G = grades(item);
    if (G.ss && (mat === 'ST' || !mat)) mat = 'SS';
    var s = G.s;
    var kgPrinted = printedKgM(s);
    s = s.replace(/\(?\s*ТЕОР[А-Я.]*\s*МАСС[А-Я]*\s*1?\s*(МЕТРА|М)?\s*=?\s*\d+(\.\d+)?\s*КГ\s*\)?/g, explain);
    var L = takeLength(s); s = L.s;
    var plastic = mat === 'PE' || mat === 'PP' || mat === 'PVC' || mat === 'PELD' || mat === 'PEXAL' || mat === 'PL';
    var b = new Builder(ppu ? 'PIPE_PPU' : 'PIPE');
    var a = b.attrs;
    var D = null, t = null, A = null, B = null, dn = null, din = null, dFromDn = false, m;
    var profile = /ПРОФИЛЬН|КВАДРАТН|ПРЯМОУГОЛ|ПРЯМОУГОЛН|ПРЯМОУГОЛЬН/.test(s);
    var corr0 = /ГОФР/.test(all);
    var classed = plastic || mat === 'BAS' || corr0;
    m = /ВГП\s*(\d+)\s*Х\s*(\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/.exec(s);
    if (m) { dn = num(m[1]); t = num(m[2]); D = num(m[3]); s = s.replace(m[0], ' '); }
    if (!m) {
      var mdn = /(?:Д\s*\.?\s*УСЛ\.?\s*(?:ПРОХОДА)?|ДИАМЕТРОМ УСЛОВНОГО ПРОХОДА(?: ММ)?|(?:^|[^А-ЯЁІA-Z0-9_])ДУ\s*\.?\s*П(?=\s*[=:\-]?\s*\d)|(?:^|[^А-ЯЁІA-Z0-9_])ДУ|(?:^|[^А-ЯЁІA-Z0-9_])DN|(?:^|[^А-ЯЁІA-Z0-9_])Д\s*Н?\s*У)\s*[=:\-]?\s*(\d+)(?:\s*ММ)?(?![А-ЯЁІA-Z0-9_])/.exec(s);
      if (mdn) { dn = num(mdn[1]); s = s.replace(mdn[0], ' '); }
      var mdi = /ДИАМЕТР(?:ОМ)? ВНУТРЕННИ[ЙМ]\s*(ДО\s*)?(\d+)/.exec(s) || /ВНУТРЕННИМ ДИАМЕТРОМ\s*(ДО\s*)?(\d+)/.exec(s) || /(?:^|[^А-ЯЁІA-Z0-9_])D\s?ВН\s*[=\-]?\s*(ДО\s*)?(\d+)/.exec(s);
      if (mdi) { if (mdi[1]) return null; din = num(mdi[2]); s = s.replace(mdi[0], ' '); }
      if (/(?:^|[^А-ЯЁІA-Z0-9_])ДО\s*\d+\s*ММ/.test(s)) return null;
      var mt = /(?:(?:ТОЛЩ|ТОЛЬШ)[А-Я.]*\s*(?:СТЕНКИ)?|СТЕНК[АИ]|(?:^|[^А-ЯЁІA-Z0-9_])Н\s*=)\s*[=:\-]?\s*(\d+(?:\.\d+)?)(\s*\+\s*\d+(?:\.\d+)?)?/.exec(s);
      if (mt) { t = num(mt[1]); if (mt[2]) { a.t_tol = num(mt[2].replace(/[^\d.]/g, '')); explain(mt[2]); } s = s.replace(mt[0], ' '); }
      var mo = /(?:НАРУЖН[А-Я]*\s*ДИАМЕТР[А-Я]*|ДИАМЕТР НАРУЖН[А-Я]*|Д\s*Н\s*\.?)\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*Х\s*(\d+(?:\.\d+)?))?/.exec(s);
      if (mo) { D = num(mo[1]); if (mo[2] && t === null) t = num(mo[2]); s = s.replace(mo[0], ' '); }
      var m3 = /ТИП\s*3\s*-\s*(\d+(?:\.\d+)?)Х(\d+(?:\.\d+)?)/.exec(s);
      if (m3) { D = num(m3[1]); t = num(m3[2]); s = s.replace(m3[0], ' '); a.wsub = 'Т3'; }
      var mgl = D === null ? /(?:ПВХ|ПНД|ППР|НПВХ)\s*-?\s*(\d{2,4})(?![\d.Х])/.exec(s) : null;
      if (mgl && num(mgl[1]) >= 10) { D = num(mgl[1]); s = s.replace(mgl[0], ' '); }
      if (D === null) {
        var m3d = /(\d+(?:\.\d+)?)Х(\d+(?:\.\d+)?)Х(\d+(?:\.\d+)?)/.exec(s);
        var m2d = /(\d+(?:\.\d+)?)Х(\d+(?:\.\d+)?)/.exec(s);
        if (m3d && (profile || num(m3d[3]) < num(m3d[2]) && num(m3d[2]) > 8)) {
          A = num(m3d[1]); B = num(m3d[2]); t = num(m3d[3]); s = s.replace(m3d[0], ' ');
        } else if (m2d && profile && t !== null) {
          A = num(m2d[1]); B = num(m2d[2]); s = s.replace(m2d[0], ' ');
        } else if (m2d && profile && t === null && num(m2d[2]) > num(m2d[1]) / 6) {
          A = num(m2d[1]); B = num(m2d[2]); s = s.replace(m2d[0], ' ');
        } else if (m2d) {
          D = num(m2d[1]); t = t === null ? num(m2d[2]) : t; s = s.replace(m2d[0], ' ');
        } else {
          var mD = /(?:ДИАМЕТР(?:ОМ)?|ДИАМ\.?|ДИЕМТРОМ|(?:^|[^А-ЯЁІA-Z0-9_])Д\s*\.?|(?:^|[^А-ЯЁІA-Z0-9_])D)\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s);
          if (mD) { D = num(mD[1]); s = s.replace(mD[0], ' '); }
          else {
            var mi = /СТ\.?\s*(?:ISO\s*)?(\d{3,4})\s+(\d{1,2}(?:\.\d+)?)(?![\d.Х])/.exec(s) || /(?:^|\s)(\d{3,4})\s+(\d{1,2}\.\d+)(?![\d.Х])/.exec(s);
            if (mi) { D = num(mi[1]); t = num(mi[2]); s = s.replace(mi[0], ' '); }
            else {
              var mb = /(?:^|\s)(\d+(?:\.\d+)?)\s*ММ(?![А-Я])/.exec(s) || /(?:ТРУБ[А-Я]*|СТАЛЬН[А-Я]*|ВГП|ШОВН[А-Я]*)\s+(\d+(?:\.\d+)?)(?![\d.Х])/.exec(s);
              if (mb) { D = num(mb[1]); s = s.replace(mb[0], ' '); }
            }
          }
        }
      }
    }
    if (A !== null) {
      if (B > A) { var tmp = A; A = B; B = tmp; }
      b.sub = ppu ? 'PIPE_PPU' : 'PIPE_PROF';
    }
    var vgp = /ВОДОГАЗОПРОВОДН|ВГП/.test(s + ' ' + all);
    if (D !== null && dn === null && A === null && vgp && DN_VGP[D] && t === null) { dn = D; D = null; }
    if (D === null && A === null && dn !== null) {
      if (plastic || /ГОФР/.test(all)) { D = dn; }
      else if (mat === 'ST' || mat === 'ZN' || mat === 'SS' || !mat) {
        var od = vgp ? DN_VGP[dn] : DN_OD[dn];
        if (od) { D = od; dFromDn = true; }
      }
    }
    if (D === null && A === null && din === null) return null;
    if (D !== null && !(D >= 3 && D <= 3000)) return null;
    if (t !== null && D !== null && !(t > 0 && t < D / 2)) t = null;
    var dinSlot = null;
    if (din !== null && D !== null) {
      if (t === null && D > din) t = round1((D - din) / 2);
      else if (t === null || Math.abs(D - 2 * t - din) > 0.6) dinSlot = fmt(din);
    }
    var dnSlot = null;
    if (dn !== null && D !== null && !dFromDn && A === null) {
      if (!(DN_OD[dn] === D || DN_VGP[dn] === D || OD_DN[D] === dn || ((plastic || corr0) && dn === D))) dnSlot = fmt(dn);
    }
    var seam = null, wsub = a.wsub || null;
    if (!plastic) {
      if (/БЕСШОВН|Б\/Ш|Г\/Д|Х\/Д|ГОРЯЧЕДЕФОРМ|ХОЛОДНОДЕФОРМ|ГОРЯЧЕКАТ|Г\.\s?К\.?(?![А-Я])/.test(all)) {
        seam = 'S';
        wsub = /Х\/Д|ХОЛОДНОДЕФОРМ/.test(all) ? 'ХД' : /Г\/Д|ГОРЯЧЕДЕФОРМ|ГОРЯЧЕКАТ|Г\.\s?К/.test(all) ? 'ГД' : null;
      } else if (/СПИРАЛЬН/.test(all)) { seam = 'W'; wsub = 'СПИР'; }
      else if (/SАWL/.test(all)) { seam = 'W'; wsub = 'SAWL'; }
      else if (a.wsub === 'Т3' || /ТИП\s*3/.test(all)) { seam = 'W'; wsub = 'Т3'; }
      else if (vgp) { seam = 'W'; wsub = 'ВГП'; }
      else if (/ТЕРМОУСИЛ/.test(all)) { seam = 'W'; wsub = 'ЭСТУ'; }
      else if (/ЭЛЕКТРОСВАРН|Э\/С|ЭС(?![А-Я])|ПРЯМОШОВН|(^|[^А-Я])СВАРН|(^|[^А-Я])ШОВН|EW(?![А-Я])|ЕW(?![А-Я])/.test(all)) { seam = 'W'; wsub = 'ЭС'; }
      if (/ОБСАДН/.test(all)) wsub = 'ОБСАДН';
    }
    var corr = /ГОФР/.test(all);
    var layers = /ДВУХСЛОЙН|ДВУСТЕНН|ДВУХСТЕНН/.test(all) ? 2 : /ТРЕХСЛОЙН|ТРЁХСЛОЙН/.test(all) ? 3 : null;
    var sdr = null, pn = null, peg = null, sn = null;
    var ms = /SDR\s*-?\s*(\d+(?:\.\d+)?)/.exec(all);
    if (ms) sdr = num(ms[1]);
    var mS = /(?:^|[^А-ЯЁІA-Z0-9_])S\s*(\d+(?:\.\d+)?)(?![\d.])/.exec(all), sSlot = null;
    if (mS) { var sv = num(mS[1]); if (sdr !== null && Math.abs((sdr - 1) / 2 - sv) <= 0.06) explain(mS[1]); else sSlot = fmt(sv); }
    var mmpa = /ПРИ\s*20\s*°?\s*С?\s*МПА\s*(\d+(?:\.\d+)?)/.exec(all);
    if (mmpa) { explain('20'); a.pn_mpa = num(mmpa[1]); if (pn === null) pn = round1(num(mmpa[1]) * 10); }
    var mp = /(?:РN|PN|РУ)\s*-?\s*(\d+(?:\.\d+)?)/.exec(all);
    if (mp) pn = num(mp[1]);
    var mg = /(?:ПЭ|РЕ)\s*-?\s*(80|100)(?![0-9])/.exec(all);
    if (mg) peg = 'ПЭ' + mg[1];
    var msn = /SN\s*-?\s*(\d+(?:\s\d{3})?)/.exec(all);
    if (msn) { sn = num(msn[1].replace(/\s/g, '')); if (sn >= 1000) sn = sn / 1000; if (/\s/.test(msn[1])) explain(msn[1].split(/\s/)[1]); a.sn = sn; }
    var sdrFromDt = false, sdrFromPn = false;
    if (mat === 'PE' && sdr === null && t !== null && D !== null) {
      var r = D / t;
      for (var i = 0; i < SDR_STD.length; i++) if (Math.abs(r - SDR_STD[i]) / SDR_STD[i] <= 0.03) { sdr = SDR_STD[i]; sdrFromDt = true; break; }
    }
    if (mat === 'PE' && sdr === null && pn !== null && peg && PN_SDR[peg][pn]) { sdr = PN_SDR[peg][pn]; sdrFromPn = true; }
    var use = /ХВС/.test(all) ? 'ХВС' : /ГВС/.test(all) ? 'ГВС' : /КАНАЛИЗАЦ/.test(all) ? 'КАН' : null;
    var arm = /АРМИРОВАН/.test(all) ? (/СТЕКЛОВОЛОК/.test(all) ? 'СВ' : /АЛЮМИН/.test(all) ? 'АЛ' : 'АРМ') : /МЕТАЛЛИЧЕСК[А-Я]* СЛО/.test(all) ? 'МЕТ' : null;
    var mlay = /(\d)\s*-?\s*Х?\s*СЛОЙН/.exec(all);
    var quiet = /БЕСШУМН|МАЛОШУМН/.test(all) ? 'БЕСШУМ' : null;
    var cuff = /С МАНЖЕТ/.test(all) ? 'МАНЖ' : null;
    var nonp = /БЕЗНАПОРН/.test(all) ? 'БЕЗНАП' : null;
    var conduit = /ЗОНДОМ|ПРОТЯЖК|ДЛЯ ПРОВОДКИ|ДЛЯ ПРОКЛАДКИ|ЭЛЕКТРОТЕХН|ГЛАДКАЯ ЖЕСТКАЯ|ДЛЯ КАБЕЛ|КАБЕЛЬН/.test(all) ? 'КАБ' :
      /СПЛИНКЕР|СПРИНКЛЕР|КАПЕЛЬН|ОРОШЕН|ПОЛИВ/.test(all) ? 'ОРОШ' :
      /ГИБК/.test(all) && !/ГОФР/.test(all) ? 'ГИБК' : null;
    var jacket = null, sheath = null;
    if (ppu) {
      var mj = /(\d+(?:\.\d+)?)Х(\d+(?:\.\d+)?)\s*(?:\(\s*\d+(?:\.\d+)?\s*\))?\s*-\s*(?:1\s*\(\s*)?(\d{2,4})\s*\)?\s*-/.exec(item.replace(/,(?=\d)/g, '.'));
      var mj2 = /-\s*1\s*\(\s*(\d{2,4})\s*\)/.exec(item) || /\d(?:[.,]\d+)?\s*-\s*(\d{2,4})\s*-\s*1/.exec(item);
      if (mj2) jacket = num(mj2[1]);
      var mty = /-\s*([12])\s*(?:\(\s*\d+\s*\))?\s*-\s*ППУ/.exec(item);
      if (mty) a.ppu_type = mty[1];
      sheath = /ОБОЛОЧКА\s*ОЦ|-ОЦ(?![А-Я])|ОЦИНК/.test(all) ? 'ОЦ' : /ОБОЛОЧКА\s*ПЭ|-ПЭ(?![А-Я])|ПЭ\s*,|(?:^|[^А-ЯЁІA-Z0-9_])ПЭ(?![А-ЯЁІA-Z0-9_])/.test(all) ? 'ПЭ' : null;
    }
    b.put('mat', mat, 0);
    if (A !== null) { b.put('A', fmt(A), 0); b.put('B', fmt(B), 0); }
    else if (D !== null) b.put('D', fmt(D), 0);
    else b.put('DIN', fmt(din), 0);
    if (corr) b.put('shape', 'ГОФР', 0);
    if (corr && /ИЗОЛИРОВАН/.test(all)) b.put('ins', 'ИЗОЛ', 2, 'изолированная');
    b.put('DIN', dinSlot, 3, 'внутренний диаметр ' + dinSlot);
    b.put('dn', dnSlot, 1, 'Ду ' + dnSlot + ' (не совпадает с D)');
    b.put('use0', conduit, 0);
    if (ppu) { b.put('ppu', a.ppu_type || null, 0); b.put('J', jacket !== null ? fmt(jacket) : null, 2, 'оболочка ' + jacket); b.put('sheath', sheath, 2, 'оболочка ' + sheath); }
    if (classed) {
      if (sdr !== null) {
        b.put('SDR', fmt(sdr), 3, 'SDR ' + fmt(sdr));
        b.put('T', t !== null ? fmt(t) : null, 2, 'стенка ' + fmt(t));
        b.put('PN', pn !== null ? fmt(pn) : null, 2, 'PN ' + fmt(pn));
      } else if (pn !== null) {
        b.put('PN', fmt(pn), 3, 'PN ' + fmt(pn));
        b.put('T', t !== null ? fmt(t) : null, 2, 'стенка ' + fmt(t));
      } else b.put('T', t !== null ? fmt(t) : null, 3, 'стенка ' + fmt(t));
      b.put('SN', sn !== null ? fmt(sn) : null, 2, 'SN ' + fmt(sn));
      b.put('S', sSlot, 2, 'серия S ' + sSlot);
      b.put('L', layers, 2, 'двухслойная');
      b.put('arm', arm, 2, 'армированная');
      if (mlay && layers === null) b.put('L', mlay[1], 2, mlay[1] + '-слойная');
      b.put('quiet', quiet, 2, 'бесшумная');
      b.put('ser', /ТЯЖЕЛ[А-Я]* ТИП/.test(all) ? 'Т' : /СРЕДН[А-Я]* ТИП/.test(all) ? 'С' : /ЛЕГК[А-Я]* ТИП/.test(all) ? 'Л' : null, 2, 'тип');
      b.put('cuff', cuff, 1, 'с манжетами');
      b.put('np', nonp, 2, 'безнапорная');
      b.put('peg', peg, 1, peg);
      b.put('use', use, 1, use);
    } else {
      b.put('T', t !== null ? fmt(t) : null, 3, 'стенка ' + fmt(t));
      b.put('seam', seam, 2, seam === 'S' ? 'бесшовная' : 'сварная');
      b.put('wsub', wsub, 2, 'вид ' + wsub);
      if (/ВЕСЬМА УСИЛ|ВУС(?![А-Я])/.test(all)) b.put('ins', 'ВУС', 2, 'изоляция ВУС');
      if (/ПЕЧН[А-Я]* СВАРК/.test(all)) b.put('proc', 'ПЕЧН', 1, 'печная сварка');
      b.put('grade', G.grades.length ? G.grades.slice().sort().join('/') : null, 1, 'марка ' + G.grades.join('/'));
      b.put('sc', G.sc, 1, G.sc);
      if (/НЕФТ|ГАЗОВОЙ ПРОМ|МАГИСТРАЛЬН/.test(all)) b.put('app', 'НГ', 1, 'нефтегазовая');
      b.put('psl', P.psl || null, 1, P.psl);
      var mk = /(?:^|[^А-ЯЁІA-Z0-9_])(К\s?\d{2})(?![А-ЯЁІA-Z0-9_])/.exec(all); if (mk && /ТИП\s*3|К42|К52|К50|К60/.test(all)) b.put('cls', mk[1].replace(/\s/g, ''), 1, 'класс ' + mk[1]);
      if (/(?:^|[^А-ЯЁІA-Z0-9_])II(?![А-ЯЁІA-Z0-9_])|(?:^|[^А-ЯЁІA-Z0-9_])ІІ(?![А-ЯЁІA-Z0-9_])|(?:^|[^А-ЯЁІA-Z0-9_])ГР\.?\s*В(?![А-ЯЁІA-Z0-9_])/.test(all)) b.put('grp', 'II', 1, 'группа II');
    }
    if (L.len.length) b.put('len', L.len.join('/'), 1, 'длина ' + L.len.join('/'));
    if (L.meas) b.put('meas', L.meas, 1, L.meas === 'МЕРН' ? 'мерная длина' : 'немерная длина');
    a.mat = mat;
    if (D !== null) a.D = D;
    if (A !== null) { a.A = A; a.B = B; }
    if (din !== null) a.din = din;
    if (t !== null) a.t = t;
    if (dn !== null) a.dn = dn;
    if (dFromDn) a.d_from_dn = true;
    if (seam) a.seam = seam;
    if (wsub) a.wsub = wsub;
    if (sdr !== null) { a.sdr = sdr; if (sdrFromDt) a.sdr_from_dt = true; if (sdrFromPn) a.sdr_from_pn = true; }
    if (pn !== null) a.pn = pn;
    if (peg) a.pe_grade = peg;
    if (G.grades.length) a.grade = G.grades;
    if (L.len.length) a.length = L.len;
    if (ppu) { a.jacket = jacket; a.sheath = sheath; }
    pushStd(b, P);
    var kg = kgPrinted;
    if (!kg && !plastic && (mat === 'ST' || mat === 'ZN' || mat === 'SS' || !mat) && !ppu && t !== null) {
      if (A !== null) kg = round1(0.0157 * t * (A + B - 2.86 * t));
      else if (D !== null && !dFromDn) kg = pipeKg(D, t, mat === 'ZN');
      else if (D !== null) kg = pipeKg(D, t, mat === 'ZN');
      if (kg) a.kg_per_m_from = A !== null ? 'ГОСТ 8639-82/8645-68 formula' : 'ГОСТ 10704-91 formula' + (mat === 'ZN' ? ' +3 % (ГОСТ 3262-75)' : '');
    } else if (kg) {
      a.kg_per_m_from = 'printed';
      var kf = A !== null && t !== null ? 0.0157 * t * (A + B - 2.86 * t) : (D !== null && t !== null ? pipeKg(D, t, mat === 'ZN') : null);
      if (kf && Math.abs(kg / kf - 1) > 0.05) b.put('kgm', fmt(kg), 1, 'масса 1 м ' + fmt(kg));
    }
    if (kg && kg > 0) a.kg_per_m = kg;
    if (!plastic && D !== null && A === null) {
      var dnLevel = dn !== null ? dn : OD_DN[D];
      if (dnLevel) b.special({ D: 'DN:' + dnLevel, T: null, seam: null, wsub: null, mat: null }, ['Ду ' + dnLevel + ' вместо D ' + fmt(D)]);
    }
    if (plastic && D !== null && A === null && !corr) b.special({ D: 'DN:' + fmt(D), mat: null }, ['Ду ' + fmt(D) + ' (пластик: Ду = D)']);
    if (mat) b.special({ mat: null }, ['материал ' + mat]);
    if (conduit === 'КАБ' && corr) b.special({ use0: null, mat: null }, ['гофра для кабеля']);
    return b.done();
  }

  function fitMat(c, unit) {
    var text = c.item + ' ' + c.ctx;
    var mat = /НЕРЖ|АISI/.test(text) ? 'SS' : pipeMat(text);
    if (/ППУ/.test(text)) mat = 'ST';
    if (!mat && /ЭЛЕКТРОФУЗ|ЭЛЕКТРОСВАРН(АЯ|ЫЕ) (МУФТ|ОТВОД|ТРОЙН)|КОМПРЕСС|ЛИТЬЕВ|СВАРН[А-Я]* ВСТЫК|СЕГМЕНТН/.test(text)) mat = 'PE';
    if (!mat && /КАНАЛИЗАЦ/.test(text)) mat = 'PP';
    if (!mat && (unit === 'т' || unit === 'кг')) mat = 'ST';
    return mat;
  }

  function parseFitting(c, P, unit) {
    var all = c.all, item = c.item, sub = c.sub;
    var ppu = /ППУ/.test(all);
    var mat = fitMat(c, unit);
    var G = grades(item);
    if (G.ss && (!mat || mat === 'ST')) mat = 'SS';
    var s = G.s;
    var plastic = mat === 'PE' || mat === 'PP' || mat === 'PVC' || mat === 'PELD' || mat === 'PL';
    var b = new Builder(sub + (ppu ? '_PPU' : ''));
    var a = b.attrs;
    var ang = null, m;
    s = s.replace(/[°º]/g, ' ГРАД ');
    if (sub === 'ELBOW') {
      m = /(?:^|[^0-9.])(15|30|45|60|90)\s*-\s*(\d+(?:\.\d+)?)\s*Х\s*(\d+(?:\.\d+)?)/.exec(s);
      if (m) { ang = num(m[1]); s = s.replace(m[0], ' ' + m[2] + 'Х' + m[3] + ' '); }
    }
    m = /(\d{1,2}\s*-\s*)?(\d{2,3})\s*(?:ГРАД[А-Я.]*|ГР\.?(?![А-Я])|\*|Х\s*-)/.exec(s);
    if (m && m[1] && (num(m[2]) === 45 || num(m[2]) === 90)) { ang = num(m[1]) + '-' + m[2]; s = s.replace(m[0], ' '); m = null; }
    if (m) m = [m[0], m[2]];
    if (m && (num(m[1]) === 15 || num(m[1]) === 30 || num(m[1]) === 45 || num(m[1]) === 60 || num(m[1]) === 90 || num(m[1]) === 180)) { ang = num(m[1]); s = s.replace(m[0], ' '); }
    if (ang === null && sub === 'ELBOW') {
      m = /(?:ОТВОД[А-Я]*|-)\s*(15|30|45|60|90)(?=\s*-|\s(?:ДУ|D|Д)|\sС\s)/.exec(s);
      if (m) { ang = num(m[1]); s = s.replace(m[0], ' '); }
    }
    if (/ПОЛУОТВОД/.test(all) && ang === null) ang = 45;
    var peg = null;
    s = s.replace(/\(?\s*(?:ПЭ|РЕ)\s*-?\s*(80|100)\s*\)?/g, function (x, g) { peg = 'ПЭ' + g; return explain(x); });
    var pn = null, mp = /(?:РN|PN|РУ)\s*-?\s*(\d+(?:\.\d+)?)/.exec(s) || /(?:^|[^А-ЯЁІA-Z0-9_])Р\s*-?\s*(6|10|16|25|40|63)(?![\d.Х])/.exec(s);
    if (mp) { pn = num(mp[1]); s = s.replace(mp[0], ' '); }
    var mpair = /(?:(?:^|[^А-ЯЁІA-Z0-9_])ДУ|(?:^|[^А-ЯЁІA-Z0-9_])DN)\s*[=:\-]?\s*(\d+)\s*\/\s*(?:DN\s*)?(\d+)(?![\d.])/.exec(s);
    if (mpair) s = s.replace(mpair[0], ' ' + mpair[1] + 'Х' + mpair[2] + ' ');
    var mpa = /ДАВЛЕНИ[ЕЯ]М?\s*(\d+(?:\.\d+)?)\s*(МПА|КГС\s*\/\s*СМ2|АТМ)/.exec(s);
    if (mpa) { pn = /МПА/.test(mpa[2]) ? num(mpa[1]) * 10 : num(mpa[1]); s = s.replace(mpa[0], explain(mpa[0])); }
    s = s.replace(/\/?\s*(\d+(?:\.\d+)?)\s*КГС\s*\/\s*СМ\s*2\s*\/?/g, function (x, v) { if (pn === null) pn = num(v); return explain(x); });
    var sdr = null, ms = /SDR\s*-?\s*(\d+(?:\.\d+)?)/.exec(s);
    if (ms) { sdr = num(ms[1]); s = s.replace(ms[0], ' '); }
    s = s.replace(/(\d+(?:\.\d+)?)\s*Х\s*(\d+(?:\.\d+)?)\s*\(\s*(\d+)\s*\)\s*(?=,|$)/g, function (x, d1, t1, n1) {
      if (OD_DN[num(d1)] === num(n1) || DN_OD[num(n1)] === num(d1)) { explain(n1); return d1 + 'Х' + t1 + ' '; }
      return x;
    });
    var dn = null, mdn = /(?:(?:^|[^А-ЯЁІA-Z0-9_])ДУ|(?:^|[^А-ЯЁІA-Z0-9_])DN|(?:^|[^А-ЯЁІA-Z0-9_])Д\s*\.?\s*У\.?|ДИАМЕТРОМ УСЛОВНОГО ПРОХОДА(?: ММ)?)\s*[=:\-]?\s*(\d+)(?![А-ЯЁІA-Z0-9_])/.exec(s);
    if (mdn) { dn = num(mdn[1]); s = s.replace(mdn[0], ' '); }
    var xD = null, xT = null;
    var mxt = /(?:ТОЛЩИН[А-Я]*|ТОЛЩ\.?)\s*(?:СТЕНКИ)?\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?(?:\s*\/\s*(\d+(?:\.\d+)?))?/.exec(s);
    if (mxt) { xT = mxt[2] ? [mxt[1], mxt[2], mxt[3]].filter(Boolean).map(fmt).join('/') : num(mxt[1]); s = s.replace(mxt[0], ' '); }
    if (ang === null && sub === 'ELBOW') {
      m = /(?:^|[\s-])(30|45|60|90)(?=\s|-|,|$)(?!\s*ММ)/.exec(s);
      if (m) { ang = num(m[1]); s = s.replace(m[0], ' '); }
    }
    s = s.replace(/(\d)\s*Х\s*([13]\/[248]|1\s1\/[24])"?/g, '$1 Х $2');
    var thread = null, mth, thl = [], tre0 = /(?:^|[^\d.\/])(1\s1\/[24]"?|[13]\/[248]"?|[1-4]")(?![\d\/])/;
    while ((mth = tre0.exec(s))) { thl.push(mth[1].replace(/\s/g, '_').replace(/"$/, mth[1].indexOf('/') >= 0 ? '' : '"')); s = s.replace(mth[0], mth[0].charAt(0) === mth[1].charAt(0) ? ' ' : mth[0].charAt(0) + ' '); }
    if (thl.length) thread = thl.join(';');
    var s2 = s;
    var ppuType = null;
    var fjacket = null;
    if (ppu) s2 = s2.replace(/-\s*([12])\s*(?:\(\s*(\d+)\s*\))?\s*-?\s*ППУ.*$/, function (x, t1, j1) { ppuType = t1; if (j1) fjacket = j1; return explain(x); });
    s2 = s2.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(СОДК|ОДК|1-ППУ|ППУ)(?![А-ЯЁІA-Z0-9_])/g, explain);
    s2 = s2.replace(/РАСХОД ТРУБ[^,;]*?\d+(?:\.\d+)?\s*М(?![А-Я])/g, explain);
    var ftype = null;
    s2 = s2.replace(/ТИП(?:А)? ФИТИНГА\s*([А-Я]{1,2})(?![А-Я])/, function (x, t1) { ftype = t1; return ' '; });
    var holes = null;
    s2 = s2.replace(/(\d+)\s*ОТВЕРС?Т?СТ?ВИ[ЙЯ]/, function (x, h1) { holes = h1; return ' '; });
    var radius = null;
    s2 = s2.replace(/(?:^|\s)(1|1\.5|2|3|5)\s*D(?![A-ZА-Я])/, function (x, r1) { radius = r1 + 'D'; return ' '; });
    var dnPair = null;
    s2 = s2.replace(/\(\s*(?:ДУ\s*-?\s*)?(\d+)\s*Х\s*(\d+)\s*\)/g, function (x, d1, d2) {
      if (DN_LIST[d1] && DN_LIST[d2]) { dnPair = [num(d1), num(d2)]; return explain(x); }
      return x;
    });
    var xD2 = null, xT2 = null;
    s2 = s2.replace(/ДИАМЕТР[А-Я]*:?\s*НАЧАЛО\s*(\d+(?:\.\d+)?)\s*ММ,?\s*КОНЕЦ\s*(\d+(?:\.\d+)?)\s*ММ/, function (x, d1, d2) { xD = num(d1); xD2 = num(d2); return ' '; });
    s2 = s2.replace(/ТОЛЩИН[А-Я]* СТЕНКИ:?\s*НАЧАЛО\s*(\d+(?:\.\d+)?)\s*ММ,?\s*КОНЕЦ\s*(\d+(?:\.\d+)?)\s*ММ/, function (x, d1, d2) { xT = num(d1); xT2 = num(d2); return ' '; });
    var tAlt = null;
    s2 = s2.replace(/(\d+(?:\.\d+)?\s*Х\s*\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/, function (x, g1, t1) { tAlt = num(t1); return g1 + ' '; });
    s2 = s2.replace(/(\d{2,4})\s*\/\s*(\d{2,4})(?![\d.])/g, '$1Х$2');
    s2 = s2.replace(/(?:ДИАМЕТР(?:ОМ)?|ДИАМ\.?|(?:^|[^А-ЯЁІA-Z0-9_])Д\s*Н?\s*[.=\-]|(?:^|[^А-ЯЁІA-Z0-9_])D\s*[=\-]?)\s*(?=\d)/g, ' ');
    var toks = [], tre = /(\d+(?:\.\d+)?)(?:\s*Х\s*(\d+(?:\.\d+)?))?(?:\s*Х\s*(\d+(?:\.\d+)?))?/g, mm;
    var smallWall = null;
    while ((mm = tre.exec(s2))) {
      if (/^\d(\.\d+)?$/.test(mm[1]) && !mm[2] && /^\s*ММ/.test(s2.slice(mm.index + mm[0].length))) { smallWall = num(mm[1]); continue; }
      if (/^\d$/.test(mm[1]) && !mm[2]) continue;
      toks.push([num(mm[1]), mm[2] ? num(mm[2]) : null, mm[3] ? num(mm[3]) : null, mm.index, mm[0]]);
    }
    toks = toks.filter(function (x) {
      if (x[0] >= 6 && x[0] <= 3000) return true;
      if (x[1] === null && x[0] < 6 && /ММ/.test(s2.slice(x[3] + x[4].length, x[3] + x[4].length + 4))) smallWall = x[0];
      return false;
    });
    if (!toks.length && dn === null && xD === null && !thread) return null;
    function wallLike(A, B) { return B <= 40 && B < A / 4; }
    var D = null, t = null, D2 = null, t2 = null, D3 = null, dFromDn = false;
    if (xD !== null) { D = xD; t = xT; if (xD2 !== null) { D2 = xD2; t2 = xT2; } }
    else if (toks.length) {
      var k0 = toks[0];
      if (k0[2] !== null) { D = k0[0]; D2 = k0[1]; D3 = k0[2]; }
      else if (k0[1] !== null) { if (xT === null && wallLike(k0[0], k0[1])) { D = k0[0]; t = k0[1]; } else { D = k0[0]; D2 = k0[1]; } }
      else D = k0[0];
      if (toks.length > 1 && D2 === null && sub !== 'FLANGE') {
        var k1 = toks[1];
        D2 = k1[0];
        if (k1[1] !== null && wallLike(k1[0], k1[1])) t2 = k1[1]; else if (k1[1] !== null) D3 = k1[1];
      }
      if (t === null && xT !== null) t = xT;
    }
    if (D !== null && toks.length && xD !== null) {
      for (var ti = 0; ti < toks.length; ti++) if (toks[ti][0] !== D && D2 === null && sub !== 'FLANGE') { D2 = toks[ti][0]; break; }
    }
    if (t === null && smallWall !== null) t = smallWall;
    if (tAlt !== null && t !== null) t = fmt(t) + '/' + fmt(tAlt);
    if (sub === 'FLANGE') {
      if (dn !== null && D !== null && D < dn && D <= 60) { t = D; D = null; }
      if (dn === null && D !== null) {
        if (DN_LIST[D] || plastic) dn = D;
        else if (OD_DN[D]) { dn = OD_DN[D]; a.dn_from_d = D; }
        else dn = D;
      }
      D = null; if (t !== null && dn !== null && t >= dn) t = null;
    } else if (D === null && dn !== null) {
      if (plastic) D = dn;
      else if (DN_OD[dn] && (mat === 'ST' || mat === 'ZN' || mat === 'SS' || ppu)) { D = DN_OD[dn]; dFromDn = true; }
    }
    if (dnPair && dn === null) dn = dnPair[0];
    if (dnPair) a.dn2 = dnPair[1];
    var dnOnly = sub !== 'FLANGE' && D === null && dn !== null;
    if (sub !== 'FLANGE' && D === null && dn === null && !thread) return null;
    if (typeof t === 'number' && D !== null && !(t > 0 && t < D / 2)) t = null;
    if (D2 !== null && D !== null && sub === 'TEE' && D3 !== null && D3 === D && D2 > D) { var x = D; D = D2; D2 = x; }
    var equal = (sub === 'TEE' || sub === 'CROSS') && (D2 === null || D2 === D) && (D3 === null || D3 === D);
    var kind = null;
    if (sub === 'ELBOW') kind = /КРУТОИЗОГН/.test(all) ? 'КРУТ' : /КРУГЛОИЗОГН|ГНУТ/.test(all) ? 'ГНУТ' : /СЕКЦИОН|СЕГМЕНТ|СВАРН/.test(all) && !plastic ? 'СВАРН' : null;
    if (sub === 'FLANGE') kind = /ВОРОТНИК/.test(all) ? 'ВОРОТН' : /СВОБОДН/.test(all) ? 'СВОБ' : /ПЛОСК/.test(all) ? 'ПЛОСК' : /ГЛУХ|ЗАГЛУШ/.test(all) ? 'ГЛУХ' : /ЛИТЬЕВ/.test(all) ? 'ЛИТ' : null;
    if (sub === 'COUP' || sub === 'ELBOW' || sub === 'TEE' || sub === 'CAP' || sub === 'RED' || sub === 'CROSS') {
      var pk = [];
      if (/ЭЛЕКТРОФУЗ|ЭЛЕКТРОСВАРН/.test(all)) pk.push('ЭФ');
      if (/КОМПРЕСС/.test(all)) pk.push('КОМПР');
      if (/РЕЗЬБ|(?:^|[^А-ЯЁІA-Z0-9_])РЕЗ\.?(?![А-ЯЁІA-Z0-9_])/.test(all) || thread) pk.push('РЕЗЬБ');
      if (/ЛИТЬЕВ/.test(all)) pk.push('ЛИТ');
      if (/КАНАЛИЗАЦ/.test(all)) pk.push('КАН');
      if (/СЕГМЕНТ/.test(all)) pk.push('СЕГМ');
      if (/ПЕРЕХОДН|РЕДУК|УГОЛ-ПЕРЕХОД/.test(all) && sub !== 'RED') pk.push('ПЕРЕХ');
      if (/КОМБИНИР/.test(all)) pk.push('КОМБ');
      if (/РАЗЪЕМН|РАЗЬЕМН|АМЕРИКАН/.test(all)) pk.push('РАЗЪЕМ');
      if (/ПОД КЛЮЧ/.test(all)) pk.push('КЛЮЧ');
      if (/НАСТЕНН/.test(all)) pk.push('НАСТЕН');
      if (/С КОЛЬЦОМ/.test(all)) pk.push('КОЛЬЦ');
      if (/АДАПТЕР/.test(all)) pk.push('АДАПТ');
      if (/С ГАЙКАМИ|С ГАЙКОЙ/.test(all)) pk.push('ГАЙК');
      if (/НИПЕЛ|НИППЕЛ/.test(all)) pk.push('НИПП');
      if (/СЕДЛО/.test(all)) pk.push('СЕДЛО');
      if (pk.length) kind = (kind ? kind + '+' : '') + pk.join('+');
    }
    if (sub === 'RED') { var ex = /ЭКСЦЕНТР/.test(all) ? 'ЭКС' : /КОНЦЕНТР/.test(all) ? 'КОНЦ' : null; if (ex) kind = kind ? kind + '+' + ex : ex; }
    var tside = /НАРУЖН[А-Я]*\.?\s*РЕЗ|НАР\.?\s*РЕЗ|\d"?\s*НХ\d|НАРХ\d|(?:^|[^А-ЯЁІA-Z0-9_])Н\/Р(?![А-ЯЁІA-Z0-9_])/.test(all) ? 'НАР' :
      /ВНУТРЕН[А-Я]*\.?\s*РЕЗ|ВНУТ[А-Я]*\.?\s*РЕЗ|\d"?\s*ВХ\d|ВНХ\d|(?:^|[^А-ЯЁІA-Z0-9_])В\/Р(?![А-ЯЁІA-Z0-9_])/.test(all) ? 'ВН' : null;
    var sheath = ppu ? (/-ОЦ|ОБОЛОЧКА\s*ОЦ|ОЦИНК/.test(all) ? 'ОЦ' : 'ПЭ') : null;
    var short = /УКОРОЧ|-У(?![А-Я])/.test(all) ? 'УКОР' : null;
    b.put('mat', mat, 0);
    if (sub === 'FLANGE') b.put('DN', dn !== null ? fmt(dn) : null, 0);
    else if (dnOnly) b.put('DN', fmt(dn), 0);
    else b.put('D', D !== null ? fmt(D) : null, 0);
    b.put('D2', equal ? null : (D2 !== null ? fmt(D2) : null), 0);
    b.put('D3', D3 !== null && D3 !== D && !equal ? fmt(D3) : null, 0);
    if (thread) b.put('thr', thread, 0);
    b.put('ang', ang !== null ? (typeof ang === 'string' ? ang : fmt(ang)) : null, sub === 'ELBOW' ? 0 : 2, 'угол ' + ang);
    b.put('T', t !== null ? (typeof t === 'string' ? t : fmt(t)) : null, 3, 'стенка ' + t);
    if (sub === 'RED' || sub === 'TEE') b.put('T2', t2 !== null ? fmt(t2) : null, 3, 'стенка ' + fmt(t2));
    b.put('PN', pn !== null ? fmt(pn) : null, sub === 'FLANGE' ? 2 : 3, 'PN ' + fmt(pn));
    b.put('SDR', sdr !== null ? fmt(sdr) : null, 3, 'SDR ' + fmt(sdr));
    b.put('kind', kind, 2, 'вид ' + kind);
    b.put('ppu', ppuType, 0);
    b.put('R', radius, 2, 'радиус ' + radius);
    b.put('ftype', ftype, 1, 'тип фитинга ' + ftype);
    b.put('holes', holes, 1, holes + ' отверстий');
    b.put('sheath', sheath, 2, 'оболочка ' + sheath);
    b.put('J', fjacket, 2, 'оболочка ' + fjacket);
    b.put('tside', tside, 2, tside === 'НАР' ? 'наружная резьба' : 'внутренняя резьба');
    b.put('short', short, 2, 'укороченный');
    b.put('grade', G.grades.length ? G.grades.slice().sort().join('/') : null, 1, 'марка ' + G.grades.join('/'));
    b.put('peg', peg, 1, peg);
    if (sub !== 'FLANGE' && dn !== null && D !== null && !dFromDn && !(DN_OD[dn] === D || DN_VGP[dn] === D || OD_DN[D] === dn || (plastic && dn === D)))
      b.put('dn', fmt(dn), 1, 'Ду ' + fmt(dn) + ' (не совпадает с D)');
    a.mat = mat; if (D !== null) a.D = D; if (t !== null) a.t = t; if (D2 !== null) a.D2 = D2; if (D3 !== null) a.D3 = D3; if (thread) a.thread = thread;
    if (dn !== null) a.dn = dn; if (dFromDn) a.d_from_dn = true; if (ang !== null) a.angle = ang; if (pn !== null) a.pn = pn;
    if (sdr !== null) a.sdr = sdr; if (kind) a.kind = kind;
    pushStd(b, P);
    if (!plastic && D !== null && sub !== 'FLANGE') {
      var dl = dn !== null ? dn : OD_DN[D];
      if (dl) b.special({ D: 'DN:' + dl, T: null, T2: null, mat: null }, ['Ду ' + dl + ' вместо D ' + fmt(D)]);
    }
    if (plastic && D !== null && sub !== 'FLANGE') b.special({ D: 'DN:' + fmt(D), mat: null }, ['Ду ' + fmt(D) + ' (пластик: Ду = D)']);
    if (mat) b.special({ mat: null }, ['материал ' + mat]);
    return b.done();
  }

  function barKg(d) { return d > 0 ? round1(0.0061654 * d * d) : null; }

  function rebarClass(s) {
    var m, out = null, src = null;
    if ((m = /(?:^|[^А-ЯЁІA-Z0-9_])АТ\s*-?\s*(\d{3,4})\s*(СК|С)?(?![А-Я0-9])/.exec(s))) { out = 'АТ' + m[1] + (m[2] || ''); src = m[0]; }
    else if ((m = /(?:^|[^А-ЯЁІA-Z0-9_])А\s*-?\s*(240|300|400|500|550|600|800|1000)\s*(СП|СК|С)?(?![0-9])/.exec(s))) {
      var n = m[1], k = m[2] || '';
      if (n === '500' && !k) k = 'С';
      out = 'А' + n + k; src = m[0];
    }
    else if ((m = /(?:^|[^А-ЯЁІA-Z0-9_])А\s*-?\s*(I{1,3}|IV|V|І{1,3}|1|2|3)(?![А-Я0-9IІ])/.exec(s))) {
      var r = m[1].replace(/І/g, 'I');
      out = r === 'I' || r === '1' ? 'А240' : r === 'II' || r === '2' ? 'А300' : r === 'III' || r === '3' ? 'А400' : r === 'IV' ? 'А600' : 'А800';
      src = m[0];
    }
    return out ? { cls: out, src: src } : null;
  }

  function parseRebar(c, P, unit) {
    var all = c.all, item = c.item;
    var mat = /БАЗАЛЬТ|КОМПОЗИТ|СТЕКЛОПЛАСТ|АБК|АСК/.test(all) ? 'COMP' : 'ST';
    var b = new Builder('REBAR');
    var a = b.attrs;
    var cl = rebarClass(item.replace(/ДИАМЕТРОМ|ДИАМ\.?/g, explain));
    var s = item;
    if (cl) { s = s.replace(cl.src, ' '); explain(cl.src); }
    var G = grades(s); s = G.s;
    var cls = cl ? cl.cls : null, clsFromGrade = false;
    if (!cls) {
      for (var i = 0; i < G.grades.length; i++) {
        var g = G.grades[i];
        if (g === '35ГС' || g === '25Г2С' || g === '25ГС' || g === '32Г2РПС') { cls = 'А400'; clsFromGrade = true; break; }
        if (g === 'СТ5ГПС' || g === 'СТ5СП' || g === 'СТ5ПС' || g === '18Г2С') { cls = 'А300'; clsFromGrade = true; break; }
      }
    }
    if (/ПЕРИОДИЧ/.test(all) && !cls) a.ribbed = true;
    var L = takeLength(s); s = L.s;
    var codes = [];
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(О[МВ]\d)(?![0-9])/g, function (x, o1) { codes.push(o1); return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(\d)\s*СОРТ(?![А-Я])/g, function (x, s1) { codes.push(s1 + 'СОРТ'); return ' '; });
    s = s.replace(/\b(\d)[ФF]\s*-?\s*(МД\d)?\s*-?/g, function (x, f1, md) { codes.push(f1 + 'Ф' + (md ? '-' + md : '')); return ' '; })
      .replace(/(?:^|[^А-ЯЁІA-Z0-9_])(МД\d)\s*-?/g, function (x, md) { codes.push(md); return ' '; })
      .replace(/(?:^|[^А-ЯЁІA-Z0-9_])Ф\s*(?=\d)/g, ' Ø ').replace(/ПРУТОК|PRUTOK|ПРУТКИ/g, explain);
    s = s.replace(/УМК/g, explain);
    var d = null, dr = null, m;
    m = /(?:ДИАМЕТР(?:ОМ)?|ДИАМ\.?|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|(?:^|[^А-ЯЁІA-Z0-9_])D|Ø)\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/.exec(s);
    if (!m) m = /(?:^|[\s(,-])(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:ММ)?(?=[\s,)(-]|$)/.exec(s);
    if (m) { d = num(m[1]); if (m[2] && num(m[2]) > d && num(m[2]) <= 40) dr = num(m[2]); }
    if (d !== null && !(d >= 3 && d <= 80)) d = null;
    var item2 = /(СТЕРЖ|ИЗДЕЛИ|ХОМУТ|ДЕТАЛ|ЗАКЛАДН|ПЕТЛ)/.exec(all);
    if (/ИЗ АРМАТУРЫ|ИЗДЕЛИЯ ИЗ АРМАТУРЫ|АРМАТУРА СТЕРЖНЕВАЯ/.test(all) && item2) { b.sub = 'REBAR_ITEM'; b.put('item', item2[1], 0); }
    b.put('mat', mat === 'ST' ? null : mat, 0);
    b.put('D', d !== null ? (dr !== null ? fmt(d) + '-' + fmt(dr) : fmt(d)) : null, 0);
    b.put('cls', cls, 2, 'класс ' + cls);
    b.put('grade', G.grades.length ? G.grades.slice().sort().join('/') : null, 1, 'марка ' + G.grades.join('/'));
    if (L.len.length) b.put('len', L.len.join('/'), 1, 'длина ' + L.len.join('/'));
    b.put('meas', L.meas, 1, L.meas === 'МЕРН' ? 'мерная длина' : 'немерная длина');
    if (/ДЮБЕЛ/.test(all)) b.put('use', 'ДЮБЕЛЬ', 1, 'дюбель');
    b.put('code', codes.length ? uniq(codes).sort().join('/') : null, 1, 'код ' + codes.join('/'));
    a.mat = mat; if (d !== null) a.d = d; if (dr !== null) a.d_max = dr; if (cls) a.cls = cls; if (clsFromGrade) a.cls_from_grade = true;
    a.profile = cls === 'А240' ? 'smooth' : cls ? 'ribbed' : (a.ribbed ? 'ribbed' : null);
    if (G.grades.length) a.grade = G.grades;
    if (mat === 'ST' && d !== null && dr === null) { a.kg_per_m = barKg(d); a.kg_per_m_from = 'ГОСТ 5781-82 0.0061654·d²'; }
    pushStd(b, P);
    if (dr !== null) b.special({ D: 'D:' + fmt(dr) }, ['диапазон ' + fmt(d) + '–' + fmt(dr) + ' → ' + fmt(dr)], 'pre');
    if (b.sub === 'REBAR_ITEM') {
      b.post.push({ swap: { item: null }, drop: ['изделие из арматуры'], deep: true });
    }
    if (cls === 'А240' && d !== null && d <= 12) b.xlevels = [{ key: 'ROD|D:' + fmt(d), drop: ['А240 → катанка'] }];
    if (d !== null) b.special({ D: null }, ['диаметр ' + fmt(d)]);
    var r = b.done();
    if (b.sub === 'REBAR_ITEM') {
      for (var j = 0; j < r.levels.length; j++) r.levels[j].key = r.levels[j].key.replace(/^REBAR_ITEM\|(?!item:)/, 'REBAR|');
    }
    if (b.xlevels) r.levels = r.levels.concat(b.xlevels);
    return r;
  }

  function parseRod(c, P, unit) {
    var s = c.item, b = new Builder('ROD'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var L = takeLength(s); s = L.s;
    var cls = null, rcode = null;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])В\s*-?\s*([12])\s+(?=\d)/, function (x, c1) { cls = 'В' + c1; return ' '; });
    if (!cls) s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])В\s*(?=\d)/, function () { cls = 'В'; return ' '; });
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(У\d{2})(?![А-ЯЁІA-Z0-9_])/g, function (x, u1) { rcode = u1; return ' '; });
    var d = null, dr = null;
    m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*ММ/.exec(s);
    if (m) { d = num(m[1]); dr = num(m[2]); }
    else {
      m = /(?:ДИАМЕТР(?:ОМ)?|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|(?:^|[^А-ЯЁІA-Z0-9_])D|Ø)?\s*[=:\-]?\s*(\d+(?:\.\d+)?)\s*(ММ)?/.exec(s);
      if (m) d = num(m[1]);
    }
    if (d === null || !(d >= 3 && d <= 20)) return null;
    var rmat = /МЕДН|МЕДЬ/.test(c.all) ? 'CU' : /АЛЮМИН/.test(c.all) ? 'AL' : null;
    b.put('mat', rmat, 0);
    if (rmat) a.mat = rmat;
    b.put('D', dr !== null ? fmt(d) + '-' + fmt(dr) : fmt(d), 0);
    b.put('grade', G.grades.length ? G.grades.slice().sort().join('/') : (G.weld || null), 1, 'марка');
    if (G.weld) b.put('weld', G.weld, 2, 'сварочная ' + G.weld);
    b.put('pc', cls, 1, 'класс точности');
    b.put('code', rcode, 1, 'код ' + rcode);
    if (L.len.length) b.put('len', L.len.join('/'), 1, 'длина');
    b.put('meas', L.meas, 1, 'мерная');
    a.d = d; if (dr !== null) a.d_max = dr; if (G.grades.length) a.grade = G.grades;
    if (dr === null && !rmat) { a.kg_per_m = barKg(d); a.kg_per_m_from = 'ГОСТ 2590 / 0.0061654·d²'; }
    pushStd(b, P);
    if (dr !== null) b.special({ D: 'D:' + fmt(dr) }, ['диапазон ' + fmt(d) + '–' + fmt(dr) + ' → ' + fmt(dr)], 'pre');
    return b.done();
  }

  function diamList(s) {
    var m, list = [];
    var re = /(?:Ø|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|ДИАМЕТРОМ|ДИАМ\.?|(?:^|[^А-ЯЁІA-Z0-9_])D)\s*[=:\-]?\s*((?:\d+(?:\.\d+)?\s*(?:ММ)?\s*[;,]\s*)*\d+(?:\.\d+)?)((?:\s*ММ)?\s*-\s*\d+(?:\.\d+)?)?/g, last = null, prior = [];
    while ((m = re.exec(s))) { if (last) prior.push(last[0]); last = m; }
    var rng = prior.length ? uniq(numsIn(prior.join(' '))) : null;
    if (rng) { var own = numsIn(last[0]), extra = false; for (var ri = 0; ri < rng.length; ri++) if (own.indexOf(rng[ri]) < 0) extra = true; rng = extra ? rng.join('-') : null; }
    if (last) {
      if (last[2]) return { list: null, range: [num(last[1]), num(last[2].replace(/ММ/g, '').replace(/[^\d.]/g, ''))], src: last[0], rng: rng };
      last[1].split(/[;,]/).forEach(function (x) { var v = num(x.replace(/ММ/g, '')); if (isFinite(v)) list.push(v); });
      return { list: uniq(list.map(fmt)), src: last[0], rng: rng };
    }
    m = /(\d+(?:\.\d+)?)\s*(?:ММ)?\s*-\s*(\d+(?:\.\d+)?)\s*ММ(?![А-Я])/.exec(s);
    if (m && num(m[2]) > num(m[1])) return { list: null, range: [num(m[1]), num(m[2])], src: m[0] };
    m = /(?:^|\s)(\d+(?:\.\d+)?)\s*ММ(?![А-Я])/.exec(s) || /(?:ПРОВОЛОКА|ПРОВОЛОКИ)\s+(\d+(?:\.\d+)?)(?![\d.Х])/.exec(s);
    if (m) return { list: [fmt(m[1])], src: m[0] };
    return { list: [], src: null };
  }

  function parseWire(c, P, unit) {
    var all = c.all, s = c.item, b = new Builder('WIRE'), a = b.attrs;
    var G = grades(s); s = G.s;
    var alg = /(?:^|[^А-ЯЁІA-Z0-9_])(АМ|АТ|АДО|АД\d{0,2})(?=\s*\d|\s*$)/.exec(s);
    if (alg) s = s.replace(alg[0], explain(alg[0]));
    var mat = /МЕДН|МЕДЬ/.test(all) && !/ОМЕДН/.test(all) ? 'CU' : /АЛЮМИН/.test(all) || alg ? 'AL' : /НИХРОМ|ФЕХРАЛ/.test(all) ? 'NICR' : G.ss ? 'SS' : 'ST';
    var wstr = /(?:^|[^А-ЯЁІA-Z0-9_])В\s*Р?\s*-?\s*(1[2-5]00(?:\s*-\s*\d(?![\d.]))?)(?![0-9])/.exec(all);
    if (wstr) wstr = [wstr[0], wstr[1].replace(/\s/g, '')];
    var gcode = null, wcond = null;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])([АБВ])-([12])-([А-Я]{1,2})(?![А-ЯЁІA-Z0-9_])/g, function (x, g1, g2, g3) { gcode = g1 + g2 + g3; return ' '; });
    s = s.replace(/ММ\s*-\s*(ОЖ|О|С|Т)(?![А-ЯЁІA-Z0-9_])/g, function (x, c1) { wcond = c1; return 'ММ '; });
    s = s.replace(/(\d+(?:\.\d+)?)\s*-\s*([ОТ])\s*-\s*([СЧ])(?![А-ЯЁІA-Z0-9_])/g, function (x, d1, c1, c2) { wcond = c1 + '-' + c2; return d1 + ' ММ '; });
    var kind = null;
    if (/ПОРОШКОВ/.test(all)) kind = 'ПОРОШК';
    else if (/ПРУЖИН/.test(all)) kind = 'ПРУЖ';
    else if (/СВАРОЧН|СВ\s*-?\s*0?8|ДЛЯ СВАРКИ|НАПЛАВК/.test(all) || G.weld) kind = 'СВАР';
    else if (/КОЛЮЧ/.test(all)) kind = 'КОЛЮЧ';
    else if (/ВЯЗАЛЬН|ВЯЗАЛ/.test(all)) kind = 'ВЯЗ';
    else if (/(?:^|[^А-ЯЁІA-Z0-9_])В\s*-?\s*Р\s*-?\s*(1|I)(?![0-9])|(?:^|[^А-ЯЁІA-Z0-9_])ВР\s*-?\s*1|(?:^|[^А-ЯЁІA-Z0-9_])ВР\s+\d|ВР1|(?:^|[^А-ЯЁІA-Z0-9_])ВР(?![А-ЯЁІA-Z0-9_])|(?:^|[^А-ЯЁІA-Z0-9_])В\s*Р\s*1/.test(all)) kind = 'ВР1';
    else if (/ПРЕДВАРИТЕЛЬНО НАПРЯЖ|ВР\s*1[2-5]00|В\s*1[2-5]00|ВЫСОКОУГЛЕРОД/.test(all)) kind = 'ПН';
    else if (/БРОНИРОВАН/.test(all)) kind = 'БРОН';
    else if (/СЕРДЕЧНИК/.test(all)) kind = 'СЕРД';
    var zn = /ОЦИНК|ЦИНКОВ|1Ц|О-1Ц|(?:^|[^А-ЯЁІA-Z0-9_])Ц(?![А-ЯЁІA-Z0-9_])/.test(all) ? 'ZN' : null;
    var gen = /ОБЩЕГО НАЗНАЧ|НИЗКОУГЛЕРОД|СВЕТЛ|ЧЕРН|ТЕРМИЧЕСКИ ОБРАБ|ОТОЖЖ|ОТОЖЕН|ТЕРМООБРАБ/.test(all);
    if (!kind && gen) kind = 'ОН';
    var cu = /ОМЕДН/.test(all) && !/НЕОМЕДН/.test(all) ? 'ОМЕДН' : null;
    var zcls = /ЦИНКОВЫМ ПОКРЫТИЕМ\s*([12])\s*-?\s*КЛ/.exec(all) || /(?:^|[^0-9.])([12])\s*Ц(?![А-ЯЁІA-Z0-9_])/.exec(all);
    s = s.replace(/\d\s*КЛАСС[А-Я]*/g, explain).replace(/(?:^|[^А-ЯЁІA-Z0-9_])(ВР|ВР-?1|В\s*-?\s*Р\s*-?\s*1|В\s*Р)(?![А-ЯЁІA-Z0-9_])/g, explain);
    s = s.replace(/1[2-5]00\s*-\s*\d(?![\d.])/g, explain).replace(/(?:^|[^А-ЯЁІA-Z0-9_])В\s*1[2-5]00\s*-?\s*[А-Я]?\d?/g, explain).replace(/(?:^|[^А-ЯЁІA-Z0-9_])[АБВ]-[12]-[А-Я]{1,2}(-\s*Ø)?/g, explain);
    var mcls = /(\d)\s*В\s*(1[2-5]00)/.exec(all);
    var D = diamList(s);
    var dl = D.list, range = D.range || null;
    b.put('rng', D.rng || null, 1, 'линейка ' + D.rng);
    b.put('gc', gcode, 1, 'группа ' + gcode);
    b.put('cond', wcond, 2, 'исполнение -' + wcond);
    b.put('str', wstr ? wstr[1] : null, 2, 'класс ' + (wstr ? wstr[1] : ''));
    b.put('agr', alg ? alg[1] : null, 2, 'марка ' + (alg ? alg[1] : ''));
    if (mcls && (!dl || !dl.length)) dl = [mcls[1]];
    b.put('mat', mat === 'ST' ? null : mat, 0);
    b.put('kind', kind, kind === 'СВАР' || kind === 'ПОРОШК' || kind === 'ПРУЖ' ? 0 : 2, 'вид ' + kind);
    if (range) b.put('D', fmt(range[0]) + '-' + fmt(range[1]), 0);
    else if (dl && dl.length) b.put('D', sortNum(dl).join('/'), 0);
    b.put('zn', zn, 2, 'оцинкованная');
    b.put('cu', cu, 1, 'омеднённая');
    b.put('zcls', zcls ? zcls[1] : null, 1, 'класс цинка ' + (zcls ? zcls[1] : ''));
    b.put('grade', G.weld || (G.grades.length ? G.grades.slice().sort().join('/') : null), 1, 'марка');
    a.mat = mat; if (kind) a.kind = kind; if (zn) a.zn = true;
    if (kind === 'СВАР') {
      var wg = String(G.weld || '');
      if (/ЛЕГИРОВАН/.test(all) && !/НИЗКОЛЕГ|НЕЛЕГ/.test(all) || /СВ0?8?Г|Г2С|ХН|ХМ|Х\d/.test(wg)) a.alloy = true;
      else if (/^СВ0?8А{0,2}$/.test(wg)) a.alloy = false;
    }
    if (dl && dl.length) { a.d_list = dl.map(num); if (dl.length === 1) { a.d = num(dl[0]); a.kg_per_m = round1(barKg(a.d) * (mat === 'CU' ? 8.9 / 7.85 : mat === 'AL' ? 2.7 / 7.85 : 1)); a.kg_per_m_from = '0.0061654·d² (steel 7.85 t/m³' + (mat === 'CU' ? ', ×8.9/7.85 copper' : mat === 'AL' ? ', ×2.7/7.85 aluminium' : '') + ')'; } }
    if (range) a.d_range = range;
    pushStd(b, P);
    if (dl && dl.length > 1) for (var i = 0; i < dl.length; i++) b.special({ D: 'D:' + dl[i] }, ['Ø из списка ' + dl.join('; ')], 'pre');
    if (range) b.special({ D: 'D:' + fmt(range[1]) }, ['диапазон → ' + fmt(range[1])], 'pre');
    if ((dl && dl.length) || range) b.special({ D: null }, ['диаметр']);
    return b.done();
  }

  function parseMesh(c, P, unit) {
    var all = c.all, s = c.item, b = new Builder('MESH'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var kind = /РАБИЦ/.test(all) ? 'РАБИЦА' : /ТКАН|ГАЛУН|ПЛЕТЕН/.test(all) ? 'ТКАН' : /ПРОСЕЧ|ПВЛ|ПВ-?\d/.test(all) ? 'ПВЛ' : /РИФЛ/.test(all) ? 'РИФЛ' : /КЛАДОЧН/.test(all) ? 'КЛАД' : /ДОРОЖН/.test(all) ? 'ДОР' : /СВАРН|АРМАТУР/.test(all) ? 'СВАРН' : null;
    var wd = null, cell = null, wcls = null;
    var msl = /(\d+(?:\.\d+)?)\s*\/\s*(?:(\d+(?:\.\d+)?)\s*\/\s*)?(\d{2,3})\s*\/\s*(\d{2,3})(?![\d.\/])/.exec(s);
    if (msl && num(msl[1]) <= 16 && (!msl[2] || num(msl[2]) <= 16)) { wd = msl[2] && msl[2] !== msl[1] ? fmt(msl[1]) + '/' + fmt(msl[2]) : num(msl[1]); cell = msl[3] + 'Х' + msl[4]; s = s.replace(msl[0], ' '); }
    var gre = /(?:^|[^0-9.])(\d+(?:\.\d+)?)\s*(ВР\s*-?\s*1|ВР1|А\s*-?\s*\d{3}С?|А\s*-?\s*I+)\s*-\s*(\d+)(?![\d.])/g, gw = [], gc = [];
    while ((m = gre.exec(s))) { gw.push(fmt(m[1])); gc.push(m[3]); if (!wcls) wcls = m[2].replace(/[\s-]/g, ''); }
    if (gw.length) { wd = uniq(gw).join('/'); cell = uniq(gc).join('/'); }
    var mfmt = /(?:^|[^А-ЯЁІA-Z0-9_])(\d)С(?=\s*\(|\s*\d)/.exec(s);
    var rc = rebarClass(s);
    if (!wd) {
      var md = /(?:ДИАМЕТР(?:ОМ)?(?: ПРОВОЛОКИ)?|ДИАМ\.?|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|Ø)\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s);
      if (md) wd = num(md[1]);
    }
    var mc = /(?:ЯЧ[А-Я.]*|РАЗМЕР ЯЧЕЙКИ|РАЗМ\.ЯЧ)\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*Х\s*(\d+(?:\.\d+)?))?/.exec(s);
    if (mc) cell = fmt(mc[1]) + (mc[2] ? 'Х' + fmt(mc[2]) : '');
    var md3 = /(\d+)Х(\d+)Х(\d+(?:\.\d+)?)\s*ММ/.exec(s);
    if (!cell && !md3 && (kind === 'РАБИЦА' || kind === 'ДОР')) md3 = /(\d+)Х(\d+)Х(\d+(?:\.\d+)?)/.exec(s);
    if (!cell && md3 && (kind === 'ДОР' || kind === 'РАБИЦА')) { cell = md3[1] + 'Х' + md3[2]; wd = num(md3[3]); }
    var mno = /№\s*(\d+(?:[.-]\d+)*)/.exec(s) || /\b(\d-\d{1,2}-\d{1,3})(?![А-ЯЁІA-Z0-9_])/.exec(s);
    if (!kind && !wd && !cell && !mno) return null;
    if (mfmt) b.put('fmt', mfmt[1] + 'С', 0);
    b.put('kind', kind, 0);
    b.put('mat', G.ss ? 'SS' : (/ОЦИНК/.test(all) ? 'ZN' : null), 0);
    b.put('W', wd !== null ? (typeof wd === 'string' ? wd : fmt(wd)) : null, 0);
    b.put('wcls', wcls || (rc ? rc.cls : null), 2, 'класс проволоки');
    b.put('cell', cell, 0);
    b.put('no', mno ? mno[1] : null, 0);
    b.put('grade', G.grades.length ? G.grades.slice().sort().join('/') : null, 1, 'марка ' + G.grades.join('/'));
    if (rc) a.cls = rc.cls; if (wd !== null) a.wire_d = wd; if (cell) a.cell = cell; if (G.grades.length) a.grade = G.grades;
    pushStd(b, P);
    if (/ИЗ АРМАТУРЫ/.test(all) && rc && typeof wd === 'number') {
      b.xl = [{ key: 'REBAR|D:' + fmt(wd), drop: ['сетка из арматуры → арматура'] }];
      if (rc.cls === 'А240' && wd <= 12) b.xl.push({ key: 'ROD|D:' + fmt(wd), drop: ['сетка из арматуры А240 → катанка'] });
    }
    var r = b.done();
    if (b.xl) r.levels = r.levels.concat(b.xl);
    return r;
  }

  function parseRope(c, P, unit) {
    var s = c.item, b = new Builder('ROPE'), m, a = b.attrs;
    var G = grades(s); s = G.s;
    var desig = /^(?:КАНАТ[А-Я]*\s+)(\d+(?:\.\d+)?)\s*-\s*((?:[А-Я]{1,2}\s*-\s*)+)(\d{4})(?![\d.])/.exec(s);
    var D = null, cn = null, core = null, grp = null, code = null;
    if (desig) { D = num(desig[1]); code = desig[2].replace(/[\s-]+/g, '-').replace(/-$/, ''); grp = desig[3]; s = s.replace(desig[0], ' '); }
    m = /(К?\d{1,2})\s*Х\s*(\d{1,2})([A-ZА-Я]{0,2})(?![А-ЯЁІA-Z0-9_])/.exec(s);
    if (m) { cn = m[1] + 'Х' + m[2] + m[3]; s = s.replace(m[0], ' '); }
    s = s.replace(/\(\s*1\s*\+\s*\d+(?:\s*\+\s*\d+)*\s*\)\s*(\+\s*\d)?/g, explain);
    if (/FС|(?:^|[^А-ЯЁІA-Z0-9_])О\.?\s*С\.?(?![А-ЯЁІA-Z0-9_])|ОРГАНИЧ/.test(s)) core = 'FC';
    else if (/IWR|IWS|МЕТАЛЛИЧЕСК[А-Я]* СЕРДЕЧН/.test(s)) core = 'IWRC';
    var mg = /(?:^|[^0-9.])(1[3-9][67]0|2160)(?![\d.])/.exec(s);
    if (mg && !grp) { grp = mg[1]; s = s.replace(mg[0], explain(mg[0])); }
    if (D === null) {
      m = /(?:(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|(?:^|[^А-ЯЁІA-Z0-9_])D|Ø|ДИАМЕТР(?:ОМ)?(?:,\s*ММ:?)?)\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s) || /(\d+(?:\.\d+)?)\s*ММ/.exec(s);
      if (m) D = num(m[1]);
    }
    if (D === null) return null;
    var std = null;
    for (var i = 0; i < P.std.length; i++) { var ms = /ГОСТ\s*(?:Р\s*)?(\d+)/.exec(P.std[i]); if (ms) { std = 'ГОСТ' + ms[1]; break; } }
    b.put('D', fmt(D), 0);
    b.put('cn', cn, 2, 'конструкция ' + cn);
    b.put('std', std, 2, std);
    b.put('core', core, 2, 'сердечник ' + core);
    b.put('grp', grp, 2, 'группа ' + grp);
    b.put('code', code, 1, 'обозначение ' + code);
    b.put('zn', /НЕОЦИНК/.test(s) ? null : coatingZn(s), 2, 'оцинкованный');
    var tw = /(?:(\d)\s*-?\s*|ДВОЙНОЙ\s*|ОДИНАРНОЙ\s*|ТРОЙНОЙ\s*)СВИВК/.exec(s);
    b.put('tw', tw ? (tw[1] || (/ДВОЙН/.test(tw[0]) ? '2' : /ТРОЙН/.test(tw[0]) ? '3' : '1')) : null, 1, 'свивка');
    if (/АРМАТУРН|ПРЯД/.test(c.all)) b.put('use', 'АРМ', 2, 'арматурный');
    a.d = D; if (cn) a.construction = cn; if (grp) a.group = grp;
    pushStd(b, P);
    return b.done();
  }

  function stdGradeSlots(b, G, L) {
    b.put('grade', G.grades.length ? G.grades.slice().sort().join('/') : null, 1, 'марка ' + G.grades.join('/'));
    b.put('sc', G.sc, 1, G.sc);
    if (L) {
      if (L.len.length) b.put('len', L.len.join('/'), 1, 'длина ' + L.len.join('/'));
      b.put('meas', L.meas, 1, L.meas === 'МЕРН' ? 'мерная длина' : 'немерная длина');
    }
  }

  var BARE_WORD = /^(УГОЛОК|УГОЛКИ|УГЛОВАЯ|ШВЕЛЛЕР[А-Я]*|ДВУТАВР[А-Я]*|БАЛК[А-Я]*|СТАЛ[А-Я]*|МЕТАЛЛИЧ[А-Я]*|ГОРЯЧЕКАТ[А-Я]*|ХОЛОДНОКАТ[А-Я]*|ГНУТ[А-Я]*|РАВНОПОЛОЧ[А-Я]*|НЕРАВНОПОЛОЧ[А-Я]*|ОЦИНКОВАН[А-Я]*|ПРОКАТ[А-Я]*|Г\.?К\.?|С|УКЛОН[А-Я]*|ПАРАЛЛЕЛ[А-Я]*|ГРАН[А-Я]*|ПОЛОК|ВНУТРЕНН[А-Я]*|РАЗН[А-Я]*|РАЗМЕР[А-Я]*|СОРТ[А-Я]*|ПРОФИЛ[А-Я]*)$/;
  function bareOk(s) {
    if (/\d/.test(s)) return false;
    var w = s.replace(/[^А-ЯЁA-Z.]+/g, ' ').split(' ');
    for (var i = 0; i < w.length; i++) if (w[i] && !BARE_WORD.test(w[i])) return false;
    return true;
  }
  function parseAngle(c, P, unit) {
    var s = c.item, b = new Builder('ANGLE'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var L = takeLength(s); s = L.s;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])L\s*(?=\d)/g, explain).replace(/№\s*/g, explain);
    var A = null, B = null, t = null;
    m = /(\d+(?:\.\d+)?)\s*(?:ММ)?\s*Х\s*(\d+(?:\.\d+)?)\s*(?:ММ)?\s*Х\s*(\d+(?:\.\d+)?)/.exec(s);
    if (m) { A = num(m[1]); B = num(m[2]); t = num(m[3]); }
    else if ((m = /(\d+(?:\.\d+)?)\s*(?:ММ)?\s*Х\s*(\d+(?:\.\d+)?)/.exec(s))) {
      var x = num(m[1]), y = num(m[2]);
      if (x === y) { A = x; B = y; }
      else if (y < x / 2 && y <= 30) { A = x; B = x; t = y; }
      else if (x < y / 2 && x <= 30) { A = y; B = y; t = x; }
      else { A = x; B = y; }
    } else if ((m = /(?:^|\s)(\d+(?:\.\d+)?)(?:\s*ММ)?(?=\s|$)/.exec(s))) { A = num(m[1]); }
    if (A === null && bareOk(s)) { stdGradeSlots(b, G, L); pushStd(b, P); return b.done(); }
    if (A === null || !(A >= 10 && A <= 400)) return null;
    if (B !== null && B > A) { var z = A; A = B; B = z; }
    b.put('A', fmt(A), 0); b.put('B', B !== null && B !== A ? fmt(B) : null, 0);
    b.put('T', t !== null ? fmt(t) : null, 3, 'полка ' + fmt(t));
    b.put('zn', coatingZn(s) && /ОЦИНК/.test(s) ? 'ZN' : null, 2, 'оцинкованный');
    stdGradeSlots(b, G, L);
    a.A = A; a.B = B !== null ? B : A; if (t !== null) a.t = t;
    if (t !== null) { a.kg_per_m = round1(0.00785 * t * (A + (B !== null ? B : A) - t)); a.kg_per_m_from = 'ГОСТ 8509-93 0.00785·t·(a+b−t), без радиусов'; }
    if (G.grades.length) a.grade = G.grades;
    pushStd(b, P);
    b.special({ A: null, B: null, T: null }, ['размер ' + fmt(A) + (B !== null && B !== A ? 'х' + fmt(B) : '')]);
    return b.done();
  }

  function parseChannel(c, P, unit) {
    var s = c.item, b = new Builder('CHAN'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var L = takeLength(s); s = L.s;
    var no = null, ser = null;
    m = /(?:РАЗ[А-Я.]*\s*)?(\d{2,3})Х(\d{2,3})Х(\d+(?:\.\d+)?)/.exec(s);
    if (m && num(m[1]) >= 50) { no = fmt(num(m[1]) / 10); a.hbs = [num(m[1]), num(m[2]), num(m[3])]; }
    else {
      var mh = /(?:^|\s)(\d+)\s*ММ(?![А-Я])/.exec(s);
      if (mh) { no = num(mh[1]) >= 50 ? fmt(num(mh[1]) / 10) : fmt(mh[1]); if (num(mh[1]) >= 50) a.h_mm = num(mh[1]); s = s.replace(mh[0], ' '); }
      m = no === null ? /(?:№\s*)?(\d+(?:\.\d+)?)\s*(А)?\s*(П|У|Э|Л|С)?(?![А-Я0-9])/.exec(s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(ММ)(?![А-ЯЁІA-Z0-9_])/g, explain)) : null;
      if (m) { no = fmt(m[1]); ser = m[3] || null; if (m[2]) ser = (ser || '') + 'А'; }
    }
    if (no === null && bareOk(s)) { stdGradeSlots(b, G, L); pushStd(b, P); return b.done(); }
    if (no === null || !(num(no) >= 5 && num(no) <= 40)) return null;
    b.put('N', no, 0);
    b.put('ser', ser, 2, 'серия ' + ser);
    stdGradeSlots(b, G, L);
    a.no = num(no); if (ser) a.series = ser;
    if (CHANNEL_KG[num(no)] && (!ser || ser === 'П' || ser === 'У')) { a.kg_per_m = CHANNEL_KG[num(no)]; a.kg_per_m_from = 'ГОСТ 8240-97'; }
    pushStd(b, P);
    b.special({ N: null, ser: null }, ['номер ' + no]);
    return b.done();
  }

  function parseBeam(c, P, unit) {
    var s = c.item, b = new Builder('BEAM'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    s = s.replace(/№\s*/g, explain);
    var moreB = /(?:^|\s)\d{2}[БШК]\d\s+(\d{2})([БШК])(\d)/.exec(s);
    if (moreB) s = s.replace(moreB[1] + moreB[2] + moreB[3], ' ');
    m = /(?:^|\s)(\d{2})\s*([БШКМДУ])\s*(\d)?(?![А-Я0-9])/.exec(s);
    var mhb = !m && /ВЫСОТОЙ\s*(\d{3})\s*ММ/.exec(s);
    if (m) s = s.replace(m[0], ' ');
    if (mhb) { m = [mhb[0], fmt(num(mhb[1]) / 10)]; a.h_mm = num(mhb[1]); s = s.replace(mhb[0], ' '); }
    var L = takeLength(s); s = L.s;
    if (!m) m = /(?:^|\s)(\d{2})(?![0-9.Х])/.exec(s);
    if (!m && bareOk(s)) { stdGradeSlots(b, G, L); pushStd(b, P); return b.done(); }
    if (!m) return null;
    var no = m[1], ser = m[2] || null, idx = m[3] || null;
    var more = moreB;
    b.put('N', no + (more ? '/' + more[1] + more[2] + more[3] : ''), 0);
    b.put('ser', ser ? ser + (idx || '') : null, 2, 'серия ' + (ser || '') + (idx || ''));
    stdGradeSlots(b, G, L);
    a.no = num(no); if (ser) a.series = ser + (idx || '');
    if (!ser && BEAM_KG[num(no)]) { a.kg_per_m = BEAM_KG[num(no)]; a.kg_per_m_from = 'ГОСТ 8239-89'; }
    pushStd(b, P);
    b.special({ N: null, ser: null }, ['номер ' + no]);
    return b.done();
  }

  function sheetMat(all, G) {
    if (/ТИТАН/.test(all)) return 'TI';
    if (/АЛЮМИН|АМЦ|АМГ/.test(all)) return 'AL';
    if (/МЕДН|ЛАТУН/.test(all)) return 'CU';
    if (G.ss || /НЕРЖ/.test(all)) return 'SS';
    if (/ОЦИНК|ОЦ(?![А-Я])|ГОРЯЧЕОЦИНК|ЦИНК/.test(all)) return 'ZN';
    return 'ST';
  }

  function parseSheet(c, P, unit) {
    var all = c.all, s = c.item, b = new Builder('SHEET'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var mat = sheetMat(all, G);
    var roll = /Х\s*\.?\s*К(?![А-Я])|Х\/К|ХОЛОДНОКАТ|ХК(?![А-Я])/.test(all) ? 'ХК' : /Г\s*\.?\s*К(?![А-Я])|Г\/К|ГОРЯЧЕКАТ|ГОРЯЧАКАТ|ГК(?![А-Я])|ТОЛСТОЛИСТ/.test(all) ? 'ГК' : null;
    var rif = /РИФЛ|ЧЕЧЕВИЧ|ЧЕЧВИЧ|ЧЕЧЕВ/.test(all) ? 'РИФЛ' : null;
    var poly = /ПОЛИМЕРН/.test(all) ? 'ПОЛИМ' : null;
    var coil = /РУЛОН/.test(all) ? 'РУЛОН' : null;
    var stock = /НЕДОКАТ|ПАЧКА/.test(all) ? 'НЕДОКАТ' : null;
    var tol = /(?:^|[^А-ЯЁІA-Z0-9_])Б\s*-\s*ПН\s*-\s*НО(?![А-ЯЁІA-Z0-9_])/.test(all) ? 'Б-ПН-НО' : null;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])Б\s*-\s*ПН\s*-\s*НО(?![А-ЯЁІA-Z0-9_])/g, explain).replace(/Г\s*\.\s*К\.?|Х\s*\.\s*К\.?/g, explain);
    var L = takeLength(s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])ДЛИНОЙ(?![А-ЯЁІA-Z0-9_])/g, 'ДЛИНОЙ')); s = L.s;
    var t = null, w = null, l = null, part = null;
    var mt = /(?:ТОЛЩ[А-Я.]*|ТОЛЩИНА)\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s);
    if (mt) { t = num(mt[1]); s = s.replace(mt[0], ' '); }
    var mw = /ШИРИН[А-Я]*\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s);
    if (mw) { w = num(mw[1]); s = s.replace(mw[0], ' '); }
    m = /(\d+(?:\.\d+)?)\s*(?:ММ)?\s*Х\s*(\d+(?:\.\d+)?)\s*(?:ММ)?\s*Х\s*(\d+(?:\.\d+)?)/.exec(s);
    if (m) {
      var x = num(m[1]), y = num(m[2]), z = num(m[3]);
      if (t === null && x < y && x <= 200) { t = x; w = y; l = z; }
      else part = fmt(x) + 'Х' + fmt(y) + 'Х' + fmt(z);
    } else if ((m = /(\d+(?:\.\d+)?)\s*(?:ММ)?\s*Х\s*(\d+(?:\.\d+)?)/.exec(s))) {
      var x2 = num(m[1]), y2 = num(m[2]);
      if (t === null && x2 < y2 && x2 <= 200 && y2 >= 500) { t = x2; w = y2; }
      else {
        part = fmt(x2) + 'Х' + fmt(y2);
        if (t === null && x2 <= 40 && x2 < y2 / 2) t = x2;
      }
    } else if (t === null && (m = /(?:^|\s)(\d+(?:\.\d+)?)\s*ММ(?![А-Я])/.exec(s) || /(?:ЛИСТ[А-Я]*|СТАЛЬ[А-Я]*|Г\.?К\.?)\s+(\d+(?:\.\d+)?)(?![\d.Х])/.exec(s))) {
      t = num(m[1]);
    }
    if (t !== null && !(t > 0.1 && t <= 200)) t = null;
    if (t === null && part === null && !mat) return null;
    b.put('mat', mat, 0);
    b.put('T', t !== null ? fmt(t) : null, 0);
    b.put('part', part, 1, 'деталь ' + part);
    b.put('fmt', w !== null ? fmt(w) + (l !== null ? 'Х' + fmt(l) : '') : null, 1, 'формат ' + (w !== null ? fmt(w) : '') + (l !== null ? 'Х' + fmt(l) : ''));
    b.put('roll', roll, 2, roll === 'ХК' ? 'холоднокатаный' : 'горячекатаный');
    b.put('rif', rif, 0);
    b.put('poly', poly, 0);
    b.put('coil', coil, 1, 'в рулонах');
    b.put('lot', stock, 1, 'складская пачка');
    b.put('tol', tol, 1, 'Б-ПН-НО');
    stdGradeSlots(b, G, L);
    a.mat = mat; if (t !== null) a.t = t; if (w !== null) a.width = w; if (l !== null) a.length_mm = l; if (roll) a.roll = roll;
    if (G.grades.length) a.grade = G.grades;
    pushStd(b, P);
    if (/ИЗ (СТАЛЬНОГО ЛИСТА|ЛИСТОВОЙ СТАЛИ)/.test(all)) {
      var it = /^([А-Я]+)/.exec(c.item);
      b.sub = 'SHEET_ITEM'; b.slots.unshift({ n: 'item', v: it ? it[1] : 'ИЗДЕЛИЕ', l: 0, label: 'изделие' });
      var r0 = b.done();
      var lv = r0.levels.length ? r0.levels[r0.levels.length - 1].key : r0.key;
      r0.levels.push({ key: lv.replace(/^SHEET_ITEM\|item:[^|]*/, 'SHEET'), drop: ['изделие из листа → лист'] });
      return r0;
    }
    if (t !== null) b.special({ T: null }, ['толщина ' + fmt(t)]);
    return b.done();
  }

  function parseStrip(c, P, unit) {
    var all = c.all, s = c.item, b = new Builder('STRIP'), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var L = takeLength(s); s = L.s;
    var tape = /ЛЕНТА/.test(all) ? 'ЛЕНТА' : null;
    var w = null, t = null, part = null, wr = null, tr = null;
    var mw = /ШИРИН[А-Я]*\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/.exec(s);
    var mt = /ТОЛЩ(?:ИН[А-Я]*|\.)?\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/.exec(s);
    if (mw) { w = num(mw[1]); if (mw[2]) wr = num(mw[2]); s = s.replace(mw[0], ' '); }
    if (mt) { t = num(mt[1]); if (mt[2]) tr = num(mt[2]); s = s.replace(mt[0], ' '); }
    if (w === null && t === null) {
      m = /(\d+(?:\.\d+)?)\s*Х\s*(\d+(?:\.\d+)?)\s*Х\s*(\d+(?:\.\d+)?)/.exec(s);
      if (m) {
        part = fmt(m[1]) + 'Х' + fmt(m[2]) + 'Х' + fmt(m[3]);
        var dims = [num(m[1]), num(m[2]), num(m[3])].sort(function (x, y) { return x - y; });
        if (dims[0] <= 40 && dims[0] < dims[1] / 2) t = dims[0];
      }
      else if ((m = /(\d+(?:\.\d+)?)\s*Х\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/.exec(s))) {
        var x = num(m[1]), y = num(m[2]);
        if (m[3]) { t = x; w = y; wr = num(m[3]); }
        else if (x >= y) { w = x; t = y; } else { w = y; t = x; }
      } else if ((m = /(?:^|\s)(\d+(?:\.\d+)?)\s*ММ/.exec(s))) t = num(m[1]);
    }
    if (w === null && t === null && part === null) return null;
    b.put('kind', tape, 0);
    b.put('W', w !== null ? fmt(w) + (wr !== null ? '-' + fmt(wr) : '') : null, 0);
    b.put('T', t !== null ? fmt(t) + (tr !== null ? '-' + fmt(tr) : '') : null, 0);
    b.put('part', part, 1, 'деталь ' + part);
    b.put('zn', /ОЦИНК/.test(all) ? 'ZN' : null, 0);
    if (w !== null && t !== null) b.special({ W: null }, ['ширина ' + fmt(w) + (wr !== null ? '-' + fmt(wr) : '')]);
    if (w !== null || t !== null) b.special({ W: null, T: null }, ['размер']);
    stdGradeSlots(b, G, L);
    if (w !== null && wr === null) a.w = w; if (t !== null && tr === null) a.t = t;
    if (w !== null && t !== null && wr === null && tr === null) { a.kg_per_m = round1(0.00785 * w * t); a.kg_per_m_from = '0.00785·w·t (ГОСТ 103-2006)'; }
    pushStd(b, P);
    return b.done();
  }

  function parseBar(c, P, unit) {
    var all = c.all, s = c.item, b = new Builder(c.sub), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var L = takeLength(s); s = L.s;
    var mat = G.ss ? 'SS' : /АЛЮМИН/.test(all) ? 'AL' : /ЛАТУН/.test(all) ? 'BRASS' : /МЕДН|МЕДЬ/.test(all) ? 'CU' : /ТИТАН/.test(all) ? 'TI' : /БРОНЗ/.test(all) ? 'BRZ' : null;
    var nfg = /(?:^|[^А-ЯЁІA-Z0-9_])(ВТ\s*-?\s*\d+(?:-\d)?|Л\s*\d{2}|GR\s*\d|S\d{3})(?![А-ЯЁІA-Z0-9_])/.exec(s);
    if (nfg && mat && mat !== 'SS') { s = s.replace(nfg[0], ' '); b.put('nfg', nfg[1].replace(/[\s-]/g, ''), 1, 'марка ' + nfg[1]); }
    var cal = /КАЛИБР/.test(all) ? 'КАЛИБР' : null;
    m = /(?:(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|(?:^|[^А-ЯЁІA-Z0-9_])D|Ø|ДИАМЕТР(?:ОМ)?)\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s) || /(\d+(?:\.\d+)?)\s*ММ/.exec(s) || /(?:КРУГ|КВАДРАТ)[А-Я. ]*?\s(\d+(?:\.\d+)?)(?![\d.Х])/.exec(s);
    if (!m) return null;
    var d = num(m[1]);
    if (!(d >= 3 && d <= 1000)) return null;
    var rc = rebarClass(s);
    b.put('mat', mat, 0);
    b.put('D', fmt(d), 0);
    b.put('cal', cal, 2, 'калиброванный');
    b.put('cls', rc ? rc.cls : null, 1, 'класс');
    stdGradeSlots(b, G, L);
    a.d = d; if (mat) a.mat = mat; if (G.grades.length) a.grade = G.grades;
    if (!mat) { a.kg_per_m = c.sub === 'SQBAR' ? round1(0.00785 * d * d) : barKg(d); a.kg_per_m_from = c.sub === 'SQBAR' ? '0.00785·a²' : '0.0061654·d² (ГОСТ 2590-2006)'; }
    pushStd(b, P);
    return b.done();
  }

  function threads(s) {
    s = s.replace(/\(\s*М\s*\d+[^)]*-\s*М\s*\d+[^)]*\)/g, explain);
    var re = /(?:^|[^А-ЯЁІA-Z0-9_])М\s*(\d{1,2}(?:\.\d)?)(?![0-9])/g, m, out = [];
    while ((m = re.exec(s))) out.push(fmt(m[1]));
    return uniq(out);
  }

  function metizCode(all) { var m = /(?:^|[\s.])(016|066|01)(?![\d.А-ЯЁІA-Z])/.exec(all); return m ? m[1] : null; }
  function metizCoat(all) {
    if (/БЕЗ ПОКРЫТ|ЧЕРНЕН|НЕОЦИНК/.test(all)) return 'BLK';
    if (/ТЕРМОДИФ/.test(all)) return 'TDZ';
    if (/ОЦИНК|ЦИНКОВ|ГОРЯЧЕОЦИНК|\.016|\b016(?![А-ЯЁІA-Z0-9_])|\b01(?![А-ЯЁІA-Z0-9_])|(^|[^А-Я])Ц(?![А-Я])/.test(all)) return 'ZN';
    if (/ХИМ\.?\s*ОКС[А-Я.]*\s*ПРМ|ПРОМАСЛ/.test(all)) return 'OXP';
    if (/ХИМ\.?\s*ОКС|ХИМОКС|\.066|\b066(?![А-ЯЁІA-Z0-9_])|ФОСФАТ|ОКСИДИР/.test(all)) return 'OX';
    return null;
  }

  function parseBolt(c, P, unit) {
    var all = c.all, s = c.item, sub = c.sub, b = new Builder(sub), a = b.attrs, m;
    s = s.replace(/\(\s*S\d+[^)]*\)/g, explain).replace(/\b\d[GН]\s*(\.\d)?(?![А-ЯЁІA-Z0-9_])/g, explain);
    s = s.replace(/(?:^|\s)(93[1-4]|912|985|7985|439)(?:\s*-\s*(4014|4017|4032|4762))?(?=\s|$)/g, function (x, d1, i1) { P.std.push('DIN ' + d1 + (i1 ? ' / ISO ' + i1 : '')); explain(x); return ' '; });
    s = s.replace(/(?:^|[\s.])(016|066)(?![\d.])/g, explain);
    var bexec = /(?:^|\s)([1-6]\.[1-4])(?=\s+М\s*\d)/.exec(s);
    if (bexec) s = s.replace(bexec[0], ' ');
    var cls = null, mc = /КЛАСС[А-Я]*\s*(?:ПРОЧ[А-Я.]*)?\s*(\d{1,2}\.\d)/.exec(s) || /(?:^|\s)(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|10\.9|12\.9)(?![0-9])/.exec(s) || /(?:^|[^А-ЯЁІA-Z0-9_])СL\.?\s*(\d{1,2})(?![\d.])/.exec(s);
    if (mc) { cls = mc[1]; s = s.replace(mc[0], ' '); }
    var th = threads(s);
    var kit = /С ГАЙК|С ШАЙБ|В КОМПЛЕКТЕ С ГАЙК|КОМПЛЕКТ/.test(all) && sub === 'BOLT' ? 'КОМПЛ' : null;
    var kind = null;
    if (sub === 'BOLT') kind = /ВЫСОКОПРОЧ/.test(all) ? 'ВП' : /ЛЕМЕХ/.test(all) ? 'ЛЕМЕХ' : /РЫМ/.test(all) ? 'РЫМ' : /ФУНДАМЕНТ/.test(all) ? 'ФУНД' : /МЕБЕЛ/.test(all) ? 'МЕБ' : /ШЕСТИГРАН|DIN 93[13]/.test(all + ' ' + P.std.join(' ')) ? 'ШЕСТИГР' : null;
    if (sub === 'NUT') kind = /ВЫСОКОПРОЧ/.test(all) ? 'ВП' : /РЫМ/.test(all) ? 'РЫМ' : /ШЕСТИГРАН/.test(all) ? 'ШЕСТИГР' : null;
    if (sub === 'WASHER') kind = /ПРУЖИН|ГРОВЕР/.test(all) ? 'ПРУЖ' : /ПЛОСК|(?:^|[^А-ЯЁІA-Z0-9_])А\.\d/.test(all) ? 'ПЛОСК' : /КОСАЯ/.test(all) ? 'КОС' : null;
    if (sub === 'STUD') kind = /РЕЗЬБОВ/.test(all) ? 'РЕЗЬБ' : null;
    var build = /СТРОИТЕЛЬН/.test(all) ? 'СТР' : /САНИТАРНО/.test(all) ? 'САНТЕХ' : null;
    var mfor = /ДЛЯ (ТРОЙНИК|ПЕРЕХОДНИК|МУФТ|КРАН|ЗАГЛУШК|ФЛАН|ЛОТК|ШИН|ОПОР)[А-Я]*/.exec(all);
    var len = [];
    m = /(?:^|[^А-ЯЁІA-Z0-9_])М\s*\d{1,2}(?:\.\d)?\s*Х\s*(\d+)(?:\s*-\s*(\d+))?/.exec(s);
    if (m) len.push(m[2] ? m[1] + '-' + m[2] : m[1]);
    var mll = !len.length && /(?:^|[^А-ЯЁІA-Z0-9_])М\s*\d{1,2}\s+((?:\d{2,3}\s*;\s*)+\d{2,3})/.exec(s);
    if (mll) len = mll[1].split(/\s*;\s*/).map(function (x) { return fmt(x); });
    m = /(?:^|[^А-ЯЁІA-Z0-9_])L\s*[:=\-]?\s*:?\s*((?:\d+\s*[;:,]\s*)*\d+)/.exec(s);
    if (m && !len.length) len = m[1].split(/[;:,]/).map(function (x) { return fmt(x); }).filter(function (x) { return x !== 'NaN'; });
    m = /ДЛИН[А-Я]*\s*[=:\-]?\s*(\d+)/.exec(s);
    if (m && !len.length) len.push(m[1]);
    var dr = null;
    if (!th.length) {
      m = /(?:ДИАМ[А-Я.]*|РЕЗЬБЫ|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|Ø|ДИАМЕТР[А-Я]*)\s*(?:РЕЗЬБЫ)?\s*[=:\-]?\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*(?:ММ)?/.exec(s);
      if (m) { th = [m[1]]; if (m[2]) dr = m[2]; }
    }
    if (!th.length && sub === 'WASHER') { m = /\b(\d{1,2})\s*ММ/.exec(s); if (m) th = [m[1]]; }
    var coat = metizCoat(all);
    b.put('kit', kit, 0);
    b.put('M', th.length ? (dr ? th[0] + '-' + dr : sortNum(th).join('/')) : null, 0);
    b.put('L', len.length ? len.join('/') : null, 3, 'длина ' + len.join('/'));
    b.put('kind', kind, 2, 'вид ' + kind);
    b.put('use', build, 1, build === 'СТР' ? 'строительные' : 'сантехнические');
    b.put('exec', bexec ? bexec[1] : null, 1, 'исполнение ' + (bexec ? bexec[1] : ''));
    b.put('for', mfor ? mfor[1] : null, 2, 'для ' + (mfor ? mfor[1] : ''));
    b.put('coat', coat, 2, coat === 'ZN' ? 'оцинкованные' : coat === 'BLK' ? 'без покрытия' : 'покрытие ' + coat);
    b.put('ccode', metizCode(all), 1, 'код покрытия ' + metizCode(all));
    b.put('cls', cls, 1, 'класс прочности ' + cls);
    if (th.length) { a.m = th.map(num); }
    if (len.length) a.lengths = len;
    if (cls) a.cls = cls; if (coat) a.coat = coat; if (kit) a.kit = true; if (kind) a.kind = kind;
    pushStd(b, P);
    if (th.length > 1) for (var i = 0; i < th.length; i++) b.special({ M: 'M:' + th[i] }, ['М из списка ' + th.join('; ')], 'pre');
    if (dr) { b.special({ M: 'M:' + th[0] }, ['диапазон М' + th[0] + '–' + dr], 'pre'); b.special({ M: 'M:' + dr }, ['диапазон М' + th[0] + '–' + dr], 'pre'); }
    if (th.length) b.special({ M: null, kit: null }, ['резьба М' + th.join('/')]);
    else if (kit) b.special({ kit: null }, ['в комплекте с гайками и шайбами']);
    return b.done();
  }

  function parseAnchor(c, P, unit) {
    var all = c.all, s = c.item, a, m;
    var block = /БЛОК АНКЕРН|АНКЕРНЫЙ БЛОК|(?:^|[^А-ЯЁІA-Z0-9_])АБ\s*-\s*\d/.test(all);
    var b = new Builder(block ? 'ANCHOR_BLOCK' : 'ANCHOR'); a = b.attrs;
    var d = null, l = null, v = null;
    m = /(?:АБ\s*-?\s*|М\s*)(\d{1,2})\s*Х\s*(\d{2,4})\s*(-?\s*[АA](?![А-Я]))?/.exec(s) || /(\d{1,2})\s*Х\s*(\d{2,4})/.exec(s);
    if (m) { d = num(m[1]); l = num(m[2]); if (m[3]) v = 'А'; }
    else {
      var th = threads(s);
      if (th.length) d = num(th[0]);
      m = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(s);
      if (!d && m) { d = num(m[1]); l = num(m[2]); }
    }
    var kind = /ДЮБЕЛ/.test(all) ? 'ДЮБЕЛЬ' : /ЗАБИВН/.test(all) ? 'ЗАБИВН' : /КЛИН/.test(all) ? 'КЛИН' : /ХИМИЧ/.test(all) ? 'ХИМ' : /БОЛТ/.test(all) && !block ? 'БОЛТ' : /СТЕРЖ|ДЕТАЛ/.test(all) ? 'ДЕТАЛЬ' : null;
    b.put('mat', /ЛАТУН/.test(all) ? 'CU' : /НЕРЖ/.test(all) ? 'SS' : null, 0);
    var kit = /КОМПЛЕКТ|С ГАЙК|С ШАЙБ/.test(all) ? 'КОМПЛ' : null;
    var sp = /(\d)СП(?![А-Я])|СП$/.test(s) ? 'СП' : null;
    b.put('kind', kind, block ? 0 : 2, 'вид ' + kind);
    b.put('D', d !== null ? fmt(d) : null, 0);
    b.put('L', l !== null ? fmt(l) : null, block ? 0 : 3, 'длина ' + l);
    b.put('var', v || sp, block ? 0 : 1, 'исполнение');
    b.put('kit', kit, 2, 'в комплекте');
    b.put('coat', metizCoat(all), 2, 'покрытие');
    if (d !== null) a.d = d; if (l !== null) a.length_mm = l;
    pushStd(b, P);
    if (!block && d !== null) b.special({ D: null }, ['диаметр ' + fmt(d)]);
    return b.done();
  }

  var SCREW_CODE = fold(/(?:^|[^А-ЯЁІA-Z0-9_])(TN|TB|LN|LB|WHD|WHS|MN|MB|TBP)(?![А-ЯЁІA-Z0-9_])/);
  function parseSmall(c, P, unit) {
    var all = c.all, s = c.item, sub = c.sub, b = new Builder(sub), a = b.attrs, m;
    var G = grades(s); s = G.s;
    var kind = null, head = null;
    if (sub === 'NAIL') kind = /ДЮБЕЛ/.test(all) ? 'ДЮБЕЛЬ' : /ТОЛЕВ/.test(all) ? 'ТОЛЕВ' : /ШИФЕРН/.test(all) ? 'ШИФЕР' : /ОТДЕЛОЧ/.test(all) ? 'ОТДЕЛ' : /КРОВЕЛЬН/.test(all) ? 'КРОВ' : /СТРОИТЕЛЬН/.test(all) ? 'СТР' : null;
    if (sub === 'SCREW') {
      kind = /УПЛОТНИТ|КРОВЕЛЬН|ПРЕССШАЙБ|ПРЕС\.?\s*ШАЙБ|ПРЕСС ШАЙБ/.test(all) ? (/УПЛОТНИТ|КРОВЕЛЬН/.test(all) ? 'КРОВ' : 'ПШ') : /САМОНАРЕЗ|САМОРЕЗ/.test(all) ? 'САМОРЕЗ' : /ШУРУП/.test(all) ? 'ШУРУП' : /ВИНТ/.test(all) ? 'ВИНТ' : null;
      var mh = /(?:^|[^А-ЯЁІA-Z0-9_])(ПСГПШ|ПКГ|ПГКШ|КШГ|ПГ|ПШ|ПСГ|ППГ|ПТ)(?![А-ЯЁІA-Z0-9_])/.exec(s);
      if (mh) head = mh[1]; else if (/ПОЛУКРУГЛ/.test(all)) head = 'ПГ'; else if (/ПОТАЙ/.test(all)) head = 'ПТ'; else if (/ШЕСТИГР/.test(all)) head = 'ШГ';
    }
    if (sub === 'DOWEL') {
      kind = /ГВОЗД/.test(all) ? 'ГВОЗДЬ' : /ПРИСТРЕЛ/.test(all) ? 'ПРИСТР' : /РАСПОР/.test(all) ? 'РАСПОР' : /ПЛАСТМАС|ПЛАСТИК|НЕЙЛОН|ПОЛИПРОП/.test(all) ? 'ПЛАСТ' : /ФАСАД/.test(all) ? 'ФАСАД' : /ЗОНТ/.test(all) ? 'ЗОНТ' : null;
      var md = /(?:^|[^А-ЯЁІA-Z0-9_])(ДГПД|ДГБШ|ДГП)(?![А-ЯЁІA-Z0-9_])/.exec(s); if (md) head = md[1];
    }
    if (sub === 'RIVET') kind = /ВЫТЯЖН/.test(all) ? 'ВЫТЯЖН' : null;
    s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])(ПСГПШ|ПКГ|ПГКШ|КШГ|ПГ|ПШ|ПСГ|ППГ|ДГПД|ДГБШ|ДГП)\s*-?/g, explain).replace(/\.0[16]6(?![А-ЯЁІA-Z0-9_])|\.016(?![А-ЯЁІA-Z0-9_])/g, explain);
    var sth = threads(s);
    if (sth.length) { b.put('M', sth.join('/'), 0); a.m = sth.map(num); s = s.replace(/(?:^|[^А-ЯЁІA-Z0-9_])М\s*\d{1,2}(?:\.\d)?(?![0-9])/g, ' '); }
    s = s.replace(/(?:^|[\s.])(016|066)(?![\d.])/g, explain);
    var sz = null, sizes = [];
    var re = /(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*Х\s*(\d+(?:\.\d+)?)(?:\s*Х\s*(\d+(?:\.\d+)?))?/g;
    while ((m = re.exec(s))) sizes.push(m[3] ? fmt(m[1]) + 'Х' + fmt(m[2]) + 'Х' + fmt(m[3]) : fmt(m[1]) + 'Х' + fmt(m[2]));
    if (sizes.length) sz = sizes[sizes.length - 1];
    var len = null;
    if (!sz) { m = /ДЛИН[А-Я]*\s*[=:\-]?\s*(\d+(?:\.\d+)?)/.exec(s) || /(?:^|\s)(\d+(?:\.\d+)?)\s*ММ/.exec(s); if (m) len = fmt(m[1]); }
    var coat = metizCoat(all);
    var pack = /(?:\(|^|\s)(10|100|1000)\s*ШТ/.exec(all);
    b.put('kind', kind, 2, 'вид ' + kind);
    b.put('head', head, 1, 'головка ' + head);
    if (sub === 'SCREW') {
      var scode = SCREW_CODE.exec(s);
      b.put('scode', scode ? scode[1].replace(/[^A-ZА-Я]/g, '') : null, 1, 'тип ' + (scode ? scode[1] : ''));
      b.put('tape', /В ЛЕНТАХ|ЛЕНТАХ/.test(all) ? 'ЛЕНТА' : null, 2, 'в лентах');
      b.put('drill', /СО СВЕРЛ|СВЕРЛОМ|СВЕРЛ\./.test(all) ? 'СВЕРЛ' : null, 2, 'со сверлом');
      var sfor = /(ГКЛ|МЕТ[А-Я.]*)\s*\+\s*(ДЕРЕВ|МЕТ)/.exec(all) || /ПО (ДЕРЕВУ|МЕТАЛЛУ|БЕТОНУ)/.exec(all);
      b.put('for', sfor ? sfor[0].replace(/[^А-Я+]/g, '').replace(/МЕТАЛЛ|МЕТ[А-Я]*/g, 'МЕТ').replace(/ДЕРЕВ[А-Я]*/, 'ДЕР') : null, 2, 'для ' + (sfor ? sfor[0] : ''));
    }
    b.put('S', sz, 0);
    b.put('L', len, 0);
    b.put('coat', coat, 2, 'покрытие ' + coat);
    b.put('ccode', metizCode(all), 1, 'код покрытия ' + metizCode(all));
    if (G.grades.length) b.put('grade', G.grades.join('/'), 1, 'марка');
    if (sz) a.size = sz; if (len) a.length_mm = num(len); if (kind) a.kind = kind;
    pushStd(b, P);
    if (sz || len) b.special({ S: null, L: null }, ['размер ' + (sz || len)]);
    return b.done();
  }

  function parseElectrode(c, P, unit) {
    var all = c.all, s = c.item, b = new Builder('ELECTRODE'), a = b.attrs, m;
    s = s.replace(/УПАКОВК[А-Я]*\s*\d+(?:\.\d+)?\s*КГ/g, explain).replace(/\(\s*УПАКОВКА[^)]*\)/g, explain);
    var type = null, brand = null;
    m = /(?:^|[^А-ЯЁІA-Z0-9_])Э\s*-?\s*(42|46|50|55|60|70|85|100|125|150)\s*(А)?(?![0-9])/.exec(s);
    if (m) { type = 'Э' + m[1] + (m[2] || ''); s = s.replace(m[0], ' '); }
    var BR = /(УОНИ|МР|АНО|ОЗС|ЦЛ|НЖ|ОЗЛ|ЦУ|ТМУ|ЭА|ОК|LВ|J|ТНА|ЦТ|НИИ)\s*-?\s*(\d{1,3}(?:\s*\/\s*\d{1,3}|-\d{2}(?![\d.])|\.\d(?![\d.]))?[А-Я]?)/.exec(s);
    if (BR) {
      brand = BR[1] + BR[2].replace(/\s/g, '').replace(/(\d)-(\d)/, '$1/$2');
      s = s.replace(BR[0], ' ');
      var bt = ELECTRODE_TYPE[brand.replace(/[\/.]/g, '')] || ELECTRODE_TYPE[BR[1]] || null;
      if (!type && bt && bt !== 'SS') { type = bt; a.type_from_brand = true; }
      if (bt === 'SS') a.ss = true;
    }
    if (/НЕРЖ/.test(all)) a.ss = true;
    var d = null, dl = null, len = null;
    m = /(\d+(?:\.\d+)?)\s*Х\s*(\d{3})\s*(?:ММ)?/.exec(s);
    if (m) { d = num(m[1]); len = num(m[2]); s = s.replace(m[0], ' '); }
    if (d === null) {
      m = /(?:ДИАМЕТР(?:ОМ)?|(?:^|[^А-ЯЁІA-Z0-9_])Д\.?|Ø|(?:^|[^А-ЯЁІA-Z0-9_])D)\s*[=:\-]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/.exec(s) || /(?:^|[\s-])(\d(?:\.\d+)?)\s*(?:-\s*Д)?\s*(?:ММ|$|\s)/.exec(s);
      if (m) { d = num(m[1]); if (m[2]) dl = num(m[2]); }
    }
    if (d !== null && !(d >= 1 && d <= 8)) d = null;
    b.put('ss', a.ss ? 'SS' : null, 0);
    b.put('type', type, 2, 'тип ' + type);
    b.put('brand', brand, 1, 'марка ' + brand);
    b.put('D', d !== null ? (dl ? fmt(d) + '/' + fmt(dl) : fmt(d)) : null, 0);
    b.put('len', len !== null ? fmt(len) : null, 1, 'длина ' + len);
    if (type) a.type = type; if (brand) a.brand = brand; if (d !== null) a.d = d;
    pushStd(b, P);
    if (dl) { b.special({ D: 'D:' + fmt(d) }, ['Ø ' + fmt(d) + '/' + fmt(dl)], 'pre'); b.special({ D: 'D:' + fmt(dl) }, ['Ø ' + fmt(d) + '/' + fmt(dl)], 'pre'); }
    if (d !== null) b.special({ D: null }, ['диаметр ' + fmt(d)]);
    return b.done();
  }

  var PARSERS = {
    PIPE: parsePipe, ELBOW: parseFitting, TEE: parseFitting, RED: parseFitting, FLANGE: parseFitting, STUB: parseFitting,
    CAP: parseFitting, COUP: parseFitting, CROSS: parseFitting, REBAR: parseRebar, ROD: parseRod, WIRE: parseWire,
    MESH: parseMesh, ROPE: parseRope, ANGLE: parseAngle, CHAN: parseChannel, BEAM: parseBeam, SHEET: parseSheet,
    STRIP: parseStrip, BAR: parseBar, SQBAR: parseBar, BOLT: parseBolt, NUT: parseBolt, WASHER: parseBolt,
    STUD: parseBolt, ANCHOR: parseAnchor, NAIL: parseSmall, SCREW: parseSmall, DOWEL: parseSmall, RIVET: parseSmall,
    ELECTRODE: parseElectrode
  };

  function owns(name, unit, section) {
    if (!name) return false;
    if (section && section !== 'materials' && section !== 'equipment') return false;
    return !!classify(prep(name), unit);
  }

  function parse(name, unit, section) {
    if (!name) return null;
    if (section && section !== 'materials' && section !== 'equipment') return null;
    var P = prep(name);
    var c = classify(P, unit);
    if (!c) return null;
    var fn = PARSERS[c.sub];
    if (!fn) return null;
    CUR = { text: c.item, expl: [], origin: originOf(P.s), maker: makerOf(P.s), pack: packOf(P.s),
      tu: /ПО ТУ(?![А-ЯЁІA-Z0-9_])|(?:^|[^А-ЯЁІA-Z0-9_])Т\/У(?![А-ЯЁІA-Z0-9_])/.test(P.s),
      line: c.ctx ? squash(c.ctx.replace(/[^А-ЯЁІA-Z0-9.]+/g, ' ')) : null };
    var r;
    try { r = fn(c, P, unit); } finally { CUR = { text: '', expl: [], origin: null, maker: null, pack: null, tu: false, line: null }; }
    if (!r || !r.key) return null;
    r.attrs.head = c.sub;
    return r;
  }

  function listOf(v) {
    if (v === null || v === undefined) return null;
    if (Object.prototype.toString.call(v) === '[object Array]') return v.map(Number);
    return [Number(v)];
  }
  function overlap(x, y) {
    for (var i = 0; i < x.length; i++) for (var j = 0; j < y.length; j++) if (Math.abs(x[i] - y[j]) < 1e-9) return true;
    return false;
  }

  function conflict(a, b) {
    if (!a || !b) return null;
    var x = a.attrs || {}, y = b.attrs || {};
    if (x.mat && y.mat && x.mat !== y.mat) return 'материал ' + x.mat + ' ≠ ' + y.mat;
    if (x.seam && y.seam && x.seam !== y.seam) return 'бесшовная ≠ сварная';
    if (x.D !== undefined && y.D !== undefined && x.D !== y.D && !x.d_from_dn && !y.d_from_dn) return 'D ' + x.D + ' ≠ ' + y.D;
    if (x.A !== undefined && y.A !== undefined && (x.A !== y.A || x.B !== y.B)) return 'профиль ' + x.A + 'х' + x.B + ' ≠ ' + y.A + 'х' + y.B;
    if (x.D2 !== undefined && y.D2 !== undefined && x.D2 !== y.D2) return 'D2 ' + x.D2 + ' ≠ ' + y.D2;
    if (x.dn !== undefined && y.dn !== undefined && x.head === 'FLANGE' && y.head === 'FLANGE' && x.dn !== y.dn) return 'Ду ' + x.dn + ' ≠ ' + y.dn;
    var dx = x.d_list ? listOf(x.d_list) : (x.d !== undefined ? listOf(x.d) : null);
    var dy = y.d_list ? listOf(y.d_list) : (y.d !== undefined ? listOf(y.d) : null);
    if (dx && dy && !overlap(dx, dy) && !x.d_range && !y.d_range && !x.d_max && !y.d_max) return 'd ' + dx.join('/') + ' ≠ ' + dy.join('/');
    if (x.m && y.m && !overlap(listOf(x.m), listOf(y.m))) return 'М' + x.m.join('/') + ' ≠ М' + y.m.join('/');
    if (x.no !== undefined && y.no !== undefined && x.no !== y.no) return '№ ' + x.no + ' ≠ ' + y.no;
    if (x.head === 'SHEET' && y.head === 'SHEET' && x.t !== undefined && y.t !== undefined && x.t !== y.t) return 'толщина ' + x.t + ' ≠ ' + y.t;
    if (x.head === 'ANGLE' && y.head === 'ANGLE' && x.A !== undefined && y.A !== undefined && (x.A !== y.A || x.B !== y.B)) return 'уголок ' + x.A + ' ≠ ' + y.A;
    if (x.head === 'STRIP' && y.head === 'STRIP') {
      if (x.t !== undefined && y.t !== undefined && x.t !== y.t) return 'толщина ' + x.t + ' ≠ ' + y.t;
      if (x.w !== undefined && y.w !== undefined && x.w !== y.w) return 'ширина ' + x.w + ' ≠ ' + y.w;
    }
    if (x.profile && y.profile && x.profile !== y.profile) return 'гладкая ≠ периодическая';
    if (x.head === 'WIRE' && y.head === 'WIRE') {
      var wx = x.kind === 'СВАР' || x.kind === 'ПОРОШК', wy = y.kind === 'СВАР' || y.kind === 'ПОРОШК';
      if (x.kind && y.kind && wx !== wy) return 'сварочная ≠ обычная проволока';
      if ((x.kind === 'ПРУЖ') !== (y.kind === 'ПРУЖ')) return 'пружинная ≠ обычная проволока';
      if ((x.kind === 'КОЛЮЧ') !== (y.kind === 'КОЛЮЧ')) return 'колючая ≠ обычная проволока';
      if (x.alloy !== undefined && y.alloy !== undefined && x.alloy !== y.alloy) return 'легированная ≠ углеродистая сварочная проволока';
    }
    if (x.head === 'ELECTRODE' && y.head === 'ELECTRODE' && !!x.ss !== !!y.ss) return 'нержавеющие ≠ углеродистые электроды';
    if (x.head === 'ELECTRODE' && y.head === 'ELECTRODE' && x.type && y.type && x.type !== y.type) return 'тип ' + x.type + ' ≠ ' + y.type;
    if (x.head === 'PIPE' && y.head === 'PIPE') {
      if (x.t !== undefined && y.t !== undefined && Math.abs(Number(x.t) - Number(y.t)) > 1e-9) return 'стенка ' + x.t + ' ≠ ' + y.t;
      if (x.sdr !== undefined && y.sdr !== undefined && Math.abs(Number(x.sdr) - Number(y.sdr)) > 1e-9) return 'SDR ' + x.sdr + ' ≠ ' + y.sdr;
      var wt = x.t !== undefined ? x : y.t !== undefined ? y : null, ws = wt === x ? y : x;
      if (wt && wt.t !== undefined && ws.t === undefined && ws.sdr !== undefined && (ws.D || wt.D)) {
        var tw = Number(ws.D || wt.D) / Number(ws.sdr);
        if (Math.abs(tw - Number(wt.t)) > 0.15 * Number(wt.t)) return 'стенка ' + wt.t + ' ≠ SDR ' + ws.sdr + ' (' + tw.toFixed(1) + ')';
      }
      if (x.sn !== undefined && y.sn !== undefined && Number(x.sn) !== Number(y.sn)) return 'SN ' + x.sn + ' ≠ ' + y.sn;
      if ((x.sn !== undefined) !== (y.sn !== undefined)) return 'SN ' + (x.sn !== undefined ? x.sn : '—') + ' ≠ ' + (y.sn !== undefined ? y.sn : '—');
      var wOnly = function (z) { return z.t !== undefined && z.sdr === undefined && z.pn === undefined; };
      var pOnly = function (z) { return z.pn !== undefined && z.t === undefined && z.sdr === undefined; };
      if ((wOnly(x) && pOnly(y)) || (pOnly(x) && wOnly(y))) return 'стенка ≠ PN';
    }
    if (x.head === 'SCREW' && y.head === 'SCREW') {
      if (x.kind && y.kind && x.kind !== y.kind) return 'вид ' + x.kind + ' ≠ ' + y.kind;
      if (x.size && y.size && String(x.size) !== String(y.size)) return 'размер ' + x.size + ' ≠ ' + y.size;
      var lenOf = function (z) { if (z.length_mm) return Number(z.length_mm); var m = /[ХX]\s*(\d+(?:\.\d+)?)/.exec(String(z.size || '')); return m ? Number(m[1]) : null; };
      var lx = lenOf(x), ly = lenOf(y);
      if (lx && ly && lx !== ly) return 'длина ' + lx + ' ≠ ' + ly;
    }
    var oneD = function (z) { var l = z.d_list ? listOf(z.d_list) : z.d !== undefined ? listOf(z.d) : null; return l && l.length === 1 && !z.d_range ? l[0] : null; };
    var dX = oneD(x), dY = oneD(y);
    if (dX !== null && dY === null && y.residue && y.residue.length && y.d === undefined && y.D === undefined &&
        !y.residue.some(function (v) { return Math.abs(Number(v) - dX) < 1e-9; })) return 'd ' + dX + ' ≠ ' + y.residue.join('/');
    if (dY !== null && dX === null && x.residue && x.residue.length && x.d === undefined && x.D === undefined &&
        !x.residue.some(function (v) { return Math.abs(Number(v) - dY) < 1e-9; })) return 'd ' + x.residue.join('/') + ' ≠ ' + dY;
    if (!!x.zn !== !!y.zn) return x.zn ? 'оцинкованная ≠ без покрытия' : 'без покрытия ≠ оцинкованная';
    if ((x.mat === 'SS') !== (y.mat === 'SS') && (x.mat === 'SS' ? !y.mat || y.mat === 'ST' : !x.mat || x.mat === 'ST')) return 'нержавеющая ≠ углеродистая';
    if (x.angle !== undefined && y.angle !== undefined && x.angle !== y.angle) return 'угол ' + x.angle + ' ≠ ' + y.angle;
    return null;
  }

  var api = {
    id: 'steel',
    owns: owns,
    parse: parse,
    conflict: conflict,
    _prep: prep,
    _classify: function (name, unit) { var c = classify(prep(name), unit); return c ? c.sub : null; },
    _tables: { DN_OD: DN_OD, DN_VGP: DN_VGP, OD_DN: OD_DN, CHANNEL_KG: CHANNEL_KG, BEAM_KG: BEAM_KG }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SteelFamily = api;
})(this);
