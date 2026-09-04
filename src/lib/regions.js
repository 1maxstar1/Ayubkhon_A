/*
 * Regions (viloyatlar) a workspace can belong to, their labels, and the text
 * clues that suggest one from an application's registry fields. Shared by the
 * app and the admin page.
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

  // Words that pin a text to a region: RU, UZ Latin and UZ Cyrillic spellings,
  // plus the big cities. Order matters — Tashkent city before Tashkent region.
  var CLUES = [
    ['toshkent_sh', /г\.?\s*ташкент|город ташкент|toshkent sh|тошкент ш|toshkent shahri|тошкент шаҳри/i],
    ['toshkent_vil', /ташкентск|toshkent vil|тошкент вил|toshkent tuman|тошкент тумани/i],
    ['andijon', /андижан|andijon|андижон|asaka|асака|xonobod|хонобод/i],
    ['buxoro', /бухар|buxoro|бухоро|kogon|когон|g'ijduvon|гиждуван/i],
    ['fargona', /ферган|farg.?ona|фарғона|marg.?ilon|маргилан|марғилон|qo.?qon|коканд|қўқон|rishton|риштан|quva\b|кува/i],
    ['jizzax', /джизак|jizzax|жиззах|zomin|заамин|gallaorol|галляарал/i],
    ['xorazm', /хорезм|xorazm|хоразм|urganch|ургенч|урганч|xiva|хива/i],
    ['namangan', /наманган|namangan|наманган|chust|чуст|pop\b|поп\b/i],
    ['navoiy', /навои|navoiy|навоий|zarafshon|зарафшан/i],
    ['qashqadaryo', /кашкадар|qashqadaryo|қашқадарё|qarshi|карши|қарши|shahrisabz|шахрисабз|koson|косон/i],
    ['samarqand', /самарканд|samarqand|самарқанд|kattaqo.?rg|каттакурган|urgut|ургут/i],
    ['sirdaryo', /сырдар|sirdaryo|сирдарё|guliston|гулистан|yangiyer|янгиер/i],
    ['surxondaryo', /сурхандар|surxondaryo|сурхондарё|termiz|термез|denov|денау/i],
    ['qoraqalpogiston', /каракалпак|qoraqalpog|қорақалпоғ|nukus|нукус|нукус/i],
    ['respublika', /общереспубликанск|umumrespublika|республиканск/i]
  ];
  S.suggestRegion = function (app) {
    var texts = [app.place || '', app.project_title || '', app.org_name || ''];
    for (var t = 0; t < texts.length; t++) {
      if (!texts[t]) continue;
      for (var i = 0; i < CLUES.length; i++) if (CLUES[i][1].test(texts[t])) return CLUES[i][0];
    }
    return '';
  };
})(S);
