/*
 * Which band of the estimate a resource belongs to, read from its own name.
 *
 * A smeta is written in bands — ЗАТРАТЫ ТРУДА, СТРОИТЕЛЬНЫЕ МАШИНЫ И
 * МЕХАНИЗМЫ, СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ, ОБОРУДОВАНИЕ — and the
 * parser takes each row's section from the band it sits under. That works
 * until a sheet has no bands, or a row sits under the wrong one, and then
 * nothing notices. Reading the name gives a second, independent opinion:
 * «БУЛЬДОЗЕРЫ … 96 КВТ» is a machine wherever it was typed.
 *
 * Two kinds of evidence, in this order of force:
 *
 *   the unit    Машино-час is a machine and человеко-час is labour, near
 *               enough always. Nothing else in the estimate is priced by
 *               either, so the unit alone settles those two bands.
 *   the words   Stems, matched against the name after it has been
 *               transliterated into one alphabet (S.tokens), so a name typed
 *               in Latin, in Cyrillic or in both is read the same way. Stems
 *               are prefixes: EKSKAVATOR covers ЭКСКАВАТОР, ЭКСКАВАТОРЫ,
 *               EKSKAVATORLAR.
 *
 * The answer always comes with a confidence, and «unknown» is a real answer.
 * Nothing here rewrites what the workbook says — it only lets the program say
 * that a row looks out of place.
 */
