/*
 * Working out which region an application is about.
 *
 * The registry leaves the «place» column empty on 27 090 of its 28 337 rows,
 * so the region has to be read out of the project title — written in Russian,
 * Uzbek Cyrillic and Uzbek Latin, with typographic apostrophes and Russian
 * adjectival endings. This is what the expert is offered when a workspace is
 * opened; they can always overrule it.
 *
 * The honest benchmark is test/fixtures/application-regions.json: the 1247
 * real applications that DID state their region in the place column, with that
 * column removed. The classifier only ever sees the title and the client's
 * name, and has to arrive at the answer the registry itself recorded.
 *
 *   node test/regions.cjs
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.dirname(__dirname);
const ctx = { console };
vm.createContext(ctx);
for (const f of ['src/lib/normalize.js', 'src/lib/match.js', 'src/lib/regions.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const S = ctx.S;

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const guess = (title, org) => S.regionOf({ project_title: title, org_name: org || '' });
const is = (want, title, org) => {
  const g = guess(title, org);
  check(g.region === want, `${want.padEnd(16)} ${title.slice(0, 56)}` +
    (g.region === want ? '' : `  (got ${g.region || 'nothing'})`));
};

/* ----------------------------------------- the same name written six ways */
console.log('-- one region, every spelling --');
is('jizzax', 'Жиззах вилояти 85689 ХК');                       // Uzbek Cyrillic
is('jizzax', 'Джизакская область, ремонт школы');              // Russian
is('jizzax', 'Jizzax viloyati maktabni qurish');               // Uzbek Latin
is('fargona', 'Ферганская область, дорога');
is('fargona', "Farg'ona viloyati yo'l qurish");
is('fargona', 'Фарғона вилояти йўл қуриш');
is('surxondaryo', 'Служба единого заказчика Сурхандаринского областного хокимията');
is('surxondaryo', 'Surxandarinskogo oblastnogo xokimiyata binosi');
is('xorazm', 'Хорезмская область, Ургенч');
is('qoraqalpogiston', 'Қорақалпоғистон Республикаси, Нукус');
is('qoraqalpogiston', 'Реконструкция здания в Республике Каракалпакстан');

console.log('-- the apostrophe is a letter, not a break --');
is('jizzax', '“G‘allaorol MGQB “DBST” magistral gaz quvurini 374 km');
is('jizzax', "G'allaorol tumani suv ta'minoti");
is('samarqand', 'Kattaqoʻrgʻon tumani maktab');

console.log('-- a district names its region --');
is('surxondaryo', 'Термиз туманлараро иқтисодий ва маъмурий судларига янги бино қуриш');
is('namangan', 'Косонсой тумани "Бўстон" МФЙдаги 40-сон мактабни реконструкция қилиш');
is('navoiy', 'Xatirchi tumani Koʻksaroy massivi hududida');
is('toshkent_vil', 'Бўстонлиқ тумани "Қайнарсой қароргоҳи" ДМ');
is('qashqadaryo', 'Строительство устьевой компрессорной станции на месторождении Мубарек');

console.log('-- КОСОНСОЙ is Namangan, not the КОСОН of Qashqadaryo --');
is('qashqadaryo', 'Косон тумани маркази');
is('namangan', 'Косонсой тумани маркази');

console.log('-- a place is not a person, and not a street --');
is('toshkent_sh', "Toshkent shahri, Shayxontohur tumani Navoiy ko‘chasi 69-uyda joylashgan bino");
is('surxondaryo', '“Surxondaryo viloyati Denov tuman “Zarafshon” MFY “Zarafshon” ko‘chasi');
is('toshkent_sh', 'Тошкент шаҳар Чилонзор тумани Хоразмий кўчаси иссиқлик қувури');

console.log('-- Tashkent: the city and the region share a name --');
is('toshkent_sh', 'Реконструкция детской школы в Шайхонтохурском районе г.Ташкент');
is('toshkent_sh', 'Тошкент шаҳри Мирзо Улуғбек тумани мактаб');
is('toshkent_vil', 'Тошкент вилояти Зангиота тумани сув таъминоти');
is('toshkent_vil', 'Ангрен шаҳрида янги подстанция қуриш');
const bare = guess('Тошкент автомобиль йўлининг 27-32 км қисмини реконструкция қилиш');
check(bare.confidence < 0.6 && bare.second,
  `a bare «Тошкент» is not answered with confidence (${bare.confidence}, also offers ${bare.second})`);
// The registry files «Янги Тошкент» as the city 28 times and as the region 27,
// so the program must not pretend to know which.
const yangi = guess('«Yangi Toshkent shahrining birinchi bosqich hududida maktab qurish');
check(yangi.confidence < 0.6 && yangi.second,
  `«Янги Тошкент» is left unsettled (${yangi.confidence}, also offers ${yangi.second})`);
check(guess('Тошкент шаҳри Чилонзор тумани мактаб').region === 'toshkent_sh',
  'but «туман» alone never means the region — the city has twelve of its own');

