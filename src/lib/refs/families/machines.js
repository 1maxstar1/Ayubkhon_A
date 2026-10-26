/*
 * Family parser «machines» (ES5 plain script; sets the global `FamilyMachines`): construction machines and vehicles
 * priced per machine-hour, transport priced per t·km, and labour rates.
 *
 *   owns(name, unit, section)  -> true for маш-ч / чел-ч / т-км names or the sections machines / labor / transport
 *   parse(name, unit, section) -> { family: 'machines', key, attrs, levels } | null
 *   conflict(a, b)             -> null | reason
 *   wageFor, bandFor, tariffFor(recs, km, opts) -> the wage or distance-band tariff of a series of records
 *
 * The key keeps the machine type and every identifying number (capacity, power, bucket volume, model code);
 * relaxed levels say what they dropped. Type tables are generic vocabulary. Comments that named where an entry was
 * seen are kept privately in the reference kit; the code is unchanged from the measured version and changes only
 * with the parity measurement (test/refs-parity.cjs).
 */
(function (root) {
  'use strict';

  var LAT = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

  function fold(s) {
    s = String(s == null ? '' : s).toUpperCase();
    s = s.replace(/Ё/g, 'Е');
    s = s.replace(/Ў/g, 'У').replace(/Қ/g, 'К').replace(/Ғ/g, 'Г').replace(/Ҳ/g, 'Х');
    s = s.replace(/[‘’ʻʼ`´']/g, '');
    s = s.replace(/[ABCEHKMOPTXY]/g, function (c) { return LAT[c]; });
    s = s.replace(/[‐-―−]/g, '-');
    s = s.replace(/[«»"“”„]/g, ' ');
    s = s.replace(/ /g, ' ').replace(/³/g, '3').replace(/‑/g, '-');
    return s;
  }
  function F(s) { return fold(s); }
  function FP(p) { return String(p).replace(/(\\.)|([ABCEHKMOPTXY])/g, function (m, esc, c) { return esc || LAT[c]; }); }

  var L = 'А-ЯA-Z';
  var B0 = '(^|[^' + L + '0-9])';
  var B1 = '(?=[^' + L + '0-9]|$)';

  function rx(words, flags) { return new RegExp(B0 + '(?:' + words + ')' + B1, flags || 'g'); }

  var UZ = [
    ['AVTOMOBIL YUKKOTARGICH', 'АВТОКРАН'],
    ['YUK OZI AGDARUVCHI|OZI AGDARGICH|OZI AGDARUVCHI', 'САМОСВАЛ'],
    ['AVTOSAMASVAL|A\\/M SAMAS|АВТОСАМАСВАЛ', 'САМОСВАЛ'],
    ['BORTLI YUK TASHUVCHI', 'БОРТОВОЙ АВТОМОБИЛЬ'],
    ['YUK TORTUVCHI TYAGACH|YUK TORTUVCHI YAGACH|SEDELNЫY TYAGACH|SEDELNYY TYAGACH|TYAGACH', 'ТЯГАЧ'],
    ['TIRKAMA BILAN|TIRKAMA B-N|TIRKAMA', 'ПРИЦЕП'],
    ['ТИРКАМА', 'ПРИЦЕП'],
    ['AVTOGREYDER', 'АВТОГРЕЙДЕР'],
    ['BULDOZER', 'БУЛЬДОЗЕР'],
    ['PNEVMATIK KATOK', 'ПНЕВМОКАТОК'],
    ['KATOK', 'КАТОК'],
    ['EKSKAVATOR', 'ЭКСКАВАТОР'],
    ['YUKLAGICH', 'ПОГРУЗЧИК'],
    ['SUV TASHUVCHI', 'ВОДОВОЗ'],
    ['YOQILGI TASHUVCHI', 'ТОПЛИВОЗАПРАВЩИК'],
    ['EMULSIYA SEPUVCHI', 'АВТОГУДРОНАТОР'],
    ['KOMPRESSOR', 'КОМПРЕССОР'],
    ['FREZA \\(KESUVCHI\\)|FREZA', 'ФРЕЗА'],
    ['BETON YOTQIZGICH|BETONYOTQIZGICH', 'БЕТОНОУКЛАДЧИК'],
    ['ASFALT YOTQIZGICH', 'АСФАЛЬТОУКЛАДЧИК'],
    ['BETON ARALASHTIRUVCHI YUK MASHINASI', 'АВТОБЕТОНОСМЕСИТЕЛЬ'],
    ['AVTO BETON NASOSI', 'АВТОБЕТОНОНАСОС'],
    ['DIZEL BOLGA', 'ДИЗЕЛЬМОЛОТ'],
    ['GIDRAVLIK BOLGA', 'ГИДРОМОЛОТ'],
    ['YUZA VIBRATORI', 'ВИБРАТОР ПОВЕРХНОСТНЫЙ'],
    ['CHUQURLIK VIBRATORI', 'ВИБРАТОР ГЛУБИННЫЙ'],
    ['TEBRANISH PLITASI', 'ВИБРОПЛИТА'],
    ['ELEKTR STANTSIYASI', 'ЭЛЕКТРОСТАНЦИЯ'],
    ['SUV NASOSI', 'НАСОС ВОДЯНОЙ'],
    ['ARMATURA KESISH USKUNASI', 'СТАНОК ДЛЯ РЕЗКИ АРМАТУРЫ'],
    ['ARMATURA BUKISH USKUNASI', 'СТАНОК ДЛЯ ГИБКИ АРМАТУРЫ'],
    ['PAYVANDLOVCHI USKUNA', 'АГРЕГАТ СВАРОЧНЫЙ'],
    ['CHOTKALASH MASHINASI', 'ЩЕТОЧНАЯ МАШИНА'],
    ['FASKI OLISH UCHUN USKUNA', 'МАШИНА ДЛЯ СНЯТИЯ ФАСКИ'],
    ['QOZIQ QOQISH USLUNASI|QOZIQ QOQISH USKUNASI', 'КОПЕР'],
    ['BURGULASH USKUNASI', 'БУРОВАЯ УСТАНОВКА'],
    ['BETON KESUVCHI', 'НАРЕЗЧИК ШВОВ'],
    ['RESAYKLER', 'РЕСАЙКЛЕР'],
    ['AVTOBUS', 'АВТОБУС'],
    ['NAREZCHIK SHVOV', 'НАРЕЗЧИК ШВОВ'],
    ['VIBRATOR POVERXNOSTI|VIBRATOR GLUBЫNI|ВИБРАТОР ПОВЕРХНОСТИ|ВИБРАТОР ГЛУБЫНИ', ' '],
    ['YANGI BETON', 'СВЕЖИЙ БЕТОН'],
    ['STANDART', 'СТАНДАРТ'],
    ['DISK UCHUN', 'ДИСК'],
    ['KONDALANG BOGINLARNI KESISH UCHUN USKUNA TOLIQ BIRIKTIRMA BILAN', 'НАРЕЗЧИК ШВОВ ПОПЕРЕЧНЫХ'],
    ['UZUNLAMASIGA BOGINLARNI KESISH UCHUN USKUNA TOLIQ BIRIKTIRMA BILAN', 'НАРЕЗЧИК ШВОВ ПРОДОЛЬНЫХ'],
    ['BENZINLI DVIGATELLI LABORATORIYA UCHUN', 'ЛАБОРАТОРНАЯ БЕНЗИНОВАЯ'],
    ['AVTONOM BURGULASH TIZIMI', 'БУРОВАЯ УСТАНОВКА'],
    ['BETON YUZASIGA ISHLOV BERISH MASHINASI', 'МАШИНА ДЛЯ ОБРАБОТКИ ПОВЕРХНОСТИ БЕТОНА'],
    ['GENERATOR TOTAL', 'ГЕНЕРАТОР'], ['BILAN', ' '],
    ['AVTOBETONNOSMESITEL|AVTOBETONOSMESITEL', 'АВТОБЕТОНОСМЕСИТЕЛЬ'],
    ['TRALLER', 'ПРИЦЕП'], ['S TYAGACHOM', 'С ТЯГАЧОМ'],
    ['SUPER(?=\\s*\\d)', 'S'],
    ['МАХСУС', ' '],
    ['УЧУН|УЧУП|UCHUN', ' '],
    ['ВА', ' ']
  ];

  var PHRASES = [
    ['ДИЗЕЛЬ\\s*-?\\s*МОЛОТ[А-Я]*', ' ДИЗЕЛЬМОЛОТ '],
    ['КРАН[А-Я]*\\s*-?\\s*МАНИПУЛЯТОР[А-Я]*|БОРТ\\s+КРАН\\s+МАНИПУЛЯТОР', ' МАНИПУЛЯТОР '],
    ['КРАН[А-Я]*\\s*-?\\s*ТРУБОУКЛАДЧИК[А-Я]*', ' ТРУБОУКЛАДЧИК '],
    ['КРАН[А-Я]*\\s*-?\\s*УКОСИН[А-Я]*', ' УКОСИНА '],
    ['УКЛАДЧИК[А-Я]*\\s+АСФАЛЬТОБЕТОНА', ' АСФАЛЬТОУКЛАДЧИК '],
    ['ВИЛОЧН[А-Я]*\\s+ПОГРУЗЧИК[А-Я]*', ' АВТОПОГРУЗЧИК '],
    ['АВТОМОБИЛ[А-Я]*\\s*-?\\s*САМОСВАЛ[А-Я]*|А\\s*[\\/-]\\s*САМОСВАЛ[А-Я]*|А\\s*-?\\s*САМ(?=\\s)|А\\/С', ' САМОСВАЛ '],
    ['САМОСВАЛ\\s+SPG', ' САМОСВАЛ '],
    ['SAMOSVAL', ' САМОСВАЛ '],
    ['А\\s*\\/\\s*М|А\\s*\\/\\s*С(?=\\s)', ' '],
    ['С\\s+П\\s*\\/\\s*П|П\\s*\\/\\s*П', ' ПОЛУПРИЦЕП '],
    ['ШВОНАРЕЗЧИК[А-Я]*', ' НАРЕЗЧИК ШВОВ '],
    ['ЭЛЕКТРОПЕРФОРАТОР[А-Я]*', ' ПЕРФОРАТОР ЭЛЕКТРИЧЕСКИЙ '],
    ['ПОЛИВОМОЕЧН[А-Я]*\\s+(АВТОМОБИЛ[А-Я]*|АВТОМАШИН[А-Я]*|МАШИН[А-Я]*)|(МАШИН[А-Я]*|АВТОМАШИН[А-Я]*)\\s+ПОЛИВОМОЕЧН[А-Я]*', ' ПОЛИВОМОЕЧНАЯ '],
    ['П\\s*\\/\\s*МОЕЧН[А-Я]*|\\(\\s*ПОЛИВОМОЕЧН[А-Я]*\\.?\\s*\\)', ' ПОЛИВОМОЕЧНАЯ '],
    ['ВОДОВОЗ\\s+АВТОЦИСТЕРН[А-Я]*', ' ВОДОВОЗ '],
    ['ДОРОЖНО\\s*-?\\s*РАЗМЕТОЧН[А-Я]*', ' ДОРОЖНАЯ РАЗМЕТОЧНАЯ '],
    ['ДОРОЖ\\s+РАЗМЕТКА', ' ДОРОЖНАЯ РАЗМЕТОЧНАЯ '],
    ['АВТОМОБИЛ[А-Я]*\\s+ГРУЗОВ[А-Я]*|АВТОМОБИЛ\\s+ГРУЗАВ[А-Я]*', ' АВТОМОБИЛЬ '],
    ['ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТОВ', ' @LABMACH '],
    ['ЗАТРАТЫ\\s+ТРУДА\\s+РАБОЧИХ(\\s*-?\\s*СТРОИТЕЛЕЙ)?|СРЕДНЕЧАСОВАЯ\\s+ЗАРАБОТНАЯ\\s+ПЛАТА\\s+РАБОЧИХ(\\s*-?\\s*СТРОИТЕЛЕЙ)?', ' @LABWORK '],
    ['\\(?\\s*С\\s+УЧЕТОМ\\s+СОЦСТРАХА\\s*\\)?|\\(?\\s*С\\s+СОЦ\\.?\\s*СТРАХ\\.?(\\s+12\\s*%)?\\s*\\)?', ' '],
    ['ПРИ\\s+РАБОТЕ\\s+НА\\s+ДРУГИХ\\s+ВИДАХ\\s+СТРОИТЕЛЬСТВА|ПРИ\\s+ДРУГИХ\\s+ВИДАХ\\s+РАБОТ|НА\\s+ДРУГИХ\\s+ВИДАХ\\s+СТРОИТЕЛЬСТВА|ДЛЯ\\s+ВСЕХ\\s+ВИДОВ\\s+СТРОИТЕЛЬСТВА', ' '],
    ['\\(\\s*КРОМЕ[^)]*\\)?', ' '],
    [',?\\s*КРОМЕ(\\s+[А-Я]{3,}){1,3}', ' '],
    ['\\(\\s*БЕЗ\\s[^)]*\\)?|\\/\\s*БЕЗ\\s[^\\/]*\\/?', ' '],
    ['БЕЗ\\s+СТОИМОСТИ\\s+[А-Я]+(\\s+[А-Я]+)?|БЕЗ\\s+УЧЕТА\\s+[А-Я]+', ' '],
    ['ПРИ\\s+РАБОТЕ\\s+ОТ\\s+СТАЦИОНАРН[А-Я]*\\s+КОМПРЕССОРН[А-Я]*\\s+СТАНЦИ[А-Я]*', ' @MT_СТАЦИОНАР '],
    ['ПРИ\\s+РАБОТЕ\\s+ОТ\\s+ПЕРЕДВИЖН[А-Я]*\\s+(КОМПРЕССОРН[А-Я]*\\s+СТАНЦИ[А-Я]*|ЭЛЕКТРОСТАНЦИ[А-Я]*)|ПРИ\\s+РАБОТЕ\\s+ОТ\\s+(КОМПРЕССОРА|ПЕРЕДВИЖНОЙ\\s+ЭЛЕКТРОСТАНЦИИ)', ' '],
    ['ПРИ\\s+(РАБОТЕ\\s+НА\\s+)?МОНТАЖЕ\\s+ТЕХНОЛОГИЧЕСКОГО\\s+ОБОРУДОВАНИ[А-Я]*', ' @WORK_МОНТАЖ '],
    ['ПРИ\\s+РАБОТЕ\\s+НА\\s+ГИДРОЭНЕРГЕТИЧЕСКОМ\\s+СТРОИТЕЛЬСТВЕ', ' @WORK_ГИДРОЭНЕРГ '],
    ['ПРИ\\s+РАБОТЕ\\s+НА\\s+СООРУЖЕНИИ\\s+МАГИСТРАЛЬНЫХ\\s+ТРУБОПРОВОДОВ', ' @WORK_МАГИСТРАЛ '],
    ['ПРИ\\s+РАБОТЕ\\s+НА\\s+СТРОИТЕЛЬСТВЕ\\s+МОСТОВ', ' @WORK_МОСТ '],
    ['В\\s+СОСТАВЕ\\s+КАБЕЛЕУКЛАДОЧНОЙ\\s+КОЛОННЫ', ' @WORK_КАБЕЛЬКОЛОННА '],
    ['ПРИ\\s+РАБОТЕ\\s+НА\\s+ВОДОХОЗЯЙСТВЕННОМ\\s+СТРОИТЕЛЬСТВЕ', ' @WORK_ВОДОХОЗ '],
    ['ПРИ\\s+РАБОТЕ\\s+НА\\s+([А-Я]+)', ' @WORK_$1 '],
    ['НА\\s+АВТОМОБИЛЬНОМ\\s+ХОДУ|НА\\s+АВТОМОБИЛЕ|НА\\s+БАЗЕ\\s+АВТОМОБИЛ[А-Я]*', ' @CH_АВТО '],
    ['НА\\s+ГУСЕНИЧН[А-Я]*\\s+ХОДУ|С\\s+ГУСЕНИЧН[А-Я]*\\s+ТРАКТОРОМ|ГУСЕНИЧН[А-Я]*|НА\\s+ГУСЕНИЧНЕМ\\s+ХОДУ', ' @CH_ГУСЕН '],
    ['НА\\s+ПНЕВМОКОЛЕСН[А-Я]*\\s+ХОДУ|ПНЕВМОКОЛЕСН[А-Я]*|КОЛЕСН[А-Я]*|НА\\s+КОЛЕСАХ', ' @CH_ПНЕВМОКОЛ '],
    ['НА\\s+ЖЕЛЕЗНОДОРОЖНОМ\\s+ХОДУ|ШИРОКОЙ\\s+КОЛЕИ', ' @CH_ЖД '],
    ['НА\\s+СПЕЦИАЛЬНОМ\\s+ШАССИ(\\s+АВТОМОБИЛЬНОГО\\s+ТИПА)?', ' @CH_СПЕЦШАССИ '],
    ['НА\\s+ТРАКТОРЕ|С\\s+ТРАКТОРОМ|НА\\s+БАЗЕ\\s+ТРАКТОРА', ' @CH_ТРАКТОР '],
    ['НА\\s+БАЗЕ|НА\\s+ШАСС?И|ШАС\\.', ' '],
    ['С\\s+ДВИГАТЕЛЕМ\\s+ВНУТРЕННЕГО\\s+СГОРАНИЯ', ' @DR_ДВС '],
    ['С\\s+ДИЗЕЛЬН[А-Я]*\\s+ДВИГАТЕЛЕМ|НА\\s+ДИЗЕЛЬНОМ\\s+ТОПЛИВЕ|ДИЗЕЛЬН[А-Я]*|ДИЗЕЛЕВ[А-Я]*', ' @DR_ДИЗЕЛ '],
    ['С\\s+БЕНЗИНОВ[А-Я]*\\s+ДВИГАТЕЛЕМ|БЕНЗИНОВ[А-Я]*|БЕНЗОМОТОРН[А-Я]*', ' @DR_БЕНЗИН '],
    ['С\\s+ЭЛЕКТРОДВИГАТЕЛЕМ|С\\s+ЭЛЕКТРОПРИВОДОМ|НА\\s+ЭЛЕКТРОЭНЕРГИИ|ЭЛЕКТРИЧЕСК[А-Я]*', ' @DR_ЭЛЕКТР '],
    ['ПНЕВМАТИЧЕСК[А-Я]*', ' @DR_ПНЕВМ '],
    ['ГИДРАВЛИЧЕСК[А-Я]*', ' @DR_ГИДР '],
    ['АККУМУЛЯТОРН[А-Я]*', ' @DR_АККУМ '],
    ['РУЧН(ОЙ|ЫЕ|АЯ|ОЕ|ЫХ)', ' @DR_РУЧН '],
    ['ПРИЦЕПН[А-Я]*', ' @MT_ПРИЦЕП '],
    ['САМОХОДН[А-Я]*', ' @MT_САМОХОД '],
    ['ПЕРЕНОСН[А-Я]*', ' @MT_ПЕРЕНОСН '],
    ['ПЕРЕДВИЖН[А-Я]*|ПЕРЕДВЕЖН[А-Я]*', ' @MT_ПЕРЕДВИЖ '],
    ['СТАЦИОНАРН[А-Я]*', ' @MT_СТАЦИОНАР '],
    ['\\(\\s*(ТОПЛИВО|ТИПЛИВО)\\s*-?\\s*([А-Я]+)[^)]*\\)?', ' @FUEL_$2 '],
    ['\\(\\s*ГАЗ\\s*-\\s*МЕТАН\\s*\\)', ' @FUEL_МЕТАН '],
    ['ТОПЛИВО\\s+ДИЗЕЛЬ', ' @FUEL_ДИЗЕЛЬ ']
  ];

  var TYPES = [
    [/^АВТОКРАН/, 'КРАН', 'CH_АВТО', 1],
    [/^КРАН(Ы|А|ОВ)?$/, 'КРАН', null, 1],
    [/^МАНИПУЛЯТОР/, 'МАНИПУЛЯТОР', null, 1],
    [/^ТРУБОУКЛАДЧИК/, 'ТРУБОУКЛАДЧИК', null, 1],
    [/^УКОСИН/, 'УКОСИНА', null, 1],
    [/^ЭКСК[АО]ВАТОР/, 'ЭКСКАВАТОР', null, 1],
    [/^БУЛЬДОЗЕР/, 'БУЛЬДОЗЕР', null, 1],
    [/^ТРАКТОР(Ы|А)?$/, 'ТРАКТОР', null, 1],
    [/^ВИБРОКАТ(ОК|КИ|КА)$/, 'КАТОК', 'RK_ВИБР', 1],
    [/^ПНЕВМОКАТ(ОК|КИ|КА)$/, 'КАТОК', 'RK_ПНЕВМОКОЛ', 1],
    [/^КАТ(ОК|КИ|КА)$/, 'КАТОК', null, 1],
    [/^АВТОГРЕЙДЕР/, 'АВТОГРЕЙДЕР', null, 1],
    [/^(АВТО)?САМОСВАЛ|^САМАСВАЛ/, 'САМОСВАЛ', null, 1],
    [/^БОРТОВ/, 'БОРТОВОЙ', null, 1],
    [/^ТЯГАЧ/, 'ТЯГАЧ', null, 1],
    [/^ПОЛУПРИЦЕП/, 'ПОЛУПРИЦЕП', null, 1],
    [/^ПРИЦЕП(Ы|А|ОМ)?$/, 'ПРИЦЕП', null, 1],
    [/^(АВТО)?ЦИСТЕРН|^ВОДОВОЗ/, 'АВТОЦИСТЕРНА', null, 1],
    [/^ПОЛИВОМОЕЧН/, 'ПОЛИВОМОЕЧНАЯ', null, 1],
    [/^АВТОГУДРОНАТОР/, 'АВТОГУДРОНАТОР', null, 1],
    [/^АВТОБЕТОНОНАСОС/, 'АВТОБЕТОНОНАСОС', null, 1],
    [/^АВТОБЕТОНОСМЕСИТЕЛ/, 'АВТОБЕТОНОСМЕСИТЕЛЬ', null, 1],
    [/^АСФАЛЬТОУКЛАДЧИК/, 'АСФАЛЬТОУКЛАДЧИК', null, 1],
    [/^БЕТОНОУКЛАДЧИК|^БЕТОНАУКЛАДЧИК/, 'БЕТОНОУКЛАДЧИК', null, 1],
    [/^ФРЕЗ(А|Ы)?$/, 'ФРЕЗА', null, 1],
    [/^КОМПРЕССОР(Ы|А)?$/, 'КОМПРЕССОР', null, 1],
    [/^ЭЛЕКТРОСТАНЦИ/, 'ЭЛЕКТРОСТАНЦИЯ', null, 1],
    [/^ГЕНЕРАТОР/, 'ГЕНЕРАТОР', null, 1],
    [/^АВТОГИДРОПОД[ЪЬ]?ЕМНИК/, 'АВТОГИДРОПОДЪЕМНИК', null, 1],
    [/^АВТОВЫШК/, 'АВТОВЫШКА', null, 1],
    [/^ПОГРУЗЧИК/, 'ПОГРУЗЧИК', null, 1],
    [/^АВТОПОГРУЗЧИК/, 'АВТОПОГРУЗЧИК', null, 1],
    [/^ДИЗЕЛЬМОЛОТ/, 'ДИЗЕЛЬМОЛОТ', null, 1],
    [/^ГИДРОМОЛОТ/, 'ГИДРОМОЛОТ', null, 1],
    [/^ТРАМБОВК|^ТРОМБОВК/, 'ТРАМБОВКА', null, 0],
    [/^ГАЙКОВЕРТ/, 'ГАЙКОВЕРТ', null, 0],
    [/^ШУРУПОВЕРТ/, 'ШУРУПОВЕРТ', null, 0],
    [/^ДРЕЛ(Ь|И)$/, 'ДРЕЛЬ', null, 0],
    [/^ПИЛ(А|Ы)$/, 'ПИЛА', null, 0],
    [/^СТАН(ОК|КИ|КА|КОВ)$/, 'СТАНОК', null, -1],
    [/^КОП(ЕР|РЫ|РА|РОВ)$/, 'КОПЕР', null, 1],
    [/^ПЕРЕВОЗК|^ТРАНСПОРТИРОВК|^ТРАНСПОРТ$/, 'ПЕРЕВОЗКА', null, 0]
  ];
  var GENERIC = /^(МАШИН|АВТОМАШИН|УСТАНОВК|АГРЕГАТ|АППАРАТ|ОБОРУДОВАН|КОМПЛЕКТ|УСТРОЙСТВ|СТАН(ОК|КИ)$|СТАНЦИ|ЕМКОСТ|СПЕЦАВТОМАШИН)/;
  var CARRIER = /^(АВТОМОБИЛ|АВТОМАШИН|МАШИН|ЕДИНИЦ)/;
  var ADJ = /(ЫЙ|ИЙ|ОЙ|АЯ|ЯЯ|ОЕ|ЕЕ|ЫЕ|ИЕ|ЫХ|ИХ|ОГО|ЕГО|ЫМ|ИМ|УЮ|ЮЮ|ЫМИ|ИМИ)$/;
  var MODIF = { 'МИНИ': 1, 'СПЕЦ': 1, 'АВТО': 1 };

  var DEFAULTS = {
    'ЭКСКАВАТОР': { DR_ДИЗЕЛ: 1, DR_ГИДР: 1 },
    'КАТОК': { MT_САМОХОД: 1 },
    'БУЛЬДОЗЕР': { CH_ГУСЕН: 1 },
    'АВТОГУДРОНАТОР': { FUEL_ДИЗЕЛЬ: 1 },
    'ЭЛЕКТРОСТАНЦИЯ': { MT_ПЕРЕДВИЖ: 1 }
  };
  var DEFAULT_WORDS = {
    'ЭКСКАВАТОР': { 'ОДНОКОВШОВ': 1 },
    'КАТОК': { 'ДОРОЖН': 1 },
    'БУЛЬДОЗЕР': {},
    'АВТОГРЕЙДЕР': {},
    'ТЯГАЧ': { 'СЕДЕЛЬН': 1, 'СДЕЛЬН': 1 },
    'САМОСВАЛ': {},
    'ФРЕЗА': { 'ДОРОЖН': 1 },
    'АВТОЦИСТЕРНА': { 'ВОД': 1 }
  };
  var ROLLER = [
    [/^ГЛАДК|^ГЛАДКОВАЛЬЦОВ/, 'RK_ГЛАДК'],
    [/^ВИБРАЦИОН|^ВИБРОЦИОН|^ВИБРАЦ/, 'RK_ВИБР'],
    [/^КОМБИНИРОВАН/, 'RK_КОМБИН'],
    [/^КУЛАЧК/, 'RK_КУЛАЧК'],
    [/^КОЛЬЧАТ/, 'RK_КОЛЬЧАТ']
  ];
  var CRANE = [[/^БАШЕН/, 'CH_БАШЕН'], [/^КОЗЛОВ/, 'CH_КОЗЛОВ'], [/^МОСТОВ(ЫЕ|ОЙ|АЯ)$/, 'CH_МОСТОВ']];

  var EXCL = {
    CH: [['АВТО', 'СПЕЦШАССИ'], ['ГУСЕН'], ['ПНЕВМОКОЛ'], ['ЖД'], ['ТРАКТОР'], ['БАШЕН'], ['КОЗЛОВ'], ['МОСТОВ']],
    RK: [['ГЛАДК'], ['ВИБР'], ['КОМБИН'], ['ПНЕВМОКОЛ'], ['КУЛАЧК'], ['КОЛЬЧАТ']],
    DR: [['ЭЛЕКТР', 'АККУМ'], ['ПНЕВМ'], ['ДВС', 'ДИЗЕЛ'], ['ДВС', 'БЕНЗИН'], ['РУЧН']],
    MT: [['ПРИЦЕП', 'ПЕРЕДВИЖ'], ['САМОХОД', 'ПЕРЕДВИЖ'], ['ПЕРЕНОСН', 'ПЕРЕДВИЖ'], ['СТАЦИОНАР']]
  };

  var STOP = {};
  ('ПРИ НА С СО ДЛЯ И ИЛИ В ВО ПО ОТ ДО ИЗ К У А ТИПА ТИП МАРКИ МОДЕЛЬ МОДЕЛИ Г/П ГП ГРУЗОПОДЪЕМНОСТЬЮ ГРУЗОПОДЪЕМНОСТЬ ' +
   'ГРУЗОПОДЬЕМНОСТЬЮ ГРУЗОПОДЬЕМНОСТЬ ГРУЗОПОДЪЕМНОСТЮ ГРУЗОПОДЪЕМНОСТИ ЕМКОСТЬЮ ЕМКОСТЬ ВМЕСТИМОСТЬЮ ВМЕСТИМОСТЬ ВМЕСТИМОСТ ВМЕСТИМОС ' +
   'ОБЪЕМ ОБЪЕМОМ ОБЬЕМ МОЩНОСТЬЮ МОЩНОСТЬ МОЩНОСТ НОМИНАЛЬНАЯ НОМИНАЛЬНОЙ ПРОИЗВОДИТЕЛЬНОСТЬЮ ПРОИЗВОДИТЕЛЬНОСТЬ ДАВЛЕНИЕМ ДАВЛЕНИЕ ' +
   'ПОДАЧА ПОДАЧЕЙ НАПОР НАПОРОМ ВЫСОТОЙ ВЫСОТА ПОДЪЕМА ПОДЬЕМА ПОДЪЁМА ДЛИНОЙ ДЛИНА ГЛУБИНОЙ ГЛУБИНА ШИРИНОЙ ШИРИНА ДИАМЕТРОМ ДИАМ ' +
   'ДИАМЕТР ТЯГОВЫМ УСИЛИЕМ НОМИНАЛЬНЫМ КОВША КОВШОМ РАБОЧЕЙ МАССОЙ МАССА ХОДУ ХОД КОЛИЧЕСТВОМ ТОПЛИВО ТИПЛИВО ' +
   'ФИРМЫ ФИРМ АНАЛОГИЧНОГО МАРКА ПОЛЕЗНОЙ СТРЕЛЫ ОБЩЕГО НАЗНАЧЕНИЯ СТРОИТЕЛЬСТВА ВЫПОЛНЕНИЯ РАБОТ ПРИ ПРОКЛАДКЕ И ' +
   'КОМПЛЕКТЕ Т-КМ ТН/КМ КМ СЕРИИ ВМЕСТИМОСТЬ ЕМКОСТЬЮ УКЛАДКИ ДАВЛЕНИЯ НАГНЕТАНИЯ НИЗКОЕ ВЫСОКОЕ ВЫСОКОГО ВЫСОКОГОДАВЛЕНИЯ ' +
   'СТЕРЖНЕВОЙ ФРЕЗЕРОВАНИЯ ВЫСОТОЙ').split(/\s+/).forEach(function (w) { STOP[F(w)] = 1; });

  var STEM_SYN = {
    'РУБК': 'РЕЗК',
    'ГНУТ': 'ГИБК'
  };

  var NUM = '\\d+(?:[.,]\\d+)?';
  var RNG = NUM + '(?:\\s*[-\\/]\\s*' + NUM + ')?';
  var UNITS = [
    ['М[3З]\\s*\\/\\s*МИН(?:УТ[А-Я]*)?', 'm3/min'],
    ['М[3З]\\s*\\/\\s*(?:ЧАС|Ч)', 'm3/h'],
    ['ТН?\\s*\\/\\s*М3', 't/m3'],
    ['М3|КУБ\\.?\\s*М', 'm3'],
    ['КВТ|КW', 'kw'],
    ['КВА|КVА|КБА', 'kva'],
    ['Л\\.?\\s*С\\.?(?:\\s*М(?=[^А-Я]|$))?|НР|О\\.\\s*К\\.?|О\\s*К(?=[^А-Я]|$)', 'hp'],
    ['КПА', 'kpa'],
    ['МПА|МРА', 'mpa'],
    ['КГС\\s*\\/\\s*СМ2', 'kgfcm2'],
    ['АТМ\\.?|АТ', 'atm'],
    ['КН', 'kn'],
    ['КГ', 'kg'],
    ['ТОНН[А-Я]*|ТН|ТN|Т', 't'],
    ['ММ', 'mm'],
    ['СМ', 'cm'],
    ['КМ', 'km'],
    ['МЕТР[А-Я]*|М', 'm'],
    ['ЛИТР[А-Я]*|Л', 'l'],
    ['ОБ\\s*\\/\\s*МИН', 'rpm'],
    ['ГЦ', 'hz'],
    ['ГР\\.?', 'deg'],
    ['%', 'pct'],
    ['V', 'v']
  ];
  var UNIT_ALT = UNITS.map(function (u) { return '(?:' + u[0] + ')'; }).join('|');
  function unitDim(u) {
    for (var i = 0; i < UNITS.length; i++) if (new RegExp('^(?:' + UNITS[i][0] + ')$').test(u)) return UNITS[i][1];
    return null;
  }
  function numStr(s) {
    return String(s).replace(/\s+/g, '').replace(/,/g, '.').replace(/(\.\d*?)0+(?=$|[^\d])/g, '$1').replace(/\.(?=$|[^\d])/g, '');
  }

  function takeNumbers(s, hasCurrent) {
    var nums = [];
    var pair = new RegExp('(^|[^' + L + '0-9.,\\-])(' + NUM + ')\\s*\\(\\s*(' + NUM + ')\\s*\\)\\s*(' + UNIT_ALT + ')\\s*[\\(\\/]?\\s*(' + UNIT_ALT + ')\\s*[\\)\\/]?(?=[^' + L + '0-9]|$)', 'g');
    s = s.replace(pair, function (m, pre, a, b, u1, u2) {
      var d1 = unitDim(u1), d2 = unitDim(u2);
      if (!d1 || !d2) return m;
      nums.push({ dim: d1, v: numStr(a) }); nums.push({ dim: d2, v: numStr(b) });
      return pre + ' ';
    });
    s = s.replace(new RegExp('(^|[^' + L + '0-9])ОТ\\s+(' + NUM + ')\\s+ДО\\s+(' + NUM + ')\\s*(' + UNIT_ALT + ')(?=[^' + L + '0-9]|$)', 'g'), function (m, pre, a, b, u) {
      var d = unitDim(u); if (!d) return m;
      nums.push({ dim: d, v: numStr(a) + '-' + numStr(b) }); return pre + ' ';
    });
    s = s.replace(/ПОСТОВ\s+ДО\s+(\d+)/g, function (m, a) { nums.push({ dim: 'posts', v: a }); return ' '; });
    var one = new RegExp('(^|[^' + L + '0-9.,\\-])(?:(ДО|СВЫШЕ|БОЛЕЕ|ОТ|ГРУЗОПОДЪЕМНОСТЬЮ)\\s+)?(' + RNG + ')\\s*\\(?\\s*(' + UNIT_ALT + ')\\s*\\)?(?:\\s*(И\\s+БОЛЕЕ|И\\s+ВЫШЕ))?(?=[^' + L + '0-9]|$)', 'g');
    s = s.replace(one, function (m, pre, pref, v, u, more) {
      var d = unitDim(u.replace(/\s+/g, ' ').trim());
      if (!d) return m;
      if (d === 'a' && !hasCurrent) return m;
      var val = numStr(v).replace(/\s*-\s*/, '-');
      if (pref === 'СВЫШЕ' || pref === 'БОЛЕЕ') val = '>' + val;
      if (more) val = val + '+';
      nums.push({ dim: d, v: val });
      return pre + ' ';
    });
    if (hasCurrent) {
      s = s.replace(new RegExp('(^|[^' + L + '0-9.,\\-])(' + RNG + ')\\s*А(?=[^' + L + '0-9]|$)', 'g'), function (m, pre, v) {
        nums.push({ dim: 'a', v: numStr(v).replace(/\s*-\s*/, '-') }); return pre + ' ';
      });
    }
    return { rest: s, nums: nums };
  }

  var ENDINGS = ['ЯМИ', 'АМИ', 'ЫМИ', 'ИМИ', 'ОГО', 'ЕГО', 'ОМУ', 'ЕМУ', 'ЫХ', 'ИХ', 'ЫЕ', 'ИЕ', 'ЫЙ', 'ИЙ', 'ОЙ', 'ЕЙ', 'АЯ', 'ЯЯ', 'ЫМ', 'ИМ',
    'ОЕ', 'ЕЕ', 'УЮ', 'ЮЮ', 'ОМ', 'ЕМ', 'АМ', 'ЯМ', 'АХ', 'ЯХ', 'ОВ', 'ЕВ', 'Ы', 'И', 'А', 'Я', 'О', 'Е', 'У', 'Ю', 'Ь'];
  function stem(w) {
    if (!/^[А-Я]+$/.test(w)) return w;
    for (var i = 0; i < ENDINGS.length; i++) {
      var e = ENDINGS[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) { w = w.slice(0, -e.length); break; }
    }
    if (w.length > 3 && w.slice(-1) === 'Ь') w = w.slice(0, -1);
    return w;
  }

  var BRANDS = {};
  ['НАММ', 'КАМАЗ', 'МАЗ', 'ЗИЛ', 'УРАЛ', 'ГАЗ', 'КРАЗ', 'БЕЛАЗ', 'УАЗ', 'ЛИБХЕР', 'КАМАЦУ', 'ИСУЗУ', 'ХАРБИН', 'КЛИНЦЫ', 'ГАЛИЧАНИН',
   'ВОВСАТ', 'КАТО', 'ТАТА', 'ЧЕТРА', 'ДЭК', 'СОВАLТ', 'ЛАСЕТТИ', 'НЕКСИЯ', 'КАПТИВА', 'САКАЙ', 'ТТЗ', 'ДАЕWОО', 'ВЕLАZ', 'АТЛАС', 'СУПЕР',
   'МАN', 'ВОМАG', 'DУNАРАС', 'ХСМG', 'КОМАТSU', 'ИСУЗИ', 'ОМIСRОN', 'ДОНФЕНГ', 'ВКС', 'ЛИОК', 'ЭНМ', 'ВДМ', 'ККТ', 'АДФ', 'УШМ', 'ПМ', 'ВПК'].forEach(function (b) { BRANDS[F(b)] = 1; });
  ['HAMM', 'BOBCAT', 'ATLAS', 'MAXIMA', 'COPCO', 'CASE', 'MERCEDES', 'HOWO', 'SANY', 'TEREX', 'KATO', 'AMMANN', 'CAT', 'MAZ', 'KAMAZ',
   'ZIL', 'TATA', 'BOMAG', 'XCMG'].forEach(function (b) { BRANDS[F(b)] = 1; });

  function hasLatin(t) { return /[A-Z]/.test(t); }

  function owns(name, unit, section) {
    var u = String(unit || '').toLowerCase();
    if (u === 'маш-ч' || u === 'чел-ч' || u === 'т-км') return true;
    if (section === 'machines' || section === 'labor' || section === 'transport') return true;
    if (!unit && !section && /ЗАТРАТЫ\s+ТРУДА/.test(String(name || '').toUpperCase())) return true;
    return false;
  }

  var PH = null, UZR = null;
  function compile() {
    if (PH) return;
    UZR = UZ.map(function (p) { return [new RegExp(B0 + '(?:' + FP(p[0]).replace(/ /g, '\\s+') + ')' + B1, 'g'), p[1]]; });
    PH = PHRASES.map(function (p) { return [new RegExp(B0 + '(?:' + FP(p[0]) + ')' + B1, 'g'), p[1]]; });
  }

  function sortU(a) { var o = {}, r = []; for (var i = 0; i < a.length; i++) if (!o[a[i]]) { o[a[i]] = 1; r.push(a[i]); } return r.sort(); }

  function analyse(name) {
    compile();
    var s = ' ' + fold(String(name).replace(/([А-ЯЁа-яё]{4,})(?=[A-Za-z])/g, function (w) {
      return /[БГДЁЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯбгдёжзийлпфцчшщъыьэюя]/.test(w) ? w + ' ' : w;
    })) + ' ';
    var i, j, m;
    for (i = 0; i < UZR.length; i++) s = s.replace(UZR[i][0], function (all, pre) { return pre + ' ' + UZR[i][1] + ' '; });
    s = s.replace(/([А-Я]{4,}НО)\s*-\s*([А-Я]{3,})/g, '$1$2');
    s = s.replace(/([А-Я]{4,}НО)\s+(МОНТАЖН[А-Я]*)/g, '$1$2');
    s = s.replace(/([А-ЯA-Z])\s*-\s*(?=[А-ЯA-Z])/g, '$1 ');
    for (i = 0; i < PH.length; i++) s = s.replace(PH[i][0], function () {
      var a = arguments, pre = a[1], rep = PH[i][1];
      rep = rep.replace(/\$(\d)/g, function (x, k) { return a[+k + 1] || ''; });
      return pre + ' ' + rep + ' ';
    });
    s = s.replace(/(\d{1,3}),\s(\d)(?=\s*М[3З]\s*\/)/g, '$1,$2');
    var hasCurrent = /ТОК(ОМ|А)?(?=[^А-Я]|$)|СВАРОЧН/.test(s);
    var tn = takeNumbers(s, hasCurrent);
    s = tn.rest;
    var nums = tn.nums;
    var kinds = [], work = [], fuel = [], lab = null;
    s = s.replace(/@([A-Z]+)_?([А-ЯA-Z0-9]*)/g, function (x, k, v) {
      if (k === 'WORK') work.push(stem(v));
      else if (k === 'FUEL') fuel.push(v === 'ДИЗЕЛ' ? 'ДИЗЕЛЬ' : v);
      else if (k === 'LABWORK') lab = 'WORKERS';
      else if (k === 'LABMACH') lab = 'MACHINISTS';
      else kinds.push(k + '_' + v);
      return ' ';
    });
    s = s.replace(/(\d),(?=\d)/g, '$1\u00B7').replace(/[()\[\]{};:!?*+=<>№#",]/g, ' , ');
    var raw = s.split(/\s+/);
    var toks = [], t;
    for (i = 0; i < raw.length; i++) {
      if (raw[i] === ',') { toks.push(','); continue; }
      t = raw[i].replace(/^[.\-\/]+|[.\-\/]+$/g, '').replace(/\u00B7/g, ',');
      if (!t) continue;
      toks.push(t);
    }
    var out = [];
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t === ',') { out.push(t); continue; }
      var nx = toks[i + 1];
      if (/^[А-ЯA-Z]{1,4}$/.test(t) && !STOP[t] && nx && /^\d/.test(nx) && !/^(Т|М|Л|А|В|С)$/.test(t)) {
        out.push((t + nx).replace(/([А-ЯA-Z])-(\d)|(\d)-([А-ЯA-Z])/g, '$1$3$2$4')); i++; continue;
      }
      out.push(t);
    }
    toks = out;
    var words = [], brands = [], codes = [], typ = null, typExtra = null, specific = 0, afterTipa = false, prev = '';
    var head = -1, carrier = -1;
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t === ',') { afterTipa = false; prev = ''; continue; }
      if (t === 'ТИПА' || t === 'МАРКИ' || t === 'МОДЕЛЬ') {
        if (!/(ОГО|ЕГО)$/.test(prev)) afterTipa = true;
        prev = t; continue;
      }
      if (/\d/.test(t)) {
        codes.push(t.replace(/([А-ЯA-Z])[-\s](?=\d)|(\d)-(?=[А-ЯA-Z])/g, '$1$2'));
        prev = t; continue;
      }
      if (STOP[t]) {
        if (/^(С|СО|НА|ДЛЯ|ПРИ|В|ВО|ИЗ)$/.test(t)) afterTipa = false;
        prev = t; continue;
      }
      if (t.length === 1 && !/[A-Z]/.test(t)) { prev = t; continue; }
      if (afterTipa || hasLatin(t) || BRANDS[t]) { brands.push(t); prev = t; continue; }
      var st = stem(t);
      if (STEM_SYN[st]) st = STEM_SYN[st];
      if (!typ && head < 0) {
        for (j = 0; j < TYPES.length; j++) if (TYPES[j][0].test(t)) { typ = TYPES[j][1]; typExtra = TYPES[j][2]; specific = TYPES[j][3]; break; }
        if (typ) { prev = t; continue; }
        if (CARRIER.test(t)) { if (carrier < 0) carrier = words.length; }
        else if (!ADJ.test(t) && !MODIF[t]) head = words.length;
      }
      words.push(st);
      prev = t;
    }
    if (!typ) {
      if (!words.length && lab) return { lab: lab, words: [], nums: nums, codes: codes, brands: brands };
      if (!words.length && !brands.length && !codes.length) return null;
      if (words.length) {
        var hi = carrier >= 0 && (head < 0 || carrier < head) ? carrier : head >= 0 ? head : 0;
        typ = words.splice(hi, 1)[0];
        specific = 0;
        if (GENERIC.test(typ)) specific = -1;
      } else if (brands.length) { typ = brands.shift(); specific = 0; } else { typ = codes.shift(); specific = 0; }
    }
    if (typExtra) kinds.push(typExtra);
    var w2 = [];
    for (i = 0; i < words.length; i++) {
      var w = words[i], k = null;
      if (typ === 'КАТОК') for (j = 0; j < ROLLER.length; j++) if (ROLLER[j][0].test(w)) { k = ROLLER[j][1]; break; }
      if (typ === 'КРАН') for (j = 0; j < CRANE.length; j++) if (CRANE[j][0].test(w + 'ЫЕ') || CRANE[j][0].test(w)) { k = CRANE[j][1]; break; }
      if (k) { kinds.push(k); continue; }
      if (specific === 1 && CARRIER.test(w)) continue;
      if (DEFAULT_WORDS[typ] && DEFAULT_WORDS[typ][w]) continue;
      w2.push(w);
    }
    words = w2;
    if (typ === 'КАТОК') kinds = kinds.map(function (x) { return x === 'CH_ПНЕВМОКОЛ' ? 'RK_ПНЕВМОКОЛ' : x; });
    var dflt = DEFAULTS[typ] || {};
    kinds = sortU(kinds.filter(function (x) { return !dflt[x]; }));
    fuel = sortU(fuel.filter(function (x) { return !dflt['FUEL_' + x]; }));
    return { lab: lab, typ: typ, specific: specific, kinds: kinds, work: sortU(work), words: sortU(words), wordsOrd: words, brands: sortU(brands),
      codes: sortU(codes), nums: nums, fuel: fuel };
  }

  function merge(a, b) { var o = {}, k; for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k]; return o; }

  function numKey(nums) {
    var a = nums.map(function (n) { return n.dim + '=' + n.v; });
    return sortU(a).join(',');
  }

  function build(prefix, p, drop) {
    var d = drop || {};
    var w = d.words ? '' : d.first ? (p.wordsOrd[0] || '') : p.words.join(',');
    return [prefix, p.typ, d.kinds ? '' : p.kinds.join(','), d.work ? '' : p.work.join(','), w,
      d.brands ? '' : p.brands.concat(p.fuel.map(function (f) { return 'ТОПЛ_' + f; })).join(','), d.codes ? '' : p.codes.join(','), d.nums ? '' : numKey(p.nums)].join('|');
  }

  function parse(name, unit, section) {
    if (name == null) return null;
    var u = String(unit || '').toLowerCase();
    var p = analyse(name);
    if (!p) return null;
    if (p.lab || u === 'чел-ч' || section === 'labor') {
      if (!p.lab) {
        var g = /(\d+)\s*-?\s*(ГО)?\s+РАЗРЯД/.exec(fold(name));
        var trade = p.typ;
        if (!trade || !g) return null;
        var key0 = 'LAB|WORKERS|' + trade + '|G' + g[1];
        return { family: 'machines', key: key0, attrs: { kind: 'labour-workers', trade: trade, grade: +g[1] },
          levels: [{ key: 'LAB|WORKERS', drop: ['профессия и разряд (' + trade + ' ' + g[1] + ')'] }] };
      }
      var rest = p.nums.filter(function (n) { return !(n.dim === 'pct' && n.v === '12'); });
      var key = 'LAB|' + p.lab + (rest.length ? '|' + numKey(rest) : '');
      return { family: 'machines', key: key, attrs: { kind: p.lab === 'WORKERS' ? 'labour-workers' : 'labour-machinists' },
        levels: rest.length ? [{ key: 'LAB|' + p.lab, drop: [numKey(rest)] }] : [] };
    }
    var prefix = (u === 'т-км' || section === 'transport') ? 'TKM' : 'MACH';
    if (!p.typ) return null;
    var keyM = build(prefix, p);
    var D = {
      work: 'вид работ (' + p.work.join(', ') + ')',
      brands: 'марка (' + p.brands.concat(p.fuel).join(' ') + ')',
      words: 'признаки (' + p.words.join(' ') + ')',
      first: 'признаки кроме «' + (p.wordsOrd[0] || '') + '» (' + p.wordsOrd.slice(1).join(' ') + ')',
      kinds: 'исполнение (' + p.kinds.join(', ').replace(/[A-Z]+_/g, '') + ')',
      nums: 'параметры (' + numKey(p.nums) + ')',
      codes: 'модель (' + p.codes.join(' ') + ')'
    };
    function key(spec) { return build(prefix, p, spec); }
    function dropOf(spec) {
      var drop = [];
      ['work', 'brands', 'codes', 'words', 'first', 'kinds', 'nums'].forEach(function (x) {
        if (!spec[x]) return;
        if (x === 'work' && !p.work.length || x === 'brands' && !p.brands.length && !p.fuel.length || x === 'words' && !p.words.length ||
            x === 'first' && p.wordsOrd.length < 2 || x === 'kinds' && !p.kinds.length || x === 'nums' && !p.nums.length || x === 'codes' && !p.codes.length) return;
        if (x === 'first' && spec.words) return;
        drop.push(D[x]);
      });
      return drop;
    }
    var hasN = p.nums.length > 0, hasC = p.codes.length > 0, hasW = p.words.length > 0, gen = p.specific === -1;
    var ladder = [], cur = { work: 1 };
    ladder.push(merge(cur, {}));
    cur.brands = 1; ladder.push(merge(cur, {}));
    if (hasN) cur.codes = 1;
    ladder.push(hasN ? merge(cur, {}) : null);
    var w4 = !gen && hasW && (hasN || hasC);
    if (w4) cur.words = 1;
    ladder.push(w4 ? merge(cur, {}) : null);
    var k5 = merge(cur, { kinds: 1 });
    var bare5 = !hasN && !(hasC && !k5.codes) && !(hasW && !k5.words);
    ladder.push(p.kinds.length && !bare5 ? k5 : null);
    ladder.push(hasC && hasN ? (gen ? { work: 1, brands: 1, nums: 1 } : { work: 1, brands: 1, nums: 1, words: 1 }) : null);
    ladder.push(gen && p.wordsOrd.length > 1 ? { work: 1, brands: 1, codes: 1, kinds: 1, first: 1 } : null);
    ladder.push(gen ? (p.wordsOrd.length ? { work: 1, brands: 1, codes: 1, nums: 1, first: 1 } : null) :
      (hasN || hasC || hasW || p.brands.length) ? { work: 1, brands: 1, codes: 1, nums: 1, words: 1 } :
      p.kinds.length ? { kinds: 1 } : null);
    ladder.push(gen ? (p.wordsOrd.length ? { work: 1, brands: 1, codes: 1, nums: 1, kinds: 1, first: 1 } : null) :
      { work: 1, brands: 1, codes: 1, nums: 1, words: 1, kinds: 1 });
    var levels = [], prevKey = keyM, prevDrop = [];
    for (var li = 0; li < ladder.length; li++) {
      if (ladder[li]) { var k2 = key(ladder[li]); if (k2 !== prevKey) { prevKey = k2; prevDrop = dropOf(ladder[li]); } }
      levels.push({ key: prevKey, drop: prevDrop.slice() });
    }
    return { family: 'machines', key: keyM, levels: levels,
      attrs: { kind: prefix === 'TKM' ? 'transport' : 'machine', type: p.typ, kinds: p.kinds, work: p.work, words: p.words,
        brands: p.brands, codes: p.codes, nums: p.nums, fuel: p.fuel, generic: p.specific === -1 } };
  }

  function kindGroups(kinds, cls) {
    var vals = kinds.filter(function (k) { return k.indexOf(cls + '_') === 0; }).map(function (k) { return k.slice(cls.length + 1); });
    return vals;
  }
  function compatible(cls, a, b) {
    if (!a.length || !b.length) return true;
    var groups = EXCL[cls];
    for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) {
      if (a[i] === b[j]) return true;
    }
    for (var g = 0; g < groups.length; g++) {
      var ga = false, gb = false;
      for (i = 0; i < a.length; i++) if (groups[g].indexOf(a[i]) >= 0) ga = true;
      for (j = 0; j < b.length; j++) if (groups[g].indexOf(b[j]) >= 0) gb = true;
      if (ga && gb) return true;
    }
    return false;
  }

  var ROLLER_MODEL = [
    [/^[СC][РPR]\d/, 'ПНЕВМОКОЛ'],
    [/^[ХX][РP]\d/, 'ПНЕВМОКОЛ'],
    [/^[СC][СC]\d|^[СC][АA]\d/, 'ВИБР'],
    [/^[ХX](D|S|[МM]R)\d/, 'ВИБР']
  ];
  function rollerKinds(A) {
    var st = kindGroups(A.kinds || [], 'RK');
    if (st.length) return st;
    var out = [], i, j;
    for (i = 0; i < (A.codes || []).length; i++) for (j = 0; j < ROLLER_MODEL.length; j++) {
      if (ROLLER_MODEL[j][0].test(A.codes[i]) && out.indexOf(ROLLER_MODEL[j][1]) < 0) out.push(ROLLER_MODEL[j][1]);
    }
    for (i = 0; i < (A.words || []).length; i++) {
      if (/^ДВУХВАЛЬЦ|^ВИБРО/.test(A.words[i]) && out.indexOf('ВИБР') < 0) out.push('ВИБР');
    }
    return out;
  }

  function conflict(a, b) {
    if (!a || !b) return null;
    var ka = String(a.key || ''), kb = String(b.key || '');
    if (ka.split('|')[0] !== kb.split('|')[0]) return 'section';
    var A = a.attrs || {}, Bt = b.attrs || {};
    if (A.kind === 'labour-workers' || A.kind === 'labour-machinists' || Bt.kind === 'labour-workers' || Bt.kind === 'labour-machinists') {
      return A.kind === Bt.kind ? null : 'labour kind';
    }
    if (A.type && Bt.type && A.type !== Bt.type) return 'type ' + A.type + ' vs ' + Bt.type;
    if (A.type === 'КАТОК' && Bt.type === 'КАТОК') {
      var ra = rollerKinds(A), rb = rollerKinds(Bt);
      if (ra.length && !rb.length) return 'RK ' + ra.join(',') + ' vs unknown';
      if (ra.length && rb.length && !compatible('RK', ra, rb)) return 'RK ' + ra.join(',') + ' vs ' + rb.join(',');
    }
    var manA = kindGroups(A.kinds || [], 'DR').indexOf('РУЧН') >= 0, manB = kindGroups(Bt.kinds || [], 'DR').indexOf('РУЧН') >= 0;
    if (manA !== manB) return 'DR ' + (manA ? 'РУЧН vs powered' : 'powered vs РУЧН');
    var cls = ['CH', 'RK', 'DR', 'MT'];
    for (var i = 0; i < cls.length; i++) {
      var va = kindGroups(A.kinds || [], cls[i]), vb = kindGroups(Bt.kinds || [], cls[i]);
      if (!compatible(cls[i], va, vb)) return cls[i] + ' ' + va.join(',') + ' vs ' + vb.join(',');
    }
    if ((A.fuel || []).length && (Bt.fuel || []).length && A.fuel.join() !== Bt.fuel.join()) return 'fuel ' + A.fuel.join() + ' vs ' + Bt.fuel.join();
    var da = {}, db = {};
    (A.nums || []).forEach(function (n) { (da[n.dim] = da[n.dim] || []).push(n.v); });
    (Bt.nums || []).forEach(function (n) { (db[n.dim] = db[n.dim] || []).push(n.v); });
    for (var d in da) if (Object.prototype.hasOwnProperty.call(da, d) && db[d]) {
      if (da[d].slice().sort().join() !== db[d].slice().sort().join()) return 'numbers ' + d + ' ' + da[d].join('/') + ' vs ' + db[d].join('/');
    }
    return null;
  }

  function addDays(iso, n) {
    var t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000;
    var d = new Date(t);
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  function quarterEnd(iso) {
    var y = +iso.slice(0, 4), mo = +iso.slice(5, 7);
    var q = Math.floor((mo - 1) / 3), em = q * 3 + 3;
    var ny = em === 12 ? y + 1 : y, nm = em === 12 ? 1 : em + 1;
    return addDays(ny + '-' + (nm < 10 ? '0' : '') + nm + '-01', -1);
  }
  function periodOf(iso) { return iso.slice(0, 4) + ' Q' + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1); }

  function wageFor(region, asof, kind, records, opts) {
    opts = opts || {};
    if (kind === 'labour-machinists') return { price: null, reason: 'the wage table has no machinist rate (wages.md §4); machinists are paid inside the machine-hour price' };
    if (kind && kind !== 'labour-workers') return { price: null, reason: 'unknown labour kind ' + kind };
    var lag = opts.lagDays == null ? 30 : opts.lagDays;
    var best = null;
    for (var i = 0; i < (records || []).length; i++) {
      var r = records[i];
      if (!r || r.region !== region || !r.price_date || !(r.price > 0)) continue;
      if (r.section && r.section !== 'labor') continue;
      var per = periodOf(r.price_date);
      var pub;
      if (opts.period) {
        if (per !== opts.period) continue;
        pub = null;
      } else {
        if (opts.published) {
          var srcs = [r.src].concat(((r.attrs || {}).also_in || []).map(function (x) { return x.src; }));
          pub = null;
          for (var j = 0; j < srcs.length; j++) {
            var d = opts.published[srcs[j]];
            if (d && (!pub || d < pub)) pub = d;
          }
          if (!pub) pub = addDays(quarterEnd(r.price_date), lag);
        } else pub = addDays(quarterEnd(r.price_date), lag);
        if (pub > asof) continue;
      }
      if (!best || r.price_date > best.rec.price_date) best = { rec: r, pub: pub, per: per };
    }
    if (!best) return { price: null, reason: 'no wage record for ' + region + ' published by ' + asof };
    return { price: best.rec.price, rec: best.rec, period: best.per, published: best.pub,
      rule: opts.period ? 'period ' + opts.period : opts.published ? 'edition dates' : 'quarter end + ' + lag + ' days' };
  }

  function bandFor(km, bands, rule) {
    var b = (bands || []).map(Number).filter(function (x) { return x > 0; }).sort(function (x, y) { return x - y; });
    if (!b.length || !(km > 0)) return null;
    rule = rule || 'ceil';
    var i;
    if (rule === 'floor') { var f = b[0]; for (i = 0; i < b.length; i++) if (b[i] <= km) f = b[i]; return f; }
    if (rule === 'nearest') {
      var best = b[0];
      for (i = 0; i < b.length; i++) if (Math.abs(b[i] - km) < Math.abs(best - km) || (Math.abs(b[i] - km) === Math.abs(best - km) && b[i] > best)) best = b[i];
      return best;
    }
    for (i = 0; i < b.length; i++) if (b[i] >= km) return b[i];
    return b[b.length - 1];
  }

  function tariffFor(series, km, opts) {
    opts = opts || {};
    var wf = opts.withFuel === undefined ? true : opts.withFuel;
    var recs = (series || []).filter(function (r) {
      var a = r.attrs || {};
      if (!(a.km > 0)) return false;
      if (wf !== null && a.with_fuel !== undefined && a.with_fuel !== wf) return false;
      return true;
    });
    var band = bandFor(km, recs.map(function (r) { return r.attrs.km; }), opts.rule);
    if (band == null) return null;
    var hit = recs.filter(function (r) { return +r.attrs.km === band; });
    return hit.length ? { band: band, rec: hit[0] } : null;
  }

  var api = { id: 'machines', owns: owns, parse: parse, conflict: conflict, wageFor: wageFor, bandFor: bandFor, tariffFor: tariffFor,
    _analyse: analyse, _fold: fold, _takeNumbers: takeNumbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FamilyMachines = api;
})(this);