(function (S) {
  'use strict';

  /*
   * Units that settle the matter by themselves, and settle it outright: an
   * estimate hires a machine by the machine-hour and a worker by the man-hour,
   * and nothing else in the book is priced in either. Keys are matchUnitKey
   * form.
   *
   * They used to be worth six points and could be outvoted by the name. That
   * is how «МАШИНЫ ДЛЯ ОЧИСТКИ И ГРУНТОВКИ ТРУБ ДИАМЕТРОМ 600-800ММ», priced
   * in МАШ-Ч, came out a material: ГРУНТОВКА is a primer sold by the kilogram
   * and the word appears twice over in that name. Measured on the labelled
   * corpus, deciding by the unit is right 402 times out of 402 for МАШ-Ч and
   * 5 of 5 for ЧЕЛ-Ч, and it removes the last mislabelled rows of both
   * workbooks: held out, 824 right and 1 wrong became 825 and 0.
   */
  var BY_UNIT = {
    CHELCH: 'labor',        // чел.-ч, ЧЕЛ-Ч, киши-соат
    CHASCH: 'labor',
    MASHCH: 'machines',     // маш.-ч, МАШ-Ч
    MASHINOCH: 'machines'
  };

  /* Units that lean, without deciding: no machine is sold by the cubic metre. */
  var UNIT_LEAN = {
    M3: 'materials', M2: 'materials', KG: 'materials', T: 'materials',
    M: 'materials', L: 'materials', TN: 'materials'
  };

  /*
   * The words themselves. Weight 3 names the thing outright («ЭКСКАВАТОР»),
   * 2 is strong but shared with a neighbour, 1 is a nudge. Every stem is a
   * prefix of a transliterated token; the comment gives the Russian it stands
   * for, because that is how it will be read on the sheet.
   */
  var LEX = {
    labor: [
      ['ZATRATITRUDA', 3], ['TRUDOZATRAT', 3],           // затраты труда, трудозатраты
      ['RABOCHIXSTROITEL', 3],                            // рабочих-строителей
      ['MEHNAT', 3], ['ISHCHI', 2],                       // uz: mehnat, ishchilar
      ['SREDNIYRAZRYAD', 2]                               // средний разряд работ
    ],
    machines: [
      ['EKSKAVATOR', 3], ['BULDOZER', 3], ['AVTOGREYDER', 3], ['GREYDER', 3],
      ['AVTOGUDRONATOR', 3], ['AVTOPOGRUZCHIK', 3], ['POGRUZCHIK', 3],
      ['SAMOSVAL', 3], ['AVTOMOBIL', 2], ['TRAKTOR', 3], ['TRUBOUKLADCHIK', 3],
      ['KATOK', 3], ['KATKI', 3], ['KRAN', 3], ['AVTOKRAN', 3],
      ['KOMPRESSOR', 3], ['VIBRATOR', 3], ['LEBEDK', 3], ['DOMKRAT', 3],
      ['BETONOMESHALK', 3], ['BETONOUKLADCHIK', 3], ['ASFALTOUKLADCHIK', 3],
      ['ASFALTOBETONOUKLADCHIK', 3], ['PEREDVIZHN', 2], ['SAMOXODN', 3],
      ['PRITSEPN', 2], ['GUSENICHN', 3], ['PNEVMOKOLESN', 3],
      ['AGREGAT', 2], ['STANOK', 2], ['STANKI', 2],
      ['MASHIN', 2], ['MEXANIZM', 2], ['AVTOVISHK', 3], ['GIDROMOLOT', 3],
      ['PERFORATOR', 2], ['TRAMBOVK', 2], ['DREL', 2], ['SVAROCHN', 2],
      ['SVERLIL', 2], ['SHLIFOVAL', 2], ['GRUZOPODEMNOST', 2],
      ['BUROV', 2], ['BURENI', 2], ['SMESITEL', 1],
      // makes and models: a proper noun in an estimate is a machine
      ['KOMATSU', 3], ['BOMAG', 3], ['DYNAPAC', 3], ['HAMM', 3], ['VOLVO', 3],
      ['HITACHI', 3], ['LIEBHER', 3], ['ATLAS', 2], ['CATERPILLAR', 3], ['SHANTUI', 3]
    ],
    materials: [
      ['STAL', 3], ['STALN', 3], ['ARMATUR', 3], ['ARMATURN', 3],
      ['TRUB', 3], ['BETON', 3], ['RASTVOR', 3], ['TSEMENT', 3], ['SEMENT', 3],
      ['SHEBEN', 3], ['PESOK', 3], ['GRUNT', 3], ['GRAVI', 3], ['SHGPS', 3],
      ['KIRPICH', 3], ['BRUSCHATK', 3], ['PLITK', 2], ['BORDYUR', 3],
      ['KABEL', 3], ['PROVOD', 2], ['PROVOLOK', 3], ['ELEKTROD', 3],
      ['BOLT', 3], ['GAYK', 3], ['SHAYB', 3], ['GVOZD', 3], ['ANKER', 2],
      ['DOSK', 3], ['BRUS', 3], ['PILOMATERIAL', 3], ['FANER', 3],
      ['POLIETILEN', 3], ['PLASTMASS', 3], ['REZINOV', 3], ['BITUM', 3],
      ['MASTIK', 3], ['KRASK', 3], ['EMAL', 2], ['GRUNTOVK', 2],
      ['RASTVORITEL', 3], ['LENT', 2], ['SETK', 2], ['UGOLOK', 3],
      ['SHVELLER', 3], ['LIST', 2], ['MUFT', 2], ['TROYNIK', 2],
      ['UGOLNIK', 2], ['ZAGLUSHK', 2], ['FLANETS', 2], ['SEDLO', 2],
      ['SMES', 2], ['ASFALTOBETON', 3],
      // fuel is bought by the tonne, however much it says "automobile" on it
      ['BENZIN', 3], ['DIZEL', 3], ['SOLYARK', 3], ['KEROSIN', 3], ['MAZUT', 3], ['MASLO', 2],
      // fittings that carry a machine's name: a ball valve is not a crane
      ['KRANSHAROV', 4], ['KRANSHAR', 4], ['SHAROV', 4], ['KOVER', 3],
      ['ZADVIZHK', 3], ['VENTIL', 2], ['XOMUT', 3],
      ['TROS', 3], ['KANAT', 3], ['SKOB', 2], ['DYUBEL', 3], ['SAMOREZ', 3],
      ['STOYK', 2], ['OPOR', 2], ['KRONSHTEYN', 2], ['TKAN', 3], ['MESHOK', 2],
      ['SHLIFKRUG', 3], ['KRUGOTREZ', 3], ['SHLANG', 3], ['RUKAV', 2],
      // planting stock: a landscaping estimate buys trees by the piece
      ['SAZHENETS', 3], ['DEREVO', 2], ['KUST', 2], ['GAZON', 3], ['SEMEN', 2],
      ['KASHTAN', 3], ['LIPA', 3], ['DUB', 3], ['KLYON', 3], ['SIREN', 3],
      ['CHINOR', 3], ['TERAK', 3], ['TUY', 3], ['ELKA', 3], ['SOSN', 3],
      ['BERESKLET', 3], ['SHAMSHOD', 3], ['ROZ', 2], ['TYULPAN', 3],
      ['KOMOM', 2], ['KLASSA', 1], ['DIAM', 1], ['TOLSH', 1],
      ['SECH', 1], ['RAZMEROM', 1], ['DLINOY', 1], ['SHIRINOY', 1]
    ],
    equipment: [
      ['DOROZHNIYZNAK', 3], ['ZNAK', 2],                  // дорожный знак
      ['SVETOFOR', 3], ['SVETILNIK', 3], ['PROZHEKTOR', 3],
      ['SCHETCHIK', 3], ['TRANSFORMATOR', 3], ['SHKAF', 3], ['SHITOK', 3],
      ['YASHIK', 2], ['VIKLYUCHATEL', 3], ['RAZEDINITEL', 3],
      ['PREDOXRANITEL', 2], ['KONTAKTOR', 3], ['RELE', 2],
      ['URN', 2], ['SKAMEYK', 2], ['NASOS', 2], ['VENTILYATOR', 2],
      ['KOTEL', 2], ['LIFT', 2], ['KAMER', 1], ['USKUNA', 2], ['JIHOZ', 2]
    ]
  };

  var CLASSES = ['labor', 'machines', 'materials', 'equipment'];

  /* Stems bucketed by their first three characters, so a name is read in one
     pass over its own tokens instead of over the whole lexicon. */
  var INDEX = null;
  function index() {
    if (INDEX) return INDEX;
    INDEX = {};
    for (var c = 0; c < CLASSES.length; c++) {
      var cls = CLASSES[c], list = LEX[cls];
      for (var i = 0; i < list.length; i++) {
        var head = list[i][0].slice(0, 3);
        (INDEX[head] = INDEX[head] || []).push([list[i][0], list[i][1], cls]);
      }
    }
    return INDEX;
  }

  /**
   * What section a resource looks like it belongs to.
   *
   * Returns { section, confidence, evidence } — section '' when nothing in the
   * name or the unit says anything, confidence 0..1 as the winner's share of
   * all the evidence found, evidence the stems and units that decided it.
   */
  function classify(name, unit) {
    var score = { labor: 0, machines: 0, materials: 0, equipment: 0 };
    var evidence = [];

    var uk = S.matchUnitKey(unit || '');
    if (uk && BY_UNIT[uk]) {
      return { section: BY_UNIT[uk], confidence: 1, evidence: [uk] };
    } else if (uk && UNIT_LEAN[uk]) {
      score[UNIT_LEAN[uk]] += 1;
      evidence.push(uk);
    }

    var idx = index();
    var toks = S.tokens(name);
    // A two-word signal is read as one token too: «ЗАТРАТЫ ТРУДА» is not
    // «ЗАТРАТЫ» plus «ТРУДА», and a road sign is not any old sign.
    var joined = toks.join('');
    var seen = {};
    for (var t = 0; t < toks.length; t++) {
      var tok = toks[t];
      var bucket = idx[tok.slice(0, 3)];
      if (bucket) hit(bucket, tok);
    }
    var jb = idx[joined.slice(0, 3)];
    if (jb) hit(jb, joined);

    function hit(bucket, text) {
      for (var i = 0; i < bucket.length; i++) {
        var stem = bucket[i][0];
        if (text.indexOf(stem) !== 0) continue;
        if (seen[stem]) continue;
        seen[stem] = 1;
        score[bucket[i][2]] += bucket[i][1];
        evidence.push(stem);
      }
    }

    var best = '', bestN = 0, total = 0;
    for (var c = 0; c < CLASSES.length; c++) {
      var v = score[CLASSES[c]];
      total += v;
      if (v > bestN) { bestN = v; best = CLASSES[c]; }
    }
    if (!bestN) return { section: '', confidence: 0, evidence: [] };
    return {
      section: best,
      confidence: Math.round((bestN / total) * 100) / 100,
      evidence: evidence
    };
  }

  /**
   * Equipment and materials are one band for the purpose of an accusation.
   * The workbooks themselves do not agree where the line runs — a street lamp
   * is «оборудование» in one and «материалы» in the next — so a program has no
   * business calling either of them wrong.
   */
  function band(section) { return section === 'equipment' ? 'materials' : section; }

  /**
   * Rows whose declared band disagrees with what their name says, worst first.
   * `resources` are the assembled records ({name, unit, section}); only a
   * confident disagreement is reported, because the workbook is usually right.
   *
   * On the three real workbooks this is right 99% of the time it speaks, and
   * says nothing about one row in ten.
   */
  function disagreements(resources, min) {
    var floor = min === undefined ? 0.75 : min;
    var out = [];
    for (var i = 0; i < resources.length; i++) {
      var r = resources[i];
      if (!r.section || r.section === 'other') continue;
      var g = classify(r.name, r.unit);
      if (!g.section || band(g.section) === band(r.section)) continue;
      if (g.confidence < floor) continue;
      out.push({ resource: r, declared: r.section, guessed: g.section, confidence: g.confidence, evidence: g.evidence });
    }
    out.sort(function (a, b) { return b.confidence - a.confidence; });
    return out;
  }

  S.sections = {
    classify: classify,
    disagreements: disagreements,
    band: band,
    CLASSES: CLASSES,
    LEX: LEX
  };
})(S);