console.log('-- the Russian inflections say which Tashkent outright --');
is('toshkent_vil', 'Ремонт школы в Ташкентской области');
is('toshkent_vil', 'Строительство в Ташкентском районе');
is('toshkent_sh', 'Реконструкция здания в Ташкенте');
is('toshkent_sh', 'Строительство нового здания города Ташкента');
is('respublika', 'Посольство Узбекистана в Москве');

console.log('-- names left unclaimed on purpose --');
// Measured over the whole registry: «Улугбек» is a person 92 times outside
// Tashkent, «Олмазор» a mahalla in eleven regions, «Учтепа» a road node in
// Jizzax and a mahalla in Yakkabog', «Беруний» a scientist, «Зарафшон» a river
// and a neighbourhood everywhere along it. A name that misleads more often
// than it helps is worse than no name.
for (const [q, why] of [
  ['Улуғбек номидаги мактаб', 'Ulugʻbek is a person'],
  ['Олмазор МФЙ сув таъминоти', 'Olmazor is a mahalla in eleven regions'],
  ['Учтепа тумани мактаби', 'Uchtepa is claimed by nobody'],
  ['Beruniy tumani suv taʼminoti', 'Beruniy is a scientist'],
  ['«Зарафшон» МФЙ кўчаси', 'Zarafshon is a river']
]) check(guess(q).region === '', `${why}: «${q.slice(0, 34)}» is left unanswered`);

console.log('-- and when nothing is named --');
check(guess('Капитальный ремонт административного здания банка').region === '',
  'a title with no place in it gets no guess');
check(guess('').region === '', 'an empty title too');

/* ------------------------------------------------- the 1247 labelled rows */
console.log('-- every application that stated its own region --');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/application-regions.json'), 'utf8'));
check(rows.length > 1000, `benchmark loaded: ${rows.length} applications`);

let right = 0, wrong = 0, quiet = 0, rightSure = 0, wrongSure = 0;
const missed = {};
for (const r of rows) {
  const g = guess(r.t, r.o);
  if (!g.region) { quiet++; continue; }
  if (g.region === r.r) { right++; if (g.confidence >= 0.6) rightSure++; }
  else {
    wrong++;
    if (g.confidence >= 0.6) wrongSure++;
    const k = r.r + ' -> ' + g.region;
    missed[k] = (missed[k] || 0) + 1;
  }
}
console.log(`   right ${right}, wrong ${wrong}, no answer ${quiet}` +
  ` — ${(right / (right + wrong) * 100).toFixed(1)}% of its answers, ${(right / rows.length * 100).toFixed(1)}% of all rows`);
console.log(`   when it is confident: ${(rightSure / (rightSure + wrongSure) * 100).toFixed(1)}% right on ${rightSure + wrongSure} rows`);
console.log('   ' + Object.entries(missed).sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([k, v]) => k + ' ×' + v).join(', '));

check(right / (right + wrong) >= 0.90, 'at least 90% of the answers it gives are the registry\'s own');
check(rightSure / (rightSure + wrongSure) >= 0.96, 'and at least 96% of the confident ones');
check(right / rows.length >= 0.77, 'it answers, correctly, at least 77% of all the rows');

// The two Tashkents are the only pair it is allowed to be unsure about, and
// they are where the registry contradicts itself: «Янги Тошкент» is filed as
// the city 28 times and as the region 27.
const tashkentMix = (missed['toshkent_vil -> toshkent_sh'] || 0) + (missed['toshkent_sh -> toshkent_vil'] || 0);
check(wrong - tashkentMix <= 50,
  `outside the two Tashkents only ${wrong - tashkentMix} mistakes in ${rows.length} rows`);
for (const [k, v] of Object.entries(missed)) {
  if (k.indexOf('toshkent') >= 0) continue;
  check(v <= 6, `no single confusion is systematic: ${k} ×${v}`);
}

console.log('-- the place column, when it is filled in, is the answer --');
check(S.regionOf({ place: 'Ташкентская область', project_title: '"Тошкент-Самарқанд" пуллик автомобиль йўлини қуриш' }).region === 'toshkent_vil',
  'a road named after two regions does not overrule the stated one');
check(S.regionOf({ place: 'Общереспубликанский', project_title: '"Тошкент-Самарқанд" пуллик автомобиль йўли' }).region === 'respublika',
  'nor does it overrule «Общереспубликанский»');
check(S.regionOf({ place: 'город Ташкент', project_title: 'Самарканд ва Бухоро' }).confidence === 1,
  'and a stated region is answered with full confidence');

console.log('-- it still answers the question the screens ask --');
check(typeof S.suggestRegion === 'function' &&
      S.suggestRegion({ project_title: 'Наманган вилояти' }) === 'namangan',
  'S.suggestRegion returns the key on its own');

console.log(fail ? `FAILED (${fail})` : 'regions OK');
process.exit(fail ? 1 : 0);
