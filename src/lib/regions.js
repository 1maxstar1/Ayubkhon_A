/*
 * Regions (viloyatlar) a workspace can belong to, their labels, and working
 * out which one an application is about from its text.
 *
 * The registry almost never fills the «place» column — 27 090 of 28 337 rows
 * leave it empty — so the region has to be read out of the project title, in
 * whatever the person typing it had to hand: Russian, Uzbek Cyrillic, Uzbek
 * Latin, with typographic apostrophes (G'allaorol, G‘allaorol, Ғаллаорол) and
 * Russian adjectival endings (Сурхандаринского). Matching that text with
 * regular expressions meant spelling out every variant by hand, and it read
 * 81% of the registry.
 *
 * So the text goes through the same normaliser the resource names do
 * (S.matchKey: one alphabet, uppercase, no separators) and is then looked up
 * in a gazetteer of region names, cities and districts. One name written six
 * ways collapses to one or two entries, and the answer comes with a score and
 * the word that produced it, so a weak guess can be shown as a weak guess.
 *
 * Tashkent is the one place a name cannot settle: the city and the region
 * share it. That is decided by the words around it — шаҳри against вилояти,
 * and the districts, which belong to one or the other.
 */
(function (S) {
  'use strict';

  S.REGIONS = [
    ['respublika', 'Республиканский'],
    ['andijon', 'Андижанская область'],
    ['buxoro', 'Бухарская область'],
    ['fargona', 'Ферганская область'],
    ['jizzax', 'Джизакская область'],
    ['xorazm', 'Хорезмская область'],
    ['namangan', 'Наманганская область'],
    ['navoiy', 'Навоийская область'],
    ['qashqadaryo', 'Кашкадарьинская область'],
    ['samarqand', 'Самаркандская область'],
    ['sirdaryo', 'Сырдарьинская область'],
    ['surxondaryo', 'Сурхандарьинская область'],
    ['toshkent_vil', 'Ташкентская область'],
    ['qoraqalpogiston', 'Республика Каракалпакстан'],
    ['toshkent_sh', 'г. Ташкент']
  ];
  S.regionLabel = function (v) {
    for (var i = 0; i < S.REGIONS.length; i++) if (S.REGIONS[i][0] === v) return S.REGIONS[i][1];
    return v || '';
  };

  /*
   * The gazetteer. Every entry is already in S.matchKey form — one Latin
   * alphabet, uppercase — and matches a word of the text that STARTS with it,
   * so ANDIJ covers ANDIJON, ANDIJONSKIY and ANDIJONDAGI at once.
   *
   * Two spellings are usually needed, because Russian and Uzbek do not
   * transliterate alike: Джизак becomes DZHIZAK and Jizzax becomes JIZZAX;
   * Самарканд becomes SAMARKAND and Samarqand SAMARQAND. Where a common
   * prefix covers both (SURX, SIRDAR, NAVOI) one entry is enough.
   *
   * NAME is the region itself and weighs most; PLACE is its cities and
   * districts, which weigh nearly as much — a district belongs to exactly one
   * region, so naming one is as good as naming the region. An entry shorter
   * than five characters must match a whole word, never a prefix — POP is a
   * district of Namangan and also the start of a hundred ordinary words.
   */
  var NAME = {
    respublika: 'OBSHCHERESPUBLIKANSK OBSHERESPUBLIKANSK UMUMRESPUBLIKA RESPUBLIKANSK RESPUBLIKAMIZ ' +
      'ELCHIXONA ELCHIXONASI POSOLSTV',
    andijon: 'ANDIJ ANDIZH',
    buxoro: 'BUXOR BUXAR BUHOR BUKHAR',
    fargona: 'FARGON FERGAN FARGHON FERGHAN',
    jizzax: 'JIZZA ZHIZZA DZHIZAK DJIZAK',
    xorazm: 'XORAZM XOREZM HORAZM KHORAZM KHOREZM',
    namangan: 'NAMANGAN',
    navoiy: 'NAVOI',
    qashqadaryo: 'QASHQADAR KASHKADAR QASHKADAR KASHQADAR',
    samarqand: 'SAMARQAND SAMARKAND SAMARQ',
    sirdaryo: 'SIRDAR SYRDAR',
    surxondaryo: 'SURXAND SURXOND SURHOND SURHAND SURKHAND SURKHOND',
    toshkent_vil: '',
    qoraqalpogiston: 'QORAQALPO KARAKALPAK QARAQALPA KORAKALPAK QORAKALPO',
    toshkent_sh: ''
  };

  var PLACE = {
    andijon: 'ASAKA XONOBOD HONOBOD QORASUV KARASU SHAHRIXON SHAHRIHON BALIQCHI BULOQBOSHI IZBOSKAN ' +
      'JALAQUDUQ ZHALAKUDUK DZHALAKUDUK XOJAOBOD HOJAOBOD XODZHAABAD QORGONTEPA KURGONTEPA ' +
      'KURGANTEPA MARHAMAT MARXAMAT OLTINKOL ALTINKUL PAXTAOBOD ULUGNOR SHAXRIXON IZBASKAN',
    buxoro: 'KOGON KAGAN GIJDUVON GIZHDUVAN JONDOR ZHONDOR OLOT ALAT PESHKU ROMITAN SHOFIRKON ' +
      'QORAKOL KARAKUL QOROVULBOZOR KARAULBAZAR VOBKENT VABKENT',
    fargona: 'MARGILON MARGILAN QOQON KOKAND QUVASOY KUVASAY RISHTON RISHTAN BESHARIQ BUVAYDA ' +
      'DANGARA FURQAT OLTIARIQ ALTYARIK TOSHLOQ UCHKOPRIK YOZYOVON EZEVON YAZYAVAN BAGDOD BOGDOD ' +
      'QOSHTEPA QUVA KUVA SOX QAQIR',
    jizzax: 'GALLAOROL GALLYAARAL ZOMIN ZAAMIN ZARBDOR ZAFAROBOD PAXTAKOR PAKHTAKOR BAXMAL BAHMAL ' +
      'FORISH ARNASOY DOSTLIK MIRZACHOL SHAROFRASHIDOV',
    xorazm: 'URGANCH URGENCH XIVA HIVA BOGOT GURLAN XONQA HONKA HAZORASP GAZORASP SHOVOT ' +
      'YANGIARIQ YANGIBOZOR QOSHKOPIR TUPROQQAL',
    namangan: 'CHUST CHORTOQ CHARTAK KOSONSOY KASANSAY MINGBULOQ TORAQORGON TURAKURGAN UCHQORGON ' +
      'UCHKURGAN UYCHI YANGIQORGON YANGIKURGAN DAVLATOBOD NORIN NARIN POP CHODAK TOSHBULOQ',
    navoiy: 'ZARAFSH KARMANA QIZILTEPA KIZILTEPA KONIMEX XATIRCHI HATIRCHI NAVBAHOR NUROTA NURATA ' +
      'TOMDI UCHQUDUQ UCHKUDUK GAZGAN',
    qashqadaryo: 'QARSHI KARSHI SHAHRISABZ SHAXRISABZ KITOB KITAB KOSON KASAN KASBI CHIROQCHI ' +
      'CHIRAKCHI DEHQONOBOD DEHKANABAD GUZOR MIRISHKOR MUBORAK MUBAREK NISHON QAMASHI KAMASHI ' +
      'YAKKABOG YAKKABAG',
    samarqand: 'KATTAQORGON KATTAKURGAN URGUT BULUNGUR ISHTIXON ISHTIHAN JOMBOY DZHAMBAY QOSHRABOT ' +
      'NARPAY NUROBOD OQDARYO AKDARYA PASTDARGOM PAXTACHI PAYARIQ TOYLOQ TAYLYAK',
    sirdaryo: 'GULIST YANGIYER YANGIER BOYOVUT BAYAUT SARDOBA SAYXUNOBOD SAYHUNABAD MIRZAOBOD ' +
      'OQOLTIN AKALTIN XOVOS HAVAST GAGARIN',
    surxondaryo: 'TERMIZ TERMEZ DENOV DENAU BOYSUN BAYSUN SHEROBOD SHIRABAD SARIOSIYO SARIASIYA ' +
      'JARQORGON DZHARKURGAN QUMQORGON KUMKURGAN SHORCHI SHURCHI OLTINSOY QIZIRIQ MUZRABOT ' +
      'BANDIXON ANGOR',
    toshkent_vil: 'NURAFSHON ANGREN BEKOBOD BEKABAD CHIRCHI OLMALIQ ALMALIK OHANGARON AXANGARAN ' +
      'AHANGARON YANGIYOL YANGIYUL GAZALKENT PARKENT PISKENT ZANGIOTA BOSTONLIQ BOSTANLIK ' +
      'CHINOZ CHINAZ QIBRAY KIBRAY OQQORGON AKKURGAN KELES QUYICHIRCHIQ ORTACHIRCHIQ ' +
      'YUQORICHIRCHIQ YUKORICHIRCHIK ORTACHIRCHIK URTACHIRCHIK QUYICHIRCHIQ KUYICHIRCHIK ' +
      'NURAFSHAN TOYTEPA TUYTEPA BOKA BUKA CHORVOQ CHIMGAN XUMSON PSKENT',
    qoraqalpogiston: 'NUKUS AMUDARYO BERUNIY BIRUNI CHIMBOY CHIMBAY ELLIKQAL ELLIKKAL KEGEYLI ' +
      'MOYNOQ MUYNAK QANLIKOL KANLIKUL QONGIROT KUNGRAD QORAOZAK KARAUZYAK SHUMANAY ' +
      'TAXTAKOPIR TAKHTAKUPIR TORTKOL TURTKUL XOJAYLI HODJEYLI TAXIATOSH TAKHIATASH',
    toshkent_sh: 'CHILONZOR CHILANZAR YUNUSOBOD YUNUSABAD MIROBOD MIRABAD YAKKASAROY YAKKASARAY ' +
      'SHAYXONTOHUR SHAYXONTOXUR SHAYHANTAXUR SHAYHANTAHUR OLMAZOR ALMAZAR UCHTEPA UCHTEPIN ' +
      'BEKTEMIR SERGELI YASHNOBOD YASHNABAD YANGIHAYOT MIRZOULUGBEK ULUGBEK',
    respublika: ''
  };

  /*
   * Names that look like a place and are not. Alisher Navoiy and al-Khwarizmi
   * have a street, a school or a mahalla in every region of the country; the
   * poet is not evidence that the work is in Navoiy.
   */
  var SKIP = { XORAZMIY: 1, XORAZMI: 1, XORAZMIYNOMLI: 1 };
  var SKIP_AFTER = { ALISHER: 1, ABU: 1, ABURAYHON: 1, AL: 1, MIRZO: 1 };
  /* A place name followed by one of these is a street or a mahalla named after
     it, not the place: «Навоий кўчаси» in Tashkent is a street, and
     «"Zarafshon" MFY» in Surxondaryo is a neighbourhood. */
  var SKIP_BEFORE = {
    KOCHASI: 1, KOCHA: 1, KUCHASI: 1, KUCHA: 1, KOCHASIDA: 1, KUCHASIDA: 1,
    ULITSA: 1, ULITSI: 1, PROSPEKT: 1, PROSPEKTI: 1, SHOXKOCHASI: 1,
    MFY: 1, MFYDAGI: 1, MFYDA: 1, MAHALLA: 1, MAXALLA: 1, MAHALLASI: 1, MAXALLASI: 1,
    NOMIDAGI: 1, NOMLI: 1, MASSIVI: 1, MAVZESI: 1, DAHASI: 1
  };

  /* Words that put a bare «Ташкент» on one side of the line or the other. */
  /*
   * What settles a bare «Тошкент», and it is the word right next to it.
   * Measured on the 389 applications that stated one of the two Tashkents:
   * «Тошкент шаҳри» is the city 131 times against 5, «Тошкент вилояти» the
   * region 83 against 1 — but «туман» decides nothing, because the city has
   * twelve tumans of its own and 116 of the 216 city rows use the word.
   */
  var CITY_MARK = /^(SH|SHAHAR|SHAHRI|SHAHRIDA|SHAHRIDAGI|SHAHRINING|SHAHRINI|SHAXAR|SHAXRI|SHAXRIDA|GOROD|GORODA|GORODE|GORODSK)/;
  var AREA_MARK = /^(VILOYAT|VILOYATI|VILOYATIDA|VILOYATINING|VILAYAT|OBLAST|OBLASTI|OBLASTN)/;
  var TASHKENT = /^(TOSHKENT|TASHKENT|TOSHKEND|TASHKEND)/;

  /* Entries shorter than this must match a whole word rather than a prefix. */
  var MIN_PREFIX = 5;

  var INDEX = null;
  function index() {
    if (INDEX) return INDEX;
    INDEX = {};
    function add(region, list, weight) {
      var words = list.split(/\s+/);
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (!w) continue;
        var head = w.slice(0, 3);
        (INDEX[head] = INDEX[head] || []).push([w, weight, region]);
      }
    }
    for (var r in NAME) if (NAME[r]) add(r, NAME[r], 4);
    for (var p in PLACE) if (PLACE[p]) add(p, PLACE[p], 3);
    return INDEX;
  }

  /**
   * Score every region against one piece of text.
   * `weight` scales the whole field: the «place» column, when it is filled in,
   * says so outright; a project title is good evidence; an organisation's own
   * name only tells you where the office is.
   */
  function scanInto(score, evidence, order, text, weight) {
    var seq = order.__n || 0;
    if (!text) { return; }
    var toks = S.tokens(text);
    if (!toks.length) return;
    var idx = index(), i, j;
    // «вилояти» / «области» anywhere in the text is the one region signal that
    // holds at a distance: of the applications that stated the city, three in
    // two hundred contain it.
    var areaAnywhere = false;
    for (i = 0; i < toks.length; i++) if (AREA_MARK.test(toks[i])) { areaAnywhere = true; break; }
    var bare = [], tashDistrict = false;

    for (i = 0; i < toks.length; i++) {
      var tok = toks[i];
      if (TASHKENT.test(tok)) {
        // The city and the region are one word; settle it after the loop, once
        // it is known whether a district of either was named outright.
        bare.push(i);
        continue;
      }
      if (SKIP[tok]) continue;
      if (i && SKIP_AFTER[toks[i - 1]]) continue;      // «Алишер Навоий» is a name, not a region
      if (SKIP_BEFORE[toks[i + 1] || '']) continue;    // «Навоий кўчаси» is a street
      var bucket = idx[tok.slice(0, 3)];
      if (!bucket) continue;
      // The longest entry a word starts with is the one that means it:
      // КОСОНСОЙ is a district of Namangan, not the Kasan of Qashqadaryo that
      // its first five letters spell.
      var hit = null;
      for (j = 0; j < bucket.length; j++) {
        var entry = bucket[j][0];
        var ok = entry.length >= MIN_PREFIX ? tok.indexOf(entry) === 0 : tok === entry;
        if (!ok) continue;
        if (!hit || entry.length > hit[0].length) hit = bucket[j];
      }
      if (hit) {
        bump(hit[2], hit[1] * weight, tok);
        if (hit[2] === 'toshkent_sh' || hit[2] === 'toshkent_vil') tashDistrict = true;
      }
    }

    // «Ташкент» on its own. A district of the city or of the region, named
    // anywhere in the same text, has already answered the question — Chilonzor
    // is the city whatever the word «туман» next to it suggests. Otherwise the
    // words around it decide, and when nothing decides, the city is the
    // likelier of the two: it is where most of the registry's work is.
    for (var b = 0; b < bare.length && !tashDistrict; b++) {
      var at = bare[b], word = toks[at], prev = toks[at - 1] || '', next = toks[at + 1] || '';
      // «Янги Тошкент» is the new city going up on the edge of the capital, and
      // the registry cannot make its own mind up about it: 28 applications file
      // it as the city and 27 as the region. Nothing in the text can settle
      // that, so it is deliberately left unsettled — «shahri» after it means
      // nothing here.
      if (prev === 'YANGI' || prev === 'NOVIY' || prev === 'NOVOGO') {
        bump('toshkent_sh', 1.1 * weight, 'YANGI ' + word);
        bump('toshkent_vil', 1 * weight, 'YANGI ' + word);
        continue;
      }
      var cityHere = CITY_MARK.test(next) || prev === 'G' || prev === 'GOR' || prev === 'GOROD';
      var areaHere = AREA_MARK.test(next) || (!cityHere && areaAnywhere);
      if (cityHere && !areaHere) bump('toshkent_sh', 4 * weight, word + ' ' + next);
      else if (areaHere && !cityHere) bump('toshkent_vil', 4 * weight, word + ' ' + next);
      // Neither said. In the registry a bare «Тошкент» is the city 23 times and
      // the region 25 — a coin toss — and «Янги Тошкент» splits 28 to 27. So
      // this must not come out looking certain: both are scored almost alike,
      // which leaves the confidence around a half and makes the screen offer
      // the other one as well.
      else { bump('toshkent_sh', 1.2 * weight, word); bump('toshkent_vil', 1 * weight, word); }
    }
    order.__n = seq;

    function bump(region, by, why) {
      score[region] = (score[region] || 0) + by;
      if (evidence[region] === undefined) { evidence[region] = why; order[region] = seq++; }
    }
  }

  /**
   * Which region an application is about, with how sure it is.
   * Returns { region, score, confidence, second, evidence } — region '' when
   * the text names no place at all.
   */
  function pick(score, evidence, order) {
    var best = '', bestN = 0, second = '', secondN = 0, total = 0, r;
    for (r in score) {
      if (r === '__n') continue;
      total += score[r];
      // A tie goes to the place named first: a road from Yangiyer to Paxtakor
      // is Yangiyer's project, and the title says so by starting with it.
      var wins = score[r] > bestN || (score[r] === bestN && best && order[r] < order[best]);
      if (wins) { second = best; secondN = bestN; best = r; bestN = score[r]; }
      else if (score[r] > secondN) { second = r; secondN = score[r]; }
    }
    if (!best) return null;
    return {
      region: best,
      score: bestN,
      confidence: Math.round((bestN / total) * 100) / 100,
      second: secondN ? second : '',
      evidence: evidence[best] || ''
    };
  }

  function regionOf(app) {
    // The place column names the region outright. It is filled in on one row
    // in twenty, and when it is, nothing in the title may overrule it — a road
    // called «Тошкент-Самарқанд» is not a Samarkand project just because
    // Samarkand is in its name.
    var ps = {}, pe = {}, po = {};
    scanInto(ps, pe, po, app.place || '', 3);
    var stated = pick(ps, pe, po);
    if (stated && !stated.second) { stated.confidence = 1; return stated; }

    var score = {}, evidence = {}, order = {};
    scanInto(score, evidence, order, app.place || '', 3);
    scanInto(score, evidence, order, app.project_title || '', 2);
    scanInto(score, evidence, order, app.org_name || '', 1);
    return pick(score, evidence, order) ||
      { region: '', score: 0, confidence: 0, second: '', evidence: '' };
  }

  /** The region key alone — what the screens have always asked for. */
  S.suggestRegion = function (app) { return regionOf(app).region; };
  S.regionOf = regionOf;
  S.REGION_NAMES = NAME;
  S.REGION_PLACES = PLACE;
})(S);
